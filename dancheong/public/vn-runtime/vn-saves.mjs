// Manual saves are independent of the engine's autosave and the usage ledger.
import { editionScope, snapshotEdition } from './vn-edition-key.mjs?v=ef485ae04925';
export const SLOT_COUNT = 10;
// Quick save (F5 / F9) has its own slot next to the ten numbered ones.
export const QUICK_SLOT = 11;
export const SLOT_SCHEMA = 'DANCHEONG_VN_SLOT_V1';
export const slotLabel = slot => slot === QUICK_SLOT ? '퀵 세이브' : `${slot}번 슬롯`;
const clone = value => structuredClone(value);
const slotNumber = slot => {
  if (!Number.isInteger(slot) || ((slot < 1 || slot > SLOT_COUNT) && slot !== QUICK_SLOT)) throw new Error('잘못된 저장 슬롯입니다.');
  return slot;
};
export function presentationKeys(slug, storyId, edition) {
  if (!slug || !storyId || typeof slug !== 'string' || typeof storyId !== 'string') throw new Error('작품 정보가 없습니다.');
  const scope = editionScope(slug, storyId, edition);
  return [`dancheong-vn-position-v1:${scope}`, `dancheong-vn-met-v1:${scope}`,
    `dancheong-vn-art-style-v1:${slug}`, `dancheong-vn-work-art-v1:${slug}`, `dancheong-vn-portrait-replacements-v1:${slug}`];
}
export function capturePresentation(storage, { slug, storyId, edition, bookmark, met, openingArt = '', actions = false }) {
  const keys = presentationKeys(slug, storyId, edition);
  const values = keys.map(key => storage.getItem(key));
  if (bookmark) values[0] = JSON.stringify(bookmark);
  if (met) values[1] = JSON.stringify(met);
  return { values, openingArt, actions: Boolean(actions) };
}
export function applyPresentation(storage, record) {
  const keys = presentationKeys(record.slug, record.storyId, snapshotEdition(record.snapshot));
  const values = record.presentation?.values;
  if (!Array.isArray(values) || values.length !== keys.length || values.some(value => value !== null && typeof value !== 'string')) throw new Error('화면 저장 정보가 손상되었습니다.');
  // Only these explicit work-specific keys can be restored. Never restore keys,
  // costs, device/model preferences, or arbitrary storage from a snapshot.
  keys.forEach((key, index) => values[index] === null ? storage.removeItem(key) : storage.setItem(key, values[index]));
  storage.setItem('dancheong-ln-active-work-v1', record.slug);
}
export function makeSlot({ slot, slug, title, snapshot, presentation, excerpt = '', scene = '', page = 0, pageCount = 0, thumbnail = '', now = new Date().toISOString() }) {
  const engine = clone(snapshot), storyId = engine?.scenario?.runtime?.storyId;
  if (!storyId || storyId === 'unconfigured' || !Array.isArray(engine.turns)) throw new Error('저장할 작품 진행이 없습니다.');
  if (engine.turns.some(turn => ['STREAMING', 'ADJUDICATION_PENDING'].includes(turn.status) || turn.imageStatus === 'GENERATING' || turn.metrics?.lifecycle?.stage === 'PERSISTING')) throw new Error('현재 비트의 본문과 판정이 완료된 뒤 저장해 주세요.');
  engine.settings = Object.fromEntries(['typingSpeed', 'literaryCapsule', 'imageQuality', 'styleGuide', 'fontSize'].filter(key => engine.settings?.[key] !== undefined).map(key => [key, engine.settings[key]]));
  delete engine.storageDiagnostics;
  const record = { schema: SLOT_SCHEMA, slot: slotNumber(slot), slug, storyId, title: String(title || '작품'), savedAt: now,
    excerpt: String(excerpt).slice(0, 180), scene: String(scene).slice(0, 100), page, pageCount,
    turnCount: engine.turns.length, thumbnail: /^data:image\/(jpeg|png|webp);base64,/u.test(thumbnail) ? thumbnail : '', snapshot: engine, presentation: clone(presentation) };
  validateSlot(record);
  return record;
}
export function validateSlot(record) {
  if (record?.schema !== SLOT_SCHEMA || record.storyId !== record.snapshot?.scenario?.runtime?.storyId || !Array.isArray(record.snapshot?.turns)) throw new Error('지원하지 않거나 손상된 저장 데이터입니다.');
  slotNumber(record.slot); presentationKeys(record.slug, record.storyId, snapshotEdition(record.snapshot));
  if (!Array.isArray(record.presentation?.values) || record.presentation.values.length !== 5 || record.presentation.values.some(value => value !== null && typeof value !== 'string')) throw new Error('화면 저장 정보가 손상되었습니다.');
  return record;
}
export function slotSummary(record) {
  const { snapshot, presentation, cacheBackup, costBackup, ...summary } = record;
  return summary;
}
// Imports assign a new media namespace. Compare narrative identity rather than
// that namespace when recovering an interrupted cross-storage activation.
export async function narrativeSignature(snapshot) {
  const world = snapshot?.scenario?.world || {};
  const text = JSON.stringify([snapshot?.scenario?.runtime?.storyId, [world.day, world.time, world.location], (snapshot?.turns || []).map(turn => [turn.id, turn.status, turn.text || '']), ...(snapshotEdition(snapshot) ? [snapshotEdition(snapshot)] : [])]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function withSlotLock(task) {
  if (!globalThis.navigator?.locks) return task();
  return navigator.locks.request('dancheong-vn-manual-slots', { ifAvailable: true }, lock => {
    if (!lock) throw new Error('다른 탭에서 저장·불러오기를 처리하고 있습니다. 잠시 후 다시 시도해 주세요.');
    return task();
  });
}
export function createSlotStore(indexedDB = globalThis.indexedDB) {
  async function open() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open('dancheong-vn-manual-slots-v1', 1);
      const finish = (fn, value) => { if (settled) return false; settled = true; clearTimeout(timer); fn(value); return true; };
      const timer = setTimeout(() => finish(reject, new Error('저장소를 여는 시간이 초과되었습니다.')), 6000);
      request.onupgradeneeded = () => {
        for (const name of ['slots', 'summaries', 'journal']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onsuccess = () => { if (!finish(resolve, request.result)) request.result.close(); };
      request.onerror = () => finish(reject, request.error);
      request.onblocked = () => finish(reject, new Error('다른 탭이 저장소를 사용 중입니다.'));
    });
  }
  async function transaction(stores, mode, action) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode); let value, failure;
        const timer = setTimeout(() => { failure = new Error('저장소 작업 시간이 초과되었습니다.'); tx.abort(); }, 15000);
        const fail = error => { failure = error; tx.abort(); };
        tx.oncomplete = () => { clearTimeout(timer); resolve(value); };
        tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(failure || tx.error || new Error('저장 작업이 취소되었습니다.')); };
        try { action(tx, next => { value = next; }, fail); } catch (error) { fail(error); }
      });
    } finally { db.close(); }
  }
  return {
    list: () => transaction(['summaries'], 'readonly', (tx, done) => { tx.objectStore('summaries').getAll().onsuccess = event => done(event.target.result); }),
    get: slot => transaction(['slots'], 'readonly', (tx, done) => { tx.objectStore('slots').get(slotNumber(slot)).onsuccess = event => done(event.target.result || null); }),
    put: (record, expectedRevision = '') => {
      validateSlot(record);
      return transaction(['slots', 'summaries'], 'readwrite', (tx, done, fail) => {
        const records = tx.objectStore('slots');
        records.get(record.slot).onsuccess = event => {
          if ((event.target.result?.revision || '') !== expectedRevision) return fail(new Error('다른 탭에서 이 슬롯을 변경했습니다. 목록을 다시 확인해 주세요.'));
          const next = { ...record, revision: crypto.randomUUID(), storageBytes: new Blob([JSON.stringify(record)]).size };
          records.put(next, next.slot); tx.objectStore('summaries').put(slotSummary(next), next.slot); done(next);
        };
      });
    },
    pending: () => transaction(['journal'], 'readonly', (tx, done) => { tx.objectStore('journal').get('load').onsuccess = event => done(event.target.result || null); }),
    beginLoad: record => transaction(['journal'], 'readwrite', tx => { tx.objectStore('journal').put(record, 'load'); }),
    endLoad: () => transaction(['journal'], 'readwrite', tx => { tx.objectStore('journal').delete('load'); }),
  };
}
// The durable intent lets boot finish presentation activation after a tab closes
// between the engine's atomic import and the separate VN/continue stores.
export async function activateSlot({ record, store, api, apply, remember }) {
  validateSlot(record);
  const intent = { record, signature: await narrativeSignature(record.snapshot) };
  await store.beginLoad(intent);
  try { await api._importFull(clone(record.snapshot)); }
  catch (error) { await store.endLoad(); throw error; }
  await apply(record);
  await remember(record);
  await store.endLoad();
}
export async function recoverSlotLoad({ store, api, apply, remember }) {
  const pending = await store.pending();
  if (!pending) return false;
  validateSlot(pending.record);
  if (await narrativeSignature(api._export()) === pending.signature) {
    await apply(pending.record); await remember(pending.record);
  }
  await store.endLoad();
  return true;
}
