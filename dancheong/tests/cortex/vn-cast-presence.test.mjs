// Ported standalone regression fixtures; synthetic identities only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { castKey, castRequest, createCastDirector, validateCast } from '../../public/vn-runtime/vn-cast.mjs';
import { createStageAssets } from '../../public/vn-runtime/vn-assets.mjs';
import { portraitKey } from '../../public/vn-runtime/vn-scene.mjs';

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
  assert.ok(request.input.includes('PUBLIC PROFILE'));
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

test('an unregistered professor cannot borrow the missing grandmother identity or cached portrait', async () => {
  const text = '교수가 학생들을 바라보며 말했다. “오늘 토론은 여기까지 하겠습니다.”';
  const sc = { ...scene(), previousText: '한명진은 일 년 전 실종된 외할머니였다.', publicText: text,
    castPages: [{ start: 0, text }], candidates: [{ ...han, publicProfile: '고문서 복원가인 외할머니. 1년 전 실종되었다.' }] };
  const bad = { beats: [{ beat: 'P0', speaker: 'C0', speakerLabel: '교수', speakerEvidence: '교수가 학생들을 바라보며 말했다.',
    onStage: [{ candidate: 'C0', evidence: '교수가 학생들을 바라보며 말했다.', identityEvidence: sc.previousText }] }] };
  const beat = validateCast(sc, bad)[0];
  assert.deepEqual(beat.characters, []); assert.equal(beat.speakerId, ''); assert.equal(beat.speakerName, '교수');
  const requests = [], reads = [];
  const assets = createStageAssets({ castDirector: director({ fetchDecision: async () => response(bad) }), getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], onChange() {},
    read: async key => { reads.push(key); return null; }, write: async () => {}, fetchImage: async (_url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ imageUrl: 'data:image/png;base64,Ymc=' }); } });
  await assets.prepare(sc, sc.castPages[0]);
  assert.equal(assets.view(sc, sc.castPages[0]).speakerName, '교수');
  assert.deepEqual(requests.map(row => row.purpose), ['background']);
  assert.ok(!reads.includes(portraitKey(sc.scope, han)));
  assert.ok(castRequest(sc, 'gpt-5.6-luna').input.includes('고문서 복원가인 외할머니'));
});

test('identity must be named outside quotation; a missing person can return in current prose', () => {
  const sc = { ...scene(), candidates: [han], castPages: [{ start: 0, text: '“한명진을 찾고 있어.”' }], publicText: '“한명진을 찾고 있어.”' };
  const value = { beats: [{ beat: 'P0', speaker: 'C0', onStage: [{ candidate: 'C0', evidence: sc.publicText, identityEvidence: sc.publicText }] }] };
  assert.deepEqual(validateCast(sc, value)[0].characters, []);
  sc.publicText = '한명진이 돌아와 내 앞에 섰다. “오랜만이구나.”'; sc.castPages[0].text = sc.publicText;
  value.beats[0].onStage[0] = { candidate: 'C0', evidence: sc.publicText, identityEvidence: '한명진이 돌아와 내 앞에 섰다.' };
  assert.equal(validateCast(sc, value)[0].speakerId, han.id);
});

test('another person’s named action cannot supply presence for an earlier identified character', () => {
  const text = '나디아는 창문을 살폈다. “흔적이 있어요.”';
  const prior = '한명진이 복도에 들어왔다.';
  const sc = { ...scene(), previousText: prior, publicText: text, castPages: [{ start: 0, text }] };
  const value = { beats: [{ beat: 'P0', speaker: 'C0', onStage: [{ candidate: 'C0', evidence: '나디아는 창문을 살폈다.', identityEvidence: prior }] }] };
  assert.deepEqual(validateCast(sc, value)[0].characters, []);
  value.beats[0].speaker = 'C1';
  value.beats[0].onStage = [{ candidate: 'C1', evidence: '나디아는 창문을 살폈다.', identityEvidence: '나디아는 창문을 살폈다.' }];
  assert.equal(validateCast(sc, value)[0].speakerId, nadia.id);
  sc.publicText = '그녀는 창문을 살폈다. “흔적이 있어요.”'; sc.castPages[0].text = sc.publicText;
  value.beats[0].speaker = 'C0';
  value.beats[0].onStage = [{ candidate: 'C0', evidence: '그녀는 창문을 살폈다.', identityEvidence: prior }];
  assert.equal(validateCast(sc, value)[0].speakerId, han.id, 'uncontradicted pronoun continuity still works');
});

test('quote-only cached presence keeps an immediately verified sprite during speech, without guessing its speaker', () => {
  const text = '나디아가 창문 앞에 섰다. “흔적이 있어요.” 나디아는 고개를 끄덕였다.';
  const sc = { ...scene(), publicText: text, candidates: [nadia], previousText: '', castPages: [
    { start: 0, text: '나디아가 창문 앞에 섰다.' }, { start: 16, text: '“흔적이 있어요.”', quoted: true }, { start: 28, text: '나디아는 고개를 끄덕였다.' },
  ] };
  const entry = evidence => ({ candidate: 'C0', evidence, identityEvidence: '나디아가 창문 앞에 섰다.', identityStatus: 'confirmed', presence: 'physical' });
  const value = { beats: [
    { beat: 'P0', speaker: '', onStage: [entry(sc.castPages[0].text)] },
    { beat: 'P16', speaker: 'C0', speakerLabel: '나디아', speakerEvidence: sc.castPages[0].text, onStage: [entry(sc.castPages[1].text)] },
    { beat: 'P28', speaker: '', onStage: [entry(sc.castPages[2].text)] },
  ] };
  const validated = validateCast(sc, value);
  assert.deepEqual(validated.map(row => row.characters.map(person => person.id)), [[nadia.id], [nadia.id], [nadia.id]]);
  assert.equal(validated[1].speakerId, nadia.id);
  value.beats[1].speakerEvidence = '나디아는 창문 앞에 섰다.'; // not a verbatim source
  const ungrounded = validateCast(sc, value)[1];
  assert.equal(ungrounded.characters[0].id, nadia.id, 'keep the verified person visible');
  assert.equal(ungrounded.speakerId, '', 'a repaired sprite does not turn forged attribution into a voice identity');
  assert.equal(ungrounded.speakerName, '');
  for (const patch of [{ presence: 'remote' }, { identityStatus: 'uncertain' }]) {
    value.beats[1].onStage = [{ ...entry(sc.castPages[1].text), ...patch }];
    assert.deepEqual(validateCast(sc, value)[1].characters, []);
  }
  value.beats[1].onStage = [entry(sc.castPages[1].text)];
  value.beats[0].onStage = [];
  assert.deepEqual(validateCast(sc, value)[1].characters, [], 'a quote cannot introduce an absent person from an identity anchor');
});

test('quote-only presence cannot restore someone after an intervening verified absence', () => {
  const text = '나디아가 문 앞에 섰다. 나디아는 문밖으로 떠났다. “나디아가 오면 전해 줘.”';
  const sc = { ...scene(), publicText: text, candidates: [nadia], previousText: '', castPages: [
    { start: 0, text: '나디아가 문 앞에 섰다.' }, { start: 15, text: '나디아는 문밖으로 떠났다.' }, { start: 31, text: '“나디아가 오면 전해 줘.”', quoted: true },
  ] };
  const first = sc.castPages[0].text;
  const value = { beats: [
    { beat: 'P0', speaker: '', onStage: [{ candidate: 'C0', evidence: first, identityEvidence: first }] },
    { beat: 'P15', speaker: '', onStage: [] },
    { beat: 'P31', speaker: 'C0', onStage: [{ candidate: 'C0', evidence: sc.castPages[2].text, identityEvidence: first, identityStatus: 'confirmed', presence: 'physical' }] },
  ] };
  assert.deepEqual(validateCast(sc, value)[2].characters, []);
});

test('old name-only cast decisions are rechecked without clearing image records', async () => {
  let calls = 0;
  const cast = director({ read: async () => ({ policy: 'PUBLIC_CAST_DIRECTION_V4', decision: decision() }), fetchDecision: async () => { calls++; return response(decision()); } });
  await cast.prepare(scene()); await cast.prepare(scene()); assert.equal(calls, 1);
});

test('switching works while cast preparation is pending prevents subsequent image and reference requests', async () => {
  let active = true, release, images = 0, references = 0;
  const wait = new Promise(resolve => release = resolve);
  const assets = createStageAssets({ castDirector: director({ fetchDecision: async () => { await wait; return response(decision()); } }),
    getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => { references++; return []; }, onChange() {}, read: async () => null, write: async () => {}, fetchImage: async () => { images++; return Response.json({ imageUrl: 'fixture' }); } });
  const pending = assets.prepare(scene(), scene().castPages[1], { active: () => active }); active = false; release(); await pending;
  assert.equal(images, 0); assert.equal(references, 0);
});
