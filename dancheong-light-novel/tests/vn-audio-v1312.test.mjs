import test from 'node:test';
import assert from 'node:assert/strict';
import { integratedLoudness, normalizationGain, speechBounds } from '../public/vn-loudness.mjs';
import { analyzeTrack, waitForBoundary } from '../public/vn-loop.mjs';
import { speakableKorean, sinoKorean, nativeKorean, actingNotes } from '../public/vn-speech-ko.mjs';
import { voiceLine, createVoice } from '../public/vn-voice.mjs';
import { roomFor, analyzeVoice } from '../public/vn-voice-post.mjs';
import { moodPrompt, musicIdentity, generatedRecord, MOODS } from '../public/vn-music-ai.mjs';
import { loopPlan, createWorkMusic, musicKey, MUSIC_ANALYSIS_VERSION } from '../public/vn-work-music.mjs';
import { estimateCost } from '../public/vn-cost-core.mjs';
import { resolveCostCategory } from '../public/vn-costs.mjs';
import { POST } from '../app/api/gemini/music/route.ts';

const sine = (amp, seconds = 5, sr = 48000, f = 997) => { const a = new Float32Array(sr * seconds); for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin(2 * Math.PI * f * i / sr); return a; };

test('loudness follows ITU-R BS.1770 reference tones', () => {
  assert.ok(Math.abs(integratedLoudness([sine(1)], 48000) + 3.01) < 0.1, '0 dBFS 997 Hz mono ≈ -3.01 LUFS');
  assert.ok(Math.abs(integratedLoudness([sine(0.1)], 48000) + 23.01) < 0.1);
  assert.ok(Math.abs(integratedLoudness([sine(0.1), sine(0.1)], 48000) + 20.0) < 0.1, 'two channels add 3 dB');
  assert.ok(Math.abs(integratedLoudness([sine(0.1, 5, 44100)], 44100) + 23.01) < 0.1, 'coefficients follow the sample rate');
  assert.equal(integratedLoudness([new Float32Array(48000)], 48000), -Infinity);
});

test('normalisation gain is limited and never clips', () => {
  assert.ok(Math.abs(normalizationGain(-26, -20) - 10 ** (6 / 20)) < 1e-9);
  assert.equal(normalizationGain(-80, -20), 10 ** (12 / 20), 'boost capped at +12 dB');
  assert.equal(normalizationGain(-Infinity, -20), 1, 'silence untouched');
  assert.ok(normalizationGain(-26, -20, { peak: 0.9 }) <= 0.97 / 0.9 + 1e-9, 'peaks stay below full scale');
});

test('speech bounds trim silence but keep a pad', () => {
  const sr = 16000, data = new Float32Array(sr * 2);
  for (let i = sr * 0.5; i < sr * 1.2; i++) data[i] = 0.3 * Math.sin(i / 3);
  const b = speechBounds([data], sr);
  assert.ok(b.start > 0.4 && b.start < 0.5 && b.end > 1.2 && b.end < 1.3, JSON.stringify(b));
  const v = analyzeVoice([data], sr);
  assert.ok(Math.abs(integratedLoudness([data.subarray(Math.floor(v.start * sr), Math.ceil(v.end * sr)).map(x => x * v.gain)], sr) + 16) < 0.8, 'levelled to -16 LUFS');
});

// Synthetic track: quiet intro, drum pattern with accented downbeats and a
// bar-periodic chord, then a fade-out tail.
function track(bpm, seconds = 60, sr = 44100, intro = 4, fade = 8) {
  const n = sr * seconds, out = new Float32Array(n), beat = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / sr; let v = 0;
    if (t >= intro) {
      const inBeat = (t - intro) % beat, index = Math.floor((t - intro) / beat);
      v += (index % 4 === 0 ? 1 : 0.45) * Math.exp(-inBeat * 30) * Math.sin(2 * Math.PI * 60 * inBeat) * 0.8;
      v += 0.12 * Math.sin(2 * Math.PI * [220, 174.6, 196, 164.8][Math.floor(index / 4) % 4] * t);
    } else v = 0.02 * Math.sin(2 * Math.PI * 220 * t);
    out[i] = v * (t > seconds - fade ? Math.max(0, (seconds - t) / fade) : 1);
  }
  return out;
}

test('tempo, bar grid and a bar-aligned loop that skips intro and fade-out', () => {
  for (const [bpm, hint] of [[120, 0], [84, 84], [140, 0]]) {
    const a = analyzeTrack([track(bpm)], 44100, { bpmHint: hint });
    assert.ok(Math.abs(a.bpm - bpm) < 0.3, `bpm ${a.bpm} for ${bpm}`);
    const bar = 240 / bpm;
    const onBar = t => { const k = (t - 4) / bar; return Math.abs(k - Math.round(k)) < 0.03; };
    assert.ok(a.loop.barAligned && onBar(a.loop.start) && onBar(a.loop.end), JSON.stringify(a.loop));
    assert.ok(a.loop.start >= 3.9 && a.loop.end <= 52 + 0.1, 'intro skipped and fade-out excluded');
  }
});

test('mood switches wait for the next bar, or a beat when the bar is long', () => {
  const grid = { origin: 4, beat: 0.5, bar: 2 };
  assert.ok(Math.abs(waitForBoundary(5.2, grid) - 0.8) < 1e-9);
  assert.ok(Math.abs(waitForBoundary(4.1, { origin: 0, beat: 1, bar: 4 }, { maxWait: 2 }) - 0.9) < 1e-9, 'falls back to the next beat');
  assert.equal(waitForBoundary(1, null), 0.25);
});

test('loop plan overlaps passes by the crossfade on the same bar content', () => {
  const plan = loopPlan({ start: 6, end: 52, crossfade: 1 }, 0, 10);
  assert.deepEqual(plan, { crossfade: 1, nextAt: 10 + 52 - 1, nextOffset: 5, stopAt: 62 });
  assert.equal(loopPlan({ start: 0.4, end: 30, crossfade: 1.5 }, 0, 0).crossfade, 0.4, 'never reaches before the file start');
});

// Minimal Web Audio stand-in: records scheduling so timing can be asserted.
function fakeAudio() {
  const log = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  const context = { currentTime: 0, state: 'running', destination: node(), resume: async () => {},
    createGain: () => ({ ...node(), gain: param() }),
    createBufferSource: () => ({ ...node(), start(when, offset) { log.push({ type: 'start', when, offset }); }, stop(when) { log.push({ type: 'stop', when }); } }),
    decodeAudioData: async () => { const data = track(120, 60); return { numberOfChannels: 1, sampleRate: 44100, duration: 60, getChannelData: () => data }; },
    close: async () => {} };
  return { context, log };
}

test('music engine loops on bar lines and lands a mood change on the next bar', async () => {
  const { context, log } = fakeAudio();
  const records = new Map([[musicKey('w', 'normal'), { key: musicKey('w', 'normal'), blob: new Blob([new Uint8Array(4)], { type: 'audio/mpeg' }), title: 'A', credit: 'c', license: 'l', savedAt: 1, generated: { bpm: 120 } }],
    [musicKey('w', 'tense'), { key: musicKey('w', 'tense'), blob: new Blob([new Uint8Array(4)], { type: 'audio/mpeg' }), title: 'B', credit: 'c', license: 'l', savedAt: 2, generated: { bpm: 120 } }]]);
  const writes = [];
  const music = createWorkMusic({ enabled: () => true, volume: () => 1, read: async key => records.get(key), write: async row => { writes.push(row); records.set(row.key, row); }, createContext: () => context });
  await music.update('w', 'normal');
  const first = log.find(row => row.type === 'start');
  assert.equal(first.offset, 0, 'a new track starts with its intro');
  assert.equal(writes[0].analysis.version, MUSIC_ANALYSIS_VERSION, 'analysis is cached on the stored track');
  context.currentTime = 7.3; // 1.3 s into bar 2 (bars at 4, 6, 8 …)
  await music.update('w', 'tense');
  const second = log.filter(row => row.type === 'start').at(-1);
  assert.ok(Math.abs(second.when - 8) < 0.05, `switch at ${second.when}, next bar line is 8.0`);
  music.dispose();
});

test('Korean text is rewritten into what should be heard', () => {
  const cases = [
    ['“3시 30분에 만나.”', '세 시 삼십 분에 만나.'],
    ['사과 2개랑 학생 20명, 21살.', '사과 두 개랑 학생 스무 명, 스물한 살.'],
    ['2026년 6월 10일, 10월이야.', '이천이십육 년 유월 십 일, 시월이야.'],
    ['3.5퍼센트? 75%!', '삼 점 오 퍼센트? 칠십오 퍼센트!'],
    ['연락처는 010-1234-5678.', '연락처는 공일공 일이삼사 오육칠팔.'],
    ['그건……말이지──', '그건…말이지…'],
    ['漢字(한자)는 어려워.', '한자는 어려워.'],
    ['(웃음) 그래~ ㅋㅋㅋ 알았어♪', '그래 크크 알았어'],
    ['뭐?!!! 정말!!!', '뭐?! 정말!'],
    ['『주문』을 외워', '주문을 외워'],
  ];
  for (const [input, expected] of cases) assert.equal(speakableKorean(input), expected, input);
  assert.equal(sinoKorean(10000), '만'); assert.equal(sinoKorean(110), '백십'); assert.equal(nativeKorean(20), '스무'); assert.equal(nativeKorean(20, false), '스물');
});

test('acting notes combine emotion, attached narration, mood and key-line emphasis', () => {
  const notes = actingNotes({ text: '…미안해…', emotion: 'sad', mood: 'memory', cue: '나디아가 흐느끼며 속삭였다.', emphasis: true });
  assert.match(notes, /sad/); assert.match(notes, /whisper/); assert.match(notes, /recollection/); assert.match(notes, /hesitation/); assert.match(notes, /key line/);
  assert.match(actingNotes({ text: '꺼져!! 당장!!', emotion: 'angry' }), /emphatic/);
});

const page = { turnId: 't', start: 10, end: 20, quoted: true, kind: 'dialogue', rawText: '“3시에 봐.”' };
const view = { castStatus: 'ready', speakerId: 'n', speakerName: '나디아', direction: { mood: 'tense', expressions: { n: 'angry' } }, portraits: [{ id: 'n', profile: '여성' }] };

test('voice line speaks prepared text with delivery notes; the old key stays reachable', () => {
  const line = voiceLine(page, view, 'scope', 'coral', { cue: '나디아가 속삭였다.' });
  assert.equal(line.text, '세 시에 봐.');
  assert.match(JSON.parse(line.context).delivery, /whisper/);
  assert.equal(JSON.parse(line.key)[0], 'vn-voice-3');
  assert.equal(line.fallbackKeys[0], JSON.stringify(['vn-voice-2', 'scope', 'n', 'coral', '세 시에 봐.', line.context]));
  assert.equal(line.legacyKey, JSON.stringify(['vn-voice-1', 'scope', 'n', 'coral', '3시에 봐.', JSON.stringify({ speaker: '나디아', mood: 'tense', emotion: 'angry' })]));
});

test('a line voiced before v13.12 plays from its old key without a new request', async () => {
  const line = voiceLine(page, view, 'scope', 'coral');
  const stored = new Map([[line.legacyKey, { key: line.legacyKey, url: 'data:audio/mpeg;base64,AAAA' }]]);
  let fetched = 0, played = '';
  const voice = createVoice({ getEnabled: () => true, getKey: () => 'k', read: async key => stored.get(key), write: async () => {}, fetchVoice: async () => { fetched++; return Response.json({}); },
    makeAudio: url => ({ play: async () => { played = url; }, pause() {}, set currentTime(v) {} }) });
  voice.update(line);
  for (let i = 0; i < 20 && !played; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(fetched, 0); assert.equal(played, 'data:audio/mpeg;base64,AAAA');
});

test('rooms follow the environment', () => {
  assert.ok(roomFor({ bed: 'room' }).wet > roomFor({ bed: 'day' }).wet);
  assert.ok(roomFor({ mood: 'memory' }).seconds > roomFor({ bed: 'room' }).seconds);
});

test('one musical identity per work; each mood has its tempo; always instrumental and loop-shaped', () => {
  const info = { slug: 'fate-seoul', title: 'Fate/Seoul', genre: '현대 판타지', summary: '서울의 성배전쟁' };
  const id = musicIdentity(info);
  const prompts = Object.keys(MOODS).map(mood => moodPrompt({ info, mood }));
  for (const row of prompts) {
    assert.match(row.prompt, /^Instrumental only, no vocals/u);
    assert.ok(row.prompt.includes(id.palette), 'shared palette');
    assert.match(row.prompt, /no fade-out/u);
    assert.ok([id.minor, id.major].includes(row.key), 'home key family');
  }
  assert.deepEqual(prompts.map(row => row.bpm), Object.values(MOODS).map(row => row.bpm));
  assert.match(moodPrompt({ info, mood: 'sad', model: 'lyria-3-clip-preview' }).prompt, /\[0:02 - 0:30\]/u);
  assert.match(moodPrompt({ info, mood: 'sad', direction: '비 오는 밤' }).prompt, /비 오는 밤/u);
  assert.equal(musicIdentity({ title: '기성학원', genre: '학원 로맨스' }).genre, 'school slice-of-life');
});

test('a generated track keeps exactly one previous version to go back to', () => {
  const blob = new Blob(['x']);
  const first = generatedRecord({ key: 'k', mood: 'sad', model: 'lyria-3.5', bpm: 66, prompt: 'p', blob, previous: { key: 'k', url: 'https://x/a.mp3', title: 'old', analysis: {} } });
  assert.equal(first.previous.title, 'old'); assert.equal(first.previous.analysis, undefined);
  const second = generatedRecord({ key: 'k', mood: 'sad', model: 'lyria-3.5', bpm: 66, prompt: 'p', blob, previous: first });
  assert.equal(second.previous.previous, undefined, 'no chain of old versions');
  assert.equal(generatedRecord({ key: 'k', mood: 'sad', model: 'lyria-3.5', blob, previous: { disabled: true } }).previous, undefined);
});

test('Lyria cost is per completed song and music is its own category', () => {
  assert.equal(estimateCost({ provider: 'gemini', model: 'lyria-3.5', state: 'complete' }).usd, 0.08);
  assert.equal(estimateCost({ provider: 'gemini', model: 'lyria-3-clip-preview', state: 'complete' }).usd, 0.04);
  assert.equal(estimateCost({ provider: 'gemini', model: 'lyria-3.5', state: 'error' }).usd, null);
  assert.equal(resolveCostCategory({ headers: { 'X-Dancheong-Purpose': 'music' } }), 'music');
});

const musicRequest = (body, headers = {}) => new Request('https://local/api/gemini/music', { method: 'POST', headers: { Authorization: 'Bearer fixture-gemini-key', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const prompt = moodPrompt({ info: { title: 'x' }, mood: 'normal' }).prompt;

test('music route sends generateContent with AUDIO+TEXT and returns the audio', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return Response.json({ candidates: [{ content: { parts: [{ text: '[Intro] piano' }, { inlineData: { mimeType: 'audio/mpeg', data: 'SUQz' } }] } }] }); });
  const response = await POST(musicRequest({ model: 'lyria-3.5', prompt }));
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/lyria-3.5:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'fixture-gemini-key');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.generationConfig, { responseModalities: ['AUDIO', 'TEXT'] });
  assert.equal(body.contents[0].parts[0].text, prompt);
  const result = await response.json();
  assert.equal(result.audioUrl, 'data:audio/mpeg;base64,SUQz'); assert.equal(result.text, '[Intro] piano'); assert.equal(result.model, 'lyria-3.5');
});

test('music route rejects bad input and hides provider messages', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'secret echo', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }, { status: 400 }));
  assert.equal((await POST(musicRequest({ model: 'suno', prompt }))).status, 400);
  assert.equal((await POST(musicRequest({ model: 'lyria-3.5', prompt: 'short' }))).status, 400);
  assert.equal((await POST(musicRequest({ model: 'lyria-3.5', prompt }, { Authorization: '' }))).status, 401);
  const failed = await POST(musicRequest({ model: 'lyria-3.5', prompt }));
  const message = (await failed.json()).error.message;
  assert.match(message, /유효하지 않거나/u); assert.doesNotMatch(message, /secret echo/u);
});

test('music route reports a missing audio part and blocked prompts', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{ content: { parts: [{ text: 'only text' }] } }] }));
  assert.equal((await POST(musicRequest({ model: 'lyria-3.5', prompt }))).status, 502);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }));
  assert.equal((await POST(musicRequest({ model: 'lyria-3.5', prompt }))).status, 422);
});
