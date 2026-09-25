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

export function dialogueWait(page, view, { enabled, decoded = false, bypass = false } = {}) {
  if (!enabled || bypass || (!page?.quoted && page?.kind !== 'dialogue')) return false;
  if (!view || view.castStatus !== 'ready') return true;
  // A quotation/phone voice can be attributed without a person on stage.
  if (!view.speakerId) return false;
  return !view.portraits.some(person => person.id === view.speakerId) || !decoded;
}

// Presentation attribution comes from the verified cast pass, never a stale
// writer annotation that may have guessed the nearest registered character.
export function resolvedSpeaker(page, view) {
  if (!page?.quoted && page?.kind !== 'dialogue') return page;
  const ready = view?.castStatus === 'ready';
  const speaker = ready ? view.speakerName || '' : '';
  return { ...page, speaker, characterId: ready ? view.speakerId || '' : '', speakerResolved: ready,
    kind: speaker ? 'dialogue' : 'narration', text: page.rawText || page.text };
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
  if (imagesEnabled && dialogueWait(nextPage, nextView, { enabled: true, decoded: true })) return '다음 대사의 인물 준비 중';
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
export async function prepareAhead({ scene, pages, castDirector, assets, active, generate, preload }) {
  await castDirector.prepare(scene, { generate, page: pages[0] });
  if (!active()) return { completion: Promise.resolve() };
  const completion = Promise.all(pages.map(page => assets.prepare(scene, page, { active, generate }))).then(async () => {
    if (active()) await Promise.all(pages.flatMap(page => assets.view(scene, page)?.portraits || []).map(person => preload(person.url)));
  });
  return { completion };
}
