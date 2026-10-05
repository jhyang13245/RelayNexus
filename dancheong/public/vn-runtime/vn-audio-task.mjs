let worker, unavailable = false, sequence = 0;
const pending = new Map();
function disable() {
  unavailable = true; worker?.terminate(); worker = null;
  for (const job of pending.values()) { clearTimeout(job.timer); job.resolve(null); }
  pending.clear();
}
export function analyzeInWorker(buffer, bpmHint) {
  if (unavailable || typeof Worker === 'undefined') return Promise.resolve(null);
  try {
    if (!worker) {
      worker = new Worker(new URL('./vn-audio-worker.mjs?v=ef485ae04925', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { const job = pending.get(data.id); if (!job) return; clearTimeout(job.timer); pending.delete(data.id); job.resolve(data.result); };
      worker.onerror = disable; worker.onmessageerror = disable;
    }
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
    return new Promise(resolve => {
      const id = ++sequence;
      pending.set(id, { resolve, timer: setTimeout(disable, 60000) });
      try { worker.postMessage({ id, channels, sampleRate: buffer.sampleRate, bpmHint }, channels.map(row => row.buffer)); }
      catch { disable(); }
    });
  } catch { disable(); return Promise.resolve(null); }
}
