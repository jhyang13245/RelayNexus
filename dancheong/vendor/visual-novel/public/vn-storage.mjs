// Browser storage protection and scoped, explicit media maintenance.
const persistenceKey = 'dancheong-vn-persist-requested-v1';
const pauseKey = 'dancheong-vn-media-paused-v1:';
let requesting = null, requested = false, localTasks = 0;
export const MEDIA_LOCK = 'dancheong-vn-media-maintenance';
export function formatBytes(value) {
  if (!Number.isFinite(value)) return '확인 불가';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${(value / 1024 ** 3).toFixed(2)} GB`;
}
export async function storageStatus(storage = globalThis.navigator?.storage) {
  const [estimate, persistent] = await Promise.all([
    storage?.estimate?.().catch(() => null), storage?.persisted?.().catch(() => null),
  ]);
  return { usage: estimate?.usage, quota: estimate?.quota, persistent: persistent ?? null, supported: typeof storage?.persist === 'function' };
}
export function requestDurableStorage({ manual = false, storage = globalThis.navigator?.storage, preferences = globalThis.localStorage } = {}) {
  if (requesting) return requesting;
  if (!storage?.persist) return Promise.resolve(false);
  if (!manual) {
    let prior = requested;
    try { prior ||= preferences?.getItem(persistenceKey) === '1'; } catch { /* Private mode. */ }
    if (prior) return Promise.resolve(false);
  }
  requested = true;
  try { preferences?.setItem(persistenceKey, '1'); } catch { /* Request still works. */ }
  requesting = (async () => {
    try { return await storage.persisted?.() || Boolean(await storage.persist()); }
    catch { return false; }
    finally { requesting = null; }
  })();
  return requesting;
}
export function mediaPaused(slug, kind, preferences = globalThis.localStorage) {
  try { return JSON.parse(preferences?.getItem(pauseKey + slug) || '{}')[kind] === true; } catch { return false; }
}
export function setMediaPaused(slug, kind, paused, preferences = globalThis.localStorage) {
  const value = { image: mediaPaused(slug, 'image', preferences), voice: mediaPaused(slug, 'voice', preferences), [kind]: Boolean(paused) };
  preferences.setItem(pauseKey + slug, JSON.stringify(value));
}
export const isMediaStorageEvent = key => typeof key === 'string' && key.startsWith(pauseKey);
export async function withMediaTask(task, locks = globalThis.navigator?.locks) {
  const run = async () => { localTasks++; try { return await task(); } finally { localTasks--; } };
  return locks ? locks.request(MEDIA_LOCK, { mode: 'shared' }, run) : run();
}
export async function withMediaMaintenance(task, locks = globalThis.navigator?.locks) {
  // Without Web Locks we cannot rule out another tab writing a paid result.
  if (!locks) throw new Error('이 브라우저는 탭 간 안전한 캐시 정리를 지원하지 않습니다. 최신 브라우저에서 이용해 주세요. 파일 백업은 사용할 수 있습니다.');
  return locks.request(MEDIA_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => {
    if (!lock || localTasks) throw new Error('이미지·음성을 준비하는 탭이 있습니다. 작업이 끝난 뒤 다시 시도해 주세요.');
    return task();
  });
}

const direct = /^(?:vn-(?:environment|place-anchor|portrait|event|drawn-shot|voice)-\d+|PUBLIC_(?:PHYSICAL_)?CAST_[A-Z_]*V\d+)$/u;
const wrapper = /^vn-(?:style|wardrobe|character-finish|face-redraw|story-expression|portrait-redraw|identity-revision|stage-frame|motion-mask)-[\w-]+$/u;
export function assetScope(key, depth = 0) {
  if (typeof key !== 'string' || depth > 12) return '';
  try {
    const row = JSON.parse(key);
    if (!Array.isArray(row)) return '';
    if (direct.test(row[0]) && typeof row[1] === 'string' && row[1].includes(':')) return row[1];
    return wrapper.test(row[0]) ? assetScope(row[1], depth + 1) : '';
  } catch { return ''; }
}
export const assetWork = row => assetScope(row?.key).split(':')[0];
export function assetKind(row) {
  if (/^data:audio\//u.test(row?.url || '')) return 'voice';
  if (/^data:image\//u.test(row?.url || row?.rejectedImageUrl || '') || row?.rejected) return 'image';
  return 'metadata';
}
export const recordBytes = row => new Blob([JSON.stringify(row)]).size;
const stores = { assets: ['dancheong-vn-assets-v1', 'assets', 'key'], costs: ['dancheong-vn-usage-v1', 'calls', 'id'] };
async function database(kind, indexedDB = globalThis.indexedDB) {
  const [name, table, keyPath] = stores[kind];
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let settled = false;
    const finish = (action, value) => { if (settled) return false; settled = true; clearTimeout(timer); action(value); return true; };
    const timer = setTimeout(() => finish(reject, new Error('저장소 연결 시간이 초과되었습니다.')), 6000);
    request.onupgradeneeded = () => request.result.createObjectStore(table, { keyPath });
    request.onsuccess = () => { if (!finish(resolve, request.result)) request.result.close(); };
    request.onerror = request.onblocked = () => finish(reject, request.error || new Error('다른 탭이 저장소를 사용 중입니다.'));
  });
}
export async function visitRecords(kind, visit, { write = false, indexedDB } = {}) {
  const db = await database(kind, indexedDB);
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(stores[kind][1], write ? 'readwrite' : 'readonly');
    const request = tx.objectStore(stores[kind][1]).openCursor();
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; try { visit(cursor.value, cursor); cursor.continue(); } catch (error) { tx.abort(); reject(error); } };
    tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('저장소 작업이 중단되었습니다.'));
  }); } finally { db.close(); }
}
export async function workAssets(scope) {
  const rows = []; await visitRecords('assets', row => { if (assetScope(row.key) === scope) rows.push(row); });
  const { withSavedCamera } = await import('./vn-camera-store.mjs');
  const enriched = []; for (const row of rows) enriched.push(await withSavedCamera(row)); return enriched;
}
export async function workCosts(slug) {
  const rows = []; await visitRecords('costs', row => { if (row.slug === slug) rows.push(row); }); return rows;
}
export async function mediaInventory() {
  const works = new Map();
  await visitRecords('assets', row => {
    const slug = assetWork(row), kind = assetKind(row); if (!slug || kind === 'metadata') return;
    if (!works.has(slug)) works.set(slug, { slug, image: { count: 0, bytes: 0 }, voice: { count: 0, bytes: 0 } });
    const group = works.get(slug)[kind]; group.count++; group.bytes += recordBytes(row);
  });
  return [...works.values()];
}
export async function removeWorkMedia(slug, kind) {
  if (!slug || !['image', 'voice'].includes(kind)) throw new Error('정리할 작품과 종류를 확인해 주세요.');
  let count = 0;
  await visitRecords('assets', (row, cursor) => { if (assetWork(row) === slug && assetKind(row) === kind) { cursor.delete(); count++; } }, { write: true });
  return count;
}
export async function mergeRecords(kind, rows) {
  if (!rows.length) return;
  const db = await database(kind), key = stores[kind][2];
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction(stores[kind][1], 'readwrite'), store = tx.objectStore(stores[kind][1]);
    // Add only: restoring a backup never overwrites newer assets or double-counts a receipt.
    for (const row of rows) { const request = store.get(row[key]); request.onsuccess = () => { if (!request.result) store.put(row); }; }
    tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('백업 미디어를 저장하지 못했습니다.'));
  }); } finally { db.close(); }
}
