import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureScene, portraitKey } from '../public/vn-scene.mjs';
import { portraitPrompt, workPortrait, readPortraitReplacement, writePortraitReplacement } from '../public/vn-character-art.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
import { validateCast } from '../public/vn-cast.mjs';

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

for (const provider of ['openai', 'gemini']) test(`${provider}: registered profile without embedded art generates on arrival, then reuses its own identity`, async () => {
  const sc = captured();
  const arrival = '동생이 교실 문을 열고 들어와 내 앞에 섰다.';
  const mention = '사진 속 친구를 떠올렸다.';
  sc.publicText = `${arrival}\n${mention}`;
  sc.castPages = [{ start: 0, text: sc.publicText }];
  const named = evidence => ({ evidence, identityEvidence: evidence, identityStatus: 'confirmed', presence: 'physical' });
  // Even an overinclusive model answer cannot put the merely recalled friend on stage.
  const [beat] = validateCast(sc, { beats: [{ beat: 'P0', speaker: '', onStage: [
    { candidate: 'C0', ...named(arrival) }, { candidate: 'C1', ...named(mention) },
  ] }] });
  const scene = { ...sc, ...beat };
  assert.equal(scene.characters.length, 1);
  assert.equal(scene.characters[0].id, 'younger');
  assert.equal(scene.characters[0].primaryAssetRef, '');
  const saved = new Map([[scene.environmentKey, { key: scene.environmentKey, url: url('room') }]]);
  const requests = [], errors = [];
  const options = {
    getKey: () => 'fixture', getQuality: () => 'low', getProvider: () => provider,
    getReferences: person => experience.selectImageReferences({ visualReferences: [{ characterId: person.id, name: person.name,
      mode: person.referenceMode, primaryAssetRef: person.primaryAssetRef, allowedAssetRefs: person.allowedAssetRefs }] },
    [{ characterId: 'friend', dataUrl: url('other-person'), ref: 'friend.png' }]).map(row => row.dataUrl),
    getQualityReference: () => assert.fail('another character must not become the sole identity reference'),
    chooseMatte: async () => '#00ff00', removeMatte: async value => value,
    reviewFrame: async () => ({ status: 'valid' }),
    read: async key => saved.get(key), write: async record => saved.set(record.key, record),
    onChange() {}, onError: message => errors.push(message),
    fetchImage: async (endpoint, init) => {
      const body = JSON.parse(init.body); requests.push({ endpoint, ...body });
      return Response.json({ imageUrl: url(`generated-${requests.length}`) });
    },
  };
  const assets = createStageAssets(options);
  await Promise.all([assets.prepare(scene, {}), assets.prepare(scene, {})]);
  assert.deepEqual(errors, []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].purpose, 'portrait');
  assert.equal(requests[0].endpoint, provider === 'gemini' ? '/api/gemini/image' : '/api/image');
  assert.deepEqual(requests[0].referenceImages, []);
  assert.ok(requests[0].prompt.includes('No identity image is supplied'));
  assert.ok(requests[0].prompt.includes(rows[0].source.appearance));
  assert.ok(!requests[0].prompt.includes('PRIVATE_SECRET'));
  const base = assets.view(scene, {}).portraits[0].url;
  const restored = createStageAssets(options);
  await restored.prepare(scene, {});
  assert.equal(requests.length, 1);
  assert.equal(restored.view(scene, {}).portraits[0].url, base);
  scene.expressions = [{ characterId: 'younger', offset: 0, expression: 'smile' }];
  await restored.prepare(scene, { text: '동생이 환하게 웃었다.' });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].purpose, 'expression');
  assert.deepEqual(requests[1].referenceImages, [base]);
});

test('a declared but unavailable reference stays an error rather than silently inventing a different face', async () => {
  const sc = captured(), person = { ...sc.candidates[0], primaryAssetRef: 'authored/younger.png' };
  const errors = [], scene = { ...sc, characters: [person] };
  const assets = createStageAssets({ getKey: () => 'fixture', getQuality: () => 'low',
    getReferences: person => experience.selectImageReferences({ visualReferences: [{ characterId: person.id, name: person.name,
      mode: person.referenceMode, primaryAssetRef: person.primaryAssetRef }] }, []),
    read: async key => key === sc.environmentKey ? { key, url: url('room') } : null,
    write: async () => {}, onChange() {}, onError: message => errors.push(message),
    fetchImage: () => assert.fail('an authored reference load failure must not purchase an invented appearance'),
  });
  await assets.prepare(scene, {});
  assert.equal(assets.view(scene, {}).portraits.length, 0);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('기준 사진'));
});
