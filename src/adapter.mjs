const NOTICE_KINDS = new Set(['suspension', 'resumption']);

export function normalizePage(page) {
  return page.items.map((item) => normalizeItem(page, item));
}

function normalizeItem(page, item) {
  const type = item.type ?? 'session';
  switch (type) {
    case 'session':
      return normalizeSession(page, item);
    case 'notice':
      return normalizeNotice(page, item);
    case 'roster':
      return normalizeRoster(page, item);
    default:
      throw new Error(`未知来源记录类型: ${type}`);
  }
}

function baseRecord(page, item) {
  return {
    source: page.source,
    id: String(item.id),
    revision: Number(item.revision ?? 0),
    observedAt: page.observedAt ?? null,
  };
}

function normalizeSession(page, item) {
  if (!item.id || !item.label || !item.state) {
    throw new Error('来源记录缺少 id、label 或 state');
  }
  return {
    ...baseRecord(page, item),
    kind: 'session',
    name: String(item.label).trim(),
    date: item.date == null ? null : String(item.date),
    state: String(item.state),
  };
}

function normalizeNotice(page, item) {
  if (!item.id || !NOTICE_KINDS.has(item.notice) || !Array.isArray(item.sessions) || item.sessions.length === 0) {
    throw new Error('通知记录缺少 id、notice（suspension/resumption）或非空 sessions');
  }
  return {
    ...baseRecord(page, item),
    kind: 'notice',
    notice: String(item.notice),
    sessionIds: item.sessions.map((sessionId) => String(sessionId)),
  };
}

function normalizeRoster(page, item) {
  if (!item.id || !item.session || !Array.isArray(item.candidates)) {
    throw new Error('名单记录缺少 id、session 或 candidates');
  }
  const candidates = item.candidates.map((candidate) => {
    if (!candidate || !candidate.id || !candidate.name) {
      throw new Error('名单考生缺少 id 或 name');
    }
    return { id: String(candidate.id), name: String(candidate.name).trim() };
  });
  return {
    ...baseRecord(page, item),
    kind: 'roster',
    sessionId: String(item.session),
    candidates,
  };
}
