// Gemini sprites use a solid matte because native alpha output is unavailable.
export const matteColors = { green: [0, 255, 0], magenta: [255, 0, 255], blue: [0, 0, 255] };
export const chromaVersion = 3;
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
    const alpha = delta >= 220 ? 0 : Math.max(0, Math.min(1, (255 - delta) / 255));
    if (alpha < 0.1) removed++;
    for (let k = 0; k < 3; k++) data[i + k] = alpha ? clamp((data[i + k] - (1 - alpha) * color[k]) / alpha) : 0;
    data[i + 3] = Math.min(data[i + 3], Math.round(255 * alpha));
  }
  return { removedFraction: removed / (width * height) };
}
// Chroma reflected onto hair/clothes can be too weak for the background flood.
// Despill only a narrow band next to transparent pixels; never desaturate the
// character interior or change alpha, facial anatomy, pose, or framing.
export function despillEdges(data, width, height, name) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4 || (name !== undefined && !Object.hasOwn(matteColors, name))) throw new Error('Invalid sprite pixels');
  const depth = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  const radius = Math.max(2, Math.min(12, Math.ceil(Math.max(width, height) / 120)));
  let head = 0, tail = 0;
  for (let p = 0; p < depth.length; p++) if (data[p * 4 + 3] <= 24) { depth[p] = 1; queue[tail++] = p; }
  const add = (p, d) => { if (!depth[p]) { depth[p] = d; queue[tail++] = p; } };
  while (head < tail) {
    const p = queue[head++], d = depth[p];
    if (d > radius) continue;
    if (p >= width) add(p - width, d + 1);
    if (p < width * (height - 1)) add(p + width, d + 1);
    if (p % width) add(p - 1, d + 1);
    if (p % width < width - 1) add(p + 1, d + 1);
  }
  // Older cached Gemini cutouts did not store the matte name. Infer it only
  // when a single spill hue clearly dominates the transparent contour.
  if (name === undefined) {
    const scores = Object.keys(matteColors).map(key => [key, 0]);
    for (let p = 0; p < depth.length; p++) if (depth[p] && data[p * 4 + 3] > 24) {
      for (const row of scores) row[1] += Math.max(0, dominance(data, p * 4, matteColors[row[0]]) - 8);
    }
    scores.sort((a, b) => b[1] - a[1]);
    if (scores[0][1] < 64 || scores[0][1] < scores[1][1] * 2) return { corrected: 0, matte: null };
    name = scores[0][0];
  }
  let corrected = 0;
  for (let p = 0; p < depth.length; p++) {
    const i = p * 4;
    if (!depth[p] || data[i + 3] === 0 || dominance(data, i, matteColors[name]) <= 3) continue;
    if (name === 'green') data[i + 1] = Math.max(data[i], data[i + 2]);
    else if (name === 'blue') data[i + 2] = Math.max(data[i], data[i + 1]);
    else { const spill = Math.min(data[i], data[i + 2]) - data[i + 1]; data[i] -= spill; data[i + 2] -= spill; }
    corrected++;
  }
  return { corrected, matte: name };
}

// Defringe the extracted contour, including yellow-green remnants left after
// a simple max(R,B) despill. A nearby opaque pixel supplies the foreground hue;
// the face/interior stays untouched, and fine strands keep partial coverage.
export function refineSpriteEdges(data, width, height, name) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4 || (name !== undefined && !Object.hasOwn(matteColors, name))) throw new Error('Invalid sprite pixels');
  const source = data.slice(), depth = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  const radius = Math.max(3, Math.min(28, Math.ceil(Math.max(width, height) / 60)));
  let head = 0, tail = 0;
  for (let p = 0; p < depth.length; p++) if (source[p * 4 + 3] <= 24) { depth[p] = 1; queue[tail++] = p; }
  const add = (p, d) => { if (!depth[p]) { depth[p] = d; queue[tail++] = p; } };
  while (head < tail) {
    const p = queue[head++], d = depth[p];
    if (d > radius) continue;
    if (p >= width) add(p - width, d + 1);
    if (p < width * (height - 1)) add(p + width, d + 1);
    if (p % width) add(p - 1, d + 1);
    if (p % width < width - 1) add(p + 1, d + 1);
  }
  const greenFloor = (pixels, i) => pixels[i] >= pixels[i + 2] ? pixels[i] * .75 + pixels[i + 2] * .25 : pixels[i + 2];
  const excess = (i, matte) => matte === 'green' ? source[i + 1] - greenFloor(source, i)
    : matte === 'blue' ? source[i + 2] - (source[i] + source[i + 1]) / 2 : Math.min(source[i], source[i + 2]) - source[i + 1];
  if (name === undefined) {
    const scores = Object.keys(matteColors).map(matte => [matte, 0]);
    for (let p = 0; p < depth.length; p++) if (depth[p] && source[p * 4 + 3] > 24) for (const score of scores) score[1] += Math.max(0, dominance(source, p * 4, matteColors[score[0]]) - 5);
    scores.sort((a, b) => b[1] - a[1]);
    if (scores[0][1] >= 64 && scores[0][1] > scores[1][1] * 2) name = scores[0][0];
  }
  const directions = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  let corrected = 0, feathered = 0;
  for (let p = 0; p < depth.length; p++) {
    const i = p * 4, alpha = source[i + 3], d = depth[p];
    if (!d || d > radius || !alpha) continue;
    const x = p % width, y = Math.floor(p / width);
    let reference = -1, score = Infinity, minAlpha = alpha;
    for (const [dx, dy] of directions) {
      for (let step = 1; step <= radius; step++) {
        const xx = x + dx * step, yy = y + dy * step;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) break;
        const q = yy * width + xx, j = q * 4;
        if (step === 1) minAlpha = Math.min(minAlpha, source[j + 3]);
        if (source[j + 3] < 240 || (depth[q] && depth[q] < Math.max(4, d + 2))) continue;
        // Never copy another matte-contaminated pixel into the outer contour.
        if (name && excess(j, name) > 4) continue;
        const candidateScore = step * (dx && dy ? 1.42 : 1) + (Math.abs(source[i] - source[j]) + Math.abs(source[i + 2] - source[j + 2])) * .012;
        if (candidateScore < score) { reference = j; score = candidateScore; }
        break;
      }
    }
    const expected = 0;
    const spill = name ? excess(i, name) - expected : 0;
    // The matte is selected to avoid colours in the reference character.
    // Correction is restricted to the contour; deep clothing/skin is intact.
    const contaminated = name && spill > 4;
    const lightFringe = reference >= 0 && d <= 2 && alpha < 230 &&
      (source[i] + source[i + 1] + source[i + 2] - source[reference] - source[reference + 1] - source[reference + 2]) > 90;
    if (contaminated || lightFringe) {
      if (reference >= 0) {
        const blend = contaminated ? Math.min(1, .55 + spill / 100) : .65;
        for (let k = 0; k < 3; k++) data[i + k] = Math.round(source[i + k] * (1 - blend) + source[reference + k] * blend);
      }
      if (contaminated) {
        if (name === 'green') data[i + 1] = Math.min(data[i + 1], Math.round(greenFloor(data, i) + expected));
        else if (name === 'blue') data[i + 2] = Math.min(data[i + 2], Math.round((data[i] + data[i + 1]) / 2 + expected));
        else { const delta = Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1] - expected); data[i] -= delta; data[i + 2] -= delta; }
      }
      corrected++;
    }
    // Fractional-pixel contraction removes the remaining bright rim without
    // a binary cut that would erase hair, ribbons or fingers. Run once/version.
    if (d <= 2) {
      const coverage = Math.round(alpha - Math.max(0, alpha - minAlpha) * .35);
      const next = coverage <= 5 ? 0 : coverage;
      if (next < alpha) { data[i + 3] = next; feathered++; }
      if (!next) data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { corrected, feathered, matte: name || null };
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
  refineSpriteEdges(pixels.data, canvas.width, canvas.height, name);
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}
export async function cleanSpriteEdges(url, name) {
  const { canvas, context, pixels } = await canvasFor(url);
  const { corrected, feathered } = refineSpriteEdges(pixels.data, canvas.width, canvas.height, name);
  if (!corrected && !feathered) return url;
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}
