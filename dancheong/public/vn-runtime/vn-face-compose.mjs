// Experimental expression compositing (opt-in). A generated expression is a
// whole new picture, so buttons, folds and hair ends can drift from the base
// sprite between expressions. When the new picture is pixel-aligned with the
// base outside the face, only a feathered face oval from the expression is
// laid over the base, and the costume and silhouette stay identical.
// Anything that fails the alignment or seam checks is shown as generated.
import { alphaBounds, portraitLandmarks } from './vn-sprite.mjs?v=e0d140d50b0f';

export function faceOval(face) {
  if (!face) return null;
  return { cx: face.x, cy: face.eyeY + face.width * 0.28, rx: face.width * 0.64, ry: face.width * 0.74 };
}
// 1 inside the core oval, fading to 0 across the outer 22% (feather).
export function ovalWeight(oval, x, y) {
  const d = Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry);
  return d <= 0.78 ? 1 : d >= 1 ? 0 : (1 - d) / 0.22;
}
const diff = (a, b, i) => (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;

// Pure pixel rule on RGBA arrays of the same size. Returns the composite or null.
export function composeFacePixels(base, expression, width, height, face) {
  const oval = faceOval(face);
  if (!oval || base.length !== expression.length || base.length !== width * height * 4 || oval.rx < 6) return null;
  // Gate 1: silhouette and colour outside the oval must match (the model kept
  // the camera and pose). Otherwise the expression is its own picture.
  let both = 0, either = 0, colour = 0, samples = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    if (ovalWeight(oval, x, y) > 0) continue;
    const i = (y * width + x) * 4, a = base[i + 3] > 128, b = expression[i + 3] > 128;
    if (a || b) either++;
    if (a && b) { both++; colour += diff(base, expression, i); samples++; }
  }
  if (!either || both / either < 0.95 || !samples || colour / samples > 16) return null;
  // Gate 2: across the feather ring the two pictures must already agree, or
  // the blend would show a visible seam (a turned head, different bangs).
  let ring = 0, ringError = 0;
  for (let y = Math.max(0, Math.floor(oval.cy - oval.ry)); y <= Math.min(height - 1, Math.ceil(oval.cy + oval.ry)); y++) {
    for (let x = Math.max(0, Math.floor(oval.cx - oval.rx)); x <= Math.min(width - 1, Math.ceil(oval.cx + oval.rx)); x++) {
      const w = ovalWeight(oval, x, y); if (w <= 0 || w >= 1) continue;
      const i = (y * width + x) * 4;
      if (base[i + 3] < 128 && expression[i + 3] < 128) continue;
      ring++; ringError += diff(base, expression, i) + Math.abs(base[i + 3] - expression[i + 3]) / 3;
    }
  }
  if (!ring || ringError / ring > 22) return null;
  const out = base.slice();
  for (let y = Math.max(0, Math.floor(oval.cy - oval.ry)); y <= Math.min(height - 1, Math.ceil(oval.cy + oval.ry)); y++) {
    for (let x = Math.max(0, Math.floor(oval.cx - oval.rx)); x <= Math.min(width - 1, Math.ceil(oval.cx + oval.rx)); x++) {
      const w = ovalWeight(oval, x, y); if (w <= 0) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) out[i + c] = Math.round(base[i + c] * (1 - w) + expression[i + c] * w);
    }
  }
  return out;
}

const composed = new Map();
async function pixelsOf(url) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return { canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height) };
}
// Browser wrapper: returns a PNG data URL of the composite, or the expression
// URL unchanged when compositing is not safe.
export function faceComposite(baseUrl, expressionUrl) {
  if (!baseUrl || !expressionUrl || baseUrl === expressionUrl || typeof Image === 'undefined') return Promise.resolve(expressionUrl);
  // PNG tails/lengths are not image identities (often identical across frames).
  const key = JSON.stringify([baseUrl, expressionUrl]);
  if (composed.has(key)) return composed.get(key);
  const task = (async () => {
    try {
      const [base, expression] = await Promise.all([pixelsOf(baseUrl), pixelsOf(expressionUrl)]);
      const { width, height } = base.canvas;
      if (expression.canvas.width !== width || expression.canvas.height !== height) return expressionUrl;
      const bounds = alphaBounds(base.data.data, width, height);
      const face = bounds && portraitLandmarks(base.data.data, width, bounds);
      const pixels = face && composeFacePixels(base.data.data, expression.data.data, width, height, face);
      if (!pixels) return expressionUrl;
      base.context.putImageData(new ImageData(pixels, width, height), 0, 0);
      return base.canvas.toDataURL('image/png');
    } catch { return expressionUrl; }
  })();
  composed.set(key, task);
  if (composed.size > 32) composed.delete(composed.keys().next().value);
  return task;
}
