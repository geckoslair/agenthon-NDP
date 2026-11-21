// A person completes the required fields the extraction could not read. The values are
// marked as typed by a person (no citation is invented), and the same deterministic
// rules then decide again on the completed invoice.
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import { logStep } from "../audit";
import { generateSelfInvoices } from "../compliance";
import { findDuplicates, validateInvoice } from "../rules";
import type { CompanyProfile, ExceptionCode, ExtractedInvoice, Sourced } from "../types";
import { EU_COUNTRIES, EXCEPTION_TEXT } from "./messages";
import { refreshPackage } from "./repackage";

/** Mirror of REQUIRED_FIELDS in rules.ts (a test fails if they drift). */
export const MANUAL_FIELDS = [
  "supplierName",
  "supplierCountry",
  "invoiceNumber",
  "invoiceDate",
  "totalAmount",
  "currency",
  "addresseeName",
] as const;
type ManualField = (typeof MANUAL_FIELDS)[number];

const LABELS: Record<ManualField, string> = {
  supplierName: "fornitore",
  supplierCountry: "paese del fornitore",
  invoiceNumber: "numero fattura",
  invoiceDate: "data fattura",
  totalAmount: "importo totale",
  currency: "valuta",
  addresseeName: "intestatario",
};

interface ExceptionRow {
  id: number;
  run_id: number;
  invoice_id: number | null;
  code: string;
  status: string;
}

function openUnreadable(db: Db, exceptionId: number): ExceptionRow | null {
  const row = db
    .prepare("SELECT id, run_id, invoice_id, code, status FROM exceptions WHERE id = ?")
    .get(exceptionId) as ExceptionRow | undefined;
  if (!row || row.status !== "open" || row.code !== "UNREADABLE_FIELD" || row.invoice_id === null) {
    return null;
  }
  return row;
}

function loadExtracted(db: Db, invoiceId: number): ExtractedInvoice {
  const r = db.prepare("SELECT extracted FROM invoices WHERE id = ?").get(invoiceId) as {
    extracted: string;
  };
  return JSON.parse(r.extracted) as ExtractedInvoice;
}

const isMissing = (s: Sourced<unknown> | undefined) =>
  !s || s.value === null || s.value === undefined || s.value === "";

function missingOf(extracted: ExtractedInvoice): ManualField[] {
  return MANUAL_FIELDS.filter((f) => isMissing(extracted[f] as Sourced<unknown> | undefined));
}

/** Required fields still empty on the invoice of an open UNREADABLE_FIELD exception. */
export function unreadableFields(db: Db, exceptionId: number): string[] {
  const row = openUnreadable(db, exceptionId);
  if (!row) return [];
  return missingOf(loadExtracted(db, row.invoice_id!));
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Returns the parsed value or an Italian error. */
function parseField(
  field: ManualField,
  raw: string | undefined,
): { value?: string | number; error?: string } {
  const text = (raw ?? "").trim();
  if (text === "") return { error: `Inserisci ${LABELS[field]}: è obbligatorio.` };
  switch (field) {
    case "invoiceDate":
      return isRealDate(text)
        ? { value: text }
        : {
            error:
              "La data deve essere una data vera nel formato AAAA-MM-GG, per esempio 2026-10-09.",
          };
    case "totalAmount": {
      const normalized = text.replace(",", ".");
      const n = /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
      return Number.isFinite(n) && n > 0
        ? { value: Math.round(n * 100) / 100 }
        : { error: "L'importo deve essere un numero maggiore di zero, per esempio 49,90." };
    }
    case "currency":
      return /^[A-Za-z]{3}$/.test(text)
        ? { value: text.toUpperCase() }
        : { error: "La valuta deve essere un codice di tre lettere, per esempio EUR o USD." };
    case "supplierCountry":
      return /^[A-Za-z]{2}$/.test(text)
        ? { value: text.toUpperCase() }
        : { error: "Il paese deve essere un codice di due lettere, per esempio IE o US." };
    default:
      return { value: text };
  }
}

function runCompany(db: Db, runId: number, month: string): CompanyProfile {
  const stored = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(`run_company:${runId}`) as { value: string } | undefined;
  if (stored) return JSON.parse(stored.value) as CompanyProfile;
  const file = path.join(process.cwd(), "demo", month, "company.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as CompanyProfile;
  throw new Error("Profilo della società non disponibile per questo giro");
}

/**
 * A person types the required fields the document did not let us read. Nothing is saved
 * unless every missing field is valid. The rules then run again on the completed invoice.
 */
export function completeUnreadableFields(
  db: Db,
  exceptionId: number,
  values: Record<string, string>,
  person: string,
): { ok: boolean; closed: boolean; errors?: Record<string, string>; message?: string } {
  if (!person?.trim()) return { ok: false, closed: false, message: "Scrivi il tuo nome." };
  const exception = openUnreadable(db, exceptionId);
  if (!exception) {
    return {
      ok: false,
      closed: false,
      message: "Questa eccezione non riguarda campi illeggibili aperti.",
    };
  }
  const invoiceId = exception.invoice_id!;
  const extracted = loadExtracted(db, invoiceId);
  const missing = missingOf(extracted);

  const errors: Record<string, string> = {};
  const parsed: Partial<Record<ManualField, string | number>> = {};
  for (const field of missing) {
    const result = parseField(field, values[field]);
    if (result.error) errors[field] = result.error;
    else parsed[field] = result.value;
  }
  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      closed: false,
      errors,
      message: "Controlla i campi segnalati: non ho salvato nulla.",
    };
  }

  const now = new Date().toISOString();
  const updated = { ...extracted } as unknown as Record<string, Sourced<unknown>>;
  for (const field of missing) {
    updated[field] = {
      value: parsed[field] ?? null,
      quote: null,
      page: null,
      origin: "manual",
      correctedBy: person,
      correctedAt: now,
    };
  }
  const completed = updated as unknown as ExtractedInvoice;

  const run = db.prepare("SELECT month FROM runs WHERE id = ?").get(exception.run_id) as {
    month: string;
  };
  const company = runCompany(db, exception.run_id, run.month);

  db.transaction(() => {
    db.prepare("UPDATE invoices SET extracted = ? WHERE id = ?").run(
      JSON.stringify(completed),
      invoiceId,
    );
    for (const field of missing) {
      const before = (extracted[field] as Sourced<unknown> | undefined)?.value;
      logStep(db, {
        runId: exception.run_id,
        actor: person,
        step: "field_corrected",
        subject: `invoice:${invoiceId}`,
        detail: `${field} (${LABELS[field]}): da ${before === null || before === undefined || before === "" ? "vuoto" : String(before)} a ${String(parsed[field])}`,
      });
    }

    // Closed only because no required field is missing any more.
    db.prepare(
      `UPDATE exceptions SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now'),
         resolution = ? WHERE id = ?`,
    ).run(person, `Campi inseriti a mano: ${missing.join(", ")}`, exceptionId);
    logStep(db, {
      runId: exception.run_id,
      actor: person,
      step: "exception_resolved",
      subject: `exception:${exceptionId}`,
      detail: `UNREADABLE_FIELD: campi inseriti a mano (${missing.join(", ")})`,
    });

    // The same deterministic rules decide again on the completed data.
    const found: { code: ExceptionCode; evidence: string | null }[] = validateInvoice(
      completed,
      company,
      run.month,
    )
      .filter((e) => e.code !== "UNREADABLE_FIELD")
      .map((e) => ({ code: e.code, evidence: e.evidence }));
    const supplier = db
      .prepare(
        "SELECT s.status, s.tax_id FROM invoices i JOIN suppliers s ON s.id = i.supplier_id WHERE i.id = ?",
      )
      .get(invoiceId) as { status: string; tax_id: string | null } | undefined;
    const country = completed.supplierCountry.value?.toUpperCase() ?? null;
    if (
      supplier?.status === "approved" &&
      !supplier.tax_id &&
      completed.supplierTaxId.value === null &&
      country !== null &&
      !EU_COUNTRIES.has(country)
    ) {
      found.push({
        code: "OUT_OF_KNOWN_RULES",
        evidence: `Nessun identificativo fiscale; paese ${country}`,
      });
    }
    const runInvoices = db
      .prepare("SELECT id, extracted FROM invoices WHERE run_id = ? ORDER BY id")
      .all(exception.run_id) as { id: number; extracted: string }[];
    const index = runInvoices.findIndex((i) => i.id === invoiceId);
    const list = runInvoices.map((i) =>
      i.id === invoiceId ? completed : (JSON.parse(i.extracted) as ExtractedInvoice),
    );
    if (findDuplicates(list).includes(index)) {
      found.push({
        code: "DUPLICATE",
        evidence:
          `${completed.supplierName.value} n. ${completed.invoiceNumber.value}, ${completed.totalAmount.value} ${completed.currency.value ?? ""}`.trim(),
      });
    }
    const supplierId = (
      db.prepare("SELECT supplier_id FROM invoices WHERE id = ?").get(invoiceId) as {
        supplier_id: string | null;
      }
    ).supplier_id;
    for (const f of found) {
      const already = db
        .prepare("SELECT 1 FROM exceptions WHERE invoice_id = ? AND code = ? AND status = 'open'")
        .get(invoiceId, f.code);
      if (already) continue;
      const text = EXCEPTION_TEXT[f.code];
      const id = Number(
        db
          .prepare(
            `INSERT INTO exceptions (run_id, invoice_id, supplier_id, code, message, evidence, proposed_action)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            exception.run_id,
            invoiceId,
            supplierId,
            f.code,
            text.message,
            f.evidence,
            text.action,
          ).lastInsertRowid,
      );
      logStep(db, {
        runId: exception.run_id,
        actor: "autopilot",
        step: "exception_raised",
        subject: `invoice:${invoiceId}`,
        detail: `${f.code} (exception:${id}) dopo l'inserimento manuale: ${text.message}${f.evidence ? ` | evidenza: ${f.evidence}` : ""}`,
      });
    }

    const open = (
      db
        .prepare("SELECT COUNT(*) AS n FROM exceptions WHERE invoice_id = ? AND status = 'open'")
        .get(invoiceId) as {
        n: number;
      }
    ).n;
    db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(
      open === 0 ? "ok" : "exception",
      invoiceId,
    );
    if (open === 0) {
      logStep(db, {
        runId: exception.run_id,
        actor: person,
        step: "invoice_cleared",
        subject: `invoice:${invoiceId}`,
        detail: "Nessuna eccezione aperta: fattura di nuovo valida",
      });
    }
  })();

  refreshPackage(db, exception.run_id, person);
  generateSelfInvoices(db, exception.run_id);
  const stillOpen = (
    db
      .prepare("SELECT COUNT(*) AS n FROM exceptions WHERE invoice_id = ? AND status = 'open'")
      .get(invoiceId) as {
      n: number;
    }
  ).n;
  return {
    ok: true,
    closed: true,
    message:
      stillOpen === 0
        ? "Campi salvati: la fattura è di nuovo valida."
        : "Campi salvati, ma i controlli hanno trovato altri problemi: la fattura resta bloccata.",
  };
}
