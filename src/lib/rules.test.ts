import { describe, expect, it } from "vitest";
import { checkCompleteness, findDuplicates, matchSupplier, validateInvoice } from "./rules";
import type { CompanyProfile, ExtractedInvoice, Sourced, Supplier } from "./types";

const company: CompanyProfile = {
  legalName: "Acme Studio SRL",
  vatId: "IT01234567890",
  country: "IT",
};

function s<T>(value: T | null): Sourced<T> {
  return { value, quote: value === null ? null : String(value), page: value === null ? null : 1 };
}

function invoice(overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    supplierName: s("Nimbus Hosting GmbH"),
    supplierCountry: s("DE"),
    supplierTaxId: s("DE123456789"),
    invoiceNumber: s("INV-1001"),
    invoiceDate: s("2026-10-14"),
    documentType: s("invoice"),
    totalAmount: s(49),
    vatAmount: s(0),
    currency: s("EUR"),
    addresseeName: s("Acme Studio SRL"),
    addresseeVatId: s("IT 0123 4567 890"),
    ...overrides,
  };
}

const codes = (i: ExtractedInvoice, month = "2026-10") =>
  validateInvoice(i, company, month).map((e) => e.code);

describe("validateInvoice", () => {
  it("accepts a clean foreign invoice", () => {
    expect(codes(invoice())).toEqual([]);
  });

  it("flags foreign VAT charged", () => {
    expect(codes(invoice({ vatAmount: s(9.31) }))).toEqual(["FOREIGN_VAT_CHARGED"]);
  });

  it("flags an invoice addressed to a person", () => {
    const i = invoice({ addresseeName: s("Mario Rossi"), addresseeVatId: s<string>(null) });
    expect(codes(i)).toEqual(["ADDRESSED_TO_PERSON"]);
  });

  it("flags a wrong addressee VAT number even when the name matches", () => {
    expect(codes(invoice({ addresseeVatId: s("IT99999999999") }))).toEqual(["ADDRESSED_TO_PERSON"]);
  });

  it("accepts the company name when the VAT number is not printed", () => {
    expect(codes(invoice({ addresseeVatId: s<string>(null) }))).toEqual([]);
  });

  it("flags an invoice dated in another month", () => {
    expect(codes(invoice({ invoiceDate: s("2026-11-01") }))).toEqual(["WRONG_MONTH"]);
  });

  it("flags a domestic supplier", () => {
    expect(codes(invoice({ supplierCountry: s("it") }))).toEqual(["NOT_FOREIGN"]);
  });

  it("stops on unreadable required fields instead of guessing", () => {
    const result = codes(invoice({ totalAmount: s<number>(null), invoiceNumber: s<string>(null) }));
    expect(result).toEqual(["UNREADABLE_FIELD", "UNREADABLE_FIELD"]);
  });

  it("reports several problems at once", () => {
    const i = invoice({ vatAmount: s(5), invoiceDate: s("2026-09-30") });
    expect(codes(i)).toEqual(["FOREIGN_VAT_CHARGED", "WRONG_MONTH"]);
  });
});

describe("findDuplicates", () => {
  it("finds a repeated supplier, number and amount", () => {
    expect(
      findDuplicates([invoice(), invoice({ invoiceNumber: s("INV-1002") }), invoice()]),
    ).toEqual([2]);
  });

  it("ignores invoices with unreadable keys", () => {
    const blank = invoice({ invoiceNumber: s<string>(null) });
    expect(findDuplicates([blank, blank])).toEqual([]);
  });
});

const suppliers: Supplier[] = [
  {
    id: "nimbus",
    name: "Nimbus Hosting",
    country: "DE",
    taxId: "DE123456789",
    expectedPerMonth: 1,
    status: "approved",
  },
  {
    id: "orbit",
    name: "Orbit Mail",
    country: "US",
    taxId: null,
    expectedPerMonth: 1,
    status: "approved",
  },
  {
    id: "fonts",
    name: "Glyph Foundry",
    country: "CH",
    taxId: null,
    expectedPerMonth: 0,
    status: "approved",
  },
];

describe("matchSupplier", () => {
  it("matches despite legal suffixes and case", () => {
    expect(matchSupplier("NIMBUS HOSTING GmbH", suppliers)?.id).toBe("nimbus");
  });

  it("returns null for an unknown supplier", () => {
    expect(matchSupplier("Brand New Vendor Ltd", suppliers)).toBeNull();
    expect(matchSupplier("", suppliers)).toBeNull();
  });
});

describe("checkCompleteness", () => {
  it("reports recurring suppliers with no invoice and charges with no invoice", () => {
    const result = checkCompleteness([invoice()], suppliers, [
      { id: "c1", date: "2026-10-14", description: "NIMBUS", amount: 49, currency: "EUR" },
      { id: "c2", date: "2026-10-20", description: "ORBIT MAIL", amount: 15, currency: "USD" },
    ]);
    expect(result.missingFromSuppliers.map((m) => m.supplier.id)).toEqual(["orbit"]);
    expect(result.unmatchedCharges.map((c) => c.id)).toEqual(["c2"]);
  });

  it("does not let one invoice cover two identical charges", () => {
    const charge = { date: "2026-10-14", description: "NIMBUS", amount: 49, currency: "EUR" };
    const result = checkCompleteness([invoice()], suppliers, [
      { id: "c1", ...charge },
      { id: "c2", ...charge },
    ]);
    expect(result.unmatchedCharges.map((c) => c.id)).toEqual(["c2"]);
  });

  it("reports nothing missing for an empty registry", () => {
    expect(checkCompleteness([], [], [])).toEqual({
      missingFromSuppliers: [],
      unmatchedCharges: [],
    });
  });
});
