import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSlot, validateSlot, slotSummary, capturePresentation, applyPresentation, presentationKeys, activateSlot, recoverSlotLoad, narrativeSignature } from '../public/vn-saves.mjs';
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
const snapshot = () => ({ schema: 'ENGINE', scenario: { runtime: { storyId: 'story-a' }, world: { location: '교실', day: 1 } }, turns: [{ id: 't1', status: 'COMMITTED', text: '안녕.' }], settings: { apiKey: 'do-not-copy', baseUrl: 'private-url', model: 'device-model', typingSpeed: 'slow' }, media: { generated: [{ key: 'image', dataUrl: 'data:image/png;base64,eA==' }] }, undoLedger: [{ id: 'undo' }], canonicalSession: { marker: 'canonical' } });
function fixture(slot = 1) {
  const storage = memory();
  storage.setItem('dancheong-vn-art-style-v1:work-a', '수채화');
  const presentation = capturePresentation(storage, { slug: 'work-a', storyId: 'story-a', bookmark: { cursor: 't1:0', read: 't1:0' }, met: [{ id: 'person', baseKey: 'image' }], actions: true });
  return makeSlot({ slot, slug: 'work-a', title: '테스트 작품', snapshot: snapshot(), presentation });
}
test('manual slots retain complete independent narrative/media/undo state but exclude device credentials', () => {
  const raw = snapshot(), record = fixture();
  assert.deepEqual(record.snapshot.settings, { typingSpeed: 'slow' });
  for (const field of ['canonicalSession', 'media', 'undoLedger', 'scenario', 'turns']) assert.deepEqual(record.snapshot[field], raw[field]);
  record.snapshot.turns[0].text = 'changed'; assert.equal(raw.turns[0].text, '안녕.');
  assert.equal(slotSummary(record).snapshot, undefined); assert.equal(slotSummary(record).presentation, undefined);
});
test('all ten slots accepted; invalid or in-flight snapshots rejected', () => {
  for (let slot = 1; slot <= 10; slot++) assert.equal(fixture(slot).slot, slot);
  for (const slot of [0, 11, 1.5, '1']) assert.throws(() => fixture(slot));
  const record = fixture(); record.snapshot.turns[0].status = 'STREAMING';
  assert.throws(() => makeSlot({ ...record, snapshot: record.snapshot }), /완료/);
  record.schema = 'FUTURE'; assert.throws(() => validateSlot(record), /지원/);
});
test('restore only the saved work presentation, never costs, keys, other works or global preferences', () => {
  const storage = memory(); const preserved = ['api-key', 'dancheong-vn-costs-v1', 'dancheong-vn-reading-prefs-v1', 'dancheong-vn-art-style-v1:work-b'];
  preserved.forEach(key => storage.setItem(key, 'preserved'));
  storage.setItem('dancheong-vn-portrait-replacements-v1:work-a', 'future replacement');
  const record = fixture(); applyPresentation(storage, record);
  preserved.forEach(key => assert.equal(storage.getItem(key), 'preserved'));
  assert.equal(storage.getItem('dancheong-vn-portrait-replacements-v1:work-a'), null);
  assert.equal(storage.getItem('dancheong-vn-art-style-v1:work-a'), '수채화');
  assert.deepEqual(JSON.parse(storage.getItem(presentationKeys('work-a', 'story-a')[0])), { cursor: 't1:0', read: 't1:0' });
  assert.equal(storage.getItem('dancheong-ln-active-work-v1'), 'work-a');
});
function loader() {
  let current = snapshot(), journal = null, applied = 0, remembered = 0;
  current.turns[0].id = 'later-turn';
  const api = { _importFull: async next => { current = next; }, _export: () => current };
  const store = { beginLoad: async value => { journal = value; }, pending: async () => journal, endLoad: async () => { journal = null; } };
  return { api, store, record: fixture(), apply: async () => { applied++; }, remember: async () => { remembered++; }, get counts() { return [applied, remembered]; } };
}
test('successful load restores once and clears the activation journal', async () => {
  const x = loader(); await activateSlot(x);
  assert.equal(x.api._export().turns[0].id, 't1'); assert.deepEqual(x.counts, [1, 1]); assert.equal(await x.store.pending(), null);
});
test('rejected engine import leaves current narrative intact and never applies presentation', async () => {
  const x = loader(); x.api._importFull = async () => { throw new Error('disk full'); };
  await assert.rejects(activateSlot(x), /disk full/);
  assert.equal(x.api._export().turns[0].id, 'later-turn'); assert.deepEqual(x.counts, [0, 0]); assert.equal(await x.store.pending(), null);
});
test('interrupted post-import activation recovers presentation and continue state on next boot', async () => {
  const x = loader(); await assert.rejects(activateSlot({ ...x, apply: async () => { throw new Error('quota'); } }), /quota/);
  assert.ok(await x.store.pending());
  await recoverSlotLoad(x); assert.deepEqual(x.counts, [1, 1]); assert.equal(await x.store.pending(), null);
  assert.equal(await recoverSlotLoad(x), false);
});
test('a crash before engine import never applies the target work over the old work', async () => {
  const x = loader(); await x.store.beginLoad({ record: x.record, signature: await narrativeSignature(x.record.snapshot) });
  await recoverSlotLoad(x); assert.deepEqual(x.counts, [0, 0]); assert.equal(await x.store.pending(), null);
});
test('media namespace changes do not break recovery identity', async () => {
  const a = snapshot(), b = snapshot(); a.scenario.runtime.mediaGeneration = 'old'; b.scenario.runtime.mediaGeneration = 'new';
  assert.equal(await narrativeSignature(a), await narrativeSignature(b));
  b.turns[0].text = '다른 분기'; assert.notEqual(await narrativeSignature(a), await narrativeSignature(b));
});
