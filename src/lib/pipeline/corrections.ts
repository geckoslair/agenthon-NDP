// A person attaches the corrected document a supplier sent. Only the document itself, read
// and checked by the same rules, can resolve the exception: never a note or an email.
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import { logStep } from "../audit";
import { generateSelfInvoices } from "../compliance";
import { getExtractor } from "../extractor";
import { validateInvoice } from "../rules";
import { safeFileName } from "../sources/fs-util";
import type { ExtractedInvoice } from "../types";
import { EXCEPTION_TEXT } from "./messages";
import { runCompany } from "./manual-fields";
import { refreshPackage } from "./repackage";
import { CORRECTABLE_CODES } from "./workflow";

/** Codes the deterministic rules can re-check on a corrected document. */
const RECHECKABLE = [
  "ADDRESSED_TO_PERSON",
  "FOREIGN_VAT_CHARGED",
  "WRONG_MONTH",
  "NOT_FOREIGN",
  "UNREADABLE_FIELD",
];

export async function attachCorrectedDocument(
  db: Db,
  exceptionId: number,
  fileName: string,
  bytes: Buffer,
  person: string,
  options: { demoDir?: string; dataDir?: string } = {},
): Promise<{ ok: boolean; resolved: boolean; message: string }> {
  if (!person?.trim()) return { ok: false, resolved: false, message: "Scrivi il tuo nome." };
  const ex = db
    .prepare(
      `SELECT e.id, e.run_id, e.invoice_id, e.code, e.status, e.supplier_id, r.month
       FROM exceptions e JOIN runs r ON r.id = e.run_id WHERE e.id = ?`,
    )
    .get(exceptionId) as
    | {
        id: number;
        run_id: number;
        invoice_id: number | null;
        code: string;
        status: string;
        supplier_id: string | null;
        month: string;
      }
    | undefined;
  if (!ex || ex.status !== "open" || ex.invoice_id === null) {
    return { ok: false, resolved: false, message: "L'eccezione non è più aperta." };
  }
  if (!CORRECTABLE_CODES.includes(ex.code)) {
    return {
      ok: false,
      resolved: false,
      message: "Per questa eccezione non si allega un documento corretto.",
    };
  }
  const name = safeFileName(fileName);
  if (!name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, resolved: false, message: "Allega il documento corretto in PDF." };
  }

  // Save the PDF next to the run's other files; the original invoice and PDF stay untouched.
  const pkg = db
    .prepare(
      "SELECT attachment_path FROM outbox WHERE run_id = ? AND kind = 'package' AND attachment_path IS NOT NULL ORDER BY id DESC LIMIT 1",
    )
    .get(ex.run_id) as { attachment_path: string } | undefined;
  const dataDir =
    options.dataDir ??
    (pkg ? path.dirname(path.dirname(pkg.attachment_path)) : path.join(process.cwd(), "data"));
  const dir = path.join(dataDir, "corrections", `${ex.month}-run-${ex.run_id}`);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${exceptionId}-${name}`);
  fs.writeFileSync(target, bytes);

  let correctionId = (
    db
      .prepare(
        "SELECT id FROM corrections WHERE exception_id = ? AND status = 'requested' ORDER BY id DESC LIMIT 1",
      )
      .get(exceptionId) as { id: number } | undefined
  )?.id;
  if (correctionId === undefined) {
    correctionId = Number(
      db
        .prepare(
          "INSERT INTO corrections (run_id, invoice_id, exception_id, status, requested_by) VALUES (?, ?, ?, 'requested', ?)",
        )
        .run(ex.run_id, ex.invoice_id, exceptionId, person).lastInsertRowid,
    );
  }
  db.prepare(
    `UPDATE corrections SET status = 'document_received', corrected_file = ?, corrected_path = ?,
       attached_by = ?, attached_at = datetime('now') WHERE id = ?`,
  ).run(name, target, person, correctionId);
  logStep(db, {
    runId: ex.run_id,
    actor: person,
    step: "correction_attached",
    subject: `invoice:${ex.invoice_id}`,
    detail: `Documento corretto allegato: ${name} (correction:${correctionId})`,
    source: target,
  });

  const fail = (reason: string) => {
    db.prepare("UPDATE corrections SET status = 'failed', failure_reason = ? WHERE id = ?").run(
      reason,
      correctionId,
    );
    logStep(db, {
      runId: ex.run_id,
      actor: "autopilot",
      step: "correction_failed",
      subject: `invoice:${ex.invoice_id}`,
      detail: `${ex.code} (exception:${exceptionId}) resta aperta: ${reason}`,
      source: target,
    });
  };

  // Read with the configured extractor. The demo extractor reads only documents that have
  // a ground truth under demo/<month>/corrections/truth/<name>.json, never the original's.
  const demoDir = options.demoDir ?? path.join(process.cwd(), "demo");
  let corrected: ExtractedInvoice;
  try {
    const extractor = getExtractor(path.join(demoDir, ex.month, "corrections", "truth"));
    corrected = await extractor.extract({
      fileName: name,
      path: target,
      source: "email",
      origin: `correction:${correctionId}`,
      supplierId: ex.supplier_id,
    });
  } catch {
    const message =
      "L'estrattore della demo non sa leggere questo PDF: il documento non è stato verificato e l'eccezione resta aperta.";
    fail(message);
    return { ok: false, resolved: false, message };
  }
  db.prepare("UPDATE corrections SET corrected_extracted = ? WHERE id = ?").run(
    JSON.stringify(corrected),
    correctionId,
  );

  const company = runCompany(db, ex.run_id, ex.month);
  const found = validateInvoice(corrected, company, ex.month);
  const foundCodes = new Set(found.map((f) => f.code as string));
  const open = db
    .prepare("SELECT id, code FROM exceptions WHERE invoice_id = ? AND status = 'open'")
    .all(ex.invoice_id) as { id: number; code: string }[];

  db.transaction(() => {
    for (const o of open) {
      if (!RECHECKABLE.includes(o.code) || foundCodes.has(o.code)) continue;
      db.prepare(
        `UPDATE exceptions SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now'),
           resolution = ? WHERE id = ?`,
      ).run(person, `Risolta dal documento corretto ${name}, verificato dalle regole`, o.id);
      logStep(db, {
        runId: ex.run_id,
        actor: person,
        step: "exception_resolved",
        subject: `exception:${o.id}`,
        detail: `${o.code}: risolta dal documento corretto ${name}`,
        source: target,
      });
    }
    const openCodes = new Set(open.map((o) => o.code));
    for (const f of found) {
      if (openCodes.has(f.code)) continue;
      const text = EXCEPTION_TEXT[f.code];
      const id = Number(
        db
          .prepare(
            `INSERT INTO exceptions (run_id, invoice_id, supplier_id, code, message, evidence, proposed_action)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            ex.run_id,
            ex.invoice_id,
            ex.supplier_id,
            f.code,
            `${text.message} (documento corretto ${name})`,
            f.evidence,
            text.action,
          ).lastInsertRowid,
      );
      logStep(db, {
        runId: ex.run_id,
        actor: "autopilot",
        step: "exception_raised",
        subject: `invoice:${ex.invoice_id}`,
        detail: `${f.code} (exception:${id}) sul documento corretto ${name}`,
        source: target,
      });
    }
    const stillOpen = (
      db
        .prepare("SELECT COUNT(*) AS n FROM exceptions WHERE invoice_id = ? AND status = 'open'")
        .get(ex.invoice_id) as { n: number }
    ).n;
    db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(
      stillOpen === 0 ? "ok" : "exception",
      ex.invoice_id,
    );
  })();

  const resolved = !foundCodes.has(ex.code);
  if (resolved) {
    db.prepare("UPDATE corrections SET status = 'validated' WHERE id = ?").run(correctionId);
    logStep(db, {
      runId: ex.run_id,
      actor: "autopilot",
      step: "correction_validated",
      subject: `invoice:${ex.invoice_id}`,
      detail: `Il documento corretto ${name} supera il controllo ${ex.code}`,
      source: target,
    });
  } else {
    fail(`Il documento corretto presenta ancora il problema ${ex.code}.`);
  }
  refreshPackage(db, ex.run_id, person);
  generateSelfInvoices(db, ex.run_id);
  return {
    ok: true,
    resolved,
    message: resolved
      ? "Documento corretto verificato: il problema è risolto."
      : "Il documento corretto presenta ancora il problema: l'eccezione resta aperta.",
  };
}
