// SIMULATED SdI endpoint. No real tax authority is contacted: it only checks that the draft
// carries a taxable amount and a supplier identifier, and returns a fake receipt.
import { readTag } from "@/lib/compliance/xml";

export const dynamic = "force-dynamic";

let counter = 0;

export async function POST(request: Request) {
  const xml = await request.text();
  const taxable = readTag(xml, "ImponibileEUR");
  const taxId = readTag(xml, "IdFiscale");
  const missing: string[] = [];
  if (!taxable || !Number.isFinite(Number(taxable))) missing.push("imponibile");
  if (!taxId) missing.push("identificativo fiscale del fornitore");
  if (missing.length > 0) {
    return Response.json(
      {
        outcome: "rejected",
        simulated: true,
        error: `Scartata (simulazione): manca ${missing.join(" e ")}`,
      },
      { status: 422 },
    );
  }
  counter += 1;
  const receipt = `SIM-${Date.now().toString(36).toUpperCase()}-${String(counter).padStart(3, "0")}`;
  return Response.json({ receipt, outcome: "accepted", simulated: true });
}
