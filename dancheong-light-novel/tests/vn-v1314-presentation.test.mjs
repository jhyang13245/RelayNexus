import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlinker, createMouth, breathDelay, BLINK_MS } from '../public/vn-actor-life.mjs';
import { typeset, visibleText, renderTypeset } from '../public/vn-typeset.mjs';
import { galleryImages, assetType } from '../public/vn-gallery.mjs';
import { composeFacePixels, faceOval } from '../public/vn-face-compose.mjs';
import { speakableKorean } from '../public/vn-speech-ko.mjs';

test('blinks are irregular, brief, sometimes double, and differ per person', () => {
  const blinker = createBlinker('hina', { now: 0 }), starts = [];
  let closed = false;
  for (let t = 0; t < 120000; t += 10) { const now = blinker.closed(t); if (now && !closed) starts.push(t); closed = now; }
  assert.ok(starts.length > 15 && starts.length < 60, `${starts.length} blinks in two minutes`);
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  assert.ok(new Set(gaps.map(g => Math.round(g / 100))).size > 5, 'gaps vary');
  assert.ok(gaps.some(g => g < 400), 'at least one double blink');
  const other = createBlinker('dayun', { now: 0 }); let first = 0;
  for (let t = 0; t < 10000 && !first; t += 10) if (other.closed(t)) first = t;
  assert.notEqual(first, starts[0]);
  assert.ok(BLINK_MS < 200);
  assert.notEqual(breathDelay('hina'), breathDelay('dayun')); assert.ok(breathDelay('hina') <= 0);
});

test('the mouth follows the voice level with hysteresis and falls back to a steady flap', () => {
  const mouth = createMouth();
  assert.equal(mouth.update(0, { speaking: true, level: 0.5 }), true);
  assert.equal(mouth.update(30, { speaking: true, level: 0.0 }), true, 'held at least 70 ms');
  assert.equal(mouth.update(100, { speaking: true, level: 0.25 }), true, 'stays open above the close threshold');
  assert.equal(mouth.update(200, { speaking: true, level: 0.1 }), false);
  assert.equal(mouth.update(300, { speaking: true, level: 0.25 }), false, 'reopens only above the open threshold');
  assert.equal(mouth.update(400, { speaking: false, level: 0.9 }), false, 'another person speaking');
  const flap = createMouth();
  assert.notEqual(flap.update(100, { speaking: true, level: null }), flap.update(260, { speaking: true, level: null }));
});

test('hanja readings become ruby, leaked markdown emphasis becomes dots, and the typewriter counts visible glyphs', () => {
  const line = typeset('그는 運命(운명)을 *절대로* 믿지 않았다.');
  assert.equal(line.visible, '그는 運命을 절대로 믿지 않았다.');
  assert.deepEqual(line.segments.filter(row => row.ruby || row.dots), [{ text: '運命', ruby: '운명' }, { text: '절대로', dots: true }]);
  assert.equal(visibleText('그것은 운명(運命)이었다.'), '그것은 운명이었다.');
  assert.equal(visibleText('평범한 문장 (웃음) 끝.'), '평범한 문장 (웃음) 끝.', 'ordinary parentheses stay');
  assert.equal(visibleText('3*4=12'), '3*4=12');
  const doc = { createElement: tag => ({ tag, children: [], className: '', textContent: '', append(...nodes) { this.children.push(...nodes); } }) };
  const element = { ownerDocument: doc, nodes: [], replaceChildren(...nodes) { this.nodes = nodes; } };
  renderTypeset(element, line, 4);
  assert.equal(element.nodes[1].tag, 'ruby'); assert.equal(element.nodes[1].children.length, 1, 'no reading until the base is typed');
  renderTypeset(element, line, 5);
  assert.equal(element.nodes[1].children[1].textContent, '운명');
  assert.equal(speakableKorean('*절대로* 안 돼.'), '절대로 안 돼.');
});

test('the gallery lists only stored event and composition art of this story', () => {
  const event = JSON.stringify(['vn-event-2', 'work:story', 'text', 3]);
  const styled = JSON.stringify(['vn-style-1', JSON.stringify(['vn-drawn-shot-1', 'work:story', 'x']), 'watercolour']);
  const rows = [
    { key: event, url: 'data:image/png;base64,AA', savedAt: 2 },
    { key: styled, url: 'data:image/png;base64,BB', savedAt: 1 },
    { key: JSON.stringify(['vn-portrait-1', 'work:story', 'a']), url: 'data:image/png;base64,CC' },
    { key: JSON.stringify(['vn-event-2', 'work:story', 'y', 1]), url: 'data:image/png;base64,DD', rejected: true },
    { key: JSON.stringify(['vn-voice-3', 'work:story']), url: 'data:audio/mpeg;base64,EE' },
  ];
  assert.equal(assetType(styled), 'vn-drawn-shot-1');
  assert.deepEqual(galleryImages(rows).map(row => row.kind), ['구도', '사건']);
});

function sprite(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, [r, g, b, a] = paint(x, y); data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return data;
}
test('face compositing keeps the base body and only replaces an aligned face; misaligned art is shown as generated', () => {
  const w = 64, h = 96, face = { x: 32, eyeY: 20, width: 16, headWidth: 24 };
  const body = (x, y) => Math.abs(x - 32) < 20 && y > 6 ? [200, 150, 120, 255] : [0, 0, 0, 0];
  const base = sprite(w, h, body);
  const oval = faceOval(face);
  // Same body with slightly different clothing noise below, a new face inside.
  const expression = sprite(w, h, (x, y) => {
    const inside = Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry) < 0.6;
    const [r, g, b, a] = body(x, y);
    return inside ? [90, 40, 40, 255] : [r + (y > 60 ? 6 : 0), g, b, a];
  });
  const out = composeFacePixels(base, expression, w, h, face);
  assert.ok(out, 'aligned art composites');
  const at = (x, y) => Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
  assert.deepEqual(at(Math.round(oval.cx), Math.round(oval.cy)), [90, 40, 40], 'the new face is used');
  assert.deepEqual(at(32, 80), [200, 150, 120], 'the body stays exactly the base');
  const shifted = sprite(w, h, (x, y) => body(x - 9, y));
  assert.equal(composeFacePixels(base, shifted, w, h, face), null, 'a moved pose is not spliced');
  const turned = sprite(w, h, (x, y) => Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry) < 1.05 ? [20, 200, 20, 255] : body(x, y));
  assert.equal(composeFacePixels(base, turned, w, h, face), null, 'a visible seam is refused');
});
