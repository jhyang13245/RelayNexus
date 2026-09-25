// Sprite framing and expression stability. Pixel rules are pure and tested;
// the canvas helpers at the end only run in the browser.
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

// Face interior of a head-to-mid-thigh anime sprite (head ≈ 21% of the body).
export function faceEllipse(bounds, centreX) {
  return { cx: centreX, cy: bounds.top + bounds.height * 0.14, rx: bounds.height * 0.085, ry: bounds.height * 0.078 };
}

// Copy only the face of an edited expression onto the neutral sprite, so the
// body, hair and outline stay pixel-identical between expressions. Returns
// null when the edit moved or resized the figure too much to align safely.
export function compositeFace(base, expression, width, height) {
  const a = alphaBounds(base, width, height), b = alphaBounds(expression, width, height);
  if (!a || !b) return null;
  if (Math.abs(a.height - b.height) / a.height > 0.06 || Math.abs(a.width - b.width) / a.width > 0.18) return null;
  const ax = headCentre(base, width, a), bx = headCentre(expression, width, b);
  const dx = Math.round(bx - ax), dy = b.top - a.top;
  if (Math.abs(dx) > width * 0.08 || Math.abs(dy) > height * 0.08) return null;
  const face = faceEllipse(a, ax), out = new Uint8ClampedArray(base);
  const x0 = Math.max(0, Math.floor(face.cx - face.rx)), x1 = Math.min(width - 1, Math.ceil(face.cx + face.rx));
  const y0 = Math.max(0, Math.floor(face.cy - face.ry)), y1 = Math.min(height - 1, Math.ceil(face.cy + face.ry));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot((x - face.cx) / face.rx, (y - face.cy) / face.ry);
    if (d >= 1) continue;
    const sx = x + dx, sy = y + dy;
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    // Solid centre, feathered outer 35% so no seam shows at the hairline.
    const w = d < 0.65 ? 1 : (1 - d) / 0.35;
    const i = (y * width + x) * 4, j = (sy * width + sx) * 4;
    for (let k = 0; k < 4; k++) out[i + k] = Math.round(base[i + k] * (1 - w) + expression[j + k] * w);
  }
  return out;
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

async function pixelsOf(url, width, height) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width || image.naturalWidth; canvas.height = height || image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, image: context.getImageData(0, 0, canvas.width, canvas.height) };
}

const prepared = new Map();
// Returns a display URL for a sprite: face-composited onto the neutral base
// when possible, then normalised. Falls back to the original on any failure.
export function displaySprite(baseUrl, url, { faceOnly = true } = {}) {
  const key = `${faceOnly ? 1 : 0}\n${baseUrl}\n${url}`;
  if (prepared.has(key)) return prepared.get(key);
  const task = (async () => {
    try {
      const base = await pixelsOf(baseUrl || url);
      const { width, height } = base.canvas;
      const bounds = alphaBounds(base.image.data, width, height);
      // Opaque art (no cut-out) is shown as generated.
      if (!bounds || bounds.transparentFraction < 0.04) return url;
      let pixels = base.image.data, own = bounds;
      if (url !== baseUrl && baseUrl) {
        const edited = await pixelsOf(url, width, height);
        const merged = faceOnly ? compositeFace(base.image.data, edited.image.data, width, height) : null;
        if (merged) pixels = merged;
        else { pixels = edited.image.data; own = alphaBounds(pixels, width, height) || bounds; }
      }
      const frame = normalisedFrame(own, headCentre(pixels, width, own), height);
      base.context.putImageData(new ImageData(pixels, width, height), 0, 0);
      const out = document.createElement('canvas'); out.width = frame.outWidth; out.height = frame.outHeight;
      out.getContext('2d').drawImage(base.canvas, own.left, own.top, own.width, own.height, frame.x, frame.y, own.width, own.height);
      return out.toDataURL('image/png');
    } catch { return url; }
  })();
  prepared.set(key, task);
  if (prepared.size > 48) prepared.delete(prepared.keys().next().value);
  return task;
}
