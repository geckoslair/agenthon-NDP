import { channelLabel, supplierStatus } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { getDb } from "@/lib/db";
import { getSupplier } from "@/lib/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getSupplier(getDb(), decodeURIComponent(id));
  if (!s) notFound();
  return (
    <>
      <p className="mb-6">
        <Link href="/fornitori" className="underline">
          ← Anagrafica fornitori
        </Link>
      </p>
      <PageHeader eyebrow="Fornitore" title={s.name} />
      <div className="mb-8">
        <StateTag {...supplierStatus(s.status)} />
      </div>
      <dl className="mb-12 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-ink-2">Paese</dt>
          <dd>{s.country ?? "non trovato"}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-2">Identificativo fiscale</dt>
          <dd className="break-all">{s.taxId ?? "non trovato"}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-2">Fatture attese al mese</dt>
          <dd>{s.expectedPerMonth}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-2">Come arriva la fattura</dt>
          <dd>{channelLabel(s.invoiceSource)}</dd>
        </div>
      </dl>
      <section aria-labelledby="facts">
        <p className="eyebrow mb-3">Dati trovati</p>
        <h2 id="facts" className="mb-6">
          Fatti e fonti
        </h2>
        {s.facts.length === 0 ? (
          <p className="text-ink-2">Nessun dato ricercato per questo fornitore.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {s.facts.map((f) => (
              <li key={f.id} className="rounded-[14px] border border-line p-4">
                <p className="font-semibold">{f.fact}</p>
                {f.unknown ? (
                  <p className="text-ink-2">non trovato</p>
                ) : (
                  <>
                    <p>{f.value}</p>
                    {f.quote && (
                      <blockquote className="mt-2 font-serif text-lg leading-snug">
                        “{f.quote}”
                      </blockquote>
                    )}
                    {f.sourceUrl && (
                      <p className="mt-2 text-sm break-all">
                        Fonte:{" "}
                        {isHttp(f.sourceUrl) ? (
                          <a
                            href={f.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline"
                          >
                            {f.sourceUrl}
                          </a>
                        ) : (
                          f.sourceUrl
                        )}
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
