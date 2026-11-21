// CONTRACT FILE. Owned by the coordinator: do not change without asking.
import fs from "node:fs";
import path from "node:path";
import type { CollectedDocument } from "./sources/types";
import type { ExtractedInvoice } from "./types";

export interface Extractor {
  extract(document: CollectedDocument): Promise<ExtractedInvoice>;
}

/**
 * Reads the ground truth written next to the demo data:
 * demo/<month>/truth/<fileName without .pdf>.json. Used by default so that the app,
 * the tests and the demo never depend on a live model call.
 */
export class FixtureExtractor implements Extractor {
  constructor(private readonly truthDir: string) {}

  async extract(document: CollectedDocument): Promise<ExtractedInvoice> {
    const file = path.join(this.truthDir, document.fileName.replace(/\.pdf$/i, ".json"));
    if (!fs.existsSync(file)) throw new Error(`No ground truth for ${document.fileName}`);
    return JSON.parse(fs.readFileSync(file, "utf8")) as ExtractedInvoice;
  }
}

/** Live extraction with Gemini on Vertex AI. Selected with EXTRACTOR=gemini. */
export class GeminiExtractor implements Extractor {
  async extract(document: CollectedDocument): Promise<ExtractedInvoice> {
    const { extractInvoice } = await import("./gemini");
    return extractInvoice(document.path);
  }
}

export function getExtractor(truthDir: string): Extractor {
  return process.env.EXTRACTOR === "gemini"
    ? new GeminiExtractor()
    : new FixtureExtractor(truthDir);
}
