// Gemini on Vertex AI. Credentials come from gcloud Application Default Credentials;
// project and location from GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION (see .env.example).
// Never use an AI Studio API key here: the event credits only cover Vertex AI.
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import type { ExtractedInvoice } from "./types";

// GA model named by the event portal; never switch to a -preview model (docs/credits-google.md).
export const TEXT_MODEL = "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set. Copy .env.example to .env.");
  client ??= new GoogleGenAI({
    vertexai: true,
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
  });
  return client;
}

const sourced = (type: "string" | "number", description: string) => ({
  type: "object",
  description,
  properties: {
    value: { type: [type, "null"], description: "null when the document does not state it" },
    quote: { type: ["string", "null"], description: "verbatim text the value was read from" },
    page: { type: ["integer", "null"], description: "1-based page number" },
  },
  required: ["value", "quote", "page"],
});

const INVOICE_SCHEMA = {
  type: "object",
  properties: {
    supplierName: sourced("string", "Legal name of the entity issuing the document"),
    supplierCountry: sourced("string", "ISO 3166-1 alpha-2 country of the issuing entity"),
    supplierTaxId: sourced("string", "VAT or tax identifier of the issuer"),
    invoiceNumber: sourced("string", "Document number"),
    invoiceDate: sourced("string", "Document date as YYYY-MM-DD"),
    documentType: sourced("string", "One of: invoice, credit_note, receipt, proforma"),
    totalAmount: sourced("number", "Total amount of the document"),
    vatAmount: sourced("number", "VAT or sales tax charged; 0 when it states none is charged"),
    currency: sourced("string", "ISO 4217 currency code"),
    addresseeName: sourced("string", "Name of the customer the document is addressed to"),
    addresseeVatId: sourced("string", "VAT number of the customer, as printed"),
  },
  required: [
    "supplierName",
    "supplierCountry",
    "supplierTaxId",
    "invoiceNumber",
    "invoiceDate",
    "documentType",
    "totalAmount",
    "vatAmount",
    "currency",
    "addresseeName",
    "addresseeVatId",
  ],
};

const EXTRACTION_PROMPT = `Extract the fields of this purchase document.
Rules:
- Report only what the document states. Never infer, complete or correct a value.
- If a field is not stated, set value, quote and page to null.
- "quote" must be copied verbatim from the document.
- Do not derive the country from the currency or the language.`;

/** Reads one invoice PDF. Values the document does not state come back as null. */
export async function extractInvoice(pdfPath: string): Promise<ExtractedInvoice> {
  const response = await getGemini().models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        inlineData: {
          data: fs.readFileSync(pdfPath).toString("base64"),
          mimeType: "application/pdf",
        },
      },
      EXTRACTION_PROMPT,
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: INVOICE_SCHEMA,
    },
  });
  if (!response.text) throw new Error(`Empty response while extracting ${pdfPath}`);
  return JSON.parse(response.text) as ExtractedInvoice;
}
