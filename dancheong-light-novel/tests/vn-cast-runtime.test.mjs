import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureScene } from '../public/vn-scene.mjs';
import { portraitKey } from '../public/vn-scene.mjs';
import { validateCast, castRequest } from '../public/vn-cast.mjs';
import { loadWorkPresentation } from '../public/vn-public-cast.mjs';
await loadWorkPresentation(async () => Response.json(JSON.parse(readFileSync(new URL('../public/work-presentation.json', import.meta.url), 'utf8'))));

const html = readFileSync(new URL('../vendor/Cortex_v1.42.0.html', import.meta.url), 'utf8');
const marker = html.indexOf('/* Cortex v1.38.0 — compact rewind journal');
assert.ok(marker > 0);
const context = { structuredClone };
runInNewContext(html.slice(html.lastIndexOf('<script>', marker) + 8, html.indexOf('</script>', marker)), context);
const experience = context.CortexTurnExperience;
const scenario = () => ({
  runtime: {}, world: { location: '박물관 자료실', time: '14:00' },
  scene: { presentCharacterIds: ['hero'] }, protagonist: { id: 'hero', name: '한시우' },
  characters: [{ id: 'visitor', name: '나디아 알 하다드',
    publicInfo: '첫 등장 뒤 공개: 박물관의 방문 연구자.',
    publicProfile: '첫 등장 뒤 공개: 박물관의 방문 연구자.',
    hiddenInfo: 'PRIVATE BIOGRAPHY MUST NOT APPEAR',
    images: [{ isPrimary: true, assetPath: 'assets/visitor.webp' }] }],
});
const commit = (text, extra = {}) => ({ id: 't1', status: 'COMMITTED', text, ...extra });

test('first-appearance portrait permission works under a public alias without disclosing the real identity', () => {
  const sc = scenario();
  sc.presentation = { publicAliases: { guard: ['소녀 검사', '검사'] } };
  const person = { id: 'guard', name: '검사 · 은하', publicProfile: '', source: {
    preRevealAlias: '정체불명의 소녀 검사', imageOnFirstAppearance: true,
    publicInfo: '첫 등장 뒤 공개: 은하라는 가명을 쓰는 검사. PRIVATE BIOGRAPHY.',
    appearance: '키 163cm. 흑갈색 긴 머리, 갈색 눈, 붉은 옷과 은하검.', hiddenInfo: 'PRIVATE IDENTITY',
    images: [{ isPrimary: true, assetPath: 'guard.webp' }],
  } };
  sc.characters.push(person);
  const before = structuredClone(sc), text = '검사는 문 앞에서 검을 낮췄다. “지금은 안전합니다.”';
  const capture = () => captureScene({ scope: 'alias-fixture', scenario: sc, turn: commit(text), experience, timeline: true });
  assert.equal(experience.publicCharacter(person, sc).referenceMode, 'NONE');
  const scene = capture(), visual = scene.candidates.find(row => row.id === person.id);
  assert.equal(visual?.referenceMode, 'PRIMARY');
  assert.equal(visual.name, '정체불명의 소녀 검사');
  assert.ok(visual.aliases.includes('검사'));
  assert.equal(visual.primaryAssetRef, 'guard.webp');
  assert.match(visual.publicAppearance, /163cm.*흑갈색.*갈색/u);
  const request = castRequest(scene, 'gpt-6-luna');
  assert.doesNotMatch(request.input, /은하|PRIVATE|guard\.webp/u);
  assert.deepEqual(sc, before, 'the canonical disclosure ledger, name and source remain untouched');
  const rows = validateCast({ ...scene, candidates: [visual], castPages: [{ start: 0, text }] }, { beats: [{
    beat: 'P0', speaker: 'C0', speakerLabel: '검사', speakerEvidence: '검사는 문 앞에서 검을 낮췄다.',
    onStage: [{ candidate: 'C0', evidence: '검사는 문 앞에서 검을 낮췄다.', identityEvidence: '검사는 문 앞에서 검을 낮췄다.' }],
  }] });
  assert.equal(rows[0].speakerId, 'guard');
  assert.equal(rows[0].speakerName, '검사');
  assert.equal(rows[0].characters[0].id, 'guard');
  assert.deepEqual(Array.from(experience.selectImageReferences({ visualReferences: [{ characterId: visual.id, mode: visual.referenceMode, primaryAssetRef: visual.primaryAssetRef, allowedAssetRefs: visual.allowedAssetRefs }] }, [
    { characterId: 'guard', ref: 'guard.webp', dataUrl: 'fixture' }, { characterId: 'visitor', ref: 'visitor.webp', dataUrl: 'wrong' },
  ]), row => row.dataUrl), ['fixture']);
  sc.runtime.disclosureLedger = { revealedEntityRefs: ['guard'] };
  assert.equal(portraitKey(scene.scope, capture().candidates.find(row => row.id === 'guard')), portraitKey(scene.scope, visual), 'later name disclosure reuses the same paid portrait');
  delete sc.runtime.disclosureLedger;
  person.source.images = [];
  assert.equal(capture().candidates.find(row => row.id === 'guard').primaryAssetRef, '', 'an alias with no embedded image can generate its own first portrait');
  for (const patch of [{ imageOnFirstAppearance: false }, { secret: true }, { revealCondition: 'after-secret-event' }, { visibility: 'private' }]) {
    const original = person.source; person.source = { ...original, ...patch };
    assert.ok(!capture().candidates.some(row => row.id === 'guard'), JSON.stringify(patch));
    person.source = original;
  }
  sc.characters.push({ id: 'other', name: '검사', publicInfo: '다른 사람' });
  assert.ok(!capture().candidates.some(row => row.id === 'guard'), 'overlapping anonymous labels are withheld rather than guessed');
});

test('an authored concealed-form reference keeps its media boundary under first-appearance permission', () => {
  const sc = scenario();
  sc.characters = [{ id: 'masked', name: 'SECRET NAME', source: {
    preRevealAlias: '가면 검사', imageOnFirstAppearance: true, publicInfo: '첫 등장 뒤 공개: SECRET BIOGRAPHY',
    appearance: 'SECRET UNCOVERED FACE', preRevealProfile: '얼굴을 가린 가면과 검은 외투.',
    images: [{ isPrimary: true, assetPath: 'unmasked.webp' }], preRevealImage: 'masked.webp',
  } }];
  const scene = captureScene({ scope: 'mask-fixture', scenario: sc, turn: commit('가면 검사는 문 앞에 섰다.'), experience, timeline: true });
  const person = scene.candidates.find(row => row.id === 'masked');
  assert.equal(person.referenceMode, 'PRE_REVEAL_ONLY');
  assert.equal(person.primaryAssetRef, '');
  assert.deepEqual([...person.allowedAssetRefs], ['masked.webp']);
  assert.doesNotMatch(JSON.stringify(person), /SECRET|unmasked/u);
  assert.match(person.publicAppearance, /가면/u);
});

test('authored Hongjae public alias releases appearance, preserves the public label and keeps the portrait key after naming', () => {
  const sc = scenario();
  sc.characters.push({ id: 'NPC_SERVANT_SABER_JEONGJO_TS', name: '세이버 · 홍재',
    publicInfo: '첫 등장 뒤 공개: 가명 홍재를 쓰는 Saber.',
    publicProfile: '첫 등장 뒤 공개: 가명 홍재를 쓰는 Saber.',
    appearance: '키 163cm, 흑갈색 머리와 붉은 옷. 홍재검을 든다.',
    hiddenInfo: 'PRIVATE IDENTITY', images: [{ isPrimary: true, assetPath: 'hongjae.webp' }] });
  const before = structuredClone(sc), text = '소녀 검사가 문 앞에 섰다. “물러서.”';
  const scene = captureScene({ scope: 'fate-seoul:save1', scenario: sc, turn: commit(text), experience, timeline: true });
  const hong = scene.candidates.find(person => person.id === 'NPC_SERVANT_SABER_JEONGJO_TS');
  assert.equal(hong?.referenceMode, 'PRIMARY');
  assert.equal(hong.name, '소녀 검사');
  assert.equal(hong.primaryAssetRef, 'hongjae.webp');
  assert.ok(!JSON.stringify(scene).includes('PRIVATE IDENTITY'));
  assert.ok(!hong.publicProfile.includes('홍재'));
  const priorRelease = captureScene({ scope: 'prior-release:save1', scenario: sc, turn: commit('홍재가 앞으로 나섰다.'), experience, timeline: true });
  assert.equal(portraitKey(scene.scope, hong), portraitKey(scene.scope, priorRelease.candidates.find(person => person.id === hong.id)), 'previously paid Hongjae sprites retain their cache identity');
  const pages = { ...scene, castPages: [{ start: 0, text }], candidates: [hong] };
  const rows = validateCast(pages, { beats: [{ beat: 'P0', speaker: 'C0', speakerLabel: '소녀 검사', speakerEvidence: '소녀 검사가 문 앞에 섰다.',
    onStage: [{ candidate: 'C0', evidence: '소녀 검사가 문 앞에 섰다.', identityEvidence: '소녀 검사가 문 앞에 섰다.' }] }] });
  assert.equal(rows[0].speakerId, hong.id);
  assert.equal(rows[0].speakerName, '소녀 검사');
  assert.equal(rows[0].characters[0].id, hong.id);
  const named = captureScene({ scope: 'fate-seoul:save1', scenario: sc, turn: commit('홍재가 앞으로 나섰다.'), priorTurns: [commit(text)], experience, timeline: true });
  assert.equal(portraitKey(scene.scope, hong), portraitKey(scene.scope, named.candidates.find(person => person.id === hong.id)), 'no regeneration after the proper name is revealed');
  assert.deepEqual(sc, before);
  const elsewhere = captureScene({ scope: 'other-work:save1', scenario: sc, turn: commit(text), experience, timeline: true });
  assert.ok(!elsewhere.candidates.some(person => person.id === hong.id));
  sc.characters[1].secret = true;
  const secret = captureScene({ scope: 'fate-seoul:save1', scenario: sc, turn: commit(text), experience, timeline: true });
  assert.ok(!secret.candidates.some(person => person.id === hong.id));
});

test('Cortex appearance-gated visitor becomes a public reference candidate from public prose despite an unchanged roster', () => {
  const sc = scenario(), before = structuredClone(sc);
  assert.equal(experience.publicCharacter(sc.characters[0], sc), null);
  const scene = captureScene({ scope: 'fate-fixture', scenario: sc,
    turn: commit('나디아가 자료실 안으로 들어와 한시우의 맞은편에 섰다.'), experience });
  const visitor = scene.candidates.find(row => row.id === 'visitor');
  assert.deepEqual(scene.characters, [], 'public appearance is not evidence of physical presence');
  assert.equal(visitor?.referenceMode, 'PRIMARY');
  assert.equal(visitor?.primaryAssetRef, 'assets/visitor.webp');
  assert.ok(!JSON.stringify(scene).includes('PRIVATE BIOGRAPHY'));
  assert.deepEqual(sc, before, 'public appearance refresh must not mutate the canonical scenario');
});

test('Cortex validated public speaker alias releases appearance without exposing an explicit secret identity', () => {
  const sc = scenario(), text = '“자료실은 이쪽이에요.”';
  const annotation = { bindingVersion: 2, source: 'WRITER_CHARACTER_ALIAS', characterId: 'visitor', speakerName: '나디아', quoteText: text, offset: 0 };
  const turn = commit(text, { dialogueAnnotations: [annotation] });
  const scene = captureScene({ scope: 'fate-fixture', scenario: sc, turn, experience });
  const visitor = scene.candidates.find(row => row.id === 'visitor');
  assert.equal(visitor?.referenceMode, 'PRIMARY');
  assert.ok([visitor.name, ...visitor.aliases].includes('나디아'));
  sc.characters[0].secret = true; sc.characters[0].preRevealAlias = '가면의 방문자';
  const secretScene = captureScene({ scope: 'fate-fixture', scenario: sc,
    turn: commit('가면의 방문자는 자료실에 섰다.'), experience });
  assert.ok(!secretScene.candidates.some(row => row.id === 'visitor'));
});

test('a known visitor on the telephone does not become an on-screen sprite from a stale roster', () => {
  const sc = scenario(); sc.scene.presentCharacterIds.push('visitor');
  const prior = commit('나디아가 한시우의 맞은편에 섰다.');
  const turn = commit('나디아는 전화 너머에서 들려오는 잡음 때문에 목소리를 높였다.');
  const scene = captureScene({ scope: 'fate-fixture', scenario: sc, turn, priorTurns: [prior], experience });
  assert.ok(!scene.candidates.some(row => row.id === 'visitor'));
});
