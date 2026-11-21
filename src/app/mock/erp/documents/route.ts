// SIMULATED direct integration with a generic invoicing/ERP product. Nothing real is connected.
import { addErpBatch, erpBatches } from "../_lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { runId?: unknown; documents?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON non valido", simulated: true }, { status: 400 });
  }
  if (!Array.isArray(body.documents)) {
    return Response.json(
      { error: "Manca l'elenco dei documenti", simulated: true },
      { status: 422 },
    );
  }
  const batch = addErpBatch(typeof body.runId === "number" ? body.runId : null, body.documents);
  return Response.json({ ref: batch.ref, received: batch.documents.length, simulated: true });
}

export async function GET() {
  return Response.json({ simulated: true, batches: erpBatches() });
}
