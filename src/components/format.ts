// Pure helpers that turn database values into Italian UI text.
import type { ExceptionCode } from "@/lib/types";

export interface ExceptionLabel {
  title: string;
  explanation: string;
}

export const EXCEPTION_LABELS: Record<ExceptionCode, ExceptionLabel> = {
  MISSING_EXPECTED_INVOICE: {
    title: "Fattura mancante",
    explanation:
      "Aspettavamo una fattura da questo fornitore, o c'è un addebito sulla carta senza fattura.",
  },
  ADDRESSED_TO_PERSON: {
    title: "Intestata a una persona",
    explanation: "La fattura è intestata a una persona, non alla società.",
  },
  FOREIGN_VAT_CHARGED: {
    title: "IVA estera addebitata",
    explanation: "Il fornitore ha addebitato l'IVA del suo paese.",
  },
  WRONG_MONTH: {
    title: "Mese diverso",
    explanation: "La data della fattura non cade nel mese della chiusura.",
  },
  NOT_FOREIGN: {
    title: "Fornitore non estero",
    explanation: "Il fornitore risulta italiano: non rientra nel pacchetto estero.",
  },
  DUPLICATE: {
    title: "Fattura duplicata",
    explanation: "Questa fattura è già stata raccolta.",
  },
  SUPPLIER_FACTS_UNKNOWN: {
    title: "Fornitore da verificare",
    explanation: "Non abbiamo trovato dati di fatturazione affidabili per questo fornitore.",
  },
  UNREADABLE_FIELD: {
    title: "Campo illeggibile",
    explanation: "Non riusciamo a leggere con certezza un campo della fattura.",
  },
  OUT_OF_KNOWN_RULES: {
    title: "Fuori dalle regole note",
    explanation: "Il caso non rientra nelle regole che conosciamo. Decidi tu.",
  },
};

/** Plain Italian for an exception code; unknown codes are shown as they are. */
export function exceptionLabel(code: string): ExceptionLabel {
  return (
    EXCEPTION_LABELS[code as ExceptionCode] ?? {
      title: code,
      explanation: "Codice non riconosciuto dall'interfaccia.",
    }
  );
}

export const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  api: "API del fornitore",
  billing_api: "API del fornitore",
  browser: "Browser",
  unknown: "Non indicato",
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "Non indicato";
  return CHANNEL_LABELS[channel] ?? channel;
}

export type Tone = "ok" | "warn" | "bad" | "neutral";

export function supplierStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "approved":
      return { label: "Approvato", tone: "ok" };
    case "unknown":
      return { label: "Da verificare", tone: "warn" };
    case "rejected":
      return { label: "Rifiutato", tone: "bad" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function outboxStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "pending":
      return { label: "In attesa di approvazione", tone: "warn" };
    case "approved":
      return { label: "Approvata, non ancora inviata", tone: "ok" };
    case "rejected":
      return { label: "Rifiutata", tone: "bad" };
    case "sent":
      return { label: "Inviata (simulata)", tone: "ok" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function outboxKindLabel(kind: string): string {
  switch (kind) {
    case "package":
      return "Pacchetto mensile";
    case "supplier_request":
      return "Richiesta al fornitore";
    case "accountant_request":
      return "Richiesta al commercialista";
    default:
      return kind;
  }
}

export function runStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "running":
      return { label: "In corso", tone: "warn" };
    case "waiting_approval":
      return { label: "In attesa di approvazione", tone: "warn" };
    case "approved":
      return { label: "Approvato", tone: "ok" };
    case "sent":
      return { label: "Inviato (simulato)", tone: "ok" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function invoiceStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "ok":
      return { label: "Pronta", tone: "ok" };
    case "exception":
      return { label: "Bloccata", tone: "bad" };
    case "excluded":
      return { label: "Esclusa", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function actorLabel(actor: string): string {
  return actor === "autopilot" ? "Autopilota" : actor;
}

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

/** "2026-10" -> "ottobre 2026". Anything else is returned unchanged. */
export function formatMonth(month: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : month;
}

const ROME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"; shown in Rome time as "21/11/2026 15:05".
 * Null becomes an em dash; text that is not a SQLite date is returned unchanged.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return value;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  const p = Object.fromEntries(ROME.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "1234.5","EUR" -> "1.234,50 EUR". Null amount becomes "non trovato". */
export function formatAmount(amount: number | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined) return "non trovato";
  const n = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${n} ${currency}` : n;
}

/** Trims a person's name; returns null when it is empty or too long. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().replace(/\s+/g, " ");
  return t.length > 0 && t.length <= 80 ? t : null;
}

export function selfInvoiceStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "needs_input":
      return { label: "Da completare", tone: "warn" };
    case "draft":
      return { label: "Bozza da approvare", tone: "warn" };
    case "approved":
      return { label: "Approvata, non trasmessa", tone: "ok" };
    case "submitted":
      return { label: "Trasmessa (simulata)", tone: "ok" };
    case "rejected":
      return { label: "Rifiutata", tone: "bad" };
    default:
      return { label: status, tone: "neutral" };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deadline for the closure month "YYYY-MM": the 15th of the following month (as UTC midnight). */
export function deadlineFor(month: string): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2], 15)); // month index +m[2] is the next month
}

/** Whole days from `today` to the deadline of `month`; negative when it has passed. */
export function daysToDeadline(month: string, today: Date): number | null {
  const d = deadlineFor(month);
  if (!d) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d.getTime() - t) / DAY_MS);
}

/** Next 3rd of a month strictly after `today`, as "3 dicembre 2026". */
export function nextClosureLabel(today: Date): string {
  let y = today.getUTCFullYear();
  let mo = today.getUTCMonth();
  if (today.getUTCDate() >= 3) mo += 1;
  if (mo > 11) {
    mo = 0;
    y += 1;
  }
  return `3 ${MONTHS[mo]} ${y}`;
}

/**
 * "Today" for the deadline tile. PROBATA_TODAY (YYYY-MM-DD) pins the demo date; an unset or
 * invalid value falls back to the real date. `demo` is set only when the pinned date is used.
 */
export function today(
  env: string | undefined = process.env.PROBATA_TODAY,
  now: Date = new Date(),
): { date: Date; demo: string | null } {
  const m = env ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(env.trim()) : null;
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) {
      return { date: d, demo: env!.trim() };
    }
  }
  return { date: now, demo: null };
}
