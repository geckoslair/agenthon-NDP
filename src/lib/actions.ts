"use server";
// Server actions: the only way the UI changes state. Each one calls a function from
// pipeline/ or audit.ts, never writes tables itself, then revalidates the pages.
import { revalidatePath } from "next/cache";
import { cleanName } from "@/components/format";
import { decideOutgoing, markSent, setAutoSend } from "./audit";
import { getDb } from "./db";
import { DEFAULT_MONTH, getLatestRun } from "./queries";
import { resetDemo, resolveException, runMonth } from "./pipeline";

export interface ActionResult {
  ok: boolean;
  message: string;
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
      message: `Giro completato: ${summary.invoices} fatture, ${summary.exceptions} eccezioni, ${summary.pendingApprovals} invii da approvare.`,
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
  return guarded(() =>
    decideOutgoing(getDb(), outboxId, decision, person)
      ? {
          ok: true,
          message: decision === "approved" ? "Invio approvato." : "Invio rifiutato.",
        }
      : { ok: false, message: "Questo invio non è più in attesa." },
  );
}

export async function markSentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  void _prev;
  const outboxId = id(formData, "id");
  if (!outboxId) return { ok: false, message: "Invio non valido." };
  return guarded(() =>
    markSent(getDb(), outboxId)
      ? { ok: true, message: "Segnato come inviato. L'invio è simulato: nessuna email è partita." }
      : { ok: false, message: "Si possono inviare solo gli invii approvati." },
  );
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
