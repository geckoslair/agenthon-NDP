import { channelLabel, supplierStatus } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { StateTag } from "@/components/state-tag";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { listSuppliers } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SuppliersPage() {
  const suppliers = listSuppliers(getDb());
  return (
    <>
      <PageHeader
        eyebrow="Fornitori"
        title="Anagrafica fornitori"
        lead="Chi ci manda fatture. Apri un fornitore per vedere i dati trovati e le fonti."
      />
      {suppliers.length === 0 ? (
        <p className="text-ink-2">Nessun fornitore in anagrafica.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ragione sociale</TableHead>
              <TableHead>Paese</TableHead>
              <TableHead>Identificativo fiscale</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Fatture attese al mese</TableHead>
              <TableHead>Come arriva la fattura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-semibold">
                  <Link href={`/fornitori/${encodeURIComponent(s.id)}`} className="underline">
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell>{s.country ?? "non trovato"}</TableCell>
                <TableCell className="break-all">{s.taxId ?? "non trovato"}</TableCell>
                <TableCell>
                  <StateTag {...supplierStatus(s.status)} />
                </TableCell>
                <TableCell className="text-right">{s.expectedPerMonth}</TableCell>
                <TableCell>{channelLabel(s.invoiceSource)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
