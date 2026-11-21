import { describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { decideOutgoing, markSent } from "../audit";
import { correctionStatus, excludeInvoice, requestCorrection, runMonth } from "./index";
import { fakeFetch, makeMonth, MONTH } from "./__fixtures__/make-month";

async function setup() {
  const db = openDb(":memory:");
  const fx = makeMonth();
  const s = await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: ["email", "billing_api"],
    fetchImpl: fakeFetch,
  });
  return { db, runId: s.runId };
}
const ex = (db: Db, code: string) =>
  db
    .prepare("SELECT id, invoice_id FROM exceptions WHERE code = ? AND status = 'open'")
    .get(code) as {
    id: number;
    invoice_id: number;
  };

describe("excludeInvoice", () => {
  it("excludes the invoice, closes every open exception on it, logs and rebuilds the package", async () => {
    const { db } = await setup();
    const vat = ex(db, "FOREIGN_VAT_CHARGED");
    // A second open exception on the same invoice.
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, code, message) SELECT run_id, id, 'WRONG_MONTH', 'x' FROM invoices WHERE id = ?",
    ).run(vat.invoice_id);
    const before = db.prepare("SELECT extracted FROM invoices WHERE id = ?").get(vat.invoice_id);
    expect(excludeInvoice(db, vat.id, "Anna")).toEqual({ ok: true });
    const inv = db
      .prepare("SELECT status, extracted FROM invoices WHERE id = ?")
      .get(vat.invoice_id) as {
      status: string;
      extracted: string;
    };
    expect(inv.status).toBe("excluded");
    expect({ extracted: inv.extracted }).toEqual(before); // date and data untouched
    const rows = db
      .prepare("SELECT status, resolved_by, resolution FROM exceptions WHERE invoice_id = ?")
      .all(vat.invoice_id);
    expect(rows).toEqual([
      { status: "resolved", resolved_by: "Anna", resolution: "Esclusa dalla chiusura" },
      { status: "resolved", resolved_by: "Anna", resolution: "Esclusa dalla chiusura" },
    ]);
    const log = db
      .prepare("SELECT actor, subject, detail FROM audit_log WHERE step = 'invoice_excluded'")
      .get() as {
      actor: string;
      subject: string;
      detail: string;
    };
    expect(log).toMatchObject({ actor: "Anna", subject: `invoice:${vat.invoice_id}` });
    expect(log.detail).toContain("FOREIGN_VAT_CHARGED");
    expect(log.detail).toContain("WRONG_MONTH");
    const body = (
      db.prepare("SELECT body FROM outbox WHERE kind = 'package'").get() as { body: string }
    ).body;
    expect(body).not.toContain("Vatco");
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE step = 'package_rebuilt'").get(),
    ).toEqual({ n: 1 });
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM self_invoices WHERE invoice_id = ?")
        .get(vat.invoice_id),
    ).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM runs").get()).toEqual({ n: 1 });
  });

  it("refuses other codes, closed exceptions and a missing person", async () => {
    const { db } = await setup();
    const dup = ex(db, "DUPLICATE");
    expect(excludeInvoice(db, dup.id, "Anna").ok).toBe(false);
    const unknown = ex(db, "SUPPLIER_FACTS_UNKNOWN");
    expect(excludeInvoice(db, unknown.id, "Anna").ok).toBe(false);
    const person = ex(db, "ADDRESSED_TO_PERSON");
    expect(excludeInvoice(db, person.id, " ").ok).toBe(false);
    expect(excludeInvoice(db, person.id, "Anna").ok).toBe(true);
    expect(excludeInvoice(db, person.id, "Anna").ok).toBe(false);
    expect(excludeInvoice(db, 9999, "Anna").ok).toBe(false);
  });
});

describe("requestCorrection and correctionStatus", () => {
  it("queues one templated request, dedupes, and keeps the exception open after approval and send", async () => {
    const { db } = await setup();
    const vat = ex(db, "FOREIGN_VAT_CHARGED");
    expect(correctionStatus(db, vat.id)).toEqual({ state: "none" });
    const first = requestCorrection(db, vat.id, "Anna");
    expect(first.ok).toBe(true);
    const mail = db
      .prepare("SELECT kind, template, status, body FROM outbox WHERE id = ?")
      .get(first.outboxId) as {
      kind: string;
      template: string;
      status: string;
      body: string;
    };
    expect(mail).toMatchObject({
      kind: "supplier_request",
      template: "ask_correction",
      status: "pending",
    });
    expect(mail.body).toContain("77");
    expect(mail.body).toContain("senza IVA");
    expect(correctionStatus(db, vat.id).state).toBe("awaiting_approval");
    const again = requestCorrection(db, vat.id, "Anna");
    expect(again).toEqual({ ok: true, outboxId: first.outboxId, alreadyRequested: true });
    expect(db.prepare("SELECT COUNT(*) AS n FROM corrections").get()).toEqual({ n: 1 });

    decideOutgoing(db, first.outboxId!, "approved", "Anna");
    expect(correctionStatus(db, vat.id).state).toBe("approved");
    markSent(db, first.outboxId!);
    expect(correctionStatus(db, vat.id).state).toBe("sent");
    expect(requestCorrection(db, vat.id, "Anna").alreadyRequested).toBe(true);
    const state = db
      .prepare(
        "SELECT e.status, i.status AS inv FROM exceptions e JOIN invoices i ON i.id = e.invoice_id WHERE e.id = ?",
      )
      .get(vat.id);
    expect(state).toEqual({ status: "open", inv: "exception" });
    expect(
      db.prepare("SELECT actor FROM audit_log WHERE step = 'correction_requested'").get(),
    ).toEqual({ actor: "Anna" });
  });

  it("allows a new request after a rejected one, and refuses other codes", async () => {
    const { db } = await setup();
    const person = ex(db, "ADDRESSED_TO_PERSON");
    const first = requestCorrection(db, person.id, "Anna");
    decideOutgoing(db, first.outboxId!, "rejected", "Anna");
    expect(correctionStatus(db, person.id).state).toBe("rejected");
    const second = requestCorrection(db, person.id, "Anna");
    expect(second.alreadyRequested).toBeUndefined();
    expect(second.outboxId).not.toBe(first.outboxId);
    expect(requestCorrection(db, ex(db, "DUPLICATE").id, "Anna").ok).toBe(false);
    expect(requestCorrection(db, person.id, "").ok).toBe(false);
  });
});
