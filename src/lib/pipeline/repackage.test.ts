import { describe, expect, it } from "vitest";
import { decideOutgoing, markSent } from "../audit";
import { openDb, type Db } from "../db";
import { resolveException, runMonth } from "./index";
import { refreshPackage } from "./repackage";
import { packageBlockers } from "./delivery";
import { fakeFetch, LUMEN_PAGE, makeMonth, MONTH } from "./__fixtures__/make-month";
import fs from "node:fs";

async function run(fetchImpl: typeof fetch = fakeFetch) {
  const db = openDb(":memory:");
  const fx = makeMonth();
  const summary = await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: ["email", "billing_api"],
    fetchImpl,
  });
  return { db, summary };
}

type Pkg = { id: number; status: string; subject: string; body: string; attachment_path: string };
const pkg = (db: Db) =>
  db
    .prepare("SELECT id, status, subject, body, attachment_path FROM outbox WHERE kind = 'package'")
    .get() as Pkg;
const exceptionId = (db: Db, code: string) =>
  (
    db.prepare("SELECT id FROM exceptions WHERE code = ? AND status = 'open'").get(code) as {
      id: number;
    }
  ).id;
const zipHas = (file: string, name: string) => fs.readFileSync(file).includes(Buffer.from(name));
const outboxCount = (db: Db) =>
  (db.prepare("SELECT COUNT(*) AS n FROM outbox").get() as { n: number }).n;

describe("package follows resolutions", () => {
  it("rebuilds the pending package when an invoice becomes valid", async () => {
    const { db } = await run();
    const before = pkg(db);
    expect(before.body).toContain("3 fatture in totale");
    expect(before.body).toContain("Vatco GmbH (1 in verifica)");
    expect(zipHas(before.attachment_path, "vatco-77.pdf")).toBe(false);

    resolveException(
      db,
      exceptionId(db, "FOREIGN_VAT_CHARGED"),
      "Nota di credito ricevuta",
      "Anna",
    );

    const after = pkg(db);
    expect(after.status).toBe("pending");
    expect(after.body).toContain("4 fatture in totale");
    expect(after.body).toMatch(/\d+\. Vatco GmbH\n/);
    expect(zipHas(after.attachment_path, "vatco-77.pdf")).toBe(true);
    const log = db
      .prepare("SELECT actor, detail FROM audit_log WHERE step = 'package_rebuilt'")
      .get() as {
      actor: string;
      detail: string;
    };
    expect(log.actor).toBe("Anna");
    expect(log.detail).toContain("4 fatture");
  });

  it("ignores retired MISSING_EXPECTED_INVOICE rows already in the database", async () => {
    const { db, summary } = await run();
    db.prepare(
      "INSERT INTO exceptions (run_id, supplier_id, code, message) VALUES (?, 'glyph', 'MISSING_EXPECTED_INVOICE', 'old')",
    ).run(summary.runId);
    expect(refreshPackage(db, summary.runId, "Anna")).toBe("updated");
    expect(pkg(db).body).not.toContain("DA RICEVERE");
    expect(packageBlockers(db, summary.runId)).toHaveLength(1); // only the supplier request
  });

  it("keeps a resolved duplicate out of the zip", async () => {
    const { db } = await run();
    const id = exceptionId(db, "DUPLICATE");
    resolveException(db, id, "Escluso il duplicato", "Anna");
    const inv = db
      .prepare(
        "SELECT i.status, i.file_name FROM invoices i JOIN exceptions e ON e.invoice_id = i.id WHERE e.id = ?",
      )
      .get(id) as { status: string; file_name: string };
    expect(inv.status).toBe("excluded");
    expect(pkg(db).body).toContain("3 fatture in totale");
    expect(zipHas(pkg(db).attachment_path, inv.file_name)).toBe(false);
  });

  it("does not touch an approved package and logs a warning", async () => {
    const { db } = await run();
    const before = pkg(db);
    expect(decideOutgoing(db, before.id, "approved", "Anna")).toBe(true);
    const rows = outboxCount(db);
    resolveException(db, exceptionId(db, "FOREIGN_VAT_CHARGED"), "Nota di credito", "Anna");
    const after = pkg(db);
    expect(after).toEqual({ ...before, status: "approved" });
    expect(outboxCount(db)).toBe(rows);
    const warning = db
      .prepare("SELECT detail FROM audit_log WHERE step = 'warning' AND subject = ?")
      .get(`outbox:${before.id}`) as { detail: string };
    expect(warning.detail).toContain("approvato");
  });

  it("does not touch a sent package", async () => {
    const { db, summary } = await run();
    const before = pkg(db);
    decideOutgoing(db, before.id, "approved", "Anna");
    markSent(db, before.id);
    expect(refreshPackage(db, summary.runId, "Anna")).toBe("locked");
    expect(pkg(db).body).toBe(before.body);
  });

  it("returns none when a run has no package", () => {
    const db = openDb(":memory:");
    expect(refreshPackage(db, 42, "Anna")).toBe("none");
  });
});

describe("research: a known 'no' blocks the supplier", () => {
  const withPage =
    (page: string): typeof fetch =>
    async (input, init) =>
      new URL(String(input)).pathname === "/mock/portal/lumen/billing-info"
        ? new Response(page)
        : fakeFetch(input, init);

  it("reverse_charge = no raises FOREIGN_VAT_CHARGED with the source as evidence", async () => {
    const page = LUMEN_PAGE.replace(
      '<dd data-fact="reverse_charge" data-value="yes">EU business customers with a valid VAT ID are not charged VAT</dd>',
      '<dd data-fact="reverse_charge" data-value="no">We charge local VAT on all invoices.</dd>',
    );
    const { db } = await run(withPage(page));
    const ex = db
      .prepare(
        "SELECT e.evidence, e.proposed_action, e.supplier_id FROM exceptions e JOIN invoices i ON i.id = e.invoice_id WHERE i.file_name = 'lumen-A1.pdf'",
      )
      .all() as { evidence: string; proposed_action: string; supplier_id: string }[];
    expect(ex).toHaveLength(1);
    expect(ex[0].evidence).toBe(
      '"We charge local VAT on all invoices." (http://mock.test/mock/portal/lumen/billing-info)',
    );
    expect(ex[0].proposed_action).toContain("reverse charge");
    const code = db.prepare("SELECT code FROM exceptions WHERE supplier_id = 'lumen'").get() as {
      code: string;
    };
    expect(code.code).toBe("FOREIGN_VAT_CHARGED");
    const proposed = db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE step = 'supplier_proposed'")
      .get() as {
      n: number;
    };
    expect(proposed.n).toBe(0);
  });

  it("company_addressee = no raises ADDRESSED_TO_PERSON", async () => {
    const page = LUMEN_PAGE.replace(
      'data-fact="company_addressee" data-value="yes">Invoices can be issued to your company name',
      'data-fact="company_addressee" data-value="no">Invoices are issued to the person who bought the service.',
    );
    const { db } = await run(withPage(page));
    const codes = db
      .prepare("SELECT code, evidence FROM exceptions WHERE supplier_id = 'lumen'")
      .all() as {
      code: string;
      evidence: string;
    }[];
    expect(codes.map((c) => c.code)).toEqual(["ADDRESSED_TO_PERSON"]);
    expect(codes[0].evidence).toContain("Invoices are issued to the person");
  });
});
