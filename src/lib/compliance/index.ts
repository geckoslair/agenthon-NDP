// SIMULATED self-invoicing (autofattura), SdI submission and accounting export.
// Drafts are demonstration XML with a simplified structure, not validated for tax purposes.
// Nothing is sent to a real tax authority or accounting product: both endpoints are mocks
// at MOCK_BASE_URL. Every step needs a person and is written to the audit log.
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import { logStep } from "../audit";
import type { ExtractedInvoice } from "../types";
import { selfInvoiceXml } from "./xml";

/** Document type for services purchased from abroad, as reported by the accountant. */
export const DOC_TYPE = "TD17";
/** Ordinary Italian VAT rate. ASSUMPTION, shown as "aliquota ordinaria 22%: da confermare". */
export const VAT_RATE = 22;
export const NEEDS_EUR_REASON = "Importo in euro mancante: indica il controvalore";

const round2 = (n: number) => Math.round(n * 100) / 100;

function baseUrl(): string {
  return process.env.MOCK_BASE_URL ?? "http://localhost:3000";
}

/** The 15th of the month after the month of receipt ("YYYY-MM"). */
export function sendingDeadline(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-15`;
}

export function vatOf(taxableEur: number): { vatEur: number; totalEur: number } {
  const vatEur = round2((taxableEur * VAT_RATE) / 100);
  return { vatEur, totalEur: round2(taxableEur + vatEur) };
}

interface Row {
  id: number;
  run_id: number;
  invoice_id: number;
  number: string;
  taxable_eur: number | null;
  vat_eur: number | null;
  xml_path: string | null;
  status: "needs_input" | "draft" | "approved" | "submitted" | "rejected";
  sdi_receipt: string | null;
  accounting_status: "pending" | "exported";
}

function getRow(db: Db, id: number): Row | undefined {
  return db.prepare("SELECT * FROM self_invoices WHERE id = ?").get(id) as Row | undefined;
}

const log = (
  db: Db,
  runId: number,
  actor: string,
  step: string,
  id: number,
  detail: string,
  source?: string,
) =>
  logStep(db, {
    runId,
    actor,
    step,
    subject: `self_invoice:${id}`,
    detail,
    source: source ?? null,
  });

/** Where the run keeps its files: next to its package, else DATA_DIR or ./data. */
function dataDirFor(db: Db, runId: number): string {
  const pkg = db
    .prepare(
      "SELECT attachment_path FROM outbox WHERE run_id = ? AND kind = 'package' AND attachment_path IS NOT NULL ORDER BY id DESC LIMIT 1",
    )
    .get(runId) as { attachment_path: string } | undefined;
  if (pkg) return path.dirname(path.dirname(pkg.attachment_path));
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

interface InvoiceInfo {
  id: number;
  file_name: string;
  extracted: ExtractedInvoice;
  supplier_name: string | null;
  supplier_country: string | null;
  supplier_tax_id: string | null;
}

function invoiceInfo(db: Db, invoiceId: number): InvoiceInfo {
  const r = db
    .prepare(
      `SELECT i.id, i.file_name, i.extracted, s.name AS supplier_name, s.country AS supplier_country,
         s.tax_id AS supplier_tax_id
       FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.id = ?`,
    )
    .get(invoiceId) as Omit<InvoiceInfo, "extracted"> & { extracted: string };
  return { ...r, extracted: JSON.parse(r.extracted) as ExtractedInvoice };
}

/** Writes the XML for a row with a known EUR amount; returns its path. */
function writeXml(
  db: Db,
  row: Pick<Row, "id" | "run_id" | "invoice_id" | "number">,
  taxableEur: number,
  dir: string,
): string {
  const run = db.prepare("SELECT month FROM runs WHERE id = ?").get(row.run_id) as {
    month: string;
  };
  const inv = invoiceInfo(db, row.invoice_id);
  const e = inv.extracted;
  const { vatEur, totalEur } = vatOf(taxableEur);
  const xml = selfInvoiceXml({
    docType: DOC_TYPE,
    number: row.number,
    date: new Date().toISOString().slice(0, 10),
    deadline: sendingDeadline(run.month),
    // The addressee was checked against the company profile by the rules: an 'ok' invoice
    // is addressed to the company, so its name and VAT id are read from there.
    company: { name: e.addresseeName.value ?? "", vatId: e.addresseeVatId.value ?? "" },
    supplier: {
      name: inv.supplier_name ?? e.supplierName.value ?? "",
      country: e.supplierCountry.value ?? inv.supplier_country ?? "",
      // docs/domain.md: when a foreign supplier has no tax identifier, "0" was used.
      taxId: e.supplierTaxId.value ?? inv.supplier_tax_id ?? "0",
    },
    original: {
      number: e.invoiceNumber.value ?? "",
      date: e.invoiceDate.value ?? "",
      fileName: inv.file_name,
      amount: e.totalAmount.value,
      currency: e.currency.value ?? "",
    },
    taxableEur,
    vatRate: VAT_RATE,
    vatEur,
    totalEur,
  });
  const file = path.join(dir, `${row.number}.xml`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, xml);
  return file;
}

/**
 * Creates or refreshes the drafts for every 'ok' invoice of the run. Approved, submitted
 * and rejected rows are never touched; drafts of invoices no longer 'ok' are removed.
 * Returns the number of self-invoice rows the run has afterwards.
 */
export function generateSelfInvoices(db: Db, runId: number, dataDir?: string): number {
  const run = db.prepare("SELECT month FROM runs WHERE id = ?").get(runId) as
    { month: string } | undefined;
  if (!run) throw new Error(`Run ${runId} not found`);
  const dir = path.join(
    dataDir ?? dataDirFor(db, runId),
    "autofatture",
    `${run.month}-run-${runId}`,
  );
  const ok = db
    .prepare("SELECT id FROM invoices WHERE run_id = ? AND status = 'ok' ORDER BY id")
    .all(runId) as { id: number }[];
  const okIds = new Set(ok.map((i) => i.id));
  const existing = db.prepare("SELECT * FROM self_invoices WHERE run_id = ?").all(runId) as Row[];

  db.transaction(() => {
    for (const row of existing) {
      if (okIds.has(row.invoice_id) || (row.status !== "draft" && row.status !== "needs_input"))
        continue;
      db.prepare("DELETE FROM self_invoices WHERE id = ?").run(row.id);
      if (row.xml_path) fs.rmSync(row.xml_path, { force: true });
      log(
        db,
        runId,
        "autopilot",
        "self_invoice_removed",
        row.id,
        `Bozza ${row.number} rimossa: la fattura non è più valida`,
      );
    }
    const byInvoice = new Map(existing.map((r) => [r.invoice_id, r]));
    let seq = existing.reduce((max, r) => Math.max(max, Number(r.number.split("-").pop()) || 0), 0);
    for (const { id: invoiceId } of ok) {
      const current = byInvoice.get(invoiceId);
      if (current && current.status !== "draft" && current.status !== "needs_input") continue;
      const inv = invoiceInfo(db, invoiceId);
      const currency = inv.extracted.currency.value?.toUpperCase() ?? null;
      const amount = inv.extracted.totalAmount.value;
      // EUR invoices: the taxable amount is the invoice total (no foreign VAT on an 'ok'
      // invoice). Other currencies: no exchange rate is invented, a person supplies it.
      const givenByPerson =
        current !== undefined &&
        db
          .prepare(
            "SELECT 1 FROM audit_log WHERE step = 'self_invoice_eur_amount' AND subject = ? LIMIT 1",
          )
          .get(`self_invoice:${current.id}`) !== undefined;
      const taxable =
        currency === "EUR" && amount !== null
          ? round2(amount)
          : givenByPerson
            ? (current?.taxable_eur ?? null)
            : null;

      let row = current;
      if (!row) {
        seq += 1;
        const number = `AF-${run.month}-${String(seq).padStart(3, "0")}`;
        const id = Number(
          db
            .prepare(
              `INSERT INTO self_invoices (run_id, invoice_id, doc_type, number, vat_rate, status, needs_input_reason)
               VALUES (?, ?, ?, ?, ?, 'needs_input', ?)`,
            )
            .run(runId, invoiceId, DOC_TYPE, number, VAT_RATE, NEEDS_EUR_REASON).lastInsertRowid,
        );
        row = getRow(db, id)!;
        log(
          db,
          runId,
          "autopilot",
          "self_invoice_created",
          id,
          `Autofattura simulata ${number} per ${inv.file_name}`,
          inv.file_name,
        );
      }
      if (taxable === null) {
        db.prepare(
          "UPDATE self_invoices SET status = 'needs_input', needs_input_reason = ?, taxable_eur = NULL, vat_eur = NULL, xml_path = NULL WHERE id = ?",
        ).run(NEEDS_EUR_REASON, row.id);
        log(
          db,
          runId,
          "autopilot",
          "self_invoice_needs_input",
          row.id,
          `${NEEDS_EUR_REASON} (valuta ${currency ?? "?"})`,
          inv.file_name,
        );
        continue;
      }
      const xmlPath = writeXml(db, row, taxable, dir);
      db.prepare(
        "UPDATE self_invoices SET status = 'draft', needs_input_reason = NULL, taxable_eur = ?, vat_rate = ?, vat_eur = ?, xml_path = ? WHERE id = ?",
      ).run(taxable, VAT_RATE, vatOf(taxable).vatEur, xmlPath, row.id);
      log(
        db,
        runId,
        "autopilot",
        "self_invoice_draft",
        row.id,
        `Bozza dimostrativa ${row.number}: imponibile ${taxable.toFixed(2)} EUR, aliquota ordinaria 22% da confermare`,
        xmlPath,
      );
    }
  })();
  return (
    db.prepare("SELECT COUNT(*) AS n FROM self_invoices WHERE run_id = ?").get(runId) as {
      n: number;
    }
  ).n;
}

/** A person supplies the EUR taxable amount of a non-EUR invoice. Only for needs_input rows. */
export function setEuroAmount(db: Db, id: number, taxableEur: number, person: string): boolean {
  if (!person?.trim()) throw new Error("A person must be named");
  if (!Number.isFinite(taxableEur) || taxableEur <= 0) return false;
  const row = getRow(db, id);
  if (!row || row.status !== "needs_input") return false;
  const taxable = round2(taxableEur);
  const dir = path.join(
    dataDirFor(db, row.run_id),
    "autofatture",
    `${(db.prepare("SELECT month FROM runs WHERE id = ?").get(row.run_id) as { month: string }).month}-run-${row.run_id}`,
  );
  const xmlPath = writeXml(db, row, taxable, dir);
  db.prepare(
    "UPDATE self_invoices SET status = 'draft', needs_input_reason = NULL, taxable_eur = ?, vat_eur = ?, xml_path = ? WHERE id = ?",
  ).run(taxable, vatOf(taxable).vatEur, xmlPath, id);
  log(
    db,
    row.run_id,
    person,
    "self_invoice_eur_amount",
    id,
    `Controvalore in euro indicato: ${taxable.toFixed(2)} EUR`,
    xmlPath,
  );
  return true;
}

/** A person approves or rejects a draft. Only drafts can be decided. */
export function decideSelfInvoice(
  db: Db,
  id: number,
  decision: "approved" | "rejected",
  person: string,
): boolean {
  if (!person?.trim()) throw new Error("A person must be named");
  const result = db
    .prepare(
      `UPDATE self_invoices SET status = ?, approved_by = ?, approved_at = datetime('now')
       WHERE id = ? AND status = 'draft'`,
    )
    .run(decision, person, id);
  if (result.changes === 0) return false;
  const row = getRow(db, id)!;
  log(
    db,
    row.run_id,
    person,
    `self_invoice_${decision}`,
    id,
    `${row.number} ${decision === "approved" ? "approvata" : "rifiutata"}`,
  );
  return true;
}

/** Sends an approved draft to the SIMULATED SdI endpoint. */
export async function submitSelfInvoice(
  db: Db,
  id: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; receipt?: string; error?: string }> {
  const row = getRow(db, id);
  if (!row) return { ok: false, error: "Autofattura non trovata" };
  if (row.status !== "approved")
    return { ok: false, error: "Serve l'approvazione di una persona prima dell'invio" };
  const url = `${baseUrl()}/mock/sdi/submit`;
  const fail = (error: string) => {
    log(
      db,
      row.run_id,
      "autopilot",
      "self_invoice_submit_failed",
      id,
      `Invio simulato a SdI non riuscito: ${error}`,
      url,
    );
    return { ok: false, error };
  };
  if (!row.xml_path || !fs.existsSync(row.xml_path)) return fail("File XML mancante");
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: fs.readFileSync(row.xml_path, "utf8"),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    return fail((error as Error).message);
  }
  const data = (await response.json().catch(() => ({}))) as {
    receipt?: string;
    outcome?: string;
    error?: string;
  };
  if (!response.ok || data.outcome !== "accepted" || !data.receipt) {
    return fail(data.error ?? `HTTP ${response.status}, esito ${data.outcome ?? "sconosciuto"}`);
  }
  const updated = db
    .prepare(
      "UPDATE self_invoices SET status = 'submitted', sdi_receipt = ?, submitted_at = datetime('now') WHERE id = ? AND status = 'approved'",
    )
    .run(data.receipt, id);
  if (updated.changes === 0) return { ok: false, error: "Stato cambiato durante l'invio" };
  log(
    db,
    row.run_id,
    "autopilot",
    "self_invoice_submitted",
    id,
    `Invio SIMULATO a SdI: ricevuta ${data.receipt}`,
    url,
  );
  return { ok: true, receipt: data.receipt };
}

/** Sends the journal entries of submitted self-invoices to the SIMULATED accounting endpoint. */
export async function exportToAccounting(
  db: Db,
  runId: number,
  person: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; exported: number; error?: string }> {
  if (!person?.trim()) throw new Error("A person must be named");
  const rows = db
    .prepare(
      `SELECT si.*, i.file_name, i.extracted FROM self_invoices si JOIN invoices i ON i.id = si.invoice_id
       WHERE si.run_id = ? AND si.status = 'submitted' AND si.accounting_status = 'pending' ORDER BY si.id`,
    )
    .all(runId) as (Row & { file_name: string; extracted: string })[];
  if (rows.length === 0) return { ok: true, exported: 0 };
  const entries = rows.map((r) => {
    const e = JSON.parse(r.extracted) as ExtractedInvoice;
    return {
      selfInvoice: r.number,
      docType: DOC_TYPE,
      supplier: e.supplierName.value,
      originalInvoice: e.invoiceNumber.value,
      file: r.file_name,
      taxableEur: r.taxable_eur,
      vatRate: VAT_RATE,
      vatEur: r.vat_eur,
      sdiReceipt: r.sdi_receipt,
    };
  });
  const url = `${baseUrl()}/mock/accounting/entries`;
  let ref: string | undefined;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, entries }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json().catch(() => ({}))) as { ref?: string; error?: string };
    if (!response.ok || !data.ref) throw new Error(data.error ?? `HTTP ${response.status}`);
    ref = data.ref;
  } catch (error) {
    const message = (error as Error).message;
    logStep(db, {
      runId,
      actor: person,
      step: "accounting_export_failed",
      subject: `run:${runId}`,
      detail: `Esportazione simulata non riuscita: ${message}`,
      source: url,
    });
    return { ok: false, exported: 0, error: message };
  }
  const update = db.prepare(
    `UPDATE self_invoices SET accounting_status = 'exported', accounting_ref = ?, exported_by = ?, exported_at = datetime('now')
     WHERE id = ? AND accounting_status = 'pending'`,
  );
  for (const r of rows) {
    update.run(ref, person, r.id);
    log(
      db,
      runId,
      person,
      "self_invoice_exported",
      r.id,
      `Esportata alla contabilità SIMULATA, riferimento ${ref}`,
      url,
    );
  }
  return { ok: true, exported: rows.length };
}
