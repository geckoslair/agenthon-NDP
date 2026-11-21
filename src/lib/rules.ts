// Deterministic validation rules. No LLM here: the model extracts, these rules decide.
// Every rule maps to a real recurring problem listed in docs/domain.md.

import type {
  CardCharge,
  CompanyProfile,
  ExtractedInvoice,
  InvoiceException,
  Supplier,
} from "./types";

const REQUIRED_FIELDS = [
  "supplierName",
  "supplierCountry",
  "invoiceNumber",
  "invoiceDate",
  "totalAmount",
  "currency",
  "addresseeName",
] as const satisfies readonly (keyof ExtractedInvoice)[];

export function normalizeVatId(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Checks a single invoice. `month` is "YYYY-MM", the month of the run. */
export function validateInvoice(
  invoice: ExtractedInvoice,
  company: CompanyProfile,
  month: string,
): InvoiceException[] {
  const exceptions: InvoiceException[] = [];

  // A value the model could not read is never guessed: it stops the invoice.
  for (const field of REQUIRED_FIELDS) {
    if (invoice[field].value === null || invoice[field].value === "") {
      exceptions.push({
        code: "UNREADABLE_FIELD",
        message: `Could not read "${field}" from the document.`,
        evidence: null,
      });
    }
  }

  const country = invoice.supplierCountry.value?.toUpperCase() ?? null;
  if (country !== null && country === company.country.toUpperCase()) {
    exceptions.push({
      code: "NOT_FOREIGN",
      message: "The supplier is in the company's own country: not a foreign invoice.",
      evidence: invoice.supplierCountry.quote,
    });
  }

  const addresseeVat = invoice.addresseeVatId.value;
  const addresseeName = invoice.addresseeName.value;
  const vatMatches =
    addresseeVat !== null && normalizeVatId(addresseeVat) === normalizeVatId(company.vatId);
  const nameMatches =
    addresseeName !== null &&
    normalizeName(addresseeName).includes(normalizeName(company.legalName));
  if (addresseeName !== null && !vatMatches && !nameMatches) {
    exceptions.push({
      code: "ADDRESSED_TO_PERSON",
      message: "The invoice is not addressed to the company.",
      evidence: invoice.addresseeName.quote ?? addresseeName,
    });
  } else if (addresseeVat !== null && !vatMatches) {
    exceptions.push({
      code: "ADDRESSED_TO_PERSON",
      message: "The addressee VAT number is not the company's.",
      evidence: invoice.addresseeVatId.quote ?? addresseeVat,
    });
  }

  const vat = invoice.vatAmount.value;
  if (vat !== null && vat > 0) {
    exceptions.push({
      code: "FOREIGN_VAT_CHARGED",
      message: "Foreign VAT is charged: the invoice should be issued under reverse charge.",
      evidence: invoice.vatAmount.quote ?? String(vat),
    });
  }

  const date = invoice.invoiceDate.value;
  if (date !== null && !date.startsWith(month)) {
    exceptions.push({
      code: "WRONG_MONTH",
      message: `The invoice date is outside ${month}.`,
      evidence: invoice.invoiceDate.quote ?? date,
    });
  }

  return exceptions;
}

/** Returns the indexes of invoices that duplicate an earlier one (same supplier, number, amount). */
export function findDuplicates(invoices: ExtractedInvoice[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  invoices.forEach((invoice, index) => {
    const name = invoice.supplierName.value;
    const number = invoice.invoiceNumber.value;
    if (name === null || number === null) return;
    const key = `${normalizeName(name)}|${number.trim()}|${invoice.totalAmount.value}`;
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });
  return duplicates;
}

export function matchSupplier(name: string, suppliers: Supplier[]): Supplier | null {
  const target = normalizeName(name);
  if (target === "") return null;
  return (
    suppliers.find((s) => {
      const candidate = normalizeName(s.name);
      return candidate === target || target.includes(candidate) || candidate.includes(target);
    }) ?? null
  );
}

export interface CompletenessResult {
  /** Recurring suppliers with fewer invoices than expected this month. */
  missingFromSuppliers: { supplier: Supplier; expected: number; received: number }[];
  /** Card charges with no invoice of the same amount and currency. */
  unmatchedCharges: CardCharge[];
}

export function checkCompleteness(
  invoices: ExtractedInvoice[],
  suppliers: Supplier[],
  charges: CardCharge[],
): CompletenessResult {
  const received = new Map<string, number>();
  for (const invoice of invoices) {
    const name = invoice.supplierName.value;
    const supplier = name === null ? null : matchSupplier(name, suppliers);
    if (supplier) received.set(supplier.id, (received.get(supplier.id) ?? 0) + 1);
  }
  const missingFromSuppliers = suppliers
    .filter((s) => s.expectedPerMonth > 0 && (received.get(s.id) ?? 0) < s.expectedPerMonth)
    .map((supplier) => ({
      supplier,
      expected: supplier.expectedPerMonth,
      received: received.get(supplier.id) ?? 0,
    }));

  // Each invoice can cover one charge only.
  const pool = invoices.map((i) => ({
    amount: i.totalAmount.value,
    currency: i.currency.value?.toUpperCase() ?? null,
    used: false,
  }));
  const unmatchedCharges = charges.filter((charge) => {
    const hit = pool.find(
      (p) =>
        !p.used &&
        p.amount !== null &&
        Math.abs(p.amount - charge.amount) < 0.005 &&
        p.currency === charge.currency.toUpperCase(),
    );
    if (hit) hit.used = true;
    return !hit;
  });

  return { missingFromSuppliers, unmatchedCharges };
}
