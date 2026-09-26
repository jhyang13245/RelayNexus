import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageCollector, readableTurnPages } from '../public/vn-core.mjs';
import { createCastDirector } from '../public/vn-cast.mjs';
import { createStageAssets } from '../public/vn-assets.mjs';
import { createCinema } from '../public/vn-cinema.mjs';

test('cached pages retain committed history while publishing, correcting annotations and rewinding safely', () => {
  const collect = createPageCollector(), turns = [{ id: 'a', status: 'COMMITTED', text: '문이 열렸다.\n“안녕하세요.”', dialogueAnnotations: [] }, { id: 'b', status: 'STREAMING', text: 'SECRET DRAFT', displayText: '바람이 ' }];
  const first = collect(turns); assert.equal(collect(turns), first);
  turns[1].displayText += '분다.';
  const next = collect(turns); assert.equal(next[0], first[0]); assert.ok(!JSON.stringify(next).includes('SECRET'));
  turns[0].dialogueAnnotations.push({ offset: 8, quoteText: '“안녕하세요.”', speakerName: '나디아', characterId: 'n' });
  turns[0].dialogueAnnotations[0].offset = turns[0].text.indexOf('“');
  assert.equal(collect(turns)[1].speaker, '나디아');
  turns[0].dialogueAnnotations[0].bindingInvalid = true;
  assert.equal(collect(turns)[1].speaker, '');
  turns[0].text = turns[0].text.replace('열렸다', '닫혔다');
  assert.ok(collect(turns)[0].text.includes('닫혔다'));
  turns[1].status = 'ADJUDICATION_PENDING'; delete turns[1].displayText; turns[1].sameTurnResume = { publicText: '공개된 본문.' };
  assert.deepEqual(collect(turns), turns.flatMap((turn, i) => readableTurnPages(turn, i)));
  assert.deepEqual(collect(turns.slice(0, 1)), readableTurnPages(turns[0], 0));
  assert.deepEqual(collect([]), []);
});

test('cached cast validation changes when public identity or presence changes', async () => {
  const scene = { scope: 'test', publicText: '나디아가 내 앞에 섰다.', candidates: [{ id: 'n', name: '나디아' }], castPages: [{ start: 0, text: '나디아가 내 앞에 섰다.' }] };
  const decision = { beats: [{ beat: 'P0', speaker: '', onStage: [{ candidate: 'C0', evidence: scene.publicText, identityEvidence: scene.publicText }] }] };
  const director = createCastDirector({ getConnection: () => ({ key: 'fixture', endpoint: '/fixture' }), read: async () => null, write: async () => {}, fetchDecision: async () => Response.json({ output_text: JSON.stringify(decision) }) });
  await director.prepare(scene);
  const first = director.timeline(scene); assert.equal(director.timeline(scene), first);
  assert.equal(director.view(scene).characters[0].id, 'n');
  scene.candidates[0].name = '다른 사람';
  assert.deepEqual(director.view(scene).characters, []);
  scene.candidates[0].name = '나디아'; scene.publicText = '나디아의 사진을 바라보았다.';
  assert.deepEqual(director.view(scene).characters, []);
});

test('a completed portrait warms immediately while the background request remains unresolved', async () => {
  let finishBackground, warmed = [], backgroundDone = false;
  const scene = { scope: 'test', environmentKey: 'test-room', world: { location: '교실', time: '12:00' }, publicText: '나디아가 말했다.', characters: [{ id: 'n', name: '나디아', referenceMode: 'PRIMARY' }] };
  const assets = createStageAssets({ getKey: () => 'fixture', getQuality: () => 'low', getReferences: () => [], read: async () => null, write: async () => {}, onChange: () => {}, onError: message => { throw new Error(message); }, onSpriteReady: url => warmed.push(url),
    fetchImage: async (_url, options) => {
      if (JSON.parse(options.body).purpose === 'background') { await new Promise(resolve => { finishBackground = resolve; }); backgroundDone = true; }
      return Response.json({ imageUrl: 'data:image/png;base64,dGVzdA==' });
    } });
  const preparing = assets.prepare(scene, { start: 0, end: 20 });
  for (let i = 0; i < 20 && !warmed.length; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(backgroundDone, false); assert.equal(warmed.length, 1);
  finishBackground(); await preparing;
});

function element() {
  const children = new Map(), classes = new Set();
  return { hidden: false, dataset: {}, style: {}, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), toggle: (name, value) => value ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) }, setAttribute() {}, append(node) { children.set(node.className, node); }, querySelector(name) { if (!children.has(name)) children.set(name, element()); return children.get(name); }, children };
}
test('chapter labels do not block text and late directions cannot cover a line already being read', t => {
  t.mock.method(globalThis, 'setTimeout', () => 1); t.mock.method(globalThis, 'clearTimeout', () => {});
  const originalDocument = globalThis.document, originalCancel = globalThis.cancelAnimationFrame;
  globalThis.document = { createElement: element }; globalThis.cancelAnimationFrame = () => {};
  t.after(() => { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; if (originalCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCancel; });
  const stage = element(), cinema = createCinema({ stage, visual: { querySelector: () => null } });
  const update = extra => cinema.update({ pageKey: 'p1', turnId: 't1', turnIndex: 0, fresh: true, ...extra });
  update({}); update({ pageKey: 'p2', turnId: 't2', turnIndex: 1 });
  assert.equal(stage.children.get('vn-chapter-card').hidden, false); assert.equal(cinema.blocked, false);
  update({ pageKey: 'p2', turnId: 't2', direction: { emphasis: { kind: 'hold', text: '뒤늦게 도착한 연출' } } });
  assert.equal(cinema.blocked, false);
  update({ pageKey: 'p3', direction: { emphasis: { kind: 'hold', text: '처음부터 준비된 연출' } } });
  assert.equal(cinema.blocked, true); cinema.dismiss(); assert.equal(cinema.blocked, false); cinema.reset();
});

test('raster worker matches out-of-order results to the right portrait and releases all jobs on failure', async t => {
  const names = ['Worker', 'OffscreenCanvas', 'createImageBitmap'], originals = names.map(name => globalThis[name]);
  t.after(() => names.forEach((name, i) => originals[i] === undefined ? delete globalThis[name] : globalThis[name] = originals[i]));
  const sent = []; let instance, count = 0;
  globalThis.OffscreenCanvas = class {}; globalThis.createImageBitmap = () => {};
  globalThis.Worker = class {
    constructor() { instance = this; count++; }
    postMessage(data) { sent.push(data); }
    terminate() { this.stopped = true; }
  };
  const { rasterTask } = await import('../public/vn-raster.mjs?worker-test');
  const a = rasterTask({ url: 'first' }), b = rasterTask({ url: 'second' });
  instance.onmessage({ data: { id: sent[1].id, url: 'second-result' } });
  instance.onmessage({ data: { id: sent[0].id, url: 'first-result' } });
  assert.deepEqual(await Promise.all([a, b]), ['first-result', 'second-result']);
  const c = rasterTask({ url: 'third' }), d = rasterTask({ url: 'fourth' });
  instance.onerror(); assert.deepEqual(await Promise.all([c, d]), [null, null]);
  assert.equal(instance.stopped, true); assert.equal(await rasterTask({ url: 'fallback' }), null); assert.equal(count, 1);
});
