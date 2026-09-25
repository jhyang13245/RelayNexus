import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/image/route.ts';

test('strict image comparison never substitutes GPT Image 2 after a model access failure', async t => {
  const upstream=t.mock.method(globalThis,'fetch',async()=>Response.json({error:{code:'model_not_found',message:'Model unavailable'}},{status:404}));
  const req=strictModel=>new Request('https://local/api/image',{method:'POST',headers:{Authorization:'Bearer fixture-key','Content-Type':'application/json'},body:JSON.stringify({strictModel,prompt:'A battle expression on the same reference character.'})});
  assert.equal((await POST(req(true))).status,404);assert.equal(upstream.mock.callCount(),1);
  assert.equal((await POST(req('true'))).status,400);assert.equal(upstream.mock.callCount(),1);
});

test('표정 편집은 참조 이미지·투명 PNG·세로 구도를 OpenAI로 전송한다', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return Response.json({ data: [{ b64_json: 'aW1hZ2U=' }], usage: { input_tokens: 10, output_tokens: 20 } }); });
  const response = await POST(new Request('https://local/api/image', { method: 'POST', headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'expression', aspect: 'portrait', prompt: 'Change only the face to a gentle smile.', referenceImages: ['data:image/png;base64,aW1hZ2U='] }) }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits');
  const form = calls[0].init.body;
  assert.equal(form.get('background'), 'transparent');
  assert.equal(form.get('output_format'), 'png');
  assert.equal(form.get('size'), '768x1024');
  assert.equal(form.has('output_compression'), false);
  assert.equal(form.getAll('image[]').length, 1);
  assert.equal((await response.json()).imageUrl, 'data:image/png;base64,aW1hZ2U=');
});
test('배경은 인물 참조 없이 가로 JPEG로 생성한다', async t => {
  let body;
  t.mock.method(globalThis, 'fetch', async (url, init) => { body = JSON.parse(init.body); assert.equal(url, 'https://api.openai.com/v1/images/generations'); return Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] }); });
  const response = await POST(new Request('https://local/api/image', { method: 'POST', headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'background', aspect: 'landscape', prompt: 'A quiet classroom environment, no people.' }) }));
  assert.equal(body.background, 'opaque'); assert.equal(body.output_format, 'jpeg');
  assert.equal(body.size, '1088x608'); assert.equal(response.status, 200);
});
test('잘못된 용도나 API 키 없는 요청은 유료 API를 호출하지 않는다', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call upstream'); });
  const missing = await POST(new Request('https://local/api/image', { method: 'POST', body: '{}' }));
  assert.equal(missing.status, 401);
  const bad = await POST(new Request('https://local/api/image', { method: 'POST', headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'arbitrary', prompt: 'some sufficiently long prompt' }) }));
  assert.equal(bad.status, 400); assert.equal(fetch.mock.callCount(), 0);
});
