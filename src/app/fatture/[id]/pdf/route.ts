import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { originalPdfPath } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

function pdfPathFor(id: number): string | null {
  const file = originalPdfPath(getDb(), id);
  return file && fs.existsSync(file) ? file : null;
}

/** Serves the original invoice PDF so a person can check a value; 404 when it is missing. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  const file = Number.isInteger(n) && n > 0 ? pdfPathFor(n) : null;
  if (!file) return new Response("Fattura originale non trovata", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${path.basename(file)}"`,
    },
  });
}
