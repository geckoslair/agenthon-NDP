import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  daysToDeadline,
  formatAmount,
  nextClosureLabel,
  today,
  formatMonth,
  invoiceStatus,
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
import { getComplianceCounts, getOverview, listInvoices, listMonths } from "@/lib/queries";
import { ListenButton } from "@/components/listen-button";
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
    "flex min-h-28 min-w-[9.5rem] flex-1 basis-[10rem] flex-col justify-between gap-2 rounded-[14px] border border-line bg-card p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-foreground hover:text-foreground`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mese?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawMonth = Array.isArray(sp.mese) ? sp.mese[0] : sp.mese;
  const db = getDb();
  const months = listMonths(db);
  const month = rawMonth && months.includes(rawMonth) ? rawMonth : (months[0] ?? null);
  const o = getOverview(db, month);
  const invoices = o.run ? listInvoices(db, o.run.id) : [];
  const c = getComplianceCounts(db, o.run?.id);
  const now = today();
  const days = o.run ? daysToDeadline(o.month, now.date) : null;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-2">Chiusura mensile</p>
          <h1>Chiusura di {formatMonth(o.month)}</h1>
          <p className="mt-2 text-ink-2">
            Probata controlla ogni dato e si ferma a ogni dubbio. Non invia nulla senza la tua
            approvazione.
          </p>
          <p className="mt-2 text-sm text-ink-2">
            Prossima chiusura prevista: {nextClosureLabel(now.date)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {o.run && <StateTag {...runStatus(o.run.status)} />}
            <ListenButton label="Ascolta il riepilogo" size="sm" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <ActionForm action={runMonthAction}>
            <SubmitButton pendingLabel="Chiusura in corso…">Avvia la chiusura</SubmitButton>
          </ActionForm>
          <ActionForm action={resetDemoAction}>
            <SubmitButton variant="outline" pendingLabel="Ripristino…">
              Ripristina demo
            </SubmitButton>
          </ActionForm>
        </div>
      </div>

      <div className="mb-8 flex flex-col gap-3">
        {months.length > 0 && (
          <nav aria-label="Mese della chiusura" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">Mese</span>
            {months.map((m) => (
              <Link
                key={m}
                href={`/?mese=${m}`}
                aria-current={m === o.month ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-full border px-4 text-sm ${
                  m === o.month
                    ? "border-foreground bg-foreground text-background hover:text-background"
                    : "border-line"
                }`}
              >
                {formatMonth(m)}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {o.warnings.length > 0 && (
        <section aria-labelledby="warn" className="mb-8 rounded-[14px] border border-warn p-5">
          <h2 id="warn" className="mb-3">
            <StateTag label="Da verificare" tone="warn" />{" "}
            <span className="ml-2">Avvisi dell'ultima chiusura</span>
          </h2>
          <ul className="list-disc pl-5">
            {o.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Riepilogo" className="flex flex-wrap gap-5">
        <Tile label="Fatture pronte" value={o.ready} hint="controllate" />
        <Tile label="Bloccate" value={o.blocked} hint="aspettano te" href="/eccezioni" />
        <Tile
          label="Autofatture da approvare"
          value={c.drafts}
          hint={c.needsInput > 0 ? `${c.needsInput} da completare (simulate)` : "simulate"}
          href="/adempimenti"
        />
        <Tile
          label="Scadenza"
          value={days === null ? undefined : Math.abs(days)}
          hint={
            days === null
              ? "nessuna chiusura"
              : `${days >= 0 ? "giorni al 15 del mese dopo" : "giorni di ritardo sul 15"}${
                  now.demo ? ` · Data dimostrativa: ${now.demo}` : ""
                }`
          }
        />
      </section>

      <section className="mt-16 border-t border-line pt-10" aria-labelledby="inv">
        <h2 id="inv" className="mb-6">
          Fatture della chiusura
        </h2>
        {invoices.length === 0 ? (
          <p className="text-ink-2">Nessuna fattura ancora. Avvia la chiusura.</p>
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
