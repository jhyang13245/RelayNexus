import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageAssets, cgKey } from '../public/vn-assets.mjs';
import { validateCast } from '../public/vn-cast.mjs';
import { portraitKey } from '../public/vn-scene.mjs';

const dayun = { id: 'dayun', name: '김다윤', referenceMode: 'PRIMARY' };
const action = '김다윤이 떨어지는 책장을 붙잡았다.';
const scene = { scope: 'identity-fixture', environmentKey: 'classroom', world: { location: '교실', time: '12:00' }, publicText: action,
  characters: [dayun], candidates: [dayun], castPages: [{ start: 0, text: action }] };
const baseKey = person => JSON.stringify(['vn-stage-frame-2', JSON.stringify(['vn-character-finish-1', portraitKey(scene.scope, person, 'neutral')])]);
const image = value => `data:image/png;base64,${Buffer.from(value).toString('base64')}`;
function setup({ records = new Map(), visible = [dayun], participants = [dayun], beforeImage = async () => {}, failPortrait = false, key = 'fixture', expression = 'neutral' } = {}) {
  const calls = [], errors = [];
  const current = { ...scene, characters: visible, direction: { expressions: { dayun: expression } } };
  const cast = { prepare: async () => current, view: () => current, timeline: () => [{ start: 0, characters: participants,
    direction: { cg: true, event: { evidence: action, focus: action, characterIds: participants.map(p => p.id), castComplete: true } } }] };
  const assets = createStageAssets({ castDirector: cast, getKey: () => key, getQuality: () => 'low', getReferences: () => [], getCgEnabled: () => true,
    onChange() {}, onError: error => errors.push(error), read: async k => records.get(k), write: async row => records.set(row.key, row),
    fetchImage: async (_, init) => {
      const body = JSON.parse(init.body); calls.push(body); await beforeImage(body);
      return body.purpose === 'portrait' && failPortrait ? Response.json({ error: { message: 'portrait unavailable' } }, { status: 503 })
        : Response.json({ imageUrl: image(body.purpose + calls.length) });
    } });
  return { assets, calls, errors, records, prepare: options => assets.prepare(current, current.castPages[0], options), view: () => assets.view(current, current.castPages[0]) };
}

test('unknown humans, missing completeness proof and invalid participant handles cannot become object CGs', () => {
  const entry = { beat: 'P0', speaker: '', onStage: [{ candidate: 'C0', evidence: action, identityEvidence: action }],
    shot: 'wide', cg: true, eventEvidence: action, eventFocus: action, eventParticipants: ['C0'], eventCastComplete: true };
  const direction = patch => validateCast(scene, { beats: [{ ...entry, ...patch }] })[0].direction;
  assert.equal(direction({}).cg, true);
  for (const patch of [
    { eventCastComplete: false, eventParticipants: [] },
    { eventCastComplete: undefined },
    { eventParticipants: ['C0', 'C9'] },
    { eventParticipants: ['unknown girl'] },
    { eventParticipants: undefined },
  ]) assert.equal(direction(patch).cg, false);
  const legacy = { ...entry }; delete legacy.eventCastComplete;
  assert.equal(validateCast(scene, { beats: [legacy] })[0].characters[0].id, 'dayun', 'old verified cast is retained');
  assert.equal(validateCast(scene, { beats: [legacy] })[0].direction.cg, false, 'old unverified event does not generate');
});

test('event waits for the normal character portrait, sends that exact identity and reuses both offline', async () => {
  let release;
  const waiting = new Promise(resolve => release = resolve);
  const h = setup({ beforeImage: body => body.purpose === 'portrait' ? waiting : Promise.resolve() });
  const pending = h.prepare();
  await new Promise(setImmediate);
  assert.equal(h.calls.filter(row => row.purpose === 'portrait').length, 1);
  assert.equal(h.calls.filter(row => row.purpose === 'scene').length, 0, 'no invented face while base portrait is pending');
  assert.equal(h.view().eventBackground, '');
  release(); await pending;
  const event = h.calls.find(row => row.purpose === 'scene'), base = h.records.get(baseKey(dayun));
  assert.equal(event.referenceImages[1], base.url);
  assert.match(event.prompt, /"image":2,"characterId":"dayun","name":"김다윤"/);
  assert.match(event.prompt, /No additional people, faces, hands, silhouettes or visible protagonist/);
  assert.deepEqual(h.records.get(cgKey(scene, 0)).eventIdentity.portraits, [{ id: dayun.id, key: base.key, savedAt: base.savedAt }]);
  assert.deepEqual(h.view().eventCharacterIds, ['dayun']);
  await h.prepare();
  assert.equal(h.calls.length, 3, 'portrait, location, event only once each');
  const offline = setup({ records: h.records, key: '' });
  await offline.prepare({ generate: false });
  assert.equal(offline.view().eventBackground, h.view().eventBackground);
  assert.equal(offline.calls.length, 0);
});

test('failed portrait never starts a paid event request or hides the participant', async () => {
  const h = setup({ failPortrait: true }); await h.prepare();
  assert.equal(h.errors.length, 1);
  assert.equal(h.calls.filter(row => row.purpose === 'scene').length, 0);
  assert.equal(h.view().eventBackground, '');
  assert.deepEqual(h.view().eventCharacterIds, []);
  await h.prepare();
  assert.equal(h.calls.length, 2, 'failed images need explicit retry');
});

test('a ready base portrait releases event generation without waiting for its expression variant', async () => {
  let release;
  const waiting = new Promise(resolve => release = resolve);
  const h = setup({ expression: 'surprised', beforeImage: body => body.purpose === 'expression' ? waiting : Promise.resolve() });
  const pending = h.prepare(); await new Promise(setImmediate);
  assert.ok(h.calls.some(row => row.purpose === 'expression'));
  assert.ok(h.calls.some(row => row.purpose === 'scene'), 'event uses the ready base identity immediately');
  release(); await pending;
});

test('lookahead cannot generate a future character only to put them in an event background', async () => {
  const h = setup({ visible: [] }); await h.prepare();
  assert.deepEqual(h.calls.map(row => row.purpose), ['background']);
  assert.equal(h.view().eventBackground, '');
  const withSavedPortrait = setup({ visible: [], records: new Map([[baseKey(dayun), { key: baseKey(dayun), url: image('existing dayun'), savedAt: 1 }]]) });
  await withSavedPortrait.prepare();
  assert.deepEqual(withSavedPortrait.calls.map(row => row.purpose), ['background', 'scene']);
  assert.equal(withSavedPortrait.calls[1].referenceImages[1], image('existing dayun'));
});

test('old unchecked event art and events bound to replaced portraits are suppressed without re-billing', async () => {
  const original = setup(); await original.prepare();
  for (const kind of ['unchecked', 'different portrait']) {
    const records = structuredClone(original.records);
    if (kind === 'unchecked') delete records.get(cgKey(scene, 0)).eventIdentity;
    else { const base = records.get(baseKey(dayun)); base.savedAt++; base.url = image('new dayun'); }
    const restored = setup({ records }); await restored.prepare();
    assert.equal(restored.view().eventBackground, '', kind);
    assert.deepEqual(restored.view().eventCharacterIds, []);
    assert.equal(restored.calls.length, 0, 'an update or changed identity does not silently regenerate paid CG');
    assert.ok(restored.view().portraits[0].url, 'ordinary sprite and setting remain usable');
  }
});

test('an event requiring too many identity references is skipped instead of truncating people', async () => {
  const participants = Array.from({ length: 14 }, (_, i) => ({ ...dayun, id: `person${i}` }));
  const records = new Map(participants.map(person => [baseKey(person), { key: baseKey(person), url: image(person.id), savedAt: 1 }]));
  const h = setup({ records, visible: [], participants }); await h.prepare();
  assert.deepEqual(h.calls.map(row => row.purpose), ['background']);
  assert.equal(h.view().eventBackground, '');
});
