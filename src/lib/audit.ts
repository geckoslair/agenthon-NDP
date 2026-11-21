// Audit trail and the approval gate for anything that leaves the company.
import type { Db } from "./db";

export interface AuditEntry {
  runId?: number | null;
  /** "autopilot" or the name of the person who acted. */
  actor: string;
  step: string;
  subject?: string | null;
  detail?: string | null;
  source?: string | null;
}

export function logStep(db: Db, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (run_id, actor, step, subject, detail, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.runId ?? null,
    entry.actor,
    entry.step,
    entry.subject ?? null,
    entry.detail ?? null,
    entry.source ?? null,
  );
}

export interface OutboxDraft {
  runId?: number | null;
  kind: "package" | "supplier_request" | "accountant_request";
  /** Predefined template name; only templated emails can ever be auto-sent. */
  template?: string | null;
  recipient: string;
  subject: string;
  body: string;
  attachmentPath?: string | null;
}

/**
 * Queues an outgoing email. It stays "pending" until a person approves it, unless a
 * person has previously enabled auto-send for this exact template. The monthly package
 * is never auto-approved.
 */
export function queueOutgoing(db: Db, draft: OutboxDraft): { id: number; status: string } {
  const policy =
    draft.template && draft.kind !== "package"
      ? (db
          .prepare("SELECT enabled, enabled_by FROM auto_send_policies WHERE template = ?")
          .get(draft.template) as { enabled: number; enabled_by: string | null } | undefined)
      : undefined;
  const auto = policy?.enabled === 1;

  const result = db
    .prepare(
      `INSERT INTO outbox
         (run_id, kind, template, recipient, subject, body, attachment_path,
          status, approved_via, approved_by, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${auto ? "datetime('now')" : "NULL"})`,
    )
    .run(
      draft.runId ?? null,
      draft.kind,
      draft.template ?? null,
      draft.recipient,
      draft.subject,
      draft.body,
      draft.attachmentPath ?? null,
      auto ? "approved" : "pending",
      auto ? "auto_policy" : null,
      auto ? (policy?.enabled_by ?? null) : null,
    );
  const id = Number(result.lastInsertRowid);
  logStep(db, {
    runId: draft.runId,
    actor: "autopilot",
    step: auto ? "outgoing_auto_approved" : "outgoing_waiting_approval",
    subject: `outbox:${id}`,
    detail: auto
      ? `Template "${draft.template}" allowed to auto-send by ${policy?.enabled_by}`
      : `${draft.kind} to ${draft.recipient}`,
  });
  return { id, status: auto ? "approved" : "pending" };
}

/** A person approves or rejects a pending email. Returns false if it was not pending. */
export function decideOutgoing(
  db: Db,
  id: number,
  decision: "approved" | "rejected",
  person: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE outbox SET status = ?, approved_via = 'person', approved_by = ?,
         approved_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .run(decision, person, id);
  if (result.changes === 0) return false;
  logStep(db, { actor: person, step: `outgoing_${decision}`, subject: `outbox:${id}` });
  return true;
}

/** Marks an email as sent (the demo does not send for real). Only approved emails can be sent. */
export function markSent(db: Db, id: number): boolean {
  const result = db
    .prepare(
      "UPDATE outbox SET status = 'sent', sent_at = datetime('now') WHERE id = ? AND status = 'approved'",
    )
    .run(id);
  if (result.changes === 0) return false;
  logStep(db, { actor: "autopilot", step: "outgoing_sent", subject: `outbox:${id}` });
  return true;
}

/** A person allows (or revokes) unattended sending for one predefined template. */
export function setAutoSend(db: Db, template: string, enabled: boolean, person: string): void {
  db.prepare(
    `INSERT INTO auto_send_policies (template, enabled, enabled_by, enabled_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(template) DO UPDATE SET enabled = excluded.enabled,
       enabled_by = excluded.enabled_by, enabled_at = excluded.enabled_at`,
  ).run(template, enabled ? 1 : 0, person);
  logStep(db, {
    actor: person,
    step: enabled ? "auto_send_enabled" : "auto_send_disabled",
    subject: `template:${template}`,
  });
}
