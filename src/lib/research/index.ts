// Unknown supplier research. Every fact carries its source and a verbatim quote;
// a fact with no source stays unknown and is never inferred.
import type { Db } from "../db";
import type { ExtractedInvoice } from "../types";

export const FACT_NAMES = [
  "legal_entity",
  "country",
  "tax_id",
  "reverse_charge",
  "company_addressee",
  "currency",
  "invoice_channel",
] as const;
export type FactName = (typeof FACT_NAMES)[number];

/** Facts that must be established before a new supplier can be proposed for approval. */
export const REQUIRED_FACTS: FactName[] = [
  "legal_entity",
  "country",
  "tax_id",
  "reverse_charge",
  "company_addressee",
  "currency",
];

export const FACT_LABELS: Record<FactName, string> = {
  legal_entity: "soggetto che emette la fattura",
  country: "paese",
  tax_id: "identificativo fiscale",
  reverse_charge: "fattura senza IVA estera a una società italiana con partita IVA",
  company_addressee: "fattura intestabile a una società",
  currency: "valuta di fatturazione",
  invoice_channel: "come si ottiene la fattura",
};

export interface Fact {
  fact: FactName;
  value: string;
  sourceUrl: string;
  quote: string;
}

function isFactName(name: string): name is FactName {
  return (FACT_NAMES as readonly string[]).includes(name);
}

/** Facts read from the invoice itself; only values that have a verbatim quote count. */
export function factsFromInvoice(invoice: ExtractedInvoice, fileName: string): Fact[] {
  const sourceUrl = `file:${fileName}`;
  const pairs: [FactName, { value: unknown; quote: string | null }][] = [
    ["legal_entity", invoice.supplierName],
    ["country", invoice.supplierCountry],
    ["tax_id", invoice.supplierTaxId],
    ["currency", invoice.currency],
  ];
  const facts: Fact[] = [];
  for (const [fact, sourced] of pairs) {
    if (sourced.value === null || sourced.value === "" || !sourced.quote) continue;
    facts.push({ fact, value: String(sourced.value), sourceUrl, quote: sourced.quote });
  }
  return facts;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function textOf(html: string): string {
  return decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads the facts marked on a supplier's billing-info page: an element with
 * data-fact="<name>" and data-value="<value>", whose text is the verbatim quote.
 * Elements without a quote are ignored (the fact stays unknown).
 */
export function parseBillingInfo(html: string, sourceUrl: string): Fact[] {
  const facts: Fact[] = [];
  const pattern =
    /<([a-zA-Z][\w-]*)\b([^>]*\bdata-fact\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1\s*>/g;
  for (const match of html.matchAll(pattern)) {
    const [, , attrs, name, inner] = match;
    if (!isFactName(name)) continue;
    const quote = textOf(inner);
    if (quote === "") continue;
    const valueMatch = /\bdata-value\s*=\s*["']([^"']*)["']/.exec(attrs);
    const value = valueMatch ? decode(valueMatch[1]).trim() : quote;
    if (value === "") continue;
    if (facts.some((f) => f.fact === name)) continue;
    facts.push({ fact: name, value, sourceUrl, quote });
  }
  return facts;
}

/** Merges facts by name; the first source wins (invoice before public page). */
export function mergeFacts(...lists: Fact[][]): Fact[] {
  const out = new Map<FactName, Fact>();
  for (const list of lists) for (const f of list) if (!out.has(f.fact)) out.set(f.fact, f);
  return [...out.values()];
}

/**
 * Known facts that say the supplier does not fit: it charges foreign VAT, or it only
 * invoices the person. They are established facts, so they raise an exception.
 */
export const NEGATIVE_FACT_RULES = {
  reverse_charge: {
    code: "FOREIGN_VAT_CHARGED" as const,
    message: "La pagina pubblica del fornitore dice che addebita l'IVA locale.",
    action:
      "Verificare con il fornitore se, inserendo la partita IVA della società, fattura in reverse charge; altrimenti decidere con il commercialista se procedere.",
  },
  company_addressee: {
    code: "ADDRESSED_TO_PERSON" as const,
    message: "La pagina pubblica del fornitore dice che fattura solo alla persona che acquista.",
    action:
      "Chiedere al fornitore se può intestare la fattura alla società; altrimenti decidere con il commercialista se procedere.",
  },
};

/** Facts found with value "no" for reverse_charge or company_addressee. */
export function negativeFacts(facts: Fact[]): Fact[] {
  return facts.filter(
    (f) => f.fact in NEGATIVE_FACT_RULES && f.value.trim().toLowerCase() === "no",
  );
}

export function missingFacts(facts: Fact[]): FactName[] {
  const known = new Set(facts.map((f) => f.fact));
  return REQUIRED_FACTS.filter((f) => !known.has(f));
}

export interface ResearchInput {
  supplierId: string;
  invoice: ExtractedInvoice;
  fileName: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ResearchResult {
  facts: Fact[];
  missing: FactName[];
  pageUrl: string;
  /** Set when the public page could not be read. */
  pageError: string | null;
}

/** Read-only research: the invoice, then the supplier's public billing page. */
export async function researchSupplier(input: ResearchInput): Promise<ResearchResult> {
  const fromInvoice = factsFromInvoice(input.invoice, input.fileName);
  const pageUrl = new URL(
    `/mock/portal/${encodeURIComponent(input.supplierId)}/billing-info`,
    input.baseUrl,
  ).toString();
  let fromPage: Fact[] = [];
  let pageError: string | null = null;
  try {
    const response = await (input.fetchImpl ?? fetch)(pageUrl, {
      signal: AbortSignal.timeout(input.timeoutMs ?? 5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    fromPage = parseBillingInfo(await response.text(), pageUrl);
  } catch (error) {
    pageError = (error as Error).message;
  }
  const facts = mergeFacts(fromInvoice, fromPage);
  return { facts, missing: missingFacts(facts), pageUrl, pageError };
}

/** Replaces the stored facts of a supplier. Only sourced facts are stored. */
export function storeFacts(db: Db, supplierId: string, facts: Fact[]): void {
  db.prepare("DELETE FROM supplier_facts WHERE supplier_id = ?").run(supplierId);
  const insert = db.prepare(
    "INSERT INTO supplier_facts (supplier_id, fact, value, source_url, quote) VALUES (?, ?, ?, ?, ?)",
  );
  for (const f of facts) {
    if (!f.sourceUrl || !f.quote) continue;
    insert.run(supplierId, f.fact, f.value, f.sourceUrl, f.quote);
  }
}

/** The templated email asking a supplier for the facts research could not establish. */
export function supplierRequestEmail(
  supplierName: string,
  companyName: string,
  missing: FactName[],
): { subject: string; body: string } {
  const lines = missing.map((f, i) => `${i + 1}. ${FACT_LABELS[f]}`);
  return {
    subject: `${companyName} | Richiesta dati di fatturazione`,
    body: [
      `Buongiorno ${supplierName},`,
      "",
      `per registrare correttamente le vostre fatture verso ${companyName} ci servono queste informazioni:`,
      "",
      ...lines,
      "",
      "Potete indicarci anche la pagina pubblica in cui sono riportate?",
      "",
      "Grazie,",
      companyName,
    ].join("\n"),
  };
}
