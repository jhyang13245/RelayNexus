import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseMatte, removeMattePixels, despillEdges, refineSpriteEdges } from '../public/vn-chroma.mjs';

const GREEN = [0, 255, 0, 255];
const SKIN = [235, 190, 160, 255];
const GRAY = [128, 128, 128, 255];

function rgba(...pixels) {
  return new Uint8ClampedArray(pixels.flat());
}

describe('chooseMatte (pure)', () => {
  it('dominant green reference chooses another matte color', () => {
    // 8 opaque greens dominate 1 skin + 1 neutral pixel.
    const pixels = rgba(
      GREEN, GREEN, GREEN, GREEN,
      GREEN, GREEN, GREEN, GREEN,
      SKIN, GRAY,
    );
    const chosen = chooseMatte(pixels);
    assert.notEqual(chosen, 'green');
  });

  it('ignores transparent pixels', () => {
    const transparentGreens = rgba(
      [0, 255, 0, 0], [0, 255, 0, 0], [0, 255, 0, 0], [0, 255, 0, 0],
      [0, 255, 0, 127], [0, 255, 0, 100],
    );
    // Nothing opaque, so no matte color scores and the stable default wins.
    assert.equal(chooseMatte(transparentGreens), 'green');

    const opaqueGreens = rgba(GREEN, GREEN, GREEN, GREEN);
    assert.notEqual(chooseMatte(opaqueGreens), 'green');
  });
});

describe('removeMattePixels (pure)', () => {
  it('turns a green backdrop transparent while neutral and skin foreground stay opaque', () => {
    const width = 4;
    const height = 3;
    // Border is the green backdrop; two interior pixels are foreground.
    const grid = [
      GREEN, GREEN, GREEN, GREEN,
      GREEN, GRAY, SKIN, GREEN,
      GREEN, GREEN, GREEN, GREEN,
    ];
    const data = rgba(...grid);
    const beforeGray = [...GRAY];
    const beforeSkin = [...SKIN];
    const { removedFraction } = removeMattePixels(data, width, height, 'green');

    const alphaAt = (p) => data[p * 4 + 3];
    // All 10 border pixels were exact matte, so most of the frame is removed.
    assert.ok(removedFraction > 0.5, `expected backdrop removed, got ${removedFraction}`);
    for (const p of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) {
      assert.equal(alphaAt(p), 0, `border pixel ${p} should be transparent`);
    }
    // Interior foreground pixels keep full opacity and color.
    assert.equal(alphaAt(5), 255);
    assert.equal(alphaAt(6), 255);
    assert.deepEqual([...data.slice(5 * 4, 5 * 4 + 3)], beforeGray.slice(0, 3));
    assert.deepEqual([...data.slice(6 * 4, 6 * 4 + 3)], beforeSkin.slice(0, 3));
  });

  it('removes an enclosed exact matte island without touching the foreground', () => {
    // 3x3 skin portrait with one exact-green pixel trapped in the middle.
    const data = rgba(
      SKIN, SKIN, SKIN,
      SKIN, GREEN, SKIN,
      SKIN, SKIN, SKIN,
    );
    const { removedFraction } = removeMattePixels(data, 3, 3, 'green');
    assert.equal(data[4 * 4 + 3], 0, 'island pixel should become transparent');
    assert.ok(removedFraction > 0, 'island removal should be reported');
    for (const p of [0, 1, 2, 3, 5, 6, 7, 8]) {
      assert.equal(data[p * 4 + 3], 255, `foreground pixel ${p} should stay opaque`);
    }
  });

  it('never increases semitransparent alpha', () => {
    // Border-connected matte pixels that started semitransparent.
    const data = rgba(
      [0, 255, 0, 128], [120, 210, 120, 100],
    );
    const before = [128, 100];
    removeMattePixels(data, 2, 1, 'green');
    assert.equal(data[3], 0, 'exact matte should drain remaining alpha to zero');
    assert.ok(data[7] <= before[1], 'edge alpha must never grow');
    assert.equal(data[7], 100, 'partial edge keeps the smaller original alpha');
  });

  it('makes an antialiased green edge partially transparent', () => {
    // A mixed green/foreground edge should survive with partial opacity.
    const data = rgba([100, 200, 100, 255]);
    removeMattePixels(data, 1, 1, 'green');
    assert.ok(data[3] > 0 && data[3] < 255, 'edge should be partial, not cut out');
    assert.ok(Math.abs(data[1] - data[0]) <= 1, 'unmatting must not retain a green floor');
  });

  it('rejects an invalid matte name or mismatched pixel shape', () => {
    assert.throws(() => removeMattePixels(rgba(GREEN), 1, 1, 'red'), /Invalid sprite pixels/);
    assert.throws(() => removeMattePixels(rgba(GREEN, GREEN), 1, 1, 'green'), /Invalid sprite pixels/);
    assert.throws(() => removeMattePixels(rgba(GREEN), 2, 2, 'green'), /Invalid sprite pixels/);
  });
});

describe('despillEdges', () => {
  it('removes weak green spill including faint alpha, preserving alpha, skin and the interior', () => {
    const w = 11, data = new Uint8ClampedArray(w * w * 4);
    for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++) data.set(SKIN, (y * w + x) * 4);
    const edge = (5 * w + 1) * 4, faint = (5 * w) * 4, middle = (5 * w + 5) * 4;
    data.set([130, 163, 128, 180], edge); data.set([60, 120, 55, 12], faint); data.set([20, 180, 25, 255], middle);
    const original = data.slice();
    despillEdges(data, w, w, 'green');
    assert.equal(data[edge + 1], 130); assert.equal(data[faint + 1], 60);
    assert.deepEqual(data.slice(middle, middle + 4), original.slice(middle, middle + 4));
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], original[i]);
    assert.deepEqual([...data.slice((w + 2) * 4, (w + 2) * 4 + 4)], SKIN);
  });
  it('handles magenta and blue without deleting soft edges and becomes idempotent', () => {
    for (const [name, pixel] of [['magenta', [170, 120, 165, 170]], ['blue', [80, 85, 125, 170]]]) {
      const data = rgba([0, 0, 0, 0], pixel, SKIN);
      const first = despillEdges(data, 3, 1, name);
      assert.equal(first.corrected, 1); assert.equal(data[7], 170);
      const once = data.slice();
      assert.equal(despillEdges(data, 3, 1, name).corrected, 0);
      assert.deepEqual(data, once);
    }
  });
  it('infers a dominant legacy spill but leaves an opaque image untouched', () => {
    const data = rgba([0, 0, 0, 0], [90, 170, 90, 190], [90, 170, 90, 190], SKIN);
    assert.equal(despillEdges(data, 4, 1).matte, 'green');
    const opaque = rgba(GREEN, SKIN, GRAY), before = opaque.slice();
    assert.equal(despillEdges(opaque, 3, 1).corrected, 0); assert.deepEqual(opaque, before);
  });
});

describe('refineSpriteEdges', () => {
  it('clears green and yellow-green contour residue without touching skin, deep colours or cyan', () => {
    const w = 21, data = new Uint8ClampedArray(w * w * 4);
    for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++) data.set(SKIN, (y * w + x) * 4);
    const fringe = (10 * w + 1) * 4, yellow = (11 * w + 1) * 4, core = (10 * w + 10) * 4, cyan = (5 * w + 1) * 4;
    data.set([70, 200, 80, 190], fringe); data.set([180, 180, 90, 180], yellow); data.set(GREEN, core); data.set([50, 180, 180, 255], cyan);
    const original = data.slice(); const result = refineSpriteEdges(data, w, w, 'green');
    assert.ok(result.corrected >= 2); assert.ok(result.feathered > 0);
    assert.ok(data[fringe + 1] <= Math.max(data[fringe], data[fringe + 2]));
    assert.ok(data[yellow + 1] <= data[yellow] * .75 + data[yellow + 2] * .25 + 1);
    assert.deepEqual(data.slice(core, core + 4), original.slice(core, core + 4));
    assert.deepEqual(data.slice(cyan, cyan + 3), original.slice(cyan, cyan + 3));
    for (let i = 3; i < data.length; i += 4) assert.ok(data[i] <= original[i], 'alpha cannot grow');
    assert.deepEqual([...data.slice((8 * w + 10) * 4, (8 * w + 10) * 4 + 4)], SKIN);
  });
  it('preserves thin strands with soft coverage and handles other selected mattes', () => {
    for (const [name, color] of [['green', [90, 200, 90, 130]], ['magenta', [200, 90, 200, 130]], ['blue', [90, 90, 200, 130]]]) {
      const data = rgba([0,0,0,0], color, [0,0,0,0]);
      refineSpriteEdges(data, 3, 1, name);
      assert.ok(data[7] > 0 && data[7] < 130, 'hair remains partially visible');
      assert.ok(Math.max(data[4], data[5], data[6]) - Math.min(data[4], data[5], data[6]) <= 1);
    }
  });
  it('leaves opaque art unchanged and rejects invalid input', () => {
    const data = rgba(SKIN, GREEN, GRAY), before = data.slice(); refineSpriteEdges(data, 3, 1, 'green'); assert.deepEqual(data, before);
    assert.throws(() => refineSpriteEdges(data, 4, 1, 'green'), /Invalid sprite pixels/);
    assert.throws(() => refineSpriteEdges(data, 3, 1, 'red'), /Invalid sprite pixels/);
  });
});
