import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function count(sql: string): number {
  return (getDb().prepare(sql).get() as { n: number }).n;
}

export default function Home() {
  const tiles = [
    { label: "Invoices in runs", value: count("SELECT COUNT(*) AS n FROM invoices") },
    {
      label: "Open exceptions",
      value: count("SELECT COUNT(*) AS n FROM exceptions WHERE status = 'open'"),
    },
    {
      label: "Waiting for approval",
      value: count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'"),
    },
    { label: "Suppliers on file", value: count("SELECT COUNT(*) AS n FROM suppliers") },
    { label: "Audit log entries", value: count("SELECT COUNT(*) AS n FROM audit_log") },
  ];
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Foreign invoices autopilot</h1>
      <p className="mt-2 text-sm opacity-70">
        Scaffold. The monthly run, the exception queue, approvals and the audit log go here.
      </p>
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="rounded-lg border p-4">
            <div className="text-3xl font-semibold">{tile.value}</div>
            <div className="mt-1 text-sm opacity-70">{tile.label}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
