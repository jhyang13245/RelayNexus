// Keep full-resolution alpha/face scans and PNG encoding off the reader thread.
// Unsupported browsers and failed worker startup fall back to the same canvas
// implementation; no image model, resolution or cache identity is changed.
let worker = null, unavailable = false, sequence = 0;
const pending = new Map();
function disable() {
  unavailable = true; worker?.terminate(); worker = null;
  for (const task of pending.values()) { clearTimeout(task.timer); task.resolve(null); }
  pending.clear();
}
export function rasterTask(payload) {
  if (unavailable || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return Promise.resolve(null);
  try {
    if (!worker) {
      worker = new Worker(new URL('./vn-raster-worker.mjs?v=a63fa2266034', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const task = pending.get(data.id); if (!task) return;
        clearTimeout(task.timer); pending.delete(data.id); task.resolve(data.report || data.url || null);
      };
      worker.onerror = disable; worker.onmessageerror = disable;
    }
    return new Promise(resolve => {
      const id = ++sequence;
      pending.set(id, { resolve, timer: setTimeout(disable, 30000) });
      try { worker.postMessage({ ...payload, id }); } catch { disable(); }
    });
  } catch { disable(); return Promise.resolve(null); }
}
