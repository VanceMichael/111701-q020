import { normalizePage } from './adapter.mjs';
import { readSource } from './source.mjs';
import { RecordStore } from './store.mjs';

export async function collect({ source = readSource, store = new RecordStore() } = {}) {
  const page = await source();
  const records = normalizePage(page).map((record) => store.save(record));
  return { source: page.source, observedAt: page.observedAt ?? null, records, store };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await collect();
  const summary = {
    source: result.source,
    count: result.records.length,
    sessions: result.store.sessionStates().map(({ id, name, date, state, effectiveState }) => ({
      id,
      name,
      date,
      state,
      effectiveState,
    })),
    pendingReschedules: result.store.pendingReschedules().map(({ sessionId, candidateId, candidateName }) => ({
      sessionId,
      candidateId,
      candidateName,
    })),
    reminders: {
      active: result.store.listReminders({ state: 'active' }).length,
      revoked: result.store.listReminders({ state: 'revoked' }).length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}
