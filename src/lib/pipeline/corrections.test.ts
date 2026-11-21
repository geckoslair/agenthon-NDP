import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { attachCorrectedDocument, correctionStatus, requestCorrection, runMonth } from "./index";
import { fakeFetch, invoice, makeMonth, MONTH, PDF } from "./__fixtures__/make-month";

async function setup() {
  const db = openDb(":memory:");
  const fx = makeMonth();
  await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: ["email", "billing_api"],
    fetchImpl: fakeFetch,
  });
  const ex = db
    .prepare("SELECT id, invoice_id FROM exceptions WHERE code = 'FOREIGN_VAT_CHARGED'")
    .get() as {
    id: number;
    invoice_id: number;
  };
  const truthDir = path.join(fx.monthDir, "corrections", "truth");
  fs.mkdirSync(truthDir, { recursive: true });
  return { db, fx, ex, truthDir };
}
const exStatus = (db: Db, id: number) =>
  (db.prepare("SELECT status FROM exceptions WHERE id = ?").get(id) as { status: string }).status;
const vatco = (vat: number) =>
  invoice({
    supplierName: "Vatco GmbH",
    supplierCountry: "DE",
    invoiceNumber: "77-C",
    vatAmount: vat,
  });

describe("attachCorrectedDocument", () => {
  it("fails explicitly when the demo extractor cannot read the PDF, resolving nothing", async () => {
    const { db, fx, ex } = await setup();
    const before = db
      .prepare("SELECT extracted, status FROM invoices WHERE id = ?")
      .get(ex.invoice_id);
    const r = await attachCorrectedDocument(db, ex.id, "vatco-77.pdf", PDF, "Anna", {
      demoDir: fx.demoDir,
    });
    expect(r.ok).toBe(false);
    expect(r.resolved).toBe(false);
    expect(r.message).toContain("non sa leggere");
    expect(exStatus(db, ex.id)).toBe("open");
    expect(correctionStatus(db, ex.id).state).toBe("failed");
    expect(
      db.prepare("SELECT extracted, status FROM invoices WHERE id = ?").get(ex.invoice_id),
    ).toEqual(before);
  });

  it("a corrected document without VAT resolves the exception", async () => {
    const { db, fx, ex, truthDir } = await setup();
    requestCorrection(db, ex.id, "Anna");
    fs.writeFileSync(path.join(truthDir, "vatco-77-corrected.json"), JSON.stringify(vatco(0)));
    const before = db.prepare("SELECT extracted FROM invoices WHERE id = ?").get(ex.invoice_id);
    const r = await attachCorrectedDocument(db, ex.id, "vatco-77-corrected.pdf", PDF, "Anna", {
      demoDir: fx.demoDir,
    });
    expect(r).toMatchObject({ ok: true, resolved: true });
    expect(exStatus(db, ex.id)).toBe("resolved");
    expect(correctionStatus(db, ex.id).state).toBe("validated");
    expect(db.prepare("SELECT status FROM invoices WHERE id = ?").get(ex.invoice_id)).toEqual({
      status: "ok",
    });
    // The original extraction is untouched; the corrected one is kept on the correction.
    expect(db.prepare("SELECT extracted FROM invoices WHERE id = ?").get(ex.invoice_id)).toEqual(
      before,
    );
    const c = db
      .prepare("SELECT corrected_path, corrected_extracted, attached_by FROM corrections")
      .get() as {
      corrected_path: string;
      corrected_extracted: string;
      attached_by: string;
    };
    expect(fs.existsSync(c.corrected_path)).toBe(true);
    expect(c.attached_by).toBe("Anna");
    expect(JSON.parse(c.corrected_extracted).invoiceNumber.value).toBe("77-C");
    expect(db.prepare("SELECT COUNT(*) AS n FROM corrections").get()).toEqual({ n: 1 });
  });

  it("a corrected document that still has VAT keeps the exception open", async () => {
    const { db, fx, ex, truthDir } = await setup();
    fs.writeFileSync(path.join(truthDir, "vatco-77-v2.json"), JSON.stringify(vatco(19)));
    const r = await attachCorrectedDocument(db, ex.id, "vatco-77-v2.pdf", PDF, "Anna", {
      demoDir: fx.demoDir,
    });
    expect(r).toMatchObject({ ok: true, resolved: false });
    expect(exStatus(db, ex.id)).toBe("open");
    expect(correctionStatus(db, ex.id).state).toBe("failed");
    expect(db.prepare("SELECT status FROM invoices WHERE id = ?").get(ex.invoice_id)).toEqual({
      status: "exception",
    });
  });

  it("raises a new problem the corrected document reveals", async () => {
    const { db, fx, ex, truthDir } = await setup();
    const t = vatco(0);
    t.invoiceDate = { value: "2026-11-02", quote: "2 Nov 2026", page: 1 };
    fs.writeFileSync(path.join(truthDir, "vatco-77-c.json"), JSON.stringify(t));
    const r = await attachCorrectedDocument(db, ex.id, "vatco-77-c.pdf", PDF, "Anna", {
      demoDir: fx.demoDir,
    });
    expect(r.resolved).toBe(true);
    const wrong = db
      .prepare("SELECT status FROM exceptions WHERE invoice_id = ? AND code = 'WRONG_MONTH'")
      .get(ex.invoice_id);
    expect(wrong).toEqual({ status: "open" });
  });

  it("refuses other codes and non-PDF files", async () => {
    const { db, fx, ex } = await setup();
    const dup = db.prepare("SELECT id FROM exceptions WHERE code = 'DUPLICATE'").get() as {
      id: number;
    };
    expect(
      (await attachCorrectedDocument(db, dup.id, "x.pdf", PDF, "Anna", { demoDir: fx.demoDir })).ok,
    ).toBe(false);
    expect(
      (await attachCorrectedDocument(db, ex.id, "x.txt", PDF, "Anna", { demoDir: fx.demoDir })).ok,
    ).toBe(false);
  });
});
