import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureScene, portraitKey } from '../public/vn-scene.mjs';
import { portraitPrompt, workPortrait, readPortraitReplacement, writePortraitReplacement } from '../public/vn-character-art.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';

const html = readFileSync(new URL('../vendor/Cortex_v1.42.0.html', import.meta.url), 'utf8');
const marker = html.indexOf('/* Cortex v1.38.0 — compact rewind journal');
const context = { structuredClone };
runInNewContext(html.slice(html.lastIndexOf('<script>', marker) + 8, html.indexOf('</script>', marker)), context);
const experience = context.CortexTurnExperience;
const rows = [
  { id: 'younger', name: '동생', publicProfile: '주인공의 동생.', source: { appearance: '16세 남자 중학생, 안경 착용, 생활감 있는 인상.', hiddenInfo: 'PRIVATE_SECRET' } },
  { id: 'friend', name: '친구', publicProfile: '주인공의 친구.', source: { appearance: '짧은 머리와 교복, 친근한 인상.' } },
  { id: 'quiet', name: '반장', publicProfile: '주인공의 친구.', source: { appearance: '단정한 머리와 안경, 차분한 교복 차림.' } },
];
function captured(people = rows) {
  const scenario = { protagonist: { id: 'hero', name: '주인공' }, characters: people, runtime: {}, scene: {}, world: { location: '교실' } };
  return captureScene({ scope: 'test-work:save', scenario, turn: { id: 't1', status: 'COMMITTED', text: '세 사람이 들어왔다.' }, experience, timeline: true });
}
test('author appearance survives public projection separately from biography and enters each portrait prompt', () => {
  const sc = captured();
  for (const person of sc.candidates) {
    assert.equal(person.publicAppearance, rows.find(row => row.id === person.id).source.appearance);
    const prompt = portraitPrompt({ person, art: '', peers: sc.candidates });
    assert.ok(prompt.includes(person.publicAppearance));
    assert.ok(!prompt.includes('PRIVATE_SECRET'));
    assert.equal(person.publicProfile, rows.find(row => row.id === person.id).publicProfile);
  }
  assert.ok(sc.candidates[0].publicAppearance.includes('안경'));
  assert.ok(!sc.candidates[1].publicAppearance.includes('안경'));
});
test('unrevealed appearance and private biography never enter visual prompts', () => {
  const hidden = { id: 'masked', name: 'Secret Identity', preRevealAlias: '가면 인물', preRevealProfile: '가면을 쓴 사람', secret: true,
    source: { appearance: 'SECRET_FACE_DESCRIPTION', images: [{ assetPath: 'masked.webp', preRevealSafe: true }] } };
  const sc = captured([hidden]);
  for (const person of sc.candidates) assert.ok(!portraitPrompt({ person, art: '' }).includes('SECRET_FACE_DESCRIPTION'));
  assert.ok(!JSON.stringify(sc.candidates).includes('SECRET_FACE_DESCRIPTION'));
});
const url = s => `data:image/png;base64,${Buffer.from(s).toString('base64')}`;
function setup() {
  let replacement = '', fail = false;
  const person = captured().candidates[0], scope = 'test-work:save';
  const oldKey = portraitKey(scope, person), oldExpression = portraitKey(scope, person, 'smile');
  const records = new Map([[oldKey, { key: oldKey, url: url('old') }], [oldExpression, { key: oldExpression, url: url('old-smile') }], ['room', { key: 'room', url: url('room') }]]);
  const calls = [], scene = { scope, world: { location: '교실' }, environmentKey: 'room', characters: [person], candidates: captured().candidates };
  const options = { getKey: () => 'test', getQuality: () => 'low', getReferences: () => [], getQualityReference: () => assert.fail('a foreign face cannot be the sole reference'), getPortraitReplacement: () => replacement,
    read: async k => records.get(k), write: async r => records.set(r.key, r), onChange() {}, onError() {},
    fetchImage: async (_, init) => { const body = JSON.parse(init.body); calls.push(body); return fail ? Response.json({ error: { message: 'failed' } }, { status: 500 }) : Response.json({ imageUrl: url('new-' + calls.length) }); } };
  return { scene, person, records, calls, oldKey, assets: createStageAssets(options), reload: () => createStageAssets(options), activate: key => { replacement = key; }, fail: () => { fail = true; } };
}
test('explicit repair preserves old paid art until success; new expressions reference only the repaired identity and survive reload', async () => {
  const h = setup(); await h.assets.prepare(h.scene, {});
  assert.equal(h.calls.length, 0, 'updates alone do not charge for repainting');
  const replacement = await h.assets.redrawPortrait(h.scene, h.person);
  assert.equal(h.assets.view(h.scene, {}).portraits[0].url, url('old'));
  assert.equal(h.records.get(h.oldKey).url, url('old'));
  assert.deepEqual(h.calls[0].referenceImages, []);
  assert.ok(h.calls[0].prompt.includes(h.person.publicAppearance));
  assert.ok(workPortrait(replacement.key, h.scene.scope, h.person.id));
  h.activate(replacement.key);
  h.scene.expressions = [{ characterId: h.person.id, offset: 0, expression: 'smile' }];
  await h.assets.prepare(h.scene, { text: '동생이 웃었다.' });
  assert.deepEqual(h.calls[1].referenceImages, [replacement.url]);
  assert.notEqual(h.assets.view(h.scene, {}).portraits[0].url, url('old-smile'));
  const reload = h.reload(); await reload.prepare(h.scene, {});
  assert.equal(h.calls.length, 2);
  assert.equal((await reload.metPortraits([{ id: h.person.id, baseKey: h.oldKey }], h.scene.scope))[0].baseKey, replacement.key);
  const other = { ...h.scene, scope: 'other-work:save' }; await reload.prepare(other, {});
  assert.notEqual(reload.view(other, {}).portraits[0].baseKey, replacement.key);
});
test('failed redraw retains the old identity and does not automatically retry', async () => {
  const h = setup(); await h.assets.prepare(h.scene, {}); h.fail();
  await assert.rejects(h.assets.redrawPortrait(h.scene, h.person));
  await h.assets.prepare(h.scene, {});
  assert.equal(h.calls.length, 1);
  assert.equal(h.assets.view(h.scene, {}).portraits[0].url, url('old'));
});
test('replacement pointers reject another work or person and preserve accepted replacements', async () => {
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const h = setup(), record = await h.assets.redrawPortrait(h.scene, h.person);
  writePortraitReplacement(storage, h.scene.scope, h.person.id, record.key);
  assert.equal(readPortraitReplacement(storage, 'test-work:another-save', h.person.id), record.key);
  assert.equal(readPortraitReplacement(storage, 'other:save', h.person.id), '');
  assert.equal(readPortraitReplacement(storage, h.scene.scope, 'different-person'), '');
  assert.throws(() => writePortraitReplacement(storage, h.scene.scope, 'different-person', record.key));
});
