"use client";
// Completes by hand the invoice fields the document did not let us read. One row per field:
// label and input side by side on desktop, stacked on mobile. Errors appear next to the field.
import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { fieldLabel } from "@/components/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeUnreadableFieldsAction } from "@/lib/actions";
import { cn } from "cn";

export function UnreadableForm({ exceptionId, fields }: { exceptionId: number; fields: string[] }) {
  const [state, formAction] = useActionState(completeUnreadableFieldsAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4 border-t border-line pt-5">
      <input type="hidden" name="id" value={exceptionId} />
      <p className="text-sm text-ink-2">
        Scrivi i valori che leggi sulla fattura originale. Probata li controlla di nuovo prima di
        chiudere l&apos;eccezione.
      </p>
      {fields.length === 0 && (
        <p className="text-ink-2">Nessun campo da completare: non lo sappiamo con certezza.</p>
      )}
      {fields.map((f) => {
        const inputId = `f-${exceptionId}-${f}`;
        const error = state?.errors?.[f];
        return (
          <div key={f} className="flex flex-col gap-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Label htmlFor={inputId} className="sm:w-64 sm:shrink-0">
                {fieldLabel(f)}
              </Label>
              <Input
                id={inputId}
                name={`field:${f}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-err` : undefined}
                className="sm:max-w-sm"
              />
            </div>
            {error && (
              <p id={`${inputId}-err`} className="text-sm font-semibold text-bad sm:ml-[17rem]">
                Errore. <span className="font-normal text-foreground">{error}</span>
              </p>
            )}
          </div>
        );
      })}
      <div className="flex flex-col gap-2 sm:max-w-xs">
        <Label htmlFor={`who-${exceptionId}`}>Il tuo nome</Label>
        <Input id={`who-${exceptionId}`} name="person" required maxLength={80} />
      </div>
      <div>
        <SubmitButton pendingLabel="Verifico…">Salva e verifica</SubmitButton>
      </div>
      {state && (
        <p role="status" className={cn("text-sm font-semibold", state.ok ? "text-ok" : "text-bad")}>
          {state.ok ? (state.closed ? "Chiusa. " : "Salvato. ") : "Errore. "}
          <span className="font-normal text-foreground">{state.message}</span>
        </p>
      )}
    </form>
  );
}
