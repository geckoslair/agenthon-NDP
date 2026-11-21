import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatAmount, formatDateTime, selfInvoiceStatus } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  decideSelfInvoiceAction,
  exportAccountingAction,
  setEuroAmountAction,
  submitSelfInvoiceAction,
} from "@/lib/actions";
import { getDb } from "@/lib/db";
import { getLatestRun, listSelfInvoices, type SelfInvoiceRow } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

function pct(rate: number): string {
  return `${Math.round(rate <= 1 ? rate * 100 : rate)}%`;
}

function SelfInvoiceCard({ r }: { r: SelfInvoiceRow }) {
  const s = selfInvoiceStatus(r.status);
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {/* The foreign invoice */}
          <div className="flex items-baseline justify-between gap-4 rounded-[12px] bg-background px-4 py-3">
            <span>
              <span className="font-semibold">{r.supplierName ?? "Fornitore sconosciuto"}</span>
              <span className="ml-2 text-ink-2">
                fattura {r.invoiceNumber ?? r.invoiceFile}
                {r.invoiceDate ? ` · ${r.invoiceDate}` : ""}
              </span>
              <Link href={`/fatture/${r.invoiceId}`} className="ml-2 text-sm underline">
                dettaglio
              </Link>
            </span>
            <span className="font-serif text-2xl whitespace-nowrap">
              {formatAmount(r.originalAmount, r.originalCurrency)}
            </span>
          </div>

          <p className="eyebrow">↓ Probata</p>

          {/* The generated self-invoice, highlighted */}
          <div className="rounded-[14px] border border-foreground bg-background p-4 shadow-[var(--shadow)]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>Autofattura TD17</Badge>
              <StateTag {...s} />
              <span className="text-sm text-ink-2">n. {r.number}</span>
            </div>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-ink-2">Imponibile</dt>
                <dd className="font-serif text-xl">
                  {r.taxableEur === null ? "da indicare" : formatAmount(r.taxableEur, "EUR")}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-2">IVA {pct(r.vatRate)} (da confermare)</dt>
                <dd className="font-serif text-xl">
                  {r.vatEur === null ? "—" : formatAmount(r.vatEur, "EUR")}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-2">Totale</dt>
                <dd className="font-serif text-xl">
                  {r.totalEur === null ? "—" : formatAmount(r.totalEur, "EUR")}
                </dd>
              </div>
            </dl>
            {r.xmlPath && (
              <p className="mt-3 text-sm">
                <a
                  href={`/adempimenti/${r.id}/xml`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Vedi la bozza XML (dimostrativa)
                </a>
              </p>
            )}
          </div>

          {r.status === "needs_input" && (
            <ActionForm
              action={setEuroAmountAction}
              className="flex flex-col gap-4 border-t border-line pt-4"
            >
              <input type="hidden" name="id" value={r.id} />
              <p className="text-bad">
                <strong>Da completare.</strong>{" "}
                {r.needsInputReason ?? "Importo in euro mancante: indica il controvalore"}
              </p>
              <div className="flex flex-col gap-2 sm:max-w-xs">
                <Label htmlFor={`amt-${r.id}`}>Imponibile in euro</Label>
                <Input id={`amt-${r.id}`} name="amount" inputMode="decimal" required />
              </div>
              <div>
                <SubmitButton pendingLabel="Salvo…">Salva l&apos;importo</SubmitButton>
              </div>
            </ActionForm>
          )}

          {r.status === "draft" && (
            <ActionForm
              action={decideSelfInvoiceAction}
              className="flex flex-col gap-4 border-t border-line pt-4"
            >
              <input type="hidden" name="id" value={r.id} />
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

          {r.status === "approved" && (
            <ActionForm
              action={submitSelfInvoiceAction}
              className="flex flex-col gap-3 border-t border-line pt-4"
            >
              <input type="hidden" name="id" value={r.id} />
              <p className="text-sm text-ink-2">
                Approvata da {r.approvedBy ?? "—"} il {formatDateTime(r.approvedAt)}. La
                trasmissione è simulata: nessun invio reale allo SdI.
              </p>
              <div>
                <SubmitButton pendingLabel="Trasmetto…">Trasmetti allo SdI (simulato)</SubmitButton>
              </div>
            </ActionForm>
          )}

          {r.status === "submitted" && (
            <p className="border-t border-line pt-4 text-sm text-ink-2">
              Approvata da {r.approvedBy ?? "—"}. Trasmessa (simulata) il{" "}
              {formatDateTime(r.submittedAt)}, ricevuta{" "}
              <strong className="text-foreground">{r.sdiReceipt ?? "—"}</strong>.
              {r.accountingStatus === "exported" && " Esportata in contabilità (simulata)."}
            </p>
          )}

          {r.status === "rejected" && (
            <p className="border-t border-line pt-4 text-sm text-ink-2">
              Rifiutata da {r.approvedBy ?? "—"} il {formatDateTime(r.approvedAt)}.
            </p>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

export default function CompliancePage() {
  const db = getDb();
  const run = getLatestRun(db);
  const rows = listSelfInvoices(db);
  const toExport = rows.filter((r) => r.status === "submitted" && r.accountingStatus === "pending");
  const exported = rows.filter((r) => r.accountingStatus === "exported");
  return (
    <>
      <PageHeader
        eyebrow="Adempimenti"
        title="Autofatture e contabilità"
        lead="Per ogni fattura valida Probata prepara la bozza dell'autofattura. Niente parte senza il tuo clic."
      />

      <div role="note" className="mb-10 rounded-[14px] border border-warn p-5">
        <p>
          <StateTag label="Simulazione" tone="warn" />{" "}
          <strong>
            Simulazione: bozze dimostrative non validate fiscalmente. Nessun invio reale allo SdI né
            a un gestionale.
          </strong>
        </p>
        <p className="mt-2 text-ink-2">
          Aliquota ordinaria 22%: da confermare con il commercialista. Tipo documento TD17 e
          scadenza del 15 del mese successivo: da confermare con il commercialista.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-2">
          {run
            ? "Nessuna autofattura per questa chiusura: serve almeno una fattura valida."
            : "Nessuna chiusura ancora. Avvia la chiusura dalla panoramica."}
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {rows.map((r) => (
            <SelfInvoiceCard key={r.id} r={r} />
          ))}
        </ul>
      )}

      <section
        aria-labelledby="acc"
        className="mt-16 flex flex-col gap-5 border-t border-line pt-10"
      >
        <div>
          <p className="eyebrow mb-3">Contabilità</p>
          <h2 id="acc">Esportazione verso il gestionale (simulata)</h2>
        </div>
        <p className="max-w-[70ch] text-ink-2">
          Si esportano solo le autofatture approvate e trasmesse. Nessun gestionale reale viene
          contattato.
        </p>
        <ActionForm action={exportAccountingAction} className="flex flex-col gap-4">
          <div>
            <SubmitButton pendingLabel="Esporto…">Esporta in contabilità (simulato)</SubmitButton>
            <span className="ml-3 text-sm text-ink-2">{toExport.length} da esportare</span>
          </div>
        </ActionForm>
        <h3 className="mt-4 text-[1.2rem]">Registrazioni esportate ({exported.length})</h3>
        {exported.length === 0 ? (
          <p className="text-ink-2">Nessuna registrazione esportata.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exported.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-[12px] border border-line px-4 py-3"
              >
                <span>
                  {r.number} · {r.supplierName ?? "—"}
                  <span className="block text-sm text-ink-2">
                    Esportata da {r.exportedBy ?? "—"} il {formatDateTime(r.exportedAt)}
                  </span>
                </span>
                <span>
                  Riferimento <strong>{r.accountingRef ?? "—"}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
