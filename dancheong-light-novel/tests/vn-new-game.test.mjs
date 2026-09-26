import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNewGame } from '../public/vn-new-game.mjs';
import { activateSlot, recoverSlotLoad, applyPresentation, presentationKeys } from '../public/vn-saves.mjs';

function fixture() {
  const map = new Map(), storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const keys = presentationKeys('work', 'story');
  keys.forEach((key, i) => storage.setItem(key, ['old-bookmark', '[{"id":"future-person"}]', 'watercolour', '{"locks":{}}', '{}'][i]));
  storage.setItem('device-key', 'preserve'); storage.setItem('costs', 'preserve');
  const canonicalSession = { initial: true }, scenario = { title: '작품', runtime: { storyId: 'story' }, world: { day: 1, time: '09:00', location: '교실' } };
  const mediaAssets = [{ key: 'story:reference', dataUrl: 'data:image/png;base64,eA==' }];
  let inspected = 0;
  const api = { inspectNexusPackage: async file => { assert.equal(file.name, 'work.zip'); inspected++; return { canonicalSession, scenario, mediaAssets }; } };
  return { slug: 'work', title: '작품', storage, api, map, keys, canonicalSession, scenario, mediaAssets, fetchPackage: async () => new Response('zip fixture'), get inspected() { return inspected; } };
}

test('new game starts from the validated package, resets reading/met progress, and preserves art settings', async () => {
  const x = fixture(), before = [...x.map];
  const record = await prepareNewGame(x);
  assert.deepEqual([...x.map], before, 'preparation must not modify the active game');
  assert.deepEqual(record.snapshot.scenario, x.scenario); assert.deepEqual(record.snapshot.canonicalSession, x.canonicalSession);
  for (const key of ['turns', 'undoLedger', 'recoveryJournal']) assert.deepEqual(record.snapshot[key], []);
  assert.equal(record.snapshot.pendingRecovery, null); assert.deepEqual(record.snapshot.media.packageAssets, x.mediaAssets);
  assert.deepEqual(record.snapshot.media.generated, []); assert.deepEqual(record.snapshot.settings, {});
  assert.deepEqual(record.presentation.values, [null, '[]', 'watercolour', '{"locks":{}}', '{}']);
  assert.equal(record.presentation.openingArt, ''); assert.equal(record.presentation.actions, false);
});

test('failed download or package validation cannot change the active progress', async () => {
  const x = fixture(), before = [...x.map];
  await assert.rejects(prepareNewGame({ ...x, fetchPackage: async () => new Response('', { status: 503 }) }), /503/);
  assert.equal(x.inspected, 0);
  await assert.rejects(prepareNewGame({ ...x, api: { inspectNexusPackage: async () => { throw new Error('invalid package'); } } }), /invalid package/);
  assert.deepEqual([...x.map], before);
});

test('new game activation and interrupted recovery never write numbered slots or device preferences', async () => {
  const x = fixture(), record = await prepareNewGame(x); let current = null, journal = null, remembered = null;
  const slots = new Map(Array.from({ length: 10 }, (_, n) => [n + 1, `saved-${n + 1}`]));
  const store = { put: () => assert.fail('must not overwrite any numbered slot'), beginLoad: async value => { journal = value; }, pending: async () => journal, endLoad: async () => { journal = null; } };
  const api = { _importFull: async value => { current = value; }, _export: () => current };
  const apply = value => applyPresentation(x.storage, value), remember = async value => { remembered = value; };
  await assert.rejects(activateSlot({ record, store, api, apply: () => { throw new Error('quota'); }, remember }), /quota/);
  assert.ok(journal); await recoverSlotLoad({ store, api, apply, remember });
  assert.equal(journal, null); assert.equal(remembered.slug, 'work'); assert.equal(current.turns.length, 0);
  assert.equal(x.storage.getItem(x.keys[0]), null); assert.equal(x.storage.getItem(x.keys[1]), '[]');
  assert.equal(x.storage.getItem('device-key'), 'preserve'); assert.equal(x.storage.getItem('costs'), 'preserve');
  assert.equal(slots.size, 10); assert.equal(slots.get(1), 'saved-1'); assert.equal(slots.get(10), 'saved-10');
});
