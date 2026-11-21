// Browser channel: logs into the supplier's (fake) portal with Playwright and downloads PDFs.
import path from "node:path";
import type { CollectedDocument, InvoiceSource } from "./types";
import { looksLikePdf, safeFileName, writeFile } from "./fs-util";

export interface BrowserSourceOptions {
  baseUrl: string;
  /** Suppliers whose invoices are only on their dashboard. */
  supplierIds: string[];
  outDir: string;
  isMissing?: (fileName: string) => boolean;
  username?: string;
  password?: string;
  timeoutMs?: number;
}

/** Keeps the PDF links of an invoices page, resolved against the page URL, without repeats. */
export function pdfLinks(hrefs: string[], pageUrl: string): string[] {
  const out = new Set<string>();
  for (const href of hrefs) {
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.pathname.toLowerCase().endsWith(".pdf")) out.add(url.toString());
  }
  return [...out];
}

export function createBrowserSource(options: BrowserSourceOptions): InvoiceSource & {
  warnings: string[];
} {
  const warnings: string[] = [];
  const isMissing = options.isMissing ?? (() => true);
  const timeout = options.timeoutMs ?? 10000;

  return {
    kind: "browser",
    warnings,
    async collect(): Promise<CollectedDocument[]> {
      if (options.supplierIds.length === 0) return [];
      const documents: CollectedDocument[] = [];
      let browser: import("playwright").Browser | null = null;
      try {
        const { chromium } = await import("playwright");
        browser = await chromium.launch({ headless: true });
      } catch (error) {
        warnings.push(`Browser non disponibile: ${(error as Error).message}`);
        return [];
      }
      try {
        for (const supplierId of options.supplierIds) {
          const portalUrl = new URL(
            `/mock/portal/${encodeURIComponent(supplierId)}`,
            options.baseUrl,
          ).toString();
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            page.setDefaultTimeout(timeout);
            await page.goto(portalUrl);
            const password = page.locator('input[type="password"]').first();
            if ((await password.count()) > 0) {
              const user = page
                .locator(
                  'input[name="username"], input[name="user"], input[type="text"], input[type="email"]',
                )
                .first();
              await user.fill(options.username ?? "demo");
              await password.fill(options.password ?? "demo");
              await Promise.all([
                page.waitForLoadState("load"),
                page.locator('button[type="submit"], input[type="submit"], button').first().click(),
              ]);
            }
            let hrefs = await page
              .locator("a[href]")
              .evaluateAll((els) =>
                els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
              );
            let links = pdfLinks(hrefs, page.url());
            if (links.length === 0) {
              await page.goto(`${portalUrl}/invoices`);
              hrefs = await page
                .locator("a[href]")
                .evaluateAll((els) =>
                  els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
                );
              links = pdfLinks(hrefs, page.url());
            }
            if (links.length === 0) {
              warnings.push(`Nessuna fattura trovata sul portale di ${supplierId} (${portalUrl})`);
            }
            for (const link of links) {
              const fileName = safeFileName(path.basename(new URL(link).pathname));
              if (!isMissing(fileName)) continue;
              const response = await context.request.get(link, { timeout });
              if (!response.ok()) throw new Error(`PDF ${fileName}: HTTP ${response.status()}`);
              const content = new Uint8Array(await response.body());
              if (!looksLikePdf(content)) throw new Error(`${fileName} non è un PDF`);
              documents.push({
                fileName,
                path: writeFile(options.outDir, fileName, content),
                source: "browser",
                origin: link,
                supplierId,
              });
            }
          } catch (error) {
            warnings.push(
              `Portale di ${supplierId} non raggiungibile (${portalUrl}): ${(error as Error).message}`,
            );
          } finally {
            await context.close();
          }
        }
      } finally {
        await browser.close();
      }
      return documents;
    },
  };
}
