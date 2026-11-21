// CONTRACT FILE. Owned by the coordinator: do not change without asking.
// The three ways an invoice reaches the autopilot. All of them run on synthetic
// sources in this repository (fixture mailbox, mock billing API, fake supplier portal).

export type SourceKind = "email" | "billing_api" | "browser";

export interface CollectedDocument {
  /** File name, unique within the month, e.g. "nimbus-INV-1001.pdf". */
  fileName: string;
  /** Absolute path of the PDF on disk after collection. */
  path: string;
  source: SourceKind;
  /** Where it came from: message id, API URL or page URL. Goes to the audit log. */
  origin: string;
  /** Supplier id from the registry when the channel knows it, else null. */
  supplierId: string | null;
}

export interface InvoiceSource {
  kind: SourceKind;
  /** Collects every document of the month ("YYYY-MM"). Must not throw for "nothing found". */
  collect(month: string): Promise<CollectedDocument[]>;
}

/**
 * Collection order for a supplier, as decided by the team:
 * 1. email, 2. the supplier's billing API when it has one, 3. browsing the supplier's
 * portal as a fallback. A later channel is used only for documents still missing.
 */
export const SOURCE_ORDER: SourceKind[] = ["email", "billing_api", "browser"];
