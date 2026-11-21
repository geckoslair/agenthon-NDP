import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { getSelfInvoice } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Serves the demonstration XML draft of a self-invoice as text/xml; 404 when there is none. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  const row = Number.isInteger(n) && n > 0 ? getSelfInvoice(getDb(), n) : null;
  if (!row?.xmlPath) return new Response("Bozza non trovata", { status: 404 });
  const file = path.resolve(row.xmlPath);
  // Only files inside the project folder are served.
  if (!file.startsWith(process.cwd() + path.sep) || !fs.existsSync(file)) {
    return new Response("Bozza non trovata", { status: 404 });
  }
  return new Response(fs.readFileSync(file, "utf8"), {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
