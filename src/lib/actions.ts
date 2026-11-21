"use server";
// Server actions: the only way the UI changes state. Each one calls a function from
// pipeline/ or audit.ts, never writes tables itself, then revalidates the pages.
import { revalidatePath } from "next/cache";
import { cleanName } from "@/components/format";
import { decideOutgoing, markSent, setAutoSend } from "./audit";
import { getDb } from "./db";
import { DEFAULT_MONTH, getLatestRun, getOutbox } from "./queries";
import {
  decideSelfInvoice,
  exportToAccounting,
  setEuroAmount,
  submitSelfInvoice,
} from "./compliance";
import {
  approvePackage,
  completeUnreadableFields,
  deliverPackage,
  resetDemo,
  resolveException,
  runMonth,
  setDeliveryMode,
} from "./pipeline";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Per-field errors, keyed by field name (forms that complete values by hand). */
  errors?: Record<string, string>;
  /** Set by actions that may close an exception. */
  closed?: boolean;
}

/** Plain-text message for an error; the pipeline throws until it is implemented. */
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Qualcosa è andato storto. Riprova.";
}

function refresh() {
  revalidatePath("/", "layout");
}

async function guarded(fn: () => Promise<ActionResult> | ActionResult): Promise<ActionResult> {
  try {
    const result = await fn();
    refresh();
    return result;
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function id(formData: FormData, key: string): number | null {
  const n = Number(text(formData, key));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function runMonthAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  void _prev;
  void _formData;
  return guarded(async () => {
    const db = getDb();
    const month = getLatestRun(db)?.month ?? DEFAULT_MONTH;
    const summary = await runMonth(db, month);
    return {
      ok: true,
      message: `Chiusura completata: ${summary.invoices} fatture, ${summary.exceptions} eccezioni, ${summary.pendingApprovals} invii da approvare.`,
    };
  });
}

export async function resetDemoAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  void _prev;
  void _formData;
  return guarded(() => {
    resetDemo(getDb());
    return { ok: true, message: "Demo ripristinata." };
  });
}

export async function resolveExceptionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const exceptionId = id(formData, "id");
  const resolution = text(formData, "resolution");
  const person = cleanName(formData.get("person"));
  if (!exceptionId) return { ok: false, message: "Eccezione non valida." };
  if (!resolution) return { ok: false, message: "Scrivi come hai risolto l'eccezione." };
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() =>
    resolveException(getDb(), exceptionId, resolution, person)
      ? { ok: true, message: "Eccezione risolta." }
      : { ok: false, message: "L'eccezione non è più aperta." },
  );
}

export async function decideOutgoingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const outboxId = id(formData, "id");
  const decision = text(formData, "decision");
  const person = cleanName(formData.get("person"));
  if (!outboxId) return { ok: false, message: "Invio non valido." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, message: "Decisione non valida." };
  }
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() => {
    const db = getDb();
    if (decision === "approved" && getOutbox(db, outboxId)?.kind === "package") {
      const r = approvePackage(db, outboxId, person);
      return r.ok
        ? { ok: true, message: "Pacchetto approvato." }
        : { ok: false, message: r.error ?? "Il pacchetto non si può approvare." };
    }
    return decideOutgoing(db, outboxId, decision, person)
      ? { ok: true, message: decision === "approved" ? "Invio approvato." : "Invio rifiutato." }
      : { ok: false, message: "Questo invio non è più in attesa." };
  });
}

/** Approves the package even though supplier requests are unanswered: always explicit. */
export async function approvePackageForceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const outboxId = id(formData, "id");
  const person = cleanName(formData.get("person"));
  if (!outboxId) return { ok: false, message: "Invio non valido." };
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() => {
    const r = approvePackage(getDb(), outboxId, person, { force: true });
    return r.ok
      ? { ok: true, message: "Pacchetto approvato senza le fatture in attesa." }
      : { ok: false, message: r.error ?? "Il pacchetto non si può approvare." };
  });
}

export async function setDeliveryModeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const mode = text(formData, "mode");
  const person = cleanName(formData.get("person"));
  if (mode !== "accountant" && mode !== "erp") return { ok: false, message: "Scelta non valida." };
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() => {
    setDeliveryMode(getDb(), mode, person);
    return {
      ok: true,
      message:
        mode === "erp"
          ? "Destinazione: gestionale / ERP diretto (simulato)."
          : "Destinazione: commercialista, pacchetto via email.",
    };
  });
}

export async function markSentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const outboxId = id(formData, "id");
  if (!outboxId) return { ok: false, message: "Invio non valido." };
  return guarded(async () => {
    const db = getDb();
    if (getOutbox(db, outboxId)?.kind === "package") {
      const r = await deliverPackage(db, outboxId);
      if (!r.ok) return { ok: false, message: r.error ?? "Consegna non riuscita." };
      return {
        ok: true,
        message:
          r.mode === "erp"
            ? `Consegnato al gestionale (simulato). Riferimento ${r.ref ?? "—"}. Nessun gestionale reale è stato contattato.`
            : "Segnato come inviato al commercialista. L'invio è simulato: nessuna email è partita.",
      };
    }
    return markSent(db, outboxId)
      ? { ok: true, message: "Segnato come inviato. L'invio è simulato: nessuna email è partita." }
      : { ok: false, message: "Si possono inviare solo gli invii approvati." };
  });
}

export async function setAutoSendAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const template = text(formData, "template");
  const enabled = text(formData, "enabled") === "true";
  const person = cleanName(formData.get("person"));
  if (!template) return { ok: false, message: "Modello non valido." };
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() => {
    setAutoSend(getDb(), template, enabled, person);
    return {
      ok: true,
      message: enabled
        ? "Invio automatico attivato per questo modello."
        : "Invio automatico disattivato.",
    };
  });
}

// --- Adempimenti: simulated self-invoice, SdI submission and accounting export ---

export async function setEuroAmountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const selfId = id(formData, "id");
  const raw = text(formData, "amount").replace(",", ".");
  const amount = Number(raw);
  const person = cleanName(formData.get("person"));
  if (!selfId) return { ok: false, message: "Autofattura non valida." };
  if (!raw || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Scrivi un importo in euro maggiore di zero." };
  }
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() =>
    setEuroAmount(getDb(), selfId, amount, person)
      ? { ok: true, message: "Importo salvato. La bozza è pronta per la tua revisione." }
      : { ok: false, message: "L'importo si può indicare solo per le righe che lo aspettano." },
  );
}

export async function decideSelfInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const selfId = id(formData, "id");
  const decision = text(formData, "decision");
  const person = cleanName(formData.get("person"));
  if (!selfId) return { ok: false, message: "Autofattura non valida." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, message: "Decisione non valida." };
  }
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(() =>
    decideSelfInvoice(getDb(), selfId, decision, person)
      ? {
          ok: true,
          message: decision === "approved" ? "Bozza approvata." : "Bozza rifiutata.",
        }
      : { ok: false, message: "Si possono decidere solo le bozze." },
  );
}

export async function submitSelfInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const selfId = id(formData, "id");
  if (!selfId) return { ok: false, message: "Autofattura non valida." };
  return guarded(async () => {
    const r = await submitSelfInvoice(getDb(), selfId);
    return r.ok
      ? {
          ok: true,
          message: `Trasmissione simulata riuscita. Ricevuta ${r.receipt ?? "—"}. Nessun invio reale.`,
        }
      : { ok: false, message: r.error ?? "Trasmissione simulata non riuscita." };
  });
}

export async function exportAccountingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const person = cleanName(formData.get("person"));
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  return guarded(async () => {
    const db = getDb();
    const run = getLatestRun(db);
    if (!run) return { ok: false, message: "Non c'è ancora una chiusura." };
    const r = await exportToAccounting(db, run.id, person);
    return r.ok
      ? {
          ok: true,
          message: `Esportate ${r.exported} registrazioni (simulato). Nessun gestionale reale è stato contattato.`,
        }
      : { ok: false, message: r.error ?? "Esportazione simulata non riuscita." };
  });
}

/** A person types the fields the document did not let us read; the rules check them again. */
export async function completeUnreadableFieldsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const exceptionId = id(formData, "id");
  const person = cleanName(formData.get("person"));
  if (!exceptionId) return { ok: false, message: "Eccezione non valida." };
  if (!person) return { ok: false, message: "Scrivi il tuo nome." };
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field:") && typeof value === "string") values[key.slice(6)] = value.trim();
  }
  return guarded(() => {
    const r = completeUnreadableFields(getDb(), exceptionId, values, person);
    return {
      ok: r.ok,
      closed: r.closed,
      errors: r.errors,
      message:
        r.message ??
        (r.ok
          ? r.closed
            ? "Valori salvati: l'eccezione è chiusa."
            : "Valori salvati."
          : "Non ho potuto salvare i valori."),
    };
  });
}
