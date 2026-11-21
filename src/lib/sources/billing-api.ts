// Billing API channel: the supplier's (mock) invoice API, see docs/contracts.md.
import path from "node:path";
import type { CollectedDocument, InvoiceSource } from "./types";
import { looksLikePdf, safeFileName, writeFile } from "./fs-util";

export interface ApiInvoice {
  number: string;
  date: string;
  pdfUrl: string;
}

/** Validates the JSON list returned by GET /mock/api/<supplierId>/invoices. */
export function parseInvoiceList(json: unknown): ApiInvoice[] {
  if (!Array.isArray(json)) throw new Error("La risposta non è una lista di fatture");
  return json.map((item, i) => {
    const row = item as Record<string, unknown>;
    if (typeof row?.pdfUrl !== "string" || row.pdfUrl === "") {
      throw new Error(`Fattura ${i + 1} senza pdfUrl`);
    }
    return {
      number: typeof row.number === "string" ? row.number : "",
      date: typeof row.date === "string" ? row.date : "",
      pdfUrl: row.pdfUrl,
    };
  });
}

export interface BillingApiSourceOptions {
  baseUrl: string;
  /** Suppliers that expose a billing API. */
  supplierIds: string[];
  outDir: string;
  /** Later channels only fetch files still missing. Defaults to "everything is missing". */
  isMissing?: (fileName: string) => boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createBillingApiSource(options: BillingApiSourceOptions): InvoiceSource & {
  warnings: string[];
} {
  const warnings: string[] = [];
  const doFetch = options.fetchImpl ?? fetch;
  const isMissing = options.isMissing ?? (() => true);
  const timeoutMs = options.timeoutMs ?? 5000;

  return {
    kind: "billing_api",
    warnings,
    async collect(month: string): Promise<CollectedDocument[]> {
      const documents: CollectedDocument[] = [];
      for (const supplierId of options.supplierIds) {
        const headers = { Authorization: `Bearer demo-${supplierId}` };
        const listUrl = new URL(
          `/mock/api/${encodeURIComponent(supplierId)}/invoices?month=${encodeURIComponent(month)}`,
          options.baseUrl,
        ).toString();
        try {
          const response = await doFetch(listUrl, {
            headers,
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const list = parseInvoiceList(await response.json());
          for (const invoice of list) {
            const url = new URL(invoice.pdfUrl, options.baseUrl);
            if (!url.searchParams.has("month")) url.searchParams.set("month", month);
            const pdfUrl = url.toString();
            const fileName = safeFileName(path.basename(new URL(pdfUrl).pathname));
            if (!isMissing(fileName)) continue;
            const pdf = await doFetch(pdfUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });
            if (!pdf.ok) throw new Error(`PDF ${fileName}: HTTP ${pdf.status}`);
            const content = new Uint8Array(await pdf.arrayBuffer());
            if (!looksLikePdf(content)) throw new Error(`${fileName} non è un PDF`);
            documents.push({
              fileName,
              path: writeFile(options.outDir, fileName, content),
              source: "billing_api",
              origin: pdfUrl,
              supplierId,
            });
          }
        } catch (error) {
          warnings.push(
            `API di fatturazione di ${supplierId} non raggiungibile (${listUrl}): ${(error as Error).message}`,
          );
        }
      }
      return documents;
    },
  };
}
