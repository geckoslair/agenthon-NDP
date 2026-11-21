// Shared domain types. See docs/spec.md.

/** A value read from a document, with a pointer to where it was read. */
export interface Sourced<T> {
  value: T | null;
  /** Verbatim text the value was read from; null when not found. */
  quote: string | null;
  /** 1-based page number in the PDF, when known. */
  page: number | null;
}

export interface ExtractedInvoice {
  supplierName: Sourced<string>;
  /** ISO 3166-1 alpha-2 country of the issuing entity. */
  supplierCountry: Sourced<string>;
  supplierTaxId: Sourced<string>;
  invoiceNumber: Sourced<string>;
  /** ISO date, YYYY-MM-DD. */
  invoiceDate: Sourced<string>;
  /** "invoice" | "credit_note" | "receipt" | "proforma" */
  documentType: Sourced<string>;
  totalAmount: Sourced<number>;
  vatAmount: Sourced<number>;
  /** ISO 4217 code. */
  currency: Sourced<string>;
  addresseeName: Sourced<string>;
  addresseeVatId: Sourced<string>;
}

export interface CompanyProfile {
  legalName: string;
  /** VAT number with country prefix, e.g. "IT01234567890". */
  vatId: string;
  country: string;
}

export interface Supplier {
  id: string;
  name: string;
  country: string | null;
  taxId: string | null;
  /** How many invoices are expected each month; 0 for occasional suppliers. */
  expectedPerMonth: number;
  /** "approved" suppliers have verified billing facts; "unknown" ones need research. */
  status: "approved" | "unknown" | "rejected";
}

export interface CardCharge {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  description: string;
  amount: number;
  currency: string;
}

export type ExceptionCode =
  | "MISSING_EXPECTED_INVOICE"
  | "ADDRESSED_TO_PERSON"
  | "FOREIGN_VAT_CHARGED"
  | "WRONG_MONTH"
  | "NOT_FOREIGN"
  | "DUPLICATE"
  | "SUPPLIER_FACTS_UNKNOWN"
  | "UNREADABLE_FIELD"
  | "OUT_OF_KNOWN_RULES";

export interface InvoiceException {
  code: ExceptionCode;
  /** Human-readable explanation, shown in the approval queue. */
  message: string;
  /** Evidence: the quote or value that triggered the rule. */
  evidence: string | null;
}
