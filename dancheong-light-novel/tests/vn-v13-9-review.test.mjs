import test from 'node:test';
import assert from 'node:assert/strict';
import { createCastDirector, validateCast, directIdentity, vocativeIdentity, identityAnchors, castKey } from '../public/vn-cast.mjs';
import { createStageAssets, expressionPrompt } from '../public/vn-assets.mjs';
import { createPreparationQueue, prepareAhead, preparationTier, resolvedSpeaker } from '../public/vn-stage-timing.mjs';
import { portraitKey } from '../public/vn-scene.mjs';

// 1. Lookahead: cast for the whole turn, images near the reader, CG on arrival.
test('prefetch generates images only near the reader, CG only for the current paragraph, at most 2 at once', async () => {
  const people = [1, 2, 3, 4, 5, 6].map(i => ({ id: `p${i}`, name: `인물${i}`, referenceMode: 'PRIMARY', primaryAssetRef: `p${i}.webp` }));
  const units = people.map((person, i) => ({ scope: 'probe', environmentKey: 'room', world: { location: '방', time: '12:00' }, publicText: `${person.name}이 방에 들어왔다. “왔어.”`, previousText: '', candidates: [person],
    castPages: [{ start: i * 100, text: `${person.name}이 방에 들어왔다.` }, { start: i * 100 + 20, text: '“왔어.”' }] }));
  const decisionFor = scene => ({ beats: scene.castPages.map((page, b) => ({ beat: `P${page.start}`, speaker: b ? 'C0' : '', speakerLabel: b ? scene.candidates[0].name : '', speakerEvidence: b ? scene.castPages[0].text : '',
    onStage: [{ candidate: 'C0', evidence: scene.castPages[0].text, identityEvidence: scene.castPages[0].text }],
    expressions: [{ candidate: 'C0', expression: 'smile', evidence: scene.castPages[0].text }], focus: 'C0', shot: 'medium', transition: 'none', fx: 'none', mood: 'normal', cg: b === 1 })) });
  let casts = 0, inFlight = 0, peak = 0; const calls = [];
  const cast = createCastDirector({ getConnection: () => ({ key: 'k', endpoint: '/x', model: 'gpt-5.6-luna' }), read: async () => null, write: async () => {},
    fetchDecision: async (_u, init) => { casts++; const input = JSON.parse(JSON.parse(init.body).input); return new Response(JSON.stringify({ output_text: JSON.stringify(decisionFor(units.find(u => u.publicText === input.current))) })); } });
  const assets = createStageAssets({ castDirector: cast, getKey: () => 'img', getQuality: () => 'low', getReferences: () => [], getCgEnabled: () => true, onChange: () => {}, onError: () => {},
    read: async () => null, write: async () => {}, maxConcurrent: 2,
    fetchImage: async (_u, init) => { calls.push(JSON.parse(init.body).purpose); inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 20)); inFlight--; return new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,eA==' })); } });
  const queue = createPreparationQueue({ concurrency: 3 }), done = [];
  await new Promise(resolve => {
    let pending = units.length;
    units.forEach((scene, index) => queue.add(`u${index}`, async current => {
      const { completion } = await prepareAhead({ scene, pages: scene.castPages, castDirector: cast, assets, active: current, generate: true, preload: async () => {}, tier: preparationTier(index) });
      done.push(completion); if (--pending === 0) resolve();
    }));
  });
  await Promise.all(done);
  const count = purpose => calls.filter(row => row === purpose).length;
  assert.equal(casts, 6, 'every published paragraph gets its cast check');
  assert.equal(count('portrait'), 3, 'sprites only for the reader paragraph and the next two');
  assert.equal(count('scene'), 1, 'event CG only for the paragraph being read');
  assert.ok(peak <= 2, `image requests were capped (peak ${peak})`);
});

test('preparation tiers', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(index => preparationTier(index)), ['current', 'images', 'images', 'cast', 'cast']);
});

// 2. Identity: indirect words only disqualify the occurrence they describe.
const nadia = { id: 'nadia', name: '나디아', referenceMode: 'PRIMARY', publicProfile: '방문 연구자' };
function decide(current, previous, identityEvidence, presence = identityEvidence, label = '나디아') {
  const scene = { scope: 's', publicText: current, previousText: previous, candidates: [nadia], castPages: [{ start: 0, text: current }] };
  return validateCast(scene, { beats: [{ beat: 'P0', speaker: 'C0', speakerLabel: label, speakerEvidence: identityEvidence, onStage: [{ candidate: 'C0', evidence: presence, identityEvidence }], expressions: [], focus: 'C0', shot: 'medium', transition: 'none', fx: 'none', mood: 'normal', cg: false }] })[0];
}

test('a present person who recalls something, or stands in "내가 살던 동네", stays on stage', () => {
  for (const text of ['나디아가 문을 열고 들어오며 그날의 기억을 떠올렸다.', '내가 살던 동네 골목에서 나디아가 손을 흔들었다.', '나디아는 그 일을 기억했다.']) {
    assert.ok(directIdentity(nadia, text), text);
    const row = decide(`${text} “왔어요.”`, '', text);
    assert.deepEqual(row.characters.map(person => person.id), ['nadia'], text);
    assert.equal(row.speakerName, '나디아');
  }
});

test('photos, recollections and absences of the person still do not identify them', () => {
  for (const text of ['사진 속 나디아가 웃고 있었다.', '나디아를 떠올렸다.', '나디아가 살던 집이었다.', '나디아가 남긴 편지를 읽었다.', '실종된 나디아의 방이었다.']) assert.equal(directIdentity(nadia, text), false, text);
});

test('direct address in dialogue identifies the person spoken to', () => {
  assert.ok(vocativeIdentity(nadia, '“나디아, 여기야.”'));
  assert.ok(vocativeIdentity(nadia, '“나디아 씨!”'));
  assert.equal(vocativeIdentity(nadia, '“나디아는 여기 없어.”'), false);
  const text = '“나디아, 여기야.” 내가 부르자 그녀가 돌아보았다.';
  assert.deepEqual(decide(text, '', text).characters.map(person => person.id), ['nadia']);
});

test('a name pushed beyond the 3600-character window is anchored, without changing keys that need no anchor', () => {
  const long = '나디아가 자리에 앉았다.\n' + '그녀는 창밖을 보았다. 비는 그치지 않았다. '.repeat(160);
  const scene = { scope: 's', publicText: '그녀가 고개를 들었다.', previousText: long, candidates: [nadia], castPages: [{ start: 0, text: '그녀가 고개를 들었다.' }] };
  assert.deepEqual(identityAnchors(scene), [{ candidate: 'C0', text: '나디아가 자리에 앉았다.' }]);
  assert.deepEqual(decide('그녀가 고개를 들었다. “이제 가요.”', long, '나디아가 자리에 앉았다.', '그녀가 고개를 들었다.').characters.map(person => person.id), ['nadia']);
  const short = { ...scene, previousText: '나디아가 자리에 앉았다.' };
  assert.deepEqual(identityAnchors(short), []);
  assert.equal(JSON.parse(castKey(short)).length, 6, 'no anchor → the v13.8 key shape, so paid decisions stay valid');
});

test('label and sprite follow one rule: an unverified candidate name is not shown; a generic role is', () => {
  const photo = decide('사진 속 나디아가 웃고 있었다. “안녕.”', '', '사진 속 나디아가 웃고 있었다.');
  assert.deepEqual(photo.characters, []); assert.equal(photo.speakerName, '');
  const scene = { scope: 's', publicText: '교수가 말했다. “앉게.”', previousText: '', candidates: [nadia], castPages: [{ start: 0, text: '“앉게.”' }] };
  const row = validateCast(scene, { beats: [{ beat: 'P0', speaker: '', speakerLabel: '교수', speakerEvidence: '교수가 말했다.', onStage: [], expressions: [], focus: '', shot: 'medium', transition: 'none', fx: 'none', mood: 'normal', cg: false }] })[0];
  assert.equal(row.speakerName, '교수');
});

// 3. The emotion bucket is part of the drawing request.
test('expression prompt requires the bucket emotion; comparison prompts without one are unchanged', () => {
  const prompt = expressionPrompt({ person: { name: '나디아' }, context: { current: '그녀는 쓴웃음을 지었다.' }, expression: 'smile' });
  assert.match(prompt, /Required emotion: .*warm, genuine smile/u);
  assert.doesNotMatch(prompt, /choose an appropriate, believable expression yourself/u);
  assert.match(expressionPrompt({ person: { name: '나디아' }, context: { current: 'x' } }), /choose an appropriate, believable expression yourself/u);
});

test('old unconstrained story expressions are shown only as a fallback while the constrained one is made', async () => {
  const sc = { scope: 'e', environmentKey: 'room', world: { location: '방', time: '12:00' }, candidates: [nadia], characters: [nadia],
    expressions: [{ offset: 0, characterId: 'nadia', expression: 'smile' }], castPages: [{ start: 0, text: '나디아가 웃었다.' }] };
  const legacyKey = JSON.stringify(['vn-story-expression-1', portraitKey('e', nadia, 'smile')]);
  const records = new Map([[portraitKey('e', nadia), { url: 'data:image/png;base64,bmV1dHJhbA==' }], [legacyKey, { url: 'data:image/png;base64,b2xk' }]]);
  const requests = [];
  const assets = createStageAssets({ getKey: () => 'img', getQuality: () => 'low', getReferences: () => [], onChange: () => {}, onError: () => {},
    read: async key => records.get(key), write: async row => records.set(row.key, row),
    fetchImage: async (_u, init) => { requests.push(JSON.parse(init.body)); return new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,bmV3' })); } });
  await assets.prepare(sc, sc.castPages[0], { generate: false });
  const before = assets.view(sc, sc.castPages[0]).portraits[0];
  assert.equal(before.url, 'data:image/png;base64,b2xk'); assert.equal(before.expressionReady, true);
  await assets.prepare(sc, sc.castPages[0]);
  const edits = requests.filter(row => row.purpose === 'expression');
  assert.equal(edits.length, 1); assert.match(edits[0].prompt, /Required emotion/u);
  assert.equal(assets.view(sc, sc.castPages[0]).portraits[0].url, 'data:image/png;base64,bmV3');
});

// 4-5. Speaker fallback while the cast check is unavailable.
test('writer annotation is a tentative speaker only when the cast check cannot run', () => {
  const page = { quoted: true, kind: 'dialogue', text: '안녕', rawText: '“안녕”', speaker: '나디아', characterId: 'nadia' };
  for (const castStatus of ['error', 'needs-key']) {
    const row = resolvedSpeaker(page, { castStatus });
    assert.equal(row.speaker, '나디아'); assert.equal(row.speakerTentative, true); assert.equal(row.characterId, '', 'never binds a sprite'); assert.equal(row.speakerResolved, true);
  }
  assert.equal(resolvedSpeaker(page, { castStatus: 'checking' }).speaker, '', 'no guess while the check is running');
  const verified = resolvedSpeaker(page, { castStatus: 'ready', speakerName: '류진', speakerId: 'ryu' });
  assert.equal(verified.speaker, '류진'); assert.equal(verified.speakerTentative, false);
});
