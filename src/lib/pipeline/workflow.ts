// Person-driven decisions on blocked invoices: exclude from the close.
import type { Db } from "../db";
import { logStep } from "../audit";
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
