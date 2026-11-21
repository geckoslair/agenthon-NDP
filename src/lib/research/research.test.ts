import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import {
  factsFromInvoice,
  missingFacts,
  parseBillingInfo,
  REQUIRED_FACTS,
  researchSupplier,
  storeFacts,
  supplierRequestEmail,
} from "./index";
import { invoice, LUMEN_PAGE } from "../pipeline/__fixtures__/make-month";

describe("factsFromInvoice", () => {
  it("takes facts with a quote, sourced to the file", () => {
    const facts = factsFromInvoice(invoice(), "x.pdf");
    expect(facts.map((f) => f.fact).sort()).toEqual([
      "country",
      "currency",
      "legal_entity",
      "tax_id",
    ]);
    expect(facts.every((f) => f.sourceUrl === "file:x.pdf" && f.quote)).toBe(true);
  });

  it("no source means unknown: a value without a quote is dropped", () => {
    const inv = invoice();
    inv.supplierTaxId = { value: "GB999", quote: null, page: null };
    expect(factsFromInvoice(inv, "x.pdf").map((f) => f.fact)).not.toContain("tax_id");
  });
});

describe("parseBillingInfo", () => {
  it("reads marked facts with their verbatim quote", () => {
    const facts = parseBillingInfo(LUMEN_PAGE, "http://p");
    const country = facts.find((f) => f.fact === "country");
    expect(country).toEqual({
      fact: "country",
      value: "GB",
      sourceUrl: "http://p",
      quote: "Registered in England & Wales",
    });
    expect(facts).toHaveLength(6);
  });

  it("ignores unknown fact names, empty quotes and unmarked text", () => {
    const html = `<p>We never charge VAT</p><span data-fact="reverse_charge" data-value="yes"></span>
      <span data-fact="favourite_colour" data-value="red">Red</span>`;
    expect(parseBillingInfo(html, "u")).toEqual([]);
  });

  it("uses the quote as value when data-value is missing", () => {
    expect(parseBillingInfo('<b data-fact="currency">USD</b>', "u")[0].value).toBe("USD");
  });
});

describe("missingFacts", () => {
  it("lists every required fact when nothing is known", () => {
    expect(missingFacts([])).toEqual(REQUIRED_FACTS);
  });
});

describe("researchSupplier", () => {
  it("is complete when the page has the facts", async () => {
    const r = await researchSupplier({
      supplierId: "lumen",
      invoice: invoice(),
      fileName: "l.pdf",
      baseUrl: "http://mock.test",
      fetchImpl: async () => new Response(LUMEN_PAGE),
    });
    expect(r.missing).toEqual([]);
    expect(r.pageUrl).toBe("http://mock.test/mock/portal/lumen/billing-info");
    // The invoice is the first source for facts it carries.
    expect(r.facts.find((f) => f.fact === "tax_id")?.sourceUrl).toBe("file:l.pdf");
  });

  it("leaves facts unknown when the page is unreachable, never inferring them", async () => {
    const r = await researchSupplier({
      supplierId: "shadow",
      invoice: invoice(),
      fileName: "s.pdf",
      baseUrl: "http://mock.test",
      fetchImpl: async () => {
        throw new Error("down");
      },
    });
    expect(r.pageError).toBe("down");
    expect(r.missing).toEqual(["reverse_charge", "company_addressee"]);
  });

  it("treats a 404 page as no source", async () => {
    const r = await researchSupplier({
      supplierId: "x",
      invoice: invoice(),
      fileName: "s.pdf",
      baseUrl: "http://mock.test",
      fetchImpl: async () => new Response("nope", { status: 404 }),
    });
    expect(r.pageError).toBe("HTTP 404");
  });
});

describe("storeFacts", () => {
  it("stores only sourced facts and replaces earlier ones", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO suppliers (id, name) VALUES ('s', 'S')").run();
    storeFacts(db, "s", [
      { fact: "currency", value: "EUR", sourceUrl: "u", quote: "EUR" },
      { fact: "country", value: "GB", sourceUrl: "", quote: "x" },
    ]);
    storeFacts(db, "s", [{ fact: "tax_id", value: "1", sourceUrl: "u", quote: "VAT 1" }]);
    expect(db.prepare("SELECT fact FROM supplier_facts").all()).toEqual([{ fact: "tax_id" }]);
  });
});

describe("supplierRequestEmail", () => {
  it("asks only for the missing facts, in Italian", () => {
    const mail = supplierRequestEmail("Shadow", "Acme", ["reverse_charge"]);
    expect(mail.subject).toBe("Acme | Richiesta dati di fatturazione");
    expect(mail.body).toContain("1. fattura senza IVA estera");
    expect(mail.body).not.toContain("2.");
  });
});
