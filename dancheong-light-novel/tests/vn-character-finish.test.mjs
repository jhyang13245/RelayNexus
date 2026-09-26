import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageAssets } from '../public/vn-assets.mjs';
import { portraitKey } from '../public/vn-scene.mjs';
import { recordMet } from '../public/vn-stage.mjs';
import { STAGE_FRAME_VERSION } from '../public/vn-character-art.mjs';

const person = { id: 'hong', name: '홍재', referenceMode: 'PRIMARY', publicProfile: '흑갈색 머리와 붉은 곤룡포' };
const sc = (who = person) => ({ scope: 'fate-seoul:save', environmentKey: 'alley', world: { location: '골목' }, characters: [who] });
const url = text => `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
function fixture({ people = person, records = new Map(), provider = 'openai', guide = async () => url('style-guide'), locked = () => '', image = async () => {} } = {}) {
  const calls = [], errors = [], scene = sc(people);
  records.set(scene.environmentKey, { key: scene.environmentKey, url: url('background') });
  const assets = createStageAssets({ getKey: () => 'fake', getProvider: () => provider, getQuality: () => 'low', getReferences: () => [url('identity')], getQualityReference: guide, getLockedPortraitKey: locked,
    read: async key => records.get(key), write: async record => records.set(record.key, record), onChange() {}, onError: error => errors.push(error),
    chooseMatte: async () => 'green', removeMatte: async u => u,
    fetchImage: async (endpoint, init) => { const body = JSON.parse(init.body); calls.push({ endpoint, body }); await image(body); return Response.json({ imageUrl: url(`new-${body.purpose}`) }); } });
  return { assets, scene, calls, records, errors };
}

test('both models receive identity then quality guide; quality setting remains selected low', async () => {
  for (const provider of ['openai', 'gemini']) {
    const h = fixture({ provider });
    await h.assets.prepare(h.scene, {});
    const { body, endpoint } = h.calls[0];
    assert.equal(endpoint, provider === 'openai' ? '/api/image' : '/api/gemini/image');
    assert.equal(body.quality, 'low');
    assert.deepEqual(body.referenceImages, [url('identity'), url('style-guide')]);
    assert.match(body.prompt, /FINAL reference image is exclusively a RENDERING-QUALITY GUIDE/);
    assert.match(body.prompt, /홍재/);
    assert.match(body.prompt, /mid-thigh/);
    assert.ok(!body.prompt.includes('cel shading with two tones'));
    h.scene.expressions = [{ characterId: person.id, offset: 0, expression: 'serious' }];
    await h.assets.prepare(h.scene, { text: '홍재는 상황을 지켜봤다.' });
    assert.deepEqual(h.calls[1].body.referenceImages, [url('new-portrait')], 'expression inherits the finished target identity, not the guide woman');
    await h.assets.prepare(h.scene, { text: '다른 대사에서도 같은 태도다.' });
    assert.equal(h.calls.length, 2);
  }
});

test('requested crop correction retains old art offline, redraws once with its identity, then reuses after reload', async () => {
  const key = portraitKey(sc().scope, person), records = new Map([[key, { key, url: url('old') }]]);
  const h = fixture({ records });
  await h.assets.prepare(h.scene, {}, { generate: false });
  const before = h.assets.view(h.scene, {});
  assert.equal(before.portraits[0].url, url('old'));
  assert.equal(before.portraits[0].baseKey, key);
  assert.deepEqual(before.pending, []);
  const met = recordMet([], { ...before, castStatus: 'ready' });
  await h.assets.prepare(h.scene, {});
  const after = h.assets.view(h.scene, {});
  assert.equal(after.portraits[0].url, url('new-portrait'));
  assert.equal(h.calls[0].body.referenceImages[0], url('old'));
  assert.match(h.calls[0].body.prompt, /draw the missing lower torso, hips and upper thighs/);
  const updated = recordMet(met, { ...after, castStatus: 'ready' });
  assert.notEqual(updated[0].baseKey, key);
  assert.equal(records.get(updated[0].baseKey).stageFrame, STAGE_FRAME_VERSION);
  assert.equal((await h.assets.metPortraits(updated))[0].url, url('new-portrait'));
  assert.equal(records.get(key).url, url('old'), 'old paid image is not deleted');
  await h.assets.prepare(h.scene, {});
  assert.equal(h.calls.length, 1);
  const reload = fixture({ records }); await reload.assets.prepare(reload.scene, {});
  assert.equal(reload.calls.length, 0, 'upgraded neutral is reused after reload');
});

test('an existing approved portrait stays local to its work', async () => {
  const nadia = { ...person, id: 'NPC_MASTER_NADIA', name: '나디아' };
  const key = portraitKey(sc().scope, nadia), records = new Map([[key, { key, url: url('approved'), stageFrame: STAGE_FRAME_VERSION }]]);
  const h = fixture({ people: nadia, records }); await h.assets.prepare(h.scene, {});
  assert.equal(h.calls.length, 0);
  assert.equal(h.assets.view(h.scene, {}).portraits[0].url, url('approved'));
  const other = fixture({ people: nadia }); other.scene.scope = 'another-work:save';
  await other.assets.prepare(other.scene, {});
  assert.equal(other.calls.filter(call => call.body.purpose === 'portrait').length, 1);
});

test('a work-scoped pin survives profile and save changes, but cannot pin another work or a situational outfit', async () => {
  const key = portraitKey('fate-seoul:older-save', person);
  const records = new Map([[key, { key, url: url('pinned'), stageFrame: STAGE_FRAME_VERSION }]]);
  const updated = { ...person, publicProfile: '같은 인물의 공개 설정이 보완됨' };
  const h = fixture({ people: updated, records, locked: () => key });
  await h.assets.prepare(h.scene, {});
  assert.equal(h.calls.length, 0);
  assert.equal(h.assets.view(h.scene, {}).portraits[0].url, url('pinned'));
  assert.equal(h.assets.view(h.scene, {}).portraits[0].baseKey, key);

  const changed = fixture({ people: { ...updated, wardrobe: { kind: 'swimwear', detail: '푸른 수영복' } }, records, locked: () => key });
  await changed.assets.prepare(changed.scene, {});
  assert.equal(changed.calls.filter(call => call.body.purpose === 'portrait').length, 1);
  assert.notEqual(changed.assets.view(changed.scene, {}).portraits[0].url, url('pinned'));

  const other = fixture({ people: updated, records, locked: () => key });
  other.scene.scope = 'another-work:save';
  await other.assets.prepare(other.scene, {});
  assert.equal(other.calls.filter(call => call.body.purpose === 'portrait').length, 1);
  assert.notEqual(other.assets.view(other.scene, {}).portraits[0].url, url('pinned'));
});

test('guide or generation failure does not automatically retry paid calls', async () => {
  for (const which of ['guide', 'image']) {
    const h = fixture({
      ...(which === 'guide' ? { guide: async () => { throw Error('guide unavailable'); } } : { image: async () => { throw Error('provider unavailable'); } }) });
    await h.assets.prepare(h.scene, {}); await h.assets.prepare(h.scene, {});
    assert.equal(h.assets.view(h.scene, {}).portraits.length, 0);
    assert.equal(h.calls.length, which === 'guide' ? 0 : 1);
    assert.equal(h.errors.length, 1);
  }
});

test('a corrected base is held while its expression loads; an old bust expression cannot replace it', async () => {
  const key = portraitKey(sc().scope, person), face = portraitKey(sc().scope, person, 'smile');
  const records = new Map([[key, { key, url: url('old-bust') }], [face, { key: face, url: url('old-smiling-bust') }]]);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  const h = fixture({ records, image: async body => { if (body.purpose === 'expression') { started(); await gate; } } });
  h.scene.expressions = [{ characterId: person.id, offset: 0, expression: 'smile' }];
  const preparing = h.assets.prepare(h.scene, {}); await waiting;
  try {
    const view = h.assets.view(h.scene, {});
    assert.equal(view.portraits[0].url, url('new-portrait'));
    assert.equal(view.portraits[0].expressionReady, false);
  } finally { release(); await preparing; }
  assert.equal(h.assets.view(h.scene, {}).portraits[0].url, url('new-expression'));
  await h.assets.prepare(h.scene, {}); assert.equal(h.calls.length, 2);
});
