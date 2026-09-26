import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as Thread } from 'node:worker_threads';
import { analyzeMusicData } from '../public/vn-audio-analysis.mjs';

test('audio analysis runs in the actual worker module without detaching playback samples', async t => {
  const previous = globalThis.Worker, threads = [];
  const source = new URL('../public/vn-audio-worker.mjs', import.meta.url).href;
  globalThis.Worker = class {
    constructor() {
      this.thread = new Thread(`const {parentPort} = require('node:worker_threads'); globalThis.self = {postMessage: v => parentPort.postMessage(v)}; import(${JSON.stringify(source)}).then(() => { parentPort.on('message', data => self.onmessage({data})); parentPort.postMessage({ready:true}); });`, { eval: true });
      threads.push(this.thread); this.queue = [];
      this.thread.on('message', data => { if (data.ready) { this.ready = true; for (const [value, transfers] of this.queue) this.thread.postMessage(value, transfers); this.queue = []; } else this.onmessage?.({data}); });
      this.thread.on('error', error => this.onerror?.(error));
    }
    postMessage(value, transfers) { if (this.ready) this.thread.postMessage(value, transfers); else this.queue.push([value, transfers]); }
    terminate() { return this.thread.terminate(); }
  };
  t.after(async () => { globalThis.Worker = previous; await Promise.all(threads.map(w => w.terminate())); });
  const { analyzeInWorker } = await import('../public/vn-audio-task.mjs');
  const data = Float32Array.from({ length: 8000 * 4 }, (_, i) => .15 * Math.sin(i * 2 * Math.PI * 440 / 8000));
  const buffer = { numberOfChannels: 1, sampleRate: 8000, getChannelData: () => data };
  const expected = analyzeMusicData([data], 8000);
  const result = await analyzeInWorker(buffer, 0);
  assert.deepEqual(result, expected); assert.equal(threads.length, 1);
  assert.equal(data.length, 32000); assert.ok(data[1] > 0, 'playback data must still be available');
});
