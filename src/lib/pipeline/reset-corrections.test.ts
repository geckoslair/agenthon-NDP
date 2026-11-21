import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { resetDemo } from "./index";

describe("resetDemo with a correction request on file", () => {
  it("clears the corrections table instead of failing on its foreign keys", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO runs (id, month) VALUES (1, '2026-10')").run();
    db.prepare(
      "INSERT INTO invoices (id, run_id, file_name, extracted) VALUES (1, 1, 'a.pdf', '{}')",
    ).run();
    db.prepare(
      "INSERT INTO exceptions (id, run_id, invoice_id, code, message) VALUES (1, 1, 1, 'FOREIGN_VAT_CHARGED', 'm')",
    ).run();
    db.prepare(
      "INSERT INTO outbox (id, run_id, kind, recipient, subject, body) VALUES (1, 1, 'supplier_request', 'a@b.example', 's', 'b')",
    ).run();
    db.prepare(
      "INSERT INTO corrections (run_id, invoice_id, exception_id, outbox_id, requested_by) VALUES (1, 1, 1, 1, 'Giulia Ferraris')",
    ).run();

    expect(() => resetDemo(db, { demoDir: "/nonexistent" })).not.toThrow();
    for (const table of ["corrections", "exceptions", "invoices", "outbox", "runs"]) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });
});
