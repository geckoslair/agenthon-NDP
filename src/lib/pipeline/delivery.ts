// Package approval with blockers, delivery mode (accountant email or SIMULATED ERP), and
// the original PDFs. Nothing reaches a real product: the ERP endpoint is a mock.
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import { decideOutgoing, logStep, markSent } from "../audit";
import type { ExtractedInvoice } from "../types";
import { collectedDir } from "./repackage";

export type DeliveryMode = "accountant" | "erp";

export interface PackageBlocker {
  exceptionId: number;
  supplierName: string;
  reason: string;
}

/** One entry per open SUPPLIER_FACTS_UNKNOWN exception: a supplier request still unanswered. */
export function packageBlockers(db: Db, runId: number): PackageBlocker[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.message, e.evidence, COALESCE(s.name, e.supplier_id, '?') AS supplier_name
       FROM exceptions e LEFT JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.run_id = ? AND e.code = 'SUPPLIER_FACTS_UNKNOWN' AND e.status = 'open'
       ORDER BY e.id`,
    )
    .all(runId) as {
    id: number;
    message: string;
    evidence: string | null;
    supplier_name: string;
  }[];
  return rows.map((r) => ({
    exceptionId: r.id,
    supplierName: r.supplier_name,
    reason: `Richiesta al fornitore senza risposta. ${r.evidence ?? r.message}`.trim(),
  }));
}

interface OutboxRow {
  id: number;
  run_id: number | null;
  kind: string;
  status: string;
  attachment_path: string | null;
}

function outboxRow(db: Db, id: number): OutboxRow | undefined {
  return db
    .prepare("SELECT id, run_id, kind, status, attachment_path FROM outbox WHERE id = ?")
    .get(id) as OutboxRow | undefined;
}

/**
 * Approves the monthly package. While supplier requests are unanswered it refuses, unless
 * a person explicitly forces it; the forced approval is logged with what was left out.
 */
export function approvePackage(
  db: Db,
  outboxId: number,
  person: string,
  options: { force?: boolean } = {},
): { ok: boolean; error?: string } {
  if (!person?.trim()) return { ok: false, error: "Serve il nome di chi approva." };
  const row = outboxRow(db, outboxId);
  if (!row || row.kind !== "package") return { ok: false, error: "Non è un pacchetto mensile." };
  if (row.status !== "pending")
    return { ok: false, error: "Il pacchetto non è in attesa di approvazione." };
  const blockers = row.run_id === null ? [] : packageBlockers(db, row.run_id);
  if (blockers.length > 0 && !options.force) {
    const names = [...new Set(blockers.map((b) => b.supplierName))].join(", ");
    return {
      ok: false,
      error: `Il pacchetto è bloccato: attendiamo la risposta di ${names}. Risolvi l'eccezione o approva comunque forzando l'invio.`,
    };
  }
  if (!decideOutgoing(db, outboxId, "approved", person)) {
    return { ok: false, error: "Il pacchetto non è più in attesa di approvazione." };
  }
  if (blockers.length > 0) {
    const leftOut = db
      .prepare(
        "SELECT file_name FROM invoices WHERE run_id = ? AND status = 'exception' ORDER BY id",
      )
      .all(row.run_id) as { file_name: string }[];
    logStep(db, {
      runId: row.run_id,
      actor: person,
      step: "package_forced",
      subject: `outbox:${outboxId}`,
      detail: `Approvato nonostante richieste aperte a ${blockers
        .map((b) => b.supplierName)
        .join(", ")}. Fatture escluse: ${leftOut.map((l) => l.file_name).join(", ") || "nessuna"}`,
    });
  }
  return { ok: true };
}

export function getDeliveryMode(db: Db): DeliveryMode {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'delivery_mode'").get() as
    { value: string } | undefined;
  return row?.value === "erp" ? "erp" : "accountant";
}

export function setDeliveryMode(db: Db, mode: DeliveryMode, person: string): void {
  if (mode !== "accountant" && mode !== "erp") throw new Error(`Invalid delivery mode: ${mode}`);
  if (!person?.trim()) throw new Error("A person must be named");
  db.prepare(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('delivery_mode', ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  ).run(mode, person);
  logStep(db, {
    actor: person,
    step: "delivery_mode_changed",
    subject: "settings:delivery_mode",
    detail:
      mode === "erp"
        ? "Consegna: integrazione diretta con il gestionale (simulata)"
        : "Consegna: email al commercialista (simulata)",
  });
}

/** Delivers an APPROVED package: simulated email to the accountant, or simulated ERP upload. */
export async function deliverPackage(
  db: Db,
  outboxId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; mode: DeliveryMode; ref?: string; error?: string }> {
  const mode = getDeliveryMode(db);
  const row = outboxRow(db, outboxId);
  if (!row || row.kind !== "package")
    return { ok: false, mode, error: "Non è un pacchetto mensile." };
  if (row.status !== "approved") {
    return {
      ok: false,
      mode,
      error: "Il pacchetto deve essere approvato da una persona prima della consegna.",
    };
  }
  if (mode === "accountant") {
    return markSent(db, outboxId)
      ? { ok: true, mode }
      : { ok: false, mode, error: "Invio non riuscito." };
  }

  const invoices = db
    .prepare(
      "SELECT file_name, extracted FROM invoices WHERE run_id = ? AND status = 'ok' ORDER BY id",
    )
    .all(row.run_id) as { file_name: string; extracted: string }[];
  const documents = invoices.map((i) => {
    const e = JSON.parse(i.extracted) as ExtractedInvoice;
    return {
      supplier: e.supplierName.value,
      number: e.invoiceNumber.value,
      date: e.invoiceDate.value,
      amount: e.totalAmount.value,
      currency: e.currency.value,
      fileName: i.file_name,
    };
  });
  const url = `${process.env.MOCK_BASE_URL ?? "http://localhost:3000"}/mock/erp/documents`;
  let ref: string;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: row.run_id, documents }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json().catch(() => ({}))) as { ref?: string; error?: string };
    if (!response.ok || !data.ref) throw new Error(data.error ?? `HTTP ${response.status}`);
    ref = data.ref;
  } catch (error) {
    const message = (error as Error).message;
    logStep(db, {
      runId: row.run_id,
      actor: "autopilot",
      step: "package_delivery_failed",
      subject: `outbox:${outboxId}`,
      detail: `Consegna al gestionale (simulato) non riuscita: ${message}`,
      source: url,
    });
    return { ok: false, mode, error: message };
  }
  markSent(db, outboxId);
  logStep(db, {
    runId: row.run_id,
    actor: "autopilot",
    step: "package_delivered_erp",
    subject: `outbox:${outboxId}`,
    detail: `${documents.length} fatture consegnate al gestionale (simulato), riferimento ${ref}`,
    source: url,
  });
  return { ok: true, mode, ref };
}

/** Absolute path of the collected PDF of an invoice, or null when the file is missing. */
export function originalPdfPath(db: Db, invoiceId: number): string | null {
  const row = db
    .prepare(
      `SELECT i.file_name, i.run_id, r.month,
         (SELECT attachment_path FROM outbox o WHERE o.run_id = i.run_id AND o.kind = 'package'
            AND o.attachment_path IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS package_path
       FROM invoices i JOIN runs r ON r.id = i.run_id WHERE i.id = ?`,
    )
    .get(invoiceId) as
    { file_name: string; run_id: number; month: string; package_path: string | null } | undefined;
  if (!row) return null;
  const dataDir = row.package_path
    ? path.dirname(path.dirname(row.package_path))
    : (process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
  const file = path.resolve(
    collectedDir(dataDir, row.month, row.run_id),
    path.basename(row.file_name),
  );
  return fs.existsSync(file) ? file : null;
}
