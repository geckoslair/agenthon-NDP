import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { validateInvoice } from "../rules";
import type { ExtractedInvoice } from "../types";
import { completeUnreadableFields, MANUAL_FIELDS, runMonth, unreadableFields } from "./index";
import { eml, fakeFetch, invoice, makeMonth, MONTH } from "./__fixtures__/make-month";

/** The fixture month plus one receipt whose given fields could not be read. */
async function setup(missing: Partial<Record<keyof ExtractedInvoice, null>>) {
  const fx = makeMonth();
  const truth = invoice({
    supplierName: "Vatco GmbH",
    supplierCountry: "DE",
    invoiceNumber: "R-1",
    totalAmount: 12,
    ...missing,
  });
  fs.writeFileSync(path.join(fx.monthDir, "truth", "vatco-R1.json"), JSON.stringify(truth));
  fs.writeFileSync(
    path.join(fx.monthDir, "inbox", "99.eml"),
    eml("vatco-R1.pdf", "m99@test.example"),
  );
  const db = openDb(":memory:");
  await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: ["email", "billing_api"],
    fetchImpl: fakeFetch,
  });
  const ex = db
    .prepare(
      "SELECT e.id, e.invoice_id FROM exceptions e JOIN invoices i ON i.id = e.invoice_id WHERE i.file_name = 'vatco-R1.pdf' AND e.code = 'UNREADABLE_FIELD'",
    )
    .get() as { id: number; invoice_id: number };
  return { db, exId: ex.id, invoiceId: ex.invoice_id };
}

const extracted = (db: Db, id: number) =>
  JSON.parse(
    (db.prepare("SELECT extracted FROM invoices WHERE id = ?").get(id) as { extracted: string })
      .extracted,
  ) as ExtractedInvoice;
const exStatus = (db: Db, id: number) =>
  db.prepare("SELECT status, resolved_by, resolution FROM exceptions WHERE id = ?").get(id) as {
    status: string;
    resolved_by: string | null;
    resolution: string | null;
  };
const invStatus = (db: Db, id: number) =>
  (db.prepare("SELECT status FROM invoices WHERE id = ?").get(id) as { status: string }).status;

describe("MANUAL_FIELDS", () => {
  it("matches the required fields of rules.validateInvoice", () => {
    const empty = invoice();
    for (const key of Object.keys(empty) as (keyof ExtractedInvoice)[]) {
      empty[key] = { value: null, quote: null, page: null } as never;
    }
    const fields = validateInvoice(empty, { legalName: "X", vatId: "IT1", country: "IT" }, MONTH)
      .filter((e) => e.code === "UNREADABLE_FIELD")
      .map((e) => /"(\w+)"/.exec(e.message)![1]);
    expect([...MANUAL_FIELDS].sort()).toEqual(fields.sort());
  });
});

describe("unreadableFields", () => {
  it("lists the missing required fields, and nothing for other exceptions", async () => {
    const { db, exId } = await setup({ invoiceNumber: null, currency: null });
    expect(unreadableFields(db, exId)).toEqual(["invoiceNumber", "currency"]);
    const other = db
      .prepare("SELECT id FROM exceptions WHERE code = 'FOREIGN_VAT_CHARGED'")
      .get() as { id: number };
    expect(unreadableFields(db, other.id)).toEqual([]);
    expect(unreadableFields(db, 9999)).toEqual([]);
  });
});

describe("completeUnreadableFields", () => {
  it("valid values close the exception, persist with provenance and log each field", async () => {
    const { db, exId, invoiceId } = await setup({
      invoiceNumber: null,
      totalAmount: null,
      currency: null,
    });
    const r = completeUnreadableFields(
      db,
      exId,
      { invoiceNumber: " R-1 ", totalAmount: "12,50", currency: "eur", supplierName: "ignored" },
      "Anna",
    );
    expect(r).toMatchObject({ ok: true, closed: true });
    const e = extracted(db, invoiceId);
    expect(e.invoiceNumber).toMatchObject({
      value: "R-1",
      quote: null,
      page: null,
      origin: "manual",
      correctedBy: "Anna",
    });
    expect(e.totalAmount.value).toBe(12.5);
    expect(e.currency.value).toBe("EUR");
    expect(Number.isNaN(Date.parse(e.invoiceNumber.correctedAt!))).toBe(false);
    // A value the document stated is never overwritten.
    expect(e.supplierName.value).toBe("Vatco GmbH");
    expect(e.supplierName.origin).toBeUndefined();
    expect(exStatus(db, exId)).toMatchObject({ status: "resolved", resolved_by: "Anna" });
    expect(exStatus(db, exId).resolution).toContain("invoiceNumber");
    expect(invStatus(db, invoiceId)).toBe("ok");
    const logs = db
      .prepare(
        "SELECT actor, subject, detail FROM audit_log WHERE step = 'field_corrected' ORDER BY id",
      )
      .all() as {
      actor: string;
      subject: string;
      detail: string;
    }[];
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatchObject({ actor: "Anna", subject: `invoice:${invoiceId}` });
    expect(logs[0].detail).toContain("invoiceNumber");
    expect(logs[0].detail).toContain("da vuoto a R-1");
    // The package now counts the invoice.
    const body = (
      db.prepare("SELECT body FROM outbox WHERE kind = 'package'").get() as { body: string }
    ).body;
    expect(body).toMatch(/Vatco GmbH \(1 in verifica\)/); // the other Vatco invoice still has foreign VAT
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM self_invoices WHERE invoice_id = ?").get(invoiceId),
    ).toEqual({ n: 1 });
  });

  it("invalid date, amount or currency return errors and save nothing", async () => {
    const { db, exId, invoiceId } = await setup({
      invoiceDate: null,
      totalAmount: null,
      currency: null,
    });
    const before = extracted(db, invoiceId);
    const logsBefore = (db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n;
    const r = completeUnreadableFields(
      db,
      exId,
      { invoiceDate: "2026-02-30", totalAmount: "-3", currency: "EURO" },
      "Anna",
    );
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors!).sort()).toEqual(["currency", "invoiceDate", "totalAmount"]);
    expect(r.errors!.invoiceDate).toContain("AAAA-MM-GG");
    expect(extracted(db, invoiceId)).toEqual(before);
    expect(exStatus(db, exId).status).toBe("open");
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n).toBe(
      logsBefore,
    );
    expect(
      completeUnreadableFields(
        db,
        exId,
        { invoiceDate: "9/10/2026", totalAmount: "abc", currency: "1US" },
        "Anna",
      ).ok,
    ).toBe(false);
  });

  it("a missing value keeps it open and saves nothing", async () => {
    const { db, exId, invoiceId } = await setup({ invoiceNumber: null, supplierCountry: null });
    const r = completeUnreadableFields(db, exId, { invoiceNumber: "R-1" }, "Anna");
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors!)).toEqual(["supplierCountry"]);
    expect(extracted(db, invoiceId).invoiceNumber.value).toBeNull();
    expect(exStatus(db, exId).status).toBe("open");
  });

  it("a value revealing WRONG_MONTH closes the unreadable exception but blocks the invoice", async () => {
    const { db, exId, invoiceId } = await setup({ invoiceDate: null });
    const r = completeUnreadableFields(db, exId, { invoiceDate: "2026-09-30" }, "Anna");
    expect(r).toMatchObject({ ok: true, closed: true });
    expect(exStatus(db, exId).status).toBe("resolved");
    const wrong = db
      .prepare(
        "SELECT status, evidence FROM exceptions WHERE invoice_id = ? AND code = 'WRONG_MONTH'",
      )
      .get(invoiceId) as { status: string; evidence: string };
    expect(wrong.status).toBe("open");
    expect(wrong.evidence).toBe("2026-09-30");
    expect(invStatus(db, invoiceId)).toBe("exception");
  });

  it("a number revealing a duplicate opens DUPLICATE", async () => {
    const { db, exId, invoiceId } = await setup({ invoiceNumber: null });
    // Vatco's other invoice is "77" with total 100; make this one identical.
    db.prepare(
      "UPDATE invoices SET extracted = json_set(extracted, '$.totalAmount.value', 100) WHERE id = ?",
    ).run(invoiceId);
    completeUnreadableFields(db, exId, { invoiceNumber: "77" }, "Anna");
    const dup = db
      .prepare("SELECT status FROM exceptions WHERE invoice_id = ? AND code = 'DUPLICATE'")
      .get(invoiceId);
    expect(dup).toEqual({ status: "open" });
  });

  it("refuses other exceptions, closed ones and a missing person", async () => {
    const { db, exId } = await setup({ invoiceNumber: null });
    const other = db
      .prepare("SELECT id FROM exceptions WHERE code = 'FOREIGN_VAT_CHARGED'")
      .get() as { id: number };
    expect(completeUnreadableFields(db, other.id, {}, "Anna")).toMatchObject({
      ok: false,
      closed: false,
    });
    expect(exStatus(db, other.id).status).toBe("open");
    expect(completeUnreadableFields(db, exId, { invoiceNumber: "R-1" }, " ").ok).toBe(false);
    expect(completeUnreadableFields(db, exId, { invoiceNumber: "R-1" }, "Anna").ok).toBe(true);
    expect(completeUnreadableFields(db, exId, { invoiceNumber: "R-2" }, "Anna").ok).toBe(false);
  });
});
