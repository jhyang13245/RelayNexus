import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/typecast/voice/route.ts';
import { GET } from '../app/api/typecast/voices/route.ts';
import { voiceLine, readingVoiceLine, setTypecastVoices, typecastActing, castVoices, voiceOptions, typecastNarrator, createVoice } from '../public/vn-voice.mjs';
import { estimateCost, sumCosts } from '../public/vn-cost-core.mjs';

const catalog = [
  { id: 'tc_000000000000000000000001', name: '해설자', gender: 'male', age: 'middle_age', useCases: ['Audiobook'] },
  { id: 'tc_000000000000000000000002', name: '하나', gender: 'female', age: 'teenager', useCases: ['Anime'] },
  { id: 'tc_000000000000000000000003', name: '유나', gender: 'female', age: 'young_adult', useCases: ['Game'] },
  { id: 'tc_000000000000000000000004', name: '민준', gender: 'male', age: 'young_adult', useCases: ['Anime'] },
  { id: 'tc_000000000000000000000005', name: '지호', gender: 'male', age: 'teenager', useCases: ['Game'] },
];
const page = { turnId: 't1', start: 5, quoted: true, kind: 'dialogue', rawText: '“같이 가자.”' };
const view = { castStatus: 'ready', speakerId: 'hina', speakerName: '히나', direction: { mood: 'normal', expressions: { hina: 'smile' } }, portraits: [{ id: 'hina', profile: '17세 여학생' }] };

test('without a loaded character list Typecast stays silent instead of guessing a voice', () => {
  setTypecastVoices([]);
  assert.equal(voiceLine(page, view, 'w', '', {}, { provider: 'typecast' }), null);
  assert.equal(readingVoiceLine({ turnId: 't1', start: 0, kind: 'narration', text: '바람.' }, view, 'w', '', {}, { provider: 'typecast' }), null);
});

test('Typecast casting uses the account list: a narrator voice, distinct gendered characters, stable picks', () => {
  setTypecastVoices(catalog);
  assert.equal(typecastNarrator(), catalog[0].id, 'an audiobook voice narrates');
  const cast = castVoices([{ id: 'a', profile: '여학생' }, { id: 'b', profile: '여성' }, { id: 'c', profile: '남학생' }], 'typecast');
  assert.ok([catalog[1].id, catalog[2].id].includes(cast.a) && [catalog[1].id, catalog[2].id].includes(cast.b)); assert.notEqual(cast.a, cast.b);
  assert.ok([catalog[3].id, catalog[4].id].includes(cast.c));
  assert.ok(!Object.values(cast).includes(catalog[0].id), 'nobody is cast with the narrator voice');
  assert.deepEqual(voiceOptions('typecast'), catalog.map(row => row.id));
  const line = voiceLine(page, view, 'w', catalog[2].id, { cue: '히나가 속삭였다.' }, { provider: 'typecast' });
  assert.equal(line.voice, catalog[2].id); assert.equal(line.model, 'ssfm-v30');
  assert.deepEqual(line.typecast, { mode: 'preset', preset: 'whisper', intensity: 1 });
  assert.equal(JSON.parse(line.key)[5], 'typecast:ssfm-v30', 'takes never mix with other providers');
});

test('acting: explicit cues and expressions pick presets, the rest uses smart context', () => {
  assert.deepEqual(typecastActing({ emotion: 'smile' }), { mode: 'preset', preset: 'happy', intensity: 1 });
  assert.deepEqual(typecastActing({ emotion: 'angry', emphasis: true }), { mode: 'preset', preset: 'angry', intensity: 1.44 });
  assert.equal(typecastActing({ cue: '그가 소리쳤다' }).preset, 'toneup');
  assert.equal(typecastActing({ cue: '울먹이며' }).preset, 'sad');
  assert.deepEqual(typecastActing({ emotion: 'neutral', before: '문이 열렸다.', after: '그녀가 돌아봤다.' }), { mode: 'smart', previous: '문이 열렸다.', next: '그녀가 돌아봤다.' });
});

test('the engine sends the acting to the Typecast route with the Typecast key', async () => {
  setTypecastVoices(catalog);
  const sent = [];
  const voice = createVoice({ getEnabled: () => true, getKey: provider => provider === 'typecast' ? 'tc-key' : '', read: async () => null, write: async () => {},
    fetchVoice: async (url, init) => { sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) }); return Response.json({ audioUrl: 'data:audio/mpeg;base64,SUQz' }); },
    makeAudio: () => ({ play: async () => {}, pause() {}, currentTime: 0 }) });
  voice.update(voiceLine(page, view, 'w', '', {}, { provider: 'typecast' })); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  assert.equal(sent[0].url, '/api/typecast/voice'); assert.equal(sent[0].auth, 'Bearer tc-key');
  assert.equal(sent[0].body.model, 'ssfm-v30'); assert.deepEqual(sent[0].body.typecast, { mode: 'preset', preset: 'happy', intensity: 1 });
});

const request = (body, key = 'tc-key') => new Request('https://local/api/typecast/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
const body = { model: 'ssfm-v30', text: '같이 가자.', voice: catalog[1].id, typecast: { mode: 'preset', preset: 'happy', intensity: 1 } };

test('Typecast route validates first and sends the official request shape', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response(new Uint8Array([73, 68, 51, 4]), { headers: { 'Content-Type': 'audio/mpeg', 'X-Audio-Duration': '1.2' } }); });
  assert.equal((await POST(request(body, ''))).status, 401);
  assert.equal((await POST(request({ ...body, voice: 'marin' }))).status, 400);
  assert.equal((await POST(request({ ...body, model: 'ssfm-v9' }))).status, 400);
  assert.equal(calls.length, 0);
  const result = await (await POST(request(body))).json();
  assert.equal(result.audioUrl, 'data:audio/mpeg;base64,SUQzBA=='); assert.equal(result.duration, 1.2);
  assert.equal(calls[0].url, 'https://api.typecast.ai/v1/text-to-speech'); assert.equal(calls[0].init.headers['X-API-KEY'], 'tc-key');
  assert.deepEqual(calls[0].body, { voice_id: catalog[1].id, text: '같이 가자.', model: 'ssfm-v30', language: 'kor',
    prompt: { emotion_type: 'preset', emotion_preset: 'happy', emotion_intensity: 1 }, output: { audio_format: 'mp3', audio_tempo: 1 } });
  await POST(request({ ...body, typecast: { mode: 'smart', previous: '문이 열렸다.', next: '' } }));
  assert.deepEqual(calls[1].body.prompt, { emotion_type: 'smart', previous_text: '문이 열렸다.' });
  await POST(request({ ...body, model: 'ssfm-v21', typecast: { mode: 'preset', preset: 'whisper' } }));
  assert.deepEqual(calls[2].body.prompt, { emotion_preset: 'normal', emotion_intensity: 1 }, 'v21 has no whisper preset');
});

test('Typecast failures map to plain messages without echoing provider text, and credits are not priced', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('insufficient credits for 같이 가자', { status: 402 }));
  const response = await POST(request(body)), text = await response.text();
  assert.equal(response.status, 402); assert.match(text, /크레딧/u); assert.doesNotMatch(text, /같이 가자/u);
  assert.deepEqual(estimateCost({ provider: 'typecast', model: 'ssfm-v30' }), { usd: null, kind: 'credits' });
  assert.equal(sumCosts([{ provider: 'typecast', model: 'ssfm-v30' }]).credits, 1);
});

test('the voice list route returns only display metadata with valid ids and https previews', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), 'https://api.typecast.ai/v3/voices?model=ssfm-v30');
    return Response.json([
      { voice_id: 'tc_62a8975e695ad26f7fb514d1', voice_name: { kor: '하나', eng: 'Hana' }, models: [{ version: 'ssfm-v30', emotions: ['normal', 'happy'] }], gender: 'female', age: 'teenager', use_cases: ['Anime'], preview_url: 'https://cdn.example/hana.mp3' },
      { voice_id: 'bad id', voice_name: 'x' },
      { voice_id: 'tc_62a8975e695ad26f7fb514d2', voice_name: 'Old', preview_url: 'http://insecure/x.mp3' },
    ]);
  });
  assert.equal((await GET(new Request('https://local/api/typecast/voices'))).status, 401);
  const result = await (await GET(new Request('https://local/api/typecast/voices', { headers: { Authorization: 'Bearer tc-key' } }))).json();
  assert.equal(result.voices.length, 2);
  assert.deepEqual(result.voices[0], { id: 'tc_62a8975e695ad26f7fb514d1', name: '하나', nameEn: 'Hana', gender: 'female', age: 'teenager', useCases: ['Anime'], emotions: ['normal', 'happy'], preview: 'https://cdn.example/hana.mp3' });
  assert.equal(result.voices[1].preview, '');
});
