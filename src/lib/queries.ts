// Read-only queries for the UI. Every function takes the database so tests can pass ":memory:".
// State changes never happen here: see actions.ts, pipeline/ and audit.ts.
import type { Db } from "./db";
import type { ExtractedInvoice } from "./types";

/** Demo month, used until a run exists. */
export const DEFAULT_MONTH = process.env.PROBATA_MONTH ?? "2026-10";

export interface RunRow {
  id: number;
  month: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}

interface RunDbRow {
  id: number;
  month: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

function toRun(r: RunDbRow): RunRow {
  return {
    id: r.id,
    month: r.month,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

export function listRuns(db: Db): RunRow[] {
  return (db.prepare("SELECT * FROM runs ORDER BY id DESC").all() as RunDbRow[]).map(toRun);
}

export function getLatestRun(db: Db): RunRow | null {
  const r = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1").get() as RunDbRow | undefined;
  return r ? toRun(r) : null;
}

export interface ChannelCount {
  channel: string;
  count: number;
}

export interface Overview {
  month: string;
  run: RunRow | null;
  /** Invoices collected, per channel (the supplier's collection channel). */
  channels: ChannelCount[];
  collected: number;
  ready: number;
  blocked: number;
  /** Open exceptions of kind "missing expected invoice". */
  missing: number;
  openExceptions: number;
  pendingApprovals: number;
  package: { id: number; status: string; sentAt: string | null } | null;
}

export function getOverview(db: Db): Overview {
  const run = getLatestRun(db);
  if (!run) {
    return {
      month: DEFAULT_MONTH,
      run: null,
      channels: [],
      collected: 0,
      ready: 0,
      blocked: 0,
      missing: 0,
      openExceptions: 0,
      pendingApprovals: 0,
      package: null,
    };
  }
  const channels = db
    .prepare(
      `SELECT COALESCE(s.invoice_source, 'unknown') AS channel, COUNT(*) AS count
       FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.run_id = ? GROUP BY channel ORDER BY count DESC, channel`,
    )
    .all(run.id) as ChannelCount[];
  const byStatus = (status: string) =>
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM invoices WHERE run_id = ? AND status = ?")
        .get(run.id, status) as { n: number }
    ).n;
  const collected = (
    db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE run_id = ?").get(run.id) as {
      n: number;
    }
  ).n;
  const open = db
    .prepare("SELECT code FROM exceptions WHERE run_id = ? AND status = 'open'")
    .all(run.id) as { code: string }[];
  const pkg = db
    .prepare(
      `SELECT id, status, sent_at FROM outbox
       WHERE run_id = ? AND kind = 'package' ORDER BY id DESC LIMIT 1`,
    )
    .get(run.id) as { id: number; status: string; sent_at: string | null } | undefined;
  const pending = (
    db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'").get() as { n: number }
  ).n;
  return {
    month: run.month,
    run,
    channels,
    collected,
    ready: byStatus("ok"),
    blocked: byStatus("exception"),
    missing: open.filter((e) => e.code === "MISSING_EXPECTED_INVOICE").length,
    openExceptions: open.length,
    pendingApprovals: pending,
    package: pkg ? { id: pkg.id, status: pkg.status, sentAt: pkg.sent_at } : null,
  };
}

export interface ExceptionRow {
  id: number;
  runId: number;
  invoiceId: number | null;
  invoiceFile: string | null;
  supplierId: string | null;
  supplierName: string | null;
  code: string;
  message: string;
  evidence: string | null;
  proposedAction: string | null;
  status: "open" | "resolved";
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

interface ExceptionDbRow {
  id: number;
  run_id: number;
  invoice_id: number | null;
  file_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  code: string;
  message: string;
  evidence: string | null;
  proposed_action: string | null;
  status: "open" | "resolved";
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

const EXCEPTION_SELECT = `
  SELECT e.*, i.file_name, s.name AS supplier_name
  FROM exceptions e
  LEFT JOIN invoices i ON i.id = e.invoice_id
  LEFT JOIN suppliers s ON s.id = COALESCE(e.supplier_id, i.supplier_id)`;

function toException(r: ExceptionDbRow): ExceptionRow {
  return {
    id: r.id,
    runId: r.run_id,
    invoiceId: r.invoice_id,
    invoiceFile: r.file_name,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    code: r.code,
    message: r.message,
    evidence: r.evidence,
    proposedAction: r.proposed_action,
    status: r.status,
    resolution: r.resolution,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
  };
}

/** Open exceptions first-come first-served; resolved ones, latest first. */
export function listExceptions(db: Db, status: "open" | "resolved"): ExceptionRow[] {
  const order = status === "open" ? "e.id ASC" : "e.resolved_at DESC, e.id DESC";
  return (
    db
      .prepare(`${EXCEPTION_SELECT} WHERE e.status = ? ORDER BY ${order}`)
      .all(status) as ExceptionDbRow[]
  ).map(toException);
}

export function listInvoiceExceptions(db: Db, invoiceId: number): ExceptionRow[] {
  return (
    db
      .prepare(`${EXCEPTION_SELECT} WHERE e.invoice_id = ? ORDER BY e.id`)
      .all(invoiceId) as ExceptionDbRow[]
  ).map(toException);
}

export interface InvoiceDetail {
  id: number;
  runId: number;
  month: string | null;
  fileName: string;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
  /** How the invoice reached us: the supplier's collection channel, if known. */
  channel: string | null;
  /** null when the stored JSON cannot be read. */
  extracted: ExtractedInvoice | null;
}

export function getInvoice(db: Db, id: number): InvoiceDetail | null {
  const r = db
    .prepare(
      `SELECT i.*, r.month, s.name AS supplier_name, s.invoice_source
       FROM invoices i
       JOIN runs r ON r.id = i.run_id
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        run_id: number;
        month: string | null;
        file_name: string;
        status: string;
        supplier_id: string | null;
        supplier_name: string | null;
        invoice_source: string | null;
        extracted: string;
      }
    | undefined;
  if (!r) return null;
  let extracted: ExtractedInvoice | null = null;
  try {
    extracted = JSON.parse(r.extracted) as ExtractedInvoice;
  } catch {
    extracted = null;
  }
  return {
    id: r.id,
    runId: r.run_id,
    month: r.month,
    fileName: r.file_name,
    status: r.status,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    channel: r.invoice_source,
    extracted,
  };
}

export interface OutboxRow {
  id: number;
  runId: number | null;
  kind: string;
  template: string | null;
  recipient: string;
  subject: string;
  body: string;
  attachmentPath: string | null;
  /** File name only: the path on disk is not shown. */
  attachmentName: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  approvedVia: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
}

interface OutboxDbRow {
  id: number;
  run_id: number | null;
  kind: string;
  template: string | null;
  recipient: string;
  subject: string;
  body: string;
  attachment_path: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  approved_via: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
}

export function attachmentName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || null;
}

function toOutbox(r: OutboxDbRow): OutboxRow {
  return {
    id: r.id,
    runId: r.run_id,
    kind: r.kind,
    template: r.template,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    attachmentPath: r.attachment_path,
    attachmentName: attachmentName(r.attachment_path),
    status: r.status,
    approvedVia: r.approved_via,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    sentAt: r.sent_at,
  };
}

/**
 * Outgoing emails. "pending" are waiting for a person, "approved" are ready to send,
 * "done" are sent or rejected.
 */
export function listOutbox(db: Db, group: "pending" | "approved" | "done"): OutboxRow[] {
  const where =
    group === "pending"
      ? "status = 'pending'"
      : group === "approved"
        ? "status = 'approved'"
        : "status IN ('sent','rejected')";
  return (
    db.prepare(`SELECT * FROM outbox WHERE ${where} ORDER BY id DESC`).all() as OutboxDbRow[]
  ).map(toOutbox);
}

export interface AutoSendRow {
  template: string;
  enabled: boolean;
  enabledBy: string | null;
  enabledAt: string | null;
}

/**
 * Predefined templates: every template seen in the outbox (except the monthly package, which
 * can never be auto-sent) plus every template that has a policy row.
 */
export function listAutoSend(db: Db): AutoSendRow[] {
  const rows = db
    .prepare(
      `SELECT t.template, p.enabled, p.enabled_by, p.enabled_at FROM (
         SELECT DISTINCT template FROM outbox WHERE template IS NOT NULL AND kind != 'package'
         UNION SELECT template FROM auto_send_policies
       ) t LEFT JOIN auto_send_policies p ON p.template = t.template
       ORDER BY t.template`,
    )
    .all() as {
    template: string;
    enabled: number | null;
    enabled_by: string | null;
    enabled_at: string | null;
  }[];
  return rows.map((r) => ({
    template: r.template,
    enabled: r.enabled === 1,
    enabledBy: r.enabled_by,
    enabledAt: r.enabled_at,
  }));
}

export interface SupplierFact {
  id: number;
  fact: string;
  value: string | null;
  sourceUrl: string | null;
  quote: string | null;
  /** True when no source backs the fact: shown as "non trovato". */
  unknown: boolean;
}

export interface SupplierRow {
  id: string;
  name: string;
  country: string | null;
  taxId: string | null;
  expectedPerMonth: number;
  status: string;
  invoiceSource: string | null;
  facts: SupplierFact[];
}

export function listSuppliers(db: Db): SupplierRow[] {
  const suppliers = db.prepare("SELECT * FROM suppliers ORDER BY name COLLATE NOCASE").all() as {
    id: string;
    name: string;
    country: string | null;
    tax_id: string | null;
    expected_per_month: number;
    status: string;
    invoice_source: string | null;
  }[];
  const facts = db.prepare("SELECT * FROM supplier_facts ORDER BY id").all() as {
    id: number;
    supplier_id: string;
    fact: string;
    value: string | null;
    source_url: string | null;
    quote: string | null;
  }[];
  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    country: s.country,
    taxId: s.tax_id,
    expectedPerMonth: s.expected_per_month,
    status: s.status,
    invoiceSource: s.invoice_source,
    facts: facts
      .filter((f) => f.supplier_id === s.id)
      .map((f) => ({
        id: f.id,
        fact: f.fact,
        value: f.value,
        sourceUrl: f.source_url,
        quote: f.quote,
        unknown: !f.source_url || f.value === null || f.value === "",
      })),
  }));
}

export interface AuditRow {
  id: number;
  at: string;
  runId: number | null;
  actor: string;
  step: string;
  subject: string | null;
  detail: string | null;
  source: string | null;
}

/** Audit log, newest first. Pass a run id to filter. */
export function listAudit(db: Db, runId?: number | null, limit = 500): AuditRow[] {
  const rows = (
    runId == null
      ? db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit)
      : db
          .prepare("SELECT * FROM audit_log WHERE run_id = ? ORDER BY id DESC LIMIT ?")
          .all(runId, limit)
  ) as {
    id: number;
    at: string;
    run_id: number | null;
    actor: string;
    step: string;
    subject: string | null;
    detail: string | null;
    source: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    runId: r.run_id,
    actor: r.actor,
    step: r.step,
    subject: r.subject,
    detail: r.detail,
    source: r.source,
  }));
}

export interface InvoiceListRow {
  id: number;
  fileName: string;
  status: string;
  supplierName: string | null;
  channel: string | null;
}

/** Invoices of a run, for the overview. */
export function listInvoices(db: Db, runId: number): InvoiceListRow[] {
  return (
    db
      .prepare(
        `SELECT i.id, i.file_name, i.status, s.name AS supplier_name, s.invoice_source
         FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.run_id = ? ORDER BY i.id`,
      )
      .all(runId) as {
      id: number;
      file_name: string;
      status: string;
      supplier_name: string | null;
      invoice_source: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    fileName: r.file_name,
    status: r.status,
    supplierName: r.supplier_name,
    channel: r.invoice_source,
  }));
}
