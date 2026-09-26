import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { POST as goPost } from '../app/api/go/responses/route.ts';
import { POST as openaiPost } from '../app/api/openai/[...path]/route.ts';
import { estimateCost } from '../public/vn-cost-core.mjs';

const html = readFileSync(new URL('../public/cortex.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../public/vn.js', import.meta.url), 'utf8');
const functionCode = (name, endMarker) => html.slice(html.indexOf(`  ${name}`), html.indexOf(endMarker, html.indexOf(`  ${name}`)));

test('restored OpenAI and Go preferences select GPT 6 Luna low, while cast stays on 5.6 and Muse stays selected', () => {
  const models = ui.match(/const providerModels = [^\n]+/u)[0];
  const apply = ui.slice(ui.indexOf('function applyProvider()'), ui.indexOf('const busy ='));
  const cast = ui.slice(ui.indexOf('const castDirector ='), ui.indexOf('const assets ='));
  for (const provider of ['openai', 'go-luna', 'muse']) {
    const settings = { model: 'gpt-5.6-luna' };
    const state = { provider, effort: 'high', imageRouting: {}, api: { _setSettings: patch => Object.assign(settings, patch) } };
    const context = { state, apiBase: '/api/openai', textKey: () => 'synthetic-text-key', imageKey: () => 'synthetic-image-key',
      imageProviderFor: () => 'openai', imageProviders: { openai: { endpoint: '/api/image', model: 'gpt-image-2.5-flare' } },
      createCastDirector: options => options, readAsset: () => {}, writeAsset: () => {}, requestRender: () => {}, toast: () => {} };
    const connection = runInNewContext(`${models}\n${apply}\napplyProvider();\n${cast}\ncastDirector.getConnection()`, context);
    assert.equal(settings.model, provider === 'muse' ? 'muse-spark-1.3-contributor' : 'gpt-6-luna');
    assert.equal(settings.writerReasoningEffort, provider === 'muse' ? 'high' : 'low');
    assert.equal(connection.model, provider === 'muse' ? 'muse-spark-1.3-contributor' : 'gpt-5.6-luna');
    assert.equal(connection.endpoint, provider === 'openai' ? '/api/openai/responses' : '/api/go/responses');
  }
});

test('Cortex includes explicit low reasoning for GPT 6 Luna while its judge effort stays medium', () => {
  const code = functionCode('function writerReasoningParamsV268(', '  async function requestMinimalEditV1400(');
  const context = { settings: { writerReasoningEffort: 'low' }, asText: (value, fallback = '') => String(value ?? fallback) };
  const value = runInNewContext(`${code}\n({writer:writerReasoningParamsV268('gpt-6-luna'),judge:engineReasoningParamsV253('gpt-5.6-luna')})`, context);
  assert.equal(value.writer.reasoning.effort, 'low');
  assert.equal(value.judge.reasoning.effort, 'medium');
});

test('real Cortex transport preserves 6 Luna writing and pinned 5.6 adjudication on OpenAI and Go', async () => {
  const code = functionCode('async function apiFetchV1390(', '\n  /* v1.42.1');
  for (const provider of ['openai', 'opencode-go-luna', 'opencode-go']) {
    const calls = [], settings = { model: provider === 'opencode-go' ? 'muse-spark-1.3-contributor' : 'gpt-6-luna', apiKey: 'synthetic-key', storyId: 'test' };
    const context = { settings, NexusCortexTextProvider: provider, NexusCortexTextModel: settings.model, NexusCortexTextApiKey: 'synthetic-key', NexusCortexTextEndpoint: '/api/go/responses',
      asText: (value, fallback = '') => String(value ?? fallback), Headers, AbortController, setTimeout, clearTimeout,
      apiDiagnosticV1391: () => ({ header() {}, json() {}, end() {}, chunk() {} }),
      fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body), headers: new Headers(options.headers) }); return Response.json({ status: 'completed' }); } };
    const send = runInNewContext(`${code}\napiFetchV1390`, context);
    for (const model of ['gpt-6-luna', 'gpt-5.6-luna']) {
      const response = await send('/api/openai/responses', { method: 'POST', headers: { Authorization: 'Bearer synthetic-key' }, body: JSON.stringify({ model, input: 'synthetic story', stream: false, reasoning: { effort: model === 'gpt-6-luna' ? 'low' : 'medium' } }) });
      await response.json();
    }
    assert.deepEqual(calls.map(call => call.body.model), provider === 'opencode-go' ? ['muse-spark-1.3-contributor', 'muse-spark-1.3-contributor'] : ['gpt-6-luna', 'gpt-5.6-luna']);
    assert.ok(calls.every(call => call.url === (provider === 'openai' ? '/api/openai/responses' : '/api/go/responses')));
    assert.ok(calls.every(call => call.headers.get('authorization') === 'Bearer synthetic-key'));
    assert.deepEqual(calls.map(call => call.body.reasoning.effort), ['low', 'medium']);
  }
});

test('OpenAI and Go proxies forward 6 Luna streaming and preserve response usage', async t => {
  const calls = [];
  const sse = 'data: {"type":"response.completed","response":{"model":"gpt-6-luna","usage":{"input_tokens":50,"output_tokens":20}}}\n\n';
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, body: JSON.parse(typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body)) }); return new Response(sse, { headers: { 'content-type': 'text/event-stream' } }); });
  for (const provider of ['openai', 'go']) {
    const req = new Request(`https://fixture/api/${provider}/responses`, { method: 'POST', headers: { authorization: 'Bearer synthetic-key', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-6-luna', stream: true, reasoning: { effort: 'low' }, max_output_tokens: 8192, input: 'synthetic story' }) });
    const response = provider === 'go' ? await goPost(req) : await openaiPost(req, { params: Promise.resolve({ path: ['responses'] }) });
    assert.equal(response.status, 200); assert.equal(await response.text(), sse);
  }
  assert.deepEqual(calls.map(call => call.url), ['https://api.openai.com/v1/responses', 'https://opencode.ai/zen/go/v1/responses']);
  assert.ok(calls.every(call => call.body.model === 'gpt-6-luna' && call.body.stream && call.body.reasoning.effort === 'low' && call.body.max_output_tokens === 8192));
});

test('Go continues to accept pinned 5.6 and Muse, rejects unsupported models without upstream calls', async t => {
  const models = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { models.push(JSON.parse(options.body).model); return Response.json({ status: 'completed' }); });
  for (const model of ['gpt-5.6-luna', 'muse-spark-1.3-contributor', 'unsupported']) {
    const response = await goPost(new Request('https://fixture/api/go/responses', { method: 'POST', headers: { authorization: 'Bearer synthetic-key', 'content-type': 'application/json' }, body: JSON.stringify({ model, input: 'synthetic' }) }));
    assert.equal(response.status, model === 'unsupported' ? 400 : 200);
  }
  assert.deepEqual(models, ['gpt-5.6-luna', 'muse-spark-1.3-contributor']);
});

test('6 Luna costs include cache writes and long context; Go remains subscription accounting', () => {
  const price = (input, output, details = {}) => estimateCost({ model: 'gpt-6-luna', usage: { input_tokens: input, output_tokens: output, input_tokens_details: details } }).usd;
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  near(price(10000, 1000, { cached_tokens: 4000, cache_write_tokens: 2000 }), .00119);
  near(price(272000, 1000), .0277);
  near(price(272001, 1000), .0551502);
  near(price(300000, 1000, { cached_tokens: 100000, cache_write_tokens: 100000 }), .04775);
  assert.deepEqual(estimateCost({ provider: 'go', model: 'gpt-6-luna' }), { usd: null, kind: 'subscription' });
});
