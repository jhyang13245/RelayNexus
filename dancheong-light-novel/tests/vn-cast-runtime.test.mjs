import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureScene } from '../public/vn-scene.mjs';

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
