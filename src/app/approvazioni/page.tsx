import { ActionForm, SubmitButton } from "@/components/action-form";
import { AutoSendToggle } from "@/components/auto-send-toggle";
import { formatDateTime, outboxKindLabel, outboxStatus } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideOutgoingAction, markSentAction } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { listAutoSend, listOutbox, type OutboxRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

function OutboxCard({ m }: { m: OutboxRow }) {
  const s = outboxStatus(m.status);
  return (
    <Card className={m.kind === "package" ? "border-foreground shadow-[var(--shadow)]" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{outboxKindLabel(m.kind)}</Badge>
          <StateTag {...s} />
        </div>
        <CardTitle>{m.subject}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-2">A</dt>
          <dd className="break-all">{m.recipient}</dd>
          <dt className="text-ink-2">Allegato</dt>
          <dd>{m.attachmentName ?? "nessuno"}</dd>
        </dl>
        <pre className="max-h-96 overflow-auto rounded-[12px] bg-background p-4 font-sans text-[0.95rem] leading-relaxed whitespace-pre-wrap">
          {m.body}
        </pre>

        {m.status === "pending" && (
          <ActionForm
            action={decideOutgoingAction}
            className="flex flex-col gap-4 border-t border-line pt-5"
          >
            <input type="hidden" name="id" value={m.id} />
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor={`who-${m.id}`}>Il tuo nome</Label>
              <Input id={`who-${m.id}`} name="person" required maxLength={80} />
            </div>
            <div className="flex flex-wrap gap-3">
              <SubmitButton name="decision" value="approved" pendingLabel="Salvo…">
                Approva
              </SubmitButton>
              <SubmitButton
                name="decision"
                value="rejected"
                variant="outline"
                pendingLabel="Salvo…"
              >
                Rifiuta
              </SubmitButton>
            </div>
          </ActionForm>
        )}

        {m.status === "approved" && (
          <ActionForm
            action={markSentAction}
            className="flex flex-col gap-3 border-t border-line pt-5"
          >
            <input type="hidden" name="id" value={m.id} />
            <p className="text-sm text-ink-2">
              Approvata da {m.approvedBy ?? "—"}
              {m.approvedVia === "auto_policy" ? " (invio automatico)" : ""} il{" "}
              {formatDateTime(m.approvedAt)}. L'invio è simulato: nessuna email parte davvero.
            </p>
            <div>
              <SubmitButton pendingLabel="Invio…">Invia</SubmitButton>
            </div>
          </ActionForm>
        )}

        {(m.status === "sent" || m.status === "rejected") && (
          <p className="border-t border-line pt-5 text-sm text-ink-2">
            {m.status === "rejected" ? "Rifiutata" : "Approvata"} da {m.approvedBy ?? "—"} il{" "}
            {formatDateTime(m.approvedAt)}.
            {m.sentAt && ` Inviata il ${formatDateTime(m.sentAt)} (simulata).`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ApprovalsPage() {
  const db = getDb();
  const pending = listOutbox(db, "pending");
  const approved = listOutbox(db, "approved");
  const done = listOutbox(db, "done");
  const policies = listAutoSend(db);
  return (
    <>
      <PageHeader
        eyebrow="Approvazioni"
        title="Cosa sta per uscire"
        lead="Niente lascia l'azienda senza il tuo sì. Leggi il messaggio per intero, poi approva o rifiuta."
      />

      <section aria-labelledby="pending" className="flex flex-col gap-5">
        <h2 id="pending">In attesa di approvazione ({pending.length})</h2>
        {pending.length === 0 && <p className="text-ink-2">Niente da approvare.</p>}
        {pending.map((m) => (
          <OutboxCard key={m.id} m={m} />
        ))}
      </section>

      <section
        aria-labelledby="approved"
        className="mt-16 flex flex-col gap-5 border-t border-line pt-10"
      >
        <h2 id="approved">Approvate, da inviare ({approved.length})</h2>
        {approved.length === 0 && <p className="text-ink-2">Nessun invio approvato in attesa.</p>}
        {approved.map((m) => (
          <OutboxCard key={m.id} m={m} />
        ))}
      </section>

      <section
        aria-labelledby="auto"
        className="mt-16 flex flex-col gap-5 border-t border-line pt-10"
      >
        <div>
          <p className="eyebrow mb-3">Invio automatico</p>
          <h2 id="auto">Modelli che partono da soli</h2>
        </div>
        <p className="max-w-[70ch] text-ink-2">
          Puoi permettere a un modello predefinito di partire senza un clic. Vale solo per quel
          modello, resta spento finché non lo accendi tu e puoi spegnerlo in ogni momento.{" "}
          <strong className="text-foreground">
            Il pacchetto mensile non può mai essere inviato in automatico.
          </strong>
        </p>
        {policies.length === 0 && (
          <p className="text-ink-2">Nessun modello predefinito ancora in uso.</p>
        )}
        <ul className="flex flex-col gap-3">
          {policies.map((p) => (
            <li key={p.template} className="rounded-[14px] border border-line p-4">
              <p className="mb-3 font-semibold">{p.template}</p>
              <AutoSendToggle template={p.template} enabled={p.enabled} />
              {p.enabled && (
                <p className="mt-3 text-sm text-ink-2">
                  Attivato da {p.enabledBy ?? "—"} il {formatDateTime(p.enabledAt)}.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section
          aria-labelledby="done"
          className="mt-16 flex flex-col gap-5 border-t border-line pt-10"
        >
          <h2 id="done">Chiuse ({done.length})</h2>
          {done.map((m) => (
            <OutboxCard key={m.id} m={m} />
          ))}
        </section>
      )}
    </>
  );
}
