import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseMatte, removeMattePixels } from '../public/vn-chroma.mjs';

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
  });

  it('rejects an invalid matte name or mismatched pixel shape', () => {
    assert.throws(() => removeMattePixels(rgba(GREEN), 1, 1, 'red'), /Invalid sprite pixels/);
    assert.throws(() => removeMattePixels(rgba(GREEN, GREEN), 1, 1, 'green'), /Invalid sprite pixels/);
    assert.throws(() => removeMattePixels(rgba(GREEN), 2, 2, 'green'), /Invalid sprite pixels/);
  });
});
