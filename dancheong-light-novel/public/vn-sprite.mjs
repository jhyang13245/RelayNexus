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
export function displaySprite(url) {
  const key = url;
  if (prepared.has(key)) return prepared.get(key);
  const task = (async () => {
    try {
      const sprite = await pixelsOf(url);
      const { width, height } = sprite.canvas;
      const bounds = alphaBounds(sprite.image.data, width, height);
      // Opaque art (no cut-out) is shown as generated.
      if (!bounds || bounds.transparentFraction < 0.04) return url;
      const frame = normalisedFrame(bounds, headCentre(sprite.image.data, width, bounds), height);
      const out = document.createElement('canvas'); out.width = frame.outWidth; out.height = frame.outHeight;
      out.getContext('2d').drawImage(sprite.canvas, bounds.left, bounds.top, bounds.width, bounds.height, frame.x, frame.y, bounds.width, bounds.height);
      return out.toDataURL('image/png');
    } catch { return url; }
  })();
  prepared.set(key, task);
  if (prepared.size > 48) prepared.delete(prepared.keys().next().value);
  return task;
}
