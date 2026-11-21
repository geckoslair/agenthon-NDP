import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  channelLabel,
  formatDateTime,
  formatMonth,
  invoiceStatus,
  outboxStatus,
  runStatus,
} from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resetDemoAction, runMonthAction } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { getComplianceCounts, getOverview, listInvoices } from "@/lib/queries";
import { VoiceBrief } from "@/components/voice-brief";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CHANNELS = ["email", "billing_api", "browser"];

function Row({ label, hint, value }: { label: string; hint?: string; value: number }) {
  return (
    <li className="flex items-baseline justify-between gap-4 rounded-[12px] bg-background px-4 py-3">
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="ml-2 text-ink-2">{hint}</span>}
      </span>
      <span className="font-serif text-2xl">{value}</span>
    </li>
  );
}

export default function Home() {
  const db = getDb();
  const o = getOverview(db);
  const invoices = o.run ? listInvoices(db, o.run.id) : [];
  const counts = new Map(o.channels.map((c) => [c.channel, c.count]));
  const extra = o.channels.filter((c) => !CHANNELS.includes(c.channel));
  const c = getComplianceCounts(db);
  const pkg = o.package ? outboxStatus(o.package.status) : null;

  return (
    <>
      <PageHeader
        eyebrow={formatMonth(o.month)}
        title="Il giro del mese"
        lead="Probata raccoglie le fatture estere, controlla ogni dato e si ferma a ogni dubbio. Non invia nulla senza la tua approvazione."
      />

      {o.warnings.length > 0 && (
        <section aria-labelledby="warn" className="mb-8 rounded-[14px] border border-warn p-5">
          <h2 id="warn" className="mb-3">
            <StateTag label="Da verificare" tone="warn" />{" "}
            <span className="ml-2">Avvisi dell'ultimo giro</span>
          </h2>
          <ul className="list-disc pl-5">
            {o.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <p className="eyebrow">Fatture raccolte</p>
            <CardTitle>
              {o.run ? `${o.collected} fatture nel giro` : "Nessun giro ancora"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {!o.run && (
              <p className="text-ink-2">
                Avvia il giro del mese per raccogliere le fatture da email, API e browser.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {CHANNELS.map((c) => (
                <Row key={c} label={channelLabel(c)} value={counts.get(c) ?? 0} />
              ))}
              {extra.map((c) => (
                <Row key={c.channel} label={channelLabel(c.channel)} value={c.count} />
              ))}
            </ul>
            <p className="eyebrow">Esito</p>
            <ul className="flex flex-col gap-2">
              <Row label="Pronte" hint="controllate, nessun dubbio" value={o.ready} />
              <Row label="Bloccate" hint="aspettano una tua decisione" value={o.blocked} />
              <Row label="Mancanti" hint="attese ma non arrivate" value={o.missing} />
            </ul>
            <div className="flex flex-wrap gap-2">
              {o.run && <StateTag {...runStatus(o.run.status)} />}
              {o.openExceptions > 0 && (
                <StateTag label={`${o.openExceptions} eccezioni aperte`} tone="bad" />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="border-foreground shadow-[var(--shadow)]">
            <CardHeader>
              <p className="eyebrow">Pacchetto per il commercialista</p>
              <CardTitle>
                {pkg ? pkg.label : o.run ? "Non ancora pronto" : "Non ancora creato"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {pkg && <StateTag {...pkg} />}
              <p className="text-ink-2">
                {o.package?.sentAt
                  ? `Inviato il ${formatDateTime(o.package.sentAt)} (invio simulato).`
                  : "Il pacchetto non parte mai da solo: serve la tua approvazione."}
              </p>
              <p>
                <Link href="/approvazioni" className="font-semibold underline">
                  Vai alle approvazioni →
                </Link>{" "}
                {o.pendingApprovals > 0 && (
                  <span className="text-ink-2">({o.pendingApprovals} in attesa)</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Adempimenti (simulati)</p>
              <CardTitle>Autofatture</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                <li>{c.needsInput} da completare</li>
                <li>{c.drafts} bozze</li>
                <li>{c.approved} approvate</li>
                <li>{c.submitted} trasmesse</li>
                <li>{c.exported} esportate</li>
              </ul>
              <p>
                <Link href="/adempimenti" className="font-semibold underline">
                  Vai agli adempimenti →
                </Link>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <ActionForm action={runMonthAction}>
                <SubmitButton pendingLabel="Giro in corso…">Avvia il giro del mese</SubmitButton>
              </ActionForm>
              <ActionForm action={resetDemoAction}>
                <SubmitButton variant="outline" pendingLabel="Ripristino…">
                  Ripristina demo
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <VoiceBrief />
        </div>
      </div>

      {invoices.length > 0 && (
        <section className="mt-16 border-t border-line pt-10" aria-labelledby="inv">
          <p className="eyebrow mb-3">Fatture del giro</p>
          <h2 id="inv" className="mb-6">
            Una per una
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {invoices.map((i) => {
              const s = invoiceStatus(i.status);
              return (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line px-4 py-3"
                >
                  <span>
                    <Link href={`/fatture/${i.id}`} className="font-semibold underline">
                      {i.supplierName ?? "Fornitore sconosciuto"}
                    </Link>
                    <span className="block text-sm text-ink-2">
                      {i.fileName} · {channelLabel(i.channel)}
                    </span>
                  </span>
                  <StateTag {...s} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
