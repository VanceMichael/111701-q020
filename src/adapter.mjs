export function normalizePage(page) {
  return page.items.map((item) => {
    if (!item.id || !item.label || !item.state) {
      throw new Error('来源记录缺少 id、label 或 state');
    }
    return {
      source: page.source,
      id: String(item.id),
      name: String(item.label).trim(),
      state: String(item.state),
      revision: Number(item.revision ?? 0),
      observedAt: page.observedAt ?? null,
    };
  });
}
