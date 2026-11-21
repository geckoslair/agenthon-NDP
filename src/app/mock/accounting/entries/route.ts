// SIMULATED accounting software endpoint. No real accounting product is contacted.
import { addBatch, batches } from "../_lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { runId?: unknown; entries?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return Response.json({ error: "Nessuna scrittura contabile" }, { status: 422 });
  }
  const batch = addBatch(typeof body.runId === "number" ? body.runId : null, body.entries);
  return Response.json({ ref: batch.ref, simulated: true });
}

export async function GET() {
  return Response.json({ simulated: true, batches: batches() });
}
