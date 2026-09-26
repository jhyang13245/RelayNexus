import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicDirection, validatedMusic } from '../public/vn-music-direction.mjs';
import { castRequest, directionFor } from '../public/vn-cast.mjs';
import { createWorkMusic, musicKey, selectedTrack } from '../public/vn-work-music.mjs';

function reader() {
  let time = 0;
  const director = createMusicDirection({ now: () => time });
  return { director, at: (ms, index, mood = 'normal', extra = {}) => { time = ms; return director.update({ scope: 'work:r1', scene: '교실', pageKey: `t1:${index}`, index, mood, ...extra }); } };
}
const cue = name => ({ music: { cue: name, evidence: '이 장면의 공개된 서술' } });

test('alternating normal and sad sentences keep one soundtrack, including slow readers', () => {
  const r = reader(); assert.equal(r.at(0, 0), 'normal');
  for (let i = 1; i < 40; i++) assert.equal(r.at(i * 40000, i, i % 2 ? 'sad' : 'normal'), 'normal');
});

test('a sustained legacy mood needs three distinct pages and a minimum music hold', () => {
  const r = reader(); r.at(0, 0);
  assert.equal(r.at(1000, 1, 'sad'), 'normal');
  assert.equal(r.at(6000, 2, 'sad'), 'normal');
  assert.equal(r.at(15000, 3, 'sad'), 'normal');
  assert.equal(r.at(30000, 4, 'sad'), 'sad');
  assert.equal(r.at(31000, 5), 'sad', 'a neutral reply must not cancel the scene’s music');
  assert.equal(r.at(40000, 6, 'sad'), 'sad');
});

test('repaints, delayed image arrivals and rereading do not count as more musical evidence', () => {
  const r = reader(); r.at(0, 0);
  for (let ms = 1000; ms < 90000; ms += 1000) assert.equal(r.at(ms, 1, 'sad'), 'normal');
  assert.equal(r.at(90000, 0, 'sad'), 'normal');
  assert.equal(r.at(91000, 2, 'sad', { provisional: true }), 'normal');
  assert.equal(r.at(92000, 2, 'sad'), 'normal');
});

test('explicit silence survives keep and default moods, and a deliberate entrance can resume music', () => {
  const r = reader(); r.at(0, 0, 'sad');
  assert.equal(r.at(12000, 1, 'sad', cue('silence')), 'silence');
  for (let i = 2; i < 8; i++) assert.equal(r.at(i * 12000, i, 'normal', i % 2 ? cue('keep') : {}), 'silence');
  assert.equal(r.at(100000, 8, 'warm', cue('warm')), 'silence');
  assert.equal(r.at(108000, 9, 'normal', cue('keep')), 'warm');
});

test('new unscored scenes may start silent without starting a normal track', () => {
  const r = reader();
  assert.equal(r.at(0, 0, 'normal', cue('keep')), 'silence');
  assert.equal(r.at(50000, 1, 'sad', cue('keep')), 'silence');
  assert.equal(r.at(60000, 2, 'sad', { ...cue('sad'), scope: 'another:r1' }), 'sad');
  r.director.reset(); assert.equal(r.at(61000, 0, 'normal', cue('keep')), 'silence');
});

test('battle or horror entrances can use the faster dramatic gate, but cannot switch every sentence', () => {
  const r = reader(); r.at(0, 0, 'normal');
  assert.equal(r.at(3000, 1, 'tense', { ...cue('tense'), dramatic: true }), 'normal');
  assert.equal(r.at(8500, 2, 'tense', cue('keep')), 'tense');
  assert.equal(r.at(9000, 3, 'sad', cue('silence')), 'tense');
  assert.equal(r.at(17000, 4, 'sad', cue('keep')), 'silence');
});

test('soundtrack cues are in the existing direction request and require grounded evidence', () => {
  const request = castRequest({ scope: 'work', publicText: '대답 대신 길고 무거운 정적이 흘렀다.', candidates: [] }, 'gpt-6-luna');
  const schema = request.text.format.schema.properties.beats.items;
  assert.ok(schema.required.includes('music')); assert.ok(schema.properties.music.properties.cue.enum.includes('silence'));
  assert.match(request.instructions, /INDEPENDENT/);
  assert.deepEqual(validatedMusic({ cue: 'silence', evidence: '없는 서술을 가져왔어요' }, '원문'), { cue: 'keep', evidence: '' });
  const text = '대답 대신 길고 무거운 정적이 흘렀다.';
  const direction = directionFor({ mood: 'sad', music: { cue: 'silence', evidence: text } }, [], new Set(), '', text);
  assert.equal(direction.music.cue, 'silence');
  assert.equal(directionFor({ mood: 'sad' }, [], new Set()).music, undefined, 'old caches stay valid without an AI recheck');
});

test('silence never falls back to normal music and cancels a track still decoding', async () => {
  let reads = 0, starts = 0, release, decodedStarted;
  const ready = new Promise(resolve => { decodedStarted = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  assert.equal(await selectedTrack('work', 'silence', {}, async () => { reads++; }), null); assert.equal(reads, 0);
  const row = { key: musicKey('work', 'normal'), blob: new Blob(['x'], { type: 'audio/mpeg' }), savedAt: 1, analysis: { version: 1, gain: 1, grid: null, loop: { start: 0, end: 20, crossfade: 0 } } };
  const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const context = { currentTime: 0, state: 'running', destination: {}, createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    decodeAudioData: () => { decodedStarted(); return pending; }, createBufferSource: () => ({ connect() {}, disconnect() {}, start() { starts++; }, stop() {} }), close: async () => {} };
  const music = createWorkMusic({ enabled: () => true, volume: () => 1, read: async key => key === row.key ? row : null, write: async () => {}, createContext: () => context });
  const task = music.update('work', 'normal'); await ready;
  await music.update('work', 'silence'); release({}); await task;
  music.resume(); await music.update('work', 'silence');
  assert.equal(starts, 0, 'late decoding or user gestures cannot revive music during silence'); music.dispose();
});
