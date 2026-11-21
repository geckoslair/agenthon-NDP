import { actorLabel, formatDateTime } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { listAudit, listRuns } from "@/lib/queries";
import Link from "next/link";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.run) ? sp.run[0] : sp.run;
  const parsed = raw ? Number(raw) : NaN;
  const runId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const db = getDb();
  const runs = listRuns(db);
  const rows = listAudit(db, runId);
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-full border px-4 text-sm",
      active
        ? "border-foreground bg-foreground text-background hover:text-background"
        : "border-line",
    );
  return (
    <>
      <PageHeader
        eyebrow="Registro"
        title="Cosa è successo, e chi l'ha fatto"
        lead="Ogni passo è scritto qui: l'azione, su quale dato e chi l'ha approvata. Il registro non si modifica."
      />
      <nav aria-label="Filtra per giro" className="mb-8 flex flex-wrap gap-2">
        <Link
          href="/registro"
          className={chip(runId === null)}
          aria-current={runId === null ? "page" : undefined}
        >
          Tutti
        </Link>
        {runs.map((r) => (
          <Link
            key={r.id}
            href={`/registro?run=${r.id}`}
            className={chip(runId === r.id)}
            aria-current={runId === r.id ? "page" : undefined}
          >
            Giro {r.id} · {r.month}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-ink-2">Nessuna voce nel registro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Chi</TableHead>
              <TableHead>Passo</TableHead>
              <TableHead>Oggetto</TableHead>
              <TableHead>Dettaglio</TableHead>
              <TableHead>Fonte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="align-top whitespace-nowrap">
                  {formatDateTime(r.at)}
                </TableCell>
                <TableCell className="align-top">{actorLabel(r.actor)}</TableCell>
                <TableCell className="align-top font-mono text-xs">{r.step}</TableCell>
                <TableCell className="align-top break-all">{r.subject ?? "—"}</TableCell>
                <TableCell className="min-w-56 align-top whitespace-normal">
                  {r.detail ?? "—"}
                </TableCell>
                <TableCell className="align-top break-all whitespace-normal">
                  {r.source ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
