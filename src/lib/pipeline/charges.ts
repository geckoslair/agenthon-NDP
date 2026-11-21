// Card charges CSV: header id,date,description,amount,currency.
import type { CardCharge } from "../types";

/** Splits one CSV line, honouring double quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim());
}

export function parseCharges(csv: string): CardCharge[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`charges.csv: missing column "${name}"`);
    return i;
  };
  const [id, date, description, amount, currency] = [
    "id",
    "date",
    "description",
    "amount",
    "currency",
  ].map(col);
  return lines.slice(1).map((line, n) => {
    const cells = splitCsvLine(line);
    const value = Number(cells[amount]);
    if (!Number.isFinite(value)) throw new Error(`charges.csv line ${n + 2}: invalid amount`);
    return {
      id: cells[id],
      date: cells[date],
      description: cells[description],
      amount: value,
      currency: (cells[currency] ?? "").toUpperCase(),
    };
  });
}
