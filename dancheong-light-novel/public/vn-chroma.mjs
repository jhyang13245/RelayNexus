// Gemini sprites use a solid matte because native alpha output is unavailable.
export const matteColors = { green: [0, 255, 0], magenta: [255, 0, 255], blue: [0, 0, 255] };
const clamp = value => Math.max(0, Math.min(255, value));
function distance(data, i, color) { return Math.hypot(data[i] - color[0], data[i + 1] - color[1], data[i + 2] - color[2]); }
function dominance(data, i, color) {
  if (color[1]) return data[i + 1] - Math.max(data[i], data[i + 2]);
  if (color[0]) return Math.min(data[i], data[i + 2]) - data[i + 1];
  return data[i + 2] - Math.max(data[i], data[i + 1]);
}
export function chooseMatte(pixels) {
  const scores = Object.keys(matteColors).map(name => [name, 0]);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    for (const row of scores) if (dominance(pixels, i, matteColors[row[0]]) > 45) row[1]++;
  }
  return scores.sort((a, b) => a[1] - b[1])[0][0];
}
// Flood from the border and exact-color islands (e.g. between an arm and torso).
// Only the chosen saturated matte is removed; original alpha is never increased.
export function removeMattePixels(data, width, height, name = 'green') {
  const color = Object.hasOwn(matteColors, name) ? matteColors[name] : null;
  if (!color || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) throw new Error('Invalid sprite pixels');
  const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let head = 0, tail = 0, removed = 0;
  const add = p => {
    if (seen[p]) return;
    seen[p] = 1;
    if (dominance(data, p * 4, color) <= 45 || distance(data, p * 4, color) > 300) return;
    queue[tail++] = p;
  };
  for (let p = 0; p < width * height; p++) {
    if (p < width || p >= width * (height - 1) || p % width === 0 || p % width === width - 1 || distance(data, p * 4, color) < 35) add(p);
  }
  while (head < tail) {
    const p = queue[head++], i = p * 4;
    // Visit using unmodified pixels before unmatting their edges.
    if (p >= width) add(p - width);
    if (p < width * (height - 1)) add(p + width);
    if (p % width) add(p - 1);
    if (p % width < width - 1) add(p + 1);
    const delta = dominance(data, i, color);
    const alpha = delta >= 220 ? 0 : Math.max(0, Math.min(1, (255 - delta) / 210));
    if (alpha < 0.1) removed++;
    for (let k = 0; k < 3; k++) data[i + k] = alpha ? clamp((data[i + k] - (1 - alpha) * color[k]) / alpha) : 0;
    data[i + 3] = Math.min(data[i + 3], Math.round(255 * alpha));
  }
  return { removedFraction: removed / (width * height) };
}
async function canvasFor(url, size) {
  const img = new Image(); img.src = url; await img.decode();
  if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 20_000_000) throw new Error('인물 이미지 크기를 확인할 수 없습니다.');
  const scale = size ? Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('이 브라우저에서 인물 배경을 처리할 수 없습니다.');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, context, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
}
export async function matteForReferences(urls) {
  if (!urls?.length) return 'green';
  const samples = await Promise.all(urls.slice(0, 4).map(async url => (await canvasFor(url, 96)).pixels.data));
  const merged = new Uint8ClampedArray(samples.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const sample of samples) { merged.set(sample, offset); offset += sample.length; }
  return chooseMatte(merged);
}
export async function transparentSprite(url, name) {
  const { canvas, context, pixels } = await canvasFor(url);
  const { removedFraction } = removeMattePixels(pixels.data, canvas.width, canvas.height, name);
  if (removedFraction < 0.04) throw new Error('인물의 단색 배경을 분리하지 못했습니다. 이미지 재시도를 눌러 주세요.');
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}
