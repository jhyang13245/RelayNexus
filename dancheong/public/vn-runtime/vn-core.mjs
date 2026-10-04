import {createCachedPages} from '../cortex-vn-page-cache.mjs?v=e0d140d50b0f';
const quotePattern = /[“「『][^”」』]*(?:[”」』]|$)/gu;

function proseChunks(source, offset, maxChars) {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const start = offset + source.indexOf(trimmed);
  const sentences = trimmed.match(/[^.!?。！？]+[.!?。！？]+[”」』]?|[^.!?。！？]+$/gu) || [trimmed];
  const chunks = [];
  let current = '';
  let currentStart = start;
  let cursor = 0;
  const flush = () => { if (current.trim()) chunks.push({ kind: 'narration', text: current.trim(), start: currentStart, end: currentStart + current.length }); current = ''; };
  for (const sentence of sentences) {
    const sentenceStart = start + cursor;
    cursor += sentence.length;
    if (current && current.length + sentence.length > maxChars) flush();
    if (!current) currentStart = sentenceStart;
    current += sentence;
    while (current.length > maxChars * 1.5) {
      let cut = current.lastIndexOf(' ', maxChars);
      if (cut < maxChars / 2) cut = maxChars;
      chunks.push({ kind: 'narration', text: current.slice(0, cut).trim(), start: currentStart, end: currentStart + cut });
      current = current.slice(cut);
      currentStart += cut;
    }
  }
  flush();
  return chunks;
}

export function pagesForTurn(turn, turnIndex, maxChars = 175) {
  const text = String(typeof turn?.displayText === 'string' ? turn.displayText : turn?.text || '');
  const annotations = Array.isArray(turn?.dialogueAnnotations) ? turn.dialogueAnnotations : [];
  const pages = [];
  const paragraphs = [...text.matchAll(/[^\n]+/gu)];
  for (const paragraph of paragraphs) {
    const source = paragraph[0];
    const base = paragraph.index || 0;
    let cursor = 0;
    for (const match of source.matchAll(quotePattern)) {
      const local = match.index || 0;
      pages.push(...proseChunks(source.slice(cursor, local), base + cursor, maxChars));
      const start = base + local;
      const annotation = annotations.find(row => !row?.bindingInvalid && Number(row?.offset) === start && String(row?.quoteText || '') === match[0]);
      const isSpeech = annotation?.quoteKind !== 'NON_SPEECH' && (annotation?.speakerName || annotation?.characterId);
      const chunks = proseChunks(match[0], start, maxChars);
      for (const chunk of chunks) pages.push({ ...chunk, quoted: true, rawText: chunk.text, kind: isSpeech ? 'dialogue' : 'narration', text: isSpeech ? chunk.text.replace(/^[“「『]|[”」』]$/gu, '') : chunk.text, speaker: isSpeech ? String(annotation.speakerName || '') : '', characterId: isSpeech ? String(annotation.characterId || '') : '' });
      cursor = local + match[0].length;
    }
    pages.push(...proseChunks(source.slice(cursor), base + cursor, maxChars));
  }
  return pages.map((page, pageIndex) => ({ ...page, turnIndex, pageIndex, turnId: String(turn?.id || `turn-${turnIndex}`) }));
}

export function backgroundFor(turns, selectedTurnIndex, coverUrl = '', openingArtUrl = '') {
  for (let i = Math.min(selectedTurnIndex, turns.length - 1); i >= 0; i--) {
    if (typeof turns[i]?.imageUrl === 'string' && turns[i].imageUrl) return { url: turns[i].imageUrl, source: 'generated', turnIndex: i };
  }
  if (openingArtUrl) return { url: openingArtUrl, source: 'opening', turnIndex: -1 };
  return { url: coverUrl, source: coverUrl ? 'cover' : 'none', turnIndex: -1 };
}

// displayText is Cortex's already published stream, after its publication gates.
// Never show an uncommitted turn.text draft just because it exists in memory.
export function readableTurnPages(turn, turnIndex, maxChars = 150) {
  const committed = turn?.status === 'COMMITTED';
  const active = ['STREAMING', 'ADJUDICATION_PENDING'].includes(turn?.status);
  if (!committed && !active) return [];
  const text = committed ? String(turn.text || '') : typeof turn.displayText === 'string' ? turn.displayText : turn.status === 'ADJUDICATION_PENDING' ? String(turn.sameTurnResume?.publicText || '') : '';
  const pages = pagesForTurn({ ...turn, text, displayText: undefined }, turnIndex, maxChars);
  return pages.map((page, index) => ({ ...page, isLive: !committed, isGrowing: turn.status === 'STREAMING' && index === pages.length - 1 }));
}

// Cortex mutates the live turn in place. Compare published values (including
// annotation edits), not object identity or string length, before reusing pages.
// Weak keys let rewinds/imported sessions release their old parsed history.
export function createPageCollector() { return createCachedPages(readableTurnPages); }
