// Person-driven decisions on blocked invoices: exclude from the close.
import type { Db } from "../db";
import { logStep, queueOutgoing } from "../audit";
import { generateSelfInvoices } from "../compliance";
import { refreshPackage } from "./repackage";

export const EXCLUDABLE_CODES = ["WRONG_MONTH", "FOREIGN_VAT_CHARGED", "ADDRESSED_TO_PERSON"];

/**
 * Excludes the invoice of an open exception from this run's package. It closes every open
 * exception on that invoice and keeps the invoice data and PDF unchanged.
 */
export function excludeInvoice(
  db: Db,
  exceptionId: number,
  person: string,
): { ok: boolean; error?: string } {
  if (!person?.trim()) return { ok: false, error: "Scrivi il tuo nome." };
  const ex = db
    .prepare("SELECT id, run_id, invoice_id, code, status FROM exceptions WHERE id = ?")
    .get(exceptionId) as
    | { id: number; run_id: number; invoice_id: number | null; code: string; status: string }
    | undefined;
  if (!ex || ex.status !== "open") return { ok: false, error: "L'eccezione non è più aperta." };
  if (!EXCLUDABLE_CODES.includes(ex.code) || ex.invoice_id === null) {
    return { ok: false, error: "Questa eccezione non si risolve escludendo la fattura." };
  }
  const invoiceId = ex.invoice_id;
  const open = db
    .prepare("SELECT id, code FROM exceptions WHERE invoice_id = ? AND status = 'open' ORDER BY id")
    .all(invoiceId) as { id: number; code: string }[];
  db.transaction(() => {
    db.prepare("UPDATE invoices SET status = 'excluded' WHERE id = ?").run(invoiceId);
    db.prepare(
      `UPDATE exceptions SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now'),
         resolution = 'Esclusa dalla chiusura' WHERE invoice_id = ? AND status = 'open'`,
    ).run(person, invoiceId);
    logStep(db, {
      runId: ex.run_id,
      actor: person,
      step: "invoice_excluded",
      subject: `invoice:${invoiceId}`,
      detail: `Esclusa dalla chiusura; eccezioni chiuse: ${open.map((o) => `${o.code} (exception:${o.id})`).join(", ")}`,
    });
  })();
  refreshPackage(db, ex.run_id, person);
  generateSelfInvoices(db, ex.run_id);
  return { ok: true };
}

export const CORRECTABLE_CODES = ["FOREIGN_VAT_CHARGED", "ADDRESSED_TO_PERSON"];

const CORRECTION_ASK: Record<string, string> = {
  FOREIGN_VAT_CHARGED:
    "La fattura riporta l'IVA estera: vi chiediamo una nota di credito e una nuova fattura senza IVA (reverse charge), intestata alla società con la sua partita IVA.",
  ADDRESSED_TO_PERSON:
    "La fattura non è intestata alla società: vi chiediamo di riemetterla intestata alla società, con la sua partita IVA.",
};

interface CorrectionRow {
  id: number;
  outbox_id: number | null;
  status: string;
  failure_reason: string | null;
  outbox_status: string | null;
}

function latestCorrection(db: Db, exceptionId: number): CorrectionRow | undefined {
  return db
    .prepare(
      `SELECT c.id, c.outbox_id, c.status, c.failure_reason, o.status AS outbox_status
       FROM corrections c LEFT JOIN outbox o ON o.id = c.outbox_id
       WHERE c.exception_id = ? ORDER BY c.id DESC LIMIT 1`,
    )
    .get(exceptionId) as CorrectionRow | undefined;
}

/**
 * Queues a templated email asking the supplier for a corrected document. The exception
 * stays open and the invoice blocked until a corrected document passes the rules.
 */
export function requestCorrection(
  db: Db,
  exceptionId: number,
  person: string,
): { ok: boolean; outboxId?: number; alreadyRequested?: boolean; error?: string } {
  if (!person?.trim()) return { ok: false, error: "Scrivi il tuo nome." };
  const ex = db
    .prepare(
      `SELECT e.id, e.run_id, e.invoice_id, e.code, e.status, e.supplier_id, i.file_name, i.extracted,
         s.name AS supplier_name
       FROM exceptions e JOIN invoices i ON i.id = e.invoice_id
       LEFT JOIN suppliers s ON s.id = e.supplier_id WHERE e.id = ?`,
    )
    .get(exceptionId) as
    | {
        id: number;
        run_id: number;
        invoice_id: number;
        code: string;
        status: string;
        supplier_id: string | null;
        file_name: string;
        extracted: string;
        supplier_name: string | null;
      }
    | undefined;
  if (!ex || ex.status !== "open") return { ok: false, error: "L'eccezione non è più aperta." };
  if (!CORRECTABLE_CODES.includes(ex.code)) {
    return { ok: false, error: "Per questa eccezione non si chiede una correzione al fornitore." };
  }
  const last = latestCorrection(db, exceptionId);
  if (last && last.status === "requested" && last.outbox_status !== "rejected") {
    return { ok: true, outboxId: last.outbox_id ?? undefined, alreadyRequested: true };
  }
  const extracted = JSON.parse(ex.extracted) as {
    invoiceNumber?: { value: string | null };
    invoiceDate?: { value: string | null };
    supplierName?: { value: string | null };
  };
  const supplier = ex.supplier_name ?? extracted.supplierName?.value ?? "fornitore";
  const number = extracted.invoiceNumber?.value ?? ex.file_name;
  const date = extracted.invoiceDate?.value ? ` del ${extracted.invoiceDate.value}` : "";
  const queued = queueOutgoing(db, {
    runId: ex.run_id,
    kind: "supplier_request",
    template: "ask_correction",
    recipient: `billing@${ex.supplier_id ?? "fornitore"}.example`,
    subject: `Richiesta di correzione fattura ${number}`,
    body: [
      `Buongiorno ${supplier},`,
      "",
      `riguardo alla vostra fattura n. ${number}${date} (file ${ex.file_name}):`,
      CORRECTION_ASK[ex.code],
      "",
      "Potete inviarci il documento corretto? Grazie.",
    ].join("\n"),
  });
  const correctionId = Number(
    db
      .prepare(
        `INSERT INTO corrections (run_id, invoice_id, exception_id, outbox_id, status, requested_by)
         VALUES (?, ?, ?, ?, 'requested', ?)`,
      )
      .run(ex.run_id, ex.invoice_id, exceptionId, queued.id, person).lastInsertRowid,
  );
  logStep(db, {
    runId: ex.run_id,
    actor: person,
    step: "correction_requested",
    subject: `invoice:${ex.invoice_id}`,
    detail: `${ex.code} (exception:${exceptionId}): richiesta di correzione preparata (correction:${correctionId}, outbox:${queued.id}); l'eccezione resta aperta`,
  });
  return { ok: true, outboxId: queued.id };
}

export type CorrectionState =
  | "none"
  | "awaiting_approval"
  | "approved"
  | "sent"
  | "rejected"
  | "document_received"
  | "validated"
  | "failed";

export function correctionStatus(
  db: Db,
  exceptionId: number,
): { state: CorrectionState; outboxId?: number; message?: string } {
  const last = latestCorrection(db, exceptionId);
  if (!last) return { state: "none" };
  const outboxId = last.outbox_id ?? undefined;
  if (last.status === "document_received") {
    return {
      state: "document_received",
      outboxId,
      message: "Documento corretto ricevuto, in verifica.",
    };
  }
  if (last.status === "validated") {
    return {
      state: "validated",
      outboxId,
      message: "Il documento corretto ha superato i controlli.",
    };
  }
  if (last.status === "failed") {
    return {
      state: "failed",
      outboxId,
      message: last.failure_reason ?? "Il documento corretto non risolve il problema.",
    };
  }
  switch (last.outbox_status) {
    case "pending":
      return {
        state: "awaiting_approval",
        outboxId,
        message: "Email al fornitore in attesa di approvazione.",
      };
    case "approved":
      return { state: "approved", outboxId, message: "Email approvata, non ancora inviata." };
    case "sent":
      return {
        state: "sent",
        outboxId,
        message: "Email inviata (simulata): in attesa del documento corretto.",
      };
    case "rejected":
      return { state: "rejected", outboxId, message: "Email al fornitore rifiutata." };
    default:
      return { state: "awaiting_approval", outboxId };
  }
}
