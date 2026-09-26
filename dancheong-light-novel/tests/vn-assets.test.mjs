import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageAssets, expressionContext } from '../public/vn-assets.mjs';
import { environmentKey, portraitKey } from '../public/vn-scene.mjs';
import { chromaVersion } from '../public/vn-chroma.mjs';
import { imageProviderFor } from '../public/vn-image-routing.mjs';
import { fullAutoVisuals } from '../public/vn-autoplay.mjs';

const person = { id: 'person', name: '서현', referenceMode: 'PRIMARY', allowedAssetRefs: ['*'] };
function scene(location = '교실', expression = 'neutral') {
  const world = { location, time: '14:00' };
  return { scope: 'test', world, environmentKey: environmentKey('test', world), characters: [person], expressions: [{ characterId: 'person', expression, offset: 0 }] };
}
function harness({ fail = false, saved = new Map() } = {}) {
  const requests = [], errors = [];
  const assets = createStageAssets({ getKey: () => 'fake-key', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError: error => errors.push(error), read: async key => saved.get(key), write: async record => saved.set(record.key, record),
    fetchImage: async (url, init) => { const body = JSON.parse(init.body); requests.push(body); return Response.json(fail ? { error: { message: 'fixture failure' } } : { imageUrl: `data:image/png;base64,${Buffer.from(body.purpose + requests.length).toString('base64')}` }, { status: fail ? 500 : 200 }); } });
  return { assets, requests, errors, saved };
}
test('같은 장소와 인물은 배경·기본 인물을 한 번만 생성하고 새 표정만 편집한다', async () => {
  const h = harness(), first = scene();
  await Promise.all([h.assets.prepare(first, {}), h.assets.prepare(first, {})]);
  assert.deepEqual(h.requests.map(row => row.purpose).sort(), ['background', 'portrait']);
  const background = h.assets.view(first, {}).background;
  await h.assets.prepare(scene('교실', 'smile'), {});
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests.at(-1).purpose, 'expression');
  assert.equal(h.requests.at(-1).referenceImages.length, 1);
  assert.equal(h.assets.view(scene('교실', 'smile'), {}).background, background);
  await h.assets.prepare(scene(), {});
  await h.assets.prepare(scene('교실', 'smile'), {});
  assert.equal(h.requests.length, 3);
  await h.assets.prepare(scene('복도', 'smile'), {});
  assert.equal(h.requests.length, 4);
  assert.equal(h.requests.at(-1).purpose, 'background');
  const restored = harness({ saved: h.saved });
  await restored.assets.prepare(scene('교실', 'smile'), {});
  assert.equal(restored.requests.length, 0);
  assert.equal(restored.assets.view(scene('교실', 'smile'), {}).background, background);
});
test('실패는 턴 진행이나 페이지 이동으로 자동 반복 청구하지 않고 명시적 재시도로만 다시 요청한다', async () => {
  const h = harness({ fail: true });
  await h.assets.prepare(scene(), {});
  await h.assets.prepare(scene(), {});
  assert.equal(h.requests.length, 2);
  assert.equal(h.assets.view(scene(), {}).status, 'error');
  assert.equal(h.assets.view(scene(), {}).pending[0].status, 'error');
  assert.equal(fullAutoVisuals({ ...h.assets.view(scene(), {}), castStatus: 'ready' }).action, 'stop');
  await h.assets.retry(scene(), {});
  assert.equal(h.requests.length, 4);
});

test('full auto waits for a slow base portrait, ignores unrelated background work, and reuses it without another paid request', async () => {
  const releases = new Map(), requests = [];
  const assets = createStageAssets({ getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError() {}, read: async () => null, write: async () => {},
    fetchImage: async (_url, init) => { const { purpose } = JSON.parse(init.body); requests.push(purpose); return new Promise(resolve => releases.set(purpose, () => resolve(Response.json({ imageUrl: `data:image/png;base64,${Buffer.from(purpose).toString('base64')}` })))); } });
  const current = scene(), pending = assets.prepare(current, {});
  await new Promise(r => setImmediate(r));
  const readView = () => ({ ...assets.view(current, {}), castStatus: 'ready' });
  assert.equal(readView().pending[0].status, 'generating'); assert.equal(fullAutoVisuals(readView()).action, 'wait');
  releases.get('portrait')(); await new Promise(r => setImmediate(r));
  const view = readView(), sprite = view.portraits[0];
  assert.equal(assets.isBusy(), true, 'the unrelated background is still generating');
  assert.equal(view.pending.length, 0);
  assert.equal(fullAutoVisuals(view).action, 'wait', 'generation alone cannot release navigation');
  assert.equal(fullAutoVisuals(view, { displayed: [{ id: sprite.id, url: sprite.url, baseKey: sprite.baseKey }] }).action, 'ready');
  releases.get('background')(); await pending;
  await assets.prepare(current, {}); assert.equal(requests.filter(p => p === 'portrait').length, 1);
});

test('missing portrait credentials are distinct from queued generation', async () => {
  const assets = createStageAssets({ getKey: () => '', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError() {}, read: async () => null, write: async () => {},
    fetchImage: async () => assert.fail('no paid request without a key') });
  await assets.prepare(scene(), {});
  const view = { ...assets.view(scene(), {}), castStatus: 'ready' };
  assert.equal(view.pending[0].status, 'needs-key'); assert.equal(fullAutoVisuals(view).action, 'stop');
});

test('old expression art stays available offline; the paid base is preserved and only the needed face is upgraded', async () => {
  const first = scene(), smiling = scene('교실', 'smile');
  const saved = new Map([
    [first.environmentKey, { key: first.environmentKey, url: 'data:image/png;base64,Ymc=' }],
    [portraitKey('test', person), { key: portraitKey('test', person), url: 'data:image/png;base64,YmFzZQ==' }],
    [portraitKey('test', person, 'smile'), { key: portraitKey('test', person, 'smile'), url: 'data:image/png;base64,b2xk' }],
  ]);
  const h = harness({ saved });
  await h.assets.prepare(smiling, {}, { generate: false });
  assert.equal(h.assets.view(smiling, {}).portraits[0].url, 'data:image/png;base64,b2xk');
  assert.equal(h.requests.length, 0);
  await h.assets.prepare(smiling, {});
  assert.deepEqual(h.requests.map(row => row.purpose), ['portrait', 'expression']);
  assert.deepEqual(h.requests[1].referenceImages, [h.assets.view(smiling, {}).portraits[0].base], 'the new expression uses the preserved base');
  const newFace = h.assets.view(smiling, {}).portraits[0].url;
  assert.notEqual(newFace, 'data:image/png;base64,b2xk');
  for (let line = 0; line < 8; line++) await h.assets.prepare(smiling, {});
  const restored = harness({ saved });
  await restored.assets.prepare(smiling, {});
  assert.equal(h.requests.length, 2);
  assert.equal(restored.requests.length, 0);
  assert.equal(restored.assets.view(smiling, {}).portraits[0].url, newFace);
});

test('story expressions receive this character and published beats only, without facial recipes or per-line regeneration', async () => {
  const h = harness(), sc = scene('교실', 'angry');
  sc.previousText = '서현은 친구를 보호하려고 앞에 섰다.';
  sc.castPages = [
    { start: 800, rawText: '상대가 서현의 친구에게 다가왔다.' },
    { start: 850, rawText: '서현은 물러서지 않고 상대의 다음 행동을 기다렸다.' },
    { start: 900, rawText: '미래 장면: 싸움이 끝나자 서현은 웃었다.' },
  ];
  sc.publicText = sc.castPages.map(row => row.rawText).join('\n');
  await h.assets.prepare(sc, sc.castPages[1]);
  const body = h.requests.find(row => row.purpose === 'expression');
  assert.ok(body.prompt.includes(sc.previousText));
  assert.ok(body.prompt.includes(sc.castPages[0].rawText));
  assert.ok(body.prompt.includes(sc.castPages[1].rawText));
  assert.ok(body.prompt.includes('서현'));
  assert.doesNotMatch(body.prompt, /미래 장면|furrowed|eyebrows|clenched|angry expression|wide eyes/u);
  await h.assets.prepare(sc, sc.castPages[2]);
  assert.equal(h.requests.filter(row => row.purpose === 'expression').length, 1, 'new prose reuses the held expression');
  const fallback = expressionContext(sc, { start: 999, text: '현재 공개 문장' });
  assert.equal(fallback.current, '현재 공개 문장');
  assert.equal(fallback.preceding, '', 'unmatched offsets never expose the full paragraph');
});

test('the previous face-redraw cache remains an offline fallback and receives just one requested replacement', async () => {
  const sc = scene('교실', 'smile');
  const baseKey = portraitKey('test', person), oldKey = JSON.stringify(['vn-face-redraw-1', portraitKey('test', person, 'smile')]);
  const saved = new Map([
    [sc.environmentKey, { key: sc.environmentKey, url: 'background' }],
    [baseKey, { key: baseKey, url: 'data:image/png;base64,YmFzZQ==' }],
    [oldKey, { key: oldKey, url: 'prior-face' }],
  ]);
  const h = harness({ saved });
  await h.assets.prepare(sc, { text: '서현은 친구의 무사 귀환을 반겼다.' }, { generate: false });
  assert.equal(h.assets.view(sc, {}).portraits[0].url, 'prior-face');
  assert.equal(h.requests.length, 0);
  await h.assets.prepare(sc, { text: '서현은 친구의 무사 귀환을 반겼다.' });
  await h.assets.prepare(sc, { text: '대화가 이어졌다.' });
  assert.deepEqual(h.requests.map(row => row.purpose), ['portrait', 'expression']);
  assert.equal(saved.get(oldKey).url, 'prior-face', 'previous paid image remains stored');
  const restored = harness({ saved });
  await restored.assets.prepare(sc, {});
  assert.equal(restored.requests.length, 0);
});

test('conversation, speaker and minute changes reuse the background; a new location generates only its background', async () => {
  const h = harness();
  await h.assets.prepare(scene(), {});
  for (let line = 0; line < 8; line++) {
    const sc = scene();
    sc.world.time = `14:${String(line + 10).padStart(2, '0')}`;
    sc.environmentKey = environmentKey(sc.scope, sc.world);
    sc.publicText = `다음 대사 ${line}`;
    await h.assets.prepare(sc, { start: line, characterId: line % 2 ? person.id : '' });
  }
  assert.deepEqual(h.requests.map(row => row.purpose).sort(), ['background', 'portrait']);
  await h.assets.prepare(scene('도서관'), {});
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests.at(-1).purpose, 'background');
});

test('Gemini selection reuses prior OpenAI art, edits only new expressions with the selected key, and caches alpha result', async () => {
  let provider = 'openai';
  const saved = new Map(), calls = [], removed = [];
  const assets = createStageAssets({ getProvider: () => provider, getKey: () => provider + '-fixture-key', getQuality: () => 'medium', getReferences: () => [],
    onChange() {}, onError: message => assert.fail(message), read: async key => saved.get(key), write: async row => saved.set(row.key, row),
    chooseMatte: async refs => { assert.equal(refs.length, 1); return 'magenta'; },
    removeMatte: async (url, matte) => { removed.push({ url, matte }); return 'data:image/png;base64,YWxwaGE='; },
    fetchImage: async (url, init) => { calls.push({ url, key: init.headers.Authorization, body: JSON.parse(init.body) }); return Response.json({ imageUrl: 'data:image/png;base64,aW1hZ2U=' }); } });
  await assets.prepare(scene(), {});
  provider = 'gemini';
  await assets.prepare(scene(), {});
  assert.equal(calls.length, 2);
  await assets.prepare(scene('교실', 'smile'), {});
  assert.equal(calls.length, 3);
  const last = calls.at(-1);
  assert.equal(last.url, '/api/gemini/image'); assert.equal(last.key, 'Bearer gemini-fixture-key');
  assert.equal(last.body.model, 'gemini-3.1-flash-image'); assert.equal(last.body.quality, 'medium');
  assert.equal(last.body.purpose, 'expression'); assert.equal(last.body.matteColor, 'magenta');
  assert.deepEqual(last.body.referenceImages, ['data:image/png;base64,aW1hZ2U=']);
  assert.equal(removed.length, 1);
  assert.equal(assets.view(scene('교실', 'smile'), {}).portraits[0].url, 'data:image/png;base64,YWxwaGE=');
  await assets.prepare(scene('교실', 'smile'), {}); assert.equal(calls.length, 3);
  await assets.prepare(scene('복도', 'smile'), {}); assert.equal(calls.length, 4);
  assert.equal(calls.at(-1).body.purpose, 'background'); assert.equal(removed.length, 1);
  assert.equal(assets.isBusy(), false);
});

test('old Gemini portraits are cleaned once offline without regenerating or touching OpenAI/background art', async () => {
  const sc = scene(), key = portraitKey(sc.scope, person), calls = [], writes = [];
  const saved = new Map([
    [sc.environmentKey, { key: sc.environmentKey, url: 'background', provider: 'gemini' }],
    [key, { key, url: 'old-green-edge', provider: 'gemini', chromaVersion: 2 }],
  ]);
  const make = () => createStageAssets({ getKey: () => '', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError: assert.fail,
    read: async k => saved.get(k), write: async row => { saved.set(row.key, row); writes.push(row); },
    cleanEdges: async (url, matte) => { calls.push(url); assert.equal(matte, undefined); return 'clean-edge'; },
    fetchImage: () => assert.fail('must not call a paid endpoint') });
  const assets = make(); await assets.prepare(sc, {}, { generate: false });
  assert.equal(assets.view(sc, {}).portraits[0].url, 'clean-edge');
  assert.equal(assets.view(sc, {}).background, 'background');
  assert.deepEqual(calls, ['old-green-edge']); assert.equal(writes.filter(row => row.key === key).length, 1); assert.equal(saved.get(key).chromaVersion, chromaVersion);
  assert.equal(writes.some(row => row.key === sc.environmentKey), false, 'adopting a place anchor never rewrites the paid environment');
  await make().prepare(sc, {}, { generate: false }); assert.equal(calls.length, 1);
  saved.set(key, { key, url: 'openai-art', provider: 'openai' });
  await make().prepare(sc, {}, { generate: false }); assert.equal(calls.length, 1);
});

test('failed legacy edge cleanup retains the original portrait without a generation retry', async () => {
  const sc = scene(), key = portraitKey(sc.scope, person);
  const assets = createStageAssets({ getKey: () => '', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError: assert.fail,
    read: async k => k === key ? { key, url: 'original', provider: 'gemini' } : null,
    write: async () => assert.fail('no replacement'), cleanEdges: async () => { throw new Error('decode failed'); },
    fetchImage: () => assert.fail('no paid retry') });
  await assets.prepare(sc, {}, { generate: false });
  assert.equal(assets.view(sc, {}).portraits[0].url, 'original');
});

test('all four background/character model combinations route matching keys, expressions and CG independently', async () => {
  for (const background of ['openai', 'gemini']) for (const character of ['openai', 'gemini']) {
    const routing = { background, character }, calls = [], sc = scene('교실', 'smile');
    sc.publicText = '서현이 친구를 보호했다.'; sc.castPages = [{ start: 0, text: sc.publicText }];
    const selected = purpose => imageProviderFor(routing, purpose);
    const assets = createStageAssets({ getProvider: selected, getKey: purpose => `${selected(purpose)}-key`, getQuality: () => 'low', getReferences: () => [],
      getCgEnabled: () => true, castDirector: { prepare: async s => s, view: s => s, timeline: () => [{ start: 0, characters: [person], direction: { cg: true, event: { characterIds: [person.id], castComplete: true } } }] },
      onChange() {}, onError: assert.fail, read: async () => null, write: async () => {}, chooseMatte: async () => 'green', removeMatte: async url => url,
      fetchImage: async (url, init) => { calls.push({ url, authorization: init.headers.Authorization, body: JSON.parse(init.body) }); return Response.json({ imageUrl: 'data:image/png;base64,aW1hZ2U=' }); } });
    await assets.prepare(sc, sc.castPages[0]);
    assert.deepEqual(calls.map(row => row.body.purpose).sort(), ['background', 'expression', 'portrait', 'scene']);
    for (const call of calls) {
      const expected = ['background', 'scene'].includes(call.body.purpose) ? background : character;
      assert.equal(call.url, expected === 'gemini' ? '/api/gemini/image' : '/api/image');
      assert.equal(call.authorization, `Bearer ${expected}-key`);
      assert.equal(call.body.model, expected === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-2.5-flare');
    }
    assert.equal(calls.find(row => row.body.purpose === 'expression').body.referenceImages.length, 1);
    assert.equal(calls.find(row => row.body.purpose === 'scene').body.referenceImages.length, 2);
    await assets.prepare(sc, sc.castPages[0]); assert.equal(calls.length, 4, 'same paid images stay cached');
  }
});

test('a missing background key does not block character generation, and the inverse also works', async () => {
  for (const available of ['background', 'portrait']) {
    const calls = [], assets = createStageAssets({ getProvider: purpose => purpose === 'background' ? 'openai' : 'gemini',
      getKey: purpose => purpose === available ? 'fixture-key' : '', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError: assert.fail,
      read: async () => null, write: async () => {}, chooseMatte: async () => 'green', removeMatte: async url => url,
      fetchImage: async (_url, init) => { calls.push(JSON.parse(init.body).purpose); return Response.json({ imageUrl: 'data:image/png;base64,aW1hZ2U=' }); } });
    await assets.prepare(scene(), {});
    assert.deepEqual(calls, [available]);
    assert.equal(assets.view(scene(), {}).missingKeys[0].purpose, available === 'background' ? 'portrait' : 'background');
  }
});
