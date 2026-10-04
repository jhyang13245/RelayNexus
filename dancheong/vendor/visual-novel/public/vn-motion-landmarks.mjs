// Lazy, local-only detector. A worker keeps model loading/inference off the reader.
import { createByteLru } from './vn-byte-lru.mjs';
let worker, sequence = 0, idle, unavailable = false;
const pending = new Map(), cache = createByteLru({ maxBytes: 8 * 1024 * 1024, maxEntries: 16 });
function stop(failed = false) {
  clearTimeout(idle); worker?.terminate(); worker = null; unavailable ||= failed;
  for (const row of pending.values()) { clearTimeout(row.timer); row.resolve(null); }
  pending.clear();
}
function scheduleIdle() { clearTimeout(idle); if (!pending.size) idle = setTimeout(() => stop(), 90000); }
function request(bitmap) {
  return new Promise(resolve => {
    try {
      if (unavailable || typeof Worker === 'undefined') { bitmap.close(); return resolve(null); }
      if (!worker) {
        worker = new Worker(new URL('./vn-motion-worker.mjs', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          const row = pending.get(data.id); if (!row) return;
          clearTimeout(row.timer); pending.delete(data.id); row.resolve(data.geometry || null); scheduleIdle();
        };
        worker.onerror = () => stop(true);
      }
      clearTimeout(idle);
      const id = ++sequence, timer = setTimeout(() => stop(true), 45000);
      pending.set(id, { resolve, timer }); worker.postMessage({ id, bitmap }, [bitmap]);
    } catch { bitmap.close(); stop(true); resolve(null); }
  });
}
export function detectMotionGeometry(url) {
  if (cache.has(url)) return cache.get(url);
  const result = (async () => {
    try {
      const image = new Image(); image.src = url; await image.decode();
      return await request(await createImageBitmap(image));
    } catch { return null; }
  })();
  cache.set(url, result, url.length * 2);
  return result;
}
