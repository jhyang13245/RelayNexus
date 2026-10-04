// Lazy, local-only detector. A worker keeps model loading/inference off the reader.
import { createByteLru } from './vn-byte-lru.mjs?v=a63fa2266034';
let worker, sequence = 0, idle, unavailable = false;
const pending = new Map(), cache = createByteLru({ maxBytes: 8 * 1024 * 1024, maxEntries: 16 });
function stop(failed = false) {
  clearTimeout(idle); worker?.terminate(); worker = null; unavailable ||= failed;
  for (const row of pending.values()) { clearTimeout(row.timer); row.resolve(null); }
  pending.clear();
}
function scheduleIdle() { clearTimeout(idle); if (!pending.size) idle = setTimeout(() => stop(), 90000); }
function request(bitmap, referenceBitmap = null, referenceCamera = null) {
  return new Promise(resolve => {
    try {
      if (unavailable || typeof Worker === 'undefined') { bitmap.close(); referenceBitmap?.close(); return resolve(null); }
      if (!worker) {
        worker = new Worker(new URL('./vn-motion-worker.mjs?v=a63fa2266034', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          const row = pending.get(data.id); if (!row) return;
          clearTimeout(row.timer); pending.delete(data.id); row.resolve({motion:data.geometry || null,camera:data.camera || null}); scheduleIdle();
        };
        worker.onerror = () => stop(true);
      }
      clearTimeout(idle);
      const id = ++sequence, timer = setTimeout(() => stop(true), 45000);
      pending.set(id, { resolve, timer }); worker.postMessage({ id, bitmap, referenceBitmap, referenceCamera }, [bitmap,...(referenceBitmap?[referenceBitmap]:[])]);
    } catch { bitmap.close(); referenceBitmap?.close(); stop(true); resolve(null); }
  });
}
function detectPortrait(url) {
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
export async function detectMotionGeometry(url) { return (await detectPortrait(url))?.motion || null; }
export async function detectCameraGeometry(url, referenceUrl = '') {
  if(referenceUrl && referenceUrl!==url){
    const key=referenceUrl+'|'+url;
    if(!cache.has(key))cache.set(key,(async()=>{try{
      const reference=await detectPortrait(referenceUrl);
      const image=new Image(),base=new Image();image.src=url;base.src=referenceUrl;
      await Promise.all([image.decode(),base.decode()]);
      // Send the reference with this request. An idle/restarted worker or its
      // bounded thumbnail cache must not lose the baseline while JS is warm.
      return await request(await createImageBitmap(image),await createImageBitmap(base),reference?.camera);
    }catch{return null;}})(),key.length*2);
    return (await cache.get(key))?.camera || null;
  }
  return (await detectPortrait(url))?.camera || null;
}
