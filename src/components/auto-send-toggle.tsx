"use client";
// Switch for one predefined template. Flipping it submits the form; the author is the session user, set on the server.
import { useActionState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setAutoSendAction } from "@/lib/actions";
import { cn } from "cn";

export function AutoSendToggle({ template, enabled }: { template: string; enabled: boolean }) {
  const [state, formAction, pending] = useActionState(setAutoSendAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const enabledRef = useRef<HTMLInputElement>(null);
  const switchId = `auto-${template}`;
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="template" value={template} />
      <input type="hidden" name="enabled" ref={enabledRef} defaultValue={String(!enabled)} />
      <div className="flex flex-wrap items-center gap-4">
        <Switch
          id={switchId}
          checked={enabled}
          disabled={pending}
          aria-label={`Invio automatico per il modello ${template}`}
          onCheckedChange={(checked) => {
            if (enabledRef.current) enabledRef.current.value = String(checked);
            formRef.current?.requestSubmit();
          }}
        />
        <Label htmlFor={switchId} className="text-sm">
          {enabled ? "Attivo" : "Disattivo"}
        </Label>
      </div>
      {state && (
        <p role="status" className={cn("text-sm font-semibold", state.ok ? "text-ok" : "text-bad")}>
          {state.ok ? "Fatto. " : "Errore. "}
          <span className="font-normal text-foreground">{state.message}</span>
        </p>
      )}
    </form>
  );
}
