// In-memory inbox of the SIMULATED invoicing/ERP product. No real product is connected:
// it only records what Probata sent, so the demo can show it.
export interface ErpBatch {
  ref: string;
  receivedAt: string;
  runId: number | null;
  documents: unknown[];
}

const store = globalThis as unknown as { __probataErp?: ErpBatch[] };

export function erpBatches(): ErpBatch[] {
  store.__probataErp ??= [];
  return store.__probataErp;
}

export function addErpBatch(runId: number | null, documents: unknown[]): ErpBatch {
  const list = erpBatches();
  const batch = {
    ref: `SIM-ERP-${String(list.length + 1).padStart(4, "0")}`,
    receivedAt: new Date().toISOString(),
    runId,
    documents,
  };
  list.push(batch);
  return batch;
}
