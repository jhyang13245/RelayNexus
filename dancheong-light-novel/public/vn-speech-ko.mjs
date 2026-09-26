// Korean dialogue preparation for text-to-speech. Prose punctuation, counters
// and hanja that a reader parses silently are rewritten into what should be
// heard, and the scene's direction becomes explicit acting notes.

const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL = ['', '십', '백', '천'], LARGE = ['', '만', '억', '조'];
export function sinoKorean(value) {
  let n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return String(value);
  if (n === 0) return '영';
  const groups = [];
  while (n > 0) { groups.push(n % 10000); n = Math.floor(n / 10000); }
  let out = '';
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g]; if (!group) continue;
    let part = '';
    for (let p = 3; p >= 0; p--) {
      const d = Math.floor(group / 10 ** p) % 10; if (!d) continue;
      part += (d === 1 && p > 0 ? '' : DIGITS[d]) + SMALL[p];
    }
    // 10000 is 만, not 일만.
    out += (g === 1 && group === 1 ? '' : part) + LARGE[g];
  }
  return out;
}
const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_ONES_ATTR = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
// Native Korean numbers (1-99); the attributive form is used before counters.
export function nativeKorean(value, attributive = true) {
  const n = Math.floor(Number(value));
  if (!(n >= 1 && n <= 99)) return sinoKorean(n);
  const tens = Math.floor(n / 10), ones = n % 10;
  if (attributive && n === 20) return '스무';
  return NATIVE_TENS[tens] + (attributive ? NATIVE_ONES_ATTR : NATIVE_ONES)[ones];
}
const NATIVE_COUNTERS = ['시간', '시', '개', '명', '살', '번째', '번', '마리', '잔', '권', '장', '대', '벌', '켤레', '채', '그루', '송이', '달', '사람', '걸음', '가지', '군데', '방울', '병', '줄', '판', '통', '척'];
// Every other counter (분, 초, 년, 월, 일, 원, 층, 회, % …) is read in Sino-Korean.
const MONTH = { 6: '유월', 10: '시월' };
function readNumber(raw, counter) {
  const n = Number(raw.replace(/,/gu, ''));
  if (counter === '월' && MONTH[n]) return MONTH[n];
  if (NATIVE_COUNTERS.includes(counter) && n >= 1 && n <= 99 && !(counter === '시' && n > 24)) return nativeKorean(n, true);
  return sinoKorean(n);
}
const unit = { '%': '퍼센트', km: '킬로미터', m: '미터', cm: '센티미터', kg: '킬로그램', g: '그램' };
export function readNumbers(text) {
  return String(text)
    // 3:30 → 세 시 삼십 분
    .replace(/(\d{1,2}):(\d{2})(?!\d)/gu, (_, h, m) => `${nativeKorean(Number(h))} 시${Number(m) ? ` ${sinoKorean(Number(m))} 분` : ''}`)
    // 3.5 → 삼 점 오 (with its unit, if any)
    .replace(/(\d+)\.(\d+)\s*(퍼센트|km|cm|kg|%|m|g)?/gu, (_, a, b, u = '') => `${sinoKorean(a)} 점 ${[...b].map(d => d === '0' ? '공' : DIGITS[d]).join(' ')}${u ? ` ${unit[u] || u}` : ''}`)
    // Phone-like digit strings are read digit by digit.
    .replace(/\d{2,4}(?:-\d{3,4}){1,2}/gu, value => value.split('-').map(part => [...part].map(d => d === '0' ? '공' : DIGITS[d]).join('')).join(' '))
    .replace(/(\d[\d,]*)\s*(시간|번째|퍼센트|주년|학년|페이지|켤레|걸음|군데|사람|그루|송이|방울|마리|가지|번지|세기|km|cm|kg|[시개명살번마리잔권장대벌채달가지병줄판통척%분초년월일원층호회반쪽도차m])?/gu,
      (_, digits, counter = '') => {
        const n = Number(digits.replace(/,/gu, ''));
        // 유월/시월 already include the counter.
        if (counter === '월' && MONTH[n]) return MONTH[n];
        return `${readNumber(digits, counter)}${counter ? ` ${unit[counter] || counter}` : ''}`;
      });
}

// Rewrite prose typography into speakable Korean.
export function speakableKorean(text) {
  let s = String(text || '').trim();
  s = s.replace(/^[“「『"'‘]+|[”」』"'’]+$/gu, '');
  // Hanja glossed with Hangul keeps only the reading: 漢字(한자) / 한자(漢字).
  s = s.replace(/[㐀-鿿豈-﫿]+\s*[（(]([가-힣\s]+)[)）]/gu, '$1').replace(/([가-힣]+)\s*[（(][㐀-鿿豈-﫿]+[)）]/gu, '$1');
  // Bracketed stage directions are acted, not read aloud.
  s = s.replace(/[（(][^()（）]{1,40}[)）]/gu, ' ');
  s = s.replace(/[『』「」【】〈〉《》]/gu, '');
  // Pauses and cut-offs.
  s = s.replace(/(?:\.{3,}|…+|‥+)/gu, '…');
  s = s.replace(/\s*(?:─|―|—|--)+\s*$/gu, '…').replace(/\s*(?:─|―|—|--)+\s*/gu, ', ');
  s = s.replace(/~+/gu, '');
  // Internet laughter/crying jamo.
  s = s.replace(/ㅋ{2,}/gu, ' 크크 ').replace(/ㅎ{2,}/gu, ' 흐흐 ').replace(/[ㅠㅜ]{2,}/gu, ' ');
  s = s.replace(/[♪♩♫♬♥♡★☆※◆◇■□▲△▼▽●○◎]/gu, ' ');
  s = s.replace(/([!?])[!?]{2,}/gu, (m, a) => (m.includes('?') && m.includes('!') ? '?!' : a));
  s = readNumbers(s);
  return s.replace(/\s{2,}/gu, ' ').replace(/\s+([,.!?…])/gu, '$1').trim();
}

// Delivery cues from the narration attached to the line ("…라고 속삭였다").
const CUES = [
  [/속삭|귓속말|소곤/u, 'whispering, close and breathy'],
  [/외쳤|외치|소리쳤|소리치|고함|울부짖|절규/u, 'shouting with full voice'],
  [/중얼|웅얼|혼잣말/u, 'muttering to themself, low and half-swallowed'],
  [/흐느|울먹|울면서|눈물/u, 'tearful, voice breaking'],
  [/떨리는|떨며|떨렸/u, 'trembling voice'],
  [/웃으며|웃었다|킥킥|키득|깔깔|피식/u, 'with a light laugh in the voice'],
  [/비웃|코웃음|조소/u, 'mocking, sneering'],
  [/한숨/u, 'sighing, weary'],
  [/차갑|싸늘|냉랭|냉정/u, 'cold and flat'],
  [/다정|부드럽|상냥/u, 'gentle and kind'],
  [/단호|잘라 말|딱 잘라/u, 'firm and decisive'],
  [/머뭇|망설|말끝을 흐/u, 'hesitant, trailing off'],
  [/헐떡|숨을 몰아|숨이 차/u, 'out of breath'],
  [/다급|급히|황급/u, 'urgent and hurried'],
  [/으르렁|이를 갈|노려보/u, 'growling with suppressed anger'],
];
const EMOTION = {
  smile: 'warm, smiling tone', angry: 'angry, tense and hard-edged', sad: 'sad, subdued and heavy', surprised: 'surprised, sudden rise in pitch',
  worried: 'worried and uneasy', blush: 'embarrassed and flustered', closed: 'calm and inward', serious: 'serious and steady', neutral: 'natural conversational tone',
};
const MOOD = { tense: 'the scene is tense; keep urgency', warm: 'the scene is warm and intimate', sad: 'the scene is sorrowful', eerie: 'the scene is ominous; keep it quiet and uneasy', memory: 'this is a recollection; soft and distant', normal: '' };

export function actingNotes({ text = '', emotion = 'neutral', mood = 'normal', cue = '', emphasis = false } = {}) {
  const notes = [EMOTION[emotion] || EMOTION.neutral];
  for (const [pattern, note] of CUES) if (pattern.test(cue)) { notes.push(note); break; }
  if (MOOD[mood]) notes.push(MOOD[mood]);
  const line = String(text);
  if (/^…/u.test(line)) notes.push('begin after a small hesitation');
  if (/…$/u.test(line)) notes.push('let the end trail off');
  if ((line.match(/!/gu) || []).length >= 2 && !notes.some(n => n.includes('shout'))) notes.push('raised, emphatic');
  if (emphasis) notes.push('this is a key line; deliver it with weight and a short pause before it');
  return notes.join('; ');
}
