import { FaceLandmarker, FilesetResolver } from '/vn-vision/1.0.1/vision_bundle.mjs';
import { motionGeometry } from './vn-motion-geometry.mjs';
let detector, queue = Promise.resolve();
async function measure(bitmap) {
  detector ||= FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/vn-vision/1.0.1/wasm', true), {
    baseOptions: { modelAssetPath: '/vn-vision/1.0.1/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE', numFaces: 2, minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5,
  });
  const face = await detector, width = bitmap.width, height = bitmap.height;
  // Crops locate a head, never eyes. Only measured mesh points create masks.
  // Tilt retries are bounded; failed anime/profile faces stay static.
  for (const [fraction, angle] of [[.5, 0], [.35, 0], [.5, -.35], [.5, .35]]) {
    const side = height * fraction, ox = (width - side) / 2, oy = 0;
    const canvas = new OffscreenCanvas(512, 512), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b8b8b8'; ctx.fillRect(0, 0, 512, 512);
    ctx.translate(256, 256); ctx.rotate(angle); ctx.scale(512 / side, 512 / side);
    ctx.drawImage(bitmap, -ox - side / 2, -oy - side / 2);
    const result = face.detect(canvas);
    if (result.faceLandmarks.length > 1) return null;
    if (result.faceLandmarks.length !== 1) continue;
    const c = Math.cos(angle), s = Math.sin(angle);
    const points = result.faceLandmarks[0].map(p => {
      const x = (p.x - .5) * side, y = (p.y - .5) * side;
      return { x: (c * x + s * y + side / 2 + ox) / width, y: (-s * x + c * y + side / 2 + oy) / height };
    });
    const geometry = motionGeometry(points, width, height);
    if (geometry) return geometry;
  }
  return null;
}
self.onmessage = ({ data: { id, bitmap } }) => {
  queue = queue.then(async () => {
    let geometry = null;
    try { geometry = await measure(bitmap); } catch { /* Unsupported devices keep the original. */ }
    finally { bitmap.close(); }
    self.postMessage({ id, geometry });
  });
};
