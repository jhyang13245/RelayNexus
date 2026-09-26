import test from 'node:test';
import assert from 'node:assert/strict';
import { portraitFrameCheck } from '../public/vn-sprite.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
import { portraitKey } from '../public/vn-scene.mjs';
import { STAGE_FRAME_VERSION } from '../public/vn-character-art.mjs';

const bounds = { top: 0, bottom: 999, height: 1000, transparentFraction: .5 };
test('shared geometry check rejects a bust with missing lower body, allows long art to be cropped, and distinguishes uncertain faces', () => {
  assert.equal(portraitFrameCheck(bounds, { headWidth: 250, width: 160, eyeY: 230 }).status, 'measured');
  assert.equal(portraitFrameCheck(bounds, { headWidth: 390, width: 250, eyeY: 220 }).code, 'SHORT_BODY_CROP');
  assert.equal(portraitFrameCheck(bounds, { headWidth: 170, width: 110, eyeY: 140 }).status, 'measured');
  assert.equal(portraitFrameCheck(bounds, null).status, 'unmeasured');
  assert.equal(portraitFrameCheck(bounds, { headWidth: 700, width: 160, eyeY: 230 }).status, 'unmeasured');
  assert.equal(portraitFrameCheck(null, null).code, 'EMPTY_SPRITE');
  assert.equal(portraitFrameCheck({ ...bounds, transparentFraction: 0 }, null).code, 'OPAQUE_SPRITE');
});

test('both providers quarantine bad framing, keep previous art, and never auto-rebill after reload; explicit retry replaces it once', async () => {
  for (const provider of ['openai', 'gemini']) {
    const person = { id: 'arbitrary-person', name: '다른 작품 인물', referenceMode: 'PRIMARY' };
    const scene = { scope: 'arbitrary-work:save', environmentKey: 'place', world: {}, characters: [person] };
    const oldKey = portraitKey(scene.scope, person), oldUrl = 'data:image/png;base64,b2xk';
    const records = new Map([[oldKey, { key: oldKey, url: oldUrl }], ['place', { key: 'place', url: 'background' }]]);
    let requests = 0, valid = false;
    const make = () => createStageAssets({ getKey: () => 'fixture', getProvider: () => provider, getQuality: () => 'low', getReferences: () => [],
      read: async key => records.get(key), write: async row => records.set(row.key, row), onChange() {}, onError() {},
      chooseMatte: async () => 'green', removeMatte: async url => url,
      reviewFrame: async () => ({ status: valid ? 'measured' : 'invalid', code: valid ? 'FRAME_GEOMETRY_OK' : 'SHORT_BODY_CROP' }),
      fetchImage: async () => { requests++; return Response.json({ imageUrl: 'data:image/png;base64,bmV3' }); } });
    const first = make(); await first.prepare(scene, {}); await first.prepare(scene, {});
    assert.equal(requests, 1); assert.equal(first.view(scene, {}).status, 'error');
    assert.equal(first.view(scene, {}).portraits[0].url, oldUrl);
    const rejected = [...records.values()].find(row => row.rejected);
    assert.equal(rejected.url, ''); assert.ok(rejected.rejectedImageUrl); assert.equal(rejected.frameReview.code, 'SHORT_BODY_CROP');
    const restored = make(); await restored.prepare(scene, {});
    assert.equal(requests, 1); assert.equal(restored.view(scene, {}).portraits[0].url, oldUrl);
    valid = true; await restored.retry(scene, {});
    assert.equal(requests, 2); assert.equal(restored.view(scene, {}).portraits[0].url, 'data:image/png;base64,bmV3');
    await make().prepare(scene, {}); assert.equal(requests, 2);
  }
});

test('already cached framed art is checked locally before display without purchasing a replacement', async () => {
  const person = { id: 'person', referenceMode: 'PRIMARY' }, scene = { scope: 'work:save', environmentKey: 'place', world: {}, characters: [person] };
  const key = JSON.stringify([STAGE_FRAME_VERSION, JSON.stringify(['vn-character-finish-1', portraitKey(scene.scope, person)])]);
  const records = new Map([[key, { key, url: 'bad-cached-art', stageFrame: STAGE_FRAME_VERSION }]]);
  const assets = createStageAssets({ getKey: () => '', getQuality: () => 'low', getReferences: () => [], read: async key => records.get(key), write: async row => records.set(row.key, row), onChange() {}, onError() {},
    reviewFrame: async () => ({ status: 'invalid', code: 'SHORT_BODY_CROP' }), fetchImage: () => assert.fail('no paid request') });
  await assets.prepare(scene, {}, { generate: false });
  assert.equal(assets.view(scene, {}).portraits.length, 0); assert.equal(records.get(key).rejected, true);
});
