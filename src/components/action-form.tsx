"use client";
// A form bound to a server action. Shows the result as plain text, green or red, never color only.
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { cn } from "cn";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && (
        <p
          role="status"
          className={cn("mt-3 text-sm font-semibold", state.ok ? "text-ok" : "text-bad")}
        >
          {state.ok ? "Fatto. " : "Errore. "}
          <span className="font-normal text-foreground">{state.message}</span>
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Un momento…",
  variant = "default",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} name={name} value={value}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
