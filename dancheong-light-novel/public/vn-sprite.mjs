// Sprite framing and expression stability. Pixel rules are pure and tested;
// the canvas helpers at the end only run in the browser.
import { rasterTask } from './vn-raster.mjs';
const ALPHA = 24;

export function alphaBounds(data, width, height) {
  let left = width, right = -1, top = height, bottom = -1, transparent = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha < 250) transparent++;
    if (alpha <= ALPHA) continue;
    if (x < left) left = x; if (x > right) right = x;
    if (y < top) top = y; if (y > bottom) bottom = y;
  }
  if (right < 0) return null;
  return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, transparentFraction: transparent / (width * height) };
}

// Centre of the head: mean centre of the opaque span over the top 12% of the
// body, weighted by span width so a thin ahoge or ribbon barely matters.
export function headCentre(data, width, bounds) {
  const rows = Math.max(1, Math.round(bounds.height * 0.12));
  let sum = 0, weight = 0;
  for (let y = bounds.top; y < bounds.top + rows; y++) {
    let first = -1, last = -1;
    for (let x = bounds.left; x <= bounds.right; x++) if (data[(y * width + x) * 4 + 3] > ALPHA) { if (first < 0) first = x; last = x; }
    if (first < 0) continue;
    const span = last - first + 1;
    sum += (first + last) / 2 * span; weight += span;
  }
  return weight ? sum / weight : (bounds.left + bounds.right) / 2;
}

// Place the figure so the hair top sits 3% below the canvas top, the head is
// horizontally centred and a cropped bottom edge stays flush with the frame.
export function normalisedFrame(bounds, centreX, sourceHeight) {
  const flush = sourceHeight - 1 - bounds.bottom <= 2;
  const outHeight = Math.ceil(bounds.height / (flush ? 0.97 : 0.94));
  const half = Math.max(centreX - bounds.left, bounds.right - centreX) + 2;
  const outWidth = Math.max(Math.round(outHeight * 0.75), Math.ceil(half * 2));
  const y = flush ? outHeight - bounds.height : Math.round(outHeight * 0.03);
  return { outWidth, outHeight, x: Math.round(outWidth / 2 - (centreX - bounds.left)), y };
}

// Estimate the exposed face in the upper head region, before shoulders/hands.
// This is a conservative pixel heuristic, not a face-recognition model. Warm
// skin pixels establish scale; hair, hats and transparent margins do not.
export function faceLandmarks(data, width, bounds) {
  const centre = headCentre(data, width, bounds);
  const radius = bounds.height * 0.23, minimum = Math.max(3, bounds.height * 0.025);
  const rows = [], maskHeight = Math.ceil(bounds.top + bounds.height * 0.42);
  const skin = new Uint8Array(width * maskHeight);
  for (let y = bounds.top; y < bounds.top + bounds.height * 0.42; y++) {
    let left = width, right = -1, count = 0;
    for (let x = Math.max(bounds.left, Math.floor(centre - radius)); x <= Math.min(bounds.right, Math.ceil(centre + radius)); x++) {
      const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      // Allow light through brown complexions; reject grey/white hair, saturated
      // red clothing and dark linework. Low-confidence portraits use old framing.
      if (data[i + 3] <= 200 || r < 90 || g < 55 || b < 35 || r - g < 10 || r - g > 80 || g - b < 6 || g - b > 65 || r - b < 28 || r > g * 1.65) continue;
      skin[y * width + x] = 1;
      left = Math.min(left, x); right = Math.max(right, x); count++;
    }
    rows.push({ y, left, right, count, span: right - left + 1 });
  }
  const direct = measureFaceRows(data, width, bounds, rows, minimum);
  if (direct) return direct;
  // Warm brown hair highlights can look like the first patch of skin. If that
  // patch fails, find a substantial compact skin component farther down rather
  // than abandoning face scale and shrinking the entire long sprite to fit.
  const component = compactFaceRows(skin, width, bounds);
  return component ? measureFaceRows(data, width, bounds, component, minimum) : null;
}

function compactFaceRows(skin, width, bounds) {
  const visited = new Uint8Array(skin.length), queue = new Int32Array(skin.length);
  const candidates = [];
  for (let at = bounds.top * width; at < skin.length; at++) {
    if (!skin[at] || visited[at]) continue;
    let size = 1, left = width, right = -1, top = Infinity, bottom = -1;
    queue[0] = at; visited[at] = 1;
    for (let n = 0; n < size; n++) {
      const p = queue[n], x = p % width, y = Math.floor(p / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const next of [p - 1, p + 1, p - width, p + width]) {
        if (next < 0 || next >= skin.length || Math.abs(next % width - x) > 1 || visited[next] || !skin[next]) continue;
        visited[next] = 1; queue[size++] = next;
      }
    }
    const span = right - left + 1, height = bottom - top + 1;
    // Thin hair streaks, earrings and the lower chest are not face anchors.
    if (span < bounds.height * .055 || span > bounds.height * .3 || height < bounds.height * .04 || size / (span * height) < .3 || top > bounds.top + bounds.height * .28) continue;
    const rows = [];
    for (let y = top; y <= bottom; y++) rows.push({ y, left: width, right: -1, count: 0, span: 0 });
    for (let n = 0; n < size; n++) {
      const p = queue[n], x = p % width, row = rows[Math.floor(p / width) - top];
      row.left = Math.min(row.left, x); row.right = Math.max(row.right, x); row.count++; row.span = row.right - row.left + 1;
    }
    candidates.push({ rows, size });
  }
  // Prefer the most substantial compact component in the upper head region.
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.rows || null;
}

function measureFaceRows(data, width, bounds, rows, minimum) {
  // Ignore isolated earrings and small warm highlights above the face.
  const first = rows.findIndex((row, i) => row.count >= minimum && rows.slice(i, i + Math.max(3, Math.round(bounds.height * 0.008))).every(next => next.count >= minimum));
  if (first < 0) return null;
  const start = rows[first].y;
  const region = []; let gap = 0;
  for (const row of rows.slice(first)) {
    if (row.y > start + bounds.height * .115) break;
    if (row.count < minimum) {
      if (++gap >= Math.max(3, Math.round(bounds.height * .008))) break;
      continue;
    }
    gap = 0;
    if (row.count / row.span > .38) region.push(row);
  }
  if (region.length < bounds.height * 0.025) return null;
  const widths = region.map(row => row.span).sort((a, b) => a - b);
  const faceWidth = widths[Math.floor(widths.length * 0.75)];
  if (faceWidth < bounds.height * 0.055 || faceWidth > bounds.height * 0.3) return null;
  const broad = region.filter(row => row.span >= faceWidth * 0.85 && row.span <= faceWidth * 1.2);
  if (!broad.length) return null;
  const x = broad.reduce((sum, row) => sum + (row.left + row.right) / 2, 0) / broad.length;
  const caps = hairCapWidths(data, width, bounds, x, start - faceWidth * .55, start, faceWidth);
  const capWidth = caps.length >= 3 ? caps[Math.floor(caps.length / 2)] : 0;
  // With exposed foreheads the first skin row is well above the eyes. A short
  // hair cap can also be narrower than the face (ears/three-quarter views).
  // Do not replace that real contour with an invented 1.56x-wide hair mass.
  const forehead = capWidth > 0 && capWidth < faceWidth * 1.2;
  const eyeY = start + faceWidth * (forehead ? .32 : .22);
  const browCaps = forehead ? hairCapWidths(data, width, bounds, x, start + faceWidth * .04, start + faceWidth * .26, faceWidth) : caps;
  const headWidth = browCaps.length >= 3 ? browCaps[Math.floor(browCaps.length / 2)] : capWidth || faceWidth * 1.56;
  return { x, eyeY, width: faceWidth, headWidth };
}

function hairCapWidths(data, width, bounds, x, from, to, faceWidth) {
  const caps = [];
  // The connected hair cap around this face is a steadier visual scale than
  // exposed skin alone (bangs, a turned cheek and ears change visible skin).
  for (let y = Math.max(bounds.top, Math.round(from)); y <= Math.min(bounds.bottom, to); y++) {
    const cx = Math.round(x);
    if (data[(y * width + cx) * 4 + 3] <= ALPHA) continue;
    let left = cx, right = cx;
    while (left > bounds.left && data[(y * width + left - 1) * 4 + 3] > ALPHA) left--;
    while (right < bounds.right && data[(y * width + right + 1) * 4 + 3] > ALPHA) right++;
    const span = right - left + 1;
    if (span >= faceWidth * .55 && span < faceWidth * 3) caps.push(span);
  }
  caps.sort((a, b) => a - b);
  return caps;
}

// Nadia's preferred medium framing: head cap ~25%, eye line near 26% of height.
// Use the measured head contour for camera scale. Visible skin width varies
// greatly with bangs, exposed ears and face angle; it is not physical stature.
// Crop excess lower body instead of shrinking a full-body sprite.
// Same scale on both axes; never warp or splice facial pixels.
export function faceFrame(bounds, face) {
  // Camera distance comes ONLY from the head, never the available body length.
  // Fitting a short bust's bottom to the stage magnifies its face relative to
  // longer sprites. Preserve scale even while old, cropped art is a fallback.
  const outHeight = Math.ceil((face.headWidth || face.width * 1.56) / 0.25);
  const outWidth = Math.ceil(Math.max(outHeight * 0.75, 2 * Math.max(face.x - bounds.left, bounds.right - face.x)));
  return { outWidth, outHeight, x: Math.round(outWidth / 2 - (face.x - bounds.left)), y: Math.round(outHeight * 0.26 - (face.eyeY - bounds.top)) };
}

// Used by both the worker and main-thread fallback. An incomplete old portrait
// keeps the same camera scale; soften its exposed crop while replacement art
// is being prepared instead of zooming the head to hide missing body pixels.
export function drawFramedSprite(context, source, bounds, frame) {
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, frame.x, frame.y, bounds.width, bounds.height);
  const bottom = frame.y + bounds.height;
  if (bottom >= frame.outHeight * .94) return;
  const fade = context.createLinearGradient(0, bottom - Math.min(bounds.height * .08, frame.outHeight * .06), 0, bottom);
  fade.addColorStop(0, '#fff'); fade.addColorStop(1, '#fff0');
  context.save(); context.globalCompositeOperation = 'destination-in'; context.fillStyle = fade;
  context.fillRect(0, 0, frame.outWidth, frame.outHeight); context.restore();
}

// Geometry guard for every generated standing sprite, independent of names,
// works and providers. It cannot infer anatomy/clothing from pixels; uncertain
// landmarks are explicitly unmeasured, never described as a verified pass.
export function portraitFrameCheck(bounds, face) {
  if (!bounds) return { status: 'invalid', code: 'EMPTY_SPRITE' };
  if (bounds.transparentFraction < .04) return { status: 'invalid', code: 'OPAQUE_SPRITE' };
  if (!face?.headWidth || !face.width) return { status: 'unmeasured', code: 'FACE_UNCERTAIN' };
  const eyeRatio = (face.eyeY - bounds.top) / bounds.height;
  const headRatio = face.headWidth / face.width;
  if (eyeRatio < .04 || eyeRatio > .62 || headRatio < .85 || headRatio > 2.8) return { status: 'unmeasured', code: 'FACE_UNCERTAIN' };
  const targetHeight = face.headWidth / .25;
  const lowerBodyCoverage = (bounds.bottom - face.eyeY) / (targetHeight * .74);
  // Cropping a long drawing is safe; a short bust cannot create missing hips
  // and thighs. Reject clear shortages instead of enlarging that bust to fit.
  return { status: lowerBodyCoverage < .88 ? 'invalid' : 'measured',
    code: lowerBodyCoverage < .88 ? 'SHORT_BODY_CROP' : 'FRAME_GEOMETRY_OK',
    lowerBodyCoverage: Math.round(lowerBodyCoverage * 1000) / 1000 };
}

export function portraitLandmarks(data, width, bounds) {
  if (!bounds) return null;
  const regular = faceLandmarks(data, width, bounds);
  if (regular) return regular;
  // The stage estimator assumes a medium sprite. A bust can put its eyes
  // below that search window and look like "no face". Widen the landmark
  // search, while keeping the ORIGINAL bounds for framing and the body check.
  const scanHeight = Math.min(bounds.height * 1.8, (data.length / 4 / width - bounds.top - 1) / .42);
  return faceLandmarks(data, width, { ...bounds, height: scanHeight });
}

export async function checkSpriteFrame(url) {
  const accelerated = await rasterTask({ kind: 'frame-audit', url });
  if (accelerated?.status) return accelerated;
  if (typeof Image === 'undefined') return { status: 'unmeasured', code: 'CANVAS_UNAVAILABLE' };
  try {
    const sprite = await pixelsOf(url), { width, height } = sprite.canvas;
    const bounds = alphaBounds(sprite.image.data, width, height);
    return portraitFrameCheck(bounds, portraitLandmarks(sprite.image.data, width, bounds));
  } catch { return { status: 'invalid', code: 'UNREADABLE_SPRITE' }; }
}

async function pixelsOf(url) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, image: context.getImageData(0, 0, canvas.width, canvas.height) };
}

const prepared = new Map();
// Normalise framing using only the completed sprite's own pixels. Never splice
// its face onto another image or stretch it to a reference's dimensions.
export function displaySprite(url, frameUrl = url) {
  const key = frameUrl === url ? url : `${frameUrl}:${url}`;
  if (prepared.has(key)) return prepared.get(key);
  const task = (async () => {
    try {
      const accelerated = await rasterTask({ kind: 'sprite', url, frameUrl });
      if (accelerated) return accelerated;
      const sprite = await pixelsOf(frameUrl);
      const drawable = frameUrl === url ? sprite : await pixelsOf(url);
      const { width, height } = sprite.canvas;
      if (drawable.canvas.width !== width || drawable.canvas.height !== height) return frameUrl;
      const bounds = alphaBounds(sprite.image.data, width, height);
      // Opaque art (no cut-out) is shown as generated.
      if (!bounds || bounds.transparentFraction < 0.04) return url;
      const face = portraitLandmarks(sprite.image.data, width, bounds);
      const frame = face ? faceFrame(bounds, face) : normalisedFrame(bounds, headCentre(sprite.image.data, width, bounds), height);
      const out = document.createElement('canvas'); out.width = frame.outWidth; out.height = frame.outHeight;
      drawFramedSprite(out.getContext('2d'), drawable.canvas, bounds, frame);
      return out.toDataURL('image/png');
    } catch { return url; }
  })();
  prepared.set(key, task);
  if (prepared.size > 48) prepared.delete(prepared.keys().next().value);
  return task;
}
