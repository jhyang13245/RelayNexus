// Geometry is keyed by the exact source bytes, never by a person's name.
// A changed expression gets its own measurement; aligned animation uses the base.
import { createByteLru } from './vn-byte-lru.mjs?v=ef485ae04925';
export const CAMERA_VERSION = "stage-camera-main-body-b9cc189e8530";
const memory = createByteLru({ maxBytes: 8 * 1024 * 1024, maxEntries: 48 });
const ids = createByteLru({ maxBytes: 8 * 1024 * 1024, maxEntries: 24 });
export async function cameraIdentity(url) {
  let task = ids.get(url);
  if (!task) { task = crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)).then(bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('')); ids.set(url, task, url.length * 2); }
  return task;
}
export function validCamera(row, hash) {
  const b = row?.bounds, f = row?.frame;
  return row?.version === CAMERA_VERSION && row.hash === hash && Number.isInteger(row.width) && Number.isInteger(row.height) && row.width > 0 && row.height > 0 && row.width * row.height <= 16e6
    && b && ['left','top','right','bottom','width','height','transparentFraction'].every(k => Number.isFinite(b[k]))
    && b.left >= 0 && b.top >= 0 && b.right < row.width && b.bottom < row.height && b.width > 0 && b.height > 0
    && f && ['outWidth','outHeight','x','y'].every(k => Number.isFinite(f[k])) && f.outWidth > 0 && f.outHeight > 0 && f.outWidth * f.outHeight <= 24e6 && f.y >= 0;
}
async function dbTask(mode, callback) {
  if (!globalThis.indexedDB) return null;
  return new Promise(resolve => {
    let db, done = false; const finish = value => { if (done) return; done = true; clearTimeout(timer); db?.close(); resolve(value); };
    const timer = setTimeout(() => finish(null), 2000), request = indexedDB.open('dancheong-vn-camera-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('frames', { keyPath: 'hash' });
    request.onerror = request.onblocked = () => finish(null);
    request.onsuccess = () => { db = request.result; if (done) { db.close(); return; } const tx = db.transaction('frames', mode); let result; const op = callback(tx.objectStore('frames')); op.onsuccess = () => { result = op.result; }; tx.oncomplete = () => finish(result); tx.onerror = tx.onabort = () => finish(null); };
  });
}
export async function savedCamera(url, supplied) {
  const hash = await cameraIdentity(url);
  if (validCamera(supplied, hash)) { memory.set(hash, supplied, 2048); void dbTask('readwrite', store => store.put(supplied)); return supplied; }
  const row = memory.get(hash) || await dbTask('readonly', store => store.get(hash));
  if (!validCamera(row, hash)) return null;
  memory.set(hash, row, 2048); return row;
}
export async function saveCamera(url, row) {
  row = { ...row, version: CAMERA_VERSION, hash: await cameraIdentity(url) };
  if (!validCamera(row, row.hash)) return null;
  memory.set(row.hash, row, 2048); await dbTask('readwrite', store => store.put(row)); return row;
}
export async function withSavedCamera(record) {
  if (!/^data:image\//u.test(record?.url || '')) return record;
  const camera = await savedCamera(record.url, record.camera);
  return camera ? { ...record, camera } : record;
}
export const clearCameraMemory = () => { memory.clear(); ids.clear(); };
