import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  formatAmount,
  formatMonth,
  invoiceStatus,
  outboxStatus,
  runStatus,
} from "@/components/format";
import { StateTag } from "@/components/state-tag";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resetDemoAction, runMonthAction } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { getComplianceCounts, getOverview, listInvoices } from "@/lib/queries";
import { VoiceBrief } from "@/components/voice-brief";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Tile({
  label,
  value,
  hint,
  href,
  children,
}: {
  label: string;
  value?: number;
  hint?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="eyebrow">{label}</span>
      {value !== undefined && <span className="font-serif text-4xl leading-none">{value}</span>}
      {children}
      {hint && <span className="text-sm text-ink-2">{hint}</span>}
    </>
  );
  const cls =
    "flex min-h-28 flex-col justify-between gap-2 rounded-[14px] border border-line bg-card p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-foreground hover:text-foreground`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function Home() {
  const db = getDb();
  const o = getOverview(db);
  const invoices = o.run ? listInvoices(db, o.run.id) : [];
  const c = getComplianceCounts(db);
  const pkg = o.package ? outboxStatus(o.package.status) : null;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-2">{formatMonth(o.month)}</p>
          <h1>Il giro del mese</h1>
          <p className="mt-2 text-ink-2">
            Probata controlla ogni dato e si ferma a ogni dubbio. Non invia nulla senza la tua
            approvazione.
          </p>
          {o.run && (
            <p className="mt-3">
              <StateTag {...runStatus(o.run.status)} />
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <ActionForm action={runMonthAction}>
            <SubmitButton pendingLabel="Giro in corso…">Avvia il giro del mese</SubmitButton>
          </ActionForm>
          <ActionForm action={resetDemoAction}>
            <SubmitButton variant="outline" pendingLabel="Ripristino…">
              Ripristina demo
            </SubmitButton>
          </ActionForm>
        </div>
      </div>

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

      <section aria-label="Riepilogo" className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <Tile label="Fatture pronte" value={o.ready} hint="controllate" />
        <Tile label="Bloccate" value={o.blocked} hint="aspettano te" href="/eccezioni" />
        <Tile label="Mancanti" value={o.missing} hint="attese, non arrivate" href="/eccezioni" />
        <Tile
          label="Autofatture da approvare"
          value={c.drafts}
          hint={c.needsInput > 0 ? `${c.needsInput} da completare (simulate)` : "simulate"}
          href="/adempimenti"
        />
        <Tile label="Pacchetto" href="/approvazioni">
          <StateTag
            label={pkg ? pkg.label : o.run ? "Non ancora pronto" : "Non creato"}
            tone={pkg ? pkg.tone : "neutral"}
          />
        </Tile>
      </section>

      <div className="mt-10">
        <VoiceBrief />
      </div>

      <section className="mt-16 border-t border-line pt-10" aria-labelledby="inv">
        <p className="eyebrow mb-3">Fatture del giro</p>
        <h2 id="inv" className="mb-6">
          Una per una
        </h2>
        {invoices.length === 0 ? (
          <p className="text-ink-2">Nessuna fattura ancora. Avvia il giro del mese.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornitore</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-semibold">
                    <Link href={`/fatture/${i.id}`} className="underline">
                      {i.supplierName ?? "Fornitore sconosciuto"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/fatture/${i.id}`} className="hover:underline">
                      {i.documentNumber ?? i.fileName}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{i.date ?? "non trovata"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatAmount(i.amount, i.currency)}
                  </TableCell>
                  <TableCell>
                    <StateTag {...invoiceStatus(i.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
