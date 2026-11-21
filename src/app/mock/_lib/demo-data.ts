// Reads the synthetic demo month from disk for the mock supplier endpoints and pages.
// Nothing here talks to a real service. Inputs from URLs are validated before touching disk.

import fs from "node:fs";
import path from "node:path";
import type { ExtractedInvoice } from "@/lib/types";

export const DEFAULT_MONTH = "2026-10";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_RE = /^[a-z0-9]+$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/;

export interface Sources {
  email: string[];
  billing_api: Record<string, string[]>;
  browser: Record<string, string[]>;
}

export interface BillingInfo {
  displayName: string;
  legalEntity: string;
  countryCode: string;
  countryName: string;
  /** null = the page does not state it. */
  taxId: string | null;
  reverseCharge: boolean | null;
  companyAddressee: boolean | null;
  currency: string | null;
  channel: "email" | "billing_api" | "browser" | null;
}

export const isValidMonth = (m: string) => MONTH_RE.test(m);
export const isValidSupplierId = (s: string) => ID_RE.test(s);
export const isValidFileName = (f: string) => FILE_RE.test(f);

export function demoDir(month: string): string {
  if (!isValidMonth(month)) throw new Error(`Invalid month: ${month}`);
  return path.join(process.cwd(), "demo", month);
}

function readJson<T>(month: string, rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(demoDir(month), rel), "utf8")) as T;
  } catch {
    return null;
  }
}

export function readSources(month: string): Sources | null {
  return readJson<Sources>(month, "sources.json");
}

export function readTruth(month: string, fileName: string): ExtractedInvoice | null {
  if (!isValidFileName(fileName)) return null;
  return readJson<ExtractedInvoice>(month, `truth/${fileName.replace(/\.pdf$/, "")}.json`);
}

export function readBillingInfo(month: string, supplierId: string): BillingInfo | null {
  if (!isValidSupplierId(supplierId)) return null;
  const all = readJson<Record<string, BillingInfo>>(month, "mock/billing-info.json");
  return all?.[supplierId] ?? null;
}

/** Reads a PDF of the month, or null if the name is unsafe or the file does not exist. */
export function readPdf(month: string, fileName: string): Buffer | null {
  if (!isValidFileName(fileName)) return null;
  try {
    return fs.readFileSync(path.join(demoDir(month), "pdf", fileName));
  } catch {
    return null;
  }
}

export interface InvoiceListing {
  fileName: string;
  number: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
}

export function listInvoices(files: string[], month: string): InvoiceListing[] {
  return files.map((fileName) => {
    const t = readTruth(month, fileName);
    return {
      fileName,
      number: t?.invoiceNumber.value ?? null,
      date: t?.invoiceDate.value ?? null,
      amount: t?.totalAmount.value ?? null,
      currency: t?.currency.value ?? null,
    };
  });
}

export function pdfResponse(pdf: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}

export function monthFrom(url: string): string {
  return new URL(url).searchParams.get("month") ?? DEFAULT_MONTH;
}
