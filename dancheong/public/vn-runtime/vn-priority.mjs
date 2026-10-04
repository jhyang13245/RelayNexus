// Only queued work is reordered. An already-paid request is never cancelled.
export function createPriorityPool(limit = 2) {
  let running = 0, order = 0; const waiting = [], priorities = new Map();
  const drain = () => {
    waiting.sort((a,b) => (priorities.get(a.key) ?? a.priority) - (priorities.get(b.key) ?? b.priority) || a.order-b.order);
    while (running < limit && waiting.length) { const row = waiting.shift(); running++; row.resolve(() => { running--; priorities.delete(row.key); drain(); }); }
  };
  return {
    acquire(key, priority = 20) { return new Promise(resolve => { waiting.push({ key, priority, order: order++, resolve }); drain(); }); },
    promote(key, priority) { priorities.set(key, Math.min(priorities.get(key) ?? Infinity, priority)); if (priorities.size > 256) priorities.delete(priorities.keys().next().value); drain(); },
  };
}
