import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEmailSource, parseEmail } from "./email";
import { createBillingApiSource, parseInvoiceList } from "./billing-api";
import { createBrowserSource, pdfLinks } from "./browser";
import { looksLikePdf, safeFileName, supplierIdFromFileName } from "./fs-util";
import { eml, fakeFetch, PDF } from "../pipeline/__fixtures__/make-month";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "src-"));

describe("fs-util", () => {
  it("sanitises file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("a b.pdf")).toBe("a_b.pdf");
    expect(safeFileName("")).toBe("document.pdf");
  });
  it("detects PDFs", () => {
    expect(looksLikePdf(PDF)).toBe(true);
    expect(looksLikePdf(Buffer.from("<html>"))).toBe(false);
  });
  it("reads the supplier id from a file name", () => {
    expect(supplierIdFromFileName("nimbus-INV-1001.pdf")).toBe("nimbus");
    expect(supplierIdFromFileName("noprefix.pdf")).toBeNull();
  });
});

describe("email", () => {
  it("parses PDF attachments", async () => {
    const parsed = await parseEmail(eml("a-1.pdf", "id1@x"));
    expect(parsed.messageId).toBe("<id1@x>");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].fileName).toBe("a-1.pdf");
  });

  it("ignores an email with no attachment", async () => {
    const parsed = await parseEmail("From: a@b.example\r\nSubject: hi\r\n\r\nno files");
    expect(parsed.attachments).toEqual([]);
  });

  it("collects from a folder and warns when it is missing", async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "1.eml"), eml("a-1.pdf", "id1@x"));
    const out = path.join(dir, "out");
    const docs = await createEmailSource({ inboxDir: dir, outDir: out }).collect("2026-10");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ source: "email", origin: "email:<id1@x>" });
    expect(fs.existsSync(docs[0].path)).toBe(true);

    const missing = createEmailSource({ inboxDir: path.join(dir, "nope"), outDir: out });
    expect(await missing.collect("2026-10")).toEqual([]);
    expect(missing.warnings).toHaveLength(1);
  });
});

describe("billing api", () => {
  it("validates the invoice list", () => {
    expect(parseInvoiceList([{ number: "1", date: "d", pdfUrl: "/x.pdf" }])).toHaveLength(1);
    expect(() => parseInvoiceList({})).toThrow();
    expect(() => parseInvoiceList([{ number: "1" }])).toThrow();
  });

  it("downloads PDFs with the bearer token", async () => {
    const source = createBillingApiSource({
      baseUrl: "http://mock.test",
      supplierIds: ["orbit"],
      outDir: tmp(),
      fetchImpl: fakeFetch,
    });
    const docs = await source.collect("2026-10");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      fileName: "orbit-2026-10.pdf",
      source: "billing_api",
      supplierId: "orbit",
    });
    expect(source.warnings).toEqual([]);
  });

  it("skips files already collected", async () => {
    const source = createBillingApiSource({
      baseUrl: "http://mock.test",
      supplierIds: ["orbit"],
      outDir: tmp(),
      fetchImpl: fakeFetch,
      isMissing: () => false,
    });
    expect(await source.collect("2026-10")).toEqual([]);
  });

  it("fails soft on an unknown supplier or a refused connection", async () => {
    const source = createBillingApiSource({
      baseUrl: "http://mock.test",
      supplierIds: ["ghost"],
      outDir: tmp(),
      fetchImpl: fakeFetch,
    });
    expect(await source.collect("2026-10")).toEqual([]);
    expect(source.warnings[0]).toContain("ghost");
  });
});

describe("browser", () => {
  it("keeps only PDF links, resolved and without repeats", () => {
    expect(
      pdfLinks(
        ["/a.pdf", "b.PDF", "/a.pdf", "/page", "", "http://[bad"],
        "http://h/mock/portal/x/invoices",
      ),
    ).toEqual(["http://h/a.pdf", "http://h/mock/portal/x/b.PDF"]);
  });

  it("does nothing without suppliers", async () => {
    const source = createBrowserSource({ baseUrl: "http://h", supplierIds: [], outDir: tmp() });
    expect(await source.collect("2026-10")).toEqual([]);
  });
});
