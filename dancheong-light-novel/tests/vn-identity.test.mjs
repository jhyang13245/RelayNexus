import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolveEventAliases, labelOccurrences } from '../public/vn-identity.mjs';
import { captureScene, portraitKey } from '../public/vn-scene.mjs';
import { validateCast, createCastDirector, directIdentity } from '../public/vn-cast.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';

const html = readFileSync(new URL('../vendor/Cortex_v1.42.0.html', import.meta.url), 'utf8');
const marker = html.indexOf('/* Cortex v1.38.0 — compact rewind journal'), context = { structuredClone };
runInNewContext(html.slice(html.lastIndexOf('<script>', marker) + 8, html.indexOf('</script>', marker)), context);
const experience = context.CortexTurnExperience;
const person = (id = 'd', name = '김다윤') => ({ id, name, publicInfo: '첫 등장 뒤 공개: 학생.', publicProfile: '', source: { appearance: '갈색 눈의 금발 여학생.', images: [{ isPrimary: true, assetPath: `${id}.webp` }] } });
const fixture = () => ({ characters: [person()], runtime: { packageContract: { eventGraph: { nodes: { encounter: { id: 'encounter', participants: [{ characterId: 'd', publicName: '금발 여학생' }] } } } } }, world: { location: '복도', time: '12:00' }, scene: { presentCharacterIds: [] } });
const commit = (text, event = 'encounter') => ({ id: 'turn', sourceEventId: event, status: 'COMMITTED', text });
const capture = (sc, turn, priorTurns = []) => captureScene({ scope: 'synthetic:save', scenario: sc, turn, priorTurns, timeline: true, experience });
const decide = (evidence, identity = evidence, options = {}) => ({ beats: [{ beat: 'P0', speaker: 'C0', speakerLabel: '', speakerEvidence: '', onStage: [{ candidate: 'C0', evidence, identityEvidence: identity, identityStatus: 'confirmed', presence: 'physical', ...options }] }] });
const authored = sc => sc.runtime.packageContract.eventGraph.nodes.encounter;

test('uses exact structured authored character ID and public label without work-specific compatibility', () => {
  const sc = fixture(), snapshot = structuredClone(sc), text = '금발 여학생이 내 앞에 서서 말했다.';
  const scene = capture(sc, commit(text));
  assert.equal(scene.candidates[0].id, 'd');
  assert.equal(scene.candidates[0].name, '금발 여학생');
  assert.equal(scene.candidates[0].primaryAssetRef, 'd.webp');
  assert.equal(validateCast(scene, decide(text))[0].characters[0].id, 'd');
  assert.deepEqual(sc, snapshot);
});

test('reads explicit public-label syntax but never infers identity from a sole participant, gender, role or appearance', () => {
  const sc = fixture(), text = '금발 여학생이 내 앞에 섰다.';
  authored(sc).participants = '김다윤(공개 호칭: 금발 여학생)';
  assert.equal(capture(sc, commit(text)).candidates[0].id, 'd');
  for (const participants of ['김다윤', '김다윤(내부 연결용)', '김다윤, 금발 여학생', ['d'], [{ characterId: 'd' }]]) {
    authored(sc).participants = participants; authored(sc).description = '금발 여학생이 나타난다. 단 한 명의 여학생이 있다.';
    assert.equal(capture(sc, commit(text)).candidates.length, 0);
  }
});

test('affirmative published narrator identity learns an event-local alias and preserves the portrait identity', () => {
  const sc = fixture(); authored(sc).participants = [];
  const earlier = commit('금발 여학생은 김다윤이었다.');
  const now = commit('금발 여학생이 문을 열며 말했다.');
  const known = capture(sc, earlier), scene = capture(sc, now, [earlier]);
  assert.equal(scene.candidates[0].name, '김다윤');
  assert.ok(scene.candidates[0].aliases.includes('금발 여학생'));
  assert.equal(validateCast(scene, decide(now.text))[0].speakerId, 'd');
  assert.equal(portraitKey(scene.scope, scene.candidates[0]), portraitKey(known.scope, known.candidates[0]));
  const next = capture(sc, commit(now.text, 'elsewhere'), [earlier]);
  assert.ok(next.candidates.every(row => !row.aliases.includes('금발 여학생')));
});

test('explicit narrator introduction learns a label; a later identity cannot populate an earlier replay', () => {
  const sc = fixture(); authored(sc).participants = [];
  const before = commit('금발 여학생이 문을 열었다.');
  assert.equal(capture(sc, before).candidates.length, 0);
  const named = commit('김다윤이라는 이름의 금발 여학생이 책을 건넸다.');
  assert.ok(capture(sc, named, [before]).candidates[0].aliases.includes('금발 여학생'));
  assert.equal(capture(sc, before).candidates.length, 0);
});

test('an identity learned later in the same paragraph cannot attach a portrait to its earlier anonymous beat', () => {
  const sc = fixture(); authored(sc).participants = [];
  const first = '금발 여학생이 문을 열었다.', identity = '금발 여학생은 김다윤이었다.';
  const scene = capture(sc, commit(`${first}\n${identity}`));
  scene.castPages = [{ start: 0, text: first }, { start: 100, text: identity }];
  const value = decide(first); value.beats.push({ ...decide(identity).beats[0], beat: 'P100' });
  const timeline = validateCast(scene, value);
  assert.equal(timeline[0].characters.length, 0);
  assert.equal(timeline[0].speakerName, '');
  assert.equal(timeline[1].characters[0].id, 'd');
});

for (const [label, prose] of [
  ['spoken self-introduction', '“금발 여학생은 김다윤이었다.”'],
  ['negated identity', '금발 여학생은 김다윤이 아니었다.'],
  ['look-alike', '금발 여학생은 김다윤처럼 보였다.'],
  ['speculation', '금발 여학생은 김다윤일지도 모른다.'],
  ['remembered identity', '기억 속 금발 여학생은 김다윤이었다.'],
  ['recorded identity', '영상 속 금발 여학생은 김다윤이었다.'],
  ['same-paragraph correction', '금발 여학생은 김다윤이었다. 아니, 그것은 착각이었다.'],
  ['future identity', '내일 올 금발 여학생은 김다윤이었다.'],
]) test(`does not learn an alias from ${label}`, () => {
  const sc = fixture(); authored(sc).participants = [];
  assert.deepEqual(resolveEventAliases(sc, {}, [commit(prose)], experience), []);
});

test('a later public correction revokes an automatic association', () => {
  const sc = fixture(); authored(sc).participants = [];
  assert.deepEqual(resolveEventAliases(sc, {}, [commit('금발 여학생은 김다윤이었다.'), commit('금발 여학생의 신원은 착각이었다.')], experience), []);
});

test('same aliases, overlapping anonymous labels, unknown IDs and duplicate registered names fail closed', () => {
  const sc = fixture(); sc.characters.push(person('y', '윤설아'));
  authored(sc).participants.push({ characterId: 'y', publicName: '금발 여학생' });
  assert.equal(capture(sc, commit('금발 여학생이 말했다.')).candidates.length, 0);
  authored(sc).participants = [{ characterId: 'd', publicName: '여학생' }, { characterId: 'y', publicName: '금발 여학생' }];
  assert.equal(capture(sc, commit('여학생이 말했다.')).candidates.length, 0);
  authored(sc).participants = [{ characterId: 'missing', publicName: '금발 여학생' }];
  assert.equal(capture(sc, commit('금발 여학생이 말했다.')).candidates.length, 0);
  sc.characters[1].name = '김다윤'; authored(sc).participants = [{ characterName: '김다윤', publicName: '금발 여학생' }];
  assert.equal(capture(sc, commit('금발 여학생이 말했다.')).candidates.length, 0);
});

test('historical event bindings cannot borrow the active later event or leak across works', () => {
  const sc = fixture(); sc.event = { id: 'later', participants: [{ characterId: 'd', publicName: '교수' }] };
  assert.equal(capture(sc, commit('교수가 말했다.', 'earlier')).candidates.length, 0);
  delete sc.runtime.packageContract.eventGraph.nodes.encounter;
  assert.equal(capture(sc, commit('금발 여학생이 말했다.')).candidates.length, 0);
});

test('appearance aliases do not bypass an explicit secret or conditional disclosure gate', () => {
  for (const rule of [{ secret: true }, { visibility: 'private' }, { preRevealAlias: '가면의 소녀' }, { revealCondition: '신원 공개 사건' }]) {
    const sc = fixture(); Object.assign(sc.characters[0].source, rule);
    assert.equal(capture(sc, commit('금발 여학생이 말했다.')).candidates.length, 0);
  }
});

test('proper-name boundaries and exact speaker labels prevent substring identity collisions', () => {
  assert.equal(labelOccurrences('민서연이 말했다.', '민서').length, 0);
  assert.equal(directIdentity({ name: '민서' }, '민서연이 말했다.'), false);
  const scene = { publicText: '민서연이 말했다.', candidates: [{ id: 'm', name: '민서' }] };
  assert.equal(validateCast(scene, decide(scene.publicText))[0].characters.length, 0);
});

for (const text of ['전화 너머에서 금발 여학생이 말했다.', '사진 속 금발 여학생이 웃었다.', '기억 속 금발 여학생이 말했다.', '내일 금발 여학생이 올 것이다.', '다른 금발 여학생이 말했다.']) {
  test(`withholds a mistaken director match: ${text}`, () => {
    const scene = capture(fixture(), commit(text));
    assert.equal(validateCast(scene, decide(text))[0].characters.length, 0);
  });
}

test('cropping a negation, other-person modifier or remote context out of the evidence does not evade validation', () => {
  for (const text of ['전화 너머에서 금발 여학생이 말했다.', '다른 금발 여학생이 말했다.']) {
    const scene = capture(fixture(), commit(text));
    assert.equal(validateCast(scene, decide('금발 여학생이 말했다.'))[0].characters.length, 0);
  }
});

test('uncertain and remote classifications do not fall back to the cached named portrait', async () => {
  const sc = capture(fixture(), commit('금발 여학생이 말했다.'));
  for (const options of [{ identityStatus: 'uncertain' }, { presence: 'remote' }, { identityStatus: undefined, presence: undefined }]) {
    const raw = decide(sc.publicText, sc.publicText, options), requests = [];
    const castDirector = createCastDirector({ getConnection: () => ({ key: 'fixture', endpoint: '/cast', model: 'fixture' }), read: async () => null, write: async () => {}, fetchDecision: async () => Response.json({ output_text: JSON.stringify(raw) }) });
    const assets = createStageAssets({ castDirector, getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], onChange() {}, read: async key => key.includes('portrait') ? { key, url: 'data:image/png;base64,b2xk' } : null, write: async () => {}, fetchImage: async (_url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ imageUrl: 'data:image/png;base64,Ymc=' }); } });
    await assets.prepare(sc, { start: 0 });
    assert.equal(assets.view(sc, { start: 0 }).portraits.length, 0);
    assert.ok(!requests.some(row => row.purpose === 'portrait'));
  }
});

test('later arrival cannot establish an earlier cast, even with a verbatim future quote', () => {
  const first = '방에는 빗소리만 들렸다.', arrival = '민서가 문을 열고 들어왔다.';
  const scene = { publicText: `${first}\n${arrival}`, candidates: [{ id: 'm', name: '민서' }], castPages: [{ start: 0, text: first }, { start: 100, text: arrival }] };
  const value = decide(arrival); value.beats.push({ ...value.beats[0], beat: 'P100' });
  const timeline = validateCast(scene, value);
  assert.equal(timeline[0].characters.length, 0);
  assert.equal(timeline[1].characters[0].id, 'm');
});
