// Local stage calibration. A small exposed forehead between bangs is not an
// eye line or a whole face. Use the broad, dense cheek band below eye/eyeglass
// interruptions; isolated warm hair highlights do not join that band.
export function calibrateStageFace(data, width, bounds, fallback) {
  if (!bounds || !fallback?.width || fallback.exposedForehead) return fallback;
  // A short source crop can make the first estimator stop inside the forehead
  // slit. Use the connected head contour to reach the cheeks in that case.
  let headWidth = fallback.headWidth || fallback.width * 1.56;
  const contours = [], cx = Math.round(fallback.x);
  for (let y = Math.max(bounds.top, Math.round(fallback.eyeY - fallback.width * .25)); y <= Math.min(bounds.bottom, fallback.eyeY); y++) {
    if (data[(y * width + cx) * 4 + 3] <= 24) continue;
    let left = cx, right = cx;
    while (left > bounds.left && data[(y * width + left - 1) * 4 + 3] > 24) left--;
    while (right < bounds.right && data[(y * width + right + 1) * 4 + 3] > 24) right++;
    const span = right - left + 1;
    if (span >= fallback.width && span <= bounds.height * .6) contours.push(span);
  }
  if (contours.length >= 3) {
    contours.sort((a,b) => a-b);
    headWidth = Math.max(headWidth, contours[Math.floor(contours.length / 2)]);
  }
  const radius = Math.max(fallback.width * 1.1, headWidth * .7), rows = [];
  const from = Math.max(bounds.top, Math.floor(fallback.eyeY - fallback.width * .8));
  const to = Math.min(bounds.bottom, Math.ceil(fallback.eyeY + Math.max(fallback.width * 1.1, headWidth * .75)));
  for (let y = from; y <= to; y++) {
    const groups = []; let group;
    for (let x = Math.max(bounds.left, Math.floor(fallback.x - radius)); x <= Math.min(bounds.right, fallback.x + radius); x++) {
      const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] <= 200 || r < 90 || g < 55 || b < 35 || r - g < 10 || r - g > 80 || g - b < 6 || g - b > 65 || r - b < 28 || r > g * 1.65) continue;
      if (!group || x - group.right > fallback.width * .08) { group = { left: x, right: x, count: 0 }; groups.push(group); }
      group.right = x; group.count++;
    }
    const candidates = groups.filter(g => g.count >= fallback.width * .08 && g.count / (g.right - g.left + 1) > .5
      && Math.abs((g.left + g.right) / 2 - fallback.x) < fallback.width * .65).sort((a, b) => b.count - a.count);
    const best = candidates[0];
    rows.push({ y, span: best ? best.right - best.left + 1 : 0, count: best?.count || 0, x: best ? (best.left + best.right) / 2 : fallback.x });
  }
  const dense = rows.filter(row => row.span >= fallback.width * .6 && row.span <= Math.max(fallback.width * 1.6, headWidth * .82) && row.count / row.span > .72);
  if (dense.length < Math.max(8, fallback.width * .16)) return fallback;
  const widths = dense.map(row => row.span).sort((a,b) => a-b), cheekWidth = widths[Math.floor(widths.length * .9)];
  if (cheekWidth < headWidth * .35) return fallback;
  const broad = row => row.span >= cheekWidth * .9 && row.count / row.span > .72;
  const first = rows.findIndex((row, i) => broad(row) && rows.slice(i, i + 6).filter(broad).length >= 4);
  if (first < 0) return fallback;
  const band = rows.slice(first, first + Math.max(6, Math.round(cheekWidth * .15))).filter(broad);
  if (band.length < 4) return fallback;
  const x = band.reduce((sum,row) => sum + row.x, 0) / band.length;
  const eyeY = rows[first].y - cheekWidth * .13;
  // A common camera distance for front/three-quarter anime portraits. This
  // fraction is independent of character, work, crop length and detector timing.
  const stageHeight = cheekWidth / .13;
  if (eyeY < bounds.top || eyeY > bounds.top + bounds.height * .6 || stageHeight < bounds.height * .35 || stageHeight > bounds.height * 2.5) return fallback;
  return { ...fallback, x, eyeY, stageHeight, stageCalibration: 'cheek-band-v1' };
}

// A camera is a uniform transform of the entire drawing. Joint widths are
// recorded, never forced to equality: a turned shoulder, broad build or skirt
// must not stretch the character. No names, works or guessed heights enter here.
export const BODY_CAMERA = Object.freeze({ eyes: .20, shoulders: .40, hips: .84, jawSpan: .09 });
const midpoint = (a,b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function measureStageBody(input, bounds) {
  if (!bounds || !input?.width || !input.height) return null;
  if(input.registered?.body && input.registered?.stageCalibration==='registered-body-v3')return input.registered;
  const { width, height, mesh, body } = input;
  const point = p => p && ({ x:p.x*width, y:p.y*height, visibility:p.visibility, presence:p.presence });
  const inside = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom;
  let eyes, chin, faceWidth, eyeGap;
  if (mesh?.length >= 468 && [33,133,362,263,152,234,454].every(i=>inside(point(mesh[i])))) {
    const a=midpoint(point(mesh[33]),point(mesh[133])), b=midpoint(point(mesh[362]),point(mesh[263]));
    eyes=midpoint(a,b); chin=point(mesh[152]); eyeGap=distance(a,b);
    faceWidth=distance(point(mesh[234]),point(mesh[454]));
    if (![a,b,eyes,chin].every(inside) || chin.y <= eyes.y || eyeGap < 3 || faceWidth < eyeGap || faceWidth > eyeGap*4) eyes=null;
  }
  const joint = i => {
    const p=point(body?.[i]);
    return inside(p) && p.visibility >= .8 && (p.presence ?? 1) >= .8 ? p : null;
  };
  const sl=joint(11),sr=joint(12),hl=joint(23),hr=joint(24);
  let shoulders=sl&&sr?midpoint(sl,sr):null, hips=hl&&hr?midpoint(hl,hr):null;
  // A mesh failure does not erase an otherwise measured torso. Pose eyes are
  // only a secondary anchor, and require both visible eyes plus shoulders.
  if (!eyes && shoulders) {
    const a=joint(2),b=joint(5);
    if(a&&b){eyes=midpoint(a,b);eyeGap=distance(a,b);faceWidth=eyeGap*2;chin=null;}
  }
  if (!eyes) return null;
  const jaw=chin?distance(eyes,chin):null, neck=shoulders?distance(eyes,shoulders):null;
  if (shoulders && (shoulders.y <= eyes.y || neck < eyeGap || neck > eyeGap*7 || (chin && (shoulders.y < chin.y+jaw*.35 || neck<jaw*1.5)))) shoulders=null;
  const torso=shoulders&&hips?distance(shoulders,hips):null;
  const shortSource=jaw && bounds.bottom-eyes.y<jaw*6;
  if (hips && (!shoulders || hips.y <= shoulders.y || torso < neck*.9 || torso > neck*3.5 || bounds.bottom-hips.y < (jaw || eyeGap*1.4) || shortSource)) hips=null;
  const samples=[];
  if(jaw && jaw>eyeGap*.65 && jaw<eyeGap*2.5) samples.push({ height:jaw/BODY_CAMERA.jawSpan, weight:.2, anchor:eyes, at:BODY_CAMERA.eyes, source:'jaw' });
  if(shoulders) samples.push({ height:neck/(BODY_CAMERA.shoulders-BODY_CAMERA.eyes), weight:.45, anchor:shoulders, at:BODY_CAMERA.shoulders, source:'shoulders' });
  if(hips) samples.push({ height:torso/(BODY_CAMERA.hips-BODY_CAMERA.shoulders), weight:.35, anchor:hips, at:BODY_CAMERA.hips, source:'hips' });
  if(!samples.length) return null;
  const weight=samples.reduce((sum,s)=>sum+s.weight,0);
  let stageHeight=Math.exp(samples.reduce((sum,s)=>sum+Math.log(s.height)*s.weight,0)/weight);
  if (!Number.isFinite(stageHeight) || stageHeight <= 0) return null;
  const anchor=hips || shoulders || eyes, at=hips?BODY_CAMERA.hips:shoulders?BODY_CAMERA.shoulders:BODY_CAMERA.eyes;
  stageHeight=Math.max(stageHeight,(anchor.y-bounds.top)/(at-.03));
  const offset=at*stageHeight-(anchor.y-bounds.top);
  // Keep the complete crown while anchoring visible hips to the shared camera.
  // A short source is never stretched to reach that anchor.
  const stageY=Math.max(stageHeight*.03,offset);
  const spread=Math.max(...samples.map(s=>s.height))/Math.min(...samples.map(s=>s.height));
  return { x:shoulders ? (eyes.x+shoulders.x)/2 : eyes.x, eyeX:eyes.x, eyeY:eyes.y,
    width:faceWidth, headWidth:faceWidth*1.35, eyeGap, stageHeight, stageY,sourceTop:bounds.top,
    stageCalibration:hips?'body-landmarks-v2':shoulders?'upper-body-landmarks-v2':'face-landmarks-v2',
    body:{ eyes, chin, shoulders, hips, shoulderWidth:sl&&sr?distance(sl,sr):null, hipWidth:hl&&hr?distance(hl,hr):null,
      torsoLength:hips?torso:null, scaleSpread:spread, coverage:hips?'torso':shoulders?'upper-body':'face',
      proportionsUncertain:spread>1.45, shortSource:Boolean(shortSource), crownTruncated:bounds.top<=1 },
  };
}
