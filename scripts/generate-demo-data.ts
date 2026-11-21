// Generates the synthetic demo month under demo/<month>/ (see docs/contracts.md).
// Run: npx tsx scripts/generate-demo-data.ts
// Deterministic: fixed data, fixed dates, no randomness. Everything is invented:
// company names, people and tax ids are fictional and must never match a real one.

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type {
  CardCharge,
  CompanyProfile,
  ExceptionCode,
  ExtractedInvoice,
  Sourced,
  Supplier,
} from "../src/lib/types";

export const MONTH = "2026-10";
const FIXED_DATE = new Date("2026-10-31T12:00:00Z");

export const COMPANY: CompanyProfile = {
  legalName: "Acme Studio SRL",
  vatId: "IT01234567890",
  country: "IT",
};

type Layout = "classic" | "modern" | "mono" | "receipt" | "statement";
type VatMode = "reverse" | "rate" | "zero" | "none";
type Channel = "email" | "billing_api" | "browser";
type Lang = "en" | "it";

interface SellerSpec {
  id: string;
  name: string;
  street: string;
  postalCity: string;
  countryName: string;
  countryCode: string;
  /** Printed label, e.g. "VAT ID" */
  taxLabel: string;
  taxId: string | null;
  /** Whether the tax id is printed on the invoices (false for the unknown suppliers). */
  printTaxId: boolean;
  email: string;
  accent: string;
  layout: Layout;
  lang: Lang;
}

interface InvoiceSpec {
  seller: string;
  fileName: string;
  number: string | null;
  date: string;
  dateStyle: "long" | "iso" | "us";
  docTitle: string;
  documentType: "invoice" | "receipt";
  lines: { desc: string; amount: number }[];
  currency: string;
  vatMode: VatMode;
  vatRate?: number;
  addressee: { name: string; vatId: string | null; address: string };
  channel: Channel;
}

const ACME_ADDRESS = "Via Esempio 1, 10100 Torino, Italy";
const ACME = { name: COMPANY.legalName, vatId: COMPANY.vatId, address: ACME_ADDRESS };

const SELLERS: SellerSpec[] = [
  {
    id: "nimbus",
    name: "Nimbus Cloud Hosting GmbH",
    street: "Musterweg 12",
    postalCity: "10999 Berlin",
    countryName: "Germany",
    countryCode: "DE",
    taxLabel: "VAT ID",
    taxId: "DE999000111",
    printTaxId: true,
    email: "billing@nimbus-hosting.example",
    accent: "#1f4e8c",
    layout: "classic",
    lang: "en",
  },
  {
    id: "orbit",
    name: "Orbit Analytics Ltd",
    street: "Sample House, 4 Test Quay",
    postalCity: "Dublin D02 XX00",
    countryName: "Ireland",
    countryCode: "IE",
    taxLabel: "VAT No",
    taxId: "IE9999991A",
    printTaxId: true,
    email: "billing@orbit-analytics.example",
    accent: "#7a3cff",
    layout: "modern",
    lang: "en",
  },
  {
    id: "glyph",
    name: "Glyph Design Software B.V.",
    street: "Voorbeeldstraat 7",
    postalCity: "1011 AA Amsterdam",
    countryName: "Netherlands",
    countryCode: "NL",
    taxLabel: "BTW",
    taxId: "NL999999991B01",
    printTaxId: true,
    email: "billing@glyph-design.example",
    accent: "#e0475b",
    layout: "modern",
    lang: "en",
  },
  {
    id: "vesper",
    name: "Vesper Compute OÜ",
    street: "Naidistee 3",
    postalCity: "10111 Tallinn",
    countryName: "Estonia",
    countryCode: "EE",
    taxLabel: "VAT ID",
    taxId: "EE999999991",
    printTaxId: true,
    email: "billing@vesper-compute.example",
    accent: "#0f766e",
    layout: "statement",
    lang: "en",
  },
  {
    id: "quill",
    name: "Quill Docs Inc.",
    street: "100 Sample Street",
    postalCity: "Austin, TX 78701",
    countryName: "United States",
    countryCode: "US",
    taxLabel: "EIN",
    taxId: "99-9999991",
    printTaxId: true,
    email: "billing@quill-docs.example",
    accent: "#b45309",
    layout: "classic",
    lang: "en",
  },
  {
    id: "alpenrose",
    name: "Alpenrose Security AG",
    street: "Beispielgasse 5",
    postalCity: "8001 Zurich",
    countryName: "Switzerland",
    countryCode: "CH",
    taxLabel: "UID",
    taxId: "CHE-999.999.991 MWST",
    printTaxId: true,
    email: "billing@alpenrose-security.example",
    accent: "#9f1239",
    layout: "classic",
    lang: "en",
  },
  {
    id: "tandoor",
    name: "Tandoor Labs Pvt Ltd",
    street: "12 Sample Road",
    postalCity: "Bengaluru 560001",
    countryName: "India",
    countryCode: "IN",
    taxLabel: "GSTIN",
    taxId: "29AAAAA9999A1Z5",
    printTaxId: true,
    email: "billing@tandoor-labs.example",
    accent: "#c2410c",
    layout: "receipt",
    lang: "en",
  },
  {
    id: "cobalt",
    name: "Cobalt CI Inc.",
    street: "55 Example Avenue",
    postalCity: "Denver, CO 80202",
    countryName: "United States",
    countryCode: "US",
    taxLabel: "EIN",
    taxId: "99-9999992",
    printTaxId: true,
    email: "billing@cobalt-ci.example",
    accent: "#000000",
    layout: "mono",
    lang: "en",
  },
  {
    id: "lumen",
    name: "Lumen Translate GmbH",
    street: "Probeplatz 9",
    postalCity: "80331 Munich",
    countryName: "Germany",
    countryCode: "DE",
    taxLabel: "USt-IdNr.",
    taxId: "DE999000222",
    printTaxId: true,
    email: "billing@lumen-translate.example",
    accent: "#4d7c0f",
    layout: "classic",
    lang: "en",
  },
  {
    id: "rivolta",
    name: "Rivolta Cloud Servizi S.r.l.",
    street: "Via Campione 10",
    postalCity: "20100 Milano",
    countryName: "Italy",
    countryCode: "IT",
    taxLabel: "P.IVA",
    taxId: "IT99999999990",
    printTaxId: true,
    email: "fatture@rivolta-cloud.example",
    accent: "#334155",
    layout: "classic",
    lang: "it",
  },
  {
    id: "helix",
    name: "Helix Metrics Ltd",
    street: "Fictional Court, 1 Demo Street",
    postalCity: "Dublin D04 XX11",
    countryName: "Ireland",
    countryCode: "IE",
    taxLabel: "VAT No",
    taxId: "IE9999992B",
    printTaxId: false,
    email: "billing@helix-metrics.example",
    accent: "#0369a1",
    layout: "modern",
    lang: "en",
  },
  {
    id: "sable",
    name: "Sable Tools LLC",
    street: "9 Placeholder Lane",
    postalCity: "Portland, OR 97201",
    countryName: "United States",
    countryCode: "US",
    taxLabel: "EIN",
    taxId: "99-9999993",
    printTaxId: true,
    email: "billing@sable-tools.example",
    accent: "#000000",
    layout: "mono",
    lang: "en",
  },
  {
    id: "elowen",
    name: "Elowen Thistledown",
    street: "3 Imaginary Mews",
    postalCity: "Bristol BS1 0XX",
    countryName: "United Kingdom",
    countryCode: "GB",
    taxLabel: "Tax ID",
    taxId: null,
    printTaxId: false,
    email: "elowen@thistledown-studio.example",
    accent: "#6d28d9",
    layout: "receipt",
    lang: "en",
  },
  {
    id: "marlow",
    name: "Marlow Fonts Ltd",
    street: "1 Specimen Row",
    postalCity: "London EC1A 0XX",
    countryName: "United Kingdom",
    countryCode: "GB",
    taxLabel: "VAT No",
    taxId: "GB999999991",
    printTaxId: true,
    email: "billing@marlow-fonts.example",
    accent: "#111827",
    layout: "classic",
    lang: "en",
  },
];

const VESPER_LINES = (a: number, b: number, c: number, d: number) => [
  { desc: "vCPU hours, project web", amount: a },
  { desc: "vCPU hours, project api", amount: b },
  { desc: "Object storage", amount: c },
  { desc: "Outbound traffic", amount: d },
];

function inv(
  partial: Partial<InvoiceSpec> &
    Pick<InvoiceSpec, "seller" | "fileName" | "number" | "date" | "lines" | "currency">,
): InvoiceSpec {
  return {
    dateStyle: "long",
    docTitle: "INVOICE",
    documentType: "invoice",
    vatMode: "reverse",
    addressee: ACME,
    channel: "email",
    ...partial,
  };
}

export const INVOICES: InvoiceSpec[] = [
  inv({
    seller: "nimbus",
    fileName: "nimbus-INV-1001.pdf",
    number: "INV-1001",
    date: "2026-10-02",
    lines: [
      { desc: "Managed hosting, 4 vCPU plan", amount: 89 },
      { desc: "Backup storage 500 GB", amount: 20 },
    ],
    currency: "EUR",
  }),
  // DUPLICATE: the same invoice received twice (reminder email with the same PDF).
  inv({
    seller: "nimbus",
    fileName: "nimbus-INV-1001b.pdf",
    number: "INV-1001",
    date: "2026-10-02",
    lines: [
      { desc: "Managed hosting, 4 vCPU plan", amount: 89 },
      { desc: "Backup storage 500 GB", amount: 20 },
    ],
    currency: "EUR",
  }),
  inv({
    seller: "orbit",
    fileName: "orbit-2026-10.pdf",
    number: "OA-2026-10-0042",
    date: "2026-10-01",
    dateStyle: "iso",
    lines: [{ desc: "Team plan, 2 seats, monthly", amount: 90 }],
    currency: "EUR",
    channel: "billing_api",
  }),
  inv({
    seller: "glyph",
    fileName: "glyph-R-88.pdf",
    number: "R-88",
    date: "2026-10-05",
    lines: [{ desc: "Glyph Pro seat, monthly", amount: 24 }],
    currency: "EUR",
    channel: "browser",
  }),
  inv({
    seller: "vesper",
    fileName: "vesper-VC-26-1041.pdf",
    number: "VC-26-1041",
    date: "2026-10-06",
    dateStyle: "iso",
    lines: VESPER_LINES(18.4, 12.9, 6.0, 4.0),
    currency: "EUR",
  }),
  inv({
    seller: "vesper",
    fileName: "vesper-VC-26-1042.pdf",
    number: "VC-26-1042",
    date: "2026-10-13",
    dateStyle: "iso",
    lines: VESPER_LINES(16.2, 11.55, 6.0, 5.0),
    currency: "EUR",
  }),
  inv({
    seller: "vesper",
    fileName: "vesper-VC-26-1043.pdf",
    number: "VC-26-1043",
    date: "2026-10-20",
    dateStyle: "iso",
    lines: VESPER_LINES(24.1, 16.0, 6.0, 6.0),
    currency: "EUR",
  }),
  inv({
    seller: "vesper",
    fileName: "vesper-VC-26-1044.pdf",
    number: "VC-26-1044",
    date: "2026-10-27",
    dateStyle: "iso",
    lines: VESPER_LINES(20.3, 14.6, 6.0, 4.0),
    currency: "EUR",
  }),
  // WRONG_MONTH: issued on the last day of the previous month.
  inv({
    seller: "vesper",
    fileName: "vesper-VC-26-1037.pdf",
    number: "VC-26-1037",
    date: "2026-09-30",
    dateStyle: "iso",
    lines: VESPER_LINES(22.0, 13.2, 6.0, 6.0),
    currency: "EUR",
  }),
  inv({
    seller: "quill",
    fileName: "quill-QD-784512.pdf",
    number: "QD-784512",
    date: "2026-10-03",
    dateStyle: "us",
    lines: [{ desc: "Team plan, 3 seats", amount: 42 }],
    currency: "USD",
    vatMode: "zero",
    channel: "billing_api",
  }),
  inv({
    seller: "alpenrose",
    fileName: "alpenrose-AR-2026-0317.pdf",
    number: "AR-2026-0317",
    date: "2026-10-08",
    lines: [{ desc: "Annual security suite licence", amount: 480 }],
    currency: "CHF",
    vatMode: "zero",
  }),
  // UNREADABLE_FIELD: a receipt that prints no invoice number.
  inv({
    seller: "tandoor",
    fileName: "tandoor-receipt-2026-10-09.pdf",
    number: null,
    date: "2026-10-09",
    dateStyle: "us",
    docTitle: "PAYMENT RECEIPT",
    documentType: "receipt",
    lines: [{ desc: "Monthly subscription", amount: 29 }],
    currency: "USD",
    vatMode: "none",
  }),
  // ADDRESSED_TO_PERSON: the account was opened with a partner's personal details.
  inv({
    seller: "cobalt",
    fileName: "cobalt-CCI-55021.pdf",
    number: "CCI-55021",
    date: "2026-10-12",
    dateStyle: "iso",
    lines: [{ desc: "Build minutes, 5000 pack", amount: 75 }],
    currency: "USD",
    vatMode: "none",
    addressee: {
      name: "Matteo Valdrighi",
      vatId: null,
      address: "Via Campione 3, 10100 Torino, Italy",
    },
    channel: "browser",
  }),
  // FOREIGN_VAT_CHARGED: 19% VAT instead of reverse charge.
  inv({
    seller: "lumen",
    fileName: "lumen-LT-20266.pdf",
    number: "LT-20266",
    date: "2026-10-14",
    lines: [{ desc: "Translation memory subscription", amount: 80 }],
    currency: "EUR",
    vatMode: "rate",
    vatRate: 0.19,
  }),
  // NOT_FOREIGN: an Italian supplier that ended up in the foreign folder.
  inv({
    seller: "rivolta",
    fileName: "rivolta-FT-118.pdf",
    number: "FT-118",
    date: "2026-10-10",
    dateStyle: "iso",
    docTitle: "FATTURA",
    lines: [{ desc: "Dominio e posta, canone mensile", amount: 50 }],
    currency: "EUR",
    vatMode: "zero",
  }),
  // Unknown supplier 1: its billing facts can be found on its public page.
  inv({
    seller: "helix",
    fileName: "helix-HX-90017.pdf",
    number: "HX-90017",
    date: "2026-10-15",
    lines: [{ desc: "Pro plan, monthly", amount: 59 }],
    currency: "EUR",
    vatMode: "none",
  }),
  // Unknown supplier 2: nothing on the invoice or its page settles the VAT treatment.
  inv({
    seller: "sable",
    fileName: "sable-ST-3302.pdf",
    number: "ST-3302",
    date: "2026-10-16",
    dateStyle: "us",
    lines: [{ desc: "Workspace licence", amount: 36 }],
    currency: "USD",
    vatMode: "none",
  }),
  // OUT_OF_KNOWN_RULES: a private individual outside the EU, no tax identifier.
  inv({
    seller: "elowen",
    fileName: "elowen-EL-007.pdf",
    number: "EL-007",
    date: "2026-10-20",
    docTitle: "INVOICE",
    lines: [{ desc: "Illustration work, logo set", amount: 150 }],
    currency: "GBP",
    vatMode: "none",
  }),
];

export const EXPECTED: { fileName: string | null; code: ExceptionCode; supplierId?: string }[] = [
  { fileName: "lumen-LT-20266.pdf", code: "FOREIGN_VAT_CHARGED" },
  { fileName: "cobalt-CCI-55021.pdf", code: "ADDRESSED_TO_PERSON" },
  { fileName: "vesper-VC-26-1037.pdf", code: "WRONG_MONTH" },
  { fileName: "rivolta-FT-118.pdf", code: "NOT_FOREIGN" },
  { fileName: "nimbus-INV-1001b.pdf", code: "DUPLICATE" },
  { fileName: "tandoor-receipt-2026-10-09.pdf", code: "UNREADABLE_FIELD" },
  { fileName: null, code: "MISSING_EXPECTED_INVOICE", supplierId: "marlow" },
  { fileName: "elowen-EL-007.pdf", code: "OUT_OF_KNOWN_RULES" },
  { fileName: "sable-ST-3302.pdf", code: "SUPPLIER_FACTS_UNKNOWN" },
];

/** Registry before the run: every seller except the two unknown suppliers. */
const EXPECTED_PER_MONTH: Record<string, number> = {
  nimbus: 1,
  orbit: 1,
  glyph: 1,
  vesper: 5,
  quill: 1,
  tandoor: 1,
  cobalt: 1,
  marlow: 1,
};
const UNKNOWN_SUPPLIERS = new Set(["helix", "sable"]);

// ---------------------------------------------------------------- helpers

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (currency: string, n: number) => `${currency} ${n.toFixed(2)}`;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(iso: string, style: InvoiceSpec["dateStyle"]): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (style === "iso") return iso;
  if (style === "us") return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

const LABELS = {
  en: {
    number: "Invoice no.",
    date: "Invoice date",
    billTo: "Bill to",
    subtotal: "Subtotal",
    total: "Total due",
    description: "Description",
    amount: "Amount",
    vat: "VAT",
    tax: "Sales tax",
  },
  it: {
    number: "Fattura n.",
    date: "Data fattura",
    billTo: "Intestatario",
    subtotal: "Imponibile",
    total: "Totale da pagare",
    description: "Descrizione",
    amount: "Importo",
    vat: "Importo IVA",
    tax: "Imposta",
  },
};

interface Fields {
  name: string;
  addr: string[];
  countryLine: string;
  taxLine: string | null;
  numberLine: string | null;
  dateLine: string;
  title: string;
  toName: string;
  toVatLine: string | null;
  toAddr: string;
  billTo: string;
  lines: { desc: string; amountText: string }[];
  subtotalLine: string;
  vatLine: string | null;
  totalLine: string;
  net: number;
  vat: number | null;
  total: number;
  L: (typeof LABELS)["en"];
}

function buildFields(seller: SellerSpec, spec: InvoiceSpec): Fields {
  const L = LABELS[seller.lang];
  const net = round2(spec.lines.reduce((s, l) => s + l.amount, 0));
  let vat: number | null;
  let vatLine: string | null;
  switch (spec.vatMode) {
    case "reverse":
      vat = 0;
      vatLine = `VAT 0% (reverse charge): ${money(spec.currency, 0)}`;
      break;
    case "rate":
      vat = round2(net * (spec.vatRate ?? 0));
      vatLine = `${L.vat} ${Math.round((spec.vatRate ?? 0) * 100)}%: ${money(spec.currency, vat)}`;
      break;
    case "zero":
      vat = 0;
      vatLine = `${seller.lang === "it" ? L.vat : L.tax}: ${money(spec.currency, 0)}`;
      break;
    default:
      vat = null;
      vatLine = null;
  }
  const total = round2(net + (vat ?? 0));
  return {
    name: seller.name,
    addr: [seller.street, `${seller.postalCity}, ${seller.countryName}`],
    countryLine: `${seller.postalCity}, ${seller.countryName}`,
    taxLine: seller.taxId && seller.printTaxId ? `${seller.taxLabel}: ${seller.taxId}` : null,
    numberLine: spec.number ? `${L.number}: ${spec.number}` : null,
    dateLine: `${L.date}: ${formatDate(spec.date, spec.dateStyle)}`,
    title: spec.docTitle,
    toName: spec.addressee.name,
    toVatLine: spec.addressee.vatId ? `VAT: ${spec.addressee.vatId}` : null,
    toAddr: spec.addressee.address,
    billTo: L.billTo,
    lines: spec.lines.map((l) => ({ desc: l.desc, amountText: money(spec.currency, l.amount) })),
    subtotalLine: `${L.subtotal}: ${money(spec.currency, net)}`,
    vatLine,
    totalLine: `${L.total}: ${money(spec.currency, total)}`,
    net,
    vat,
    total,
    L,
  };
}

type FieldKey =
  | "supplierName"
  | "supplierCountry"
  | "supplierTaxId"
  | "invoiceNumber"
  | "invoiceDate"
  | "documentType"
  | "totalAmount"
  | "vatAmount"
  | "addresseeName"
  | "addresseeVatId";

/** Draws text and remembers the verbatim quote and page of tracked fields. */
class Recorder {
  page = 1;
  quotes = new Map<FieldKey, { quote: string; page: number }>();
  constructor(public doc: PDFKit.PDFDocument) {}

  text(
    key: FieldKey | null,
    str: string,
    x: number,
    y: number,
    o: {
      size?: number;
      font?: string;
      color?: string;
      width?: number;
      align?: "left" | "right" | "center";
    } = {},
  ) {
    this.doc
      .font(o.font ?? "Helvetica")
      .fontSize(o.size ?? 10)
      .fillColor(o.color ?? "#111111")
      .text(str, x, y, { width: o.width ?? 500, align: o.align ?? "left", lineBreak: false });
    if (key) this.quotes.set(key, { quote: str, page: this.page });
  }

  newPage() {
    this.doc.addPage();
    this.page += 1;
  }
}

// ---------------------------------------------------------------- layouts

function classic(r: Recorder, s: SellerSpec, f: Fields) {
  r.text("supplierName", f.name, 50, 50, { size: 20, font: "Helvetica-Bold", color: s.accent });
  r.text(null, f.addr[0], 50, 78);
  r.text("supplierCountry", f.countryLine, 50, 92);
  if (f.taxLine) r.text("supplierTaxId", f.taxLine, 50, 106);
  r.text("documentType", f.title, 345, 50, {
    size: 26,
    font: "Helvetica-Bold",
    width: 200,
    align: "right",
  });
  if (f.numberLine) r.text("invoiceNumber", f.numberLine, 345, 90, { width: 200, align: "right" });
  r.text("invoiceDate", f.dateLine, 345, 106, { width: 200, align: "right" });
  r.text(null, f.billTo, 50, 160, { font: "Helvetica-Bold", color: s.accent });
  r.text("addresseeName", f.toName, 50, 176);
  r.text(null, f.toAddr, 50, 190);
  if (f.toVatLine) r.text("addresseeVatId", f.toVatLine, 50, 204);
  r.doc.moveTo(50, 250).lineTo(545, 250).strokeColor(s.accent).stroke();
  r.text(null, f.L.description, 50, 258, { font: "Helvetica-Bold" });
  r.text(null, f.L.amount, 345, 258, { font: "Helvetica-Bold", width: 200, align: "right" });
  r.doc.moveTo(50, 274).lineTo(545, 274).stroke();
  let y = 284;
  for (const l of f.lines) {
    r.text(null, l.desc, 50, y);
    r.text(null, l.amountText, 345, y, { width: 200, align: "right" });
    y += 18;
  }
  r.doc
    .moveTo(50, y + 6)
    .lineTo(545, y + 6)
    .strokeColor("#999999")
    .stroke();
  y += 18;
  r.text(null, f.subtotalLine, 300, y, { width: 245, align: "right" });
  if (f.vatLine) r.text("vatAmount", f.vatLine, 300, y + 16, { width: 245, align: "right" });
  r.text("totalAmount", f.totalLine, 300, y + 40, {
    size: 13,
    font: "Helvetica-Bold",
    width: 245,
    align: "right",
  });
  r.text(null, "Payment received by card. Thank you for your business.", 50, 760, {
    size: 8,
    color: "#666666",
  });
}

function modern(r: Recorder, s: SellerSpec, f: Fields) {
  r.doc.rect(0, 0, 595, 110).fill(s.accent);
  r.text("supplierName", f.name, 40, 36, { size: 22, font: "Helvetica-Bold", color: "#ffffff" });
  r.text("documentType", f.title, 40, 70, { size: 11, color: "#ffffff" });
  // Left meta column
  r.text(null, "ISSUED BY", 40, 140, { size: 8, color: "#888888" });
  r.text(null, f.addr[0], 40, 154);
  r.text("supplierCountry", f.countryLine, 40, 168);
  if (f.taxLine) r.text("supplierTaxId", f.taxLine, 40, 182);
  r.text(null, "BILLED TO", 40, 220, { size: 8, color: "#888888" });
  r.text("addresseeName", f.toName, 40, 234, { font: "Helvetica-Bold" });
  r.text(null, f.toAddr, 40, 248);
  if (f.toVatLine) r.text("addresseeVatId", f.toVatLine, 40, 262);
  if (f.numberLine) r.text("invoiceNumber", f.numberLine, 330, 154, { width: 225, align: "right" });
  r.text("invoiceDate", f.dateLine, 330, 170, { width: 225, align: "right" });
  let y = 320;
  for (const l of f.lines) {
    r.doc.roundedRect(40, y, 515, 36, 4).strokeColor("#dddddd").stroke();
    r.text(null, l.desc, 54, y + 12);
    r.text(null, l.amountText, 330, y + 12, { width: 210, align: "right" });
    y += 46;
  }
  r.doc.roundedRect(300, y + 10, 255, f.vatLine ? 84 : 60, 6).fill("#f3f4f6");
  r.text(null, f.subtotalLine, 312, y + 22, { width: 231, align: "right", color: "#333333" });
  if (f.vatLine)
    r.text("vatAmount", f.vatLine, 312, y + 40, { width: 231, align: "right", color: "#333333" });
  r.text("totalAmount", f.totalLine, 312, y + (f.vatLine ? 62 : 44), {
    size: 13,
    font: "Helvetica-Bold",
    width: 231,
    align: "right",
    color: s.accent,
  });
}

function mono(r: Recorder, s: SellerSpec, f: Fields) {
  const M = "Courier";
  r.text("supplierName", f.name, 50, 50, { font: "Courier-Bold", size: 13 });
  r.text(null, f.addr[0], 50, 68, { font: M });
  r.text("supplierCountry", f.countryLine, 50, 80, { font: M });
  if (f.taxLine) r.text("supplierTaxId", f.taxLine, 50, 92, { font: M });
  r.text(null, "-".repeat(60), 50, 112, { font: M });
  r.text("documentType", `${f.title} (${s.id.toUpperCase()})`.replace(/ \(.*\)/, ""), 50, 126, {
    font: "Courier-Bold",
    size: 12,
  });
  if (f.numberLine) r.text("invoiceNumber", f.numberLine, 50, 146, { font: M });
  r.text("invoiceDate", f.dateLine, 50, 158, { font: M });
  r.text(null, "-".repeat(60), 50, 178, { font: M });
  r.text(null, f.billTo.toUpperCase(), 50, 192, { font: "Courier-Bold" });
  r.text("addresseeName", f.toName, 50, 206, { font: M });
  r.text(null, f.toAddr, 50, 218, { font: M });
  if (f.toVatLine) r.text("addresseeVatId", f.toVatLine, 50, 230, { font: M });
  r.text(null, "-".repeat(60), 50, 252, { font: M });
  let y = 266;
  for (const l of f.lines) {
    r.text(null, `${l.desc.padEnd(34)}${l.amountText.padStart(18)}`, 50, y, { font: M });
    y += 14;
  }
  r.text(null, "-".repeat(60), 50, y + 6, { font: M });
  if (f.vatLine) r.text("vatAmount", f.vatLine, 50, y + 22, { font: M });
  r.text("totalAmount", f.totalLine, 50, y + (f.vatLine ? 38 : 22), {
    font: "Courier-Bold",
    size: 12,
  });
}

function receipt(r: Recorder, s: SellerSpec, f: Fields) {
  const W = 260;
  const x = 20;
  const c = { width: W, align: "center" as const };
  r.text("supplierName", f.name, x, 24, {
    ...c,
    size: 13,
    font: "Helvetica-Bold",
    color: s.accent,
  });
  r.text(null, f.addr[0], x, 44, { ...c, size: 8 });
  r.text("supplierCountry", f.countryLine, x, 55, { ...c, size: 8 });
  if (f.taxLine) r.text("supplierTaxId", f.taxLine, x, 66, { ...c, size: 8 });
  r.text("documentType", f.title, x, 92, { ...c, size: 12, font: "Helvetica-Bold" });
  if (f.numberLine) r.text("invoiceNumber", f.numberLine, x, 112, { ...c, size: 9 });
  r.text("invoiceDate", f.dateLine, x, 124, { ...c, size: 9 });
  r.text(null, "Customer", x, 150, { size: 8, color: "#777777" });
  r.text("addresseeName", f.toName, x, 161, { size: 9 });
  r.text(null, f.toAddr, x, 173, { size: 8 });
  if (f.toVatLine) r.text("addresseeVatId", f.toVatLine, x, 184, { size: 8 });
  let y = 214;
  for (const l of f.lines) {
    r.text(null, l.desc, x, y, { size: 9, width: 150 });
    r.text(null, l.amountText, x + 130, y, { size: 9, width: 130, align: "right" });
    y += 14;
  }
  r.doc
    .moveTo(x, y + 4)
    .lineTo(x + W, y + 4)
    .dash(2, { space: 2 })
    .strokeColor("#888888")
    .stroke()
    .undash();
  if (f.vatLine) r.text("vatAmount", f.vatLine, x, y + 14, { size: 8, width: W, align: "right" });
  r.text("totalAmount", f.totalLine, x, y + (f.vatLine ? 30 : 16), {
    size: 10,
    font: "Helvetica-Bold",
    width: W,
    align: "right",
  });
  r.text(null, "Paid by card. No refunds.", x, y + 70, { ...c, size: 7, color: "#777777" });
}

function statement(r: Recorder, s: SellerSpec, f: Fields) {
  r.text("supplierName", f.name, 50, 46, { size: 18, font: "Helvetica-Bold", color: s.accent });
  r.text(null, f.addr[0], 50, 70);
  r.text("supplierCountry", f.countryLine, 50, 83);
  r.text("documentType", "Usage statement and invoice", 50, 120, {
    size: 12,
    font: "Helvetica-Bold",
  });
  if (f.numberLine) r.text("invoiceNumber", f.numberLine, 50, 140);
  r.text("invoiceDate", f.dateLine, 50, 153);
  r.text(null, f.billTo, 340, 120, { font: "Helvetica-Bold" });
  r.text("addresseeName", f.toName, 340, 134);
  r.text(null, f.toAddr, 340, 147);
  if (f.toVatLine) r.text("addresseeVatId", f.toVatLine, 340, 160);
  r.doc.rect(50, 200, 495, 20).fill(s.accent);
  r.text(null, "Service", 58, 206, { color: "#ffffff", font: "Helvetica-Bold" });
  r.text(null, f.L.amount, 340, 206, {
    color: "#ffffff",
    font: "Helvetica-Bold",
    width: 195,
    align: "right",
  });
  let y = 230;
  for (const l of f.lines) {
    r.text(null, l.desc, 58, y);
    r.text(null, l.amountText, 340, y, { width: 195, align: "right" });
    y += 20;
  }
  r.text(null, "Totals and tax details continue on page 2.", 50, 760, {
    size: 8,
    color: "#666666",
  });
  r.newPage();
  r.text(null, "Summary", 50, 50, { size: 14, font: "Helvetica-Bold", color: s.accent });
  r.text(null, f.subtotalLine, 50, 90);
  if (f.vatLine) r.text("vatAmount", f.vatLine, 50, 108);
  r.text("totalAmount", f.totalLine, 50, 134, { size: 13, font: "Helvetica-Bold" });
  if (f.taxLine) r.text("supplierTaxId", f.taxLine, 50, 180);
  r.text(null, "Services are supplied to the business customer named on page 1.", 50, 200, {
    size: 9,
    color: "#555555",
  });
}

const LAYOUTS: Record<Layout, (r: Recorder, s: SellerSpec, f: Fields) => void> = {
  classic,
  modern,
  mono,
  receipt,
  statement,
};

// ---------------------------------------------------------------- build

function sourced<T>(value: T | null, q: { quote: string; page: number } | undefined): Sourced<T> {
  if (value === null || !q) return { value: null, quote: null, page: null };
  return { value, quote: q.quote, page: q.page };
}

async function renderInvoice(spec: InvoiceSpec): Promise<{ pdf: Buffer; truth: ExtractedInvoice }> {
  const seller = SELLERS.find((s) => s.id === spec.seller);
  if (!seller) throw new Error(`Unknown seller ${spec.seller}`);
  const f = buildFields(seller, spec);
  const size: [number, number] | "A4" = seller.layout === "receipt" ? [300, 460] : "A4";
  const doc = new PDFDocument({
    size,
    margin: 0,
    info: {
      Title: spec.fileName,
      Author: seller.name,
      Producer: "Probata demo generator",
      CreationDate: FIXED_DATE,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const rec = new Recorder(doc);
  LAYOUTS[seller.layout](rec, seller, f);
  doc.end();
  await done;

  const q = rec.quotes;
  const truth: ExtractedInvoice = {
    supplierName: sourced(seller.name, q.get("supplierName")),
    supplierCountry: sourced(seller.countryCode, q.get("supplierCountry")),
    supplierTaxId: sourced(seller.printTaxId ? seller.taxId : null, q.get("supplierTaxId")),
    invoiceNumber: sourced(spec.number, q.get("invoiceNumber")),
    invoiceDate: sourced(spec.date, q.get("invoiceDate")),
    documentType: sourced(spec.documentType, q.get("documentType")),
    totalAmount: sourced(f.total, q.get("totalAmount")),
    vatAmount: sourced(f.vat, q.get("vatAmount")),
    currency: sourced(spec.currency, q.get("totalAmount")),
    addresseeName: sourced(spec.addressee.name, q.get("addresseeName")),
    addresseeVatId: sourced(spec.addressee.vatId, q.get("addresseeVatId")),
  };
  return { pdf: Buffer.concat(chunks), truth };
}

function buildEml(
  n: number,
  seller: SellerSpec,
  attachments: { fileName: string; pdf: Buffer }[],
): string {
  const boundary = `----=_probata_demo_${n}`;
  const day = String(Math.min(28, 1 + n)).padStart(2, "0");
  const lines = [
    `Message-ID: <inbox-${n}@mail.acme-studio.example>`,
    `Date: Tue, ${Number(day)} Oct 2026 09:${String(10 + n).padStart(2, "0")}:00 +0200`,
    `From: ${seller.name} Billing <${seller.email}>`,
    `To: Acme Studio SRL <amministrazione@acme-studio.example>`,
    `Subject: Your invoice from ${seller.name}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    `Hello, please find attached your invoice from ${seller.name}.`,
    "This is a synthetic demo email.",
    "",
  ];
  for (const a of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${a.fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.fileName}"`,
      "",
      ...(a.pdf.toString("base64").match(/.{1,76}/g) ?? []),
      "",
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

function billingInfo() {
  const channelFor = (id: string): Channel => {
    const i = INVOICES.find((x) => x.seller === id);
    return i?.channel ?? "email";
  };
  const info: Record<string, unknown> = {};
  for (const s of SELLERS) {
    const base = {
      displayName: s.name,
      legalEntity: s.name,
      countryCode: s.countryCode,
      countryName: s.countryName,
      taxId: s.taxId,
      taxLabel: s.taxLabel,
      reverseCharge: s.countryCode === "IT" ? false : true,
      companyAddressee: s.id === "elowen" ? false : true,
      currency: INVOICES.find((x) => x.seller === s.id)?.currency ?? "EUR",
      channel: channelFor(s.id),
    };
    if (s.id === "helix") {
      info[s.id] = {
        ...base,
        taxId: s.taxId,
        reverseCharge: true,
        companyAddressee: true,
        currency: "EUR",
        channel: "email",
      };
    } else if (s.id === "sable") {
      // Facts that the page does not state: tax id and VAT treatment (null = omitted from the page).
      info[s.id] = {
        ...base,
        taxId: null,
        reverseCharge: null,
        companyAddressee: true,
        currency: "USD",
        channel: "email",
      };
    } else {
      info[s.id] = base;
    }
  }
  return info;
}

export async function generate(outRoot = path.join(process.cwd(), "demo")): Promise<void> {
  const dir = path.join(outRoot, MONTH);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const sub of ["pdf", "truth", "inbox", "mock"])
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const write = (rel: string, content: string | Buffer) =>
    fs.writeFileSync(path.join(dir, rel), content);
  const json = (rel: string, value: unknown) => write(rel, JSON.stringify(value, null, 2) + "\n");

  const rendered = new Map<string, { pdf: Buffer; truth: ExtractedInvoice; spec: InvoiceSpec }>();
  for (const spec of INVOICES) {
    const r = await renderInvoice(spec);
    rendered.set(spec.fileName, { ...r, spec });
    write(`pdf/${spec.fileName}`, r.pdf);
    json(`truth/${spec.fileName.replace(/\.pdf$/, "")}.json`, r.truth);
  }
  // The duplicate is the very same document: share the original bytes.
  const original = rendered.get("nimbus-INV-1001.pdf")!;
  write("pdf/nimbus-INV-1001b.pdf", original.pdf);

  json("company.json", COMPANY);

  const suppliers: Supplier[] = SELLERS.filter((s) => !UNKNOWN_SUPPLIERS.has(s.id)).map((s) => ({
    id: s.id,
    name: s.name,
    country: s.countryCode,
    taxId: s.taxId,
    expectedPerMonth: EXPECTED_PER_MONTH[s.id] ?? 0,
    status: "approved",
  }));
  json("suppliers.json", suppliers);

  // Card charges: one per distinct purchase, in the invoice currency; Marlow has none invoiced.
  const charges: CardCharge[] = [];
  const chargeDate = (iso: string) => (iso.startsWith(MONTH) ? iso : `${MONTH}-01`);
  for (const spec of INVOICES) {
    if (spec.fileName === "nimbus-INV-1001b.pdf") continue;
    const seller = SELLERS.find((s) => s.id === spec.seller)!;
    const r = rendered.get(spec.fileName)!;
    const city =
      seller.postalCity
        .replace(/[^A-Za-z ]/g, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2)[0] ?? "";
    charges.push({
      id: "",
      date: chargeDate(spec.date),
      description: `${seller.name.split(" ").slice(0, 2).join(" ").toUpperCase()} ${city.toUpperCase()} ${seller.countryCode}`,
      amount: r.truth.totalAmount.value ?? 0,
      currency: spec.currency,
    });
  }
  charges.push({
    id: "",
    date: "2026-10-11",
    description: "MARLOW FONTS LONDON GB",
    amount: 29,
    currency: "GBP",
  });
  charges.sort(
    (a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description),
  );
  charges.forEach((c, i) => (c.id = `c${String(i + 1).padStart(3, "0")}`));
  write(
    "charges.csv",
    [
      "id,date,description,amount,currency",
      ...charges.map(
        (c) => `${c.id},${c.date},${c.description},${c.amount.toFixed(2)},${c.currency}`,
      ),
    ].join("\n") + "\n",
  );

  // Sources: who delivers which file.
  const sources: {
    email: string[];
    billing_api: Record<string, string[]>;
    browser: Record<string, string[]>;
  } = {
    email: [],
    billing_api: {},
    browser: {},
  };
  for (const spec of INVOICES) {
    if (spec.channel === "email") sources.email.push(spec.fileName);
    else (sources[spec.channel][spec.seller] ??= []).push(spec.fileName);
  }
  json("sources.json", sources);

  // Inbox: one email per supplier delivery; the Vesper invoices arrive two per message.
  const emailGroups: string[][] = [];
  const vesper = sources.email.filter((f) => f.startsWith("vesper-"));
  for (const f of sources.email) {
    if (f.startsWith("vesper-")) continue;
    emailGroups.push([f]);
  }
  for (let i = 0; i < vesper.length; i += 2) emailGroups.push(vesper.slice(i, i + 2));
  emailGroups.forEach((files, i) => {
    const seller = SELLERS.find((s) => s.id === files[0].split("-")[0])!;
    const atts = files.map((fileName) => ({
      fileName,
      pdf: fs.readFileSync(path.join(dir, "pdf", fileName)),
    }));
    write(`inbox/${i + 1}.eml`, buildEml(i + 1, seller, atts));
  });

  json("expected.json", EXPECTED);
  json("mock/billing-info.json", billingInfo());
  write("README.md", README);
}

const README = `# Demo month 2026-10 (synthetic)

Generated by \`npx tsx scripts/generate-demo-data.ts\`. Everything is invented:
no real company, person, tax id or invoice. Company: Acme Studio SRL.

Supplier id = file name prefix before the first "-". Tax ids are fake.

| File | Planted case |
| --- | --- |
| lumen-LT-20266.pdf | FOREIGN_VAT_CHARGED (19% VAT) |
| cobalt-CCI-55021.pdf | ADDRESSED_TO_PERSON (browser channel) |
| vesper-VC-26-1037.pdf | WRONG_MONTH (dated 2026-09-30) |
| rivolta-FT-118.pdf | NOT_FOREIGN (Italian supplier) |
| nimbus-INV-1001b.pdf | DUPLICATE of nimbus-INV-1001.pdf |
| tandoor-receipt-2026-10-09.pdf | UNREADABLE_FIELD (no invoice number printed) |
| (none) | MISSING_EXPECTED_INVOICE: marlow, recurring, card charge c-MARLOW with no invoice |
| elowen-EL-007.pdf | OUT_OF_KNOWN_RULES (private individual outside the EU, no tax id) |
| helix-HX-90017.pdf | Unknown supplier, researchable: /mock/portal/helix/billing-info states the facts. No exception expected |
| sable-ST-3302.pdf | Unknown supplier, not researchable: the invoice prints an EIN but its page omits tax id and VAT treatment, so the VAT treatment stays unknown. SUPPLIER_FACTS_UNKNOWN |

Vesper issues five invoices in the month (expected: 5). Channels: email for
most, billing API for orbit and quill, browser portal for glyph and cobalt.
\`mock/billing-info.json\` feeds the mock supplier pages.
`;

if (process.argv[1] && /generate-demo-data\.ts$/.test(process.argv[1])) {
  generate().then(() => console.log(`Demo data written to demo/${MONTH}`));
}
