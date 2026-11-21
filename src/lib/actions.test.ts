import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueOutgoing } from "./audit";
import { openDb, type Db } from "./db";

let db: Db;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  getDb: () => db,
}));

import { decideOutgoingAction } from "./actions";
import { DEFAULT_DEMO_USER } from "./session";

beforeEach(() => {
  db = openDb(":memory:");
});

describe("actions take the author from the session, not the form", () => {
  it("ignores a 'person' sent in the form and records the session user", async () => {
    const { id } = queueOutgoing(db, {
      kind: "supplier_request",
      template: "t",
      recipient: "a@example.com",
      subject: "s",
      body: "b",
    });
    const form = new FormData();
    form.set("id", String(id));
    form.set("decision", "approved");
    form.set("person", "Mallory");
    const r = await decideOutgoingAction(null, form);
    expect(r.ok).toBe(true);
    const row = db.prepare("SELECT approved_by FROM outbox WHERE id = ?").get(id) as {
      approved_by: string;
    };
    expect(row.approved_by).toBe(DEFAULT_DEMO_USER);
    const log = db
      .prepare("SELECT actor FROM audit_log WHERE step = 'outgoing_approved'")
      .get() as { actor: string };
    expect(log.actor).toBe(DEFAULT_DEMO_USER);
    expect(JSON.stringify(db.prepare("SELECT * FROM audit_log").all())).not.toContain("Mallory");
  });

  it("works without any person in the form", async () => {
    const { id } = queueOutgoing(db, {
      kind: "supplier_request",
      template: "t",
      recipient: "a@example.com",
      subject: "s",
      body: "b",
    });
    const form = new FormData();
    form.set("id", String(id));
    form.set("decision", "rejected");
    expect((await decideOutgoingAction(null, form)).ok).toBe(true);
  });
});
