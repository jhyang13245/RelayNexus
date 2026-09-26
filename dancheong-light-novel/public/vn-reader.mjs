// Reading helpers never generate text or change canonical story state.
export const pageKey = page => page ? `${page.turnId}:${page.start}` : '';
export const pageText = page => String(page?.rawText || page?.text || '');
export function readingFrame(pages, cursor, { columns = 38, lineBudget = 8 } = {}) {
  if (!pages[cursor]) return [];
  let start = cursor;
  while (start > 0 && pages[start - 1].turnId === pages[cursor].turnId) start--;
  let block = [], lines = 0;
  for (let i = start; i <= cursor; i++) {
    const page = pages[i], text = pageText(page);
    const cost = Math.max(1, Math.ceil(Array.from(text).length / Math.max(12, columns))) + 0.55;
    if (block.length && lines + cost > lineBudget) { block = []; lines = 0; }
    block.push({ page, index: i, text }); lines += cost;
  }
  return block;
}
export function reconcileCursor(previous, next, cursor, { first = false, awaiting = false, bookmark } = {}) {
  if (!next.length) return 0;
  if (first) return 0;
  if (awaiting && previous.length && previous.at(-1).turnId !== next.at(-1).turnId) {
    return next.findIndex(page => page.turnId === next.at(-1).turnId);
  }
  const prior = previous[cursor];
  const target = prior ? pageKey(prior) : bookmark;
  const index = target ? next.findIndex(page => pageKey(page) === target) : -1;
  if (index >= 0) return index;
  const containing = prior ? next.findIndex(page => page.turnId === prior.turnId && page.start <= prior.start && page.end > prior.start) : -1;
  if (containing >= 0) return containing;
  // Legacy saves without a reading position open at the start of the latest turn.
  return next.findIndex(page => page.turnId === next.at(-1).turnId);
}
export function nextPlaybackStep({ mode, cursor, length, readThrough, blocked, revealing, streaming = false }) {
  if (blocked || revealing || mode === 'manual') return 'wait';
  if (cursor >= length - 1) return streaming ? 'wait' : 'stop';
  if (mode === 'skip' && cursor + 1 > readThrough) return 'stop';
  return 'advance';
}
export function reconcileReadThrough(previous, next, readThrough, bookmark) {
  const anchor = previous.length ? pageKey(previous[readThrough]) : bookmark;
  return anchor ? next.findIndex(page => pageKey(page) === anchor) : -1;
}
export function glyphDelay(glyph, speed = 'natural') {
  const base = speed === 'instant' ? 0 : speed === 'fast' ? 9 : speed === 'slow' ? 60 : 36;
  if (!base) return 0;
  return base * (/[。.!?！？]/u.test(glyph) ? 8 : /[…—]/u.test(glyph) ? 5 : /[,，、:;]/u.test(glyph) ? 3 : 1);
}
// Measure visible progress, not request activity. A stream can be between
// chunks while its network flag is already clear, or a reveal can stall while
// more text is queued. Normal punctuation pauses (up to 480ms) are not buffering.
export function createTextWaitTracker({ now = () => performance.now(), delay = 700 } = {}) {
  let page = '', visible = -1, changedAt = now();
  const progress = (key, length) => {
    if (page !== key || visible !== length) { page = key; visible = length; changedAt = now(); }
  };
  return {
    progress,
    reason({ key, length, total, paused = false, growing = false, loading = false, hasNext = false, waitingImages = false }) {
      progress(key, length);
      if (paused) { changedAt = now(); return ''; }
      if (!length || now() - changedAt < delay) return '';
      if (waitingImages) return '인물 준비 중';
      if (length < total) return '본문 표시 준비 중';
      return growing || loading && !hasNext ? '다음 문장 준비 중' : '';
    },
  };
}
// One persistent reveal clock for both incoming public text and finished pages.
// Appending a chunk changes only the target, never the scheduled next glyph.
export function createTextRevealer({ write, onComplete, isPaused = () => false, schedule = setTimeout, cancel = clearTimeout }) {
  const state = { key: '', text: '', glyphs: [], length: 0, timer: 0, speed: 'natural' };
  const paint = () => write(state.glyphs.slice(0, state.length).join(''));
  function stop() { if (state.timer) cancel(state.timer); state.timer = 0; }
  function step() {
    state.timer = 0;
    if (isPaused()) { state.timer = schedule(step, 160); return; }
    if (state.length < state.glyphs.length) { state.length++; paint(); }
    if (state.length < state.glyphs.length) state.timer = schedule(step, glyphDelay(state.glyphs[state.length - 1], state.speed));
    else onComplete();
  }
  return Object.assign(state, {
    update({ key, text, speed = 'natural', immediate = false }) {
      const changedPage = key !== state.key, next = Array.from(text);
      if (changedPage) { stop(); state.length = 0; }
      else {
        let common = 0;
        while (common < state.length && next[common] === state.glyphs[common]) common++;
        state.length = common;
      }
      state.key = key; state.text = text; state.glyphs = next; state.speed = speed;
      if (immediate || speed === 'instant') { stop(); state.length = next.length; paint(); onComplete(); return; }
      paint();
      if (state.length >= next.length) { stop(); onComplete(); }
      else if (!state.timer) state.timer = schedule(step, changedPage ? 0 : glyphDelay(state.glyphs[state.length - 1] || '', speed));
    },
    finish() {
      if (state.length >= state.glyphs.length) return false;
      stop(); state.length = state.glyphs.length; paint(); onComplete(); return true;
    },
    reset() { stop(); state.key = ''; state.text = ''; state.glyphs = []; state.length = 0; },
  });
}
export function readDelay(text, pace = 'normal') {
  const factor = pace === 'slow' ? 85 : pace === 'fast' ? 35 : 58;
  return Math.min(14000, Math.max(1400, 850 + Array.from(String(text)).length * factor));
}
