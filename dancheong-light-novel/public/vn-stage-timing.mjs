import { readableTurnPages } from './vn-core.mjs';

// A closed, published paragraph is the smallest stable directing unit. Never
// inspect raw writer drafts; a later paragraph cannot change an earlier beat.
export function publishedUnit(turn, page, previousText = '') {
  const committed = turn?.status === 'COMMITTED';
  const text = committed ? String(turn.text || '') : typeof turn?.displayText === 'string' ? turn.displayText : turn?.status === 'ADJUDICATION_PENDING' ? String(turn.sameTurnResume?.publicText || '') : '';
  const start = text.lastIndexOf('\n', Math.max(0, page.start - 1)) + 1;
  const newline = text.indexOf('\n', page.start);
  const end = newline < 0 ? text.length : newline;
  const ready = committed || turn?.status === 'ADJUDICATION_PENDING' || newline >= 0;
  const prefix = text.slice(0, end);
  return { start, end, text: text.slice(start, end), prefix, ready,
    previousText: [previousText, text.slice(0, start)].filter(Boolean).join('\n'),
    pages: readableTurnPages({ ...turn, text: prefix, displayText: prefix }, page.turnIndex).filter(row => row.start >= start && row.start < end),
  };
}

export function dialogueWait(page, view, { enabled, decoded = false, eventDecoded = false, bypass = false } = {}) {
  if (!enabled || bypass || (!page?.quoted && page?.kind !== 'dialogue')) return false;
  if (!view || view.castStatus !== 'ready') return true;
  // A quotation/phone voice can be attributed without a person on stage.
  if (!view.speakerId) return false;
  if (eventDecoded && view.eventBackground && view.eventCharacterIds?.includes(view.speakerId)) return false;
  return !view.portraits.some(person => person.id === view.speakerId) || !decoded;
}

// A turn gets one short grace period, never another wait for every utterance.
// Cast attribution remains independent: this only releases readable prose.
export function createDialogueGrace({ now = () => Date.now(), milliseconds = 5000 } = {}) {
  const starts = new Map();
  return {
    remaining(key) {
      if (!starts.has(key)) starts.set(key, now());
      return Math.max(0, milliseconds - (now() - starts.get(key)));
    },
    clear() { starts.clear(); },
  };
}

// Presentation attribution comes from the verified cast pass, never a stale
// writer annotation that may have guessed the nearest registered character.
export function resolvedSpeaker(page, view) {
  if (!page?.quoted && page?.kind !== 'dialogue') return page;
  const text = page.rawText || page.text;
  if (view?.castStatus === 'ready') {
    const speaker = view.speakerName || '';
    return { ...page, speaker, characterId: view.speakerId || '', speakerResolved: true, speakerTentative: false, kind: speaker ? 'dialogue' : 'narration', text };
  }
  // When the cast check cannot run (failed, or no text key), fall back to the
  // writer's annotation. It is shown as tentative and never binds a sprite.
  const unavailable = ['error', 'needs-key'].includes(view?.castStatus);
  const speaker = unavailable ? String(page.speaker || '') : '';
  return { ...page, speaker, characterId: '', speakerResolved: unavailable, speakerTentative: Boolean(speaker), kind: speaker ? 'dialogue' : 'narration', text };
}

export function preparationPages(pages, cursor) {
  const current = pages[cursor], latest = pages.at(-1);
  if (!current) return [];
  // Prepare all already-published beats of the incoming turn, even while the
  // reader is still on an older turn. Draft text is never part of this input.
  return pages.filter((page, index) => index >= cursor && (page.turnId === current.turnId || page.turnId === latest.turnId));
}

export function nextWaitReason({ complete, blocked, loading, nextPage, nextView, imagesEnabled }) {
  if (!complete || blocked) return '';
  if (!nextPage) return loading ? '다음 문장 준비 중' : '';
  // This is a readiness hint for the next page; actual decoding is checked
  // when that page becomes visible, for both portraits and event backgrounds.
  if (imagesEnabled && dialogueWait(nextPage, nextView, { enabled: true, decoded: true, eventDecoded: Boolean(nextView?.eventBackground) })) return '다음 대사의 인물 준비 중';
  return '';
}

export function createPreparationQueue({ concurrency = 3, onError = () => {} } = {}) {
  const waiting = new Map(), running = new Map();
  let epoch = 0;
  function pump() {
    while (running.size < concurrency && waiting.size) {
      const [key, job] = waiting.entries().next().value; waiting.delete(key);
      const token = {}, generation = epoch; running.set(token, { key, generation });
      Promise.resolve().then(() => generation === epoch && job(() => generation === epoch)).catch(onError).finally(() => { running.delete(token); pump(); });
    }
  }
  return {
    add(key, job) { if (!waiting.has(key) && ![...running.values()].some(row => row.key === key && row.generation === epoch)) waiting.set(key, job); pump(); },
    clear() { epoch++; waiting.clear(); },
  };
}

// Only cast inference occupies the paragraph queue. Waiting for a shared slow
// background must not stop checking/generating a later paragraph's speaker.
// Lookahead tiers: the whole published turn gets cheap cast checks, only the
// reader's paragraph and the next few generate images, including event art.
export const IMAGE_LOOKAHEAD = 2;
export function preparationTier(unitIndex, lookahead = IMAGE_LOOKAHEAD) {
  return unitIndex === 0 ? 'current' : unitIndex <= lookahead ? 'images' : 'cast';
}
export async function prepareAhead({ scene, pages, castDirector, assets, active, generate, preload, tier = 'current' }) {
  await castDirector.prepare(scene, { generate, page: pages[0] });
  if (!active()) return { completion: Promise.resolve() };
  const images = tier !== 'cast';
  // Beyond the image window, only already-stored art is loaded; nothing is paid.
  const completion = Promise.all(pages.map(page => assets.prepare(scene, page, { active, generate: generate && images, cg: images }))).then(async () => {
    if (active() && images) await Promise.all(pages.flatMap(page => assets.view(scene, page)?.portraits || []).map(person => preload(person.url)));
  });
  return { completion };
}
