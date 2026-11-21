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
