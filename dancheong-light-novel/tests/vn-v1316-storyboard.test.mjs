import test from 'node:test';
import assert from 'node:assert/strict';
import { compositionFor, createCueWindow, createCompositionContinuity, createArtContinuity } from '../public/vn-storyboard.mjs';
import { fullAutoVisuals } from '../public/vn-autoplay.mjs';
import { createVoice, voiceLine, readingVoiceLine, setTypecastVoices, defaultVoice } from '../public/vn-voice.mjs';

test('inner-space direction needs narration evidence and never hides a speaking actor', () => {
  const narration = { text: '머릿속이 새하얘졌다. 생각만 맴돌았다.' };
  assert.equal(compositionFor(narration, {}), 'thought');
  assert.equal(compositionFor({ ...narration, quoted: true }, {}), 'stage');
  assert.equal(compositionFor({ text: '그는 앞으로 걸었다.' }, { composition: { mode: 'thought', evidence: narration.text } }), 'stage');
  assert.equal(compositionFor({ text: '“머릿속이 새하얘졌다.” 그가 말했다.' }, {}), 'stage');
  assert.equal(compositionFor({ text: '교실에는 아무도 없었다.' }, { composition: { mode: 'scenery', evidence: '아무도 없었다' } }), 'scenery');
});

test('five-second preparation does not consume the cue window, but later art cannot interrupt a line', () => {
  let time = 0; const window = createCueWindow({ now: () => time });
  assert.equal(window.open('p1', { waiting: true }), false);
  time = 5000; assert.equal(window.open('p1', {}), true);
  time = 6000; assert.equal(window.open('p1', { revealed: 8 }), true);
  assert.equal(window.open('p1', { revealed: 15 }), false);
  time = 6400; assert.equal(window.open('p1', {}), false);
  assert.equal(window.open('p2', {}), true);
  const frame = createCompositionContinuity();
  assert.equal(frame.select('p1', 'stage', true), 'stage');
  assert.equal(frame.select('p1', 'thought', false), 'stage');
  assert.equal(frame.select('p2', 'thought', true), 'thought');
});

const event = { environment: 'room.webp', background: 'event.webp', eventBackground: 'event.webp', eventKey: 'impact', eventStart: 10, eventCharacterIds: ['a'], portraits: [{ id: 'a' }, { id: 'witness' }], castStatus: 'ready' };
test('an event enters only at its own beat, remains through its reaction, and never removes witness metadata', () => {
  const art = createArtContinuity(), opt = { scope: 'work1', pageKey: 'p1', start: 10, cueOpen: true };
  assert.equal(art.select(event, { ...opt, decoded: false }).background, 'room.webp');
  assert.equal(art.select(event, opt).background, 'event.webp');
  assert.equal(art.select(event, { ...opt, pageKey: 'p2', start: 11, cueOpen: false }).background, 'event.webp');
  assert.deepEqual(art.select(event, opt).portraits, event.portraits);
  const quiet = art.select(event, { ...opt, composition: 'thought' });
  assert.equal(quiet.background, 'room.webp'); assert.deepEqual(quiet.eventCharacterIds, []);
  assert.equal(art.select(event, { ...opt, scope: 'work2', cueOpen: false }).background, 'room.webp');
});

test('late event art cannot jump into a reaction or become eligible just because this line finished; revisiting can show it', () => {
  const art = createArtContinuity(), opt = { scope: 'work', pageKey: 'p1', start: 10, cueOpen: false };
  assert.equal(art.select(event, opt).background, 'room.webp');
  assert.equal(art.select(event, { ...opt, revisiting: true }).background, 'room.webp');
  assert.equal(art.select(event, { ...opt, pageKey: 'p2', start: 11, cueOpen: true }).background, 'room.webp');
  assert.equal(art.select(event, { ...opt, revisiting: true }).background, 'event.webp');
});

test('full auto respects deliberate off-camera shots but still requires verified cast identity', () => {
  assert.equal(fullAutoVisuals({ castStatus: 'checking' }, { offCamera: true }).action, 'wait');
  assert.equal(fullAutoVisuals({ castStatus: 'error' }, { offCamera: true }).action, 'stop');
  assert.equal(fullAutoVisuals({ castStatus: 'ready', pending: [{ id: 'a', status: 'generating' }] }, { offCamera: true }).action, 'ready');
  assert.equal(fullAutoVisuals({ castStatus: 'ready', pending: [{ id: 'a', status: 'generating' }] }).action, 'wait');
});

const tick = () => new Promise(resolve => setImmediate(resolve));
test('backlog cache-only replay never joins or removes a pending paid job', async () => {
  let release, calls = 0;
  const voice = createVoice({ getEnabled: () => true, getKey: () => 'fixture', read: async () => null, write: async () => {},
    fetchVoice: () => { calls++; return new Promise(resolve => { release = () => resolve(Response.json({ audioUrl: 'data:audio/mpeg;base64,aGk=' })); }); },
    makeAudio: () => ({ play: async () => {}, pause() {}, currentTime: 0 }) });
  const line = { key: 'same', playbackKey: 'p1', provider: 'openai', text: '본문', voice: 'coral' };
  voice.update(line); await tick(); assert.equal(calls, 1);
  assert.equal(await voice.replayStored(line), false);
  assert.equal(voice.busy, true, 'the original request is still tracked');
  voice.replay(line); await tick(); assert.equal(calls, 1);
  release(); await tick(); assert.equal(voice.phase, 'playing'); voice.reset();
});

test('Gemini late vocal tags reuse one take, and old narrator takes remain reachable', async () => {
  const page = { turnId: 't', start: 0, quoted: true, rawText: '“괜찮아.”' }, view = { castStatus: 'ready', speakerId: 'a', portraits: [{ id: 'a', profile: '여성' }] };
  const first = voiceLine(page, view, 'w', '', {}, { provider: 'gemini-3.8-flash-tts' });
  const later = voiceLine(page, view, 'w', '', { cue: '한숨을 쉬었다' }, { provider: 'gemini-3.8-flash-tts' });
  assert.equal(first.key, later.key); assert.notEqual(first.text, later.text);
  const narration = readingVoiceLine({ turnId: 't', start: 1, text: '바람이 불었다.' }, view, 'w');
  assert.match(narration.fallbackKeys[0], /marin/);
  assert.deepEqual(readingVoiceLine({ turnId: 't', start: 1, text: '바람이 불었다.' }, view, 'w', '', {}, { narrator: 'ballad' }).fallbackKeys, []);
});

test('a sole suitable Typecast voice is preferred over an unrelated mixed pool', () => {
  setTypecastVoices([
    { id: 'tc_000000000000000000000001', name: '해설', gender: 'male', age: 'middle_age', useCases: ['Audiobook'] },
    { id: 'tc_000000000000000000000002', name: '여학생', gender: 'female', age: 'teenager', useCases: ['Anime'] },
    { id: 'tc_000000000000000000000003', name: '남학생', gender: 'male', age: 'teenager', useCases: ['Anime'] },
  ]);
  for (const id of ['a', 'b', 'c', 'd']) assert.equal(defaultVoice(id, '여학생', 'typecast'), 'tc_000000000000000000000002');
});
