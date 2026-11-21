// The package as the database says it is now: used by the run and after every resolution.
import path from "node:path";
import type { Db } from "../db";
import { logStep } from "../audit";
import { buildSummaryEmail, type PackageEntry } from "../package";
import { writeZipSync } from "../package/zip-sync";

/** Where the run saved the collected PDFs. */
export function collectedDir(dataDir: string, month: string, runId: number): string {
  return path.join(dataDir, "collected", month, `run-${runId}`);
}

export function packagePath(dataDir: string, month: string, runId: number): string {
  return path.join(dataDir, "packages", `${month}-run-${runId}.zip`);
}

export interface PackageContents {
  entries: PackageEntry[];
  /** File names of the invoices that go in the zip. */
  fileNames: string[];
  pending: number;
}

/**
 * Valid invoices go in the zip; invoices with open exceptions are listed as pending;
 * excluded invoices and open duplicates are left out; open "missing" exceptions show
 * the supplier as DA RICEVERE.
 */
export function packageContents(db: Db, runId: number): PackageContents {
  const invoices = db
    .prepare(
      `SELECT i.id, i.file_name, i.status, i.extracted, s.name AS supplier_name,
         EXISTS (SELECT 1 FROM exceptions e WHERE e.invoice_id = i.id AND e.status = 'open'
                 AND e.code = 'DUPLICATE') AS open_duplicate
       FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.run_id = ? ORDER BY i.id`,
    )
    .all(runId) as {
    id: number;
    file_name: string;
    status: "ok" | "exception" | "excluded";
    extracted: string;
    supplier_name: string | null;
    open_duplicate: number;
  }[];
  const entries = new Map<string, PackageEntry>();
  const entry = (name: string) => {
    const e = entries.get(name) ?? {
      supplierName: name,
      included: 0,
      pending: 0,
      toReceive: false,
    };
    entries.set(name, e);
    return e;
  };
  const fileNames: string[] = [];
  let pending = 0;
  for (const inv of invoices) {
    if (inv.status === "excluded" || inv.open_duplicate) continue;
    let extractedName: string | null = null;
    try {
      extractedName = JSON.parse(inv.extracted)?.supplierName?.value ?? null;
    } catch {
      extractedName = null;
    }
    const e = entry(inv.supplier_name ?? extractedName ?? inv.file_name);
    if (inv.status === "ok") {
      e.included += 1;
      fileNames.push(inv.file_name);
    } else {
      e.pending += 1;
      pending += 1;
    }
  }
  // MISSING_EXPECTED_INVOICE is retired: no "DA RICEVERE" notes from old rows.
  return { entries: [...entries.values()], fileNames, pending };
}

/** Builds the zip and the summary email from the current state of the run. */
export function buildPackage(
  db: Db,
  runId: number,
  month: string,
  companyName: string,
  dataDir: string,
): { subject: string; body: string; zipPath: string; total: number; pending: number } {
  const contents = packageContents(db, runId);
  const dir = collectedDir(dataDir, month, runId);
  const zipPath = writeZipSync(
    contents.fileNames.map((name) => ({ path: path.join(dir, name), name })),
    packagePath(dataDir, month, runId),
  );
  const email = buildSummaryEmail(companyName, month, contents.entries);
  return { ...email, zipPath, pending: contents.pending };
}

/**
 * After a person's decision, rebuilds the run's package if it is still waiting for
 * approval. An approved or sent package is never changed: a warning is logged instead.
 */
export function refreshPackage(
  db: Db,
  runId: number,
  person: string,
): "updated" | "locked" | "none" {
  const row = db
    .prepare(
      `SELECT o.id, o.status, o.subject, o.attachment_path, r.month FROM outbox o
       JOIN runs r ON r.id = o.run_id
       WHERE o.run_id = ? AND o.kind = 'package' ORDER BY o.id DESC LIMIT 1`,
    )
    .get(runId) as
    | { id: number; status: string; subject: string; attachment_path: string | null; month: string }
    | undefined;
  if (!row) return "none";
  if (row.status !== "pending") {
    logStep(db, {
      runId,
      actor: "autopilot",
      step: "warning",
      subject: `outbox:${row.id}`,
      detail: `Il pacchetto è già ${row.status === "sent" ? "inviato" : "approvato"}: non lo modifico. La correzione andrà nel prossimo invio.`,
    });
    return "locked";
  }
  const companyName = row.subject.split(" | ")[0];
  const dataDir = row.attachment_path
    ? path.dirname(path.dirname(row.attachment_path))
    : path.join(process.cwd(), "data");
  const pkg = buildPackage(db, runId, row.month, companyName, dataDir);
  db.prepare(
    "UPDATE outbox SET subject = ?, body = ?, attachment_path = ? WHERE id = ? AND status = 'pending'",
  ).run(pkg.subject, pkg.body, pkg.zipPath, row.id);
  logStep(db, {
    runId,
    actor: person,
    step: "package_rebuilt",
    subject: `outbox:${row.id}`,
    detail: `Pacchetto aggiornato: ${pkg.total} fatture nello zip, ${pkg.pending} in sospeso`,
    source: pkg.zipPath,
  });
  return "updated";
}
