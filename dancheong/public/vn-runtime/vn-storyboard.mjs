// Optional direction never changes cast identity, story state or paid asset keys.
const quoted = /[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu;
const indirect = /만약|상상한다면|할 것이다|하지 않았|않았다|사진 속|영상 속/u;
export function validatedComposition(value, source = '') {
  if (!['thought', 'scenery'].includes(value?.mode)) return null;
  const evidence = String(value.evidence || '').trim();
  const narration = String(source).replace(quoted, '');
  if (evidence.length < 5 || !narration.includes(evidence) || indirect.test(evidence)) return null;
  return { mode: value.mode, evidence };
}
export function compositionFor(page, direction) {
  if (page?.quoted || page?.kind === 'dialogue') return 'stage';
  const text = String(page?.rawText || page?.text || '').replace(quoted, '');
  const chosen = validatedComposition(direction?.composition, text);
  if (chosen) return chosen.mode;
  // Older cached directions retain a narrow, literal fallback, without a call.
  return /(?:의식|머릿속)[^.!?\n]{0,25}(?:가라앉|공백|텅 비|새하얘|하얘졌)|(?:생각|의문)만[^.!?\n]{0,12}(?:남았|맴돌)/u.test(text) ? 'thought' : 'stage';
}

// A cue must land at the start of its line. Slow artwork is kept in the cache
// for revisits; it cannot interrupt a line already being read or a later beat.
export function createCueWindow({ now = () => performance.now(), limit = 1200 } = {}) {
  let key = '', openedAt = null;
  return {
    reset() { key = ''; openedAt = null; },
    open(next, { waiting = false, revealed = 0 } = {}) {
      if (key !== next) { key = next; openedAt = null; }
      if (waiting) return false;
      if (openedAt === null) openedAt = now();
      return now() - openedAt <= limit && revealed <= 14;
    },
  };
}

export function createCompositionContinuity() {
  let key = '', value = 'stage';
  return {
    reset() { key = ''; value = 'stage'; },
    select(nextKey, proposed, open) {
      if (key !== nextKey) { key = nextKey; value = proposed; }
      else if (open) value = proposed;
      return value;
    },
  };
}

export function createArtContinuity() {
  let scope = '', admitted = '', visit = '', historical = false;
  return {
    reset() { scope = ''; admitted = ''; visit = ''; historical = false; },
    select(view, { scope: nextScope, pageKey = '', start, cueOpen = false, revisiting = false, composition = 'stage', decoded = true } = {}) {
      if (scope !== nextScope) { scope = nextScope; admitted = ''; visit = ''; }
      if (visit !== pageKey) { visit = pageKey; historical = revisiting; }
      if (!view) return view;
      const key = view.eventKey || '';
      if (!key) admitted = '';
      const allowed = composition === 'stage' && decoded && key && view.eventBackground &&
        (admitted === key || historical || view.eventStart === start && cueOpen);
      if (allowed) { admitted = key; return view; }
      if (composition !== 'stage') admitted = '';
      if (!view.eventBackground) return view;
      return { ...view, background: view.environment || '', eventBackground: '', eventCharacterIds: [], shotKind: '', cgStatus: 'none', shotStatus: 'none', optionalArtDeferred: true };
    },
  };
}
