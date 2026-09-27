import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTypecastCatalog } from '../public/vn-typecast-connection.mjs';
import { createVoice } from '../public/vn-voice.mjs';
import { POST } from '../app/api/typecast/voice/route.ts';
import { GET } from '../app/api/typecast/voices/route.ts';

const line = { key: 'take-1', provider: 'typecast', model: 'ssfm-v30', voice: 'tc_12345678', text: '같이 가자.', speakerId: 'a' };
const audio = 'data:audio/mpeg;base64,SUQz';
const tick = async () => { for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); };
const makeVoice = opts => createVoice({ getEnabled: () => true, getKey: () => 'test-key', read: async () => null, write: async () => {}, makeAudio: () => ({ play: async () => {}, pause() {}, currentTime: 0 }), ...opts });

test('connection check validates locally and loads a usable list without synthesizing speech', async () => {
  let count = 0;
  const fetchCatalog = async (url, init) => {
    count++; assert.equal(url, '/api/typecast/voices?model=ssfm-v30');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.equal(init.cache, 'no-store'); assert.ok(init.signal);
    return Response.json({ voices: [{ id: 'tc_12345678', name: '하나' }, { id: 'bad id' }] });
  };
  await assert.rejects(fetchTypecastCatalog('', fetchCatalog), /먼저 입력/u);
  await assert.rejects(fetchTypecastCatalog('has space', fetchCatalog), /공백/u);
  assert.equal(count, 0);
  assert.deepEqual(await fetchTypecastCatalog('test-key', fetchCatalog), [{ id: 'tc_12345678', name: '하나' }]);
  assert.equal(count, 1);
});

test('catalog failures are actionable, redact credentials, and never call an empty list connected', async () => {
  await assert.rejects(fetchTypecastCatalog('test-key', async () => Response.json({ error: { message: '권한 없음 test-key' } }, { status: 403 })), error => /권한 없음/u.test(error.message) && !error.message.includes('test-key'));
  await assert.rejects(fetchTypecastCatalog('test-key', async () => Response.json({ voices: [] })), /사용할 캐릭터가 없습니다/u);
  await assert.rejects(fetchTypecastCatalog('test-key', async () => { throw new Error('test-key'); }), error => /연결/u.test(error.message) && !error.message.includes('test-key'));
});

test('speech exposes safe failure reason; corrected settings retry the same take and retain successful audio', async () => {
  let key = 'old-key', calls = 0;
  const voice = makeVoice({ getKey: () => key, fetchVoice: async (_, init) => {
    calls++; return init.headers.Authorization === 'Bearer old-key' ? Response.json({ error: { message: 'Typecast 크레딧이 부족합니다.' } }, { status: 402 }) : Response.json({ audioUrl: audio });
  } });
  voice.update(line); await tick();
  assert.equal(voice.phase, 'error'); assert.match(voice.error, /크레딧/u);
  voice.reset(); voice.update(line); await tick(); assert.equal(calls, 1, 'passive updates do not repeatedly buy/retry');
  key = 'correct-key'; voice.reset({ retryFailed: true }); voice.update(line); await tick();
  assert.equal(voice.phase, 'playing'); assert.equal(voice.error, ''); assert.equal(calls, 2);
  voice.reset({ retryFailed: true }); voice.update(line); await tick(); assert.equal(calls, 2, 'successful take remains cached');
  voice.stop();
});

test('a late old-key failure cannot poison the corrected-key request for the same line', async () => {
  let key = 'old-key', finishOld; const auth = [];
  const voice = makeVoice({ getKey: () => key, fetchVoice: async (_, init) => {
    auth.push(init.headers.Authorization);
    if (auth.length === 1) return new Promise(resolve => { finishOld = resolve; });
    return Response.json({ audioUrl: audio });
  } });
  voice.update(line); await tick();
  key = 'correct-key'; voice.reset({ retryFailed: true }); voice.update(line); await tick();
  finishOld(Response.json({ error: { message: 'old authentication failed' } }, { status: 401 })); await tick();
  assert.deepEqual(auth, ['Bearer old-key', 'Bearer correct-key']); assert.equal(voice.phase, 'playing'); assert.equal(voice.error, ''); assert.equal(voice.busy, false);
  voice.stop();
});

test('a successful in-flight take is reused after settings change without a second charge', async () => {
  let complete, calls = 0;
  const voice = makeVoice({ fetchVoice: async () => { calls++; return new Promise(resolve => { complete = resolve; }); } });
  voice.update(line); await tick(); voice.reset({ retryFailed: true }); voice.update(line); await tick();
  complete(Response.json({ audioUrl: audio })); await tick();
  assert.equal(calls, 1); assert.equal(voice.phase, 'playing'); voice.stop();
});

test('both Typecast routes distinguish permission refusal from authentication failure', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private provider text', { status: 403 }));
  const headers = { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' };
  for (const response of [await GET(new Request('https://local/api/typecast/voices', { headers })), await POST(new Request('https://local/api/typecast/voice', { method: 'POST', headers, body: JSON.stringify(line) }))]) {
    assert.equal(response.status, 403); const result = await response.json();
    assert.match(result.error.message, /권한/u); assert.doesNotMatch(result.error.message, /private provider text|test-key/u);
  }
});

test('403 diagnostics retain structured restriction reasons while removing the key and submitted line', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error_code: 'FORBIDDEN', message: 'Subscription inactive test-key 같이 가자.', ignored: 'do not echo full body' }, { status: 403 }));
  const response = await POST(new Request('https://local/api/typecast/voice', { method: 'POST', headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' }, body: JSON.stringify(line) }));
  const result = await response.json();
  assert.match(result.error.message, /Subscription inactive/u);
  assert.doesNotMatch(result.error.message, /test-key|같이 가자|do not echo/u);
});

test('Typecast unusual-activity refusal is explained in Korean with a stable code', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error_code: 'UNUSUAL_ACTIVITY_DETECTED', message: 'Provider restriction' }, { status: 403 }));
  const response = await POST(new Request('https://local/api/typecast/voice', { method: 'POST', headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' }, body: JSON.stringify(line) }));
  const result = await response.json();
  assert.equal(result.error.code, 'UNUSUAL_ACTIVITY_DETECTED'); assert.match(result.error.message, /이상 활동/u); assert.match(result.error.message, /고객지원/u);
});

test('account restriction stops new automatic Typecast calls; stored takes and other providers still work', async () => {
  let calls = 0;
  const voice = makeVoice({ read: async key => key === 'stored' ? { key, url: audio } : null, fetchVoice: async url => {
    calls++; return url.includes('typecast') ? Response.json({ error: { code: 'UNUSUAL_ACTIVITY_DETECTED', message: '이상 활동으로 차단됨' } }, { status: 403 }) : Response.json({ audioUrl: audio });
  } });
  voice.update(line); await tick(); assert.equal(calls, 1);
  voice.update({ ...line, key: 'another' }); await tick(); assert.equal(calls, 1); assert.match(voice.error, /차단/u);
  voice.update({ ...line, key: 'stored' }); await tick(); assert.equal(voice.phase, 'playing'); assert.equal(calls, 1);
  voice.update({ ...line, key: 'openai', provider: 'openai' }); await tick(); assert.equal(voice.phase, 'playing'); assert.equal(calls, 2);
  voice.replay(line); await tick(); assert.equal(calls, 3, 'a deliberate retry is allowed after the user resolves the restriction'); voice.stop();
});
