import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaBounds, faceLandmarks, faceFrame, portraitLandmarks, portraitFrameCheck } from '../public/vn-sprite.mjs';
import { heightScale } from '../public/vn-stage.mjs';

function portrait({ highlights = false, face = true, shift = 0, colour = [236, 204, 172] } = {}) {
  const width = 240, height = 360, data = new Uint8ClampedArray(width * height * 4);
  function paint(x, y, colour) { data.set([...colour, 255], (y * width + x) * 4); }
  for (let y = 10; y < height; y++) for (let x = 25; x < width - 25; x++) {
    if ((y < 140 && Math.hypot((x - 120 - shift) / 55, (y - 75) / 65) < 1) || y >= 130) paint(x, y, [30, 40, 50]);
    if (face && ((x - 120 - shift) ** 2 / 35 ** 2 + (y - 97) ** 2 / 40 ** 2 < 1)) paint(x, y, colour);
    // A disconnected thin warm hair highlight precedes the actual face. It has
    // enough skin-colored pixels to trigger the old first-row rule, but cannot
    // sustain a face band. The image must not fall back to full-body sizing.
    if (highlights && y >= 24 && y <= 27 && x >= 93 + shift && x <= 147 + shift) paint(x, y, [170, 130, 108]);
  }
  return { width, height, data, bounds: alphaBounds(data, width, height) };
}

test('warm hair highlights cannot disable face framing or change the final face scale', () => {
  const a = portrait(), b = portrait({ highlights: true });
  const base = faceLandmarks(a.data, a.width, a.bounds), highlighted = faceLandmarks(b.data, b.width, b.bounds);
  assert.ok(base); assert.ok(highlighted, 'must find the later face after rejecting the highlight');
  assert.ok(Math.abs(base.width - highlighted.width) < 3);
  assert.ok(Math.abs(base.eyeY - highlighted.eyeY) < 3);
  const af = faceFrame(a.bounds, base), bf = faceFrame(b.bounds, highlighted);
  assert.ok(Math.abs(base.width / af.outHeight - highlighted.width / bf.outHeight) < .01);
});

test('shifted and brown-complexion faces remain anchored without inventing a face from a streak', () => {
  for (const shift of [-24, 24]) {
    const p = portrait({ highlights: true, shift, colour: [145, 105, 70] });
    const face = faceLandmarks(p.data, p.width, p.bounds);
    assert.ok(face);
    assert.ok(Math.abs(face.x - (120 + shift)) < 4);
  }
  const noFace = portrait({ highlights: true, face: false });
  assert.equal(faceLandmarks(noFace.data, noFace.width, noFace.bounds), null);
});

test('public stature remains a small independent adjustment, not an assumed canonical height', () => {
  assert.equal(heightScale('키 163cm, 가벼운 체형'), .9775);
  assert.equal(heightScale('키 수치 없음'), 1);
  assert.ok(heightScale('키 180cm') > heightScale('키 160cm'));
});

test('adult men use the requested 178cm staging default, with explicit heights taking precedence', () => {
  assert.equal(heightScale('평범하고 지친 중년 남성.'), heightScale('키 178cm'));
  assert.equal(heightScale('성인 남성, 키 163cm'), .9775);
  assert.equal(heightScale('20대 남성'), heightScale('키 178cm'));
  assert.equal(heightScale('middle-aged man'), heightScale('키 178cm'));
  assert.equal(heightScale('어린 소년'), 1);
  assert.equal(heightScale('20대 여성'), heightScale('키 162cm'));
  assert.equal(heightScale('성인 여성, 키 175cm'), heightScale('키 175cm'));
  assert.equal(heightScale('adult woman'), heightScale('키 162cm'));
  assert.equal(heightScale('어린 소녀'), 1);
  assert.equal(heightScale('키 수치 없음'), 1);
});

function shortHairPortrait(padding = 0) {
  const width = 240, height = 420 + padding, data = new Uint8ClampedArray(width * height * 4);
  for (let yy = 10; yy < 420; yy++) for (let x = 30; x < 210; x++) {
    const y = yy + padding;
    if (((x - 122) / 38) ** 2 + ((yy - 62) / 52) ** 2 < 1 || yy >= 108) data.set([40, 40, 50, 255], (y * width + x) * 4);
    // A short silver cap, exposed forehead and broad, turned cheek/ear band.
    if (yy >= 40 && yy < 108 && x >= 90 && x <= 152) data.set([205, 165, 133, 255], (y * width + x) * 4);
  }
  return { data, width, height, bounds: alphaBounds(data, width, height) };
}

test('the framing audit finds a face in a cropped bust instead of silently classifying it as unmeasured', () => {
  const sprite = shortHairPortrait(), height = 200;
  const cropped = sprite.data.slice(0, sprite.width * height * 4);
  const bounds = alphaBounds(cropped, sprite.width, height);
  const face = portraitLandmarks(cropped, sprite.width, bounds);
  assert.ok(face); assert.equal(portraitFrameCheck(bounds, face).code, 'SHORT_BODY_CROP');
});

test('different body crops and transparent margins cannot change stage head size or eye line', () => {
  const measurements = [];
  for (const padding of [0, 95]) for (const bodyHeight of [145, 200, 420]) {
    const sprite = shortHairPortrait(padding), height = bodyHeight + padding;
    const data = sprite.data.slice(0, sprite.width * height * 4), bounds = alphaBounds(data, sprite.width, height);
    const face = portraitLandmarks(data, sprite.width, bounds);
    assert.ok(face, `head must still be measurable with bodyHeight=${bodyHeight}`);
    const frame = faceFrame(bounds, face);
    measurements.push({ head: face.headWidth / frame.outHeight, eyes: (face.eyeY - bounds.top + frame.y) / frame.outHeight });
  }
  for (const measured of measurements) {
    assert.ok(Math.abs(measured.head - .25) < .003);
    assert.ok(Math.abs(measured.eyes - .26) < .003);
  }
});

test('short hair and exposed forehead retain the real head width and do not use the forehead as an eye line', () => {
  for (const padding of [0, 95]) {
    const p = shortHairPortrait(padding), face = faceLandmarks(p.data, p.width, p.bounds);
    assert.ok(face);
    assert.ok(face.headWidth >= 65 && face.headWidth <= 78, 'measure the actual 76px cap instead of inventing a wide hairstyle');
    assert.ok(face.eyeY - padding >= 57 && face.eyeY - padding <= 65, 'anchor below the exposed forehead');
    const frame = faceFrame(p.bounds, face);
    assert.ok(Math.abs(face.headWidth / frame.outHeight - .25) < .003);
    assert.ok(Math.abs((face.eyeY - p.bounds.top + frame.y) / frame.outHeight - .26) < .003);
  }
});
