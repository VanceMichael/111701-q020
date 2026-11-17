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
  console.log(JSON.stringify({ source: result.source, count: result.records.length }, null, 2));
}
