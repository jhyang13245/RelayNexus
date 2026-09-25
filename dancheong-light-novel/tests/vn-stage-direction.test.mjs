import test from 'node:test';
import assert from 'node:assert/strict';
import { stageOrder, stagePositions, slotWidth, heightScale, speakerHue, weatherFor, mergeDirection } from '../public/vn-stage.mjs';
import { alphaBounds, headCentre, normalisedFrame } from '../public/vn-sprite.mjs';
import { ambienceFor } from '../public/vn-audio.mjs';
import { castRequest, validateCast, directionFor, createCastDirector } from '../public/vn-cast.mjs';
import { createStageAssets, emotionsFor, styledKey, artDirection, ART_DIRECTION, cgKey } from '../public/vn-assets.mjs';
import { portraitKey } from '../public/vn-scene.mjs';

test('actors keep their order while present; newcomers join on the right', () => {
  assert.deepEqual(stageOrder([], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(stageOrder(['a', 'b', 'c'], ['c', 'b']), ['b', 'c'], 'leaving does not reorder the rest');
  assert.deepEqual(stageOrder(['b', 'c'], ['a', 'c', 'b']), ['b', 'c', 'a']);
});

test('positions are stable per line-up size and stay inside the stage', () => {
  for (const layout of ['nvl', 'adv']) for (const narrow of [false, true]) for (let count = 1; count <= 3; count++) {
    const xs = stagePositions(count, { layout, narrow });
    assert.equal(xs.length, count);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, 'left to right');
    for (const x of xs) assert.ok(x > 0 && x < 1);
    assert.ok(slotWidth(count, narrow) > 0 && slotWidth(count, narrow) <= 1);
  }
  assert.ok(stagePositions(1)[0] > 0.5, 'NVL keeps a lone actor clear of left-side prose');
  assert.equal(stagePositions(1, { layout: 'adv' })[0], 0.5);
});

test('height scale reads an explicit profile height only, within a safe range', () => {
  assert.equal(heightScale('성격이 밝다'), 1);
  assert.ok(heightScale('키 152cm, 조용한 학생') < heightScale('키: 181cm'));
  assert.ok(heightScale('키 120cm') >= 0.88 && heightScale('height 210 cm') <= 1.05);
});

test('speaker hue is stable and weather maps only explicit weather words', () => {
  assert.equal(speakerHue('nadia'), speakerHue('nadia'));
  assert.ok(speakerHue('nadia') >= 0 && speakerHue('nadia') < 360);
  assert.equal(weatherFor({ weather: '가을비' }), 'rain');
  assert.equal(weatherFor({ weather: '함박눈' }), 'snow');
  assert.equal(weatherFor({ weather: '짙은 안개' }), 'fog');
  assert.equal(weatherFor({ weather: '맑음' }), 'clear');
  assert.equal(weatherFor({}), 'clear');
});

test('model direction overrides text rules; text rules remain the fallback', () => {
  const text = { shot: 'medium', memory: false, impact: true, tone: 'normal' };
  assert.deepEqual(mergeDirection(text, null), { ...text, mood: 'normal', transition: 'none', fx: 'shake', focusId: '' });
  const merged = mergeDirection({ ...text, impact: false }, { shot: 'close', mood: 'tense', transition: 'flash', fx: 'heavy_shake', focusId: 'v' });
  assert.equal(merged.shot, 'close'); assert.equal(merged.mood, 'tense'); assert.equal(merged.fx, 'heavy_shake'); assert.equal(merged.focusId, 'v');
  assert.equal(mergeDirection({ ...text, memory: true }, { shot: 'medium', mood: 'warm' }).mood, 'memory', 'an explicit recollection keeps its grade');
});

test('ambience follows weather, place and mood', () => {
  assert.deepEqual(ambienceFor({ location: '교실' }, { light: 'night' }), { bed: 'room', pad: null });
  assert.deepEqual(ambienceFor({ location: '강변' }, { light: 'night' }), { bed: 'night', pad: null });
  assert.equal(ambienceFor({ location: '교실' }, { weather: 'rain' }).bed, 'rain');
  assert.equal(ambienceFor({ location: '광장' }, { mood: 'tense' }).pad, 'tense');
  assert.equal(ambienceFor({}, { mood: 'tense', memory: true }).pad, 'memory');
});

// A synthetic cut-out: head disc + torso block on transparency.
function sprite(width, height, { top = 10, face = [240, 200, 180], shiftX = 0 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2 + shiftX, bodyTop = top + 22;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const head = Math.hypot(x - cx, y - (top + 11)) <= 11, body = y >= bodyTop && Math.abs(x - cx) <= 18;
    if (!head && !body) continue;
    const i = (y * width + x) * 4;
    const colour = head ? face : [40, 60, 120];
    data.set([...colour, 255], i);
  }
  return data;
}

test('alpha bounds and head centre find the figure, not the canvas', () => {
  const data = sprite(80, 100, { top: 12, shiftX: 5 });
  const bounds = alphaBounds(data, 80, 100);
  assert.equal(bounds.top, 12); assert.equal(bounds.bottom, 99);
  assert.ok(Math.abs(headCentre(data, 80, bounds) - 45) <= 1);
  assert.ok(bounds.transparentFraction > 0.4);
  assert.equal(alphaBounds(new Uint8ClampedArray(16), 2, 2), null);
});

test('normalised frame puts the hair near the top and keeps a cropped edge flush', () => {
  const frame = normalisedFrame({ left: 10, right: 70, top: 30, bottom: 999, width: 61, height: 970 }, 40, 1000);
  assert.equal(frame.y + 970, frame.outHeight, 'mid-thigh crop stays on the frame edge');
  assert.ok(frame.y / frame.outHeight > 0.02 && frame.y / frame.outHeight < 0.04);
  assert.ok(Math.abs(frame.x + 30 - frame.outWidth / 2) <= 1, 'head is centred');
});

const nadia = { id: 'visitor', name: '나디아', referenceMode: 'PRIMARY', primaryAssetRef: 'nadia.webp' };
const scene = () => ({ scope: 'dir', environmentKey: 'room', world: { location: '방', time: '21:00' }, publicText: '나디아가 내 앞에 섰다. 나디아는 미소 지었다. “안녕.” 나디아는 깜짝 놀랐다. 문이 쾅 닫혔다. 나디아는 불안해졌다.', candidates: [nadia],
  castPages: [{ start: 0, text: '나디아가 내 앞에 섰다. 나디아는 미소 지었다.' }, { start: 13, text: '“안녕.” 나디아는 깜짝 놀랐다.' }, { start: 18, text: '문이 쾅 닫혔다. 나디아는 불안해졌다.' }] });
const beat = (start, extra = {}) => ({ beat: `P${start}`, speaker: '', onStage: [{ candidate: 'C0', evidence: '나디아가 내 앞에 섰다.' }], ...extra });
const directed = () => ({ beats: [
  beat(0, { expressions: [{ candidate: 'C0', expression: 'smile', evidence: '나디아는 미소 지었다.' }], focus: 'C0', shot: 'medium', transition: 'none', fx: 'none', mood: 'warm', cg: false }),
  beat(13, { speaker: 'C0', expressions: [{ candidate: 'C0', expression: 'surprised', evidence: '나디아는 깜짝 놀랐다.' }], focus: 'C0', shot: 'close', transition: 'none', fx: 'none', mood: 'tense', cg: true }),
  beat(18, { expressions: [{ candidate: 'C0', expression: 'worried', evidence: '나디아는 불안해졌다.' }], focus: '', shot: 'medium', transition: 'none', fx: 'heavy_shake', mood: 'tense', cg: false }),
] });

test('cast request asks for direction with closed vocabularies; legacy decisions still validate', () => {
  const request = castRequest(scene(), 'gpt-5.6-luna');
  const item = request.text.format.schema.properties.beats.items;
  for (const field of ['expressions', 'focus', 'shot', 'transition', 'fx', 'mood', 'cg']) assert.ok(item.required.includes(field));
  assert.ok(item.properties.fx.enum.includes('heavy_shake'));
  const legacy = { beats: directed().beats.map(({ beat: b, speaker, onStage }) => ({ beat: b, speaker, onStage })) };
  assert.ok(validateCast(scene(), legacy).every(row => row.direction === null));
});

test('direction is validated per beat and never trusts off-stage handles or unknown values', () => {
  const rows = validateCast(scene(), directed());
  assert.equal(rows[1].direction.shot, 'close'); assert.equal(rows[1].direction.expressions.visitor, 'surprised'); assert.equal(rows[1].direction.cg, true);
  assert.equal(rows[2].direction.fx, 'heavy_shake');
  const odd = directionFor({ shot: 'dutch', fx: 'explode', mood: 'x', transition: 'spin', expressions: [{ candidate: 'C5', expression: 'smile' }, { candidate: 'C0', expression: 'smirk' }], focus: 'C3' }, [nadia], new Set([0]));
  assert.deepEqual(odd, { expressions: {}, focusId: '', shot: 'medium', transition: 'none', fx: 'none', mood: 'normal', cg: false });
});

test('model expressions override text cues for on-stage people', () => {
  const sc = { expressions: [{ offset: 0, characterId: 'visitor', expression: 'sad' }], direction: { expressions: { visitor: 'smile' } } };
  assert.equal(emotionsFor(sc, { end: 5 }).visitor, 'smile');
  assert.equal(emotionsFor({ ...sc, direction: null }, { end: 5 }).visitor, 'sad');
});

test('faces hold without new evidence and never change for a future beat or old ungrounded guesses', () => {
  const decision = directed();
  decision.beats[1].expressions = [{ candidate: 'C0', expression: 'worried', evidence: '나디아는 불안해졌다.' }];
  decision.beats[2].expressions = [{ candidate: 'C0', expression: 'serious' }];
  const rows = validateCast(scene(), decision);
  assert.deepEqual(rows.map(row => row.direction.expressions.visitor), ['smile', 'smile', 'smile']);
  const legacy = directed();
  for (const row of legacy.beats) delete row.expressions[0].evidence;
  assert.ok(validateCast(scene(), legacy).every(row => !Object.keys(row.direction.expressions).length));
});

test('default art direction keeps legacy cache keys; a custom style gets its own keys', () => {
  assert.equal(styledKey('k'), 'k');
  assert.notEqual(styledKey('k', '수채화'), 'k');
  assert.equal(artDirection(''), ART_DIRECTION);
  assert.ok(artDirection('수채화 "질감"').includes(JSON.stringify('수채화 "질감"')));
});

test('direction-driven expressions are generated, and one event CG references the made sprites', async () => {
  const requests = [], records = new Map();
  const cast = createCastDirector({ getConnection: () => ({ key: 'k', endpoint: '/api/openai/responses', model: 'gpt-5.6-luna' }), read: async () => null, write: async () => {},
    fetchDecision: async () => new Response(JSON.stringify({ output_text: JSON.stringify(directed()) })) });
  const assets = createStageAssets({ castDirector: cast, getKey: () => 'img', getQuality: () => 'low', getReferences: () => [], getCgEnabled: () => true, onChange: () => {}, onError: error => { throw new Error(error); },
    read: async key => records.get(key), write: async row => records.set(row.key, row),
    fetchImage: async (_url, init) => { const body = JSON.parse(init.body); requests.push(body); return new Response(JSON.stringify({ imageUrl: `data:image/png;base64,${Buffer.from(body.purpose + requests.length).toString('base64')}` })); } });
  const sc = scene();
  for (const page of sc.castPages) await assets.prepare(sc, page);
  const expressions = requests.filter(row => row.purpose === 'expression').map(row => row.prompt);
  assert.ok(expressions[1].includes('나디아는 깜짝 놀랐다.'), 'the image model receives the beat situation');
  assert.ok(!expressions[0].includes('나디아는 깜짝 놀랐다.'), 'later reactions are not sent to an earlier image');
  assert.ok(requests.every(row => row.purpose === 'expression' || row.prompt.startsWith(ART_DIRECTION)), 'new images share one art direction');
  const cgs = requests.filter(row => row.purpose === 'scene');
  assert.equal(cgs.length, 1, 'at most one CG per paragraph');
  assert.equal(cgs[0].referenceImages.length, 2, 'background + the on-stage sprite');
  assert.equal(assets.view(sc, sc.castPages[0]).cg, '', 'CG appears from its beat, not before');
  assert.ok(assets.view(sc, sc.castPages[1]).cg.startsWith('data:image/png'));
  assert.ok(records.has(cgKey(sc, 13)));
  assert.equal(assets.view(sc, sc.castPages[1]).direction.shot, 'close');
  assert.ok(records.has(portraitKey('dir', nadia)), 'legacy portrait key is unchanged');
});

test('event CG is never requested when the setting is off', async () => {
  const requests = [];
  const cast = createCastDirector({ getConnection: () => ({ key: 'k', endpoint: '/x', model: 'gpt-5.6-luna' }), read: async () => null, write: async () => {},
    fetchDecision: async () => new Response(JSON.stringify({ output_text: JSON.stringify(directed()) })) });
  const assets = createStageAssets({ castDirector: cast, getKey: () => 'img', getQuality: () => 'low', getReferences: () => [], onChange: () => {}, onError: () => {}, read: async () => null, write: async () => {},
    fetchImage: async (_url, init) => { requests.push(JSON.parse(init.body)); return new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,eA==' })); } });
  const sc = scene();
  for (const page of sc.castPages) await assets.prepare(sc, page);
  assert.equal(requests.filter(row => row.purpose === 'scene').length, 0);
  assert.equal(assets.view(sc, sc.castPages[1]).cg, '');
});
