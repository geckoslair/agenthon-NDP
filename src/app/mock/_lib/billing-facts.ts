import type { BillingInfo } from "./demo-data";

export interface Fact {
  /** Convention in docs/contracts.md: legal_entity, country, tax_id, reverse_charge, ... */
  name: string;
  value: string;
  /** Verbatim sentence shown on the page; this is the quote the research keeps. */
  text: string;
}

const CHANNEL_TEXT = {
  email: "Invoices are sent to the billing contact by email.",
  billing_api: "Invoices are available through our billing API.",
  browser: "Invoices can be downloaded from the dashboard, under Invoices.",
} as const;

/** Facts that the page states. A fact that is null in the data is left out, never invented. */
export function billingFacts(info: BillingInfo): Fact[] {
  const facts: Fact[] = [];
  facts.push({
    name: "legal_entity",
    value: info.legalEntity,
    text: `${info.legalEntity} is the legal entity that issues all invoices.`,
  });
  facts.push({
    name: "country",
    value: info.countryCode,
    text: `The company is registered in ${info.countryName}.`,
  });
  if (info.taxId) {
    facts.push({ name: "tax_id", value: info.taxId, text: `Our tax identifier is ${info.taxId}.` });
  }
  if (info.reverseCharge !== null) {
    facts.push({
      name: "reverse_charge",
      value: info.reverseCharge ? "yes" : "no",
      text: info.reverseCharge
        ? "Invoices to VAT-registered businesses in the EU are issued without VAT (reverse charge)."
        : "We charge local VAT on all invoices.",
    });
  }
  if (info.companyAddressee !== null) {
    facts.push({
      name: "company_addressee",
      value: info.companyAddressee ? "yes" : "no",
      text: info.companyAddressee
        ? "Invoices can be addressed to a company: enter the company name and VAT number in the billing settings."
        : "Invoices are issued to the person who bought the service.",
    });
  }
  if (info.currency) {
    facts.push({ name: "currency", value: info.currency, text: `We invoice in ${info.currency}.` });
  }
  if (info.channel) {
    facts.push({
      name: "invoice_channel",
      value:
        info.channel === "browser" ? "dashboard" : info.channel === "billing_api" ? "api" : "email",
      text: CHANNEL_TEXT[info.channel],
    });
  }
  return facts;
}
