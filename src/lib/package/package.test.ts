import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { accountantEmail, buildSummaryEmail, buildZip, italianMonth } from "./index";

describe("italianMonth", () => {
  it("formats a month in Italian", () => {
    expect(italianMonth("2026-10")).toBe("Ottobre 2026");
    expect(italianMonth("2027-01")).toBe("Gennaio 2027");
  });
  it("rejects an invalid month", () => {
    expect(() => italianMonth("2026-13")).toThrow();
    expect(() => italianMonth("ottobre")).toThrow();
  });
});

describe("buildSummaryEmail", () => {
  const entries = [
    { supplierName: "zeta Srl", included: 1, pending: 0, toReceive: false },
    { supplierName: "Alpha Ltd", included: 3, pending: 0, toReceive: false },
    { supplierName: "Glyph AB", included: 0, pending: 0, toReceive: true },
    { supplierName: "Beta GmbH", included: 1, pending: 2, toReceive: false },
  ];

  it("uses the accountant's subject format", () => {
    expect(buildSummaryEmail("Acme Studio SRL", "2026-10", entries).subject).toBe(
      "Acme Studio SRL | Acquisti esteri Ottobre 2026",
    );
  });

  it("numbers suppliers alphabetically with notes in brackets", () => {
    const { body, total } = buildSummaryEmail("Acme Studio SRL", "2026-10", entries);
    expect(total).toBe(5);
    expect(body).toContain("5 fatture in totale");
    const list = body.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(list).toEqual([
      "1. Alpha Ltd (3 fatture)",
      "2. Beta GmbH (2 in verifica)",
      "3. Glyph AB (DA RICEVERE)",
      "4. zeta Srl",
    ]);
    expect(body).toContain("in verifica");
  });

  it("handles an empty month", () => {
    const { body, total } = buildSummaryEmail("Acme Studio SRL", "2026-10", []);
    expect(total).toBe(0);
    expect(body).toContain("0 fatture");
    expect(body).not.toContain("DA RICEVERE");
  });

  it("uses the singular for one invoice", () => {
    const { body } = buildSummaryEmail("Acme", "2026-10", [
      { supplierName: "A", included: 1, pending: 1, toReceive: false },
    ]);
    expect(body).toContain("1 fattura in totale");
    expect(body).toContain("1. A (1 in verifica)");
  });
});

describe("buildZip", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  it("writes a zip containing the files", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
    dirs.push(dir);
    const file = path.join(dir, "a.pdf");
    fs.writeFileSync(file, "%PDF-1.4 test");
    const out = await buildZip([{ path: file, name: "a.pdf" }], path.join(dir, "out", "p.zip"));
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.includes(Buffer.from("a.pdf"))).toBe(true);
  });

  it("writes an empty zip when there are no files", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
    dirs.push(dir);
    const out = await buildZip([], path.join(dir, "empty.zip"));
    expect(fs.statSync(out).size).toBeGreaterThan(0);
  });

  it("fails on a missing file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
    dirs.push(dir);
    await expect(
      buildZip([{ path: path.join(dir, "nope.pdf"), name: "nope.pdf" }], path.join(dir, "x.zip")),
    ).rejects.toThrow();
  });
});

describe("accountantEmail", () => {
  it("defaults to a fictional address and reads ACCOUNTANT_EMAIL", () => {
    const old = process.env.ACCOUNTANT_EMAIL;
    delete process.env.ACCOUNTANT_EMAIL;
    expect(accountantEmail()).toMatch(/@example\.com$/);
    process.env.ACCOUNTANT_EMAIL = "studio@test.example";
    expect(accountantEmail()).toBe("studio@test.example");
    if (old === undefined) delete process.env.ACCOUNTANT_EMAIL;
    else process.env.ACCOUNTANT_EMAIL = old;
  });
});
