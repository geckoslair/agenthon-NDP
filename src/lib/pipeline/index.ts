// CONTRACT FILE for the signatures; the pipeline stream owns the implementation.
// The UI calls only these functions (plus src/lib/audit.ts) to change state.
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import { logStep, queueOutgoing } from "../audit";
import { getExtractor } from "../extractor";
import { checkCompleteness, findDuplicates, matchSupplier, validateInvoice } from "../rules";
import type {
  CardCharge,
  CompanyProfile,
  ExceptionCode,
  ExtractedInvoice,
  Supplier,
} from "../types";
import type { CollectedDocument, InvoiceSource, SourceKind } from "../sources/types";
import { SOURCE_ORDER } from "../sources/types";
import { createEmailSource } from "../sources/email";
import { createBillingApiSource } from "../sources/billing-api";
import { createBrowserSource } from "../sources/browser";
import { supplierIdFromFileName } from "../sources/fs-util";
import {
  type Fact,
  FACT_LABELS,
  NEGATIVE_FACT_RULES,
  negativeFacts,
  researchSupplier,
  storeFacts,
  supplierRequestEmail,
} from "../research";
import { accountantEmail } from "../package";
import { generateSelfInvoices } from "../compliance";
import { buildPackage, collectedDir, refreshPackage } from "./repackage";
import { EU_COUNTRIES, EXCEPTION_TEXT } from "./messages";
import { parseCharges } from "./charges";

export interface RunSummary {
  runId: number;
  month: string;
  invoices: number;
  exceptions: number;
  /** Outbox rows waiting for a person. */
  pendingApprovals: number;
  /** Sources that could not be reached, and similar non-blocking problems. */
  warnings: string[];
}

/** Optional overrides, used by tests and the CLI. Defaults come from the environment. */
export interface RunOptions {
  demoDir?: string;
  dataDir?: string;
  baseUrl?: string;
  /** Channels to use; defaults to env SOURCES (comma list) or all three. */
  sources?: SourceKind[];
  fetchImpl?: typeof fetch;
  /** Replace a channel adapter (tests); returning null keeps the default one. */
  sourceFactory?: (kind: SourceKind, ctx: SourceContext) => InvoiceSource | null;
}

export interface SourceContext {
  monthDir: string;
  outDir: string;
  baseUrl: string;
  supplierIds: string[];
  isMissing: (fileName: string) => boolean;
  fetchImpl?: typeof fetch;
}

const ACTOR = "autopilot";

/** Exception codes the pipeline no longer raises; old rows are ignored everywhere. */
export const RETIRED_EXCEPTION_CODES: readonly string[] = ["MISSING_EXPECTED_INVOICE"];

/**
 * A card charge description ("ORBIT ANALYTICS DUBLIN IE") belongs to a supplier when it
 * contains the supplier id or the first word of its name.
 */
export function chargeMatchesSupplier(description: string, supplier: Supplier): boolean {
  const words = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const first = supplier.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)[0];
  return (
    words.includes(supplier.id.toLowerCase()) ||
    (!!first && first.length > 2 && words.includes(first))
  );
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function enabledSources(value = process.env.SOURCES): SourceKind[] {
  if (!value || value.trim() === "") return [...SOURCE_ORDER];
  const wanted = value.split(",").map((s) => s.trim().toLowerCase());
  return SOURCE_ORDER.filter((s) => wanted.includes(s));
}

function loadSuppliers(db: Db): Supplier[] {
  const rows = db
    .prepare("SELECT id, name, country, tax_id, expected_per_month, status FROM suppliers")
    .all() as {
    id: string;
    name: string;
    country: string | null;
    tax_id: string | null;
    expected_per_month: number;
    status: Supplier["status"];
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    taxId: r.tax_id,
    expectedPerMonth: r.expected_per_month,
    status: r.status,
  }));
}

function seedSuppliers(db: Db, suppliers: Supplier[], channels: Record<string, string>): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO suppliers (id, name, country, tax_id, expected_per_month, status, invoice_source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const s of suppliers) {
    insert.run(
      s.id,
      s.name,
      s.country ?? null,
      s.taxId ?? null,
      s.expectedPerMonth ?? 0,
      s.status ?? "approved",
      channels[s.id] ?? "email",
    );
  }
}

interface SourcesConfig {
  email?: string[];
  billing_api?: Record<string, string[]>;
  browser?: Record<string, string[]>;
}

function channelMap(config: SourcesConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(config.billing_api ?? {})) out[id] = "billing_api";
  for (const id of Object.keys(config.browser ?? {})) out[id] = "browser";
  return out;
}

function defaultSource(kind: SourceKind, ctx: SourceContext): InvoiceSource {
  switch (kind) {
    case "email":
      return createEmailSource({ inboxDir: path.join(ctx.monthDir, "inbox"), outDir: ctx.outDir });
    case "billing_api":
      return createBillingApiSource({
        baseUrl: ctx.baseUrl,
        supplierIds: ctx.supplierIds,
        outDir: ctx.outDir,
        isMissing: ctx.isMissing,
        fetchImpl: ctx.fetchImpl,
      });
    case "browser":
      return createBrowserSource({
        baseUrl: ctx.baseUrl,
        supplierIds: ctx.supplierIds,
        outDir: ctx.outDir,
        isMissing: ctx.isMissing,
      });
  }
}

interface WorkItem {
  doc: CollectedDocument;
  invoiceId: number;
  extracted: ExtractedInvoice | null;
  supplier: Supplier | null;
  supplierId: string | null;
  codes: Set<ExceptionCode>;
}

/**
 * Runs the whole month: collect from the three sources, extract, match suppliers,
 * research unknown ones, validate, check completeness, build the package and queue it
 * for approval. Idempotent per month: a second call starts a fresh run.
 */
export async function runMonth(
  db: Db,
  month: string,
  options: RunOptions = {},
): Promise<RunSummary> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const demoDir = options.demoDir ?? path.join(process.cwd(), "demo");
  const dataDir = options.dataDir ?? path.join(process.cwd(), "data");
  const baseUrl = options.baseUrl ?? process.env.MOCK_BASE_URL ?? "http://localhost:3000";
  const monthDir = path.join(demoDir, month);
  if (!fs.existsSync(monthDir)) throw new Error(`No demo data for ${month} in ${demoDir}`);

  const runId = Number(
    db.prepare("INSERT INTO runs (month) VALUES (?)").run(month).lastInsertRowid,
  );
  const log = (
    step: string,
    subject: string | null,
    detail: string | null,
    source?: string | null,
  ) => logStep(db, { runId, actor: ACTOR, step, subject, detail, source: source ?? null });
  const warnings: string[] = [];
  const warn = (text: string, source: string) => {
    warnings.push(text);
    log("warning", null, text, source);
  };
  log("run_started", `month:${month}`, `Avvio chiusura di ${month}`, monthDir);

  // Inputs: company, registry, charges.
  const company = readJson<CompanyProfile>(path.join(monthDir, "company.json"));
  // Kept with the run so later checks (manual completion) use the same company profile.
  db.prepare(
    `INSERT INTO settings (key, value, updated_by) VALUES (?, ?, 'autopilot')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(`run_company:${runId}`, JSON.stringify(company));
  const sourcesFile = path.join(monthDir, "sources.json");
  const sourcesConfig: SourcesConfig = fs.existsSync(sourcesFile) ? readJson(sourcesFile) : {};
  const suppliersFile = path.join(monthDir, "suppliers.json");
  const existing = (db.prepare("SELECT COUNT(*) AS n FROM suppliers").get() as { n: number }).n;
  if (existing === 0 && fs.existsSync(suppliersFile)) {
    seedSuppliers(db, readJson<Supplier[]>(suppliersFile), channelMap(sourcesConfig));
    log("registry_seeded", null, "Anagrafica fornitori caricata", suppliersFile);
  }
  let suppliers = loadSuppliers(db);

  const chargesFile = path.join(monthDir, "charges.csv");
  const charges: CardCharge[] = fs.existsSync(chargesFile)
    ? parseCharges(fs.readFileSync(chargesFile, "utf8"))
    : [];
  const insertCharge = db.prepare(
    "INSERT OR REPLACE INTO card_charges (id, run_id, date, description, amount, currency) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const c of charges)
    insertCharge.run(c.id, runId, c.date, c.description, c.amount, c.currency);
  log("charges_loaded", null, `${charges.length} addebiti carta`, chargesFile);

  // 1. Collect, channel by channel; later channels only for files still missing.
  const outDir = collectedDir(dataDir, month, runId);
  const collected = new Map<string, CollectedDocument>();
  const isMissing = (fileName: string) => !collected.has(fileName);
  const kinds = options.sources ?? enabledSources();
  for (const kind of SOURCE_ORDER) {
    if (!kinds.includes(kind)) {
      log("source_skipped", `source:${kind}`, "Canale disattivato (SOURCES)", kind);
      continue;
    }
    const supplierIds =
      kind === "billing_api"
        ? Object.keys(sourcesConfig.billing_api ?? {})
        : kind === "browser"
          ? Object.keys(sourcesConfig.browser ?? {})
          : [];
    const ctx: SourceContext = {
      monthDir,
      outDir,
      baseUrl,
      supplierIds,
      isMissing,
      fetchImpl: options.fetchImpl,
    };
    try {
      const source = options.sourceFactory?.(kind, ctx) ?? defaultSource(kind, ctx);
      const docs = await source.collect(month);
      for (const w of (source as { warnings?: string[] }).warnings ?? []) warn(w, kind);
      for (const doc of docs) {
        if (collected.has(doc.fileName)) continue;
        collected.set(doc.fileName, doc);
        log("document_collected", `file:${doc.fileName}`, `Raccolto via ${kind}`, doc.origin);
      }
    } catch (error) {
      warn(`Canale ${kind} non disponibile: ${(error as Error).message}`, kind);
    }
  }

  // 2. Extract, store, match.
  const extractor = getExtractor(path.join(monthDir, "truth"));
  const insertInvoice = db.prepare(
    "INSERT INTO invoices (run_id, file_name, supplier_id, extracted, status, source, origin) VALUES (?, ?, ?, ?, 'ok', ?, ?)",
  );
  const items: WorkItem[] = [];
  const supplierIdFor = (doc: CollectedDocument) =>
    doc.supplierId ?? supplierIdFromFileName(doc.fileName);
  // Collection order is kept: the first copy of a duplicate is the original.
  for (const doc of collected.values()) {
    let extracted: ExtractedInvoice | null = null;
    try {
      extracted = await extractor.extract(doc);
      log(
        "extracted",
        `file:${doc.fileName}`,
        "Dati estratti con la citazione di ogni valore",
        doc.path,
      );
    } catch (error) {
      log("extraction_failed", `file:${doc.fileName}`, (error as Error).message, doc.path);
    }
    const name = extracted?.supplierName.value ?? null;
    let supplier = name ? matchSupplier(name, suppliers) : null;
    if (!supplier) {
      const byId = supplierIdFor(doc);
      supplier = suppliers.find((s) => s.id === byId) ?? null;
    }
    const supplierId = supplier?.id ?? null;
    const invoiceId = Number(
      insertInvoice.run(
        runId,
        doc.fileName,
        supplierId,
        JSON.stringify(extracted ?? {}),
        doc.source,
        doc.origin,
      ).lastInsertRowid,
    );
    log(
      supplier ? "supplier_matched" : "supplier_unknown",
      `invoice:${invoiceId}`,
      supplier
        ? `Fornitore in anagrafica: ${supplier.name}`
        : `Fornitore non in anagrafica: ${name ?? "?"}`,
      doc.origin,
    );
    items.push({ doc, invoiceId, extracted, supplier, supplierId, codes: new Set() });
  }

  // Exceptions.
  const insertException = db.prepare(
    `INSERT INTO exceptions (run_id, invoice_id, supplier_id, code, message, evidence, proposed_action)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const raise = (
    code: ExceptionCode,
    invoice: WorkItem | null,
    supplierId: string | null,
    evidence: string | null,
    extraMessage?: string,
    action?: string,
  ) => {
    if (invoice) {
      if (invoice.codes.has(code)) return;
      invoice.codes.add(code);
    }
    const text = EXCEPTION_TEXT[code];
    const message = extraMessage ? `${text.message} ${extraMessage}` : text.message;
    const id = Number(
      insertException.run(
        runId,
        invoice?.invoiceId ?? null,
        supplierId,
        code,
        message,
        evidence,
        action ?? text.action,
      ).lastInsertRowid,
    );
    log(
      "exception_raised",
      invoice ? `invoice:${invoice.invoiceId}` : supplierId ? `supplier:${supplierId}` : null,
      `${code} (exception:${id}): ${message}${evidence ? ` | evidenza: ${evidence}` : ""}`,
      invoice?.doc.origin ?? null,
    );
  };

  // 3. Validate each invoice with the deterministic rules.
  for (const item of items) {
    if (!item.extracted) {
      raise("UNREADABLE_FIELD", item, item.supplierId, null, "Estrazione non riuscita.");
      continue;
    }
    const found = validateInvoice(item.extracted, company, month);
    const unreadable = found.filter((e) => e.code === "UNREADABLE_FIELD");
    if (unreadable.length > 0) {
      const fields = unreadable.map((e) => /"(\w+)"/.exec(e.message)?.[1] ?? "?").join(", ");
      raise("UNREADABLE_FIELD", item, item.supplierId, `Campi non letti: ${fields}`);
    }
    for (const e of found)
      if (e.code !== "UNREADABLE_FIELD") raise(e.code, item, item.supplierId, e.evidence);

    // A private individual outside the EU is outside the rules we know: a registry
    // supplier with no tax identifier anywhere. Unknown suppliers go to research instead.
    const country = item.extracted.supplierCountry.value?.toUpperCase() ?? null;
    if (
      item.supplier !== null &&
      item.supplier.status === "approved" &&
      !item.supplier.taxId &&
      item.extracted.supplierTaxId.value === null &&
      country !== null &&
      !EU_COUNTRIES.has(country)
    ) {
      raise(
        "OUT_OF_KNOWN_RULES",
        item,
        item.supplierId,
        `Nessun identificativo fiscale; paese ${item.extracted.supplierCountry.quote ?? country}`,
      );
    }
  }

  const extractedList = items.map((i) => i.extracted);
  const readable = items.filter((i) => i.extracted !== null);
  for (const index of findDuplicates(readable.map((i) => i.extracted as ExtractedInvoice))) {
    const item = readable[index];
    const inv = item.extracted as ExtractedInvoice;
    raise(
      "DUPLICATE",
      item,
      item.supplierId,
      `${inv.supplierName.value} n. ${inv.invoiceNumber.value}, ${inv.totalAmount.value} ${inv.currency.value ?? ""}`.trim(),
    );
  }
  void extractedList;

  // 4. Unknown suppliers: research, never stop the run.
  const researched = new Set<string>();
  /** Known facts that say the supplier does not fit, per supplier id. */
  const negatives = new Map<string, Fact[]>();
  for (const item of items) {
    if (item.supplier && item.supplier.status === "approved") continue;
    if (!item.extracted) continue;
    if (
      item.codes.has("OUT_OF_KNOWN_RULES") ||
      item.codes.has("NOT_FOREIGN") ||
      item.codes.has("DUPLICATE")
    )
      continue;
    const id = item.supplier?.id ?? supplierIdFor(item.doc);
    if (!id || researched.has(id)) continue;
    researched.add(id);
    const name = item.extracted.supplierName.value ?? id;
    db.prepare(
      `INSERT OR IGNORE INTO suppliers (id, name, country, tax_id, expected_per_month, status, invoice_source)
       VALUES (?, ?, ?, ?, 0, 'unknown', ?)`,
    ).run(
      id,
      name,
      item.extracted.supplierCountry.value,
      item.extracted.supplierTaxId.value,
      item.doc.source,
    );
    item.supplierId = id;
    db.prepare("UPDATE invoices SET supplier_id = ? WHERE id = ?").run(id, item.invoiceId);
    log(
      "research_started",
      `supplier:${id}`,
      `Ricerca dati di fatturazione di ${name}`,
      item.doc.origin,
    );

    const result = await researchSupplier({
      supplierId: id,
      invoice: item.extracted,
      fileName: item.doc.fileName,
      baseUrl,
      fetchImpl: options.fetchImpl,
    });
    if (result.pageError) {
      warn(
        `Pagina pubblica di ${name} non leggibile (${result.pageUrl}): ${result.pageError}`,
        result.pageUrl,
      );
    }
    storeFacts(db, id, result.facts);
    // Registry fields follow the sourced facts, never a guess.
    const factValue = (name: string) => result.facts.find((f) => f.fact === name)?.value ?? null;
    db.prepare(
      "UPDATE suppliers SET name = COALESCE(?, name), country = COALESCE(?, country), tax_id = COALESCE(?, tax_id) WHERE id = ? AND status = 'unknown'",
    ).run(factValue("legal_entity"), factValue("country"), factValue("tax_id"), id);
    for (const f of result.facts) {
      log("research_fact", `supplier:${id}`, `${f.fact} = ${f.value} | "${f.quote}"`, f.sourceUrl);
    }
    if (result.missing.length > 0) {
      const labels = result.missing.map((f) => FACT_LABELS[f]).join("; ");
      const mail = supplierRequestEmail(name, company.legalName, result.missing);
      queueOutgoing(db, {
        runId,
        kind: "supplier_request",
        template: "ask_billing_facts",
        recipient: `billing@${id}.example`,
        subject: mail.subject,
        body: mail.body,
      });
      raise(
        "SUPPLIER_FACTS_UNKNOWN",
        item,
        id,
        `Non trovati: ${labels}`,
        `Dati sconosciuti: ${labels}.`,
      );
    }
    const unfit = negativeFacts(result.facts);
    if (unfit.length > 0) {
      negatives.set(id, unfit);
      log(
        "supplier_not_fitting",
        `supplier:${id}`,
        unfit.map((f) => `${f.fact} = ${f.value} | "${f.quote}"`).join("; "),
        result.pageUrl,
      );
    } else if (result.missing.length === 0) {
      log(
        "supplier_proposed",
        `supplier:${id}`,
        `Tutti i dati trovati con fonte: propongo ${name} in anagrafica (stato "unknown", da approvare)`,
        result.pageUrl,
      );
    }
  }

  // A known "no" is a fact, not a gap: it blocks every invoice of that supplier.
  for (const item of items) {
    for (const f of (item.supplierId && negatives.get(item.supplierId)) || []) {
      const rule = NEGATIVE_FACT_RULES[f.fact as keyof typeof NEGATIVE_FACT_RULES];
      raise(
        rule.code,
        item,
        item.supplierId,
        `"${f.quote}" (${f.sourceUrl})`,
        rule.message,
        rule.action,
      );
    }
  }

  // 5. Completeness: recurring suppliers and card charges with no invoice.
  const counted = items.filter((i) => i.extracted && !i.codes.has("DUPLICATE"));
  const registry = loadSuppliers(db).filter((s) => s.status === "approved");
  suppliers = registry;
  const completeness = checkCompleteness(
    counted.map((i) => i.extracted as ExtractedInvoice),
    registry,
    charges,
  );
  // MISSING_EXPECTED_INVOICE is retired: reconciliation is recorded in the log only,
  // it never raises an exception.
  log(
    "completeness_checked",
    `run:${runId}`,
    `Fornitori ricorrenti senza fattura: ${completeness.missingFromSuppliers.length}; addebiti carta senza fattura: ${completeness.unmatchedCharges.length} (solo informativo)`,
    null,
  );

  // Invoice status follows its open exceptions.
  const setStatus = db.prepare("UPDATE invoices SET status = ? WHERE id = ?");
  for (const item of items) setStatus.run(item.codes.size > 0 ? "exception" : "ok", item.invoiceId);

  // 6. Package: valid PDFs only; invoices with open exceptions are listed as pending.
  const pkg = buildPackage(db, runId, month, company.legalName, dataDir);
  const email = pkg;
  const zipPath = pkg.zipPath;
  log(
    "package_built",
    `run:${runId}`,
    `${pkg.total} fatture nello zip, ${pkg.pending} in sospeso`,
    zipPath,
  );
  queueOutgoing(db, {
    runId,
    kind: "package",
    template: null,
    recipient: accountantEmail(),
    subject: email.subject,
    body: email.body,
    attachmentPath: zipPath,
  });

  // Simulated self-invoice drafts for the valid invoices; they wait for a person too.
  try {
    const drafts = generateSelfInvoices(db, runId, dataDir);
    log("self_invoices_drafted", `run:${runId}`, `${drafts} autofatture simulate in bozza`, null);
  } catch (error) {
    warn(`Bozze di autofattura non generate: ${(error as Error).message}`, "compliance");
  }

  db.prepare(
    "UPDATE runs SET status = 'waiting_approval', finished_at = datetime('now') WHERE id = ?",
  ).run(runId);
  const exceptions = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM exceptions WHERE run_id = ? AND status = 'open' AND code <> 'MISSING_EXPECTED_INVOICE'",
      )
      .get(runId) as { n: number }
  ).n;
  const pendingApprovals = (
    db
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE run_id = ? AND status = 'pending'")
      .get(runId) as { n: number }
  ).n;
  log(
    "run_waiting_approval",
    `run:${runId}`,
    `${items.length} documenti, ${exceptions} eccezioni aperte, ${pendingApprovals} email in attesa di approvazione`,
  );
  return { runId, month, invoices: items.length, exceptions, pendingApprovals, warnings };
}

/** A person resolves an exception. `resolution` is free text shown in the log. */
export function resolveException(
  db: Db,
  exceptionId: number,
  resolution: string,
  person: string,
): boolean {
  if (!person || person.trim() === "")
    throw new Error("A person must be named to resolve an exception");
  const row = db
    .prepare("SELECT id, run_id, invoice_id, code FROM exceptions WHERE id = ? AND status = 'open'")
    .get(exceptionId) as
    { id: number; run_id: number; invoice_id: number | null; code: string } | undefined;
  if (!row) return false;
  db.prepare(
    `UPDATE exceptions SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = datetime('now')
     WHERE id = ?`,
  ).run(resolution, person, exceptionId);
  logStep(db, {
    runId: row.run_id,
    actor: person,
    step: "exception_resolved",
    subject: `exception:${exceptionId}`,
    detail: `${row.code}: ${resolution}`,
  });
  let packageChanged = false;
  if (row.invoice_id !== null) {
    const open = (
      db
        .prepare("SELECT COUNT(*) AS n FROM exceptions WHERE invoice_id = ? AND status = 'open'")
        .get(row.invoice_id) as { n: number }
    ).n;
    if (open === 0) {
      // A resolved duplicate or Italian invoice stays out of the foreign package.
      const exclude = (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM exceptions WHERE invoice_id = ? AND code IN ('DUPLICATE','NOT_FOREIGN')",
          )
          .get(row.invoice_id) as { n: number }
      ).n;
      db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(
        exclude > 0 ? "excluded" : "ok",
        row.invoice_id,
      );
      logStep(db, {
        runId: row.run_id,
        actor: person,
        step: "invoice_cleared",
        subject: `invoice:${row.invoice_id}`,
        detail:
          exclude > 0
            ? "Nessuna eccezione aperta: fattura esclusa dal pacchetto"
            : "Nessuna eccezione aperta: fattura di nuovo valida",
      });
      packageChanged = true;
    }
  } else {
    packageChanged = true;
  }
  // The package visibly follows the person's decision, while it still waits for approval.
  if (packageChanged) {
    refreshPackage(db, row.run_id, person);
    generateSelfInvoices(db, row.run_id);
  }
  return true;
}

/** Wipes run data (not the audit log) and reloads the demo registry, for a clean demo. */
export function resetDemo(db: Db, options: { demoDir?: string; month?: string } = {}): void {
  const demoDir = options.demoDir ?? path.join(process.cwd(), "demo");
  const month = options.month ?? process.env.DEMO_MONTH ?? "2026-10";
  const monthDir = path.join(demoDir, month);
  db.transaction(() => {
    for (const table of [
      "self_invoices",
      "exceptions",
      "outbox",
      "card_charges",
      "invoices",
      "supplier_facts",
      "runs",
      "suppliers",
      "auto_send_policies",
    ]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    const suppliersFile = path.join(monthDir, "suppliers.json");
    if (fs.existsSync(suppliersFile)) {
      const sourcesFile = path.join(monthDir, "sources.json");
      const config: SourcesConfig = fs.existsSync(sourcesFile) ? readJson(sourcesFile) : {};
      seedSuppliers(db, readJson<Supplier[]>(suppliersFile), channelMap(config));
    }
    logStep(db, {
      actor: "autopilot",
      step: "demo_reset",
      detail: `Dati delle chiusure cancellati, anagrafica ricaricata da ${month}`,
      source: suppliersFile,
    });
  })();
}

export {
  approvePackage,
  deliverPackage,
  getDeliveryMode,
  originalPdfPath,
  packageBlockers,
  setDeliveryMode,
  type DeliveryMode,
  type PackageBlocker,
} from "./delivery";

export { completeUnreadableFields, unreadableFields, MANUAL_FIELDS } from "./manual-fields";

export { excludeInvoice } from "./workflow";
