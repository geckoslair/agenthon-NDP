import { DEFAULT_MONTH, pdfResponse, readPdf, readSources } from "../../../../_lib/demo-data";

// PDFs are served without a cookie (see docs/contracts.md conventions).
export async function GET(
  request: Request,
  ctx: { params: Promise<{ supplierId: string; fileName: string }> },
) {
  const { supplierId, fileName } = await ctx.params;
  const month = new URL(request.url).searchParams.get("month") ?? DEFAULT_MONTH;
  let pdf: Buffer | null = null;
  try {
    const allowed = readSources(month)?.browser[supplierId] ?? [];
    pdf = allowed.includes(fileName) ? readPdf(month, fileName) : null;
  } catch {
    pdf = null;
  }
  if (!pdf) return Response.json({ error: "not found" }, { status: 404 });
  return pdfResponse(pdf, fileName);
}
