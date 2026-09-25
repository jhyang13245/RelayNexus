import test from 'node:test';
import assert from 'node:assert/strict';
import { POST, normalizeUsage } from '../app/api/gemini/image/route.ts';
import { estimateCost } from '../public/vn-cost-core.mjs';
const request = (body, headers = {}) => new Request('https://local/api/gemini/image', { method: 'POST', headers: { Authorization: 'Bearer fixture-gemini-key', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const base = { model: 'gemini-3.1-flash-image', purpose: 'background', prompt: 'A quiet classroom environment, no people.' };
const receipt = { promptTokenCount: 1000, candidatesTokenCount: 1130, thoughtsTokenCount: 50, candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 10 }, { modality: 'IMAGE', tokenCount: 1120 }] };
const output = { candidates: [{ content: { parts: [{ thought: true, inlineData: { mimeType: 'image/png', data: 'dGhvdWdodA==' } }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] } }], usageMetadata: receipt };

test('Gemini endpoint receives only its key, 16:9 1K and returns final image with normalized usage', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return Response.json(output); });
  const response = await POST(request(base));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'fixture-gemini-key');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.generationConfig.responseFormat.image, { aspectRatio: '16:9', imageSize: '1K' });
  assert.equal(body.tools, undefined);
  const result = await response.json();
  assert.equal(result.imageUrl, 'data:image/png;base64,aW1hZ2U=');
  assert.equal(result.usage.output_tokens, 1180);
  assert.equal(result.usage.output_tokens_details.image_tokens, 1120);
});
test('Gemini expression edit sends neutral reference, portrait 2K and explicit matte', async t => {
  let body;
  t.mock.method(globalThis, 'fetch', async (url, init) => { body = JSON.parse(init.body); return Response.json(output); });
  const response = await POST(request({ ...base, purpose: 'expression', aspect: 'portrait', quality: 'medium', matteColor: 'magenta', referenceImages: ['data:image/png;base64,aW1hZ2U='], prompt: 'Change expression, preserve fully transparent background.' }));
  assert.equal(response.status, 200);
  assert.deepEqual(body.contents[0].parts[0], { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } });
  assert.match(body.contents[0].parts[1].text, /#ff00ff/u);
  assert.doesNotMatch(body.contents[0].parts[1].text, /fully transparent background/u);
  assert.deepEqual(body.generationConfig.responseFormat.image, { aspectRatio: '3:4', imageSize: '2K' });
});
test('invalid requests do not call paid endpoint', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected upstream'); });
  for (const [body, headers, status] of [[base, { Authorization: '' }, 401], [{ ...base, model: 'arbitrary' }, {}, 400], [{ ...base, referenceImages: Array(15).fill('data:image/png;base64,aQ==') }, {}, 400], [{ ...base, referenceImages: ['https://remote/private'] }, {}, 400], [{ ...base, matteColor: '__proto__' }, {}, 400], [{ ...base, purpose: 'portrait', aspect: 'landscape' }, {}, 400]]) {
    assert.equal((await POST(request(body, headers))).status, status);
  }
  assert.equal(mock.mock.callCount(), 0);
});
test('upstream quota error is not retried or leaked; text-only response retains usage', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json({ error: { message: 'sensitive fixture key in error' } }, { status: 429 }); });
  const response = await POST(request(base));
  assert.equal(response.status, 429); assert.equal(count, 1);
  assert.doesNotMatch(await response.text(), /sensitive fixture/u);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{ content: { parts: [{ text: 'no image' }] } }], usageMetadata: receipt }));
  const refused = await POST(request(base));
  assert.equal(refused.status, 502); assert.deepEqual((await refused.json()).usage, normalizeUsage(receipt));
});
test('Gemini cost includes image and text/thinking at distinct rates; missing split is unknown', () => {
  const cost = estimateCost({ provider: 'gemini', model: base.model, usage: normalizeUsage(receipt) });
  assert.ok(Math.abs(cost.usd - 0.06788) < 1e-9);
  assert.equal(estimateCost({ provider: 'gemini', model: base.model, usage: normalizeUsage({ promptTokenCount: 20, candidatesTokenCount: 1120 }) }).kind, 'unknown');
  assert.equal(normalizeUsage({ promptTokenCount: 1 }), null);
});
