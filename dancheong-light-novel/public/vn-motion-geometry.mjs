// MediaPipe mesh coordinates, not the skin-colour camera/framing estimate.
// Every region is expressed in the ORIGINAL sprite's pixel coordinate space.
const EYES = [[33,160,158,133,153,144], [362,385,387,263,373,380]];
const LIPS = [61,40,37,0,267,270,291,321,314,17,84,91];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function region(points, corners, kind) {
  const a = corners[0], b = corners[1], w = distance(a, b);
  if (w < 8) return null;
  const angle = Math.atan2(b.y - a.y, b.x - a.x), c = Math.cos(angle), s = Math.sin(angle);
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const ys = points.map(p => -(p.x - cx) * s + (p.y - cy) * c);
  const lo = Math.min(...ys), hi = Math.max(...ys), mid = (hi + lo) / 2;
  return { cx: cx - s * mid, cy: cy + c * mid, rx: w * (kind === 'blink' ? .66 : .62),
    ry: kind === 'blink' ? Math.max((hi - lo) / 2 + w * .12, w * .19) : Math.max((hi - lo) / 2 + w * .1, w * .25), angle };
}
export function regionWeight(box, x, y) {
  const c = Math.cos(box.angle), s = Math.sin(box.angle), dx = x - box.cx, dy = y - box.cy;
  const d = Math.hypot((dx * c + dy * s) / box.rx, (-dx * s + dy * c) / box.ry);
  return d >= 1 ? 0 : Math.min(1, (1 - d) / .16);
}
export function motionGeometry(landmarks, width, height) {
  if (!Array.isArray(landmarks) || landmarks.length < 468 || width < 32 || height < 32) return null;
  const points = landmarks.map(p => ({ x: p.x * width, y: p.y * height }));
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x >= width || p.y < 0 || p.y >= height)) return null;
  const left = EYES[0].map(i => points[i]), right = EYES[1].map(i => points[i]), lips = LIPS.map(i => points[i]);
  const eyes = [region(left, [points[33], points[133]], 'blink'), region(right, [points[362], points[263]], 'blink')];
  const mouth = region(lips, [points[61], points[291]], 'talk');
  if (eyes.some(row => !row) || !mouth) return null;
  const centre = eyes.map(e => ({ x: e.cx, y: e.cy })), gap = distance(...centre);
  const tilt = Math.atan2(centre[1].y - centre[0].y, centre[1].x - centre[0].x);
  const mx = (centre[0].x + centre[1].x) / 2, my = (centre[0].y + centre[1].y) / 2;
  const across = (mouth.cx - mx) * Math.cos(tilt) + (mouth.cy - my) * Math.sin(tilt);
  const down = -(mouth.cx - mx) * Math.sin(tilt) + (mouth.cy - my) * Math.cos(tilt);
  if (gap < 18 || gap > width * .6 || Math.abs(tilt) > .65 || Math.abs(across) > gap * .4
    || down < gap * .35 || down > gap * 1.25 || eyes.some(e => e.rx < gap * .16 || e.rx > gap * .65 || e.ry > e.rx * .8)
    || mouth.rx > gap * .65 || mouth.rx < gap * .13) return null;
  const all = [...eyes, mouth];
  if (all.some(e => e.cx - e.rx < 0 || e.cx + e.rx >= width || e.cy - e.rx < 0 || e.cy + e.rx >= height)) return null;
  const face = { left: Math.max(0, Math.floor(mx - gap * 1.1)), right: Math.min(width - 1, Math.ceil(mx + gap * 1.1)),
    top: Math.max(0, Math.floor(my - gap * .95)), bottom: Math.min(height - 1, Math.ceil(my + gap * 1.65)) };
  return { regions: { blink: eyes, talk: [mouth] }, face };
}
export function transformGeometry(geometry, scale, x = 0, y = 0) {
  const f = geometry.face;
  return { regions: Object.fromEntries(Object.entries(geometry.regions).map(([kind, rows]) => [kind, rows.map(r => ({ ...r, cx: r.cx * scale + x, cy: r.cy * scale + y, rx: r.rx * scale, ry: r.ry * scale }))])),
    face: { left: f.left * scale + x, right: f.right * scale + x, top: f.top * scale + y, bottom: f.bottom * scale + y } };
}
export function supportedFeatures(base, width, height, geometry, kind) {
  const regions = geometry?.regions?.[kind];
  if (!regions?.length || base.length !== width * height * 4) return false;
  return regions.every(r => {
    let count = 0, opaque = 0, min = 255, max = 0;
    for (let y = Math.max(0, Math.floor(r.cy - r.rx)); y <= Math.min(height - 1, r.cy + r.rx); y++)
      for (let x = Math.max(0, Math.floor(r.cx - r.rx)); x <= Math.min(width - 1, r.cx + r.rx); x++) {
        if (!regionWeight(r, x, y)) continue;
        const i = (y * width + x) * 4, luma = (base[i] + base[i+1] + base[i+2]) / 3;
        count++; if (base[i+3] > 240) opaque++; min = Math.min(min, luma); max = Math.max(max, luma);
      }
    return count >= 20 && opaque / count > .96 && max - min > 28;
  });
}
// Check the HEAD independently: a large unchanged coat cannot hide moving hair.
// Composite only feature pixels; original alpha/silhouette is always retained.
export function preciseMotionPixels(base, variant, width, height, geometry, kind) {
  if (base.length !== variant.length || !supportedFeatures(base, width, height, geometry, kind)) return null;
  const regions = geometry.regions[kind], stats = regions.map(() => ({ count: 0, changed: 0 }));
  const featureAt = new Uint8Array(width * height);
  regions.forEach((r, index) => {
    for (let y = Math.max(0, Math.floor(r.cy-r.rx)); y <= Math.min(height-1,r.cy+r.rx); y++)
      for (let x = Math.max(0, Math.floor(r.cx-r.rx)); x <= Math.min(width-1,r.cx+r.rx); x++)
        if (regionWeight(r, x, y)) featureAt[y * width + x] = index + 1;
  });
  let count = 0, error = 0, changed = 0, headCount = 0, headError = 0, headChanged = 0;
  const f = geometry.face;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (base[i+3] < 20 && variant[i+3] < 20) continue;
    const d = (Math.abs(base[i]-variant[i])+Math.abs(base[i+1]-variant[i+1])+Math.abs(base[i+2]-variant[i+2]))/3;
    const at = featureAt[y * width + x] - 1;
    if (at >= 0) { stats[at].count++; if (d > 12) stats[at].changed++; continue; }
    const alpha = Math.abs(base[i+3]-variant[i+3]);
    count++; error += d; if (d > 18 || alpha > 12) changed++;
    if (x >= f.left && x <= f.right && y >= f.top && y <= f.bottom) { headCount++; headError += d; if (d > 18 || alpha > 12) headChanged++; }
  }
  if (!count || !headCount || error/count > 4 || changed/count > .015 || headError/headCount > 3 || headChanged/headCount > .008
    || stats.some(s => s.changed < Math.max(3, s.count * .012))) return null;
  const out = base.slice();
  for (const r of regions) for (let y = Math.max(0,Math.floor(r.cy-r.rx)); y <= Math.min(height-1,r.cy+r.rx); y++)
    for (let x = Math.max(0,Math.floor(r.cx-r.rx)); x <= Math.min(width-1,r.cx+r.rx); x++) {
      const weight = regionWeight(r,x,y); if (!weight) continue;
      const i = (y*width+x)*4;
      for (let c=0;c<3;c++) out[i+c]=Math.round(base[i+c]*(1-weight)+variant[i+c]*weight);
    }
  return out;
}
