import test from 'node:test';
import assert from 'node:assert/strict';
import { captureScene, environmentKey, sceneVersion } from '../public/vn-scene.mjs';

const SCOPE = 'test-scope';
const WORLD = { location: 'Fake Test Hall', time: '12:00', weather: 'clear' };

const hero = { id: 'hero-test', name: 'Test Hero', aliases: [], referenceMode: 'PRIMARY' };
const rin = { id: 'npc-rin-test', name: 'Test Rin', aliases: [], referenceMode: 'PRIMARY' };
const mira = { id: 'npc-mira-test', name: 'Test Mira', aliases: [], referenceMode: 'PRIMARY' };

function makeScenario({ world = WORLD, presentIds = [], extra = {} } = {}) {
  return {
    world: { ...world },
    scene: { presentCharacterIds: [...presentIds] },
    protagonist: { ...hero },
    characters: [{ ...rin }, { ...mira }],
    runtime: {},
    ...extra,
  };
}

function makeTurn({ id = 'turn-1', text = 'synthetic test narration' } = {}) {
  return { id, text, commitGraph: { id }, canonicalRevisionAtCommit: 'rev-1' };
}

function makeExperience({ capsule, witnessed, publicModes, refresh } = {}) {
  const calls = {};
  const experience = {
    calls,
    createImageCapsule(args) {
      calls.capsuleArgs = args;
      return capsule ?? { characters: [], excludedReferenceNames: [], visualReferences: [] };
    },
    publicCharacter(person) {
      const mode = publicModes?.[person.id] ?? person.referenceMode ?? 'PRIMARY';
      return { ...person, aliases: person.aliases ?? [], referenceMode: mode };
    },
  };
  if (witnessed !== undefined) {
    experience.imageCharacters = (...args) => {
      calls.imageArgs = args;
      return witnessed;
    };
  }
  if (refresh) {
    experience.refreshPublicAppearances = (...args) => {
      calls.refreshArgs = args;
      return refresh(...args);
    };
  }
  return experience;
}

function ids(scene) {
  assert.deepEqual(scene.characters, [], 'reference candidates must never automatically become stage occupants');
  return (scene.candidates || []).map(person => person.id);
}

test('public imageCharacters evidence adds an NPC absent from hero-only roster', () => {
  const scenario = makeScenario({ presentIds: [hero.id] });
  const turn = makeTurn({ text: 'synthetic mention of Test Rin' });
  const experience = makeExperience({ witnessed: [{ id: rin.id }] });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous: null, experience });
  assert.ok(ids(scene).includes(rin.id), 'witnessed NPC should be added');
  assert.ok(ids(scene).includes(hero.id), 'hero should remain');
});

test('capsule.characters fallback works when imageCharacters is absent', () => {
  const scenario = makeScenario({ presentIds: [hero.id] });
  const turn = makeTurn({ text: 'synthetic narration without witness hook' });
  const experience = makeExperience({
    witnessed: undefined, // omit imageCharacters entirely
    capsule: { characters: [{ id: mira.id }], excludedReferenceNames: [], visualReferences: [] },
  });
  assert.equal(typeof experience.imageCharacters, 'undefined');
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous: null, experience });
  assert.ok(ids(scene).includes(mira.id), 'capsule fallback character should be added');
});

test('referenceMode NONE remains excluded even with roster and evidence', () => {
  const scenario = makeScenario({ presentIds: [hero.id, rin.id] });
  const turn = makeTurn({ text: 'synthetic mention of Test Rin' });
  const experience = makeExperience({
    witnessed: [{ id: rin.id }],
    publicModes: { [rin.id]: 'NONE' },
  });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous: null, experience });
  assert.ok(!ids(scene).includes(rin.id), 'NONE mode must stay excluded');
  assert.ok(ids(scene).includes(hero.id), 'hero should remain');
});

test('capsule.excludedReferenceNames removes an offscreen character in roster and previous', () => {
  const scenario = makeScenario({ presentIds: [hero.id, mira.id] });
  const turn = makeTurn({ text: 'synthetic narration' });
  const key = environmentKey(SCOPE, WORLD);
  const previous = { environmentKey: key, characters: [{ id: mira.id }], expressions: [] };
  const experience = makeExperience({
    witnessed: [],
    capsule: { characters: [], excludedReferenceNames: [mira.name], visualReferences: [] },
  });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous, experience });
  assert.ok(!ids(scene).includes(mira.id), 'excluded offscreen name must be removed');
});

test('previous cast remains a candidate when same environment and omitted from stale roster', () => {
  const scenario = makeScenario({ presentIds: [hero.id] });
  const turn = makeTurn({ text: 'synthetic narration with stale roster' });
  const key = environmentKey(SCOPE, WORLD);
  const previous = { environmentKey: key, characters: [{ id: rin.id }], expressions: [] };
  const experience = makeExperience({ witnessed: [] });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous, experience });
  assert.ok(ids(scene).includes(rin.id), 'same-environment previous cast should remain a candidate');
});

test('previous cast is not carried across environment changes', () => {
  const nextWorld = { location: 'Fake Second Hall', time: '12:00', weather: 'clear' };
  const scenario = makeScenario({ world: nextWorld, presentIds: [hero.id] });
  const turn = makeTurn({ text: 'synthetic narration after move' });
  const oldKey = environmentKey(SCOPE, WORLD);
  const previous = { environmentKey: oldKey, characters: [{ id: rin.id }], expressions: [] };
  const experience = makeExperience({ witnessed: [] });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous, experience });
  assert.notEqual(scene.environmentKey, oldKey);
  assert.ok(!ids(scene).includes(rin.id), 'previous cast must not cross environments');
});

test('refreshPublicAppearances receives prior and current turns', () => {
  const scenario = makeScenario({ presentIds: [hero.id] });
  const prior = makeTurn({ id: 'turn-0', text: 'synthetic prior turn' });
  const current = makeTurn({ id: 'turn-1', text: 'synthetic current turn' });
  let seenTurns = null;
  const experience = makeExperience({
    witnessed: [],
    refresh: (targetScenario, turns) => {
      seenTurns = turns;
      targetScenario.runtime.projection = { ok: true };
    },
  });
  captureScene({ scope: SCOPE, scenario, turn: current, previous: null, experience, priorTurns: [prior] });
  assert.ok(Array.isArray(seenTurns), 'refresh should receive a turns array');
  assert.equal(seenTurns.length, 2);
  assert.equal(seenTurns[0], prior);
  assert.equal(seenTurns[1], current);
});

test('refresh projection writes only to copy runtime without changing source scenario or turn', () => {
  const scenario = makeScenario({ presentIds: [hero.id] });
  const turn = makeTurn({ text: 'synthetic narration' });
  const beforeScenario = structuredClone(scenario);
  const beforeTurn = structuredClone(turn);
  const experience = makeExperience({
    witnessed: [],
    refresh: targetScenario => {
      targetScenario.runtime.projection = { marker: 'projection-only' };
    },
  });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous: null, experience });
  assert.deepEqual(scenario, beforeScenario, 'source scenario must be unchanged');
  assert.deepEqual(turn, beforeTurn, 'source turn must be unchanged');
  assert.equal(scenario.runtime.projection, undefined, 'projection must not leak to source runtime');
  assert.equal(scene.version, sceneVersion);
});

test('primary authored reference path is retained', () => {
  const authored = { assetPath: '/synthetic/hero-primary.png', isPrimary: true, label: 'test primary' };
  const scenario = makeScenario({
    presentIds: [hero.id],
    extra: {
      protagonist: { ...hero, source: { images: [authored] } },
    },
  });
  const turn = makeTurn({ text: 'synthetic narration' });
  const experience = makeExperience({
    witnessed: [],
    capsule: {
      characters: [],
      excludedReferenceNames: [],
      visualReferences: [{ characterId: hero.id, primaryAssetRef: '/synthetic/capsule-other.png' }],
    },
  });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous: null, experience });
  const entry = scene.candidates.find(person => person.id === hero.id);
  assert.ok(entry, 'hero should be present');
  assert.equal(entry.primaryAssetRef, authored.assetPath);
});

test('capsule visual reference fills a missing authored primary path', () => {
  const scenario = makeScenario({ presentIds: [hero.id] });
  const turn = makeTurn({ text: 'synthetic narration' });
  const experience = makeExperience({
    witnessed: [],
    capsule: {
      characters: [],
      excludedReferenceNames: [],
      visualReferences: [{ characterId: hero.id, primaryAssetRef: '/synthetic/capsule-primary.png' }],
    },
  });
  const scene = captureScene({ scope: SCOPE, scenario, turn, previous: null, experience });
  const entry = scene.candidates.find(person => person.id === hero.id);
  assert.ok(entry, 'hero should be present');
  assert.equal(entry.primaryAssetRef, '/synthetic/capsule-primary.png');
});
