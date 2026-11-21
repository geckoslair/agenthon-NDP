// Runs one month of the autopilot and prints the summary.
// Usage: npx tsx scripts/run-month.ts [2026-10] [--reset]
// Env: DATABASE_PATH, MOCK_BASE_URL, SOURCES (e.g. "email"), ACCOUNTANT_EMAIL.
import { getDb } from "../src/lib/db";
import { resetDemo, runMonth } from "../src/lib/pipeline";

async function main() {
  const args = process.argv.slice(2);
  const month = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? process.env.DEMO_MONTH ?? "2026-10";
  const db = getDb();
  if (args.includes("--reset")) resetDemo(db, { month });
  const summary = await runMonth(db, month);
  console.log(`Run ${summary.runId} for ${summary.month}`);
  console.log(`  documents:          ${summary.invoices}`);
  console.log(`  open exceptions:    ${summary.exceptions}`);
  console.log(`  pending approvals:  ${summary.pendingApprovals}`);
  for (const w of summary.warnings) console.log(`  warning: ${w}`);
  const rows = db
    .prepare(
      `SELECT e.code, COALESCE(i.file_name, e.supplier_id) AS subject, e.evidence
       FROM exceptions e LEFT JOIN invoices i ON i.id = e.invoice_id
       WHERE e.run_id = ? ORDER BY e.id`,
    )
    .all(summary.runId) as { code: string; subject: string | null; evidence: string | null }[];
  for (const r of rows) console.log(`  [${r.code}] ${r.subject ?? "-"}: ${r.evidence ?? ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
