import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  correctionLabel,
  exceptionLabel,
  unreadableEvidence,
  formatDateTime,
} from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UnreadableForm } from "@/components/unreadable-form";
import {
  excludeInvoiceAction,
  requestCorrectionAction,
  resolveExceptionAction,
} from "@/lib/actions";
import { getDb } from "@/lib/db";
import { correctionStatus, unreadableFields } from "@/lib/pipeline";
import { listExceptions, type ExceptionRow } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Subject({ e }: { e: ExceptionRow }) {
  const name = e.supplierName ?? "Fornitore non identificato";
  return (
    <p className="text-ink-2">
      {name}
      {e.invoiceId && (
        <>
          {" · "}
          <Link href={`/fatture/${e.invoiceId}`} className="underline">
            {e.invoiceFile ?? `fattura ${e.invoiceId}`}
          </Link>
        </>
      )}
    </p>
  );
}

const EXCLUDABLE = ["WRONG_MONTH", "FOREIGN_VAT_CHARGED", "ADDRESSED_TO_PERSON"];

const CORRECTABLE = ["FOREIGN_VAT_CHARGED", "ADDRESSED_TO_PERSON"];

function ExcludeForm({ exceptionId }: { exceptionId: number }) {
  return (
    <ActionForm action={excludeInvoiceAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={exceptionId} />
      <p className="text-sm text-ink-2">
        {
          "Escludendo la fattura la togli da questa chiusura: il PDF resta, nulla viene spostato o dichiarato valido."
        }
      </p>
      <div>
        <SubmitButton variant="outline" pendingLabel="Escludo…">
          Escludi
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function CorrectionBlock({ exceptionId }: { exceptionId: number }) {
  const status = correctionStatus(getDb(), exceptionId);
  const l = correctionLabel(status.state);
  return (
    <ActionForm action={requestCorrectionAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={exceptionId} />
      <p className="text-sm text-ink-2">
        Puoi chiedere al fornitore un documento corretto (simulato: nessuna email parte davvero),
        oppure escludere la fattura da questa chiusura.
      </p>
      {status.state !== "none" && (
        <p className="flex flex-wrap items-center gap-3">
          <StateTag label={l.label} tone={l.tone} />
          {status.message && <span className="text-sm text-ink-2">{status.message}</span>}
          {status.outboxId && (
            <Link href="/approvazioni" className="text-sm underline">
              Vai alle approvazioni
            </Link>
          )}
        </p>
      )}
      <div>
        <SubmitButton pendingLabel="Creo la richiesta…" disabled={!l.canRequest}>
          Richiedi correzione
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function ExceptionCard({ e }: { e: ExceptionRow }) {
  const label = exceptionLabel(e.code);
  const open = e.status === "open";
  const unreadable = e.code === "UNREADABLE_FIELD";
  // For unreadable fields the raw technical text is shown with Italian labels (or not at all).
  const evidence = unreadable ? unreadableEvidence(e.evidence) : e.evidence;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StateTag label={open ? "Aperta" : "Risolta"} tone={open ? "bad" : "ok"} />
          <span className="text-[0.74rem] text-ink-2">{e.code}</span>
        </div>
        <CardTitle>{label.title}</CardTitle>
        <Subject e={e} />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p>{unreadable && open ? label.explanation : e.message || label.explanation}</p>
        <div className="rounded-[12px] bg-background p-4">
          <p className="eyebrow mb-2">Prova</p>
          {evidence ? (
            unreadable ? (
              <p className="text-lg">{evidence}</p>
            ) : (
              <blockquote className="font-serif text-lg leading-snug">“{evidence}”</blockquote>
            )
          ) : (
            <p className="text-ink-2">Nessuna prova registrata: non lo sappiamo.</p>
          )}
        </div>
        {e.invoiceId && (
          <p>
            <a
              href={`/fatture/${e.invoiceId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              Apri la fattura originale
            </a>
          </p>
        )}
        <div>
          <p className="eyebrow mb-2">Cosa propone Probata</p>
          <p>{e.proposedAction ?? "Nessuna proposta: decidi tu."}</p>
        </div>
        {open && unreadable ? (
          <UnreadableForm exceptionId={e.id} fields={unreadableFields(getDb(), e.id)} />
        ) : open && CORRECTABLE.includes(e.code) ? (
          <div className="flex flex-col gap-5 border-t border-line pt-5">
            <CorrectionBlock exceptionId={e.id} />
            <ExcludeForm exceptionId={e.id} />
          </div>
        ) : open && EXCLUDABLE.includes(e.code) ? (
          <div className="border-t border-line pt-5">
            <ExcludeForm exceptionId={e.id} />
          </div>
        ) : open ? (
          <ActionForm
            action={resolveExceptionAction}
            className="flex flex-col gap-4 border-t border-line pt-5"
          >
            <input type="hidden" name="id" value={e.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`res-${e.id}`}>Come l'hai risolta</Label>
              <Textarea id={`res-${e.id}`} name="resolution" required rows={2} />
            </div>
            <div>
              <SubmitButton pendingLabel="Salvo…">Segna come risolta</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <div className="border-t border-line pt-5">
            <p className="eyebrow mb-2">Come è stata risolta</p>
            <p>{e.resolution}</p>
            <p className="mt-1 text-sm text-ink-2">
              {e.resolvedBy} · {formatDateTime(e.resolvedAt)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExceptionsPage() {
  const db = getDb();
  const open = listExceptions(db, "open");
  const resolved = listExceptions(db, "resolved");
  return (
    <>
      <PageHeader
        eyebrow="Eccezioni"
        title="Cosa si è fermato"
        lead="Ogni eccezione blocca la chiusura finché una persona decide. Leggi la prova, poi scrivi cosa hai fatto."
      />
      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Aperte ({open.length})</TabsTrigger>
          <TabsTrigger value="resolved">Risolte ({resolved.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-6 flex flex-col gap-5">
          {open.length === 0 && <p className="text-ink-2">Nessuna eccezione aperta.</p>}
          {open.map((e) => (
            <ExceptionCard key={e.id} e={e} />
          ))}
        </TabsContent>
        <TabsContent value="resolved" className="mt-6 flex flex-col gap-5">
          {resolved.length === 0 && <p className="text-ink-2">Nessuna eccezione risolta.</p>}
          {resolved.map((e) => (
            <ExceptionCard key={e.id} e={e} />
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
