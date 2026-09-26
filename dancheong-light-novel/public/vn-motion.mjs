import { displaySprite, alphaBounds, faceLandmarks } from './vn-sprite.mjs';
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
const checked = new Map();
export function prepareMotion(base, variant) {
  const key = `${base}:${variant}`;
  if (checked.has(key)) return checked.get(key);
  const task = (async () => {
    try {
      const urls = await Promise.all([displaySprite(base), displaySprite(variant, base)]);
      const images = await Promise.all(urls.map(src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; })));
      if (Math.abs(images[0].width / images[0].height - images[1].width / images[1].height) > .015) return '';
      const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 256;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const pixels = images.map(img => { context.clearRect(0, 0, 192, 256); context.drawImage(img, 0, 0, 192, 256); return context.getImageData(0, 0, 192, 256).data; });
      return stableMotionPixels(pixels[0], pixels[1], 192, 256) ? urls[1] : '';
    } catch { return ''; }
  })(); checked.set(key, task); if (checked.size > 50) checked.delete(checked.keys().next().value); return task;
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
    const source = await canvasImage(url), base = await canvasImage(url, 768, 1024);
    const bounds = alphaBounds(base.pixels.data, 768, 1024);
    const box = bounds && motionRegion(faceLandmarks(base.pixels.data, 768, bounds), 768, 1024, kind);
    if (!box) return null;
    const mask = document.createElement('canvas'); mask.width = 768; mask.height = 1024;
    const ctx = mask.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 768, 1024); ctx.clearRect(box.x, box.y, box.width, box.height);
    return { source, base, box, image: base.canvas.toDataURL('image/png'), mask: mask.toDataURL('image/png') };
  } catch { return null; }
}
export async function finishMotionEdit(edit, result) {
  const output = await canvasImage(result);
  if (output.naturalWidth !== 768 || output.naturalHeight !== 1024 || !compositeMotionPixels(edit.base.pixels.data, output.pixels.data, 768, 1024, edit.box)) throw new Error('눈·입 편집의 정렬이 맞지 않아 정지 입상을 유지합니다. 자동 재생성하지 않습니다.');
  const source = edit.source, w = source.canvas.width, h = source.canvas.height;
  const scaled = await canvasImage(result, w, h), sx = w / 768, sy = h / 1024;
  const box = { x: Math.round(edit.box.x * sx), y: Math.round(edit.box.y * sy), width: Math.max(1, Math.round(edit.box.width * sx)), height: Math.max(1, Math.round(edit.box.height * sy)) };
  const merged = compositeMotionPixels(source.pixels.data, scaled.pixels.data, w, h, box);
  if (!merged) throw new Error('눈·입 편집의 원본 정렬을 확인하지 못했습니다.');
  source.ctx.putImageData(new ImageData(merged, w, h), 0, 0);
  return source.canvas.toDataURL('image/png');
}
