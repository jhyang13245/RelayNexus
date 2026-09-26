import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCastDirector } from '../public/vn-cast.mjs';
import { createStageAssets, imageNotice, cgKey } from '../public/vn-assets.mjs';
import { recordMet } from '../public/vn-stage.mjs';

const nadia = { id: 'visitor', name: '나디아', referenceMode: 'PRIMARY', primaryAssetRef: 'nadia.webp' };
const scene = () => ({ scope: 'review', environmentKey: 'room', world: { location: '방', time: '12:00' }, publicText: '나디아가 섰다. 나디아가 떨어지는 선반을 붙잡았다. “조심해.”', candidates: [nadia],
  castPages: [{ start: 0, text: '나디아가 섰다.' }, { start: 8, text: '나디아가 떨어지는 선반을 붙잡았다. “조심해.”' }] });
const direction = (cg = false) => ({ expressions: [{ candidate: 'C0', expression: 'neutral' }], focus: 'C0', shot: 'medium', transition: 'none', fx: 'none', mood: 'normal', cg,
  eventEvidence: cg ? '나디아가 떨어지는 선반을 붙잡았다.' : '', eventFocus: cg ? '떨어지는 선반을 붙잡은 나디아' : '', eventParticipants: ['C0'], eventCastComplete: true });
const decision = () => ({ beats: [
  { beat: 'P0', speaker: '', onStage: [{ candidate: 'C0', evidence: '나디아가 섰다.' }], ...direction() },
  { beat: 'P8', speaker: 'C0', onStage: [{ candidate: 'C0', evidence: '나디아가 섰다.' }], ...direction(true) },
] });
function setup({ key = 'img', records = new Map(), casts = new Map(), failCg = () => false } = {}) {
  const requests = [];
  const cast = createCastDirector({ getConnection: () => ({ key: key ? 'text' : '', endpoint: '/x', model: 'gpt-5.6-luna' }), read: async k => casts.get(k), write: async row => casts.set(row.key, row),
    fetchDecision: async () => new Response(JSON.stringify({ output_text: JSON.stringify(decision()) })) });
  const assets = createStageAssets({ castDirector: cast, getKey: () => key, getQuality: () => 'low', getReferences: () => [], getCgEnabled: () => true, onChange: () => {}, onError: () => {},
    read: async k => records.get(k), write: async row => records.set(row.key, row),
    fetchImage: async (_url, init) => {
      const body = JSON.parse(init.body); requests.push(body);
      if (body.purpose === 'scene' && failCg()) return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 });
      return new Response(JSON.stringify({ imageUrl: `data:image/png;base64,${Buffer.from(body.purpose + requests.length).toString('base64')}` }));
    } });
  return { assets, requests, records, casts };
}

test('a failed event CG is visible as an optional error and retry requests it again', async () => {
  let fail = true;
  const { assets, requests } = setup({ failCg: () => fail });
  const sc = scene();
  for (const page of sc.castPages) await assets.prepare(sc, page);
  const view = assets.view(sc, sc.castPages[1]);
  assert.equal(view.status, 'ready', 'scene layers stay ready: CG never blocks reading');
  assert.equal(view.cgStatus, 'error');
  assert.deepEqual(imageNotice(view, true), { text: '사건 장면 생성 실패 · 다시 시도', action: 'retry' });
  fail = false;
  await assets.retry(sc, sc.castPages[1]);
  assert.equal(requests.filter(row => row.purpose === 'scene').length, 2);
  assert.equal(assets.view(sc, sc.castPages[1]).cgStatus, 'ready');
  assert.ok(assets.view(sc, sc.castPages[1]).eventBackground);
  assert.equal(imageNotice(assets.view(sc, sc.castPages[1]), true), null);
});

test('a stored event CG is restored without an image key and without generating', async () => {
  const first = setup();
  const sc = scene();
  for (const page of sc.castPages) await first.assets.prepare(sc, page);
  assert.ok(first.records.has(cgKey(sc, 8)));
  const offline = setup({ key: '', records: first.records, casts: first.casts });
  await offline.assets.prepare(sc, sc.castPages[1]);
  assert.equal(offline.requests.length, 0);
  assert.ok(offline.assets.view(sc, sc.castPages[1]).eventBackground.startsWith('data:image/png'));
});

test('met cast is recorded only from verified on-stage people of a shown beat', () => {
  assert.deepEqual(recordMet([], { castStatus: 'checking', portraits: [{ id: 'a', name: 'A' }] }), []);
  const first = recordMet([], { castStatus: 'ready', portraits: [], pending: [] });
  assert.deepEqual(first, []);
  const met = recordMet(first, { castStatus: 'ready', portraits: [{ id: 'a', name: 'A', baseKey: 'ka', url: 'u' }], pending: [{ id: 'b', name: 'B', baseKey: 'kb' }] });
  assert.deepEqual(met, [{ id: 'a', name: 'A', baseKey: 'ka' }, { id: 'b', name: 'B', baseKey: 'kb' }]);
  const same = recordMet(met, { castStatus: 'ready', portraits: [{ id: 'a', name: 'A', baseKey: 'ka' }] });
  assert.equal(same, met, 'no change keeps the same array (no storage write)');
});

test('the met-cast gallery reads the reading record, not the image cache', async () => {
  const { assets, records } = setup();
  records.set('k-visitor', { key: 'k-visitor', url: 'data:image/png;base64,eA==' });
  assert.deepEqual(await assets.metPortraits([]), []);
  assert.deepEqual(await assets.metPortraits([{ id: 'visitor', name: '나디아', baseKey: 'k-visitor' }]), [{ id: 'visitor', name: '나디아', baseKey: 'k-visitor', url: 'data:image/png;base64,eA==' }]);
  const source = readFileSync(new URL('../public/vn.js', import.meta.url), 'utf8');
  assert.match(source, /assets\.metPortraits\(state\.met, scope\)/u);
});

test('reduced motion covers every v13 layer and the speaker bounce', () => {
  const css = readFileSync(new URL('../public/vn-reader.css', import.meta.url), 'utf8');
  assert.match(css, /#vn-root\[data-motion="reduced"\] \.vn-stage \*[^{]*\{ transition:none !important; animation:none !important; \}/u);
  const js = readFileSync(new URL('../public/vn.js', import.meta.url), 'utf8');
  assert.match(js, /!slot\.classList\.contains\('is-speaking'\) && !motionReduced\(\)/u);
});
