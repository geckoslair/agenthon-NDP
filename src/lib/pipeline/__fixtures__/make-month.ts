// Builds a tiny synthetic demo month in a temp folder, for tests. All data is fictional.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtractedInvoice } from "../../types";

export const MONTH = "2026-10";
export const PDF = Buffer.from("%PDF-1.4\n% synthetic test document\n%%EOF\n");

const s = <T>(value: T | null, quote: string | null = value === null ? null : String(value)) => ({
  value,
  quote,
  page: value === null ? null : 1,
});

export function invoice(
  overrides: Partial<Record<keyof ExtractedInvoice, unknown>> = {},
): ExtractedInvoice {
  const base: ExtractedInvoice = {
    supplierName: s("Nimbus Cloud Ltd"),
    supplierCountry: s("IE", "Dublin, Ireland"),
    supplierTaxId: s("IE1234567X"),
    invoiceNumber: s("INV-1001"),
    invoiceDate: s("2026-10-03"),
    documentType: s("invoice"),
    totalAmount: s(100, "EUR 100.00"),
    vatAmount: s(0, "VAT 0.00 (reverse charge)"),
    currency: s("EUR"),
    addresseeName: s("Acme Studio SRL"),
    addresseeVatId: s("IT01234567890"),
  };
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(overrides)) out[k] = s(v as never);
  return out as unknown as ExtractedInvoice;
}

export function eml(fileName: string, messageId: string): string {
  return [
    "From: billing@nimbus.example",
    "To: invoices@acme.example",
    `Subject: Your invoice ${fileName}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Invoice attached.",
    "--b1",
    `Content-Type: application/pdf; name="${fileName}"`,
    `Content-Disposition: attachment; filename="${fileName}"`,
    "Content-Transfer-Encoding: base64",
    "",
    PDF.toString("base64"),
    "--b1--",
    "",
  ].join("\r\n");
}

export interface FixtureMonth {
  demoDir: string;
  dataDir: string;
  monthDir: string;
}

/**
 * Email: nimbus (ok), vatco (foreign VAT), person (addressed to a person), lumen-new
 * (unknown supplier, facts on its page), shadow (unknown, no page), nimbus duplicate.
 * Billing API: orbit. Registry also expects "glyph" every month (missing).
 */
export function makeMonth(): FixtureMonth {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "probata-"));
  const demoDir = path.join(root, "demo");
  const dataDir = path.join(root, "data");
  const monthDir = path.join(demoDir, MONTH);
  for (const d of ["truth", "inbox"]) fs.mkdirSync(path.join(monthDir, d), { recursive: true });
  const write = (rel: string, content: string) =>
    fs.writeFileSync(path.join(monthDir, rel), content);

  write(
    "company.json",
    JSON.stringify({ legalName: "Acme Studio SRL", vatId: "IT01234567890", country: "IT" }),
  );
  write(
    "suppliers.json",
    JSON.stringify([
      {
        id: "nimbus",
        name: "Nimbus Cloud Ltd",
        country: "IE",
        taxId: "IE1234567X",
        expectedPerMonth: 1,
        status: "approved",
      },
      {
        id: "vatco",
        name: "Vatco GmbH",
        country: "DE",
        taxId: "DE999",
        expectedPerMonth: 0,
        status: "approved",
      },
      {
        id: "person",
        name: "Persona Tools Inc",
        country: "US",
        taxId: "US-1",
        expectedPerMonth: 0,
        status: "approved",
      },
      {
        id: "orbit",
        name: "Orbit Analytics BV",
        country: "NL",
        taxId: "NL1",
        expectedPerMonth: 1,
        status: "approved",
      },
      {
        id: "glyph",
        name: "Glyph Fonts AB",
        country: "SE",
        taxId: "SE1",
        expectedPerMonth: 1,
        status: "approved",
      },
    ]),
  );
  write(
    "sources.json",
    JSON.stringify({ email: [], billing_api: { orbit: ["orbit-2026-10.pdf"] } }),
  );
  write(
    "charges.csv",
    [
      "id,date,description,amount,currency",
      "c1,2026-10-03,NIMBUS CLOUD,100,EUR",
      "c2,2026-10-10,GLYPH FONTS AB,49,EUR",
    ].join("\n"),
  );

  const truths: Record<string, ExtractedInvoice> = {
    "nimbus-INV-1001": invoice(),
    "nimbus-INV-1001-copy": invoice(),
    "vatco-77": invoice({
      supplierName: "Vatco GmbH",
      supplierCountry: "DE",
      invoiceNumber: "77",
      vatAmount: 19,
    }),
    "person-5": invoice({
      supplierName: "Persona Tools Inc",
      supplierCountry: "US",
      invoiceNumber: "5",
      addresseeName: "Mario Rossi",
      addresseeVatId: null,
    }),
    "lumen-A1": invoice({
      supplierName: "Lumen Labs Ltd",
      supplierCountry: "GB",
      supplierTaxId: "GB123",
      invoiceNumber: "A1",
    }),
    "shadow-9": invoice({
      supplierName: "Shadow Hosting LLC",
      supplierCountry: "US",
      supplierTaxId: "EIN-1",
      invoiceNumber: "9",
    }),
    "orbit-2026-10": invoice({
      supplierName: "Orbit Analytics BV",
      supplierCountry: "NL",
      invoiceNumber: "O-10",
      totalAmount: 30,
    }),
  };
  for (const [name, truth] of Object.entries(truths))
    write(`truth/${name}.json`, JSON.stringify(truth));
  const viaEmail = Object.keys(truths).filter((n) => !n.startsWith("orbit"));
  viaEmail.forEach((name, i) =>
    write(`inbox/${i + 1}.eml`, eml(`${name}.pdf`, `m${i + 1}@test.example`)),
  );
  return { demoDir, dataDir, monthDir };
}

export const LUMEN_PAGE = `<html><body><dl>
<dt>Entity</dt><dd data-fact="legal_entity" data-value="Lumen Labs Ltd">Invoices are issued by Lumen Labs Ltd</dd>
<dd data-fact="country" data-value="GB">Registered in England &amp; Wales</dd>
<dd data-fact="tax_id" data-value="GB123">VAT number GB123</dd>
<dd data-fact="reverse_charge" data-value="yes">EU business customers with a valid VAT ID are not charged VAT</dd>
<dd data-fact="company_addressee" data-value="yes">Invoices can be issued to your company name</dd>
<dd data-fact="currency" data-value="EUR">We bill in EUR</dd>
</dl></body></html>`;

/** Fake HTTP for the mock endpoints: orbit's billing API and lumen's billing page. */
export const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const auth = new Headers(init?.headers).get("authorization");
  if (url.pathname === "/mock/api/orbit/invoices") {
    if (auth !== "Bearer demo-orbit") return new Response("no", { status: 401 });
    return Response.json([
      { number: "O-10", date: "2026-10-01", pdfUrl: "/mock/api/orbit/invoices/orbit-2026-10.pdf" },
    ]);
  }
  if (url.pathname === "/mock/api/orbit/invoices/orbit-2026-10.pdf") return new Response(PDF);
  if (url.pathname === "/mock/portal/lumen/billing-info") return new Response(LUMEN_PAGE);
  return new Response("not found", { status: 404 });
};
