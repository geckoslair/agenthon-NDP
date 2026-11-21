// Small helpers shared by the source adapters.
import fs from "node:fs";
import path from "node:path";

/** Keeps only the base name and strips characters that are unsafe in a file name. */
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "document.pdf" : cleaned;
}

/** True when the buffer starts with the PDF magic bytes. */
export function looksLikePdf(content: Uint8Array): boolean {
  return (
    content.length >= 4 &&
    content[0] === 0x25 && // %
    content[1] === 0x50 && // P
    content[2] === 0x44 && // D
    content[3] === 0x46 // F
  );
}

export function writeFile(dir: string, fileName: string, content: Uint8Array): string {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, safeFileName(fileName));
  fs.writeFileSync(target, content);
  return target;
}

/** The supplier id encoded in a demo file name: the part before the first "-". */
export function supplierIdFromFileName(fileName: string): string | null {
  const match = /^([a-z0-9]+)-/i.exec(path.basename(fileName));
  return match ? match[1].toLowerCase() : null;
}
