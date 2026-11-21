import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { buildBrief, buildShortBrief, spokenMonth } from "./brief";
import { cacheKey, synthesize, VoiceUnavailableError, type TtsClient } from "./tts";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

function seedRun() {
  db.prepare("INSERT INTO runs (month, status) VALUES ('2026-10','waiting_approval')").run();
  db.prepare(
    "INSERT INTO suppliers (id,name,status,invoice_source) VALUES ('nimbus','Nimbus Cloud','approved','email'), ('orbit','Orbit Analytics','approved','billing_api')",
  ).run();
}

function addInvoice(file: string, supplier: string, source: string, status: string) {
  return Number(
    db
      .prepare(
        "INSERT INTO invoices (run_id,file_name,supplier_id,source,extracted,status) VALUES (1,?,?,?,'{}',?)",
      )
      .run(file, supplier, source, status).lastInsertRowid,
  );
}

describe("buildBrief", () => {
  it("says so when no run was executed", () => {
    expect(buildBrief(db)).toBe("Nessun giro eseguito.");
  });

  it("describes channels, ready invoices, each open exception and what waits for approval", () => {
    seedRun();
    addInvoice("a.pdf", "nimbus", "email", "ok");
    addInvoice("b.pdf", "nimbus", "email", "ok");
    const blocked = addInvoice("c.pdf", "orbit", "billing_api", "exception");
    db.prepare(
      "INSERT INTO exceptions (run_id,invoice_id,supplier_id,code,message) VALUES (1,?,?,?,?)",
    ).run(blocked, "orbit", "FOREIGN_VAT_CHARGED", "x");
    db.prepare(
      "INSERT INTO exceptions (run_id,supplier_id,code,message) VALUES (1,NULL,'MISSING_EXPECTED_INVOICE','m')",
    ).run();
    db.prepare(
      "INSERT INTO outbox (run_id,kind,recipient,subject,body) VALUES (1,'package','x@example.com','s','b')",
    ).run();
    const text = buildBrief(db);
    expect(text).toContain("Giro di ottobre 2026.");
    expect(text).toContain("Hai 3 fatture raccolte: 2 da email, 1 dalle API dei fornitori.");
    expect(text).toContain("2 sono pronte.");
    expect(text).toContain("Hai 1 eccezione aperta.");
    expect(text).toContain("Orbit Analytics: è stata addebitata l'IVA estera.");
    expect(text).not.toContain("carta senza fattura");
    expect(text).not.toContain("attesa non è arrivata");
    expect(text).toContain("1 invio aspetta la tua approvazione.");
    expect(text).toContain("Niente parte senza il tuo sì.");
  });

  it("is all clear when nothing is open or pending", () => {
    seedRun();
    addInvoice("a.pdf", "nimbus", "email", "ok");
    const text = buildBrief(db);
    expect(text).toContain("Hai 1 fattura raccolta: 1 da email.");
    expect(text).toContain("1 è pronta.");
    expect(text).toContain("Nessuna eccezione aperta.");
    expect(text).toContain("Nessun invio in attesa di approvazione.");
    expect(text).not.toContain("attesa non è arrivata");
  });

  it("handles a run with no invoices and ignores resolved exceptions", () => {
    seedRun();
    db.prepare(
      "INSERT INTO exceptions (run_id,supplier_id,code,message,status) VALUES (1,'orbit','WRONG_MONTH','m','resolved')",
    ).run();
    const text = buildBrief(db);
    expect(text).toContain("Non ho raccolto nessuna fattura.");
    expect(text).toContain("Nessuna eccezione aperta.");
  });

  it("never invents: unknown codes are read as the code, unknown suppliers as such", () => {
    seedRun();
    db.prepare(
      "INSERT INTO exceptions (run_id,supplier_id,code,message) VALUES (1,NULL,'NEW_CODE','m')",
    ).run();
    expect(buildBrief(db)).toContain("Fornitore sconosciuto: codice NEW_CODE.");
  });

  it("formats months in Italian", () => {
    expect(spokenMonth("2026-01")).toBe("gennaio 2026");
    expect(spokenMonth("garbage")).toBe("garbage");
  });
});

function addException(code: string, supplier: string | null, invoiceId: number | null = null) {
  db.prepare(
    "INSERT INTO exceptions (run_id,invoice_id,supplier_id,code,message) VALUES (1,?,?,?,'m')",
  ).run(invoiceId, supplier, code);
}

const words = (t: string) => t.trim().split(/\s+/).length;

describe("buildShortBrief", () => {
  it("says so when no run was executed", () => {
    expect(buildShortBrief(db)).toBe("Nessun giro eseguito.");
  });

  it("gives totals, grouped exceptions and approvals in about 45 words", () => {
    seedRun();
    addInvoice("a.pdf", "nimbus", "email", "ok");
    const b1 = addInvoice("b.pdf", "orbit", "email", "exception");
    const b2 = addInvoice("c.pdf", "orbit", "email", "exception");
    const b3 = addInvoice("d.pdf", "orbit", "email", "exception");
    addException("FOREIGN_VAT_CHARGED", "orbit", b1);
    addException("FOREIGN_VAT_CHARGED", "orbit", b2);
    addException("DUPLICATE", "orbit", b3);
    addException("SUPPLIER_FACTS_UNKNOWN", "orbit");
    addException("WRONG_MONTH", "orbit");
    addException("MISSING_EXPECTED_INVOICE", null);
    db.prepare(
      "INSERT INTO outbox (run_id,kind,recipient,subject,body) VALUES (1,'package','x@example.com','s','b')",
    ).run();
    const text = buildShortBrief(db);
    expect(text).toBe(
      "Hai raccolto 4 fatture: una pronta, 3 bloccate. " +
        "5 eccezioni aperte: 2 con IVA estera addebitata, una doppia, un fornitore sconosciuto e un altro caso. " +
        "1 invio aspetta la tua approvazione.",
    );
    expect(words(text)).toBeLessThanOrEqual(45);
  });

  it("stays short with every kind of exception open", () => {
    seedRun();
    addInvoice("a.pdf", "nimbus", "email", "ok");
    for (const code of [
      "MISSING_EXPECTED_INVOICE",
      "ADDRESSED_TO_PERSON",
      "FOREIGN_VAT_CHARGED",
      "WRONG_MONTH",
      "NOT_FOREIGN",
      "DUPLICATE",
      "SUPPLIER_FACTS_UNKNOWN",
      "UNREADABLE_FIELD",
      "OUT_OF_KNOWN_RULES",
    ])
      addException(code, "orbit");
    const text = buildShortBrief(db);
    expect(text).toContain(
      "8 eccezioni aperte: una con IVA estera addebitata, una doppia, un fornitore sconosciuto e altri 5.",
    );
    expect(words(text)).toBeLessThanOrEqual(50);
  });

  it("is all clear and uses the singular", () => {
    seedRun();
    addInvoice("a.pdf", "nimbus", "email", "ok");
    expect(buildShortBrief(db)).toBe(
      "Hai raccolto 1 fattura: una pronta, nessuna bloccata. " +
        "Nessuna eccezione aperta. Nessun invio in attesa di approvazione.",
    );
  });

  it("uses the singular for one exception and one extra case, and reports a sent package", () => {
    seedRun();
    addInvoice("a.pdf", "nimbus", "email", "ok");
    addException("DUPLICATE", "orbit");
    expect(buildShortBrief(db)).toContain("Un'eccezione aperta: una doppia.");
    for (const code of ["WRONG_MONTH", "NOT_FOREIGN", "UNREADABLE_FIELD"])
      addException(code, "orbit");
    expect(buildShortBrief(db)).toContain(
      "4 eccezioni aperte: una doppia, una del mese sbagliato, un fornitore italiano e un altro caso.",
    );
    db.prepare(
      "INSERT INTO outbox (run_id,kind,recipient,subject,body,status) VALUES (1,'package','x@example.com','s','b','sent')",
    ).run();
    expect(buildShortBrief(db)).toContain("Il pacchetto è stato inviato.");
  });

  it("handles a run with no invoices, unknown codes and ignores resolved exceptions", () => {
    seedRun();
    addException("NEW_CODE", null);
    db.prepare(
      "INSERT INTO exceptions (run_id,code,message,status) VALUES (1,'DUPLICATE','m','resolved')",
    ).run();
    const text = buildShortBrief(db);
    expect(text).toContain("Non ho raccolto nessuna fattura.");
    expect(text).toContain("Un'eccezione aperta: 1 con codice NEW_CODE.");
  });
});

describe("synthesize", () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "probata-voice-"));
  const fake = (calls: string[]): TtsClient => ({
    textToSpeech: {
      async convert(voiceId, request) {
        calls.push(`${voiceId}|${request.modelId}`);
        return new Response(new Uint8Array([1, 2, 3])).body!;
      },
    },
  });

  it("calls the service once and serves the second request from the cache", async () => {
    const cacheDir = dir();
    const calls: string[] = [];
    const first = await synthesize("Ciao.", {
      cacheDir,
      client: fake(calls),
      voiceId: "v",
      modelId: "m",
    });
    const second = await synthesize("Ciao.", {
      cacheDir,
      client: fake(calls),
      voiceId: "v",
      modelId: "m",
    });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(calls).toEqual(["v|m"]);
    expect([...second.audio]).toEqual([1, 2, 3]);
  });

  it("uses a different cache entry for different text, voice or model", () => {
    expect(cacheKey("a", "m", "v")).not.toBe(cacheKey("b", "m", "v"));
    expect(cacheKey("a", "m", "v")).not.toBe(cacheKey("a", "m2", "v"));
    expect(cacheKey("a", "m", "v")).not.toBe(cacheKey("a", "m", "v2"));
  });

  it("throws VoiceUnavailableError without a key and without cache", async () => {
    const saved = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      await expect(synthesize("Ciao.", { cacheDir: dir() })).rejects.toBeInstanceOf(
        VoiceUnavailableError,
      );
    } finally {
      if (saved !== undefined) process.env.ELEVENLABS_API_KEY = saved;
    }
  });

  it("rejects empty text and empty audio", async () => {
    await expect(synthesize("  ", { cacheDir: dir(), apiKey: "k" })).rejects.toThrow("vuoto");
    const empty: TtsClient = {
      textToSpeech: { convert: async () => new Response(new Uint8Array()).body! },
    };
    await expect(synthesize("Ciao.", { cacheDir: dir(), client: empty })).rejects.toThrow("vuoto");
  });
});
