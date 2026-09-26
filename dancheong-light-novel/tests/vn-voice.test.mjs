import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/voice/route.ts';
import { createVoice, voiceLine } from '../public/vn-voice.mjs';
import { estimateCost } from '../public/vn-cost-core.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const request = (body, key = 'fixture') => new Request('https://local/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
test('voice validates before spending, uses fixed endpoint/model, joins SSE audio and returns real usage', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(init.body); assert.equal(body.model, 'gpt-4o-mini-tts-2025-12-15'); assert.equal(body.stream_format, 'sse');
    const content = 'data: {"type":"speech.audio.delta","audio":"aGk="}\n\ndata: {"type":"speech.audio.delta","audio":"IQ=="}\n\ndata: {"type":"speech.audio.done","usage":{"input_tokens":20,"output_tokens":50}}\n\n';
    const bytes = new TextEncoder().encode(content);
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 17)); c.enqueue(bytes.slice(17, 70)); c.enqueue(bytes.slice(70)); c.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const body = { text: '안녕', voice: 'marin', context: '차분하게' };
  assert.equal((await POST(request(body, ''))).status, 401);
  assert.equal((await POST(request({ ...body, voice: 'arbitrary' }))).status, 400);
  assert.equal((await POST(request({ ...body, text: '가'.repeat(901) }))).status, 400); assert.equal(calls, 0);
  const response = await POST(request(body)), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.audioUrl, 'data:audio/mpeg;base64,aGkh');
  assert.deepEqual(result.usage, { input_tokens: 20, output_tokens: 50, total_tokens: 70 });
  assert.equal(estimateCost({ provider: 'openai', model: result.model, usage: result.usage }).usd, .000612);
});
test('provider failures do not retry, expose keys or invent usage', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'private-key-content' } }, { status: 401 }));
  const result = await POST(request({ text: '안녕', voice: 'cedar', context: '' }));
  assert.equal(result.status, 401); assert.equal(upstream.mock.callCount(), 1); assert.doesNotMatch(await result.text(), /private-key-content/u);
  assert.equal(estimateCost({ provider: 'openai', model: 'gpt-4o-mini-tts', usage: null }).kind, 'unknown');
});
test('voice never uses growing text or guessed speakers; stable voice is known before a portrait arrives', () => {
  const page = { turnId: 't', start: 0, kind: 'dialogue', text: '“안녕.”' };
  const view = { castStatus: 'ready', speakerId: 'a', speakerName: '서현', speakerProfile: '성인 남성', portraits: [] };
  assert.equal(voiceLine({ ...page, isGrowing: true }, view, 'w'), null);
  assert.equal(voiceLine(page, { ...view, castStatus: 'checking' }, 'w'), null);
  const before = voiceLine(page, view, 'w');
  assert.equal(voiceLine(page, { ...view, portraits: [{ id: 'a', profile: '성인 남성' }] }, 'w').key, before.key);
});
test('OFF makes no request; late previous-page audio stays silent; replays are cached; failures are explicit retry only', async () => {
  let enabled = false, requests = 0, resolveFirst; const played = [], saved = new Map();
  const voice = createVoice({ getEnabled: () => enabled, getKey: () => 'fixture', read: async key => saved.get(key), write: async row => saved.set(row.key, row), makeAudio: url => ({ play: async () => played.push(url), pause() {}, currentTime: 0 }), fetchVoice: async () => { requests++; if (requests === 1) await new Promise(r => { resolveFirst = r; }); return Response.json({ audioUrl: 'data:audio/mpeg;base64,aGk=' }); } });
  const line = { key: 'a', playbackKey: 'page1', text: '안녕', voice: 'marin', context: '' };
  voice.update(line); await tick(); assert.equal(requests, 0);
  enabled = true; voice.update(line); await tick(); assert.equal(requests, 1);
  voice.update(null); resolveFirst(); await tick(); assert.equal(played.length, 0);
  voice.replay(line); await tick(); assert.equal(requests, 1); assert.equal(played.length, 1);
  voice.update({ ...line, playbackKey: 'page2' }); await tick(); assert.equal(played.length, 2); assert.equal(requests, 1);
  voice.stop(); assert.equal(voice.phase, 'idle');
});
