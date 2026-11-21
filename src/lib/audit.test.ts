import { beforeEach, describe, expect, it } from "vitest";
import { decideOutgoing, logStep, markSent, queueOutgoing, setAutoSend } from "./audit";
import { openDb, type Db } from "./db";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});

const request = {
  kind: "supplier_request" as const,
  template: "ask_tax_id",
  recipient: "billing@supplier.example",
  subject: "Tax identifier",
  body: "Could you send us your tax identifier?",
};
const steps = () =>
  (db.prepare("SELECT step FROM audit_log ORDER BY id").all() as { step: string }[]).map(
    (r) => r.step,
  );

describe("outgoing email approval", () => {
  it("keeps a new email pending and refuses to send it", () => {
    const { id, status } = queueOutgoing(db, request);
    expect(status).toBe("pending");
    expect(markSent(db, id)).toBe(false);
  });

  it("sends only after a person approves, and logs who", () => {
    const { id } = queueOutgoing(db, request);
    expect(decideOutgoing(db, id, "approved", "enrico")).toBe(true);
    expect(markSent(db, id)).toBe(true);
    expect(steps()).toEqual(["outgoing_waiting_approval", "outgoing_approved", "outgoing_sent"]);
    const row = db.prepare("SELECT approved_by, approved_via FROM outbox WHERE id = ?").get(id);
    expect(row).toEqual({ approved_by: "enrico", approved_via: "person" });
  });

  it("never sends a rejected email, and cannot decide twice", () => {
    const { id } = queueOutgoing(db, request);
    expect(decideOutgoing(db, id, "rejected", "enrico")).toBe(true);
    expect(decideOutgoing(db, id, "approved", "enrico")).toBe(false);
    expect(markSent(db, id)).toBe(false);
  });

  it("auto-approves a template only after a person enabled it", () => {
    setAutoSend(db, "ask_tax_id", true, "enrico");
    const { status, id } = queueOutgoing(db, request);
    expect(status).toBe("approved");
    const row = db.prepare("SELECT approved_by, approved_via FROM outbox WHERE id = ?").get(id);
    expect(row).toEqual({ approved_by: "enrico", approved_via: "auto_policy" });
  });

  it("goes back to manual approval when auto-send is revoked", () => {
    setAutoSend(db, "ask_tax_id", true, "enrico");
    setAutoSend(db, "ask_tax_id", false, "enrico");
    expect(queueOutgoing(db, request).status).toBe("pending");
  });

  it("never auto-approves the monthly package or an email without a template", () => {
    setAutoSend(db, "ask_tax_id", true, "enrico");
    expect(queueOutgoing(db, { ...request, kind: "package" }).status).toBe("pending");
    expect(queueOutgoing(db, { ...request, template: null }).status).toBe("pending");
  });
});

describe("audit log", () => {
  it("is append-only", () => {
    logStep(db, { actor: "autopilot", step: "extract", subject: "invoice:1" });
    expect(() => db.prepare("UPDATE audit_log SET actor = 'x'").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_log").run()).toThrow(/append-only/);
  });
});
