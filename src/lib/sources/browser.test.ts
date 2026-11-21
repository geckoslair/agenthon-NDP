// Drives the browser adapter against a tiny local fake portal (headless Chromium).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrowserSource } from "./browser";
import { PDF } from "../pipeline/__fixtures__/make-month";

let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/mock/portal/glyph" && req.method === "GET") {
      res.setHeader("content-type", "text/html");
      res.end(`<form method="post" action="/mock/portal/glyph/login">
        <input name="username"><input name="password" type="password"><button type="submit">Accedi</button></form>`);
    } else if (url.pathname === "/mock/portal/glyph/login") {
      res.writeHead(302, { location: "/mock/portal/glyph/invoices" }).end();
    } else if (url.pathname === "/mock/portal/glyph/invoices") {
      res.setHeader("content-type", "text/html");
      res.end(
        `<table><tr><td><a href="/mock/portal/glyph/files/glyph-R-88.pdf">R-88</a></td></tr></table>`,
      );
    } else if (url.pathname === "/mock/portal/glyph/files/glyph-R-88.pdf") {
      res.setHeader("content-type", "application/pdf");
      res.end(PDF);
    } else res.writeHead(404).end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("browser source", () => {
  it("logs in and downloads the invoice PDFs", { timeout: 30000 }, async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-"));
    const source = createBrowserSource({ baseUrl, supplierIds: ["glyph", "ghost"], outDir });
    const docs = await source.collect("2026-10");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      fileName: "glyph-R-88.pdf",
      source: "browser",
      supplierId: "glyph",
    });
    expect(fs.readFileSync(docs[0].path).subarray(0, 4).toString()).toBe("%PDF");
    // The missing portal is a warning, not a crash.
    expect(source.warnings.some((w) => w.includes("ghost"))).toBe(true);
  });

  it("warns when the portal server is down", { timeout: 30000 }, async () => {
    const source = createBrowserSource({
      baseUrl: "http://127.0.0.1:9",
      supplierIds: ["glyph"],
      outDir: fs.mkdtempSync(path.join(os.tmpdir(), "browser-")),
      timeoutMs: 3000,
    });
    expect(await source.collect("2026-10")).toEqual([]);
    expect(source.warnings).toHaveLength(1);
  });
});
