import test from 'node:test';
import assert from 'node:assert/strict';
import { castKey, castRequest, createCastDirector, validateCast } from '../public/vn-cast.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
import { portraitKey } from '../public/vn-scene.mjs';

const han = { id: 'missing-grandmother', name: '한명진', referenceMode: 'PRIMARY', primaryAssetRef: 'han.webp', publicProfile: 'PUBLIC PROFILE', hiddenInfo: 'DO NOT SEND' };
const nadia = { id: 'visitor', name: '나디아', referenceMode: 'PRIMARY', primaryAssetRef: 'nadia.webp' };
const body = '한명진이 살던 집. 실종된 지 일 년이었다. 나디아가 내 앞에 섰다. “안녕하세요.” 나디아가 말했다. 이후 나디아는 문밖으로 나갔다.';
const scene = () => ({ scope: 'synthetic-fate', environmentKey: 'house', world: { location: '서촌', time: '12:00' }, publicText: body, candidates: [han, nadia], characters: [han],
  castPages: [{ start: 0, text: '한명진이 살던 집.' }, { start: 40, text: '“안녕하세요.”' }, { start: 60, text: '이후 나디아는 문밖으로 나갔다.' }] });
const decision = () => ({ beats: [
  { beat: 'P0', speaker: '', onStage: [] },
  { beat: 'P40', speaker: 'C1', onStage: [{ candidate: 'C1', evidence: '나디아가 내 앞에 섰다.' }] },
  { beat: 'P60', speaker: '', onStage: [] },
] });
const response = value => new Response(JSON.stringify({ output_text: JSON.stringify(value) }));
function director(options = {}) {
  return createCastDirector({ getConnection: () => ({ key: 'synthetic-key', endpoint: '/api/openai/responses', model: 'gpt-5.6-luna' }), read: async () => null, write: async () => {}, fetchDecision: async () => response(decision()), ...options });
}

test('request contains published names and beats, never private biography or asset data; Muse uses JSON prompt upfront', () => {
  const request = castRequest(scene(), 'gpt-5.6-luna');
  assert.ok(request.text.format.schema);
  assert.ok(!request.input.includes('DO NOT SEND'));
  assert.ok(!request.input.includes('han.webp'));
  assert.ok(!request.input.includes('PUBLIC PROFILE'));
  assert.ok(!request.input.includes('missing-grandmother'));
  assert.equal(castRequest(scene(), 'muse-spark-1.3-contributor').text, undefined);
});

test('timeline validates each beat and keeps a current speaker even when she later leaves', () => {
  const beats = validateCast(scene(), decision());
  assert.deepEqual(beats.map(beat => beat.characters.map(person => person.id)), [[], ['visitor'], []]);
  assert.equal(beats[1].speakerId, 'visitor');
});

test('missing beats, forged evidence, unknown handles and absent speakers fail closed', () => {
  for (const change of [
    value => value.beats.pop(),
    value => value.beats[1].onStage[0].evidence = 'invented evidence',
    value => value.beats[1].onStage[0].candidate = 'C9',
    value => value.beats[1].speaker = 'C0',
    value => value.beats[1].beat = 'P999',
  ]) { const value = decision(); change(value); assert.throws(() => validateCast(scene(), value)); }
});

test('concurrent pages share one decision request and each receives its own stage cast', async () => {
  let calls = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const cast = director({ fetchDecision: async () => { calls++; await wait; return response(decision()); } });
  const sc = scene();
  const first = cast.prepare(sc, { page: sc.castPages[0] });
  const second = cast.prepare(sc, { page: sc.castPages[1] });
  assert.deepEqual(cast.view(sc, sc.castPages[1]).characters, [], 'old cached metadata cannot draw before the check');
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1); assert.deepEqual(a.characters, []); assert.equal(b.characters[0].id, 'visitor');
});

test('persisted decisions are reused after reload; a changed passage gets a new key', async () => {
  const records = new Map(); let calls = 0;
  const options = { read: async key => records.get(key), write: async row => records.set(row.key, row), fetchDecision: async () => { calls++; return response(decision()); } };
  await director(options).prepare(scene()); await director(options).prepare(scene());
  assert.equal(calls, 1);
  assert.notEqual(castKey(scene()), castKey({ ...scene(), publicText: body + '변경.' }));
});

test('an unfinished published paragraph never calls a model, and failure never retries on page changes', async () => {
  let calls = 0;
  const cast = director({ fetchDecision: async () => { calls++; throw new Error('offline'); } });
  await cast.prepare({ ...scene(), castPending: true }); assert.equal(calls, 0);
  await cast.prepare(scene()); await cast.prepare(scene(), { page: { start: 40 } });
  assert.equal(calls, 1); assert.equal(cast.view(scene()).castStatus, 'error'); assert.deepEqual(cast.view(scene()).characters, []);
  cast.retry(scene()); await cast.prepare(scene()); assert.equal(calls, 2);
});

test('cached Han portrait is never loaded or generated after exclusion; Nadia appears at her dialogue and disappears at departure', async () => {
  const sc = scene(), records = new Map([[portraitKey(sc.scope, han), { key: portraitKey(sc.scope, han), url: 'data:image/png;base64,b2xkLWdob3N0' }]]);
  const reads = [], images = [];
  const assets = createStageAssets({ castDirector: director(), getKey: () => 'synthetic-image-key', getQuality: () => 'low', getReferences: () => [], onChange: () => {}, onError: error => { throw new Error(error); },
    read: async key => { reads.push(key); return records.get(key); }, write: async row => records.set(row.key, row),
    fetchImage: async (_url, init) => { images.push(JSON.parse(init.body)); return new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,bmFkaWE=' })); },
  });
  assert.deepEqual(assets.view(sc, sc.castPages[0]).portraits, []);
  await Promise.all(sc.castPages.map(page => assets.prepare(sc, page)));
  assert.ok(!reads.includes(portraitKey(sc.scope, han)));
  assert.ok(!images.some(request => request.purpose === 'portrait' && request.prompt.includes('한명진')));
  assert.equal(images.filter(request => request.purpose === 'portrait').length, 1);
  assert.deepEqual(assets.view(sc, sc.castPages[0]).portraits, []);
  assert.equal(assets.view(sc, sc.castPages[1]).portraits[0]?.id, 'visitor');
  assert.deepEqual(assets.view(sc, sc.castPages[2]).portraits, []);
});

test('legacy scenes preserve their candidate set after a resolved view is passed back in', async () => {
  const sc = scene(); sc.characters = sc.candidates; delete sc.candidates;
  const cast = director(), first = await cast.prepare(sc, { page: sc.castPages[1] });
  assert.equal(castKey(sc), castKey(first));
  assert.deepEqual(cast.view(first, sc.castPages[0]).characters, []);
});
