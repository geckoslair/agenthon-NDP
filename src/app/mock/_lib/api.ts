// Mock billing API: bearer token check and invoice listing/download.
import {
  isValidFileName,
  isValidMonth,
  isValidSupplierId,
  listInvoices,
  monthFrom,
  pdfResponse,
  readPdf,
  readSources,
} from "./demo-data";

export function expectedToken(supplierId: string): string {
  return `demo-${supplierId}`;
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function authorized(request: Request, supplierId: string): boolean {
  return request.headers.get("authorization") === `Bearer ${expectedToken(supplierId)}`;
}

export async function listHandler(request: Request, supplierId: string): Promise<Response> {
  if (!authorized(request, supplierId)) return unauthorized();
  if (!isValidSupplierId(supplierId)) return Response.json({ error: "not found" }, { status: 404 });
  const month = monthFrom(request.url);
  if (!isValidMonth(month)) return Response.json({ error: "invalid month" }, { status: 400 });
  const files = readSources(month)?.billing_api[supplierId] ?? [];
  const items = listInvoices(files, month).map((i) => ({
    number: i.number ?? "",
    date: i.date ?? "",
    pdfUrl: `/mock/api/${supplierId}/invoices/${i.fileName}`,
  }));
  return Response.json(items);
}

export async function fileHandler(
  request: Request,
  supplierId: string,
  fileName: string,
): Promise<Response> {
  if (!authorized(request, supplierId)) return unauthorized();
  const month = monthFrom(request.url);
  if (!isValidMonth(month) || !isValidFileName(fileName)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  // Only files this supplier delivers through the API are served.
  const allowed = readSources(month)?.billing_api[supplierId] ?? [];
  const pdf = allowed.includes(fileName) ? readPdf(month, fileName) : null;
  if (!pdf) return Response.json({ error: "not found" }, { status: 404 });
  return pdfResponse(pdf, fileName);
}
