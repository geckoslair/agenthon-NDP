import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { buildActionBrief } from "./brief";

function seed(codes: [string, string][]) {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO runs (id, month) VALUES (1, '2026-10')").run();
  codes.forEach(([code, supplier], i) => {
    db.prepare("INSERT OR IGNORE INTO suppliers (id, name) VALUES (?, ?)").run(supplier, supplier);
    db.prepare(
      "INSERT INTO invoices (id, run_id, file_name, supplier_id, extracted, status) VALUES (?, 1, ?, ?, '{}', 'exception')",
    ).run(i + 1, `f${i}.pdf`, supplier);
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, supplier_id, code, message) VALUES (1, ?, ?, ?, 'm')",
    ).run(i + 1, supplier, code);
  });
  return db;
}

describe("buildActionBrief", () => {
  it("asks to start a closure when there is none", () => {
    expect(buildActionBrief(openDb(":memory:"))).toContain("Nessuna chiusura avviata");
  });

  it("leads with the deadline and the supplier that blocks the package", () => {
    const text = buildActionBrief(
      seed([
        ["UNREADABLE_FIELD", "Tandoor"],
        ["SUPPLIER_FACTS_UNKNOWN", "Sable Tools LLC"],
        ["FOREIGN_VAT_CHARGED", "Lumen"],
        ["WRONG_MONTH", "Vesper"],
      ]),
      11,
    );
    expect(text.startsWith("Mancano 11 giorni alla scadenza.")).toBe(true);
    expect(text).toContain("manca la risposta di Sable Tools LLC");
    expect(text).toContain("un dato da inserire a mano");
    expect(text).toContain("una fattura di un altro mese da escludere");
    expect(text).toContain("Una fattura va fatta correggere dal fornitore: Lumen");
    expect(text).toContain("oppure escludila.");
    expect(text.indexOf("Sable")).toBeLessThan(text.indexOf("Puoi chiudere subito"));
  });

  it("says nothing is urgent when no exception is open, and handles a passed deadline", () => {
    const text = buildActionBrief(seed([]), -3);
    expect(text).toContain("La scadenza è passata.");
    expect(text).toContain("Nessuna azione urgente.");
  });

  it("ignores retired missing-invoice rows", () => {
    expect(buildActionBrief(seed([["MISSING_EXPECTED_INVOICE", "Marlow"]]))).not.toContain(
      "Marlow",
    );
  });
});
