// The spoken brief: plain Italian text built from the database for the latest run.
// Pure with respect to the database (read-only). Only facts present in the data are said.
import type { Db } from "../db";
import { getLatestRun, getOverview, listExceptions } from "../queries";

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/** "2026-10" becomes "ottobre 2026"; anything else is read as it is. */
export function spokenMonth(month: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : month;
}

const CHANNEL_PHRASE: Record<string, string> = {
  email: "da email",
  billing_api: "dalle API dei fornitori",
  api: "dalle API dei fornitori",
  browser: "dal browser",
};

/** What is wrong, as a short clause. Unknown codes are read as the code itself. */
const WRONG: Record<string, string> = {
  MISSING_EXPECTED_INVOICE: "manca una fattura attesa",
  ADDRESSED_TO_PERSON: "la fattura non è intestata alla società",
  FOREIGN_VAT_CHARGED: "è stata addebitata l'IVA estera",
  WRONG_MONTH: "la data non è nel mese del giro",
  NOT_FOREIGN: "il fornitore è italiano",
  DUPLICATE: "la fattura è un duplicato",
  SUPPLIER_FACTS_UNKNOWN: "non ho trovato i dati di fatturazione",
  UNREADABLE_FIELD: "non riesco a leggere un campo",
  OUT_OF_KNOWN_RULES: "il caso è fuori dalle regole note, decidi tu",
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function exceptionSentence(supplierName: string | null, code: string): string {
  const wrong = WRONG[code] ?? `codice ${code}`;
  if (supplierName) return `${supplierName}: ${wrong}.`;
  // A card charge with no invoice has no supplier attached.
  if (code === "MISSING_EXPECTED_INVOICE") return "C'è un addebito sulla carta senza fattura.";
  return `Fornitore sconosciuto: ${wrong}.`;
}

export function buildBrief(db: Db): string {
  const run = getLatestRun(db);
  if (!run) return "Nessun giro eseguito.";

  const o = getOverview(db);
  const parts: string[] = [`Giro di ${spokenMonth(run.month)}.`];

  if (o.collected === 0) {
    parts.push("Non ho raccolto nessuna fattura.");
  } else {
    const channels = o.channels
      .map((c) => `${c.count} ${CHANNEL_PHRASE[c.channel] ?? `da ${c.channel}`}`)
      .join(", ");
    parts.push(
      `Hai ${o.collected} ${plural(o.collected, "fattura raccolta", "fatture raccolte")}: ${channels}.`,
    );
    parts.push(
      o.ready === 0
        ? "Nessuna è pronta."
        : `${o.ready} ${plural(o.ready, "è pronta", "sono pronte")}.`,
    );
  }

  const open = listExceptions(db, "open").filter((e) => e.runId === run.id);
  if (open.length === 0) {
    parts.push("Nessuna eccezione aperta.");
  } else {
    parts.push(
      `Hai ${open.length} ${plural(open.length, "eccezione aperta", "eccezioni aperte")}.`,
    );
    for (const e of open) parts.push(exceptionSentence(e.supplierName, e.code));
  }

  if (o.missing > 0) {
    parts.push(
      `${o.missing} ${plural(o.missing, "fattura attesa non è arrivata", "fatture attese non sono arrivate")}.`,
    );
  }

  if (o.package?.status === "sent" && o.pendingApprovals === 0) {
    parts.push("Il pacchetto è stato inviato.");
  } else if (o.pendingApprovals > 0) {
    parts.push(
      `${o.pendingApprovals} ${plural(o.pendingApprovals, "invio aspetta", "invii aspettano")} la tua approvazione.`,
    );
  } else {
    parts.push("Nessun invio in attesa di approvazione.");
  }
  parts.push("Niente parte senza il tuo sì.");

  return parts.join(" ");
}

// ---------------------------------------------------------------- short version (about 15 s)

/** Exception kinds in the order they are named when counts tie: (singular, plural). */
const GROUPS: [string, string, string][] = [
  ["MISSING_EXPECTED_INVOICE", "una fattura mancante", "fatture mancanti"],
  ["FOREIGN_VAT_CHARGED", "una con IVA estera addebitata", "con IVA estera addebitata"],
  ["DUPLICATE", "una doppia", "doppie"],
  ["SUPPLIER_FACTS_UNKNOWN", "un fornitore sconosciuto", "fornitori sconosciuti"],
  ["ADDRESSED_TO_PERSON", "una intestata a una persona", "intestate a una persona"],
  ["WRONG_MONTH", "una del mese sbagliato", "del mese sbagliato"],
  ["NOT_FOREIGN", "un fornitore italiano", "fornitori italiani"],
  ["UNREADABLE_FIELD", "una illeggibile", "illeggibili"],
  ["OUT_OF_KNOWN_RULES", "un caso fuori dalle regole", "casi fuori dalle regole"],
];

/** At most this many kinds are named; the rest are counted. Keeps the brief to about 15 seconds. */
const MAX_GROUPS = 3;

function joinItalian(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function countPhrase(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : `${n} ${plural}`;
}

/** Three sentences: totals, open exceptions grouped by kind, what waits for approval. */
export function buildShortBrief(db: Db): string {
  const run = getLatestRun(db);
  if (!run) return "Nessun giro eseguito.";
  const o = getOverview(db);

  const totals =
    o.collected === 0
      ? "Non ho raccolto nessuna fattura."
      : `Hai raccolto ${o.collected} ${plural(o.collected, "fattura", "fatture")}: ` +
        `${o.ready === 0 ? "nessuna pronta" : countPhrase(o.ready, "una pronta", "pronte")}, ` +
        `${o.blocked === 0 ? "nessuna bloccata" : countPhrase(o.blocked, "una bloccata", "bloccate")}, ` +
        `${o.missing === 0 ? "nessuna mancante" : countPhrase(o.missing, "una mancante", "mancanti")}.`;

  const open = listExceptions(db, "open").filter((e) => e.runId === run.id);
  let exceptions: string;
  if (open.length === 0) {
    exceptions = "Nessuna eccezione aperta.";
  } else {
    const counts = new Map<string, number>();
    for (const e of open) counts.set(e.code, (counts.get(e.code) ?? 0) + 1);
    const known = GROUPS.filter(([code]) => counts.has(code)).map(([code, one, many], order) => ({
      order,
      n: counts.get(code) ?? 0,
      text: countPhrase(counts.get(code) ?? 0, one, many),
    }));
    const unknown = [...counts.entries()]
      .filter(([code]) => !GROUPS.some(([g]) => g === code))
      .map(([code, n], i) => ({ order: GROUPS.length + i, n, text: `${n} con codice ${code}` }));
    const ranked = [...known, ...unknown].sort((a, b) => b.n - a.n || a.order - b.order);
    const named = ranked.slice(0, MAX_GROUPS);
    const rest = ranked.slice(MAX_GROUPS).reduce((sum, g) => sum + g.n, 0);
    const items = named.map((g) => g.text);
    if (rest > 0) items.push(rest === 1 ? "un altro caso" : `altri ${rest}`);
    exceptions = `${open.length === 1 ? "Un'eccezione aperta" : `${open.length} eccezioni aperte`}: ${joinItalian(items)}.`;
  }

  const approval =
    o.pendingApprovals > 0
      ? `${o.pendingApprovals} ${plural(o.pendingApprovals, "invio aspetta", "invii aspettano")} la tua approvazione.`
      : o.package?.status === "sent"
        ? "Il pacchetto è stato inviato."
        : "Nessun invio in attesa di approvazione.";

  return [totals, exceptions, approval].join(" ");
}
