// Integration: runs the real synthetic demo month against an in-memory database and
// checks that exactly the planted exceptions in demo/2026-10/expected.json are raised.
// The mock HTTP endpoints are called in-process through the Data stream's handlers.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { runMonth } from "./index";
import { fileHandler, listHandler } from "@/app/mock/_lib/api";
import { billingFacts } from "@/app/mock/_lib/billing-facts";
import { readBillingInfo, readPdf, readSources } from "@/app/mock/_lib/demo-data";
import type { CollectedDocument, InvoiceSource } from "../sources/types";

const MONTH = "2026-10";
const demoDir = path.join(process.cwd(), "demo");
const hasDemo = fs.existsSync(path.join(demoDir, MONTH, "expected.json"));

const escape = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** In-process stand-in for the mock routes, built on the same handlers and data. */
const mockFetch: typeof fetch = async (input, init) => {
  const request = new Request(String(input), init);
  const url = new URL(request.url);
  let m = /^\/mock\/api\/([^/]+)\/invoices$/.exec(url.pathname);
  if (m) return listHandler(request, m[1]);
  m = /^\/mock\/api\/([^/]+)\/invoices\/([^/]+)$/.exec(url.pathname);
  if (m) return fileHandler(request, m[1], m[2]);
  m = /^\/mock\/portal\/([^/]+)\/billing-info$/.exec(url.pathname);
  if (m) {
    const info = readBillingInfo(MONTH, m[1]);
    if (!info) return new Response("not found", { status: 404 });
    const body = billingFacts(info)
      .map((f) => `<p data-fact="${f.name}" data-value="${escape(f.value)}">${escape(f.text)}</p>`)
      .join("");
    return new Response(`<html><body>${body}</body></html>`);
  }
  return new Response("not found", { status: 404 });
};

/** The portal channel without a browser: same files the portal would serve. */
function portalStandIn(outDir: string, isMissing: (f: string) => boolean): InvoiceSource {
  return {
    kind: "browser",
    async collect(month) {
      const docs: CollectedDocument[] = [];
      for (const [supplierId, files] of Object.entries(readSources(month)?.browser ?? {})) {
        for (const fileName of files) {
          if (!isMissing(fileName)) continue;
          const pdf = readPdf(month, fileName);
          if (!pdf) continue;
          fs.mkdirSync(outDir, { recursive: true });
          const target = path.join(outDir, fileName);
          fs.writeFileSync(target, pdf);
          docs.push({
            fileName,
            path: target,
            source: "browser",
            origin: `portal:${supplierId}`,
            supplierId,
          });
        }
      }
      return docs;
    },
  };
}

describe.skipIf(!hasDemo)("demo month 2026-10", () => {
  it("raises exactly the exceptions in expected.json, on a second run too", async () => {
    const expected = JSON.parse(
      fs.readFileSync(path.join(demoDir, MONTH, "expected.json"), "utf8"),
    ) as { fileName: string | null; code: string; supplierId?: string }[];
    const db = openDb(":memory:");
    const options = {
      demoDir,
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "probata-demo-")),
      baseUrl: "http://mock.test",
      sources: ["email", "billing_api", "browser"],
      fetchImpl: mockFetch,
      sourceFactory: (kind, ctx) =>
        kind === "browser" ? portalStandIn(ctx.outDir, ctx.isMissing) : null,
    } satisfies Parameters<typeof runMonth>[2];
    const first = await runMonth(db, MONTH, options);
    const summary = await runMonth(db, MONTH, options);
    expect(summary.runId).toBe(first.runId + 1);
    const rows = db
      .prepare(
        `SELECT i.file_name AS fileName, e.code, e.supplier_id AS supplierId
         FROM exceptions e LEFT JOIN invoices i ON i.id = e.invoice_id WHERE e.run_id = ?`,
      )
      .all(summary.runId) as { fileName: string | null; code: string; supplierId: string | null }[];
    const key = (e: { fileName: string | null; code: string; supplierId?: string | null }) =>
      `${e.fileName ?? e.supplierId}:${e.code}`;
    expect(rows.map(key).sort()).toEqual(expected.map(key).sort());
    const helix = db.prepare("SELECT tax_id, status FROM suppliers WHERE id = 'helix'").get();
    expect(helix).toEqual({ tax_id: "IE9999992B", status: "unknown" });
    expect(summary.warnings).toEqual([]);

    // Every document of sources.json was collected, each through its own channel.
    const sources = readSources(MONTH)!;
    const channel = new Map<string, string>();
    for (const f of sources.email) channel.set(f, "email");
    for (const files of Object.values(sources.billing_api))
      for (const f of files) channel.set(f, "billing_api");
    for (const files of Object.values(sources.browser))
      for (const f of files) channel.set(f, "browser");
    const invoices = db
      .prepare("SELECT file_name, source FROM invoices WHERE run_id = ?")
      .all(summary.runId) as {
      file_name: string;
      source: string;
    }[];
    expect(invoices).toHaveLength(channel.size);
    for (const i of invoices) expect(i.source).toBe(channel.get(i.file_name));

    // The unknown supplier whose facts are on its page is proposed, not blocked.
    const proposed = db
      .prepare("SELECT subject FROM audit_log WHERE step = 'supplier_proposed' AND run_id = ?")
      .all(summary.runId);
    expect(proposed).toEqual([{ subject: "supplier:helix" }]);
    const pkg = db
      .prepare("SELECT status, subject FROM outbox WHERE kind = 'package' AND run_id = ?")
      .get(summary.runId) as {
      status: string;
      subject: string;
    };
    expect(pkg).toEqual({
      status: "pending",
      subject: "Acme Studio SRL | Acquisti esteri Ottobre 2026",
    });
  });
});
