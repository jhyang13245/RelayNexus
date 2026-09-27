import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureScene } from '../public/vn-scene.mjs';
import { portraitKey } from '../public/vn-scene.mjs';
import { validateCast, castRequest, createCastDirector, castKey } from '../public/vn-cast.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
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

test('an ordinary registered person with a redundant pre-reveal name can generate first-appearance art without an embedded image', () => {
  const sc = scenario();
  sc.characters = [{ id: 'classmate', name: '김서연', publicProfile: '', source: {
    name: '김서연', preRevealAlias: '김서연', imageOnFirstAppearance: true,
    publicInfo: '같은 학년의 대학 동기.', appearance: '164cm, 검은 단발과 작은 은색 핀.',
    hiddenInfo: 'PRIVATE BACKSTORY', images: [],
  } }];
  const person = sc.characters[0], before = structuredClone(sc);
  assert.equal(experience.publicCharacter(person, sc).referenceMode, 'NONE');
  const text = '김서연은 파일을 내려놓았다. 서연이 말했다. “같이 갈래?”';
  const capture = () => captureScene({ scope: 'ordinary-cast', scenario: sc, turn: commit(text), experience, timeline: true });
  const scene = capture(), visual = scene.candidates.find(row => row.id === 'classmate');
  assert.equal(visual.id, 'classmate');
  assert.equal(visual.referenceMode, 'PRIMARY');
  assert.equal(visual.primaryAssetRef, '');
  assert.ok(visual.aliases.includes('서연'));
  assert.match(visual.publicAppearance, /164cm.*은색 핀/u);
  assert.doesNotMatch(JSON.stringify(scene), /PRIVATE/u);
  assert.deepEqual(scene.characters, [], 'a candidate still needs separate physical-presence proof');
  const row = validateCast({ ...scene, castPages: [{ start: 0, text }] }, { beats: [{
    beat: 'P0', speaker: 'C0', speakerLabel: '서연', speakerEvidence: '서연이 말했다.',
    onStage: [{ candidate: 'C0', evidence: '김서연은 파일을 내려놓았다.', identityEvidence: '김서연은 파일을 내려놓았다.', identityStatus: 'confirmed', presence: 'physical' }],
  }] })[0];
  assert.equal(row.speakerId, 'classmate');
  assert.deepEqual(sc, before, 'the engine disclosure and saved story remain unchanged');
  sc.runtime.disclosureLedger = { revealedEntityRefs: ['classmate'] };
  assert.equal(portraitKey(scene.scope, capture().candidates.find(row => row.id === 'classmate')), portraitKey(scene.scope, visual));
  delete sc.runtime.disclosureLedger;
  for (const patch of [
    { imageOnFirstAppearance: false }, { secret: true }, { revealCondition: 'secret-event' },
    { visibility: 'private' }, { preRevealAlias: '정체불명의 여학생' },
    { publicInfo: '정체 공개 사건 이후 공개: 대학 동기.' }, { publicInfo: '공개 조건: 특정 사건' },
  ]) {
    const original = person.source; person.source = { ...original, ...patch };
    assert.ok(!capture().candidates.some(row => row.id === 'classmate'), JSON.stringify(patch));
    person.source = original;
  }
});

test('redundant public names keep concealed-form media restrictions and do not match an unrelated professor', () => {
  const sc = scenario();
  sc.characters = [{ id: 'teacher', name: '정민석', source: {
    name: '정민석', preRevealAlias: '정민석', imageOnFirstAppearance: true,
    publicInfo: '도시공학과 교수.', appearance: 'SECRET UNCOVERED FACE',
    preRevealProfile: '가면과 회색 외투.', preRevealImage: 'masked.webp', images: [],
  } }, { id: 'grandmother', name: '한명진', publicProfile: '외할머니' }];
  const text = '정민석이 자료를 펼쳤다. “이 지도를 보세요.”';
  const scene = captureScene({ scope: 'ordinary-teacher', scenario: sc, turn: commit(text), experience, timeline: true });
  const visual = scene.candidates.find(row => row.id === 'teacher');
  assert.equal(visual.referenceMode, 'PRE_REVEAL_ONLY');
  assert.deepEqual([...visual.allowedAssetRefs], ['masked.webp']);
  assert.doesNotMatch(JSON.stringify(visual), /SECRET/u);
  const unrelated = '교수가 자료를 펼쳤다. “이 지도를 보세요.”';
  const row = validateCast({ ...scene, publicText: unrelated, castPages: [{ start: 0, text: unrelated }] }, { beats: [{
    beat: 'P0', speaker: 'C0', speakerLabel: '교수', speakerEvidence: '교수가 자료를 펼쳤다.',
    onStage: [{ candidate: 'C0', evidence: '교수가 자료를 펼쳤다.', identityEvidence: '교수가 자료를 펼쳤다.', identityStatus: 'confirmed', presence: 'physical' }],
  }] })[0];
  assert.equal(row.speakerId, '');
  assert.deepEqual(row.characters, []);
});

test('newly eligible authored cast gets first portraits, reuses them, and disappears for off-screen mentions', async () => {
  const sc = scenario();
  sc.characters = [
    { id: 'teacher', name: '정민석', source: { name: '정민석', preRevealAlias: '정민석', imageOnFirstAppearance: true,
      publicInfo: '도시공학과 교수.', appearance: '176cm, 새치가 섞인 짧은 검은 머리와 사각 안경, 회색 재킷.', images: [] } },
    { id: 'student', name: '김서연', source: { name: '김서연', preRevealAlias: '김서연', imageOnFirstAppearance: true,
      publicInfo: '대학 동기.', appearance: '164cm, 검은 단발과 작은 은색 핀, 아이보리 맨투맨.', images: [] } },
  ];
  const text = '정민석 교수가 지도를 폈다. 김서연이 파일을 들고 말했다. “같이 보자.”';
  const scene = captureScene({ scope: 'ordinary-pipeline', scenario: sc, turn: commit(text), experience, timeline: true });
  scene.castPages = [{ start: 0, text }];
  assert.notEqual(castKey(scene), castKey({ ...scene, candidates: [] }), 'old empty cast decisions cannot suppress new candidates');
  const records = new Map(), images = [];
  let offscreen = false;
  const director = createCastDirector({ getConnection: () => ({ key: 'fixture', endpoint: '/fixture', model: 'fixture' }),
    read: async key => records.get(key), write: async row => records.set(row.key, row),
    fetchDecision: async () => Response.json({ output_text: JSON.stringify({ beats: [{ beat: 'P0',
      speaker: offscreen ? '' : 'C1', speakerLabel: offscreen ? '' : '서연', speakerEvidence: offscreen ? '' : '김서연이 파일을 들고 말했다.',
      onStage: offscreen ? [] : [
        { candidate: 'C0', evidence: '정민석 교수가 지도를 폈다.', identityEvidence: '정민석 교수가 지도를 폈다.', identityStatus: 'confirmed', presence: 'physical' },
        { candidate: 'C1', evidence: '김서연이 파일을 들고 말했다.', identityEvidence: '김서연이 파일을 들고 말했다.', identityStatus: 'confirmed', presence: 'physical' },
      ],
    }] }) }),
  });
  const assets = createStageAssets({ castDirector: director, getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], onChange() {}, onError(error) { throw new Error(error); },
    read: async key => records.get(key), write: async row => records.set(row.key, row),
    fetchImage: async (_url, init) => { images.push(JSON.parse(init.body)); return Response.json({ imageUrl: 'data:image/png;base64,YXJ0' }); },
  });
  await assets.prepare(scene, scene.castPages[0]);
  const requests = images.filter(row => row.purpose === 'portrait');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(row => row.referenceImages.length === 0));
  assert.ok(requests.some(row => row.prompt.includes('사각 안경')));
  assert.ok(requests.some(row => row.prompt.includes('은색 핀')));
  assert.deepEqual(assets.view(scene, scene.castPages[0]).portraits.map(row => row.id), ['teacher', 'student']);
  await assets.prepare(scene, scene.castPages[0]);
  assert.equal(images.filter(row => row.purpose === 'portrait').length, 2);
  offscreen = true;
  const remote = { ...scene, publicText: '김서연에게서 메시지가 왔다. 정민석 교수의 수업을 떠올렸다.',
    castPages: [{ start: 0, text: '김서연에게서 메시지가 왔다. 정민석 교수의 수업을 떠올렸다.' }] };
  await assets.prepare(remote, remote.castPages[0]);
  assert.deepEqual(assets.view(remote, remote.castPages[0]).portraits, []);
  assert.equal(images.filter(row => row.purpose === 'portrait').length, 2);
});

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
