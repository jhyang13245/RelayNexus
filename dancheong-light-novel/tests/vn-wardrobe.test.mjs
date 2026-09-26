import test from 'node:test';
import assert from 'node:assert/strict';
import { castKey, castRequest, validateCast } from '../public/vn-cast.mjs';
import { outfitKey, validateOutfit, wardrobeAnchors } from '../public/vn-wardrobe.mjs';
import { portraitPrompt } from '../public/vn-character-art.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
import { portraitKey } from '../public/vn-scene.mjs';

const nadia = { id: 'NPC_MASTER_NADIA', name: '나디아', referenceMode: 'PRIMARY', age: 22, publicProfile: '은발, 푸른 눈, 검은 외투와 마도서' };
const makeScene = texts => ({ scope: 'fate-seoul:save', environmentKey: 'seaside', world: { location: '바다' }, candidates: [nadia], publicText: texts.join('\n'), castPages: texts.map((text, i) => ({ start: i * 100, text })) });
const outfit = (kind, evidence = '', detail = '') => ({ candidate: 'C0', kind, evidence, detail });
const beat = (start, evidence, wardrobe) => ({ beat: `P${start}`, speaker: '', onStage: [{ candidate: 'C0', evidence, identityEvidence: evidence }], expressions: [], shot: 'medium', ...(wardrobe ? { wardrobe } : {}) });

test('outfit changes at its actual beat, holds through dialogue, and returns to default', () => {
  const texts = ['나디아가 바다를 바라보았다.', '나디아는 푸른 원피스 수영복으로 갈아입고 물놀이를 했다.', '그녀가 웃었다.', '나디아는 평상복으로 갈아입고 집으로 돌아왔다.'];
  const scene = makeScene(texts);
  const rows = validateCast(scene, { beats: [
    beat(0, texts[0], [outfit('swimwear', texts[1], '푸른 원피스 수영복')]), // future evidence must not apply yet
    beat(100, texts[0], [outfit('swimwear', texts[1], '푸른 원피스 수영복')]),
    beat(200, texts[0]),
    beat(300, texts[3], [outfit('default')]),
  ] });
  assert.equal(rows[0].characters[0].wardrobe, undefined);
  assert.deepEqual(rows[1].characters[0].wardrobe, { kind: 'swimwear', detail: '푸른 원피스 수영복' });
  assert.deepEqual(rows[2].characters[0].wardrobe, rows[1].characters[0].wardrobe);
  assert.equal(outfitKey(rows[3].characters[0].wardrobe), '');
  assert.equal(scene.candidates[0].wardrobe, undefined, 'canonical/public character is not mutated');
});

test('quoted, hypothetical, recalled, negated and mere beach context cannot select swimwear', () => {
  for (const text of ['“나디아가 수영복을 입고 물놀이를 했다.”', '만약 나디아가 물놀이를 한다면 좋겠다.', '사진 속 나디아가 수영복을 입었다.', '나디아와 물놀이를 했던 일을 떠올렸다.', '나디아는 물놀이를 하지 않기로 했다.', '나디아는 바다 옆 길을 걸었다.']) {
    const evidence = text.replace(/[“”]/gu, '');
    assert.equal(validateOutfit(outfit('swimwear', evidence), text), null, text);
  }
  const real = '나디아가 바다에서 물놀이를 했다.';
  assert.deepEqual(validateOutfit(outfit('swimwear', real), real), { kind: 'swimwear', detail: '' });
  assert.equal(validateOutfit(outfit('swimwear', real, '붉은 비키니'), real), null, 'fabricated details cannot create variants');
  assert.equal(validateOutfit(outfit('custom', real), real), null);
});

test('offstage outfit directives are ignored; explicit design variants use separate stable identities', () => {
  const text = '나디아가 수영복으로 갈아입었다.', scene = makeScene([text]);
  const row = validateCast(scene, { beats: [beat(0, text, [{ ...outfit('swimwear', text), candidate: 'C9' }])] })[0];
  assert.equal(row.characters[0].wardrobe, undefined);
  assert.equal(outfitKey({ kind: 'default', detail: 'anything' }), '');
  assert.equal(outfitKey({ kind: 'swimwear' }), outfitKey({ kind: 'swimwear', detail: '' }));
  assert.equal(outfitKey({ kind: 'swimwear', detail: '푸른  수영복' }), outfitKey({ kind: 'swimwear', detail: '푸른 수영복' }));
  assert.notEqual(outfitKey({ kind: 'swimwear', detail: '푸른 수영복' }), outfitKey({ kind: 'swimwear', detail: '붉은 수영복' }));
});

test('ordered wardrobe history survives a long conversation and carries a later return to daily life', () => {
  const old = '나디아는 푸른 원피스 수영복으로 갈아입었다.';
  const recent = '나디아가 창밖을 보았다. '.repeat(250);
  const scene = { ...makeScene(['나디아가 고개를 들었다.']), previousText: recent, wardrobeHistory: old + '\n' + recent + '\n다음 날 학교에 돌아왔다.' };
  const request = castRequest(scene, 'gpt-6-luna'), input = JSON.parse(request.input);
  assert.deepEqual(wardrobeAnchors(scene), [old, '다음 날 학교에 돌아왔다.']);
  assert.deepEqual(input.wardrobeHistory, wardrobeAnchors(scene));
  assert.notEqual(castKey(scene), castKey({ ...scene, wardrobeHistory: '' }));
  const item = request.text.format.schema.properties.beats.items;
  assert.ok(item.required.includes('wardrobe'));
  assert.ok(item.properties.wardrobe.items.properties.kind.enum.includes('swimwear'));
  assert.match(request.instructions, /clothed rescue/);
  assert.match(request.instructions, /return to normal daily life/);
});

test('outfit prompt preserves identity and overrides default clothing only for a situational outfit', () => {
  const basic = portraitPrompt({ person: nadia, art: 'art' });
  assert.match(basic, /DEFAULT WARDROBE/);
  const variant = portraitPrompt({ person: { ...nadia, wardrobe: { kind: 'swimwear', detail: '푸른 원피스 수영복' } }, art: 'art', hasGuide: true });
  assert.match(variant, /CURRENT WARDROBE: replace the default clothes/);
  assert.match(variant, /same face, apparent age/);
  assert.match(variant, /푸른 원피스 수영복/);
  assert.match(variant, /do not add books, coats, armour/);
  assert.ok(!variant.includes('DEFAULT WARDROBE:'));
});

const url = text => `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
test('both models isolate outfit expressions, reuse outfits after reload, and restore approved default without a paid call', async () => {
  for (const provider of ['openai', 'gemini']) {
    const baseScene = { ...makeScene(['나디아가 물놀이를 했다.']), characters: [nadia] };
    const approvedKey = portraitKey(baseScene.scope, nadia);
    const records = new Map([[approvedKey, { key: approvedKey, url: url('approved-default'), stageFrame: 'vn-stage-frame-2' }], [baseScene.environmentKey, { key: baseScene.environmentKey, url: url('background') }]]);
    const calls = [];
    const create = () => createStageAssets({ getKey: () => 'test', getQuality: () => 'low', getProvider: () => provider, getReferences: () => [url('original')], getQualityReference: async () => url('guide'),
      read: async key => records.get(key), write: async row => records.set(row.key, row), onChange() {}, onError(error) { throw Error(error); }, chooseMatte: async () => 'green', removeMatte: async value => value,
      fetchImage: async (_, init) => { const body = JSON.parse(init.body); calls.push(body); return Response.json({ imageUrl: url(`generated-${calls.length}-${body.purpose}`) }); } });
    const assets = create();
    const swim = { ...baseScene, characters: [{ ...nadia, wardrobe: { kind: 'swimwear', detail: '' } }], direction: { expressions: { [nadia.id]: 'smile' } } };
    await Promise.all([assets.prepare(swim, {}), assets.prepare(swim, {})]);
    assert.equal(calls.length, 2, 'concurrent lookahead shares neutral and expression generation');
    assert.deepEqual(calls[0].referenceImages, [url('approved-default'), url('original'), url('guide')]);
    assert.deepEqual(calls[1].referenceImages, [url('generated-1-portrait')], 'expression uses the matching outfit, not default');
    const swimView = assets.view(swim, {});
    assert.notEqual(swimView.portraits[0].baseKey, approvedKey);
    await assets.prepare({ ...swim, publicText: '다음 대사에서도 웃었다.' }, {});
    await assets.prepare(baseScene, {});
    assert.equal(assets.view(baseScene, {}).portraits[0].url, url('approved-default'));
    const reloaded = create(); await reloaded.prepare(swim, {});
    assert.equal(calls.length, 2, 'later dialogue, return to default and reload all reuse cached images');
    assert.equal(reloaded.view(swim, {}).portraits[0].url, swimView.portraits[0].url);
  }
});

test('a missing/failed situational outfit never claims the default sprite is a ready matching costume', async () => {
  const scene = { ...makeScene(['나디아가 물놀이를 했다.']), characters: [{ ...nadia, wardrobe: { kind: 'swimwear', detail: '' } }] };
  const key = portraitKey(scene.scope, nadia), records = new Map([[key, { key, url: url('default') }], [scene.environmentKey, { key: scene.environmentKey, url: url('background') }]]);
  let calls = 0;
  const assets = createStageAssets({ getKey: () => 'test', getQuality: () => 'low', getReferences: () => [], read: async key => records.get(key), write: async () => {}, onChange() {}, onError() {}, fetchImage: async () => { calls++; throw Error('quota'); } });
  await assets.prepare(scene, {}); await assets.prepare(scene, {});
  assert.equal(calls, 1);
  assert.equal(assets.view(scene, {}).portraits.length, 0);
  assert.equal(assets.view(scene, {}).pending.length, 1);
  assert.equal(records.get(key).url, url('default'));
});
