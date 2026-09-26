import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { revisionDescriptor, verifiedPackage, stampEdition } from '../public/vn-editions.mjs';
import { editionId, editionScope, snapshotScope } from '../public/vn-edition-key.mjs';
import { prepareNewGame } from '../public/vn-new-game.mjs';
import { applyPresentation, capturePresentation, makeSlot, narrativeSignature, activateSlot, recoverSlotLoad, presentationKeys } from '../public/vn-saves.mjs';
import { makeBackup, readBackup } from '../public/vn-backup.mjs';
import { workPortrait } from '../public/vn-character-art.mjs';

const bytes = new TextEncoder().encode('validated package fixture');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const revision = { revision: 3, sha256, bytes: bytes.length };
const edition = { schema: 'DANCHEONG_VN_EDITION_V1', slug: 'work', revision: 3, sha256 };
const candidate = () => ({ scenario: { title: '작품', runtime: { storyId: 'same-story' }, world: { location: '교실' } }, canonicalSession: { state: { cortexRuntimeExtra: { retained: true } } }, mediaAssets: [] });
const storage = () => { const values = new Map(); return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };
function slot(which = edition) {
  const snapshot = { ...stampEdition(candidate(), 'work', which), turns: [{ id: 'turn-1', status: 'COMMITTED', text: '보존할 본문' }] };
  return makeSlot({ slot: 4, slug: 'work', title: '작품', snapshot, presentation: capturePresentation(storage(), { slug: 'work', storyId: 'same-story', edition: which, bookmark: { index: 8 }, met: [{ id: 'person' }] }) });
}

test('revision downloads use immutable paths and reject a mismatched file before parsing or activation', async () => {
  let inspected = 0; const memory = storage(); memory.setItem('existing', 'progress');
  const file = await verifiedPackage('work', revision, async url => { assert.equal(url, '/api/work/work/download?revision=3'); return new Response(bytes); });
  assert.equal(file.size, bytes.length);
  await assert.rejects(prepareNewGame({ slug: 'work', revision, storage: memory, api: { inspectNexusPackage() { inspected++; } }, fetchPackage: async () => new Response('wrong revision') }), /일치하지/);
  assert.equal(inspected, 0); assert.deepEqual([...memory.values], [['existing', 'progress']]);
  await assert.rejects(verifiedPackage('work', { ...revision, bytes: bytes.length + 1 }, async () => new Response(bytes)), /일치하지/);
});

test('catalog revisions need both the exact revision number and SHA, and unknown legacy saves remain legacy', () => {
  assert.equal(revisionDescriptor({ currentRevision: 3, packageSha256: sha256 }).revision, 3);
  assert.throws(() => revisionDescriptor({ currentRevision: 3 }), /확인하지/);
  assert.throws(() => editionId({ ...edition, slug: 'other' }, 'work'), /올바르지/);
  assert.equal(editionId(null, 'work'), 'legacy');
  assert.equal(editionScope('work', 'same-story'), 'work:same-story');
});

test('edition metadata is stamped on both runtime and canonical source without changing the inspected candidate', () => {
  const original = candidate(), stamped = stampEdition(original, 'work', revision);
  assert.deepEqual(stamped.scenario.runtime.vnEdition, edition);
  assert.deepEqual(stamped.canonicalSession.state.cortexRuntimeExtra.vnEdition, edition);
  assert.equal(stamped.canonicalSession.state.cortexRuntimeExtra.retained, true);
  assert.equal(original.scenario.runtime.vnEdition, undefined);
  assert.equal(original.canonicalSession.state.cortexRuntimeExtra.vnEdition, undefined);
});

test('same story ID in different editions cannot overwrite bookmarks, met characters or reuse locked art', () => {
  const other = { ...edition, revision: 2, sha256: 'b'.repeat(64) }, memory = storage();
  const a = slot(), b = slot(other); b.presentation.values[0] = '{"index":2}';
  applyPresentation(memory, a); applyPresentation(memory, b);
  assert.equal(memory.getItem(presentationKeys('work', 'same-story', edition)[0]), '{"index":8}');
  assert.equal(memory.getItem(presentationKeys('work', 'same-story', other)[0]), '{"index":2}');
  const key = JSON.stringify(['vn-portrait-1', snapshotScope('work', a.snapshot), 'person', 'neutral']);
  assert.equal(workPortrait(key, snapshotScope('work', a.snapshot), 'person'), true);
  assert.equal(workPortrait(key, snapshotScope('work', b.snapshot), 'person'), false);
  assert.equal(workPortrait(key, 'work:same-story', 'person'), false);
});

test('edition file backup round-trips progress, metadata and only that edition’s paid assets', async () => {
  const record = slot(), scope = snapshotScope('work', record.snapshot);
  const asset = { key: JSON.stringify(['vn-portrait-1', scope, 'person', 'neutral']), url: 'data:image/png;base64,eA==' };
  const recovered = await readBackup(await makeBackup(record, { assets: [asset] }));
  assert.deepEqual(recovered.record.snapshot, record.snapshot);
  assert.deepEqual(recovered.record.presentation, record.presentation);
  assert.deepEqual(recovered.assets, [asset]);
  await assert.rejects(makeBackup(record, { assets: [{ ...asset, key: JSON.stringify(['vn-portrait-1', 'work:same-story', 'person', 'neutral']) }] }), /작품 정보/);
});

test('interrupted edition activation is recovered only when the imported edition actually committed', async () => {
  const record = slot(); let journal = null, imported = null, remembered = null;
  const store = { beginLoad: async v => { journal = v; }, pending: async () => journal, endLoad: async () => { journal = null; } };
  const api = { _importFull: async v => { imported = v; }, _export: () => imported };
  await assert.rejects(activateSlot({ record, store, api, apply: () => { throw new Error('quota'); }, remember() {} }), /quota/);
  assert.ok(journal);
  await recoverSlotLoad({ store, api, apply() {}, remember: v => { remembered = v; } });
  assert.equal(remembered.snapshot.scenario.runtime.vnEdition.revision, 3); assert.equal(journal, null);
  const other = structuredClone(record.snapshot); other.scenario.runtime.vnEdition.revision = 2;
  assert.notEqual(await narrativeSignature(other), await narrativeSignature(record.snapshot));
  journal = { record, signature: await narrativeSignature(record.snapshot) }; imported = other;
  await recoverSlotLoad({ store, api, apply: () => assert.fail('must not mix editions'), remember: () => assert.fail('must not mix editions') });
  assert.equal(journal, null);
});
