import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePage } from '../src/adapter.mjs';
import { collect } from '../src/pipeline.mjs';
import { RecordStore } from '../src/store.mjs';

test('采集链保留来源、记录身份和观察时间', async () => {
  const store = new RecordStore();
  const result = await collect({
    source: async () => ({
      source: 'local',
      observedAt: '2026-11-17T08:00:00.000Z',
      items: [{ id: 'a', label: '样例记录', state: 'active', revision: 1 }],
    }),
    store,
  });
  assert.equal(result.records[0].source, 'local');
  assert.equal(result.records[0].id, 'a');
  assert.equal(result.records[0].observedAt, '2026-11-17T08:00:00.000Z');
  assert.equal(store.list().length, 1);
});

test('重复身份按较新的修订号更新', () => {
  const store = new RecordStore();
  store.save({ source: 'local', id: 'a', name: '旧值', state: 'active', revision: 1 });
  store.save({ source: 'local', id: 'a', name: '新值', state: 'active', revision: 2 });
  assert.equal(store.list()[0].name, '新值');
});

test('不完整来源记录被拒绝', () => {
  assert.throws(() => normalizePage({ source: 'local', items: [{ id: 'a' }] }));
});
