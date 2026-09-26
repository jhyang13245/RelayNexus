// Story typesetting for the reader: hanja with a Hangul reading becomes ruby
// (漢字(한자) → 漢字 with 한자 above; 한자(漢字) → 한자 with 漢字 above) and
// leaked markdown emphasis (*말*, **말**) becomes emphasis dots (드러냄표).
// The typewriter counts only visible base glyphs, so a partially typed ruby
// shows its base first and its reading once the base is complete.

const HANJA = '[\\u3400-\\u9fff\\uf900-\\ufaff]';
const RUBY = new RegExp(`(${HANJA}{1,12})\\s*[（(]([가-힣][가-힣\\s]{0,23})[)）]|([가-힣]{1,12})\\s*[（(](${HANJA}{1,12})[)）]`, 'gu');
const EMPHASIS = /\*\*([^*\n]{1,60})\*\*|\*([^*\n]{1,60})\*/gu;

// → { visible, segments: [{ text } | { text, ruby } | { text, dots: true }] }
export function typeset(input) {
  const source = String(input ?? ''), segments = [];
  const marks = [];
  for (const match of source.matchAll(RUBY)) marks.push({ at: match.index, end: match.index + match[0].length, text: match[1] || match[3], ruby: (match[2] || match[4]).trim() });
  for (const match of source.matchAll(EMPHASIS)) {
    const at = match.index, end = at + match[0].length;
    if (!marks.some(mark => at < mark.end && end > mark.at)) marks.push({ at, end, text: match[1] || match[2], dots: true });
  }
  marks.sort((a, b) => a.at - b.at);
  let cursor = 0;
  for (const mark of marks) {
    if (mark.at < cursor) continue;
    if (mark.at > cursor) segments.push({ text: source.slice(cursor, mark.at) });
    segments.push(mark.dots ? { text: mark.text, dots: true } : { text: mark.text, ruby: mark.ruby });
    cursor = mark.end;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor) });
  return { visible: segments.map(row => row.text).join(''), segments };
}
export const visibleText = input => typeset(input).visible;
export const hasMarkup = input => typeset(input).segments.some(row => row.ruby || row.dots);

// Render the first `count` visible glyphs of a typeset line into `element`.
export function renderTypeset(element, { segments }, count = Infinity, doc = element.ownerDocument) {
  const nodes = [];
  let left = count;
  for (const row of segments) {
    if (left <= 0) break;
    const glyphs = Array.from(row.text), shown = glyphs.slice(0, left).join('');
    left -= glyphs.length;
    if (row.ruby) {
      const ruby = doc.createElement('ruby'); ruby.append(shown);
      // The reading appears once its base is complete.
      if (shown.length === row.text.length) { const rt = doc.createElement('rt'); rt.textContent = row.ruby; ruby.append(rt); }
      nodes.push(ruby);
    } else if (row.dots) {
      const em = doc.createElement('em'); em.className = 'vn-dots'; em.textContent = shown; nodes.push(em);
    } else nodes.push(shown);
  }
  element.replaceChildren(...nodes);
}

// Reading typefaces. Web fonts load only when chosen (Google Fonts /
// jsDelivr CSS with font-display: swap); the system stack is the fallback.
export const TYPEFACES = {
  auto: { label: '기본 · NVL 명조 / ADV 고딕', css: ['https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600&display=swap', 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'] },
  gothic: { label: '고딕 · Pretendard', css: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' },
  batang: { label: '바탕 · 고운바탕', css: 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap' },
  myeongjo: { label: '명조 · Noto Serif KR', css: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&display=swap' },
  system: { label: '기기 기본 글꼴', css: '' },
};
export function loadTypeface(name, doc = globalThis.document) {
  const face = TYPEFACES[name];
  if (!face?.css || !doc?.head) return;
  for (const href of [face.css].flat()) {
    const id = `vn-typeface-${href.replace(/[^a-z0-9]+/giu, '-').slice(-60)}`;
    if (doc.getElementById(id)) continue;
    const link = doc.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = href; link.crossOrigin = 'anonymous';
    doc.head.append(link);
  }
}
