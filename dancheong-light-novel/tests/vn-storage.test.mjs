import test from 'node:test';
import assert from 'node:assert/strict';
import { assetScope, assetWork, assetKind, storageStatus, requestDurableStorage, withMediaMaintenance, withMediaTask, formatBytes, setMediaPaused, mediaPaused } from '../public/vn-storage.mjs';
import { makeSlot, slotSummary } from '../public/vn-saves.mjs';
import { makeBackup, readBackup, validateBackup, storeImportedSlot, BACKUP_SCHEMA, MAX_BACKUP_BYTES } from '../public/vn-backup.mjs';
import { createVoice, VOICE_CACHE_LIMIT } from '../public/vn-voice.mjs';

const key = (kind, scope = 'book:story', tail = '') => JSON.stringify([`vn-${kind}-1`, scope, tail]);
const fixture = () => makeSlot({ slot: 1, slug: 'book', title: '테스트', snapshot: { scenario: { runtime: { storyId: 'story' }, world: {} }, turns: [{ id: 't', status: 'COMMITTED', text: '본문' }], settings: { apiKey: 'never-export' }, media: { schema: 'CORTEX_MEDIA_BACKUP_V1', generated: [], packageAssets: [] } }, presentation: { values: [null, '[]', null, null, null], openingArt: '', actions: false } });
const assets = () => [{ key: key('portrait'), url: 'data:image/png;base64,eA==' }, { key: key('voice'), url: 'data:audio/mpeg;base64,eA==' }];

test('new TTS formats and Typecast credits survive a backup round trip', async () => {
  const record = fixture();
  for (const mime of ['wav', 'mp3', 'ogg', 'opus', 'webm', 'aac', 'mp4']) {
    const media = [{ key: key('voice'), url: `data:audio/${mime};base64,eA==` }];
    const ledger = [{ id: 'tc-voice', at: Date.now(), slug: record.slug, provider: 'typecast', model: 'ssfm-v30', cost: { kind: 'credits', usd: null } }];
    const result = await readBackup(await makeBackup(record, { assets: media, costs: ledger }));
    assert.deepEqual(result.assets, media); assert.deepEqual(result.costs, ledger);
  }
});
const costs = () => [{ id: 'receipt', slug: 'book', at: 10, usage: { input_tokens: 20 }, cost: { usd: .03, kind: 'exact' }, authorization: 'never-export' }];

test('nested media scope comes from schema positions, never names/passages from another work', () => {
  let nested = key('portrait', 'book:story:revision', 'someone');
  for (const wrapper of ['vn-stage-frame-2', 'vn-wardrobe-1', 'vn-style-1', 'vn-identity-revision-1', 'vn-motion-mask-1']) nested = JSON.stringify([wrapper, nested, 'other:story']);
  assert.equal(assetScope(nested), 'book:story:revision');
  assert.equal(assetWork({ key: nested }), 'book');
  assert.equal(assetScope(key('portrait', 'other:story', 'book:story')), 'other:story');
  assert.equal(assetScope(JSON.stringify(['PUBLIC_PHYSICAL_CAST_TIMELINE_V7', 'book:story', 'text'])), 'book:story');
  assert.equal(assetScope(JSON.stringify(['arbitrary', 'book:story'])), '');
  assert.equal(assetKind(assets()[0]), 'image'); assert.equal(assetKind(assets()[1]), 'voice');
  assert.equal(assetKind({ key: nested }), 'metadata');
});
test('storage protection handles denied, unsupported, failed and approved browsers without breaking save', async () => {
  assert.equal((await storageStatus({})).supported, false);
  assert.equal(formatBytes(undefined), '확인 불가');
  assert.equal(await requestDurableStorage({ manual: true, storage: {}, preferences: null }), false);
  assert.equal(await requestDurableStorage({ manual: true, storage: { persist: async () => { throw Error('denied'); } }, preferences: null }), false);
  let calls = 0;
  const storage = { persisted: async () => false, persist: async () => { calls++; return true; } };
  assert.equal(await requestDurableStorage({ manual: true, storage, preferences: null }), true);
  assert.equal(calls, 1);
  assert.deepEqual(await storageStatus({ estimate: async () => ({ usage: 1, quota: 2 }), persisted: async () => true, persist() {} }), { usage: 1, quota: 2, persistent: true, supported: true });
});
test('cleanup refuses a busy or unsupported lock; pauses are work- and kind-specific', async () => {
  let deleted = false;
  await assert.rejects(withMediaMaintenance(() => { deleted = true; }, { request: async (name, options, callback) => { assert.equal(options.mode, 'exclusive'); assert.equal(options.ifAvailable, true); return callback(null); } }), /준비/);
  await assert.rejects(withMediaMaintenance(() => {}, null), /지원/); assert.equal(deleted, false);
  await withMediaTask(async () => { await assert.rejects(withMediaMaintenance(() => {}, { request: async (name, options, callback) => callback({}) }), /준비/); }, null);
  const map = new Map(), preferences = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  setMediaPaused('book', 'image', true, preferences);
  assert.equal(mediaPaused('book', 'image', preferences), true);
  assert.equal(mediaPaused('book', 'voice', preferences), false); assert.equal(mediaPaused('book-2', 'image', preferences), false);
  setMediaPaused('book', 'image', false, preferences); assert.equal(mediaPaused('book', 'image', preferences), false);
});
test('file backup round-trips full slot, artwork, voice and costs with gzip; keys excluded', async () => {
  const record = fixture(); record.savedAt = '2026-08-01T00:00:00.000Z';
  const blob = await makeBackup(record, { assets: assets(), costs: costs() });
  assert.doesNotMatch(await blob.text(), /never-export/u);
  const zipped = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  for (const file of [blob, zipped]) {
    const backup = await readBackup(file);
    assert.equal(backup.record.savedAt, record.savedAt);
    assert.equal(backup.record.snapshot.turns[0].text, '본문'); assert.deepEqual(backup.assets, assets());
    assert.equal(backup.costs.length, 1); assert.equal(backup.costs[0].authorization, undefined);
    let saved;
    await storeImportedSlot({ backup, slot: 10, revision: 'previous', store: { put: async (row, expected) => { assert.equal(expected, 'previous'); saved = row; } } });
    assert.equal(saved.slot, 10); assert.deepEqual(saved.cacheBackup, assets());
    assert.equal(slotSummary(saved).cacheBackup, undefined); assert.equal(slotSummary(saved).costBackup, undefined);
    // A second export keeps imported paid media even when the live cache is gone.
    const exported = await readBackup(await makeBackup(saved)); assert.deepEqual(exported.assets, assets());
  }
});
test('damaged, future-format, cross-work, unsafe URL and oversize imports reject before writes', async () => {
  const blob = await makeBackup(fixture(), { assets: assets() });
  const envelope = JSON.parse(await blob.text()); envelope.payload.record.title = 'tamper';
  await assert.rejects(readBackup(new Blob([JSON.stringify(envelope)])), /손상/);
  await assert.rejects(readBackup(new Blob(['not json'])), /읽지/);
  await assert.rejects(readBackup({ size: MAX_BACKUP_BYTES + 2048 }), /너무 큰/);
  assert.throws(() => validateBackup({ schema: 'future', record: fixture(), assets: [], costs: [] }), /아닙니다/);
  const payload = { schema: BACKUP_SCHEMA, record: fixture(), assets: [{ ...assets()[0], key: key('portrait', 'other:story') }], costs: [] };
  assert.throws(() => validateBackup(payload), /작품/);
  payload.assets = [{ ...assets()[0], url: 'https://private.example/image' }]; assert.throws(() => validateBackup(payload), /미디어/);
  const previous = fixture(); let current = previous;
  await assert.rejects(storeImportedSlot({ backup: await readBackup(blob), slot: 1, revision: '', store: { put: async () => { throw Error('quota'); } } }), /quota/);
  assert.equal(current, previous);
});
test('48-entry voice memory LRU evicts oldest while replaying paid disk cache without another request', async () => {
  const disk = new Map(); let reads = 0, requests = 0, played = 0;
  const voice = createVoice({ getEnabled: () => true, getKey: () => 'test', read: async key => { reads++; return disk.get(key); }, write: async row => disk.set(row.key, row), fetchVoice: async () => { requests++; return Response.json({ audioUrl: 'data:audio/mpeg;base64,eA==' }); }, makeAudio: () => ({ play: async () => { played++; }, pause() {}, currentTime: 0 }) });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const line = i => ({ key: `voice-${i}`, playbackKey: `p-${i}`, voice: 'marin', text: `line ${i}` });
  for (let i = 0; i < VOICE_CACHE_LIMIT; i++) { voice.replay(line(i)); await tick(); }
  voice.replay(line(0)); await tick(); const before = reads;
  voice.replay(line(48)); await tick(); assert.equal(reads, before + 1);
  voice.replay(line(0)); await tick(); assert.equal(reads, before + 1); // touch promoted it
  voice.replay(line(1)); await tick(); assert.equal(reads, before + 2); assert.equal(requests, 49);
  voice.clearMemory(); voice.replay(line(0)); await tick(); assert.equal(reads, before + 3); assert.equal(requests, 49); assert.ok(played > 49);
});
