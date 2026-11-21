// Email channel: reads the fixture mailbox demo/<month>/inbox/*.eml and saves PDF attachments.
import fs from "node:fs";
import path from "node:path";
import { simpleParser } from "mailparser";
import type { CollectedDocument, InvoiceSource } from "./types";
import { looksLikePdf, safeFileName, writeFile } from "./fs-util";

export interface ParsedPdfAttachment {
  fileName: string;
  content: Buffer;
}

export interface ParsedEmail {
  messageId: string | null;
  from: string | null;
  subject: string | null;
  attachments: ParsedPdfAttachment[];
}

/** Parses one .eml and keeps only its PDF attachments. */
export async function parseEmail(raw: Buffer | string): Promise<ParsedEmail> {
  const mail = await simpleParser(raw);
  const attachments = mail.attachments
    .filter(
      (a) =>
        a.contentType === "application/pdf" || (a.filename ?? "").toLowerCase().endsWith(".pdf"),
    )
    .filter((a) => looksLikePdf(a.content))
    .map((a, i) => ({
      fileName: safeFileName(a.filename ?? `attachment-${i + 1}.pdf`),
      content: a.content,
    }));
  return {
    messageId: mail.messageId ?? null,
    from: mail.from?.text ?? null,
    subject: mail.subject ?? null,
    attachments,
  };
}

export interface EmailSourceOptions {
  /** Folder with the .eml files, e.g. demo/2026-10/inbox. */
  inboxDir: string;
  /** Where attachments are saved. */
  outDir: string;
}

export function createEmailSource(options: EmailSourceOptions): InvoiceSource & {
  warnings: string[];
} {
  const warnings: string[] = [];
  return {
    kind: "email",
    warnings,
    async collect(): Promise<CollectedDocument[]> {
      if (!fs.existsSync(options.inboxDir)) {
        warnings.push(`Casella email non trovata: ${options.inboxDir}`);
        return [];
      }
      const files = fs
        .readdirSync(options.inboxDir)
        .filter((f) => f.toLowerCase().endsWith(".eml"))
        .sort();
      const documents: CollectedDocument[] = [];
      for (const file of files) {
        try {
          const parsed = await parseEmail(fs.readFileSync(path.join(options.inboxDir, file)));
          for (const attachment of parsed.attachments) {
            const target = writeFile(options.outDir, attachment.fileName, attachment.content);
            documents.push({
              fileName: attachment.fileName,
              path: target,
              source: "email",
              origin: `email:${parsed.messageId ?? file}`,
              supplierId: null,
            });
          }
        } catch (error) {
          warnings.push(`Email ${file} non leggibile: ${(error as Error).message}`);
        }
      }
      return documents;
    },
  };
}
