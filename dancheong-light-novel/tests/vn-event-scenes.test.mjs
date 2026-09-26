import test from 'node:test';
import assert from 'node:assert/strict';
import { createCastDirector, castRequest, validateCast } from '../public/vn-cast.mjs';
import { createStageAssets, eventSceneSetting } from '../public/vn-assets.mjs';
import { dialogueWait, prepareAhead } from '../public/vn-stage-timing.mjs';

const eventText = '현관문이 안쪽으로 터지듯 벌어지며 걸쇠 조각이 바닥을 튀었다. 젖은 종이가면이 어둠 속에서 희끗하게 솟고, 팔처럼 길어진 종이 다발이 문틀을 후려쳤다.';
const nadia = { id: 'nadia', name: '나디아', referenceMode: 'PRIMARY', publicProfile: '은발의 성인 여성' };
const scene = (people = []) => ({ scope: 'event-fixture', environmentKey: 'night-alley', world: { location: '골목의 현관', time: '22:00' },
  publicText: `문 앞이 고요했다. ${eventText} “뒤로!”`, previousText: '나디아가 내 옆에 섰다.', candidates: people,
  castPages: [{ start: 0, text: '문 앞이 고요했다.' }, { start: 11, text: eventText }, { start: 120, text: '“뒤로!”', quoted: true }] });
function decision(sc) {
  return { beats: sc.castPages.map((page, i) => ({ beat: `P${page.start}`, speaker: '', speakerLabel: '', speakerEvidence: '',
    onStage: sc.candidates.map((person, at) => ({ candidate: `C${at}`, evidence: '나디아가 내 옆에 섰다.', identityEvidence: '나디아가 내 옆에 섰다.' })),
    expressions: [], focus: '', shot: 'wide', transition: 'none', fx: i === 1 ? 'heavy_shake' : 'none', mood: 'tense', cg: i === 1,
    eventEvidence: i === 1 ? eventText : '', eventFocus: i === 1 ? '팔처럼 길어진 종이 다발이 현관 문틀을 후려치는 충돌' : '', eventParticipants: [], eventCastComplete: true })) };
}
function setup(sc, { records = new Map(), enabled = true, key = 'fixture', beforeImage = async () => {} } = {}) {
  const calls = [], errors = [];
  const cast = createCastDirector({ getConnection: () => ({ key, endpoint: '/mock/text', model: 'gpt-5.6-luna' }), read: async k => records.get(k), write: async row => records.set(row.key, row),
    fetchDecision: async () => Response.json({ output_text: JSON.stringify(decision(sc)) }) });
  const assets = createStageAssets({ castDirector: cast, getKey: () => key, getQuality: () => 'low', getReferences: () => [], getCgEnabled: () => enabled,
    onChange: () => {}, onError: error => errors.push(error), read: async k => records.get(k), write: async row => records.set(row.key, row),
    fetchImage: async (_u, init) => { const body = JSON.parse(init.body); calls.push(body); await beforeImage(body); return Response.json({ imageUrl: `data:image/png;base64,${Buffer.from(body.purpose).toString('base64')}` }); } });
  return { assets, cast, calls, errors, records };
}

test('an object attack is directed and illustrated with zero registered characters, then reused offline', async () => {
  const sc = scene(), h = setup(sc);
  await Promise.all(sc.castPages.map(page => h.assets.prepare(sc, page)));
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.calls.map(row => row.purpose), ['background', 'scene']);
  const event = h.calls.find(row => row.purpose === 'scene');
  assert.equal(event.referenceImages.length, 1);
  assert.ok(event.prompt.includes(eventText));
  assert.ok(event.prompt.includes('No registered human character needs to appear'));
  assert.ok(!event.prompt.includes('“뒤로!”'), 'future dialogue does not steer the event image');
  assert.equal(h.assets.view(sc, sc.castPages[0]).eventBackground, '', 'no early spoilers');
  assert.ok(h.assets.view(sc, sc.castPages[1]).eventBackground);
  assert.equal(h.assets.view(sc, sc.castPages[1]).eventBackground, h.assets.view(sc, sc.castPages[2]).eventBackground, 'the reaction holds the same event art');
  for (const page of sc.castPages) await h.assets.prepare(sc, page);
  assert.equal(h.calls.length, 2, 'no duplicate billing on revisit');
  const restored = setup(sc, { records: h.records, key: '' });
  await restored.assets.prepare(sc, sc.castPages[1], { generate: false });
  assert.ok(restored.assets.view(sc, sc.castPages[1]).eventBackground);
  assert.equal(restored.calls.length, 0);
});

test('event requests do not wait for an observer portrait and do not copy that observer into the action', async () => {
  let release;
  const waiting = new Promise(resolve => release = resolve), sc = scene([nadia]);
  const h = setup(sc, { beforeImage: body => body.purpose === 'portrait' ? waiting : Promise.resolve() });
  const pending = h.assets.prepare(sc, sc.castPages[1]);
  await new Promise(setImmediate);
  assert.ok(h.calls.some(row => row.purpose === 'scene'), 'object event starts while standing portrait is pending');
  assert.equal(h.calls.find(row => row.purpose === 'scene').referenceImages.length, 1, 'observer is not an event participant');
  assert.equal(dialogueWait(sc.castPages[2], { ...h.assets.view(sc, sc.castPages[2]), speakerId: 'nadia', portraits: [] }, { enabled: true }), true, 'event backgrounds never hide or bypass the speaker sprite');
  release(); await pending;
  const view = h.assets.view(sc, sc.castPages[1]);
  assert.equal(view.background, view.eventBackground);
  assert.equal(view.portraits[0].id, 'nadia');
  assert.equal('cg' in view, false, 'no separate CG overlay');
});

test('event evidence cannot come from quoted dialogue or a future beat, and offstage event participants block event generation', () => {
  const sc = scene([nadia]), input = decision(sc);
  input.beats[0].cg = true; input.beats[0].eventEvidence = eventText; input.beats[0].eventFocus = 'future attack';
  input.beats[1].eventParticipants = ['C0', 'C9'];
  input.beats[2].cg = true; input.beats[2].eventEvidence = '뒤로!'; input.beats[2].eventFocus = 'quoted attack';
  const rows = validateCast(sc, input);
  assert.equal(rows[0].direction.cg, false);
  assert.equal(rows[2].direction.cg, false);
  assert.deepEqual(rows[1].direction.event.characterIds, ['nadia']);
  assert.equal(rows[1].direction.cg, false);
  assert.equal(rows[1].direction.event.castComplete, false);
});

test('ordinary dialogue has no event request and automatic event mode can be disabled', async () => {
  assert.equal(eventSceneSetting({ cg: 'off' }), 'off', 'preserve the previous paid-feature preference');
  assert.equal(eventSceneSetting({ cg: 'on' }), 'on');
  assert.equal(eventSceneSetting({ cg: 'off', eventScenes: 'on' }), 'on');
  assert.equal(eventSceneSetting({ cg: 'on', eventScenes: 'off' }), 'off');
  assert.equal(eventSceneSetting({}), 'off');
  assert.equal(eventSceneSetting(null), 'off');
  assert.equal(eventSceneSetting({ eventScenes: 'off' }), 'off', 'preserve an explicit new preference');
  const sc = scene(), h = setup(sc, { enabled: false });
  await h.assets.prepare(sc, sc.castPages[1]);
  assert.deepEqual(h.calls.map(row => row.purpose), ['background']);
  const ordinary = scene(); ordinary.castPages = [{ start: 0, text: '“잘 지냈어?”' }]; ordinary.publicText = ordinary.castPages[0].text;
  const quiet = setup(ordinary); await quiet.assets.prepare(ordinary, ordinary.castPages[0]);
  assert.equal(quiet.calls.filter(row => row.purpose === 'scene').length, 0);
  const prompt = castRequest(sc, 'gpt-6-luna');
  assert.ok(prompt.instructions.includes('quoted, recalled, predicted, imagined, negated or metaphorical'));
  for (const name of ['eventEvidence', 'eventFocus', 'eventParticipants', 'eventCastComplete']) assert.ok(prompt.text.format.schema.properties.beats.items.required.includes(name));
});

test('the upcoming published event is prefetched, but not displayed before its own beat', async () => {
  const sc = scene(), h = setup(sc);
  const { completion } = await prepareAhead({ scene: sc, pages: sc.castPages, castDirector: h.cast, assets: h.assets, active: () => true, generate: true, preload: async () => {}, tier: 'images' });
  await completion;
  assert.equal(h.calls.filter(row => row.purpose === 'scene').length, 1);
  assert.equal(h.assets.view(sc, sc.castPages[0]).eventBackground, '');
  assert.ok(h.assets.view(sc, sc.castPages[1]).eventBackground);
});

test('a saved suitable expression is reused across turns and reloads, only a missing emotion is generated', async () => {
  const records = new Map(), calls = [];
  const make = () => createStageAssets({ getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], onChange: () => {}, onError: assert.fail,
    read: async key => records.get(key), write: async row => records.set(row.key, row), fetchImage: async (_u, init) => { const body = JSON.parse(init.body); calls.push(body); return Response.json({ imageUrl: `data:image/png;base64,${Buffer.from(String(calls.length)).toString('base64')}` }); } });
  const withEmotion = (emotion, text) => ({ ...scene([nadia]), characters: [nadia], publicText: text, expressions: [{ offset: 0, characterId: nadia.id, expression: emotion }] });
  const assets = make();
  await assets.prepare(withEmotion('serious', '나디아는 진지하게 문을 살폈다.'), {});
  const serious = assets.view(withEmotion('serious', ''), {}).portraits[0].url;
  await assets.prepare(withEmotion('surprised', '나디아는 깜짝 놀랐다.'), {});
  await assets.prepare(withEmotion('serious', '나디아는 진지하게 상황을 설명했다.'), {});
  assert.equal(assets.view(withEmotion('serious', ''), {}).portraits[0].url, serious);
  const before = calls.length, restored = make();
  await restored.prepare(withEmotion('serious', '다음 턴에서도 나디아는 같은 태도를 유지했다.'), {});
  assert.equal(calls.length, before);
  assert.equal(calls.filter(row => row.purpose === 'expression').length, 2, 'one image each for serious and surprised');
  assert.equal(restored.view(withEmotion('serious', ''), {}).portraits[0].url, serious);
});
