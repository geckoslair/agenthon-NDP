// In-memory journal of the SIMULATED accounting software. Not a real product: it only
// records what Probata sent, so the demo can show it. Survives dev reloads via globalThis.
export interface ReceivedBatch {
  ref: string;
  receivedAt: string;
  runId: number | null;
  entries: unknown[];
}

const store = globalThis as unknown as { __probataAccounting?: ReceivedBatch[] };

export function batches(): ReceivedBatch[] {
  store.__probataAccounting ??= [];
  return store.__probataAccounting;
}

export function addBatch(runId: number | null, entries: unknown[]): ReceivedBatch {
  const list = batches();
  const batch = {
    ref: `SIM-ACC-${String(list.length + 1).padStart(4, "0")}`,
    receivedAt: new Date().toISOString(),
    runId,
    entries,
  };
  list.push(batch);
  return batch;
}
