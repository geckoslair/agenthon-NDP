import { channelLabel, exceptionLabel, formatAmount, invoiceStatus } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { getInvoice, listInvoiceExceptions } from "@/lib/queries";
import type { ExtractedInvoice, Sourced } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const FIELDS: { key: keyof ExtractedInvoice; label: string }[] = [
  { key: "supplierName", label: "Fornitore" },
  { key: "supplierCountry", label: "Paese del fornitore" },
  { key: "supplierTaxId", label: "Partita IVA del fornitore" },
  { key: "invoiceNumber", label: "Numero fattura" },
  { key: "invoiceDate", label: "Data" },
  { key: "documentType", label: "Tipo di documento" },
  { key: "totalAmount", label: "Totale" },
  { key: "vatAmount", label: "IVA" },
  { key: "currency", label: "Valuta" },
  { key: "addresseeName", label: "Intestatario" },
  { key: "addresseeVatId", label: "Partita IVA dell'intestatario" },
];

function show(key: keyof ExtractedInvoice, f: Sourced<string | number>, currency: string | null) {
  if (f.value === null || f.value === undefined) return "non trovato";
  if (key === "totalAmount" || key === "vatAmount") return formatAmount(Number(f.value), currency);
  return String(f.value);
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const db = getDb();
  const inv = getInvoice(db, n);
  if (!inv) notFound();
  const exceptions = listInvoiceExceptions(db, n);
  const ex = inv.extracted;
  return (
    <>
      <p className="mb-6">
        <Link href="/" className="underline">
          ← Panoramica
        </Link>
      </p>
      <PageHeader eyebrow={`Fattura ${inv.id}`} title={inv.supplierName ?? inv.fileName} />
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <StateTag {...invoiceStatus(inv.status)} />
        <span className="text-ink-2">
          File {inv.fileName} · canale: {channelLabel(inv.channel)}
          {inv.month ? ` · mese ${inv.month}` : ""}
          {inv.origin ? ` · origine: ${inv.origin}` : ""}
        </span>
      </div>

      <p className="mb-10">
        <a
          href={`/fatture/${inv.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline"
        >
          Apri la fattura originale
        </a>
      </p>

      {exceptions.length > 0 && (
        <section aria-labelledby="exc" className="mb-12 flex flex-col gap-4">
          <h2 id="exc">Eccezioni</h2>
          {exceptions.map((e) => (
            <Card key={e.id}>
              <CardHeader>
                <StateTag
                  label={e.status === "open" ? "Aperta" : "Risolta"}
                  tone={e.status === "open" ? "bad" : "ok"}
                />
                <CardTitle>{exceptionLabel(e.code).title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p>{e.message}</p>
                {e.evidence && (
                  <blockquote className="font-serif text-lg leading-snug">
                    “{e.evidence}”
                  </blockquote>
                )}
                {e.resolution && (
                  <p className="text-sm text-ink-2">
                    Risolta da {e.resolvedBy}: {e.resolution}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section aria-labelledby="fields">
        <h2 id="fields" className="mb-6">
          Dati letti dal documento
        </h2>
        {!ex ? (
          <p className="text-bad">Non riusciamo a leggere i dati salvati per questa fattura.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {FIELDS.map(({ key, label }) => {
              const f = ex[key] as Sourced<string | number> | undefined;
              if (!f) {
                return (
                  <li key={key} className="rounded-[14px] border border-line p-4">
                    <p className="text-sm text-ink-2">{label}</p>
                    <p>non trovato</p>
                  </li>
                );
              }
              return (
                <li key={key} className="rounded-[14px] border border-line p-4">
                  <p className="text-sm text-ink-2">{label}</p>
                  <p className="font-semibold">{show(key, f, ex.currency?.value ?? null)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
