import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { runMonth } from "../pipeline";
import { fakeFetch, makeMonth, MONTH } from "../pipeline/__fixtures__/make-month";
import {
  decideSelfInvoice,
  exportToAccounting,
  generateSelfInvoices,
  NEEDS_EUR_REASON,
  sendingDeadline,
  setEuroAmount,
  submitSelfInvoice,
  vatOf,
} from "./index";
import { escapeXml, readTag } from "./xml";
import { POST as sdiPost } from "@/app/mock/sdi/submit/route";
import { GET as accGet, POST as accPost } from "@/app/mock/accounting/entries/route";

/** Routes the simulated endpoints to the real route handlers, in process. */
const mockFetch: typeof fetch = async (input, init) => {
  const request = new Request(String(input), init);
  const p = new URL(request.url).pathname;
  if (p === "/mock/sdi/submit") return sdiPost(request);
  if (p === "/mock/accounting/entries")
    return init?.method === "POST" ? accPost(request) : accGet();
  return new Response("not found", { status: 404 });
};

async function setup() {
  const db = openDb(":memory:");
  const fx = makeMonth();
  const summary = await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: ["email", "billing_api"],
    fetchImpl: fakeFetch,
  });
  return { db, runId: summary.runId, dataDir: fx.dataDir };
}

type SI = {
  id: number;
  invoice_id: number;
  number: string;
  status: string;
  taxable_eur: number | null;
  vat_eur: number | null;
  xml_path: string | null;
  needs_input_reason: string | null;
  sdi_receipt: string | null;
  accounting_status: string;
  accounting_ref: string | null;
};
const rows = (db: Db) => db.prepare("SELECT * FROM self_invoices ORDER BY id").all() as SI[];
const row = (db: Db, id: number) =>
  db.prepare("SELECT * FROM self_invoices WHERE id = ?").get(id) as SI;
const audit = (db: Db, step: string) =>
  db.prepare("SELECT actor, subject, detail FROM audit_log WHERE step = ?").all(step) as {
    actor: string;
    subject: string;
    detail: string;
  }[];

function makeUsd(db: Db, invoiceId: number) {
  const r = db.prepare("SELECT extracted FROM invoices WHERE id = ?").get(invoiceId) as {
    extracted: string;
  };
  const e = JSON.parse(r.extracted);
  e.currency = { value: "USD", quote: "USD", page: 1 };
  db.prepare("UPDATE invoices SET extracted = ? WHERE id = ?").run(JSON.stringify(e), invoiceId);
}

describe("generateSelfInvoices", () => {
  it("drafts one self-invoice per 'ok' invoice, during the run", async () => {
    const { db } = await setup();
    const ok = db.prepare("SELECT id FROM invoices WHERE status = 'ok' ORDER BY id").all() as {
      id: number;
    }[];
    const list = rows(db);
    expect(list.map((r) => r.invoice_id)).toEqual(ok.map((o) => o.id));
    expect(list.map((r) => r.number)).toEqual([
      "AF-2026-10-001",
      "AF-2026-10-002",
      "AF-2026-10-003",
    ]);
    expect(list.every((r) => r.status === "draft")).toBe(true);
    const xml = fs.readFileSync(list[0].xml_path!, "utf8");
    expect(xml).toContain("BOZZA DIMOSTRATIVA, NON VALIDATA FISCALMENTE");
    expect(xml).toContain("aliquota ordinaria 22%: da confermare");
    expect(readTag(xml, "TipoDocumento")).toBe("TD17");
    expect(readTag(xml, "ScadenzaInvio")).toBe("2026-11-15");
    expect(readTag(xml, "ImponibileEUR")).toBe("100.00");
    expect(readTag(xml, "ImpostaEUR")).toBe("22.00");
    expect(readTag(xml, "TotaleEUR")).toBe("122.00");
  });

  it("a non-EUR invoice needs a person's EUR amount, and setEuroAmount unlocks it", async () => {
    const { db, runId } = await setup();
    const first = rows(db)[0];
    makeUsd(db, first.invoice_id);
    generateSelfInvoices(db, runId);
    expect(row(db, first.id)).toMatchObject({
      status: "needs_input",
      needs_input_reason: NEEDS_EUR_REASON,
      taxable_eur: null,
      xml_path: null,
    });
    expect(decideSelfInvoice(db, first.id, "approved", "Anna")).toBe(false);
    expect(setEuroAmount(db, first.id, -5, "Anna")).toBe(false);
    expect(setEuroAmount(db, first.id, 91.5, "Anna")).toBe(true);
    expect(row(db, first.id)).toMatchObject({ status: "draft", taxable_eur: 91.5, vat_eur: 20.13 });
    expect(readTag(fs.readFileSync(row(db, first.id).xml_path!, "utf8"), "ImponibileEUR")).toBe(
      "91.50",
    );
    expect(audit(db, "self_invoice_eur_amount")[0]).toMatchObject({
      actor: "Anna",
      subject: `self_invoice:${first.id}`,
    });
    // A second call on a draft does nothing; a regeneration keeps the amount given.
    expect(setEuroAmount(db, first.id, 10, "Anna")).toBe(false);
    generateSelfInvoices(db, runId);
    expect(row(db, first.id).taxable_eur).toBe(91.5);
  });

  it("never overwrites approved or submitted rows, and removes drafts of invoices no longer ok", async () => {
    const { db, runId } = await setup();
    const [a, b, c] = rows(db);
    decideSelfInvoice(db, a.id, "approved", "Anna");
    makeUsd(db, a.invoice_id);
    db.prepare("UPDATE invoices SET status = 'exception' WHERE id IN (?, ?)").run(
      a.invoice_id,
      b.invoice_id,
    );
    generateSelfInvoices(db, runId);
    expect(row(db, a.id)).toMatchObject({ status: "approved", taxable_eur: a.taxable_eur });
    expect(row(db, b.id)).toBeUndefined();
    expect(fs.existsSync(b.xml_path!)).toBe(false);
    expect(row(db, c.id).status).toBe("draft");
    // The invoice comes back: a new draft with a new number.
    db.prepare("UPDATE invoices SET status = 'ok' WHERE id = ?").run(b.invoice_id);
    generateSelfInvoices(db, runId);
    expect(rows(db).find((r) => r.invoice_id === b.invoice_id)?.number).toBe("AF-2026-10-004");
  });

  it("throws for an unknown run", () => {
    expect(() => generateSelfInvoices(openDb(":memory:"), 99)).toThrow();
  });
});

describe("approval, simulated SdI and accounting", () => {
  it("cannot submit before approval, nor export before submission", async () => {
    const { db, runId } = await setup();
    const a = rows(db)[0];
    expect(await submitSelfInvoice(db, a.id, mockFetch)).toMatchObject({ ok: false });
    expect(row(db, a.id).status).toBe("draft");
    expect(await exportToAccounting(db, runId, "Anna", mockFetch)).toEqual({
      ok: true,
      exported: 0,
    });
    expect(row(db, a.id).accounting_status).toBe("pending");
  });

  it("a rejected draft is never sent and cannot be approved later", async () => {
    const { db } = await setup();
    const a = rows(db)[0];
    expect(decideSelfInvoice(db, a.id, "rejected", "Anna")).toBe(true);
    expect(decideSelfInvoice(db, a.id, "approved", "Anna")).toBe(false);
    expect(await submitSelfInvoice(db, a.id, mockFetch)).toMatchObject({ ok: false });
    expect(row(db, a.id)).toMatchObject({ status: "rejected", sdi_receipt: null });
  });

  it("runs approve → submit → export, logging the person", async () => {
    const { db, runId } = await setup();
    const [a, b] = rows(db);
    expect(decideSelfInvoice(db, a.id, "approved", "Anna")).toBe(true);
    const sent = await submitSelfInvoice(db, a.id, mockFetch);
    expect(sent.ok).toBe(true);
    expect(sent.receipt).toMatch(/^SIM-/);
    expect(row(db, a.id)).toMatchObject({ status: "submitted", sdi_receipt: sent.receipt });
    expect(await submitSelfInvoice(db, a.id, mockFetch)).toMatchObject({ ok: false });

    const result = await exportToAccounting(db, runId, "Marco", mockFetch);
    expect(result).toEqual({ ok: true, exported: 1 });
    expect(row(db, a.id)).toMatchObject({ accounting_status: "exported" });
    expect(row(db, a.id).accounting_ref).toMatch(/^SIM-ACC-/);
    expect(row(db, b.id).accounting_status).toBe("pending");
    expect(await exportToAccounting(db, runId, "Marco", mockFetch)).toEqual({
      ok: true,
      exported: 0,
    });

    expect(audit(db, "self_invoice_approved")[0]).toMatchObject({
      actor: "Anna",
      subject: `self_invoice:${a.id}`,
    });
    expect(audit(db, "self_invoice_submitted")[0].subject).toBe(`self_invoice:${a.id}`);
    expect(audit(db, "self_invoice_exported")[0]).toMatchObject({
      actor: "Marco",
      subject: `self_invoice:${a.id}`,
    });
    const listed = (await (await accGet()).json()) as { batches: { ref: string }[] };
    expect(listed.batches.some((x) => x.ref === row(db, a.id).accounting_ref)).toBe(true);
  });

  it("a 422 from the simulated SdI leaves the row approved and logs the error", async () => {
    const { db } = await setup();
    const a = rows(db)[0];
    decideSelfInvoice(db, a.id, "approved", "Anna");
    const xml = fs
      .readFileSync(a.xml_path!, "utf8")
      .replace(/<IdFiscale>[^<]*<\/IdFiscale>/, "<IdFiscale></IdFiscale>");
    fs.writeFileSync(a.xml_path!, xml);
    const result = await submitSelfInvoice(db, a.id, mockFetch);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("identificativo fiscale");
    expect(row(db, a.id)).toMatchObject({ status: "approved", sdi_receipt: null });
    expect(audit(db, "self_invoice_submit_failed")[0].subject).toBe(`self_invoice:${a.id}`);
  });

  it("an unreachable endpoint is an error, not a crash", async () => {
    const { db, runId } = await setup();
    const a = rows(db)[0];
    decideSelfInvoice(db, a.id, "approved", "Anna");
    const down: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await submitSelfInvoice(db, a.id, down)).toEqual({ ok: false, error: "ECONNREFUSED" });
    await submitSelfInvoice(db, a.id, mockFetch);
    expect(await exportToAccounting(db, runId, "Anna", down)).toMatchObject({
      ok: false,
      exported: 0,
    });
    expect(row(db, a.id).accounting_status).toBe("pending");
  });

  it("requires a person", async () => {
    const { db, runId } = await setup();
    expect(() => decideSelfInvoice(db, 1, "approved", " ")).toThrow();
    expect(() => setEuroAmount(db, 1, 10, "")).toThrow();
    await expect(exportToAccounting(db, runId, "")).rejects.toThrow();
  });
});

describe("simulated SdI endpoint", () => {
  const post = (body: string) =>
    sdiPost(new Request("http://x/mock/sdi/submit", { method: "POST", body }));
  it("accepts a draft with amount and supplier id", async () => {
    const res = await post("<A><ImponibileEUR>10.00</ImponibileEUR><IdFiscale>0</IdFiscale></A>");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "accepted", simulated: true });
  });
  it("rejects with 422 when the amount or the supplier id is missing", async () => {
    const res = await post("<A><ImponibileEUR></ImponibileEUR></A>");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { outcome: string; error: string };
    expect(body.outcome).toBe("rejected");
    expect(body.error).toContain("imponibile");
    expect(body.error).toContain("identificativo fiscale");
  });
});

describe("helpers", () => {
  it("escapes XML", () => {
    expect(escapeXml(`A & B <x> "q" 'a'\u0001`)).toBe(
      "A &amp; B &lt;x&gt; &quot;q&quot; &apos;a&apos;",
    );
  });
  it("computes VAT at the assumed 22% and the deadline", () => {
    expect(vatOf(100)).toEqual({ vatEur: 22, totalEur: 122 });
    expect(vatOf(0.05)).toEqual({ vatEur: 0.01, totalEur: 0.06 });
    expect(sendingDeadline("2026-12")).toBe("2027-01-15");
  });
  it("escapes supplier names in the generated XML", async () => {
    const { db, runId } = await setup();
    const a = rows(db)[0];
    db.prepare("UPDATE suppliers SET name = 'Nimbus <Cloud> & Co' WHERE id = 'nimbus'").run();
    generateSelfInvoices(db, runId);
    const xml = fs.readFileSync(row(db, a.id).xml_path!, "utf8");
    expect(xml).toContain("Nimbus &lt;Cloud&gt; &amp; Co");
  });
});
