// Stagecraft: evidence-bound typography, action staging, music cues and the
// pure image analysis behind 2.5D depth, CG camera and art-tone checks.
// Presentation only. Never changes story, cast, identity or paid assets.
const enumeration = values => ({ type:'string', enum:values });
const text = { type:'string' };
const object = properties => ({ type:'object', additionalProperties:false, required:Object.keys(properties), properties });

export const TEXT_STYLES = ['crimson','gold','azure','large','small','tremble','fade'];
export const ACTIONS = ['none','speedlines','focuslines','panels','invert','strobe','slowmo','rapidcut'];
export const STINGERS = ['none','shock','reveal','sorrow','resolve'];
export const stagecraftSchema = object({
  marks:{ type:'array', maxItems:2, items:object({ text, style:enumeration(TEXT_STYLES) }) },
  layout:enumeration(['normal','center']),
  tempo:enumeration(['normal','slow','halting']),
  action:object({ kind:enumeration(ACTIONS), anchor:text }),
  stinger:object({ kind:enumeration(STINGERS), anchor:text }),
  leitmotif:enumeration(['none','focus']),
});
export const stagecraftInstructions = `
- stagecraft is optional typography/staging for THIS beat. Ordinary beats use {"marks":[],"layout":"normal","tempo":"normal","action":{"kind":"none","anchor":""},"stinger":{"kind":"none","anchor":""},"leitmotif":"none"}. Restraint first: most beats in a paragraph stay plain.
- stagecraft.marks: at most two short words/phrases (1-24 chars) copied EXACTLY from THIS beat that the prose itself stresses. crimson=blood, killing intent or a forbidden word; gold=a sacred name/oath; azure=cold supernatural sight; large=a shouted or decisive word; small=a faint aside; tremble=fear or a breaking voice; fade=something vanishing. Never mark ordinary words.
- stagecraft.layout "center" isolates a single short line (at most 60 chars) alone on a black screen. Use only for the paragraph's one chilling, final or revelatory line.
- stagecraft.tempo "slow" types a weighty line letter by letter; "halting" pauses at its punctuation for broken, hesitant speech. Otherwise normal.
- stagecraft.action is for PRESENT physical action shown by THIS beat's narration: speedlines (fast movement/dash/slash), focuslines (sudden shock or realisation), panels (a 2-3 panel split of an exchange of blows or simultaneous reactions), invert (the instant a blow or blade lands), strobe (red flicker for a wound or bloodshed), slowmo (a decisive instant stretched), rapidcut (a flurry of exchanges). anchor is an exact narration substring of THIS beat where it happens. Never for dialogue alone, memory, threats or metaphors. At most one action per paragraph unless it is a sustained fight.
- stagecraft.stinger is a short musical hit at an exact anchor substring of THIS beat: shock (sudden horror/violence), reveal (revelation), sorrow (a loss lands), resolve (a vow or relief). Rare; never on ordinary lines.
- music cue battle: only when a sustained physical fight actually begins in THIS beat (not a threat, argument or single blow); quote that narration as evidence.
- stagecraft.leitmotif "focus" plays the focused character's motif when they make a meaningful entrance or a defining moment; it requires a physically present focus. Otherwise none.
`;

const narration = value => String(value || '').replace(/[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu,'');
const indirect = /만약|언젠가|내일|사진\s*속|영상\s*속|회상|기억\s*속|꿈\s*속|상상/iu;
const glyphs = value => Array.from(String(value || ''));
export const ACTION_WORDS = /베[었어이]|베어|찌르|찔[렀러]|휘둘|휘두르|내리쳤|내려쳤|후려|때[렸리]|쳤다|주먹|발차기|걷어|날아[들왔갔]|부딪|충돌|폭발|터[졌지]|총성|총알|쏘[았아]|쐈|칼날|검[이을끝날]|창[이을끝]|화살|피가|피를|핏|선혈|비명|달려[들나]|뛰어[들올]|돌진|덮쳤|덮치|막아[냈내]|튕[겼겨]|공격|일격|쾅|쿵|콰|섬광|번쩍|돌격|격돌|부서[졌지]|깨[졌지]|쓰러[졌지]|순식간에|slash|strike|blow|stab|punch|kick|explo|crash|charge|dash|blade|sword|blood|gunshot/iu;
// The two flashing effects need a blow, wound, shot or blast in the anchor sentence.
export const STRIKE_WORDS = /베[었어이]|베어|찌르|찔[렀러]|후려|때[렸리]|쳤다|주먹|걷어찼|총성|총알|쏘[았아]|쐈|발사|폭발|터[졌지]|피가|피를|핏|선혈|꽂[혔았]|관통|명중|맞[았혔]|slash|stab|struck|gunshot|explo|blood/iu;
export const SHOCK_WORDS = /깨달|알아[챘차]|눈이\s*커|숨이\s*멎|숨을\s*삼|얼어붙|굳어|소름|놀라|경악|충격|멈춰\s*섰|심장이|등골|realis|realiz|froze|gasp|shock/iu;
const PHYSICAL = new Set(['speedlines','panels','invert','strobe','rapidcut']), FLASHING = new Set(['invert','strobe']);

// The anchor and the sentence around it must be present-tense scene text.
function sentenceOf(source, value) {
  const at = source.indexOf(value), start = Math.max(...['.', '!', '?', '。', '\n'].map(mark => source.lastIndexOf(mark, at - 1))) + 1;
  const ends = ['.', '!', '?', '。', '\n'].map(mark => source.indexOf(mark, at)).filter(end => end >= 0);
  return source.slice(start, ends.length ? Math.min(...ends) + 1 : source.length);
}
function anchorIn(anchor, source) { const value = typeof anchor === 'string' ? anchor.trim() : ''; return value.length >= 2 && value.length <= 80 && source.includes(value) && !indirect.test(sentenceOf(source, value)) ? value : ''; }
// Advisory fields: malformed values drop back to plain presentation.
export function validateStagecraft(value, current = '', { focusId = '', fx = 'none' } = {}) {
  if (!value || typeof value !== 'object') return null;
  const now = String(current || ''), told = narration(now), out = { marks:[], layout:'normal', tempo:'normal', action:null, stinger:null, leitmotif:'none' };
  for (const row of (Array.isArray(value.marks) ? value.marks : []).slice(0, 2)) {
    const mark = typeof row?.text === 'string' ? row.text.trim() : '';
    if (!mark || glyphs(mark).length > 24 || !now.includes(mark) || !TEXT_STYLES.includes(row.style)) continue;
    if (out.marks.some(other => other.text.includes(mark) || mark.includes(other.text))) continue;
    out.marks.push({ text:mark, style:row.style });
  }
  const length = glyphs(now.trim()).length;
  if (value.layout === 'center' && length >= 2 && length <= 60) out.layout = 'center';
  if (value.tempo === 'slow' && length <= 140) out.tempo = 'slow';
  if (value.tempo === 'halting' && /[…,，、—–]|\.\.\./u.test(now)) out.tempo = 'halting';
  const kind = ACTIONS.includes(value.action?.kind) ? value.action.kind : 'none';
  if (kind !== 'none') {
    const source = told, anchor = anchorIn(value.action.anchor, source), sentence = anchor ? sentenceOf(source, anchor) : '';
    // Motivation is judged in the anchor's own sentence, not anywhere in the beat.
    const motivated = FLASHING.has(kind) ? STRIKE_WORDS.test(sentence) && !String(fx).startsWith('flash') : PHYSICAL.has(kind) ? ACTION_WORDS.test(sentence) : ACTION_WORDS.test(sentence) || SHOCK_WORDS.test(sentence);
    const negated = /지\s*(?:않|못)|않았|않는다|하지\s*않|할\s*것이다|\b(?:not|never|didn't|would|might)\b/iu.test(sentence);
    if (anchor && sentence.includes(anchor) && motivated && !negated) out.action = { kind, anchor };
  }
  const sting = STINGERS.includes(value.stinger?.kind) ? value.stinger.kind : 'none';
  if (sting !== 'none') { const anchor = anchorIn(value.stinger.anchor, now); if (anchor) out.stinger = { kind:sting, anchor }; }
  if (value.leitmotif === 'focus' && focusId) out.leitmotif = 'focus';
  return out.marks.length || out.layout !== 'normal' || out.tempo !== 'normal' || out.action || out.stinger || out.leitmotif !== 'none' ? out : null;
}

const glyphsTo = (visible, anchor) => { const at = visible.indexOf(anchor); return at < 0 ? -1 : glyphs(visible.slice(0, at + anchor.length)).length; };
// Text-anchored cues for the shared cue player (same clock as foley/impact).
export function stagecraftCues(stagecraft, visible = '', { emphasis = false } = {}) {
  const plan = [];
  if (!stagecraft) return plan;
  if (stagecraft.action && !emphasis) { const at = glyphsTo(visible, stagecraft.action.anchor); if (at > 0) plan.push({ kind:'action', action:stagecraft.action.kind, sound:'none', when:'text', at }); }
  if (stagecraft.stinger) { const at = glyphsTo(visible, stagecraft.stinger.anchor); if (at > 0) plan.push({ kind:'stinger', stinger:stagecraft.stinger.kind, sound:'none', when:'text', at }); }
  return plan;
}
// Visible marks only: an anchor that the typeset line does not show is dropped.
export function textMarks(stagecraft, visible = '') {
  return (stagecraft?.marks || []).filter(mark => visible.includes(mark.text));
}
// Per-glyph delay multiplier for the typewriter. `index` is the glyph about
// to appear (0-based). Slow phrases and halting punctuation only.
export function typingPace(stagecraft, visible = '') {
  if (!stagecraft) return null;
  const chars = glyphs(visible), ranges = [];
  for (const mark of textMarks(stagecraft, visible)) {
    if (!['tremble','fade','crimson','large'].includes(mark.style)) continue;
    const at = visible.indexOf(mark.text), from = glyphs(visible.slice(0, at)).length;
    ranges.push([from, from + glyphs(mark.text).length]);
  }
  const base = stagecraft.tempo === 'slow' ? 2.4 : stagecraft.tempo === 'halting' ? 1.25 : 1;
  if (base === 1 && !ranges.length) return null;
  return index => {
    let factor = base;
    if (ranges.some(([from, to]) => index >= from && index < to)) factor = Math.max(factor, 2.2);
    if (stagecraft.tempo === 'halting' && /[…,，、—–.]/u.test(chars[index - 1] || '')) factor *= 4;
    return Math.min(8, factor);
  };
}

// ---------- Music sync, leitmotifs ----------
// A music change on a beat with a text cue waits for that cue (or 6s).
export function createMusicSync({ now = () => Date.now(), hold = 6000, onChange = null, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let key = '', applied = null, target = null, since = 0, timer = null;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const release = () => { clear(); if (target === null) return false; applied = target; target = null; return true; };
  return {
    reset() { clear(); key = ''; applied = null; target = null; },
    select({ pageKey, music, cueBound = false }) {
      if (pageKey !== key) { clear(); key = pageKey; if (target !== null) applied = target; target = null; since = now(); }
      if (applied === null || music === applied) { clear(); applied = music; target = null; return music; }
      if (cueBound && music !== 'silence' && now() - since < hold) {
        target = music;
        if (timer === null && onChange) timer = setTimer(() => { if (release()) onChange(); }, hold - (now() - since));
        return applied;
      }
      clear(); applied = music; target = null; return music;
    },
    release,
  };
}
function hash(value) { let h = 2166136261 >>> 0; for (const c of String(value)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function random(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SCALES = { major:[0,2,4,7,9], minor:[0,3,5,7,10], dorian:[0,2,3,7,9] };
// A short, stable motif per character: same work + id always sounds the same.
export function leitmotif(id, scope = '') {
  const rand = random(hash(`${scope}:${id}`)), mode = ['major','minor','dorian'][Math.floor(rand() * 3)], scale = SCALES[mode];
  const root = 57 + Math.floor(rand() * 7), count = 5 + Math.floor(rand() * 3), notes = [];
  let degree = Math.floor(rand() * 3), at = 0;
  for (let i = 0; i < count; i++) {
    degree = Math.max(0, Math.min(9, degree + [-2,-1,1,1,2,0][Math.floor(rand() * 6)]));
    const midi = root + 12 + scale[degree % 5] + 12 * Math.floor(degree / 5);
    const length = i === count - 1 ? 1.5 : [0.5,0.5,1,0.75][Math.floor(rand() * 4)];
    notes.push({ midi, at, length }); at += length;
  }
  return { mode, root, notes, bpm: 72 + Math.floor(rand() * 24) };
}

// ---------- Image analysis (plain RGBA arrays; no DOM) ----------
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
function boxBlur(src, w, h, radius) {
  const out = new Float32Array(src.length), tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += src[y * w + xx]; n++; } } tmp[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } } out[y * w + x] = s / n; }
  return out;
}
// Monocular depth from cheap cues (not a neural model): lower in frame,
// sharper, more saturated and darker-detailed regions read as nearer; bright,
// hazy, low-contrast upper regions (sky, distant walls) read as far.
// Returns 0 (far) .. 1 (near) per pixel.
export function estimateDepth(data, w, h) {
  const n = w * h, light = new Float32Array(n), sat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
    light[i] = luma(r, g, b) / 255; sat[i] = max ? (max - min) / max : 0;
  }
  const mean = boxBlur(light, w, h, 2), contrast = new Float32Array(n);
  for (let i = 0; i < n; i++) contrast[i] = Math.abs(light[i] - mean[i]);
  const detail = boxBlur(contrast, w, h, 2); let maxDetail = 1e-4; for (const v of detail) if (v > maxDetail) maxDetail = v;
  const raw = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, vertical = Math.pow(y / Math.max(1, h - 1), 1.4);
    const haze = light[i] * (1 - sat[i]) * (1 - y / h);
    raw[i] = .5 * vertical + .25 * (detail[i] / maxDetail) + .15 * sat[i] - .3 * haze + .1 * (1 - light[i]) * (y / h);
  }
  const smooth = boxBlur(raw, w, h, 3);
  let lo = Infinity, hi = -Infinity; for (const v of smooth) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const out = new Float32Array(n), span = Math.max(1e-4, hi - lo);
  for (let i = 0; i < n; i++) out[i] = (smooth[i] - lo) / span;
  return out;
}
// Soft alpha masks for the mid and near layers (0..255).
export function depthMasks(depth, { mid = .4, near = .68, soft = .1 } = {}) {
  const ramp = (v, edge) => Math.max(0, Math.min(1, (v - edge + soft) / (2 * soft)));
  const midMask = new Uint8ClampedArray(depth.length), nearMask = new Uint8ClampedArray(depth.length);
  for (let i = 0; i < depth.length; i++) { midMask[i] = Math.round(255 * ramp(depth[i], mid)); nearMask[i] = Math.round(255 * ramp(depth[i], near)); }
  return { mid:midMask, near:nearMask };
}

// Skin-like connected regions (faces, hands) for CG close-ups. Anime skin is
// light and warm; YCbCr bounds are widened accordingly. Fallback: the most
// detailed cells. Coordinates are fractions of the image.
export function focusRegions(data, w, h, { limit = 2 } = {}) {
  const n = w * h, skin = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const y = .299 * r + .587 * g + .114 * b, cb = 128 - .168736 * r - .331264 * g + .5 * b, cr = 128 + .5 * r - .418688 * g - .081312 * b;
    skin[i] = a > 128 && y > 90 && cb > 85 && cb < 128 && cr > 134 && cr < 175 && r > g && g >= b * .9 ? 1 : 0;
  }
  const seen = new Uint8Array(n), regions = [];
  for (let start = 0; start < n; start++) {
    if (!skin[start] || seen[start]) continue;
    const stack = [start]; seen[start] = 1; let count = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w; count++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && skin[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    const area = count / n, bw = x1 - x0 + 1, bh = y1 - y0 + 1, aspect = bw / bh, fill = count / (bw * bh);
    if (area < .002 || area > .14 || aspect < .35 || aspect > 2.6 || fill < .3) continue;
    const cy = (y0 + y1 + 1) / 2 / h;
    regions.push({ x:(x0 + x1 + 1) / 2 / w, y:cy, size:Math.max(bw / w, bh / h), area, kind:cy < .62 && aspect < 1.7 ? 'face' : 'hand' });
  }
  regions.sort((a, b) => (b.kind === 'face') - (a.kind === 'face') || b.area - a.area);
  const picked = [];
  for (const region of regions) { if (picked.some(other => Math.hypot(other.x - region.x, other.y - region.y) < .12)) continue; picked.push(region); if (picked.length >= limit) break; }
  if (picked.length) return picked;
  // No skin: favour the most detailed cell of a 4x3 grid.
  let best = null;
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 4; gx++) {
    let s = 0, c = 0;
    for (let y = Math.floor(gy * h / 3); y < Math.floor((gy + 1) * h / 3); y++) for (let x = Math.floor(gx * w / 4) + 1; x < Math.floor((gx + 1) * w / 4); x++) { const i = (y * w + x) * 4; s += Math.abs(luma(data[i], data[i + 1], data[i + 2]) - luma(data[i - 4], data[i - 3], data[i - 2])); c++; }
    const score = c ? s / c : 0;
    if (!best || score > best.score) best = { x:(gx + .5) / 4, y:(gy + .5) / 3, size:.3, area:0, kind:'detail', score };
  }
  return best ? [{ x:best.x, y:best.y, size:best.size, area:0, kind:'detail' }] : [];
}
// Camera transform that frames a region (fractions of the element) at `scale`
// without exposing the element's edges.
export function regionTransform(region, scale) {
  const limit = (scale - 1) / (2 * scale), fx = Math.max(.5 - limit, Math.min(.5 + limit, region.x)), fy = Math.max(.5 - limit, Math.min(.5 + limit, region.y));
  return `translate(${(-scale * (fx - .5) * 100).toFixed(2)}%, ${(-scale * (fy - .5) * 100).toFixed(2)}%) scale(${scale})`;
}
// Image fraction → element fraction for background-size: cover.
export function coverPoint(point, image, box, position = [.5, .5]) {
  const scale = Math.max(box.width / image.width, box.height / image.height), dw = image.width * scale, dh = image.height * scale;
  const ox = (box.width - dw) * position[0], oy = (box.height - dh) * position[1];
  return { ...point, x:(ox + point.x * dw) / box.width, y:(oy + point.y * dh) / box.height };
}

// Identity colours of a sprite: dominant hair hue (top of the alpha bounds)
// and the share of strongly coloured pixels. Used to flag CG mismatches.
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)); let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
export function spriteSignature(data, w, h) {
  let top = h; for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 128) { top = Math.floor(i / w); break; }
  let bottom = -1; for (let i = w * h - 1; i >= 0; i--) if (data[i * 4 + 3] > 128) { bottom = Math.floor(i / w); break; }
  if (bottom <= top) return null;
  const bins = new Float32Array(12), lights = [], to = Math.min(h, top + Math.max(3, Math.round((bottom - top) * .12)));
  let total = 0;
  for (let y = top; y < to; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (data[i + 3] <= 128) continue;
    const [hue, s, l] = hsl(data[i], data[i + 1], data[i + 2]); total++; lights.push(l);
    if (s > .25 && l > .12 && l < .92) bins[Math.floor(hue / 30) % 12] += 1;
  }
  if (!total) return null;
  let bin = 0; for (let i = 1; i < 12; i++) if (bins[i] > bins[bin]) bin = i;
  lights.sort((a, b) => a - b);
  const chroma = bins[bin] / total;
  return { hue:bin * 30 + 15, chroma, light:lights[Math.floor(lights.length / 2)], kind:chroma > .3 ? 'chromatic' : 'neutral' };
}
// Presence of a sprite's distinctive hair colour anywhere in the CG. Neutral
// (black/brown/white) hair is too common to judge, so it always passes.
export function signatureMatch(signature, data, w, h) {
  if (!signature || signature.kind !== 'chromatic') return { verdict:'unknown', share:0 };
  let hits = 0, coloured = 0;
  for (let i = 0; i < w * h; i++) {
    const [hue, s, l] = hsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (s < .25 || l < .1 || l > .93) continue; coloured++;
    const delta = Math.min(Math.abs(hue - signature.hue), 360 - Math.abs(hue - signature.hue));
    if (delta <= 22 && Math.abs(l - signature.light) < .32) hits++;
  }
  const share = hits / Math.max(1, w * h);
  return { verdict:share >= .004 ? 'match' : coloured / (w * h) < .05 ? 'unknown' : 'mismatch', share };
}

// ---------- Art rule and colour grade ----------
export const ART_RULES = {
  palette:{ auto:['자동', ''], warm:['따뜻한 앰버', 'warm amber-tinted palette with soft golden highlights and warm shadows'], cool:['차가운 블루', 'cool blue-teal palette with crisp cool shadows'], muted:['저채도 차분', 'desaturated muted palette with low-chroma midtones'], vivid:['선명한 애니', 'vivid saturated anime palette with clean bright highlights'], noir:['흑백+적색 포인트', 'near-monochrome palette with one deep crimson accent'] },
  line:{ auto:['자동', ''], fine:['가늘고 깨끗한 선', 'thin clean uniform lineart'], bold:['굵은 강약 선', 'bold confident lineart with clear weight variation'], soft:['선 최소·회화풍', 'soft painterly edges with minimal lineart'] },
  shading:{ auto:['자동', ''], cel:['2톤 셀 음영', 'two-tone cel shading with hard-edged shadows'], soft:['부드러운 그라데이션', 'soft gradient shading'], painted:['두꺼운 채색', 'painterly rendered shading with visible brushwork'] },
};
export function normalizeArtRule(value) {
  const rule = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.keys(ART_RULES).map(name => [name, Object.hasOwn(ART_RULES[name], rule[name]) ? rule[name] : 'auto']));
}
export function artRuleText(value) {
  const rule = normalizeArtRule(value), parts = Object.keys(ART_RULES).map(name => ART_RULES[name][rule[name]][1]).filter(Boolean);
  return parts.length ? `Art rule for every image: ${parts.join('; ')}.` : '';
}
// The structured rule joins the free-text style note, so it follows the same
// cache rule: images drawn under another style are not reused.
export function composeArtStyle(style = '', rule) {
  // The style limit is raised to 820 by the adapter, so the rule never eats
  // into the reader's own 600-character note.
  return [artRuleText(rule), String(style || '').trim().slice(0, 600)].filter(Boolean).join(' ').slice(0, 820);
}
// One grade over backdrop, sprites, CG and inserts: tone curve via CSS filter
// plus split-toning overlays (shadow/highlight tints).
export const GRADES = {
  auto:{ filter:[1.04, 1.0, 1.0, 0], shadow:'rgba(28,30,58,.18)', highlight:'rgba(255,236,214,.10)' },
  warm:{ filter:[1.05, 1.04, 1.02, -6], shadow:'rgba(60,30,20,.20)', highlight:'rgba(255,214,160,.16)' },
  cool:{ filter:[1.06, .96, 1.0, 8], shadow:'rgba(10,34,66,.24)', highlight:'rgba(200,232,255,.10)' },
  muted:{ filter:[.98, .82, 1.02, 0], shadow:'rgba(30,32,40,.20)', highlight:'rgba(240,236,228,.08)' },
  vivid:{ filter:[1.06, 1.12, 1.0, 0], shadow:'rgba(30,20,70,.14)', highlight:'rgba(255,245,230,.08)' },
  noir:{ filter:[1.12, .35, .98, 0], shadow:'rgba(10,8,10,.30)', highlight:'rgba(255,240,236,.06)' },
};
export function gradeFor(palette = 'auto', strength = 'subtle') {
  // Existing works look unchanged until a palette is chosen (or "strong").
  const neutral = !Object.hasOwn(GRADES, palette) || palette === 'auto';
  const grade = Object.hasOwn(GRADES, palette) ? GRADES[palette] : GRADES.auto, k = strength === 'off' || neutral && strength !== 'strong' ? 0 : strength === 'strong' ? 1 : .6;
  const [contrast, saturate, brightness, hue] = grade.filter, mix = value => 1 + (value - 1) * k;
  const alpha = color => color.replace(/,([\d.]+)\)$/u, (_, a) => `,${(Number(a) * k).toFixed(3)})`);
  return { filter:k ? `contrast(${mix(contrast).toFixed(3)}) saturate(${mix(saturate).toFixed(3)}) brightness(${mix(brightness).toFixed(3)})${hue ? ` hue-rotate(${(hue * k).toFixed(1)}deg)` : ''}` : 'none', shadow:alpha(grade.shadow), highlight:alpha(grade.highlight) };
}

export const STAGECRAFT_DEFAULTS = { textfx:'on', action:'on', depth:'on', cgcamera:'on', waitmask:'on', grade:'subtle', stingers:'on', leitmotif:'on', sfx:'recorded', facecheck:'on' };
export function normalizeStagecraftPrefs(value) {
  const prefs = value && typeof value === 'object' ? value : {}, out = {};
  for (const [name, fallback] of Object.entries(STAGECRAFT_DEFAULTS)) {
    const allowed = name === 'grade' ? ['off','subtle','strong'] : name === 'sfx' ? ['recorded','synth'] : ['on','off'];
    out[name] = allowed.includes(prefs[name]) ? prefs[name] : fallback;
  }
  return out;
}
