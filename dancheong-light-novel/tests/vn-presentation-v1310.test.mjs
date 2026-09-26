import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogueGrace, resolvedSpeaker } from '../public/vn-stage-timing.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
import { environmentKey, locationAnchorKey } from '../public/vn-scene.mjs';
import { directionFor } from '../public/vn-cast.mjs';
import { stableMotionPixels } from '../public/vn-motion.mjs';
import { shotAssetKey } from '../public/vn-shots.mjs';

test('five second deadline belongs to a turn, never resets on cast updates or the next utterance', () => {
  let now = 0; const grace = createDialogueGrace({ now: () => now });
  assert.equal(grace.remaining('turn1'), 5000); now = 1000;
  assert.equal(grace.remaining('turn1'), 4000); now = 4999;
  assert.equal(grace.remaining('turn1'), 1); now = 5000;
  assert.equal(grace.remaining('turn1'), 0);
  assert.equal(grace.remaining('turn2'), 5000);
  const page = resolvedSpeaker({ kind: 'dialogue', text: '“안녕”', speaker: '틀린 이름' }, { castStatus: 'checking' });
  assert.equal(page.speaker, ''); assert.equal(page.characterId, ''); assert.equal(page.text, '“안녕”');
  grace.clear(); assert.equal(grace.remaining('turn1'), 5000);
});
const person = { id: 'a', name: '서현', publicProfile: '성인 여성' };
const scene = (time = '12:00', location = '교실', scope = 'work') => {
  const world = { location, time, weather: '맑음' };
  return { world, scope, environmentKey: environmentKey(scope, world), characters: [person], publicText: '서현은 결심을 굳히고 눈을 들었다.', castStatus: 'ready', speakerId: 'a' };
};
function harness(options = {}) {
  const saved = options.saved || new Map(), calls = [];
  const assets = createStageAssets({ getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError() {}, read: async key => saved.get(key), write: async record => saved.set(record.key, record), fetchImage: async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, body }); return Response.json({ imageUrl: `data:image/png;base64,${Buffer.from(String(calls.length)).toString('base64')}` }); }, ...options });
  return { saved, calls, assets };
}
test('day/dusk/night share the same place reference; new places and works do not', async () => {
  const h = harness(), day = scene(), night = scene('22:00');
  await h.assets.prepare(day, {});
  const original = h.assets.view(day, {}).background;
  await h.assets.prepare(night, {});
  assert.deepEqual(h.calls.at(-1).body.referenceImages, [original]);
  await h.assets.prepare(scene('18:00'), {});
  assert.deepEqual(h.calls.at(-1).body.referenceImages, [original]);
  await h.assets.prepare(scene('22:00', '복도'), {});
  assert.equal(h.calls.at(-1).body.referenceImages, undefined);
  await h.assets.prepare(scene('12:00', '교실', 'other'), {});
  assert.equal(h.calls.filter(c => c.body.purpose === 'background').at(-1).body.referenceImages, undefined);
  const reload = harness({ saved: h.saved }); await reload.assets.prepare(night, {});
  assert.equal(reload.calls.length, 0);
});
test('old paid day background becomes a reference after reload; concurrent light variants agree', async () => {
  const day = scene(), saved = new Map([[day.environmentKey, { key: day.environmentKey, url: 'data:image/png;base64,b2xk' }]]);
  const h = harness({ saved });
  await Promise.all([h.assets.prepare(scene('18:00'), {}), h.assets.prepare(scene('22:00'), {})]);
  const backgrounds = h.calls.filter(c => c.body.purpose === 'background');
  assert.equal(backgrounds.length, 2);
  for (const c of backgrounds) assert.deepEqual(c.body.referenceImages, ['data:image/png;base64,b2xk']);
  assert.equal(h.saved.get(locationAnchorKey('work', day.world)).url, 'data:image/png;base64,b2xk');
});
test('drawn shots need a current narration quote and a physically present focus', () => {
  const make = (source, selected = new Set([0])) => directionFor({ shot: 'close', focus: 'C0', artShot: 'eyes', shotEvidence: '서현은 결심을 굳히고 눈을 들었다.' }, [person], selected, '', source).artShot;
  assert.equal(make(scene().publicText).kind, 'eyes');
  assert.equal(make('“서현은 결심을 굳히고 눈을 들었다.”'), null);
  assert.equal(make(scene().publicText, new Set()), null);
  assert.equal(make('아직 아무 일도 없었다.'), null);
  assert.notEqual(shotAssetKey(scene(), { kind: 'hands', evidence: '검을 쥐었다' }, 'a', 'room'), shotAssetKey(scene(), { kind: 'hands', evidence: '편지를 쥐었다' }, 'a', 'room'));
});
test('shot opt-in routes through character provider at scene resolution, reuses art, hides duplicate cast', async () => {
  const sc = scene(), page = { start: 0, text: sc.publicText };
  const direction = { artShot: { kind: 'eyes', characterId: 'a', evidence: sc.publicText }, expressions: {} };
  const director = { prepare: async s => ({ ...s, direction }), view: s => ({ ...s, direction }), timeline: () => [{ start: 0, characters: [person], direction }] };
  let enabled = false;
  const h = harness({ getShotsEnabled: () => enabled, castDirector: director, getProvider: purpose => purpose === 'portrait' ? 'gemini' : 'openai', chooseMatte: async () => '#00ff00', removeMatte: async url => url });
  await h.assets.prepare(sc, page); assert.equal(h.calls.length, 2);
  enabled = true; await h.assets.prepare(sc, page);
  const shot = h.calls.at(-1); assert.equal(shot.url, '/api/gemini/image'); assert.equal(shot.body.purpose, 'scene'); assert.equal(shot.body.aspect, 'landscape');
  assert.deepEqual(h.assets.view(sc, page).eventCharacterIds, ['a']);
  await h.assets.prepare(sc, page); assert.equal(h.calls.length, 3);
  assert.equal(h.assets.view(sc, { start: 300 }).shotKind, '');
});
test('motion variants are opt-in, cached and not used when body framing drifts', async () => {
  let enabled = false; const h = harness({ getMotionEnabled: () => enabled,
    prepareMaskedEdit: async image => ({ image, mask: 'data:image/png;base64,bWFzaw==' }),
    finishMaskedEdit: async (_edit, url) => url });
  await h.assets.prepare(scene(), {}); assert.equal(h.calls.length, 2);
  enabled = true; await h.assets.prepare(scene(), {}); assert.equal(h.calls.length, 4);
  for (const { body } of h.calls.slice(2)) { assert.ok(body.maskImage); assert.equal(body.strictModel, true); }
  await h.assets.prepare(scene(), {}); assert.equal(h.calls.length, 4);
  const pixels = new Uint8ClampedArray(10 * 10 * 4).fill(150), same = pixels.slice();
  assert.equal(stableMotionPixels(pixels, same, 10, 10), true);
  for (let i = 5 * 10 * 4; i < same.length; i++) same[i] = 250;
  assert.equal(stableMotionPixels(pixels, same, 10, 10), false);
});

test('rejected masked art remains rejected after reload without another paid request', async () => {
  const options = { getMotionEnabled: () => true, prepareMaskedEdit: async image => ({ image, mask: 'mask' }), finishMaskedEdit: async () => { throw Error('alignment rejected'); } };
  const first = harness(options); await first.assets.prepare(scene(), {});
  assert.equal(first.calls.length, 4);
  assert.equal([...first.saved.values()].filter(row => row.rejected && !row.url).length, 2);
  const reload = harness({ ...options, saved: first.saved }); await reload.assets.prepare(scene(), {});
  assert.equal(reload.calls.length, 0);
  const google = harness({ ...options, getProvider: () => 'gemini', chooseMatte: async () => '#00ff00', removeMatte: async url => url });
  await google.assets.prepare(scene(), {}); assert.equal(google.calls.length, 2);
});
