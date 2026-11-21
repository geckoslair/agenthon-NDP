import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";
import { generate, INVOICES, MONTH } from "../../../../scripts/generate-demo-data";
import { fileHandler, listHandler } from "./api";
import { billingFacts } from "./billing-facts";
import { isValidFileName, readBillingInfo, readSources } from "./demo-data";
import type { ExceptionCode, ExtractedInvoice } from "@/lib/types";
import BillingInfoPage from "../portal/[supplierId]/billing-info/page";

const DIR = path.join(process.cwd(), "demo", MONTH);
const read = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(DIR, rel), "utf8")) as T;
const pdfs = () => fs.readdirSync(path.join(DIR, "pdf")).filter((f) => f.endsWith(".pdf"));

const CODES: ExceptionCode[] = [
  "MISSING_EXPECTED_INVOICE",
  "ADDRESSED_TO_PERSON",
  "FOREIGN_VAT_CHARGED",
  "WRONG_MONTH",
  "NOT_FOREIGN",
  "DUPLICATE",
  "SUPPLIER_FACTS_UNKNOWN",
  "UNREADABLE_FIELD",
  "OUT_OF_KNOWN_RULES",
];

describe("demo data generator", () => {
  it("is deterministic: two runs give identical truth JSON and PDFs", async () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "probata-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "probata-b-"));
    await generate(a);
    await generate(b);
    for (const sub of ["truth", "pdf"]) {
      const files = fs.readdirSync(path.join(a, MONTH, sub));
      expect(files.length).toBeGreaterThan(15);
      for (const f of files) {
        expect(
          fs
            .readFileSync(path.join(b, MONTH, sub, f))
            .equals(fs.readFileSync(path.join(a, MONTH, sub, f))),
        ).toBe(true);
      }
    }
  });

  it("the committed dataset matches the generator specs", () => {
    expect(pdfs().sort()).toEqual(INVOICES.map((i) => i.fileName).sort());
  });

  it("every PDF has a truth file and appears exactly once in sources.json", () => {
    const sources = read<{
      email: string[];
      billing_api: Record<string, string[]>;
      browser: Record<string, string[]>;
    }>("sources.json");
    const all = [
      ...sources.email,
      ...Object.values(sources.billing_api).flat(),
      ...Object.values(sources.browser).flat(),
    ];
    for (const f of pdfs()) {
      expect(fs.existsSync(path.join(DIR, "truth", f.replace(/\.pdf$/, ".json")))).toBe(true);
      expect(all.filter((x) => x === f)).toHaveLength(1);
    }
    expect(all).toHaveLength(pdfs().length);
    expect(Object.keys(sources.billing_api).length).toBe(2);
    expect(Object.keys(sources.browser).length).toBe(2);
  });

  it("truth values carry a quote and page, or are all null", () => {
    for (const f of pdfs()) {
      const truth = read<ExtractedInvoice>(`truth/${f.replace(/\.pdf$/, ".json")}`);
      for (const [key, s] of Object.entries(truth)) {
        if (s.value === null) expect([key, s.quote, s.page]).toEqual([key, null, null]);
        else {
          expect(s.quote, `${f} ${key}`).toBeTruthy();
          expect(s.page).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("expected.json has valid codes, one of each planted case", () => {
    const expected =
      read<{ fileName: string | null; code: ExceptionCode; supplierId?: string }[]>(
        "expected.json",
      );
    for (const e of expected) expect(CODES).toContain(e.code);
    expect(new Set(expected.map((e) => e.code)).size).toBe(expected.length);
    expect(expected.map((e) => e.code).sort()).toEqual([...CODES].sort());
    const missing = expected.find((e) => e.code === "MISSING_EXPECTED_INVOICE");
    expect(missing).toMatchObject({ fileName: null, supplierId: "marlow" });
    for (const e of expected) if (e.fileName) expect(pdfs()).toContain(e.fileName);
  });

  it("inbox emails carry the email-channel PDFs as attachments", async () => {
    const sources = read<{ email: string[] }>("sources.json");
    const seen: string[] = [];
    for (const f of fs.readdirSync(path.join(DIR, "inbox")).filter((x) => x.endsWith(".eml"))) {
      const mail = await simpleParser(fs.readFileSync(path.join(DIR, "inbox", f)));
      for (const att of mail.attachments) {
        expect(att.contentType).toBe("application/pdf");
        expect(att.content.equals(fs.readFileSync(path.join(DIR, "pdf", att.filename!)))).toBe(
          true,
        );
        seen.push(att.filename!);
      }
    }
    expect(seen.sort()).toEqual([...sources.email].sort());
  });

  it("registry has expectedPerMonth for recurring suppliers and leaves out the unknown ones", () => {
    const suppliers = read<{ id: string; expectedPerMonth: number }[]>("suppliers.json");
    const ids = suppliers.map((s) => s.id);
    expect(ids).not.toContain("helix");
    expect(ids).not.toContain("sable");
    expect(suppliers.find((s) => s.id === "marlow")?.expectedPerMonth).toBe(1);
    expect(suppliers.find((s) => s.id === "vesper")?.expectedPerMonth).toBe(5);
  });
});

describe("mock billing API", () => {
  const url = "http://localhost/mock/api/orbit/invoices?month=2026-10";
  it("returns 401 without the token and with a wrong token", async () => {
    expect((await listHandler(new Request(url), "orbit")).status).toBe(401);
    const wrong = new Request(url, { headers: { authorization: "Bearer demo-quill" } });
    expect((await listHandler(wrong, "orbit")).status).toBe(401);
    expect((await fileHandler(new Request(url), "orbit", "orbit-2026-10.pdf")).status).toBe(401);
  });

  it("lists the supplier's invoices with the right token", async () => {
    const res = await listHandler(
      new Request(url, { headers: { authorization: "Bearer demo-orbit" } }),
      "orbit",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        number: "OA-2026-10-0042",
        date: "2026-10-01",
        pdfUrl: "/mock/api/orbit/invoices/orbit-2026-10.pdf",
      },
    ]);
  });

  it("returns an empty list for an unknown month and 400 for a malformed one", async () => {
    const headers = { authorization: "Bearer demo-orbit" };
    const empty = await listHandler(
      new Request("http://localhost/x?month=2020-01", { headers }),
      "orbit",
    );
    expect(await empty.json()).toEqual([]);
    const bad = await listHandler(
      new Request("http://localhost/x?month=../..", { headers }),
      "orbit",
    );
    expect(bad.status).toBe(400);
  });

  it("serves the PDF, and refuses other suppliers' files and path traversal", async () => {
    const headers = { authorization: "Bearer demo-orbit" };
    const ok = await fileHandler(
      new Request("http://localhost/x", { headers }),
      "orbit",
      "orbit-2026-10.pdf",
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(await ok.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
    const other = await fileHandler(
      new Request("http://localhost/x", { headers }),
      "orbit",
      "glyph-R-88.pdf",
    );
    expect(other.status).toBe(404);
    const evil = await fileHandler(
      new Request("http://localhost/x", { headers }),
      "orbit",
      "../../package.json",
    );
    expect(evil.status).toBe(404);
    expect(isValidFileName("../a.pdf")).toBe(false);
  });
});

describe("mock supplier pages", () => {
  it("assigns two suppliers to the billing API and two to the browser", () => {
    const s = readSources(MONTH)!;
    expect(Object.keys(s.billing_api).sort()).toEqual(["orbit", "quill"]);
    expect(Object.keys(s.browser).sort()).toEqual(["cobalt", "glyph"]);
  });

  it("billing-info of the researchable supplier states entity, country, tax id, VAT treatment, currency", () => {
    const facts = billingFacts(readBillingInfo(MONTH, "helix")!);
    const byName = Object.fromEntries(facts.map((f) => [f.name, f]));
    expect(byName.legal_entity.value).toBe("Helix Metrics Ltd");
    expect(byName.country.value).toBe("IE");
    expect(byName.tax_id.value).toBeTruthy();
    expect(byName.reverse_charge.value).toBe("yes");
    expect(byName.currency.value).toBe("EUR");
  });

  it("billing-info of the other unknown supplier omits tax id and VAT treatment", () => {
    const names = billingFacts(readBillingInfo(MONTH, "sable")!).map((f) => f.name);
    expect(names).toContain("legal_entity");
    expect(names).not.toContain("tax_id");
    expect(names).not.toContain("reverse_charge");
  });

  it("renders data-fact markup and the demo banner", async () => {
    const html = renderToStaticMarkup(
      await BillingInfoPage({ params: Promise.resolve({ supplierId: "helix" }) }),
    );
    expect(html).toContain('data-fact="reverse_charge"');
    expect(html).toContain('data-value="yes"');
    expect(html).toContain("DEMO PAGE");
    const sable = renderToStaticMarkup(
      await BillingInfoPage({ params: Promise.resolve({ supplierId: "sable" }) }),
    );
    expect(sable).not.toContain('data-fact="tax_id"');
  });

  it("returns null for unknown or unsafe supplier ids", () => {
    expect(readBillingInfo(MONTH, "nobody")).toBeNull();
    expect(readBillingInfo(MONTH, "../etc")).toBeNull();
  });
});
