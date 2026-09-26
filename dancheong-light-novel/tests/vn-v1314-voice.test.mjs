import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/gemini/voice/route.ts';
import { createVoice, voiceLine, readingVoiceLine, castVoices, defaultVoice, vocalTags, voiceOptions, NARRATOR_VOICE } from '../public/vn-voice.mjs';
import { createMusicDirection, musicSeed } from '../public/vn-music-direction.mjs';
import { catalogRevision } from '../public/vn-editions.mjs';
import { estimateCost } from '../public/vn-cost-core.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const page = { turnId: 't1', start: 12, end: 20, quoted: true, kind: 'dialogue', rawText: '“같이 가자.”' };
const view = { castStatus: 'ready', speakerId: 'hina', speakerName: '히나', direction: { mood: 'normal', expressions: { hina: 'smile' } }, portraits: [{ id: 'hina', profile: '17세 여학생' }] };

test('an acting cue that streams in later neither interrupts nor re-buys the take; replay and revisits are free', async () => {
  let requests = 0; const saved = new Map(), played = [];
  const voice = createVoice({ getEnabled: () => true, getKey: () => 'k', read: async key => saved.get(key), write: async row => saved.set(row.key, row),
    fetchVoice: async () => { requests++; return Response.json({ audioUrl: 'data:audio/mpeg;base64,aGk=' }); },
    makeAudio: url => ({ play: async () => played.push(url), pause() {}, currentTime: 0 }) });
  const first = voiceLine(page, view, 'work:save', '', {});
  const later = voiceLine(page, view, 'work:save', '', { cue: '히나가 속삭였다.' });
  assert.notEqual(first.context, later.context, 'the late cue still refines the acting notes');
  assert.equal(first.key, later.key, 'but the take is the same');
  voice.update(first); await tick(); voice.update(later); await tick();
  assert.equal(requests, 1); assert.equal(played.length, 1);
  voice.replay(later); await tick(); assert.equal(requests, 1, '다시 듣기 is free');
  const reload = createVoice({ getEnabled: () => true, getKey: () => 'k', read: async key => saved.get(key), write: async row => saved.set(row.key, row),
    fetchVoice: async () => { requests++; return Response.json({}); }, makeAudio: () => ({ play: async () => {}, pause() {}, currentTime: 0 }) });
  reload.update(later); await tick(); await tick(); assert.equal(requests, 1, 'a reload or revisit reads the stored take');
});

test('lines cached by v13.12-v13.13 (context keys) still play for free', async () => {
  const line = voiceLine(page, view, 'scope', 'coral', { cue: '히나가 웃으며 말했다.' });
  const stored = new Map([[line.fallbackKeys[0], { url: 'data:audio/mpeg;base64,b2xk' }]]);
  let fetched = 0, played = '';
  const voice = createVoice({ getEnabled: () => true, getKey: () => 'k', read: async key => stored.get(key), write: async () => {}, fetchVoice: async () => { fetched++; return Response.json({}); },
    makeAudio: url => ({ play: async () => { played = url; }, pause() {}, currentTime: 0 }) });
  voice.update(line); for (let i = 0; i < 10 && !played; i++) await tick();
  assert.equal(fetched, 0); assert.equal(played, 'data:audio/mpeg;base64,b2xk');
});

test('full autoplay waits for the speaker check instead of reading dialogue as narration', () => {
  assert.equal(readingVoiceLine(page, { ...view, castStatus: 'checking' }, 'w'), null);
  assert.equal(readingVoiceLine(page, { ...view, castStatus: 'publishing' }, 'w'), null);
  assert.equal(readingVoiceLine(page, view, 'w').speakerId, 'hina');
  const narration = readingVoiceLine({ turnId: 't1', start: 0, kind: 'narration', text: '바람이 불었다.' }, view, 'w', '', {}, { provider: 'gemini-3.8-flash-tts' });
  assert.equal(narration.voice, NARRATOR_VOICE.gemini);
  assert.ok(!voiceOptions('gemini-3.8-flash-tts').includes(NARRATOR_VOICE.gemini), 'no character is cast with the narrator voice');
  assert.equal(readingVoiceLine({ turnId: 't1', start: 0, kind: 'narration', text: '바람.' }, view, 'w', '', {}, { narrator: 'ballad' }).voice, 'ballad');
});

test('Gemini casting gives distinct voices, keeps assignments, and OpenAI keeps its original rule', () => {
  const cast = castVoices([{ id: 'a', profile: '여성' }, { id: 'b', profile: '여성' }, { id: 'c', profile: '여성' }, { id: 'd', profile: '남성' }], 'gemini-3.8-flash-tts');
  assert.equal(new Set(Object.values(cast)).size, 4);
  assert.deepEqual(castVoices([{ id: 'a', profile: '남성' }], 'gemini-3.8-flash-tts', { a: 'Kore' }), { a: 'Kore' }, 'a stored voice never changes');
  assert.equal(defaultVoice('x', '청년 소년', 'openai'), defaultVoice('x', '', 'openai'), 'OpenAI defaults are unchanged so old takes stay reachable');
  assert.ok(['Puck', 'Fenrir', 'Achird', 'Iapetus', 'Umbriel', 'Algieba', 'Orus', 'Enceladus', 'Zubenelgenubi', 'Sadachbia', 'Alnilam'].includes(defaultVoice('x', '남학생', 'gemini-3.8-flash-tts')));
  const line = voiceLine(page, view, 'w', '', { cue: '히나가 한숨을 쉬었다.' }, { provider: 'gemini-3.8-flash-tts' });
  assert.equal(line.text, '<sigh> 같이 가자.'); assert.equal(line.provider, 'gemini-3.8-flash-tts'); assert.deepEqual(line.fallbackKeys, []);
  assert.notEqual(line.key, voiceLine(page, view, 'w', '', {}, { provider: 'openai' }).key, 'providers never share takes');
  assert.equal(vocalTags('응.', '킥킥 웃었다'), '<chuckle> 응.');
});

test('music: a loaded save resumes the music its earlier pages chose; a fresh start enters on the first real cue', () => {
  let t = 0; const keep = { cue: 'keep', evidence: '' };
  const fresh = createMusicDirection({ now: () => t });
  assert.equal(fresh.update({ scope: 's', scene: 'A', pageKey: 'p0', index: 0, music: keep }), 'silence');
  t = 3000; assert.equal(fresh.update({ scope: 's', scene: 'A', pageKey: 'p1', index: 1, music: { cue: 'normal', evidence: '평범한 아침이었다' } }), 'normal', 'no 24-second hold before the first entrance');
  t = 6000; assert.equal(fresh.update({ scope: 's', scene: 'A', pageKey: 'p2', index: 2, music: { cue: 'sad', evidence: '눈물이 흘렀다는' } }), 'normal', 'later changes keep their hold');
  const loaded = createMusicDirection({ now: () => 0 });
  const rows = [{ music: { cue: 'tense', evidence: 'x' } }, { music: keep }, { music: keep }];
  assert.equal(musicSeed(3, i => rows[i]), 'tense');
  assert.equal(loaded.update({ scope: 's', scene: 'A', pageKey: 'p3', index: 3, music: keep, seed: () => musicSeed(3, i => rows[i]) }), 'tense');
  assert.equal(musicSeed(3, i => [{ mood: 'sad' }, { mood: 'sad' }, { mood: 'normal' }][i]), '', 'a single legacy mood is not enough evidence');
  assert.equal(musicSeed(3, i => [{ mood: 'sad' }, { mood: 'sad' }, { mood: 'sad' }][i]), 'sad');
});

test('works without a published revision still open unversioned', () => {
  assert.equal(catalogRevision({ slug: 'old-work' }), null);
  assert.equal(catalogRevision({ currentRevision: 3 }), null);
  assert.equal(catalogRevision({ currentRevision: 3, packageSha256: 'x' }), null);
  assert.equal(catalogRevision({ currentRevision: 3, packageSha256: 'a'.repeat(64) }).revision, 3);
});

const request = (body, key = 'gemini-fixture') => new Request('https://local/api/gemini/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
const body = { model: 'gemini-3.8-flash-tts', text: '같이 가자.', voice: 'Leda', context: JSON.stringify({ speaker: '히나', delivery: 'warm, smiling tone' }) };

test('Gemini voice validates before spending and sends text verbatim with style direction', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return Response.json({ status: 'completed', steps: [{ type: 'user_input' }, { type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/mp3', data: 'SUQzBAAA' }] }], usage: { total_input_tokens: 120, total_output_tokens: 64 } });
  });
  assert.equal((await POST(request(body, ''))).status, 401);
  assert.equal((await POST(request({ ...body, voice: 'marin' }))).status, 400);
  assert.equal((await POST(request({ ...body, model: 'gemini-2.5-pro' }))).status, 400);
  assert.equal((await POST(request({ ...body, text: '가'.repeat(961) }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await POST(request(body)), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.audioUrl, 'data:audio/mpeg;base64,SUQzBAAA');
  assert.deepEqual(result.usage, { input_tokens: 120, output_tokens: 64 });
  const sent = calls[0];
  assert.equal(sent.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(sent.init.headers['x-goog-api-key'], 'gemini-fixture');
  assert.equal(sent.body.model, 'gemini-3.8-flash-tts'); assert.equal(sent.body.store, false);
  assert.equal(sent.body.input[0].text, '같이 가자.', 'the transcript is spoken verbatim');
  assert.equal(sent.body.input[0].annotations[0].type, 'speech_metadata');
  assert.match(sent.body.input[0].annotations[0].style, /warm, smiling tone/);
  assert.deepEqual(sent.body.generation_config.speech_config[0].voice, 'Leda');
  assert.equal(sent.body.response_format.type, 'audio');
  assert.ok(Math.abs(estimateCost({ provider: 'gemini', model: result.model, usage: result.usage, at: Date.UTC(2026, 8, 26) }).usd - (120 * 0.5 + 64 * 9) / 1e6) < 1e-12);
  assert.ok(Math.abs(estimateCost({ provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', usage: result.usage, at: Date.UTC(2027, 0, 2) }).usd - (120 + 64 * 12) / 1e6) < 1e-12);
});

test('Gemini voice retries once without optional fields on a 400, wraps raw PCM as WAV, and hides raw provider errors', async t => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    sent.push(JSON.parse(init.body));
    if (sent.length === 1) return Response.json({ error: { message: 'Unknown field mime_type echo 같이 가자' } }, { status: 400 });
    return Response.json({ output_audio: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000, data: Buffer.from(new Uint8Array(480)).toString('base64') } });
  });
  const response = await POST(request(body)), result = await response.json();
  assert.equal(response.status, 200); assert.equal(sent.length, 2);
  assert.equal(sent[1].response_format.mime_type, undefined); assert.equal(sent[1].generation_config.speech_config[0].language, undefined);
  const wav = Buffer.from(result.audioUrl.split(',')[1], 'base64');
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF'); assert.equal(wav.readUInt32LE(24), 24000); assert.equal(wav.readUInt32LE(40), 480);
  assert.equal(result.usage, null, 'no invented usage');
  t.mock.restoreAll();
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json([{ error: { message: 'secret-echo', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }], { status: 400 }); });
  const invalid = await POST(request(body));
  assert.equal(invalid.status, 400); assert.equal(count, 1, 'an invalid key is not retried');
  const text = await invalid.text(); assert.doesNotMatch(text, /secret-echo/u); assert.match(text, /유효하지 않거나/u);
});
