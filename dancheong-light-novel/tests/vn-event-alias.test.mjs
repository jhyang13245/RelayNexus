import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureScene, portraitKey, stageCast } from '../public/vn-scene.mjs';
import { castRequest, validateCast } from '../public/vn-cast.mjs';
import { loadWorkPresentation } from '../public/vn-public-cast.mjs';

const html = readFileSync(new URL('../vendor/Cortex_v1.42.0.html', import.meta.url), 'utf8');
const marker = html.indexOf('/* Cortex v1.38.0 — compact rewind journal');
const context = { structuredClone };
runInNewContext(html.slice(html.lastIndexOf('<script>', marker) + 8, html.indexOf('</script>', marker)), context);
const experience = context.CortexTurnExperience;
const person = () => ({ id: 'stranger', name: '숨겨진 등록명', publicProfile: '', source: {
  publicInfo: '첫 등장 뒤 공개: 연구자.', appearance: '키 190cm, 검은 코트와 짙은 흑발.',
  hiddenInfo: 'HIDDEN RELATIONSHIP', images: [{ isPrimary: true, assetPath: 'stranger.webp' }],
} });
const fixture = () => ({ runtime: {}, world: { location: '관리동', time: '08:00' },
  protagonist: { id: 'hero', name: '주인공' }, scene: { presentCharacterIds: ['hero'] },
  characters: [person()], presentation: { eventPublicAliases: [{ characterId: 'stranger',
    eventIds: ['arrival', 'conversation'], name: '정체불명의 남자', aliases: ['능선의 남자', '남자'] }] } });
const commit = (text, sourceEventId = 'conversation') => ({ id: 't1', sourceEventId, status: 'COMMITTED', text });
const capture = (scenario, turn, priorTurns = [], scope = 'any-work:save') => {
  const scene = captureScene({ scope, scenario, turn, priorTurns, experience, timeline: true });
  return { ...scene, candidates: scene.candidates.filter(row => row.id !== scene.protagonistId) };
};
const decision = quote => ({ beats: [{ beat: 'P0', speaker: 'C0', speakerLabel: '남자', speakerEvidence: quote,
  onStage: [{ candidate: 'C0', evidence: quote, identityEvidence: quote, identityStatus: 'confirmed', presence: 'physical' }] }] });

test('event-authored anonymous identity releases its own portrait but not the private name or relationship', () => {
  const sc = fixture(), before = structuredClone(sc), quote = '능선의 남자가 검 앞에서 말했다.';
  const scene = capture(sc, commit(`${quote} “내가 막았소.”`));
  const target = scene.candidates.find(row => row.id === 'stranger');
  assert.equal(target.referenceMode, 'PRIMARY');
  assert.equal(target.name, '정체불명의 남자');
  assert.equal(target.primaryAssetRef, 'stranger.webp');
  assert.match(target.publicAppearance, /190cm/);
  assert.ok(!JSON.stringify(castRequest(scene, 'test')).includes('숨겨진 등록명'));
  assert.ok(!JSON.stringify(scene).includes('HIDDEN RELATIONSHIP'));
  const directed = validateCast({ ...scene, candidates: [target] }, decision(quote))[0];
  assert.equal(directed.speakerId, 'stranger');
  assert.equal(directed.speakerName, '남자');
  assert.equal(stageCast(directed)[0].primaryAssetRef, 'stranger.webp');
  assert.deepEqual(sc, before, 'canonical disclosure and scenario remain untouched');
  const revealed = capture(sc, commit('숨겨진 등록명이 문 앞에 섰다.', 'later'));
  assert.equal(portraitKey(scene.scope, target), portraitKey(scene.scope, revealed.candidates[0]), 'same paid portrait after naming');
});

test('generic anonymous names do not carry into unrelated events or earlier replay', () => {
  const sc = fixture(); sc.event = { id: 'conversation' };
  const quote = '남자가 문 앞에서 말했다.';
  assert.equal(capture(sc, commit(quote, 'unrelated')).candidates.length, 0);
  assert.equal(capture(sc, commit(quote, '')).candidates.length, 0);
  const scene = capture(sc, commit('빗소리만 들렸다.'), [commit(quote, 'unrelated')]);
  assert.equal(validateCast(scene, decision(quote))[0].characters.length, 0, 'older unrelated man is not identity evidence');
});

test('event aliases preserve explicit secret, conditional and pre-reveal media gates', () => {
  for (const restriction of [{ secret: true }, { preRevealAlias: '가면의 인물' }, { revealCondition: '밀실 사건 뒤' }, { visibility: 'private' }]) {
    const sc = fixture(); Object.assign(sc.characters[0].source, restriction);
    assert.equal(capture(sc, commit('남자가 문 앞에서 말했다.')).candidates.length, 0);
  }
});

test('conflicting event bindings cannot assign the same anonymous role to multiple identities', () => {
  const sc = fixture(); sc.characters.push({ ...person(), id: 'other' });
  sc.presentation.eventPublicAliases.push({ characterId: 'other', eventIds: ['conversation'], name: '다른 남자', aliases: ['남자'] });
  assert.equal(capture(sc, commit('남자가 문 앞에서 말했다.')).candidates.length, 0);
});

test('Fate compatibility data connects the anonymous lightning user only in authored encounter events', async () => {
  await loadWorkPresentation(async () => Response.json(JSON.parse(readFileSync(new URL('../public/work-presentation.json', import.meta.url), 'utf8'))));
  const sc = fixture(); delete sc.presentation;
  sc.characters[0].id = 'NPC_SERVANT_ARCHER_TESLA'; sc.characters[0].name = '아처 · 뇌전기장';
  const text = '능선의 남자가 검 앞에서 말했다. “내가 막았소.”';
  for (const event of ['EV_ACT1_HISHIRI_05_FAKE_LIGHTNING', 'EV_ACT1_HISHIRI_06_LIGHTNING_USER', 'EV_ACT1_HISHIRI_07_STRANGERS', 'EV_ACT1_HISHIRI_08_SECOND_MIMIC']) {
    assert.equal(capture(sc, commit(text, event), [], 'fate-seoul:save').candidates[0]?.name, '정체불명의 남자');
  }
  assert.equal(capture(sc, commit(text, 'EV_ACT1_HISHIRI_09_UNANSWERED'), [], 'fate-seoul:save').candidates.length, 0);
  assert.equal(capture(sc, commit(text, 'EV_ACT1_HISHIRI_07_STRANGERS')).candidates.length, 0);
});
