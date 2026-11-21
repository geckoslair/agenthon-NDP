import { channelLabel, supplierStatus } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { listSuppliers } from "@/lib/queries";

export const dynamic = "force-dynamic";

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export default function SuppliersPage() {
  const suppliers = listSuppliers(getDb());
  return (
    <>
      <PageHeader
        eyebrow="Fornitori"
        title="Chi ci manda fatture"
        lead="Per ogni fornitore nuovo Probata cerca i dati di fatturazione e cita la fonte. Se non trova un dato, lo dice."
      />
      {suppliers.length === 0 && <p className="text-ink-2">Nessun fornitore in anagrafica.</p>}
      <ul className="flex flex-col gap-5">
        {suppliers.map((s) => (
          <li key={s.id}>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <StateTag {...supplierStatus(s.status)} />
                </div>
                <CardTitle>{s.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-sm text-ink-2">Paese</dt>
                    <dd>{s.country ?? "non trovato"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-2">Partita IVA</dt>
                    <dd className="break-all">{s.taxId ?? "non trovato"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-2">Fatture attese al mese</dt>
                    <dd>{s.expectedPerMonth}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-2">Canale</dt>
                    <dd>{channelLabel(s.invoiceSource)}</dd>
                  </div>
                </dl>
                {s.facts.length > 0 && (
                  <div className="border-t border-line pt-5">
                    <p className="eyebrow mb-3">Dati trovati</p>
                    <ul className="flex flex-col gap-3">
                      {s.facts.map((f) => (
                        <li key={f.id} className="rounded-[12px] bg-background p-4">
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
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
