// CONTRACT FILE for the signatures; the pipeline stream owns the implementation.
// The UI calls only these functions (plus src/lib/audit.ts) to change state.
import type { Db } from "../db";

export interface RunSummary {
  runId: number;
  month: string;
  invoices: number;
  exceptions: number;
  /** Outbox rows waiting for a person. */
  pendingApprovals: number;
}

/**
 * Runs the whole month: collect from the three sources, extract, match suppliers,
 * research unknown ones, validate, check completeness, build the package and queue it
 * for approval. Idempotent per month: a second call starts a fresh run.
 */
export async function runMonth(db: Db, month: string): Promise<RunSummary> {
  void db;
  throw new Error(`runMonth(${month}) is not implemented yet`);
}

/** A person resolves an exception. `resolution` is free text shown in the log. */
export function resolveException(
  db: Db,
  exceptionId: number,
  resolution: string,
  person: string,
): boolean {
  void db;
  void resolution;
  void person;
  throw new Error(`resolveException(${exceptionId}) is not implemented yet`);
}

/** Wipes run data (not the audit log) and reloads the demo registry, for a clean demo. */
export function resetDemo(db: Db): void {
  void db;
  throw new Error("resetDemo is not implemented yet");
}
