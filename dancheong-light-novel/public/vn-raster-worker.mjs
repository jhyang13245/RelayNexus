import { alphaBounds, faceFrame, normalisedFrame, headCentre, portraitFrameCheck, portraitLandmarks, drawFramedSprite } from './vn-sprite.mjs';
import { cropBox } from './vn-cinema.mjs';

async function bitmap(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Image unavailable');
  return createImageBitmap(await response.blob());
}
async function render({ kind, url, frameUrl = url }) {
  let source, drawable;
  try {
    source = await bitmap(frameUrl); drawable = frameUrl === url ? source : await bitmap(url);
    const { width, height } = source;
    if (drawable.width !== width || drawable.height !== height) return frameUrl;
    const scan = new OffscreenCanvas(width, height), ctx = scan.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const bounds = alphaBounds(pixels, width, height);
    if (kind === 'frame-audit') return portraitFrameCheck(bounds, portraitLandmarks(pixels, width, bounds));
    if (!bounds) return url;
    const face = portraitLandmarks(pixels, width, bounds);
    let out;
    if (kind === 'eyes' || kind === 'face') {
      const box = cropBox(face, width, height, kind); if (!box) return null;
      out = new OffscreenCanvas(Math.round(box.width), Math.round(box.height));
      out.getContext('2d').drawImage(source, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    } else {
      if (bounds.transparentFraction < .04) return url;
      const frame = face ? faceFrame(bounds, face) : normalisedFrame(bounds, headCentre(pixels, width, bounds), height);
      out = new OffscreenCanvas(frame.outWidth, frame.outHeight);
      drawFramedSprite(out.getContext('2d'), drawable, bounds, frame);
    }
    return new FileReaderSync().readAsDataURL(await out.convertToBlob({ type: 'image/png' }));
  } finally { source?.close(); if (drawable !== source) drawable?.close(); }
}
// Serialize raster jobs to cap decoded-image memory, even when many cached
// portraits become available together. Network/model work remains independent.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    let url = null; try { url = await render(data); } catch { /* Main-thread fallback. */ }
    self.postMessage({ id: data.id, ...(url && typeof url === 'object' ? { report: url } : { url }) });
  });
};
