import { beforeEach, describe, expect, it } from "vitest";
import { queueOutgoing, setAutoSend } from "./audit";
import { openDb, type Db } from "./db";
import {
  attachmentName,
  getInvoice,
  getLatestRun,
  getOverview,
  DEFAULT_MONTH,
  listAudit,
  getSupplier,
  getOutbox,
  getRunForMonth,
  listMonths,
  listSelfInvoices,
  getSelfInvoice,
  getComplianceCounts,
  listAutoSend,
  listExceptions,
  listInvoiceExceptions,
  listInvoices,
  listOutbox,
  listRuns,
  listSuppliers,
} from "./queries";

let db: Db;

function sourced<T>(value: T | null, quote: string | null = null, page: number | null = null) {
  return { value, quote, page };
}

function extractedJson() {
  return JSON.stringify({
    supplierName: sourced("Nimbus", "Nimbus Cloud Ltd", 1),
    totalAmount: sourced(120, "Total 120.00", 1),
    currency: sourced("EUR", "EUR", 1),
  });
}

beforeEach(() => {
  db = openDb(":memory:");
  const sup = db.prepare(
    "INSERT INTO suppliers (id, name, country, tax_id, expected_per_month, status, invoice_source) VALUES (?,?,?,?,?,?,?)",
  );
  sup.run("nimbus", "Nimbus", "IE", "IE123", 1, "approved", "email");
  sup.run("orbit", "Orbit", "DE", null, 1, "unknown", "api");
  db.prepare("INSERT INTO runs (month, status) VALUES ('2026-10', 'waiting_approval')").run();
});

function addInvoice(
  file: string,
  supplier: string | null,
  status: string,
  extracted = extractedJson(),
) {
  return Number(
    db
      .prepare(
        "INSERT INTO invoices (run_id, file_name, supplier_id, extracted, status) VALUES (1,?,?,?,?)",
      )
      .run(file, supplier, extracted, status).lastInsertRowid,
  );
}

describe("getOverview", () => {
  it("is empty with the default month when there is no run", () => {
    const empty = openDb(":memory:");
    const o = getOverview(empty);
    expect(o.run).toBeNull();
    expect(o.month).toBe(DEFAULT_MONTH);
    expect(o.collected).toBe(0);
    expect(o.package).toBeNull();
  });

  it("counts invoices by channel and status, ignoring retired exceptions", () => {
    const a = addInvoice("a.pdf", "nimbus", "ok");
    addInvoice("b.pdf", "orbit", "exception");
    addInvoice("c.pdf", null, "ok");
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, code, message) VALUES (1,?, 'DUPLICATE', 'dup')",
    ).run(a);
    db.prepare(
      "INSERT INTO exceptions (run_id, supplier_id, code, message) VALUES (1,'orbit','MISSING_EXPECTED_INVOICE','missing')",
    ).run();
    db.prepare(
      "INSERT INTO exceptions (run_id, supplier_id, code, message, status) VALUES (1,'orbit','MISSING_EXPECTED_INVOICE','old','resolved')",
    ).run();
    queueOutgoing(db, {
      runId: 1,
      kind: "package",
      recipient: "x@example.com",
      subject: "s",
      body: "b",
    });
    const o = getOverview(db);
    expect(o.collected).toBe(3);
    expect(o.ready).toBe(2);
    expect(o.blocked).toBe(1);
    // MISSING_EXPECTED_INVOICE is retired: old rows are ignored by every counter.
    expect(o.openExceptions).toBe(1);
    expect(o.pendingApprovals).toBe(1);
    expect(o.package?.status).toBe("pending");
    expect(Object.fromEntries(o.channels.map((c) => [c.channel, c.count]))).toEqual({
      email: 1,
      api: 1,
      unknown: 1,
    });
  });

  it("uses the latest run", () => {
    db.prepare("INSERT INTO runs (month) VALUES ('2026-11')").run();
    expect(getLatestRun(db)?.month).toBe("2026-11");
    expect(getOverview(db).collected).toBe(0);
    expect(listRuns(db).map((r) => r.id)).toEqual([2, 1]);
  });
});

describe("exceptions", () => {
  it("lists open and resolved with invoice and supplier names", () => {
    const inv = addInvoice("a.pdf", "nimbus", "exception");
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, code, message, evidence, proposed_action) VALUES (1,?,'WRONG_MONTH','m','quote','do x')",
    ).run(inv);
    db.prepare(
      `INSERT INTO exceptions (run_id, code, message, status, resolution, resolved_by, resolved_at)
       VALUES (1,'DUPLICATE','m2','resolved','fine','Maria','2026-11-21 10:00:00')`,
    ).run();
    const open = listExceptions(db, "open");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      code: "WRONG_MONTH",
      invoiceFile: "a.pdf",
      supplierName: "Nimbus",
      evidence: "quote",
      proposedAction: "do x",
    });
    const resolved = listExceptions(db, "resolved");
    expect(resolved[0]).toMatchObject({
      resolvedBy: "Maria",
      resolution: "fine",
      supplierName: null,
    });
    expect(listInvoiceExceptions(db, inv)).toHaveLength(1);
    expect(listInvoiceExceptions(db, 999)).toEqual([]);
  });
});

describe("getInvoice", () => {
  it("parses the extracted JSON and reports the channel", () => {
    const id = addInvoice("a.pdf", "nimbus", "ok");
    const inv = getInvoice(db, id);
    expect(inv?.channel).toBe("email");
    expect(inv?.month).toBe("2026-10");
    expect(inv?.extracted?.supplierName.quote).toBe("Nimbus Cloud Ltd");
  });

  it("returns null for a missing invoice and null extracted for broken JSON", () => {
    expect(getInvoice(db, 42)).toBeNull();
    const id = addInvoice("bad.pdf", null, "ok", "{not json");
    const inv = getInvoice(db, id);
    expect(inv).not.toBeNull();
    expect(inv?.extracted).toBeNull();
    expect(inv?.channel).toBeNull();
  });

  it("lists the invoices of a run", () => {
    addInvoice("a.pdf", "nimbus", "ok");
    expect(listInvoices(db, 1)).toEqual([
      {
        id: 1,
        fileName: "a.pdf",
        status: "ok",
        supplierName: "Nimbus",
        channel: "email",
        documentNumber: null,
        date: null,
        amount: 120,
        currency: "EUR",
      },
    ]);
    expect(listInvoices(db, 2)).toEqual([]);
  });
});

describe("outbox and auto-send", () => {
  it("groups outgoing emails and shows only the attachment file name", () => {
    queueOutgoing(db, {
      runId: 1,
      kind: "package",
      recipient: "acc@example.com",
      subject: "Pacchetto",
      body: "corpo",
      attachmentPath: "/tmp/out/pacchetto-2026-10.zip",
    });
    queueOutgoing(db, {
      kind: "supplier_request",
      template: "ask_billing",
      recipient: "s@example.com",
      subject: "q",
      body: "b",
    });
    db.prepare("UPDATE outbox SET status = 'sent' WHERE id = 2").run();
    const pending = listOutbox(db, "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].attachmentName).toBe("pacchetto-2026-10.zip");
    expect(listOutbox(db, "approved")).toEqual([]);
    expect(listOutbox(db, "done").map((m) => m.id)).toEqual([2]);
  });

  it("extracts attachment names from any path", () => {
    expect(attachmentName(null)).toBeNull();
    expect(attachmentName("a/b/c.zip")).toBe("c.zip");
    expect(attachmentName("C:\\x\\y.zip")).toBe("y.zip");
    expect(attachmentName("dir/")).toBeNull();
  });

  it("lists templates without the package and with who enabled them", () => {
    queueOutgoing(db, {
      kind: "package",
      template: "monthly_package",
      recipient: "a@example.com",
      subject: "s",
      body: "b",
    });
    queueOutgoing(db, {
      kind: "supplier_request",
      template: "ask_billing",
      recipient: "s@example.com",
      subject: "s",
      body: "b",
    });
    expect(listAutoSend(db)).toEqual([
      { template: "ask_billing", enabled: false, enabledBy: null, enabledAt: null },
    ]);
    setAutoSend(db, "ask_billing", true, "Maria");
    setAutoSend(db, "reminder", false, "Luca");
    const rows = listAutoSend(db);
    expect(rows.map((r) => r.template)).toEqual(["ask_billing", "reminder"]);
    expect(rows[0]).toMatchObject({ enabled: true, enabledBy: "Maria" });
    expect(rows[1].enabled).toBe(false);
  });
});

describe("suppliers", () => {
  it("attaches facts and flags the ones without a source as unknown", () => {
    db.prepare(
      "INSERT INTO supplier_facts (supplier_id, fact, value, source_url, quote) VALUES ('orbit','Legal entity','Orbit GmbH','https://example.com/terms','Orbit GmbH, Berlin')",
    ).run();
    db.prepare(
      "INSERT INTO supplier_facts (supplier_id, fact, value, source_url, quote) VALUES ('orbit','VAT id',NULL,NULL,NULL)",
    ).run();
    const all = listSuppliers(db);
    expect(all.map((s) => s.name)).toEqual(["Nimbus", "Orbit"]);
    expect(all[0].facts).toEqual([]);
    const facts = all[1].facts;
    expect(facts[0]).toMatchObject({ unknown: false, sourceUrl: "https://example.com/terms" });
    expect(facts[1].unknown).toBe(true);
  });
});

describe("audit log", () => {
  it("is newest first and filters by run", () => {
    const ins = db.prepare("INSERT INTO audit_log (run_id, actor, step) VALUES (?,?,?)");
    ins.run(1, "autopilot", "extract");
    ins.run(2, "Maria", "approve");
    ins.run(1, "autopilot", "validate");
    expect(listAudit(db).map((r) => r.step)).toEqual(["validate", "approve", "extract"]);
    expect(listAudit(db, 1).map((r) => r.step)).toEqual(["validate", "extract"]);
    expect(listAudit(db, 99)).toEqual([]);
    expect(listAudit(db, null, 1)).toHaveLength(1);
  });
});

describe("channel from invoices.source", () => {
  it("prefers invoices.source over the supplier channel and falls back when null", () => {
    const a = addInvoice("a.pdf", "nimbus", "ok");
    const b = addInvoice("b.pdf", "orbit", "ok");
    db.prepare("UPDATE invoices SET source = 'browser', origin = 'portal/orbit' WHERE id = ?").run(
      a,
    );
    expect(getInvoice(db, a)).toMatchObject({ channel: "browser", origin: "portal/orbit" });
    expect(getInvoice(db, b)).toMatchObject({ channel: "api", origin: null });
    expect(listInvoices(db, 1).map((i) => i.channel)).toEqual(["browser", "api"]);
    const counts = Object.fromEntries(getOverview(db).channels.map((c) => [c.channel, c.count]));
    expect(counts).toEqual({ browser: 1, api: 1 });
  });
});

describe("warnings", () => {
  it("lists warnings of the last run only", () => {
    const ins = db.prepare("INSERT INTO audit_log (run_id, actor, step, detail) VALUES (?,?,?,?)");
    ins.run(1, "autopilot", "warning", "Fonte non raggiungibile");
    ins.run(1, "autopilot", "extract", "ok");
    ins.run(1, "autopilot", "warning", null);
    db.prepare("INSERT INTO runs (month) VALUES ('2026-11')").run();
    ins.run(2, "autopilot", "warning", "Avviso nuovo");
    expect(getOverview(db).warnings).toEqual(["Avviso nuovo"]);
    expect(getOverview(openDb(":memory:")).warnings).toEqual([]);
  });

  it("gives a text for a warning without detail", () => {
    db.prepare(
      "INSERT INTO audit_log (run_id, actor, step) VALUES (1,'autopilot','warning')",
    ).run();
    expect(getOverview(db).warnings).toEqual(["Avviso senza dettaglio"]);
  });
});

describe("self-invoices", () => {
  function addSelf(invoice: number, status: string, extra = "") {
    db.prepare(
      `INSERT INTO self_invoices (run_id, invoice_id, number, taxable_eur, vat_rate, vat_eur, status ${extra ? ", " + extra.split("=")[0] : ""})
       VALUES (1, ?, ?, 100, 0.22, 22, ? ${extra ? ", " + extra.split("=")[1] : ""})`,
    ).run(invoice, `AF-${invoice}`, status);
  }

  it("is empty with no run or no rows", () => {
    expect(listSelfInvoices(openDb(":memory:"))).toEqual([]);
    expect(listSelfInvoices(db)).toEqual([]);
    expect(getComplianceCounts(db)).toEqual({
      needsInput: 0,
      drafts: 0,
      approved: 0,
      submitted: 0,
      exported: 0,
    });
    expect(getSelfInvoice(db, 1)).toBeNull();
  });

  it("joins the foreign invoice and computes the total", () => {
    const inv = addInvoice("a.pdf", "nimbus", "ok");
    addSelf(inv, "draft");
    const [row] = listSelfInvoices(db);
    expect(row).toMatchObject({
      docType: "TD17",
      supplierName: "Nimbus",
      invoiceFile: "a.pdf",
      originalCurrency: "EUR",
      originalAmount: 120,
      taxableEur: 100,
      totalEur: 122,
    });
    expect(getSelfInvoice(db, row.id)?.number).toBe(`AF-${inv}`);
  });

  it("leaves the total null while the EUR amount is missing", () => {
    const inv = addInvoice("b.pdf", "orbit", "ok");
    db.prepare(
      "INSERT INTO self_invoices (run_id, invoice_id, number, vat_rate, status, needs_input_reason) VALUES (1, ?, 'AF-x', 0.22, 'needs_input', 'Importo in euro mancante')",
    ).run(inv);
    const [row] = listSelfInvoices(db);
    expect(row.totalEur).toBeNull();
    expect(row.needsInputReason).toBe("Importo in euro mancante");
  });

  it("counts by status and exported rows for the latest run", () => {
    const ids = [1, 2, 3, 4, 5].map((i) => addInvoice(`f${i}.pdf`, "nimbus", "ok"));
    ["needs_input", "draft", "approved", "submitted", "submitted"].forEach((s, i) =>
      addSelf(ids[i], s),
    );
    db.prepare(
      "UPDATE self_invoices SET accounting_status = 'exported', accounting_ref = 'R1' WHERE invoice_id = ?",
    ).run(ids[4]);
    expect(getComplianceCounts(db)).toEqual({
      needsInput: 1,
      drafts: 1,
      approved: 1,
      submitted: 2,
      exported: 1,
    });
    db.prepare("INSERT INTO runs (month) VALUES ('2026-11')").run();
    expect(getComplianceCounts(db).drafts).toBe(0);
    expect(listSelfInvoices(db, 1)).toHaveLength(5);
  });
});

describe("invoice table rows and supplier detail", () => {
  it("reads number, date, amount and currency, and survives broken JSON", () => {
    const full = JSON.stringify({
      supplierName: sourced("Acme", "Acme", 1),
      invoiceNumber: sourced("INV-7", "INV-7", 1),
      invoiceDate: sourced("2026-10-03", "3 Oct", 1),
      totalAmount: sourced(99.5, "99.50", 1),
      currency: sourced("USD", "USD", 1),
    });
    addInvoice("full.pdf", null, "ok", full);
    addInvoice("bad.pdf", "nimbus", "exception", "{nope");
    const [a, b] = listInvoices(db, 1);
    expect(a).toMatchObject({
      supplierName: "Acme",
      documentNumber: "INV-7",
      date: "2026-10-03",
      amount: 99.5,
      currency: "USD",
    });
    expect(b).toMatchObject({ supplierName: "Nimbus", documentNumber: null, amount: null });
  });

  it("gets one supplier with its facts, or null", () => {
    db.prepare(
      "INSERT INTO supplier_facts (supplier_id, fact, value, source_url, quote) VALUES ('orbit','VAT id','DE1','https://example.com','DE1')",
    ).run();
    expect(getSupplier(db, "orbit")?.facts).toHaveLength(1);
    expect(getSupplier(db, "nimbus")?.facts).toEqual([]);
    expect(getSupplier(db, "nope")).toBeNull();
  });
});

describe("months", () => {
  it("lists months with a closure and picks the run of a month", () => {
    db.prepare("INSERT INTO runs (month) VALUES ('2026-10')").run();
    db.prepare("INSERT INTO runs (month) VALUES ('2026-09')").run();
    expect(listMonths(db)).toEqual(["2026-10", "2026-09"]);
    expect(getRunForMonth(db, "2026-10")?.id).toBe(2);
    expect(getRunForMonth(db, "2026-09")?.id).toBe(3);
    expect(getRunForMonth(db, "2025-01")).toBeNull();
    expect(getRunForMonth(db)?.id).toBe(3);
    expect(getOverview(db, "2026-09").run?.id).toBe(3);
    expect(getOverview(db, "2025-01").run).toBeNull();
    expect(listMonths(openDb(":memory:"))).toEqual([]);
  });

  it("scopes compliance counts to a run", () => {
    const inv = addInvoice("m.pdf", "nimbus", "ok");
    db.prepare(
      "INSERT INTO self_invoices (run_id, invoice_id, number, taxable_eur, vat_rate, vat_eur, status) VALUES (1, ?, 'AF-m', 1, 22, 0.22, 'draft')",
    ).run(inv);
    db.prepare("INSERT INTO runs (month) VALUES ('2026-11')").run();
    expect(getComplianceCounts(db).drafts).toBe(0);
    expect(getComplianceCounts(db, 1).drafts).toBe(1);
  });
});

describe("getOutbox", () => {
  it("returns one outgoing email or null", () => {
    const { id } = queueOutgoing(db, {
      kind: "package",
      recipient: "a@example.com",
      subject: "s",
      body: "b",
    });
    expect(getOutbox(db, id)).toMatchObject({ kind: "package", status: "pending" });
    expect(getOutbox(db, 999)).toBeNull();
  });
});

describe("retired exception code", () => {
  it("is hidden from every list and counter but stays in the database", () => {
    const inv = addInvoice("r.pdf", "nimbus", "exception");
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, code, message) VALUES (1, ?, 'MISSING_EXPECTED_INVOICE', 'old')",
    ).run(inv);
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, code, message, status, resolved_at) VALUES (1, ?, 'MISSING_EXPECTED_INVOICE', 'old2', 'resolved', '2026-11-21 10:00:00')",
    ).run(inv);
    db.prepare(
      "INSERT INTO exceptions (run_id, invoice_id, code, message) VALUES (1, ?, 'DUPLICATE', 'dup')",
    ).run(inv);
    expect(listExceptions(db, "open").map((e) => e.code)).toEqual(["DUPLICATE"]);
    expect(listExceptions(db, "resolved")).toEqual([]);
    expect(listInvoiceExceptions(db, inv).map((e) => e.code)).toEqual(["DUPLICATE"]);
    expect(getOverview(db).openExceptions).toBe(1);
    const stored = db
      .prepare("SELECT COUNT(*) AS n FROM exceptions WHERE code = 'MISSING_EXPECTED_INVOICE'")
      .get() as { n: number };
    expect(stored.n).toBe(2);
  });
});
