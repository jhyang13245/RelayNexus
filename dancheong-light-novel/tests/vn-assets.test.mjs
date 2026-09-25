import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageAssets } from '../public/vn-assets.mjs';
import { environmentKey } from '../public/vn-scene.mjs';

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
  await h.assets.retry(scene(), {});
  assert.equal(h.requests.length, 4);
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
