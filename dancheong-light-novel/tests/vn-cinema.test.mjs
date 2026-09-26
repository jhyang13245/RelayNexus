import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedEmphasis, ruleValue, cropBox, ruleTransitions } from '../public/vn-cinema.mjs';
import { directionFor } from '../public/vn-cast.mjs';
import { compositeMotionPixels, motionRegion } from '../public/vn-motion.mjs';
import { selectedTrack, musicKey, licensedTrack, createWorkMusic } from '../public/vn-work-music.mjs';
import { POST } from '../app/api/image/route.ts';
import { POST as gemini } from '../app/api/gemini/image/route.ts';

test('emphasis must quote the actual page; cut-ins need present cast and narration evidence', () => {
  const text = '서현은 결심을 굳히고 눈을 들었다.';
  assert.deepEqual(validatedEmphasis({ kind: 'hold', text }, text), { kind: 'hold', text });
  assert.equal(validatedEmphasis({ kind: 'hold', text: '다음 장면의 다른 대사다.' }, text), null);
  const beat = { shot: 'close', focus: 'C0', cutin: 'eyes', artShot: 'bust', shotEvidence: text, emphasis: { kind: 'tremble', text } };
  const actors = [{ id: 'a', name: '서현' }];
  const direction = directionFor(beat, actors, new Set([0]), '', text);
  assert.deepEqual(direction.cutin, { kind: 'eyes', characterId: 'a' });
  assert.equal(direction.artShot.kind, 'bust');
  assert.equal(directionFor(beat, actors, new Set(), '', text).cutin, null);
  assert.equal(directionFor(beat, actors, new Set([0]), '', `“${text}”`).cutin, null);
});

test('rule mask ranks stay bounded and face strips remain within the source image', () => {
  for (const kind of ruleTransitions) for (let x = 0; x <= 1; x += .05) for (let y = 0; y <= 1; y += .05) {
    const rank = ruleValue(kind, x, y); assert.ok(rank >= 0 && rank <= 1);
  }
  const box = cropBox({ x: 20, eyeY: 15, width: 30 }, 100, 100, 'eyes');
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 100 && box.y + box.height <= 100);
  assert.equal(cropBox(null, 100, 100, 'eyes'), null);
});

test('masked frames preserve every outside pixel and original alpha; body/face drift rejects output', () => {
  const w = 80, h = 100, base = new Uint8ClampedArray(w * h * 4).fill(140), changed = base.slice();
  const box = { x: 30, y: 20, width: 20, height: 12 };
  for (let y = 20; y < 32; y++) for (let x = 30; x < 50; x++) changed[(y * w + x) * 4] = 230;
  const merged = compositeMotionPixels(base, changed, w, h, box); assert.ok(merged);
  assert.equal(merged[(25 * w + 40) * 4], 230);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    assert.equal(merged[i + 3], base[i + 3]);
    if (x < 30 || x >= 50 || y < 20 || y >= 32) assert.deepEqual(merged.slice(i, i + 4), base.slice(i, i + 4));
  }
  changed.fill(220); assert.equal(compositeMotionPixels(base, changed, w, h, box), null);
  assert.equal(motionRegion(null, w, h, 'blink'), null);
  assert.equal(motionRegion({ width: 50, x: 1, eyeY: 1 }, w, h, 'blink'), null);
});

test('music stays work-scoped, falls back to normal, requires license/source, and honors removals', async () => {
  const link = { url: 'https://example.com/theme.ogg', title: 'Theme', credit: 'Composer', license: 'CC0' };
  const saved = new Map([[musicKey('workA', 'normal'), { ...link, savedAt: 1 }]]);
  const read = async key => saved.get(key);
  assert.equal((await selectedTrack('workA', 'dread', {}, read)).title, 'Theme');
  assert.equal(await selectedTrack('workB', 'normal', {}, read), null);
  saved.set(musicKey('workA', 'normal'), { disabled: true });
  assert.equal(await selectedTrack('workA', 'normal', { normal: link }, read), null);
  assert.equal(licensedTrack({ ...link, license: '' }), null);
  assert.equal(licensedTrack({ ...link, url: 'https://secret:token@example.com/theme.ogg' }), null);
  assert.equal(licensedTrack({ ...link, url: 'javascript:alert(1)' }), null);
  saved.set(musicKey('workB', 'tense'), { blob: new Blob(['audio'], { type: 'audio/wav' }), savedAt: 2 });
  assert.ok((await selectedTrack('workB', 'tense', {}, read)).blob instanceof Blob);
});

test('music playback respects volume, reuses a track, stops and cancels a stale work lookup', async t => {
  const original = globalThis.Audio, sounds = [];
  globalThis.Audio = class { constructor() { sounds.push(this); } async play() { this.played = true; } pause() { this.paused = true; } removeAttribute() { this.src = ''; } load() {} };
  t.after(() => { if (original === undefined) delete globalThis.Audio; else globalThis.Audio = original; });
  const row = { url: 'https://example.com/music.ogg', title: 'Music', credit: 'Composer', license: 'CC0' };
  let release; const music = createWorkMusic({ enabled: () => true, volume: () => .22, read: async key => key.includes('slow') ? new Promise(resolve => { release = resolve; }) : row });
  t.after(() => music.dispose());
  await music.update('one', 'normal', {}); assert.equal(sounds.length, 1); assert.equal(sounds[0].volume, .22); assert.equal(sounds[0].loop, true);
  await music.update('one', 'warm', {}); assert.equal(sounds.length, 1);
  const pending = music.update('slow', 'normal', {}); music.stop(); release(row); await pending;
  assert.equal(sounds.length, 1); assert.equal(sounds[0].paused, true);
});

function pngHeader(w = 768, h = 1024, type = 6) {
  const bytes = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(w, 16); bytes.writeUInt32BE(h, 20); bytes[24] = 8; bytes[25] = type;
  return 'data:image/png;base64,' + bytes.toString('base64');
}
const request = body => new Request('https://local/api/image', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('alpha mask is forwarded to OpenAI edits; malformed masks and Gemini masks never call upstream', async t => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, body: init.body }); return Response.json({ data: [{ b64_json: 'b2s=' }] }); });
  const body = { purpose: 'expression', aspect: 'portrait', prompt: 'Edit only the tiny masked eye area.', strictModel: true, referenceImages: [pngHeader()], maskImage: pngHeader() };
  assert.equal((await POST(request(body))).status, 200);
  assert.equal(calls.length, 1); assert.match(calls[0].url, /images\/edits$/);
  assert.ok(calls[0].body.get('mask') instanceof Blob);
  assert.equal(calls[0].body.getAll('image[]').length, 1);
  for (const invalid of [{ ...body, maskImage: pngHeader(512) }, { ...body, maskImage: pngHeader(768, 1024, 2) }, { ...body, referenceImages: [] }, { ...body, purpose: 'background' }]) assert.equal((await POST(request(invalid))).status, 400);
  assert.equal((await gemini(request({ ...body, model: 'gemini-3.1-flash-image' }))).status, 400);
  assert.equal(calls.length, 1);
});
