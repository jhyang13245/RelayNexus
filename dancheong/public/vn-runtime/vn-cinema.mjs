import { alphaBounds, faceLandmarks } from './vn-sprite.mjs?v=ef485ae04925';
import { rasterTask } from './vn-raster.mjs?v=ef485ae04925';

export const ruleTransitions = ['diagonal', 'circle', 'blinds', 'ink'];
export function validatedEmphasis(value, text) {
  const line = typeof value?.text === 'string' ? value.text.trim() : '';
  return ['hold', 'tremble'].includes(value?.kind) && line.length >= 6 && line.length <= 110 && String(text).includes(line)
    ? { kind: value.kind, text: line } : null;
}
export function validatedCutin(beat, focusId, narration) {
  const evidence = String(beat?.shotEvidence || '').trim();
  return focusId && ['eyes', 'face'].includes(beat?.cutin) && evidence.length >= 5 && narration.includes(evidence)
    ? { kind: beat.cutin, characterId: focusId } : null;
}
// A grayscale rule map: each pixel's rank determines when it becomes visible.
// Continuous thresholding gives a true mask reveal, including on mobile Safari.
export function ruleValue(kind, x, y) {
  if (kind === 'diagonal') return (x + y * .48) / 1.48;
  if (kind === 'circle') return Math.min(1, Math.hypot((x - .55) * 1.4, y - .5) / .92);
  if (kind === 'blinds') return (y * 9) % 1;
  const wave = Math.sin(x * 39 + Math.sin(y * 13) * 3) * .026 + Math.cos(y * 47 + x * 19) * .02;
  return Math.max(0, Math.min(1, Math.hypot(x - .5, (y - .5) * .78) * 1.5 + wave));
}
export function cropBox(face, width, height, kind) {
  if (!face || !Number.isFinite(face.width) || face.width < 8) return null;
  const w = Math.min(width, face.width * (kind === 'eyes' ? 2.05 : 2.5));
  const h = Math.min(height, face.width * (kind === 'eyes' ? .48 : 1.55));
  return { x: Math.max(0, Math.min(width - w, face.x - w / 2)), y: Math.max(0, Math.min(height - h, face.eyeY - h * (kind === 'eyes' ? .5 : .4))), width: w, height: h };
}
const crops = new Map();
export function portraitCutin(url, kind) {
  const key = `${kind}:${url}`;
  if (crops.has(key)) return crops.get(key);
  const task = (async () => {
    try {
      const accelerated = await rasterTask({ kind, url });
      if (accelerated) return accelerated;
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const bounds = alphaBounds(data, canvas.width, canvas.height);
      const box = bounds && cropBox(faceLandmarks(data, canvas.width, bounds), canvas.width, canvas.height, kind);
      if (!box) return '';
      const out = document.createElement('canvas'); out.width = Math.round(box.width); out.height = Math.round(box.height);
      out.getContext('2d').drawImage(img, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    } catch { return ''; }
  })();
  crops.set(key, task); if (crops.size > 24) crops.delete(crops.keys().next().value); return task;
}

export function createCinema({ stage, visual, reduced = () => false, onRelease = () => {} }) {
  const make = (name, children = '') => { const el = document.createElement('div'); el.className = name; el.hidden = true; el.setAttribute('aria-hidden', 'true'); el.innerHTML = children; stage.append(el); return el; };
  const bars = make('vn-letterbox'); bars.hidden = false;
  const cutin = make('vn-cutin', '<div class="vn-cutin-context"></div><img alt="">');
  const emphasis = make('vn-emphasis', '<span class="vn-emphasis-mark">──</span><p class="vn-emphasis-text"></p>');
  const chapter = make('vn-chapter-card', '<small></small><strong></strong>');
  const film = make('vn-film');
  const mask = document.createElement('canvas'); mask.className = 'vn-rule-mask'; mask.hidden = true; mask.setAttribute('aria-hidden', 'true'); stage.append(mask);
  let key = '', turn = '', token = 0, frame = 0, overlayTimer, chapterTimer, cutTimer, filmTimer, backgroundMove, readingStarted = false;
  const fired = new Set();
  function dismiss() {
    const blocked = !emphasis.hidden;
    clearTimeout(overlayTimer); emphasis.hidden = true; stage.classList.remove('has-cinema-card');
    if (blocked) onRelease(); return blocked;
  }
  function card(element, duration) {
    dismiss(); element.hidden = false; stage.classList.add('has-cinema-card');
    overlayTimer = setTimeout(dismiss, duration);
  }
  function reset() {
    token++; key = ''; turn = ''; fired.clear(); dismiss(); clearTimeout(chapterTimer); chapter.hidden = true; clearTimeout(cutTimer); clearTimeout(filmTimer); cancelAnimationFrame(frame);
    mask.hidden = cutin.hidden = film.hidden = true;
    backgroundMove?.cancel(); backgroundMove = null;
    stage.classList.remove('is-crimson', 'is-cinema-close', 'has-cinema-card', 'has-cutin'); stage.dataset.cinemaBars = 'off'; stage.dataset.cinemaMotion = 'off';
  }
  function transition(kind) {
    if (reduced() || !ruleTransitions.includes(kind)) return false;
    cancelAnimationFrame(frame); mask.width = 240; mask.height = Math.max(90, Math.round(240 * stage.clientHeight / Math.max(1, stage.clientWidth)));
    const ctx = mask.getContext('2d'), image = ctx.createImageData(mask.width, mask.height);
    const ranks = Float32Array.from({ length: mask.width * mask.height }, (_, i) => ruleValue(kind, i % mask.width / mask.width, Math.floor(i / mask.width) / mask.height));
    const start = performance.now(); mask.hidden = false;
    function draw(now) {
      const progress = (now - start) / 900;
      if (progress >= 1) { mask.hidden = true; return; }
      // Close to black, then reveal the changed stage with the same rule.
      const phase = progress < .48 ? progress / .48 : (progress - .48) / .52;
      for (let i = 0; i < ranks.length; i++) {
        const reveal = Math.max(0, Math.min(1, (phase * 1.14 - ranks[i]) / .14));
        image.data[i * 4 + 3] = Math.round(255 * (progress < .48 ? reveal : 1 - reveal));
      }
      ctx.putImageData(image, 0, 0); frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw); return true;
  }
  return {
    reset, dismiss, transition,
    get blocked() { return !emphasis.hidden; },
    impact() {
      if (reduced()) return;
      clearTimeout(filmTimer); film.hidden = false;
      filmTimer = setTimeout(() => { film.hidden = true; }, 460);
    },
    update({ pageKey, turnId, sceneKey = turnId, turnIndex, title, direction = {}, portraits = [], fresh = false, enabled = true, waiting = false, eventArt = false, cueOpen = true, composition = 'stage', background = '', cueReady = '' }) {
      if (!enabled) { reset(); return; }
      if (key !== pageKey) { key = pageKey; token++; readingStarted = false; dismiss(); cutin.hidden = film.hidden = true; stage.classList.remove('has-cutin'); clearTimeout(cutTimer); clearTimeout(chapterTimer); chapter.hidden = true; }
      const ticket = token;
      const calm = reduced();
      stage.dataset.cinemaMotion = calm ? 'off' : 'on';
      stage.dataset.cinemaBars = !calm && composition === 'stage' && (direction.shot === 'close' || direction.cutin || direction.fx && direction.fx !== 'none') ? 'on' : 'off';
      stage.classList.toggle('is-cinema-close', direction.shot === 'close' && !eventArt);
      stage.classList.toggle('is-crimson', direction.mood === 'dread');
      const bg = visual.querySelector('.vn-backdrop');
      if (!calm && composition !== 'thought' && direction.shot === 'wide' && bg && !backgroundMove) backgroundMove = bg.animate([{ translate: '-1% 0', scale: '1.045' }, { translate: '1% 0', scale: '1.045' }], { duration: 22000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      if ((calm || composition === 'thought' || direction.shot !== 'wide') && backgroundMove) { backgroundMove.cancel(); backgroundMove = null; }
      if (turn !== sceneKey) {
        const changed = Boolean(turn); turn = sceneKey;
        if (changed && fresh && !waiting && !calm && cueOpen) {
          chapter.querySelector('small').textContent = `SCENE ${String(turnIndex + 1).padStart(2, '0')}`;
          chapter.querySelector('strong').textContent = String(title || '이어지는 이야기').slice(0, 70);
          clearTimeout(chapterTimer); chapter.hidden = false;
          chapterTimer = setTimeout(() => { chapter.hidden = true; }, 1400);
        }
      }
      // A late direction response must not black out prose already being read.
      const firstReading = !readingStarted;
      if (!waiting) readingStarted = true;
      if (!fresh || waiting || calm || !cueOpen || composition !== 'stage') return;
      const important = direction.emphasis;
      if (important && cueReady === 'emphasis' && !fired.has(`${key}:emphasis`)) {
        fired.add(`${key}:emphasis`); emphasis.querySelector('p').textContent = important.text;
        emphasis.classList.toggle('is-trembling', important.kind === 'tremble'); card(emphasis, Math.min(2200, Math.max(900, important.text.length * 35)));
      }
      const insert = !eventArt && !important && direction.cutin, actor = insert && portraits.find(p => p.id === insert.characterId && p.url);
      if (actor && cueReady === 'cutin' && !fired.has(`${key}:cutin`)) {
        fired.add(`${key}:cutin`);
        const startedAt = performance.now();
        void portraitCutin(actor.url, insert.kind).then(url => {
          if (!url || ticket !== token || reduced() || performance.now() - startedAt > 700) return;
          const image = cutin.querySelector('img'); image.src = url; cutin.dataset.kind = insert.kind;
          cutin.querySelector('.vn-cutin-context').style.backgroundImage = background ? `url("${background.replaceAll('"', '%22')}")` : '';
          cutin.hidden = false; stage.classList.add('has-cutin');
          cutTimer = setTimeout(() => { cutin.hidden = true; stage.classList.remove('has-cutin'); }, 2400);
        });
      }
      if (fired.size > 500) fired.delete(fired.keys().next().value);
    },
  };
}
