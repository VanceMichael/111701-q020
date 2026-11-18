export class RecordStore {
  #sessions = new Map();
  #notices = new Map();
  #rosters = new Map();
  #reminders = new Map();

  save(record) {
    const kind = record.kind ?? 'session';
    switch (kind) {
      case 'session':
        return this.#saveSession(record);
      case 'notice':
        return this.#saveNotice(record);
      case 'roster':
        return this.#saveRoster(record);
      default:
        throw new Error(`未知记录类型: ${kind}`);
    }
  }

  #saveSession(record) {
    const key = `${record.source}:${record.id}`;
    const previous = this.#sessions.get(key);
    if (!previous || record.revision >= previous.revision) {
      this.#sessions.set(key, structuredClone(record));
    }
    this.#reconcileReminders();
    return structuredClone(this.#sessions.get(key));
  }

  #saveNotice(record) {
    const key = `${record.source}:${record.id}`;
    const previous = this.#notices.get(key);
    if (!previous || record.revision >= previous.revision) {
      this.#notices.set(key, structuredClone(record));
    }
    this.#reconcileReminders();
    return structuredClone(this.#notices.get(key));
  }

  #saveRoster(record) {
    const key = `${record.source}:${record.sessionId}`;
    const previous = this.#rosters.get(key);
    if (!previous || record.revision >= previous.revision) {
      this.#rosters.set(key, structuredClone(record));
    }
    this.#reconcileReminders();
    return structuredClone(this.#rosters.get(key));
  }

  // 场次的生效状态只由点名它的通知决定（取修订号最高者），与同一天的其他场次无关；
  // 名单页把全天场次一并列出、state 仍是旧值时，也不能覆盖通知的结论。
  // 没有通知时，以场次自身发布的 state 为准。
  #effectiveState(session) {
    let latest = null;
    for (const notice of this.#notices.values()) {
      if (notice.source !== session.source || !notice.sessionIds.includes(session.id)) {
        continue;
      }
      if (!latest || notice.revision > latest.revision) {
        latest = notice;
      }
    }
    if (latest) {
      return {
        state: latest.notice === 'suspension' ? 'suspended' : 'active',
        revision: latest.revision,
        noticeId: latest.id,
      };
    }
    return { state: session.state, revision: session.revision, noticeId: null };
  }

  // 提醒由存储中的场次与名单对账派生：先算出当前应当生效的提醒集合，再补缺、撤旧。
  // 提醒键包含依据修订号，恢复后再次停考会产生新提醒；已撤销的提醒是终态，不会复活。
  #reconcileReminders() {
    const desired = new Map();
    for (const session of this.#sessions.values()) {
      const effective = this.#effectiveState(session);
      if (effective.state !== 'suspended') {
        continue;
      }
      const roster = this.#rosters.get(`${session.source}:${session.id}`);
      if (!roster) {
        continue;
      }
      for (const candidate of roster.candidates) {
        const key = JSON.stringify([session.source, session.id, candidate.id, effective.revision]);
        desired.set(key, {
          source: session.source,
          sessionId: session.id,
          candidateId: candidate.id,
          candidateName: candidate.name,
          kind: 'reschedule',
          state: 'active',
          basisRevision: effective.revision,
          basisNoticeId: effective.noticeId,
        });
      }
    }
    for (const [key, reminder] of desired) {
      const existing = this.#reminders.get(key);
      if (!existing) {
        this.#reminders.set(key, reminder);
      } else if (existing.state === 'active') {
        existing.candidateName = reminder.candidateName;
      }
    }
    for (const [key, reminder] of this.#reminders) {
      if (reminder.state === 'active' && !desired.has(key)) {
        reminder.state = 'revoked';
      }
    }
  }

  list() {
    return [...this.#sessions.values()].map((record) => structuredClone(record));
  }

  listNotices() {
    return [...this.#notices.values()].map((record) => structuredClone(record));
  }

  listRosters() {
    return [...this.#rosters.values()].map((record) => structuredClone(record));
  }

  sessionStates() {
    return [...this.#sessions.values()].map((session) => {
      const effective = this.#effectiveState(session);
      return {
        ...structuredClone(session),
        effectiveState: effective.state,
        basisRevision: effective.revision,
        basisNoticeId: effective.noticeId,
      };
    });
  }

  listReminders({ state } = {}) {
    return [...this.#reminders.values()]
      .filter((reminder) => !state || reminder.state === state)
      .map((reminder) => structuredClone(reminder));
  }

  // 主办方视角：当前仍需改期的考生，按场次、考生排序。
  pendingReschedules() {
    return this.listReminders({ state: 'active' }).sort(
      (a, b) => a.sessionId.localeCompare(b.sessionId) || a.candidateId.localeCompare(b.candidateId),
    );
  }
}
