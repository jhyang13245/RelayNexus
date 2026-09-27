import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypecastTransport, typecastBody, TYPECAST_TTS } from '../public/vn-typecast-direct.mjs';
import { POST } from '../app/api/typecast/voice/route.ts';

const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) }; };
const request = (body = {}) => ['/api/typecast/voice', { method: 'POST', headers: { Authorization: 'Bearer tc-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'ssfm-v30', text: '같이 가자.', voice: 'tc_62a8975e695ad26f7fb514d1', typecast: { mode: 'preset', preset: 'happy', intensity: 1 }, ...body }) }];
const audio = () => new Response(new Uint8Array([73, 68, 51, 4]), { headers: { 'Content-Type': 'audio/mpeg', 'X-Audio-Duration': '1.5' } });

test('the browser sends the line straight to Typecast with the official body; the relay is not used', async () => {
  const calls = [], storage = memory();
  const transport = createTypecastTransport({ storage, fetchImpl: async (url, init) => { calls.push({ url, init }); return audio(); } });
  const result = await (await transport.fetch(...request())).json();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, TYPECAST_TTS);
  assert.equal(calls[0].init.headers['X-API-KEY'], 'tc-key'); assert.equal(calls[0].init.mode, 'cors'); assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(result.audioUrl, 'data:audio/mpeg;base64,SUQzBA=='); assert.equal(result.transport, 'direct'); assert.equal(transport.state, 'ok');
});

test('the browser body is byte-identical to what the server route sends', async t => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => { sent.push(JSON.parse(init.body)); return audio(); });
  for (const typecast of [{ mode: 'preset', preset: 'whisper', intensity: 1.2 }, { mode: 'smart', previous: '문이 열렸다.', next: '그녀가 돌아봤다.' }, { mode: 'preset', preset: 'unknown' }]) {
    const [, init] = request({ typecast });
    await POST(new Request('https://local/api/typecast/voice', init));
    assert.deepEqual(typecastBody(JSON.parse(init.body)), sent.at(-1));
  }
});

test('a refused preflight falls back to the relay once and remembers it; nothing is sent twice', async () => {
  const calls = [], storage = memory();
  const transport = createTypecastTransport({ storage, fetchImpl: async url => { calls.push(url); if (url === TYPECAST_TTS) throw new TypeError('Failed to fetch'); return Response.json({ audioUrl: 'data:audio/mpeg;base64,AA==' }); } });
  assert.equal((await (await transport.fetch(...request())).json()).audioUrl, 'data:audio/mpeg;base64,AA==');
  assert.deepEqual(calls, [TYPECAST_TTS, '/api/typecast/voice']);
  await transport.fetch(...request());
  assert.deepEqual(calls.slice(2), ['/api/typecast/voice'], 'later lines go straight to the relay');
  assert.equal(createTypecastTransport({ storage, fetchImpl: async url => { calls.push(url); return audio(); } }).state, 'unavailable', 'kept for the session');
});

test('a timeout is never resent (it may already be billed), and relay-only mode skips the browser path', async () => {
  const calls = [];
  const slow = createTypecastTransport({ storage: memory(), fetchImpl: async url => { calls.push(url); throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); } });
  const response = await slow.fetch(...request());
  assert.equal(response.status, 504); assert.deepEqual(calls, [TYPECAST_TTS]);
  const relayOnly = createTypecastTransport({ storage: memory(), mode: () => 'relay', fetchImpl: async url => { calls.push(url); return Response.json({}); } });
  await relayOnly.fetch(...request());
  assert.equal(calls.at(-1), '/api/typecast/voice');
});

test('a direct 403 UNUSUAL_ACTIVITY_DETECTED is reported as an account block with its code', async () => {
  const transport = createTypecastTransport({ storage: memory(), fetchImpl: async () => Response.json({ error_code: 'UNUSUAL_ACTIVITY_DETECTED', message: '같이 가자 echo' }, { status: 403 }) });
  const response = await transport.fetch(...request()), result = await response.json();
  assert.equal(response.status, 403); assert.equal(result.error.code, 'UNUSUAL_ACTIVITY_DETECTED');
  assert.match(result.error.message, /계정 쪽 제한/u); assert.doesNotMatch(JSON.stringify(result), /같이 가자/u);
});

test('the relay identifies itself and explains a shared-address block', async t => {
  let headers;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { headers = init.headers; return Response.json({ error_code: 'UNUSUAL_ACTIVITY_DETECTED' }, { status: 403 }); });
  const [, init] = request();
  const result = await (await POST(new Request('https://local/api/typecast/voice', init))).json();
  assert.match(headers['User-Agent'], /^dancheong-light-novel\//u);
  assert.equal(result.error.code, 'UNUSUAL_ACTIVITY_DETECTED'); assert.match(result.error.message, /클라우드 주소/u);
});
