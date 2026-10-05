import { alphaBounds, faceFrame, normalisedFrame, headCentre, portraitFrameCheck, portraitLandmarks, drawFramedSprite, cameraLandmarks } from './vn-sprite.mjs?v=4a6fe5d540c6';
import { cropBox } from './vn-cinema.mjs?v=4a6fe5d540c6';

async function bitmap(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Image unavailable');
  return createImageBitmap(await response.blob());
}
async function render({ kind, url, frameUrl = url, geometry = null, camera = null, quality = .94 }) {
  let source, drawable;
  try {
    source = await bitmap(frameUrl); drawable = frameUrl === url ? source : await bitmap(url);
    const { width, height } = source;
    if (kind === 'storage-webp') {
      if (width * height > 16_000_000) return null;
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d').drawImage(source, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      return blob.type === 'image/webp' ? new FileReaderSync().readAsDataURL(blob) : null;
    }
    if (drawable.width !== width || drawable.height !== height) return frameUrl;
    if (width * height > 16e6) return url;
    if (kind === 'sprite' && camera && camera.width === width && camera.height === height) {
      const out = new OffscreenCanvas(camera.frame.outWidth, camera.frame.outHeight);
      drawFramedSprite(out.getContext('2d'), drawable, camera.bounds, camera.frame);
      return { blob: await out.convertToBlob({ type: 'image/webp', quality }), width: out.width, height: out.height,review:portraitFrameCheck(camera.bounds,camera.landmarks) };
    }
    const scan = new OffscreenCanvas(width, height), ctx = scan.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const bounds = alphaBounds(pixels, width, height);
    if (kind === 'frame-audit') return portraitFrameCheck(bounds, camera?.landmarks || cameraLandmarks(geometry,bounds,portraitLandmarks(pixels, width, bounds)));
    if (!bounds) return url;
    const face = cameraLandmarks(geometry, bounds, portraitLandmarks(pixels, width, bounds));
    let out;
    if (kind === 'eyes' || kind === 'face') {
      const box = cropBox(face, width, height, kind); if (!box) return null;
      out = new OffscreenCanvas(Math.round(box.width), Math.round(box.height));
      out.getContext('2d').drawImage(source, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    } else {
      if (bounds.transparentFraction < .04) return url;
      const frame = face ? faceFrame(bounds, face) : normalisedFrame(bounds, headCentre(pixels, width, bounds), height);
      if (frame.outWidth * frame.outHeight > 24e6) return url;
      out = new OffscreenCanvas(frame.outWidth, frame.outHeight);
      drawFramedSprite(out.getContext('2d'), drawable, bounds, frame);
      if (kind === 'sprite') return { blob: await out.convertToBlob({ type: 'image/webp', quality }), width: out.width, height: out.height,
        review:portraitFrameCheck(bounds,face),
        camera: { width, height, bounds, frame, landmarks:face, method: face?.stageCalibration || (face ? 'pixels-unmeasured' : 'conservative') } };
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
