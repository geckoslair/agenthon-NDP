import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { enabledSources, resetDemo, resolveException, runMonth } from "./index";
import { fakeFetch, makeMonth, MONTH } from "./__fixtures__/make-month";

async function run(sources = ["email", "billing_api"] as const) {
  const db = openDb(":memory:");
  const fx = makeMonth();
  const summary = await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: [...sources],
    fetchImpl: fakeFetch,
  });
  return { db, fx, summary };
}

function exceptionsByFile(db: Db) {
  return db
    .prepare(
      `SELECT i.file_name AS fileName, e.code, e.supplier_id AS supplierId, e.proposed_action AS action, e.evidence
       FROM exceptions e LEFT JOIN invoices i ON i.id = e.invoice_id ORDER BY e.id`,
    )
    .all() as {
    fileName: string | null;
    code: string;
    supplierId: string | null;
    action: string;
    evidence: string;
  }[];
}

describe("runMonth on fixtures", () => {
  it("raises exactly the planted exceptions", async () => {
    const { db } = await run();
    const got = exceptionsByFile(db)
      .map((e) => `${e.fileName ?? e.supplierId}:${e.code}`)
      .sort();
    expect(got).toEqual(
      [
        "glyph:MISSING_EXPECTED_INVOICE",
        "nimbus-INV-1001.pdf:DUPLICATE",
        "person-5.pdf:ADDRESSED_TO_PERSON",
        "shadow-9.pdf:SUPPLIER_FACTS_UNKNOWN",
        "vatco-77.pdf:FOREIGN_VAT_CHARGED",
      ].sort(),
    );
  });

  it("every exception has evidence and an Italian proposed action", async () => {
    const { db } = await run();
    for (const e of exceptionsByFile(db)) {
      expect(e.evidence).toBeTruthy();
      expect(e.action.length).toBeGreaterThan(10);
    }
  });

  it("collects from email and the billing API, and waits for approval", async () => {
    const { db, summary } = await run();
    expect(summary.invoices).toBe(7);
    expect(summary.exceptions).toBe(5);
    const run_ = db.prepare("SELECT status FROM runs WHERE id = ?").get(summary.runId) as {
      status: string;
    };
    expect(run_.status).toBe("waiting_approval");
    const outbox = db
      .prepare("SELECT kind, status, template, attachment_path FROM outbox ORDER BY id")
      .all() as {
      kind: string;
      status: string;
      template: string | null;
      attachment_path: string | null;
    }[];
    expect(outbox.map((o) => [o.kind, o.status])).toEqual([
      ["supplier_request", "pending"],
      ["package", "pending"],
    ]);
    expect(outbox[0].template).toBe("ask_billing_facts");
    expect(fs.existsSync(outbox[1].attachment_path!)).toBe(true);
    expect(summary.pendingApprovals).toBe(2);
    const sources = db
      .prepare("SELECT DISTINCT source FROM audit_log WHERE step = 'document_collected'")
      .all();
    expect(sources.length).toBe(7);
  });

  it("researches the unknown supplier with sources and proposes it", async () => {
    const { db } = await run();
    const lumen = db.prepare("SELECT status FROM suppliers WHERE id = 'lumen'").get() as {
      status: string;
    };
    expect(lumen.status).toBe("unknown");
    const facts = db
      .prepare("SELECT fact, source_url, quote FROM supplier_facts WHERE supplier_id = 'lumen'")
      .all() as {
      fact: string;
      source_url: string;
      quote: string;
    }[];
    expect(facts.find((f) => f.fact === "reverse_charge")?.source_url).toBe(
      "http://mock.test/mock/portal/lumen/billing-info",
    );
    for (const f of facts) expect(f.quote).toBeTruthy();
    const proposed = db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_log WHERE step = 'supplier_proposed' AND subject = 'supplier:lumen'",
      )
      .get() as { n: number };
    expect(proposed.n).toBe(1);
    // shadow: no page, so the page facts stay unknown and nothing is stored without a source
    const shadow = db
      .prepare("SELECT fact FROM supplier_facts WHERE supplier_id = 'shadow'")
      .all() as { fact: string }[];
    expect(shadow.map((f) => f.fact)).not.toContain("reverse_charge");
  });

  it("the package email lists valid and pending invoices", async () => {
    const { db } = await run();
    const pkg = db.prepare("SELECT subject, body FROM outbox WHERE kind = 'package'").get() as {
      subject: string;
      body: string;
    };
    expect(pkg.subject).toBe("Acme Studio SRL | Acquisti esteri Ottobre 2026");
    expect(pkg.body).toContain("3 fatture in totale");
    expect(pkg.body).toContain("Glyph Fonts AB (DA RICEVERE)");
    expect(pkg.body).toContain("Vatco GmbH (1 in verifica)");
  });

  it("an unreachable source becomes a warning, not a crash", async () => {
    const db = openDb(":memory:");
    const fx = makeMonth();
    const failing: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const summary = await runMonth(db, MONTH, {
      demoDir: fx.demoDir,
      dataDir: fx.dataDir,
      baseUrl: "http://mock.test",
      sources: ["email", "billing_api"],
      fetchImpl: failing,
    });
    expect(summary.warnings.some((w) => w.includes("orbit"))).toBe(true);
    const codes = exceptionsByFile(db).map((e) => `${e.supplierId}:${e.code}`);
    expect(codes).toContain("orbit:MISSING_EXPECTED_INVOICE");
    const logged = db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE step = 'warning'")
      .get() as { n: number };
    expect(logged.n).toBeGreaterThan(0);
  });

  it("a second run starts a fresh run", async () => {
    const { db, fx } = await run();
    const second = await runMonth(db, MONTH, {
      demoDir: fx.demoDir,
      dataDir: fx.dataDir,
      baseUrl: "http://mock.test",
      sources: ["email"],
      fetchImpl: fakeFetch,
    });
    expect(second.runId).toBe(2);
  });

  it("rejects an invalid month and a missing demo folder", async () => {
    const db = openDb(":memory:");
    await expect(runMonth(db, "2026-13")).rejects.toThrow();
    await expect(runMonth(db, "2020-01", { demoDir: "/nonexistent" })).rejects.toThrow();
  });
});

describe("resolveException", () => {
  it("records who resolved it and clears the invoice when nothing is open", async () => {
    const { db } = await run();
    const ex = db
      .prepare("SELECT e.id, e.invoice_id FROM exceptions e WHERE code = 'FOREIGN_VAT_CHARGED'")
      .get() as { id: number; invoice_id: number };
    expect(resolveException(db, ex.id, "Nota di credito ricevuta", "Anna")).toBe(true);
    const row = db
      .prepare("SELECT status, resolved_by, resolution FROM exceptions WHERE id = ?")
      .get(ex.id) as Record<string, string>;
    expect(row).toMatchObject({
      status: "resolved",
      resolved_by: "Anna",
      resolution: "Nota di credito ricevuta",
    });
    const inv = db.prepare("SELECT status FROM invoices WHERE id = ?").get(ex.invoice_id) as {
      status: string;
    };
    expect(inv.status).toBe("ok");
    const log = db
      .prepare("SELECT actor FROM audit_log WHERE step = 'exception_resolved'")
      .get() as { actor: string };
    expect(log.actor).toBe("Anna");
  });

  it("returns false for an unknown or already resolved exception", async () => {
    const { db } = await run();
    expect(resolveException(db, 9999, "x", "Anna")).toBe(false);
    const ex = db.prepare("SELECT id FROM exceptions LIMIT 1").get() as { id: number };
    expect(resolveException(db, ex.id, "ok", "Anna")).toBe(true);
    expect(resolveException(db, ex.id, "ok", "Anna")).toBe(false);
  });

  it("requires a person", async () => {
    const { db } = await run();
    expect(() => resolveException(db, 1, "x", " ")).toThrow();
  });
});

describe("resetDemo", () => {
  it("wipes runs but keeps the audit log, and reloads the registry", async () => {
    const { db, fx } = await run();
    const before = (db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n;
    resetDemo(db, { demoDir: fx.demoDir, month: MONTH });
    expect((db.prepare("SELECT COUNT(*) AS n FROM runs").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM suppliers").get() as { n: number }).n).toBe(5);
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n).toBe(
      before + 1,
    );
  });

  it("works with no demo data", () => {
    const db = openDb(":memory:");
    resetDemo(db, { demoDir: path.join("/nonexistent") });
    expect((db.prepare("SELECT COUNT(*) AS n FROM suppliers").get() as { n: number }).n).toBe(0);
  });
});

describe("enabledSources", () => {
  it("defaults to all three in order", () => {
    expect(enabledSources(undefined)).toEqual(["email", "billing_api", "browser"]);
  });
  it("reads a comma list, ignoring case and unknown names", () => {
    expect(enabledSources("Email, foo")).toEqual(["email"]);
    expect(enabledSources("browser,email")).toEqual(["email", "browser"]);
  });
});
