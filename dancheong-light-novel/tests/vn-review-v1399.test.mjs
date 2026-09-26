import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageAssets, eventSceneSetting } from '../public/vn-assets.mjs';
import { dialogueWait } from '../public/vn-stage-timing.mjs';
import { POST } from '../app/api/gemini/image/route.ts';
import { presentationScenario } from '../public/vn-public-cast.mjs';

const nadia = { id: 'nadia', name: '나디아', referenceMode: 'PRIMARY' };
const observer = { id: 'observer', name: '목격자', referenceMode: 'PRIMARY' };
const action = '나디아가 검을 휘둘러 종이 다발을 두 동강 냈다.';
function setup({ enabled = true, failEvent = false } = {}) {
  const calls = [], records = new Map();
  const scene = { scope: 'review:save', environmentKey: 'room', world: { location: '방' }, publicText: action, characters: [nadia, observer], castStatus: 'ready', speakerId: 'nadia',
    castPages: [{ start: 0, text: '문이 열렸다.' }, { start: 10, text: action }, { start: 100, text: '“끝났어.”', quoted: true }] };
  const cast = { prepare: async s => s, view: s => s,
    timeline: () => [{ start: 10, characters: [nadia, observer], direction: { cg: true, event: { characterIds: ['nadia'], castComplete: true, evidence: action } } }] };
  const assets = createStageAssets({ castDirector: cast, getKey: () => 'test', getQuality: () => 'low', getReferences: () => [], getCgEnabled: () => enabled,
    onChange() {}, onError() {}, read: async key => records.get(key), write: async r => records.set(r.key, r),
    fetchImage: async (_, init) => { const body = JSON.parse(init.body); calls.push(body); return body.purpose === 'scene' && failEvent ? Response.json({ error: { message: 'failed' } }, { status: 502 }) : Response.json({ imageUrl: `data:image/png;base64,${Buffer.from(body.purpose + calls.length).toString('base64')}` }); } });
  return { scene, assets, calls, setEnabled: value => { enabled = value; } };
}

test('only event participants are hidden through the event and reaction; bystanders retain sprite readiness', async () => {
  const h = setup(), pages = h.scene.castPages;
  await h.assets.prepare(h.scene, pages[1]);
  assert.deepEqual(h.assets.view(h.scene, pages[0]).eventCharacterIds, []);
  for (const page of pages.slice(1)) {
    const view = h.assets.view(h.scene, page);
    assert.deepEqual(view.eventCharacterIds, ['nadia']);
    assert.deepEqual(view.portraits.filter(p => !view.eventCharacterIds.includes(p.id)).map(p => p.id), ['observer']);
    assert.equal(dialogueWait(pages[2], { ...view, portraits: [] }, { enabled: true, eventDecoded: true }), false);
    assert.equal(dialogueWait(pages[2], { ...view, portraits: [] }, { enabled: true, eventDecoded: false }), true, 'pending event decode cannot release speech');
    assert.equal(dialogueWait(pages[2], { ...view, speakerId: 'observer', portraits: [] }, { enabled: true, eventDecoded: true }), true, 'observer still needs their sprite');
  }
  const event = h.calls.find(row => row.purpose === 'scene');
  assert.equal(event.referenceImages.length, 2, 'environment and participant only');
  assert.match(event.prompt, /participating characters: 나디아/);
  h.setEnabled(false);
  const restored = h.assets.view(h.scene, pages[2]);
  assert.equal(restored.eventBackground, '');
  assert.deepEqual(restored.eventCharacterIds, []);
  assert.equal(restored.portraits.length, 2, 'ordinary background restores both sprites');
});

test('failed event art never hides a participant; legacy off cannot generate paid event art', async () => {
  const failed = setup({ failEvent: true });
  await failed.assets.prepare(failed.scene, failed.scene.castPages[1]);
  assert.deepEqual(failed.assets.view(failed.scene, failed.scene.castPages[1]).eventCharacterIds, []);
  const off = setup({ enabled: eventSceneSetting({ cg: 'off' }) === 'on' });
  await off.assets.prepare(off.scene, off.scene.castPages[1]);
  assert.equal(off.calls.filter(row => row.purpose === 'scene').length, 0);
});

test('the actual generated event request reaches Gemini as a 1K scene at low quality', async t => {
  const h = setup(); await h.assets.prepare(h.scene, h.scene.castPages[1]);
  const body = h.calls.find(row => row.purpose === 'scene');
  let sent;
  t.mock.method(globalThis, 'fetch', async (_, init) => { sent = JSON.parse(init.body); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aQ==' } }] } }] }); });
  const response = await POST(new Request('https://local/api/gemini/image', { method: 'POST', headers: { Authorization: 'Bearer fake', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, model: 'gemini-3.1-flash-image' }) }));
  assert.equal(response.status, 200);
  assert.equal(sent.generationConfig.responseFormat.image.imageSize, 'IMAGE_SIZE_ONE_K');
});

test('package public aliases work for any work and cannot override secret identity gates', () => {
  const person = { id: 'guard', name: '실명', publicInfo: '첫 등장 뒤 공개: 문지기', appearance: '갈색 머리', publicAliases: ['가면 문지기'] };
  const sc = { runtime: { packageContract: { presentation: { publicAliases: { guard: ['붉은 기사'] } } } }, characters: [person] };
  const turn = { status: 'COMMITTED', text: '가면 문지기가 문 앞에 섰다.' };
  const experience = { surfaceNames: () => ['실명'] };
  assert.equal(presentationScenario(sc, 'unrelated:save', [turn], experience).characters[0].surfaceName, '가면 문지기');
  const secret = { ...sc, characters: [{ ...person, secret: true }] };
  assert.equal(presentationScenario(secret, 'unrelated:save', [turn], experience).characters[0].surfaceName, undefined);
});
