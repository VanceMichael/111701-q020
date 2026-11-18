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

test('停考通知只作用于点名的场次，同一天其他场次不受影响', async () => {
  const store = new RecordStore();
  await collect({
    source: async () => ({
      source: 'local',
      observedAt: '2026-11-17T08:00:00.000Z',
      items: [
        { id: 'A', label: '上午场', date: '2026-12-05', state: 'active', revision: 1 },
        { id: 'B', label: '下午场', date: '2026-12-05', state: 'active', revision: 1 },
        { type: 'roster', id: 'r-A', session: 'A', revision: 1, candidates: [{ id: 'c1', name: '张三' }] },
        { type: 'roster', id: 'r-B', session: 'B', revision: 1, candidates: [{ id: 'c2', name: '李四' }] },
        { type: 'notice', id: 'n-1', notice: 'suspension', sessions: ['A'], revision: 2 },
      ],
    }),
    store,
  });
  const states = new Map(store.sessionStates().map((session) => [session.id, session.effectiveState]));
  assert.equal(states.get('A'), 'suspended');
  assert.equal(states.get('B'), 'active');
  assert.deepEqual(
    store.pendingReschedules().map((reminder) => [reminder.sessionId, reminder.candidateId]),
    [['A', 'c1']],
  );
});

test('名单在停考通知之后发布，仍会生成改期提醒', async () => {
  const store = new RecordStore();
  const pages = [
    {
      source: 'local',
      items: [
        { id: 'A', label: '上午场', state: 'active', revision: 1 },
        { type: 'notice', id: 'n-1', notice: 'suspension', sessions: ['A'], revision: 2 },
      ],
    },
    {
      source: 'local',
      items: [{ type: 'roster', id: 'r-A', session: 'A', revision: 1, candidates: [{ id: 'c1', name: '张三' }] }],
    },
  ];
  for (const page of pages) {
    await collect({ source: async () => page, store });
  }
  assert.deepEqual(
    store.pendingReschedules().map((reminder) => reminder.candidateId),
    ['c1'],
  );
});

test('恢复通知撤销旧提醒，迟到的旧停考通知不能让其复活', async () => {
  const store = new RecordStore();
  await collect({
    source: async () => ({
      source: 'local',
      items: [
        { id: 'A', label: '上午场', state: 'active', revision: 1 },
        { type: 'roster', id: 'r-A', session: 'A', revision: 1, candidates: [{ id: 'c1', name: '张三' }] },
        { type: 'notice', id: 'n-stop', notice: 'suspension', sessions: ['A'], revision: 2 },
      ],
    }),
    store,
  });
  assert.equal(store.pendingReschedules().length, 1);

  await collect({
    source: async () => ({
      source: 'local',
      items: [{ type: 'notice', id: 'n-resume', notice: 'resumption', sessions: ['A'], revision: 3 }],
    }),
    store,
  });
  assert.equal(store.sessionStates()[0].effectiveState, 'active');
  assert.equal(store.pendingReschedules().length, 0);
  assert.equal(store.listReminders({ state: 'revoked' }).length, 1);

  // 修订号更低的旧停考通知迟到，不得改变生效状态，也不得让已撤销的提醒复活
  await collect({
    source: async () => ({
      source: 'local',
      items: [{ type: 'notice', id: 'n-stop-late', notice: 'suspension', sessions: ['A'], revision: 2 }],
    }),
    store,
  });
  assert.equal(store.sessionStates()[0].effectiveState, 'active');
  assert.equal(store.pendingReschedules().length, 0);
  assert.equal(store.listReminders({ state: 'revoked' }).length, 1);

  // 修订号更高的新停考通知属于新事件：生成新提醒，旧提醒保持撤销
  await collect({
    source: async () => ({
      source: 'local',
      items: [{ type: 'notice', id: 'n-stop-2', notice: 'suspension', sessions: ['A'], revision: 4 }],
    }),
    store,
  });
  assert.equal(store.sessionStates()[0].effectiveState, 'suspended');
  assert.equal(store.pendingReschedules().length, 1);
  assert.equal(store.listReminders({ state: 'active' })[0].basisRevision, 4);
  assert.equal(store.listReminders({ state: 'revoked' }).length, 1);
});

test('名单更新后，提醒与考生清单保持一致', async () => {
  const store = new RecordStore();
  await collect({
    source: async () => ({
      source: 'local',
      items: [
        { id: 'A', label: '上午场', state: 'active', revision: 1 },
        { type: 'notice', id: 'n-1', notice: 'suspension', sessions: ['A'], revision: 2 },
        {
          type: 'roster',
          id: 'r-A',
          session: 'A',
          revision: 1,
          candidates: [
            { id: 'c1', name: '张三' },
            { id: 'c2', name: '李四' },
          ],
        },
      ],
    }),
    store,
  });
  assert.deepEqual(
    store.pendingReschedules().map((reminder) => reminder.candidateId),
    ['c1', 'c2'],
  );

  await collect({
    source: async () => ({
      source: 'local',
      items: [
        {
          type: 'roster',
          id: 'r-A-v2',
          session: 'A',
          revision: 2,
          candidates: [
            { id: 'c2', name: '李四' },
            { id: 'c3', name: '王五' },
          ],
        },
      ],
    }),
    store,
  });
  assert.deepEqual(
    store.pendingReschedules().map((reminder) => reminder.candidateId),
    ['c2', 'c3'],
  );
  assert.deepEqual(
    store.listReminders({ state: 'revoked' }).map((reminder) => reminder.candidateId),
    ['c1'],
  );
});

test('通知与名单记录校验', () => {
  assert.throws(() => normalizePage({ source: 'local', items: [{ type: 'notice', id: 'n' }] }));
  assert.throws(() =>
    normalizePage({ source: 'local', items: [{ type: 'notice', id: 'n', notice: 'other', sessions: ['A'] }] }),
  );
  assert.throws(() => normalizePage({ source: 'local', items: [{ type: 'notice', id: 'n', notice: 'suspension', sessions: [] }] }));
  assert.throws(() =>
    normalizePage({ source: 'local', items: [{ type: 'roster', id: 'r', session: 'A', candidates: [{ id: 'c1' }] }] }),
  );
  assert.throws(() => normalizePage({ source: 'local', items: [{ type: 'unknown', id: 'x' }] }));
});
