// The monthly package for the accountant: a zip of the valid PDFs and the summary email.
import fs from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";

const MONTHS_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

/** "2026-10" -> "Ottobre 2026". */
export function italianMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const index = match ? Number(match[2]) - 1 : -1;
  if (!match || index < 0 || index > 11) throw new Error(`Mese non valido: ${month}`);
  return `${MONTHS_IT[index]} ${match[1]}`;
}

export interface PackageEntry {
  supplierName: string;
  /** Invoices of this supplier included in the zip. */
  included: number;
  /** Invoices of this supplier held back by open exceptions. */
  pending: number;
  /** An expected invoice of this supplier has not arrived. */
  toReceive: boolean;
}

function note(entry: PackageEntry): string {
  const parts: string[] = [];
  if (entry.included > 1) parts.push(`${entry.included} fatture`);
  if (entry.pending > 0)
    parts.push(entry.pending === 1 ? "1 in verifica" : `${entry.pending} in verifica`);
  if (entry.toReceive) parts.push("DA RICEVERE");
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Subject and body in the format the accountant already receives. */
export function buildSummaryEmail(
  companyName: string,
  month: string,
  entries: PackageEntry[],
): { subject: string; body: string; total: number } {
  const label = italianMonth(month);
  const sorted = [...entries].sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName, "it", { sensitivity: "base" }),
  );
  const total = sorted.reduce((sum, e) => sum + e.included, 0);
  const list = sorted.map((e, i) => `${i + 1}. ${e.supplierName}${note(e)}`);
  const pending = sorted.filter((e) => e.pending > 0).length;
  const toReceive = sorted.filter((e) => e.toReceive).length;
  const body = [
    "Buongiorno,",
    "",
    `in allegato le fatture di acquisto estere di ${label.toLowerCase()}: ${total} ${total === 1 ? "fattura" : "fatture"} in totale.`,
    "",
    ...list,
    "",
    ...(pending > 0
      ? [
          'Le fatture indicate come "in verifica" non sono nello zip: le invieremo appena chiarite.',
          "",
        ]
      : []),
    ...(toReceive > 0
      ? ['Le fatture indicate come "DA RICEVERE" non sono ancora arrivate.', ""]
      : []),
    "Grazie,",
    companyName,
  ].join("\n");
  return { subject: `${companyName} | Acquisti esteri ${label}`, body, total };
}

/** Writes a zip of the given files. Names inside the zip are the file names. */
export async function buildZip(
  files: { path: string; name: string }[],
  outPath: string,
): Promise<string> {
  for (const file of files) {
    if (!fs.existsSync(file.path)) throw new Error(`File mancante per il pacchetto: ${file.path}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = fs.createWriteStream(outPath);
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  for (const file of files) archive.file(file.path, { name: file.name });
  await archive.finalize();
  await done;
  return outPath;
}

export function accountantEmail(): string {
  return process.env.ACCOUNTANT_EMAIL || "studio.contabile@example.com";
}
