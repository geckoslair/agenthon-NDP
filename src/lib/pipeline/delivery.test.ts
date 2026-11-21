import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { decideOutgoing } from "../audit";
import { openDb, type Db } from "../db";
import {
  approvePackage,
  deliverPackage,
  getDeliveryMode,
  originalPdfPath,
  packageBlockers,
  resolveException,
  runMonth,
  setDeliveryMode,
} from "./index";
import { fakeFetch, makeMonth, MONTH } from "./__fixtures__/make-month";
import { GET as erpGet, POST as erpPost } from "@/app/mock/erp/documents/route";

const erpFetch: typeof fetch = async (input, init) => {
  const request = new Request(String(input), init);
  return new URL(request.url).pathname === "/mock/erp/documents"
    ? erpPost(request)
    : new Response("not found", { status: 404 });
};

async function setup() {
  const db = openDb(":memory:");
  const fx = makeMonth();
  const s = await runMonth(db, MONTH, {
    demoDir: fx.demoDir,
    dataDir: fx.dataDir,
    baseUrl: "http://mock.test",
    sources: ["email", "billing_api"],
    fetchImpl: fakeFetch,
  });
  const pkg = db.prepare("SELECT id FROM outbox WHERE kind = 'package'").get() as { id: number };
  return { db, runId: s.runId, pkgId: pkg.id };
}
const status = (db: Db, id: number) =>
  (db.prepare("SELECT status FROM outbox WHERE id = ?").get(id) as { status: string }).status;

describe("package blockers", () => {
  it("lists the open supplier request and refuses approval, naming the supplier", async () => {
    const { db, runId, pkgId } = await setup();
    const blockers = packageBlockers(db, runId);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].supplierName).toBe("Shadow Hosting LLC");
    const result = approvePackage(db, pkgId, "Anna");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Shadow Hosting LLC");
    expect(status(db, pkgId)).toBe("pending");
  });

  it("force approves and logs what was left out, with the person", async () => {
    const { db, pkgId } = await setup();
    expect(approvePackage(db, pkgId, "Anna", { force: true })).toEqual({ ok: true });
    expect(status(db, pkgId)).toBe("approved");
    const log = db
      .prepare("SELECT actor, detail FROM audit_log WHERE step = 'package_forced'")
      .get() as {
      actor: string;
      detail: string;
    };
    expect(log.actor).toBe("Anna");
    expect(log.detail).toContain("shadow-9.pdf");
    expect(log.detail).toContain("Shadow Hosting LLC");
  });

  it("is unblocked once the exception is resolved", async () => {
    const { db, runId, pkgId } = await setup();
    resolveException(db, packageBlockers(db, runId)[0].exceptionId, "Dati ricevuti", "Anna");
    expect(packageBlockers(db, runId)).toEqual([]);
    expect(approvePackage(db, pkgId, "Anna")).toEqual({ ok: true });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE step = 'package_forced'").get(),
    ).toEqual({ n: 0 });
  });

  it("refuses non-package rows, a missing person and an already approved package", async () => {
    const { db, pkgId } = await setup();
    const request = db.prepare("SELECT id FROM outbox WHERE kind = 'supplier_request'").get() as {
      id: number;
    };
    expect(approvePackage(db, request.id, "Anna", { force: true }).ok).toBe(false);
    expect(status(db, request.id)).toBe("pending");
    expect(approvePackage(db, pkgId, " ").ok).toBe(false);
    approvePackage(db, pkgId, "Anna", { force: true });
    expect(approvePackage(db, pkgId, "Anna", { force: true }).ok).toBe(false);
    expect(approvePackage(db, 999, "Anna").ok).toBe(false);
  });
});

describe("delivery mode", () => {
  it("defaults to accountant and records who changed it", async () => {
    const { db } = await setup();
    expect(getDeliveryMode(db)).toBe("accountant");
    setDeliveryMode(db, "erp", "Marco");
    expect(getDeliveryMode(db)).toBe("erp");
    const row = db.prepare("SELECT updated_by FROM settings WHERE key = 'delivery_mode'").get();
    expect(row).toEqual({ updated_by: "Marco" });
    const log = db
      .prepare("SELECT actor FROM audit_log WHERE step = 'delivery_mode_changed'")
      .get();
    expect(log).toEqual({ actor: "Marco" });
    expect(() => setDeliveryMode(db, "fax" as never, "Marco")).toThrow();
    expect(() => setDeliveryMode(db, "erp", "")).toThrow();
  });

  it("cannot deliver an unapproved package", async () => {
    const { db, pkgId } = await setup();
    const r = await deliverPackage(db, pkgId, erpFetch);
    expect(r.ok).toBe(false);
    expect(status(db, pkgId)).toBe("pending");
  });

  it("accountant mode marks the approved package sent", async () => {
    const { db, pkgId } = await setup();
    approvePackage(db, pkgId, "Anna", { force: true });
    expect(await deliverPackage(db, pkgId, erpFetch)).toEqual({ ok: true, mode: "accountant" });
    expect(status(db, pkgId)).toBe("sent");
  });

  it("erp mode posts the valid invoices to the simulated ERP and marks it sent", async () => {
    const { db, runId, pkgId } = await setup();
    setDeliveryMode(db, "erp", "Anna");
    decideOutgoing(db, pkgId, "approved", "Anna");
    const r = await deliverPackage(db, pkgId, erpFetch);
    expect(r).toMatchObject({ ok: true, mode: "erp" });
    expect(r.ref).toMatch(/^SIM-ERP-\d{4}$/);
    expect(status(db, pkgId)).toBe("sent");
    const listed = (await (await erpGet()).json()) as {
      simulated: boolean;
      batches: {
        ref: string;
        runId: number;
        documents: { fileName: string; currency: string }[];
      }[];
    };
    const batch = listed.batches.find((b) => b.ref === r.ref)!;
    const ok = db
      .prepare("SELECT file_name FROM invoices WHERE run_id = ? AND status = 'ok'")
      .all(runId) as {
      file_name: string;
    }[];
    expect(batch.documents.map((d) => d.fileName)).toEqual(ok.map((o) => o.file_name));
    expect(batch.documents[0].currency).toBe("EUR");
    const log = db
      .prepare("SELECT detail FROM audit_log WHERE step = 'package_delivered_erp'")
      .get() as {
      detail: string;
    };
    expect(log.detail).toContain(r.ref!);
  });

  it("a failed ERP POST leaves the package approved and returns the error", async () => {
    const { db, pkgId } = await setup();
    setDeliveryMode(db, "erp", "Anna");
    decideOutgoing(db, pkgId, "approved", "Anna");
    const down: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    expect(await deliverPackage(db, pkgId, down)).toEqual({
      ok: false,
      mode: "erp",
      error: "boom",
    });
    expect(status(db, pkgId)).toBe("approved");
    const refused: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect((await deliverPackage(db, pkgId, refused)).error).toBe("ECONNREFUSED");
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE step = 'package_delivery_failed'")
        .get(),
    ).toEqual({
      n: 2,
    });
  });

  it("the simulated ERP rejects a body without documents", async () => {
    const res = await erpPost(
      new Request("http://x/mock/erp/documents", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(422);
  });
});

describe("originalPdfPath", () => {
  it("returns the collected PDF, or null when missing or unknown", async () => {
    const { db } = await setup();
    const inv = db.prepare("SELECT id, file_name FROM invoices ORDER BY id LIMIT 1").get() as {
      id: number;
      file_name: string;
    };
    const file = originalPdfPath(db, inv.id)!;
    expect(file.endsWith(inv.file_name)).toBe(true);
    expect(fs.readFileSync(file).subarray(0, 4).toString()).toBe("%PDF");
    fs.rmSync(file);
    expect(originalPdfPath(db, inv.id)).toBeNull();
    expect(originalPdfPath(db, 9999)).toBeNull();
  });
});
