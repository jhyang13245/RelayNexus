import { displaySprite } from './vn-sprite.mjs?v=ef485ae04925';
import { createByteLru } from './vn-byte-lru.mjs?v=ef485ae04925';
import { retainDisplay } from './vn-display-memory.mjs?v=ef485ae04925';
import { detectMotionGeometry } from './vn-motion-landmarks.mjs?v=ef485ae04925';
import { preciseMotionPixels, regionWeight, supportedFeatures, transformGeometry } from './vn-motion-geometry.mjs?v=ef485ae04925';
export const motionKey = (portraitKey, kind) => JSON.stringify(['vn-motion-mask-1', portraitKey, kind]);
export const motionPrompt = kind => `Produce ONE animation frame for this exact reference sprite. Preserve its canvas, pixel alignment, camera, pose, proportions, head angle, hairstyle, clothing, lighting and transparent background. ${kind === 'blink' ? 'The same character briefly closes their eyelids for a natural blink; mouth and current emotion stay unchanged.' : 'The same character opens their mouth slightly for one natural speaking frame; eyes and current emotion stay unchanged.'} No gesture, redraw of the body, facial embellishment, change of expression, new scene, text or extra panels. Return the complete aligned transparent character sprite.`;

// A conservative stability gate: moving clothes/hair or different framing must
// not make a standing sprite flicker. Rejected frames remain cached, never retried.
export function stableMotionPixels(base, variant, width, height) {
  if (base.length !== variant.length || base.length !== width * height * 4) return false;
  let changed = 0, total = 0, error = 0;
  for (let y = Math.floor(height * .42); y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (base[i + 3] < 20 && variant[i + 3] < 20) continue;
    let d = Math.abs(base[i + 3] - variant[i + 3]);
    for (let c = 0; c < 3; c++) d += Math.abs(base[i + c] - variant[i + c]);
    total++; error += d / 4; if (d / 4 > 24) changed++;
  }
  return total > width * height * .05 && error / total < 8 && changed / total < .07;
}
const checked = createByteLru({ maxBytes: 16 * 1024 * 1024, maxEntries: 4, onEvict: task => { void task.then(frames => frames.release?.()); } });
// Includes existing cached edits. A previously accepted hair band is never trusted.
export function prepareMotionFrames(source, blink = '', talk = '', reference = '') {
  const key = JSON.stringify([source, blink, talk, reference]);
  if (checked.has(key)) return checked.get(key);
  const task = (async () => {
    const base = await displaySprite(source, source, reference), frames = { source, base, blink: '', talk: '', both: '' };
    try {
      if (reference && reference !== source && base === await displaySprite(reference)) return frames;
      const geometry = await detectMotionGeometry(source);
      if (!geometry) return frames;
      const original = await canvasImage(source), w = original.canvas.width, h = original.canvas.height, merged = {};
      for (const [kind, url] of [['blink', blink], ['talk', talk]]) {
        if (!url) continue;
        const variant = await canvasImage(url);
        if (variant.canvas.width !== w || variant.canvas.height !== h) continue;
        const pixels = preciseMotionPixels(original.pixels.data, variant.pixels.data, w, h, geometry, kind);
        if (!pixels) continue;
        merged[kind] = pixels;
        variant.ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
        frames[kind] = await displaySprite(variant.canvas.toDataURL('image/png'), source, reference);
      }
      if (merged.blink && merged.talk) {
        const pixels = merged.blink.slice();
        // Accepted patches have original pixels everywhere else. This preserves
        // the mouth during a blink without another paid frame or another redraw.
        for (let i = 0; i < pixels.length; i += 4) if (merged.talk[i] !== original.pixels.data[i] || merged.talk[i+1] !== original.pixels.data[i+1] || merged.talk[i+2] !== original.pixels.data[i+2]) {
          pixels[i] = merged.talk[i]; pixels[i+1] = merged.talk[i+1]; pixels[i+2] = merged.talk[i+2];
        }
        original.ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
        frames.both = await displaySprite(original.canvas.toDataURL('image/png'), source, reference);
      }
      // Decode before the animation timer swaps src, avoiding blank first frames.
      await Promise.all([...new Set(Object.values(frames).filter((url, i) => i > 0 && url))].map(async url => { const img = new Image(); img.src = url; await img.decode(); }));
    } catch { frames.blink = frames.talk = frames.both = ''; }
    return frames;
  })().then(frames => { const releases = [frames.base, frames.blink, frames.talk, frames.both].filter(Boolean).map(retainDisplay); frames.release = () => releases.splice(0).forEach(release => release()); return frames; });
  if (!checked.set(key, task, key.length * 2)) void task.then(frames => frames.release());
  return task;
}

export function motionRegion(face, width, height, kind) {
  if (!face || !['blink', 'talk'].includes(kind)) return null;
  const w = face.width * (kind === 'blink' ? 1.1 : .52), h = face.width * (kind === 'blink' ? .27 : .3);
  const x = face.x - w / 2, y = face.eyeY + face.width * (kind === 'blink' ? -.13 : .43);
  if (x < 0 || y < 0 || x + w >= width || y + h >= height || w < 12) return null;
  return { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(w), height: Math.ceil(h) };
}
// All pixels outside the tiny edited region are copied byte-for-byte from the
// base, not from the model output. A drifting unmasked face/body rejects it.
export function compositeMotionPixels(base, variant, width, height, box) {
  if (!box || base.length !== variant.length || base.length !== width * height * 4) return null;
  let count = 0, error = 0, changed = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x >= box.x - 3 && x <= box.x + box.width + 3 && y >= box.y - 3 && y <= box.y + box.height + 3) continue;
    const i = (y * width + x) * 4;
    if (base[i + 3] < 20 && variant[i + 3] < 20) continue;
    const d = (Math.abs(base[i] - variant[i]) + Math.abs(base[i + 1] - variant[i + 1]) + Math.abs(base[i + 2] - variant[i + 2]) + Math.abs(base[i + 3] - variant[i + 3])) / 4;
    count++; error += d; if (d > 22) changed++;
  }
  if (!count || error / count > 7 || changed / count > .045) return null;
  const out = base.slice();
  for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
    const i = (y * width + x) * 4;
    const feather = Math.min(1, Math.min(x - box.x, box.x + box.width - 1 - x, y - box.y, box.y + box.height - 1 - y) / 3);
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(base[i + c] * (1 - feather) + variant[i + c] * feather);
    // Alpha belongs to the original silhouette even inside the mask.
  }
  return out;
}
async function canvasImage(url, width, height) {
  const img = new Image(); img.src = url; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = width || img.naturalWidth; canvas.height = height || img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}
export async function prepareMotionEdit(url, kind) {
  try {
    const geometry = await detectMotionGeometry(url);
    if (!geometry) return null;
    const source = await canvasImage(url), w = source.canvas.width, h = source.canvas.height;
    if (!supportedFeatures(source.pixels.data, w, h, geometry, kind)) return null;
    const scale = Math.min(768 / w, 1024 / h), x = (768 - w * scale) / 2, y = (1024 - h * scale) / 2;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1024;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source.canvas, x, y, w * scale, h * scale);
    const base = { canvas, ctx, pixels: ctx.getImageData(0, 0, 768, 1024) }, editGeometry = transformGeometry(geometry, scale, x, y);
    const mask = document.createElement('canvas'); mask.width = 768; mask.height = 1024;
    const mc = mask.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, 768, 1024);
    mc.globalCompositeOperation = 'destination-out';
    for (const r of editGeometry.regions[kind]) { mc.beginPath(); mc.ellipse(r.cx, r.cy, r.rx, r.ry, r.angle, 0, Math.PI * 2); mc.fill(); }
    return { source, base, geometry, editGeometry, scale, x, y, kind, image: canvas.toDataURL('image/png'), mask: mask.toDataURL('image/png') };
  } catch { return null; }
}
export async function finishMotionEdit(edit, result) {
  const output = await canvasImage(result);
  if (output.naturalWidth !== 768 || output.naturalHeight !== 1024 || !preciseMotionPixels(edit.base.pixels.data, output.pixels.data, 768, 1024, edit.editGeometry, edit.kind)) throw new Error('눈·입 편집의 정렬이 맞지 않아 정지 입상을 유지합니다. 자동 재생성하지 않습니다.');
  const source = edit.source, w = source.canvas.width, h = source.canvas.height;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(output.canvas, edit.x, edit.y, w * edit.scale, h * edit.scale, 0, 0, w, h);
  // Resampling can change untouched high-frequency linework. Only resample the
  // measured feature patches; the full model-space image was checked above.
  const candidate = source.pixels.data.slice(), scaled = ctx.getImageData(0, 0, w, h).data;
  for (const r of edit.geometry.regions[edit.kind]) for (let py = Math.max(0, Math.floor(r.cy-r.rx)); py <= Math.min(h-1,r.cy+r.rx); py++)
    for (let px = Math.max(0, Math.floor(r.cx-r.rx)); px <= Math.min(w-1,r.cx+r.rx); px++) {
      if (!regionWeight(r, px, py)) continue;
      const i = (py*w+px)*4; for (let c=0;c<3;c++) candidate[i+c] = scaled[i+c];
    }
  const merged = preciseMotionPixels(source.pixels.data, candidate, w, h, edit.geometry, edit.kind);
  if (!merged) throw new Error('눈·입 편집의 원본 정렬을 확인하지 못했습니다.');
  source.ctx.putImageData(new ImageData(merged, w, h), 0, 0);
  return source.canvas.toDataURL('image/png');
}
