// SQLite persistence. One local file, created on first use. See docs/spec.md.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  tax_id TEXT,
  expected_per_month INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('approved','unknown','rejected')),
  invoice_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A fact established about a supplier. No source means the fact is unknown.
CREATE TABLE IF NOT EXISTS supplier_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  fact TEXT NOT NULL,
  value TEXT,
  source_url TEXT,
  quote TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','waiting_approval','approved','sent')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  file_name TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  -- Collection channel ('email' | 'billing_api' | 'browser') and where it came from.
  source TEXT,
  origin TEXT,
  -- JSON of ExtractedInvoice: every value with its quote and page.
  extracted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','exception','excluded'))
);

CREATE TABLE IF NOT EXISTS card_charges (
  id TEXT PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  invoice_id INTEGER REFERENCES invoices(id),
  supplier_id TEXT REFERENCES suppliers(id),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  evidence TEXT,
  proposed_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT
);

-- Everything that would leave the company. Nothing is sent while status is 'pending'.
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES runs(id),
  kind TEXT NOT NULL CHECK (kind IN ('package','supplier_request','accountant_request')),
  template TEXT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','sent')),
  -- 'person' or 'auto_policy' (a template the person explicitly allowed to send unattended).
  approved_via TEXT,
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT
);

-- Templates a person has explicitly allowed to be sent without a click.
-- Off by default: the first send of any template always needs approval.
CREATE TABLE IF NOT EXISTS auto_send_policies (
  template TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  enabled_by TEXT,
  enabled_at TEXT
);

-- Self-invoice ("autofattura") drafts for the month's valid foreign invoices, their
-- simulated submission to SdI and their simulated export to the accounting software.
-- Nothing is submitted or exported while status is 'draft' or 'needs_input'.
CREATE TABLE IF NOT EXISTS self_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  -- Document type code as reported by the accountant for services (docs/domain.md).
  doc_type TEXT NOT NULL DEFAULT 'TD17',
  number TEXT NOT NULL,
  -- Taxable amount in EUR; NULL until a person supplies it for non-EUR invoices.
  taxable_eur REAL,
  vat_rate REAL NOT NULL,
  vat_eur REAL,
  xml_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('needs_input','draft','approved','submitted','rejected')),
  -- Why a person must act before approval (e.g. missing EUR amount); NULL otherwise.
  needs_input_reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  submitted_at TEXT,
  -- Receipt id returned by the simulated SdI endpoint.
  sdi_receipt TEXT,
  accounting_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (accounting_status IN ('pending','exported')),
  accounting_ref TEXT,
  exported_by TEXT,
  exported_at TEXT,
  UNIQUE (run_id, invoice_id)
);

-- Append-only trail: what was done, on which input, who approved it.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  run_id INTEGER,
  actor TEXT NOT NULL,
  step TEXT NOT NULL,
  subject TEXT,
  detail TEXT,
  source TEXT
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;

export type Db = Database.Database;

/** Adds columns introduced after a database file was first created. */
function migrate(db: Db): void {
  const columns = (db.prepare("PRAGMA table_info(invoices)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  for (const column of ["source", "origin"]) {
    if (!columns.includes(column)) db.exec(`ALTER TABLE invoices ADD COLUMN ${column} TEXT`);
  }
}

/** Opens (and creates if needed) a database. Pass ":memory:" in tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

let shared: Db | null = null;

/** The application database, at DATABASE_PATH or data/app.db. */
export function getDb(): Db {
  shared ??= openDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db"));
  return shared;
}
