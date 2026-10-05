import {ART_RULES,STAGECRAFT_DEFAULTS,estimateDepth,depthMasks,focusRegions,regionTransform,coverPoint,spriteSignature,signatureMatch,gradeFor,typingPace,textMarks,normalizeArtRule} from './cortex-vn-stagecraft.mjs';
// Stage runtime for stagecraft. Uses only images already on screen (backdrop,
// event CG, sprites, their crops): no image requests, no generation cost.
// Reduced motion disables every moving/flashing layer; flashes stay below
// three per second.
const LRU = (size) => { const map = new Map(); return { get:key => map.get(key), has:key => map.has(key), set(key, value) { map.delete(key); map.set(key, value); while (map.size > size) map.delete(map.keys().next().value); return value; } }; };

async function pixels(url, width, { loadImage } = {}) {
  const image = loadImage ? await loadImage(url) : await new Promise((resolve, reject) => { const img = new Image(); img.decoding = 'async'; if (/^https?:/iu.test(url)) img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
  const scale = Math.min(1, width / Math.max(1, image.naturalWidth, image.naturalHeight));
  const w = Math.max(8, Math.round(image.naturalWidth * scale)), h = Math.max(8, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently:true }); ctx.drawImage(image, 0, 0, w, h);
  return { data:ctx.getImageData(0, 0, w, h).data, w, h, natural:{ width:image.naturalWidth, height:image.naturalHeight } };
}
function maskUrl(alpha, w, h) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) { image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = alpha[i]; }
  ctx.putImageData(image, 0, 0); return canvas.toDataURL('image/png');
}
const cssUrl = url => `url("${String(url).replaceAll('"', '%22')}")`;
const urlOf = element => (/url\("?(.*?)"?\)/u.exec(element?.style.backgroundImage || '')?.[1] || '').replaceAll('%22', '"');
// Cancelling WAAPI snaps to the CSS value; ease back from where it is instead.
function release(element, animation, ms = 650) {
  if (!animation) return;
  let from = '';
  try { from = getComputedStyle(element).transform; } catch { /* detached */ }
  animation.cancel();
  if (from && from !== 'none' && element.isConnected) element.animate([{ transform:from }, { transform:'none' }], { duration:ms, easing:'ease-out' });
}
const idle = fn => (globalThis.requestIdleCallback || (cb => setTimeout(cb, 60)))(fn);

export function createStagecraft({ stage, visual, reduced = () => false, prefs = () => STAGECRAFT_DEFAULTS, palette = () => 'auto', crop = async () => '', sound = null, foley = null, notify = () => {}, loadImage, storage = globalThis.localStorage } = {}) {
  const make = (name, parent, html = '') => { const el = document.createElement('div'); el.className = name; el.setAttribute('aria-hidden', 'true'); el.innerHTML = html; parent.append(el); return el; };
  // Grade wraps the whole visual (backdrop, sprites, weather) once.
  const grade = document.createElement('div'); grade.className = 'vn-grade';
  visual.before(grade); grade.append(visual);
  const layer = document.createElement('div'); layer.className = 'vn-stagecraft'; layer.setAttribute('aria-hidden', 'true'); grade.after(layer);
  make('vn-sc-veil', layer); const speed = make('vn-sc-speedlines', layer), focus = make('vn-sc-focuslines', layer), strobe = make('vn-sc-strobe', layer);
  const panels = make('vn-sc-panels vn-sc-graded', layer), rapid = make('vn-sc-rapid vn-sc-graded', layer), memory = make('vn-sc-memory vn-sc-graded', layer), badge = make('vn-sc-badge', stage);
  badge.setAttribute('role', 'status'); badge.removeAttribute('aria-hidden'); badge.hidden = true;
  for (const el of [speed, focus, strobe, panels, rapid]) el.hidden = true;
  const depthCache = LRU(10), regionCache = LRU(16), signatureCache = LRU(24), checked = LRU(64);
  let key = '', frame = {}, cgUrl = '', cgMotion = null, cgElement = null, cgTicket = 0, waitMotion = null, waitElement = null, lastCg = '', lastScope = '', parallaxFrame = 0, badgeTimer = 0, motifAt = -Infinity, ticket = 0, lastFlash = -Infinity, lastScene = '';
  const fired = new Set(), timers = new Set(), actionAnimations = new Set();
  const animateAction = (element, frames, options) => { const animation = element.animate(frames, options); actionAnimations.add(animation); animation.finished?.then(() => actionAnimations.delete(animation), () => actionAnimations.delete(animation)); return animation; };
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const on = name => prefs()[name] !== 'off';
  const calm = () => reduced();

  // ---------- Colour grade ----------
  let gradeKey = '';
  function applyGrade() {
    // Actor camera is a uniform zoom (CSS): relative stature is unchanged.
    stage.dataset.actorCamera = prefs().actorcamera || 'tsukihime';
    const value = gradeFor(palette(), prefs().grade), next = JSON.stringify(value);
    if (next === gradeKey) return; gradeKey = next;
    stage.style.setProperty('--vn-grade-filter', value.filter);
    stage.style.setProperty('--vn-grade-shadow', value.shadow);
    stage.style.setProperty('--vn-grade-highlight', value.highlight);
    stage.dataset.grade = prefs().grade;
  }

  stage.dataset.actorCamera = prefs().actorcamera || 'tsukihime';

  // ---------- 2.5D depth ----------
  function depthLayers(background) {
    if (background.vnDepth) return background.vnDepth;
    const parts = ['far', 'mid', 'near'].map(name => { const el = document.createElement('div'); el.className = `vn-depth vn-depth-${name}`; el.setAttribute('aria-hidden', 'true'); background.append(el); return el; });
    background.vnDepth = { far:parts[0], mid:parts[1], near:parts[2], url:'' };
    return background.vnDepth;
  }
  function clearMask(layers) { for (const el of [layers.mid, layers.near]) { el.style.maskImage = el.style.webkitMaskImage = ''; el.hidden = true; } }
  function refreshDepth(eventUrl) {
    for (const background of visual.querySelectorAll('.vn-background')) {
      const url = urlOf(background), enabled = frame.enabled && !calm() && on('depth') && url && url !== eventUrl && background.classList.contains('has-image') && !stage.classList.contains('has-cover');
      const layers = depthLayers(background);
      if (!enabled) { background.dataset.depth = 'off'; if (layers.url) { layers.url = ''; clearMask(layers); } continue; }
      if (layers.url === url) continue;
      // Layers (and their slight overscan) appear only once masks exist.
      layers.url = url; clearMask(layers); background.dataset.depth = 'off';
      const apply = masks => {
        if (!frame.enabled || calm() || !on('depth') || layers.url !== url || !masks) return;
        background.dataset.depth = 'on';
        const position = getComputedStyle(background).backgroundPosition || 'center';
        for (const [name, mask] of [['mid', masks.mid], ['near', masks.near]]) {
          const el = layers[name]; el.style.maskImage = el.style.webkitMaskImage = cssUrl(mask);
          el.style.maskSize = el.style.webkitMaskSize = 'cover'; el.style.maskPosition = el.style.webkitMaskPosition = position; el.hidden = false;
        }
      };
      if (depthCache.has(url)) { apply(depthCache.get(url)); continue; }
      idle(() => {
        if (layers.url !== url) return;
        void pixels(url, 160, { loadImage }).then(({ data, w, h }) => {
          const masks = depthMasks(estimateDepth(data, w, h));
          return depthCache.set(url, { mid:maskUrl(masks.mid, w, h), near:maskUrl(masks.near, w, h) });
        }).catch(() => depthCache.set(url, null)).then(apply);
      });
    }
  }
  function onPointer(event) {
    if (parallaxFrame || !frame.enabled || frame.paused || !on('depth') || calm()) return;
    const rect = stage.getBoundingClientRect(), x = (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, y = (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1;
    parallaxFrame = requestAnimationFrame(() => { parallaxFrame = 0; stage.style.setProperty('--vn-par-x', Math.max(-1, Math.min(1, x)).toFixed(3)); stage.style.setProperty('--vn-par-y', Math.max(-1, Math.min(1, y)).toFixed(3)); });
  }
  stage.addEventListener('pointermove', onPointer, { passive:true });

  // ---------- CG camera ----------
  const activeBackground = () => visual.querySelector('.vn-background.is-active');
  function stopCg(immediate = false) { cgTicket++; if (immediate) cgMotion?.cancel(); else release(cgElement, cgMotion); cgMotion = null; cgElement = null; cgUrl = ''; }
  async function regionsFor(url) {
    if (regionCache.has(url)) return regionCache.get(url);
    try { const { data, w, h, natural } = await pixels(url, 128, { loadImage }); return regionCache.set(url, { regions:focusRegions(data, w, h), natural }); }
    catch { return regionCache.set(url, { regions:[], natural:null }); }
  }
  function startCg(url, first) {
    const element = activeBackground();
    if (!element || urlOf(element) !== url) return;
    stopCg(); cgUrl = url; cgElement = element; const mine = ++cgTicket;
    void regionsFor(url).then(({ regions, natural }) => {
      // Its own ticket: page turns and action cues must not cancel the camera.
      if (mine !== cgTicket || cgUrl !== url || !frame.enabled || calm() || !on('cgcamera')) return;
      const box = { width:element.clientWidth || 1, height:element.clientHeight || 1 }, position = (getComputedStyle(element).backgroundPosition || '50% 50%').split(' ').map(v => v.endsWith('%') ? parseFloat(v) / 100 : .5);
      const points = natural ? regions.map(region => coverPoint(region, natural, box, [position[0] ?? .5, position[1] ?? .5])) : [];
      const target = points[0] || { x:.5, y:.4 };
      const drift = [{ transform:'translate(0,0) scale(1.02)' }, { transform:regionTransform(target, 1.12) }];
      const kenBurns = () => { if (cgUrl === url && mine === cgTicket) { cgMotion = element.animate(drift, { duration:16000, iterations:Infinity, direction:'alternate', easing:'ease-in-out' }); if (frame.paused) cgMotion.pause?.(); } };
      if (!first || !points.length) { kenBurns(); return; }
      // Sequential close-ups: wide → region 1 → region 2 → wide, then drift.
      const frames = [{ transform:'translate(0,0) scale(1.02)', offset:0 }, { transform:'translate(0,0) scale(1.02)', offset:.16 }];
      const shots = points.slice(0, 2), step = .64 / shots.length;
      shots.forEach((point, i) => { const zoom = point.kind === 'face' ? 2 : 1.7, t = regionTransform(point, zoom); frames.push({ transform:t, offset:.16 + step * i + step * .35, easing:'cubic-bezier(.2,.7,.2,1)' }, { transform:t, offset:.16 + step * (i + 1) }); });
      frames.push({ transform:'translate(0,0) scale(1.02)', offset:1 });
      cgMotion = element.animate(frames, { duration:2600 + shots.length * 1900, easing:'ease-in-out' });
      cgMotion.onfinish = kenBurns;
      if (frame.paused) cgMotion.pause?.();
    });
  }

  // ---------- CG ↔ sprite colour consistency ----------
  async function checkCg(url, portraits, ids) {
    if (!on('facecheck') || !frame.enabled || frame.paused) return;
    const people = portraits.filter(person => ids.includes(person.id) && person.url);
    if (!people.length) return; // Sprites not ready yet: judge on a later render.
    const checkKey = JSON.stringify([url, people.map(p => [p.id, p.url]).sort()]), scope = frame.scope;
    if (checked.has(checkKey) || pending.has(checkKey)) return;
    pending.add(checkKey);
    try {
      const cg = await pixels(url, 128, { loadImage }), misses = [];
      checked.set(checkKey, true);
      for (const person of people) {
        let signature = signatureCache.get(person.url);
        if (signature === undefined) { try { const sprite = await pixels(person.url, 96, { loadImage }); signature = spriteSignature(sprite.data, sprite.w, sprite.h); } catch { signature = null; } signatureCache.set(person.url, signature); }
        if (signatureMatch(signature, cg.data, cg.w, cg.h).verdict === 'mismatch') misses.push(person.name || person.label || '인물');
      }
      if (misses.length && frame.enabled && !frame.paused && frame.scope === scope && on('facecheck') && urlOf(activeBackground()) === url) {
        reports.unshift({ at:Date.now(), names:misses }); reports.length = Math.min(reports.length, 12);
        badge.textContent = `CG 일관성 점검 · ${misses.join(', ')}의 머리색이 입상과 달라 보입니다`; badge.hidden = false;
        clearTimeout(badgeTimer); badgeTimer = setTimeout(() => { badge.hidden = true; }, 5200);
        notify({ kind:'cg-mismatch', names:misses, url });
      }
    } catch { checked.set(checkKey, true); /* Unreadable image (e.g. cross-origin): not judged. */ }
    finally { pending.delete(checkKey); }
  }
  const reports = [], pending = new Set();

  // ---------- Waiting presentation ----------
  function setWaiting(kind) {
    const active = kind && on('waitmask') && frame.enabled;
    stage.classList.toggle('is-wait-masked', Boolean(active));
    stage.dataset.waitKind = active ? kind : '';
    const element = activeBackground();
    if (!active || calm() || cgMotion || waitElement !== element) { if (calm()) waitMotion?.cancel(); else release(waitElement, waitMotion, 900); waitMotion = null; waitElement = null; }
    if (active && !calm() && !cgMotion && !waitMotion && element) { waitElement = element; waitMotion = element.animate([{ transform:'translate(0,0) scale(1.02)' }, { transform:'translate(-1.6%,-.8%) scale(1.09)' }], { duration:9000, iterations:Infinity, direction:'alternate', easing:'ease-in-out' }); }
    const showMemory = Boolean(active && kind === 'turn' && lastCg && lastCg !== frame.background && !calm());
    if (showMemory && memory.dataset.url !== lastCg) { memory.dataset.url = lastCg; memory.style.backgroundImage = cssUrl(lastCg); }
    memory.classList.toggle('is-on', showMemory);
  }

  // ---------- One-shot actions ----------
  function show(el, ms, cls = 'is-on') { el.hidden = false; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); later(() => { el.classList.remove(cls); el.hidden = true; }, ms); }
  function focusPoint() {
    const slot = frame.focusId && [...stage.querySelectorAll('#vn-characters [data-character-id]')].find(el => el.dataset.characterId === frame.focusId);
    const rect = stage.getBoundingClientRect(), box = slot?.getBoundingClientRect();
    return box && rect.width ? { x:(box.left + box.width / 2 - rect.left) / rect.width, y:Math.max(.15, (box.top + box.height * .18 - rect.top) / rect.height) } : { x:.5, y:.42 };
  }
  async function faces(limit = 2) {
    const people = (frame.portraits || []).filter(p => p.url), ordered = [...people.filter(p => p.id === frame.focusId), ...people.filter(p => p.id !== frame.focusId)];
    const timeout = new Promise(resolve => setTimeout(() => resolve(''), 450));
    const urls = await Promise.all(ordered.slice(0, limit).map(person => Promise.race([crop(person.url, 'face').catch(() => ''), timeout])));
    return urls.filter(Boolean);
  }
  function tile(url, size = 'cover', position = 'center') { const el = document.createElement('div'); el.className = 'vn-sc-tile'; el.style.backgroundImage = cssUrl(url); el.style.backgroundSize = size; el.style.backgroundPosition = position; return el; }
  async function playPanels(mine) {
    const bg = frame.background, crops = await faces(2);
    if (mine !== ticket) return;
    const sources = [crops[0] && tile(crops[0]), bg && tile(bg, '240%', `${Math.round(focusPoint().x * 100)}% 40%`), crops[1] ? tile(crops[1]) : bg && tile(bg, '320%', '30% 60%')].filter(Boolean);
    if (sources.length < 2) return playSimple('focuslines');
    panels.replaceChildren(...sources.map((el, i) => { const cell = document.createElement('div'); cell.className = 'vn-sc-panel'; cell.style.setProperty('--i', String(i)); cell.append(el); return cell; }));
    panels.dataset.count = String(sources.length);
    show(panels, 1700); sound?.whoosh(.8);
  }
  async function playRapid(mine) {
    const bg = frame.background, crops = await faces(2);
    if (mine !== ticket) return;
    const regions = bg ? (await regionsFor(bg)).regions : [];
    const shots = [bg && tile(bg, '260%', `${Math.round((regions[0]?.x ?? .35) * 100)}% ${Math.round((regions[0]?.y ?? .4) * 100)}%`), crops[0] && tile(crops[0]), bg && tile(bg, '200%', `${Math.round((regions[1]?.x ?? .7) * 100)}% ${Math.round((regions[1]?.y ?? .6) * 100)}%`), crops[1] && tile(crops[1])].filter(Boolean);
    if (mine !== ticket) return;
    if (shots.length < 2) return playSimple('speedlines');
    rapid.hidden = false; rapid.replaceChildren(shots[0]);
    shots.forEach((el, i) => later(() => { if (mine === ticket) { rapid.replaceChildren(el); sound?.whoosh(.6); } }, i * 190));
    later(() => { rapid.hidden = true; rapid.replaceChildren(); }, shots.length * 190 + 120);
  }
  function playSimple(kind) {
    if (kind === 'speedlines') { show(speed, 950); sound?.whoosh(1); }
    if (kind === 'focuslines') { const point = focusPoint(); focus.style.setProperty('--fx', `${(point.x * 100).toFixed(1)}%`); focus.style.setProperty('--fy', `${(point.y * 100).toFixed(1)}%`); show(focus, 1150); sound?.whoosh(.5); }
  }
  // One budget for every full-screen flash (also impact flashes from vn.js):
  // at most one flashing effect per second, i.e. two flashes per second.
  function flashGate() { const t = performance.now(); if (t - lastFlash < 1000) return false; lastFlash = t; return true; }
  function playAction(kind) {
    clearActions();
    const mine = ++ticket;
    if ((kind === 'invert' || kind === 'strobe') && !flashGate()) { foley?.play('impact', `${key}:${kind}`); return; }
    if (kind === 'speedlines' || kind === 'focuslines') playSimple(kind);
    else if (kind === 'panels') void playPanels(mine);
    else if (kind === 'rapidcut') void playRapid(mine);
    else if (kind === 'invert') {
      // Two short monochrome-negative frames (< 3 flashes per second).
      const base = gradeFor(palette(), prefs().grade).filter, negative = 'invert(1) grayscale(1) contrast(1.5)';
      animateAction(grade, [{ filter:negative }, { filter:negative, offset:.28 }, { filter:base, offset:.3 }, { filter:base, offset:.62 }, { filter:negative, offset:.64 }, { filter:negative, offset:.9 }, { filter:base }], { duration:340 });
      foley?.play('heavy', `${key}:invert`);
    } else if (kind === 'strobe') {
      strobe.hidden = false;
      animateAction(strobe, [{ opacity:0 }, { opacity:.72, offset:.12 }, { opacity:0, offset:.4 }, { opacity:.55, offset:.6 }, { opacity:0 }], { duration:820, easing:'ease-out' }).onfinish = () => { strobe.hidden = true; };
      foley?.play('impact', `${key}:strobe`);
    } else if (kind === 'slowmo') {
      // Scale the visual, filter the grade wrapper: the mood filter on the
      // visual itself stays untouched.
      const base = gradeFor(palette(), prefs().grade).filter, prefix = base === 'none' ? '' : base + ' ';
      animateAction(visual, [{ scale:'1' }, { scale:'1.05', offset:.35 }, { scale:'1.06', offset:.8 }, { scale:'1' }], { duration:1700, easing:'cubic-bezier(.2,.7,.2,1)' });
      animateAction(grade, [{ filter:base }, { filter:prefix + 'saturate(.55) blur(.6px)', offset:.35 }, { filter:prefix + 'saturate(.6) blur(.4px)', offset:.8 }, { filter:base }], { duration:1700 });
      sound?.duck.duck(.35, 1500, 700);
    }
  }

  function clearActions() {
    ticket++; for (const t of timers) clearTimeout(t); timers.clear();
    for (const animation of actionAnimations) animation.cancel(); actionAnimations.clear();
    for (const el of [speed, focus, strobe, panels, rapid]) { el.hidden = true; el.classList.remove('is-on'); }
    panels.replaceChildren(); rapid.replaceChildren();
  }
  function reset() {
    clearActions(); key = ''; frame = {enabled:false}; fired.clear();
    stopCg(true); waitMotion?.cancel(); waitMotion = null; waitElement = null;
    if (parallaxFrame) globalThis.cancelAnimationFrame?.(parallaxFrame); parallaxFrame = 0;
    stage.style.removeProperty('--vn-par-x'); stage.style.removeProperty('--vn-par-y');
    refreshDepth(''); clearTimeout(badgeTimer);
    memory.classList.remove('is-on'); badge.hidden = true;
    stage.classList.remove('is-center-line', 'is-wait-masked', 'has-dof'); stage.dataset.waitKind = '';
  }

  return {
    reset, reports, flashGate,
    // Typewriter pace for the current line.
    pace(direction, visible) { return on('textfx') && frame.enabled !== false ? typingPace(direction?.stagecraft, visible) : null; },
    marks(direction, visible) { return on('textfx') && frame.enabled !== false ? textMarks(direction?.stagecraft, visible) : []; },
    update(input) {
      frame = input; applyGrade();
      if (!input.enabled) { reset(); return; }
      if (input.pageKey !== key) { clearActions(); key = input.pageKey; }
      if (input.scope !== lastScope) { lastScope = input.scope; lastCg = ''; }
      if (input.sceneKey !== lastScene) { lastScene = input.sceneKey; lastCg = ''; }
      stage.dataset.stagecraftPaused = String(Boolean(input.paused));
      if (input.paused) { clearActions(); cgMotion?.pause?.(); waitMotion?.pause?.(); sound?.stop?.(); return; }
      cgMotion?.play?.(); waitMotion?.play?.();
      if (calm() || !on('action')) clearActions();
      const stagecraft = input.direction?.stagecraft;
      stage.classList.toggle('is-center-line', Boolean(on('textfx') && stagecraft?.layout === 'center' && input.composition === 'stage'));
      const isCg = Boolean(input.eventArt && input.background === input.eventArt);
      stage.classList.toggle('has-dof', Boolean(on('depth') && !isCg && input.kind === 'dialogue' && (input.portraits || []).some(p => p.url)));
      refreshDepth(input.eventArt);
      if (isCg) {
        lastCg = input.eventArt;
        if (on('cgcamera') && !calm()) { if (cgUrl !== input.eventArt) startCg(input.eventArt, Boolean(input.fresh && !fired.has(`cg:${input.eventArt}`))); fired.add(`cg:${input.eventArt}`); }
        else stopCg(true);
        void checkCg(input.eventArt, input.portraits || [], input.eventCharacterIds || []);
      } else if (cgUrl) stopCg();
      setWaiting(input.loading ? 'turn' : input.waiting ? 'dialogue' : '');
      // Character motifs: a directed defining moment, or a first meeting.
      if (input.fresh && !input.waiting && on('leitmotif') && sound && performance.now() - motifAt > 15000) {
        let id = stagecraft?.leitmotif === 'focus' && input.focusId && (input.portraits || []).some(p => p.id === input.focusId && p.url) ? input.focusId : '';
        if (!id) {
          let met = {}; try { met = JSON.parse(storage?.getItem(`dancheong-vn-motif-met-v1:${input.scope}`) || '{}'); } catch { /* fresh */ }
          if (!met || typeof met !== 'object' || Array.isArray(met)) met = {};
          const fresh = (input.portraits || []).find(p => p.url && !Object.hasOwn(met, p.id));
          if (fresh && !fired.has(`motif:${key}`) && sound.motif(fresh.id, input.scope)) {
            // Recorded only once it was actually heard (music on, audio unlocked).
            fired.add(`motif:${key}`); motifAt = performance.now(); met[fresh.id] = 1;
            try { storage?.setItem(`dancheong-vn-motif-met-v1:${input.scope}`, JSON.stringify(met)); } catch { /* tab only */ }
          }
        }
        if (id && !fired.has(`motif:${key}`) && sound.motif(id, input.scope)) { fired.add(`motif:${key}`); motifAt = performance.now(); }
      }
      if (fired.size > 400) fired.clear();
    },
    // Cues from the shared text clock (first reading only).
    fire(cue) {
      if (!frame.enabled || frame.paused) return;
      if (cue.kind === 'stinger') { if (on('stingers')) sound?.stinger(cue.stinger); return; }
      if (cue.kind === 'emphasis') { sound?.duck.duck(.22, 2200, 1100); return; }
      if (cue.kind === 'impact') { sound?.duck.duck(.5, 650, 600); return; }
      if (cue.kind !== 'action' || !on('action') || calm()) return;
      playAction(cue.action);
    },
    // Free presentation switches apply at once; the art rule changes image
    // prompts (and cost), so it is read back only by the dialog's Save.
    mountSettings(panel, { save = () => {}, rule = () => ({}) } = {}) {
      if (!panel || panel.querySelector('.vn-stagecraft-settings')) return null;
      const box = document.createElement('fieldset'); box.className = 'vn-stagecraft-settings';
      const select = (id, label, options, help = '') => `<label>${label}<select id="${id}">${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select>${help ? `<small>${help}</small>` : ''}</label>`;
      const onOff = [['on', '켬'], ['off', '끔']];
      box.innerHTML = `<legend>무대 연출 확장</legend><div class="vn-settings-fields"><div class="vn-settings-row">${select('vn-sc-textfx', '텍스트 효과', onOff, '단어 색·크기·떨림, 검은 화면 중앙 한 줄, 느린 타자')}${select('vn-sc-action', '액션 연출', onOff, '속도선·집중선·컷 분할·반전·적색 점멸·슬로모션 (동작 줄이기에서는 꺼짐)')}</div>`
        + `<div class="vn-settings-row">${select('vn-sc-depth', '2.5D 배경 깊이', onOff, '배경을 깊이층으로 나눠 시차·대화 중 배경 흐림')}${select('vn-sc-cgcamera', 'CG 카메라', onOff, '이벤트 CG 켄 번즈 이동과 얼굴·손 클로즈업')}</div>`
        + `<div class="vn-settings-row">${select('vn-sc-waitmask', '대기 연출', onOff, 'AI 응답·이미지 대기 중 화면 이동과 이전 CG 회상')}${select('vn-sc-grade', '공통 색보정', [['subtle', '약하게'], ['strong', '강하게'], ['off', '끔']], '배경·입상·CG에 같은 색 등급 적용')}</div>`
        + `<div class="vn-settings-row">${select('vn-sc-stingers', '음악 스팅어', onOff, '충격·폭로·상실·결의 순간의 짧은 음악')}${select('vn-sc-leitmotif', '캐릭터 테마', onOff, '첫 만남과 결정적 순간의 인물 모티프')}</div>`
        + `<div class="vn-settings-row">${select('vn-sc-sfx', '효과음 음원', [['recorded', '녹음 CC0'], ['synth', '합성음']], '녹음 음원이 없거나 재생할 수 없는 종류는 합성음으로 재생')}${select('vn-sc-facecheck', 'CG·입상 일관성 점검', onOff, '이벤트 CG 인물의 머리색이 입상과 다르면 알림')}</div>`
        + `<div class="vn-settings-row">${select('vn-sc-actorcamera', '입상 카메라', [['tsukihime', '월희식 · 중앙 구도 (권장)'], ['presence', '크게 · 오른쪽 (본문 피함)'], ['standard', '기존 크기']], '가로 휴대폰 기준. 월희식은 인물을 가운데 크게 두고 본문이 인물 위에 겹치며, 키 비율과 발 위치는 그대로입니다')}</div>`
        + `<div class="vn-settings-row">${select('vn-art-palette', '작품 아트 규칙 · 팔레트', Object.entries(ART_RULES.palette).map(([v, [t]]) => [v, t]))}${select('vn-art-line', '선', Object.entries(ART_RULES.line).map(([v, [t]]) => [v, t]))}${select('vn-art-shading', '음영', Object.entries(ART_RULES.shading).map(([v, [t]]) => [v, t]))}</div>`
        + '<small class="vn-art-rule-help">아트 규칙은 이 작품의 모든 배경·입상·CG 프롬프트에 같은 팔레트·선·음영 지시로 들어갑니다. 저장하면 스타일 메모처럼 새 규칙으로 이미지를 다시 그리며(이미지 비용 발생), 기존 이미지는 이전 규칙으로 보관됩니다. 공통 색보정은 비용 없이 화면에서만 적용됩니다.</small></div>';
      panel.append(box);
      const names = ['textfx', 'action', 'depth', 'cgcamera', 'waitmask', 'grade', 'stingers', 'leitmotif', 'sfx', 'facecheck', 'actorcamera'];
      const sync = () => { const p = prefs(); for (const name of names) box.querySelector(`#vn-sc-${name}`).value = p[name]; const r = normalizeArtRule(rule()); for (const name of ['palette', 'line', 'shading']) box.querySelector(`#vn-art-${name}`).value = r[name]; };
      for (const name of names) box.querySelector(`#vn-sc-${name}`).addEventListener('change', event => { save({ ...prefs(), [name]:event.target.value }); applyGrade(); if (name === 'depth') refreshDepth(frame.eventArt || ''); });
      sync();
      return { sync, artRule:() => normalizeArtRule(Object.fromEntries(['palette', 'line', 'shading'].map(name => [name, box.querySelector(`#vn-art-${name}`).value]))) };
    },
  };
}
