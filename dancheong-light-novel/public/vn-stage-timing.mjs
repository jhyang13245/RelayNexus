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
