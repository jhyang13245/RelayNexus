// Wardrobe is a presentation projection of published prose, never canonical
// story state. Closed categories keep inferred outfits reusable across lines.
import { labelOccurrences } from './vn-identity.mjs';
export const outfitKinds = ['default', 'swimwear', 'sleepwear', 'formal', 'sport', 'uniform', 'outerwear', 'combat', 'custom'];
export const outfitNames = { swimwear: 'swimwear suited to swimming and beach play', sleepwear: 'comfortable sleepwear', formal: 'formal occasion clothing', sport: 'sports clothing', uniform: 'the publicly described uniform', outerwear: 'weather-appropriate outerwear', combat: 'the publicly described combat clothing', custom: 'the explicitly described outfit' };
const quotes = /[“「『‘][^”」』’]*(?:[”」』’]|$)|"[^"\n]*(?:"|$)/gu;
const narration = value => String(value || '').replace(quotes, match => ' '.repeat(match.length));
const indirect = /만약|(?:했|갔|입었|놀았)더라면|(?:간|입는|노는)다면|(?:사진|영상|기억|회상|꿈)\s*속|입었던|입던|갈아입(?:을|고\s*싶|으려|기)|(?:사진|영상|초상화).*(?:보았|봤|바라봤)|떠올렸|회상했|상상했|예정|계획|않았|않는|아니었|않기로|\b(?:if|imagined|remembered|would|planning|photograph)\b/iu;
const wardrobeCue = /수영복|래시가드|래쉬가드|비키니|잠옷|파자마|드레스|정장|예복|운동복|체육복|교복|제복|코트|외투|갑옷|전투복|갈아입|평상복|평소\s*(?:옷|복장)|기본\s*복장|물놀이|수영(?:을|하|장)|헤엄|해수욕|swim|sleepwear|pajama|pyjama|dress|uniform|changed.*clothes/iu;
const transitionCue = /다음\s*날|이튿날|며칠\s*뒤|(?:해변|바다|수영장|숙소|집|학교|교실|연회장).{0,18}(?:떠났|돌아왔|도착했|나섰)|the next (?:day|morning)|returned (?:home|to school)/iu;
const swimActivity = /수영복|래시가드|래쉬가드|비키니|물놀이|수영(?:을|하|했|해)|헤엄|해수욕|\b(?:swimsuit|swimwear|swimming|swam|bikini)\b/iu;

// Retrieve a small ordered set of verbatim earlier passages, including exits,
// so a long conversation does not erase its outfit. These are optional context,
// not instructions to put an old outfit on a present character.
export function wardrobeAnchors(scene) {
  const history = String(scene?.wardrobeHistory || scene?.previousText || '');
  const recent = String(scene?.previousText || '').slice(-3600);
  const snippets = [];
  for (const match of history.matchAll(/[^.!?。\n]+[.!?。]?/gu)) {
    const text = match[0].trim();
    if (text.length > 400 || text.length < 4 || recent.includes(text)) continue;
    if (wardrobeCue.test(narration(text)) || transitionCue.test(narration(text))) snippets.push(text);
  }
  return snippets.slice(-8);
}

export function validateOutfit(row, source) {
  if (!outfitKinds.includes(row?.kind)) return null;
  if (row.kind === 'default') return { kind: 'default', detail: '' };
  const evidence = typeof row.evidence === 'string' ? row.evidence.trim() : '';
  const visible = narration(source);
  if (!evidence || evidence.length > 600 || !visible.includes(evidence) || indirect.test(evidence)) return null;
  // A beach/location noun alone cannot justify replacing the clothes.
  if (row.kind === 'swimwear' && !swimActivity.test(evidence)) return null;
  // Only a verbatim garment phrase may specialize a category. Free-form model
  // paraphrases would create a new paid cache entry for each dialogue line.
  const detail = typeof row.detail === 'string' ? row.detail.trim().slice(0, 100) : '';
  if (detail && (!visible.includes(detail) || indirect.test(detail))) return null;
  if (row.kind === 'custom' && !detail) return null;
  return { kind: row.kind, detail };
}
export function outfitKey(outfit) {
  if (!outfit || outfit.kind === 'default' || !outfitKinds.includes(outfit.kind)) return '';
  return JSON.stringify([outfit.kind, garmentIdentity(outfit.detail)]);
}
// Only orthographic/color synonyms are interchangeable. Unknown detail is NOT
// a wildcard: a red outfit must never borrow a blue one just to save a call.
export function garmentIdentity(value) {
  return String(value || '').normalize('NFKC').toLowerCase().trim()
    .replace(/푸른(?:색)?|파란(?:색)?|파랑색/gu, '파랑').replace(/붉은(?:색)?|빨간(?:색)?|빨강색/gu, '빨강')
    .replace(/하얀|흰색?|백색/gu, '하양').replace(/검은색|검은|검정색?|흑색/gu, '검정')
    .replace(/래쉬가드/gu, '래시가드').replace(/\s+/gu, '');
}
const garments = [
  ['swimwear', /(?:원피스\s*)?수영복|래시가드|래쉬가드|비키니|swimsuit|swimwear|bikini/giu],
  ['sleepwear', /잠옷|파자마|sleepwear|pajamas?/giu],
  ['formal', /드레스|정장|예복|턱시도|dress|tuxedo/giu],
  ['sport', /운동복|체육복|sportswear|tracksuit/giu],
  ['uniform', /교복|제복|uniform/giu],
  ['outerwear', /코트|외투|패딩|coat|overcoat/giu],
  ['combat', /갑옷|전투복|armou?r|combat uniform/giu],
  ['custom', /한복|기모노|우주복|작업복|메이드복|무대\s*의상|등산복/giu],
];
const changing = /갈아입|바꿔\s*입|옷을\s*바꿨|(?:새|다른)\s*(?:옷|복장)|(?<!고\s)입었다|착용했다|\b(?:changed into|put on)\b/iu;
const wearing = /입(?:고|은|었|는|는다)|차림|걸치|착용|갈아입|wearing|wore|dressed|put on/iu;
const normalClothes = /평상복|평소\s*(?:옷|복장)|기본\s*복장|원래\s*(?:옷|복장)|사복|usual clothes|normal clothes/iu;
const colorBefore = /((?:(?:푸른(?:색)?|파란(?:색)?|붉은(?:색)?|빨간(?:색)?|하얀|흰(?:색)?|검은(?:색)?|검정(?:색)?|노란(?:색)?|분홍(?:색)?|보라(?:색)?|초록(?:색)?|녹색|남색|베이지|회색|짙은|밝은|연한)\s*)+)$/u;
const wornAfter = /^(?:(?:을|를|으로|로)\s*)?\s*(?:(?:단정하게|깔끔하게|새로|다시|막|이미)\s*)?(?:입|갈아입|걸치|걸쳤|착용|차림)|^\s+(?:on|that\s+(?:she|he)\s+(?:wore|wears))/iu;
function defaultGarment(person, garment) {
  return garmentIdentity(String(person?.publicAppearance || '') + ' ' + String(person?.publicProfile || '')).includes(garmentIdentity(garment));
}
function inferOutfit(text, person) {
  if (!text || indirect.test(text)) return null;
  if (normalClothes.test(text) && wearing.test(text)) return { kind: 'default', detail: '' };
  if (!wearing.test(text)) {
    if (swimActivity.test(text) && /물놀이|수영(?:을\s*했|했|하|을\s*즐)|헤엄|해수욕|swimming|swam/iu.test(text)
      && !/빠졌|추락|구하|구조|옷을\s*입은\s*채|교복\s*차림/iu.test(text)) return { kind: 'swimwear', detail: '' };
    return null;
  }
  // A garment carried in a bag or mentioned after the worn one is not an outfit.
  const found = garments.flatMap(([kind, pattern]) => [...text.matchAll(pattern)].filter(match => wornAfter.test(text.slice(match.index + match[0].length))
      || /(?:wearing|wore|put on|changed into)\s+(?:(?:a|an|the|blue|red|black|white|new)\s+)*$/iu.test(text.slice(0,match.index)))
    .map(match => ({ kind, match }))).sort((a,b) => b.match.index - a.match.index)[0];
  if (!found) return null;
  const { kind, match } = found, tail = text.slice(match.index + match[0].length);
  if (/^(?:을|를)?\s*벗/u.test(tail)) return { kind: 'default', detail: '' };
  const color = text.slice(0, match.index).match(colorBefore)?.[1] || '';
  if (defaultGarment(person, `${color}${match[0]}`) || !changing.test(text) && defaultGarment(person, match[0])) return { kind: 'default', detail: '' };
  return { kind, detail: color ? `${color}${match[0]}`.trim() : kind === 'custom' ? match[0] : '' };
}
function namedClauses(text, people) {
  const labels = new Map();
  for (const person of people) for (const name of [person.name, ...(person.aliases || [])].filter(name => typeof name === 'string' && name.length >= 2)) {
    const ids = labels.get(name) || new Set(); ids.add(person.id); labels.set(name, ids);
  }
  const hits = [];
  for (const [name, ids] of labels) if (ids.size === 1) for (const at of labelOccurrences(text, name)) {
    // Names used as objects/possessors cannot become the wearer of another
    // person's clothes. Ambiguous public aliases never choose an identity.
    const tail = text.slice(at + name.length);
    if (/^(?:은|는|이|가|도)(?:\s|$)|^\s/u.test(tail)) hits.push({ at, name, id: [...ids][0] });
  }
  hits.sort((a,b) => a.at - b.at || b.name.length - a.name.length);
  const unique = hits.filter((hit,i) => !i || hit.at >= hits[i-1].at + hits[i-1].name.length);
  return unique.map((hit,i) => ({ id: hit.id, text: text.slice(hit.at, unique[i+1]?.at ?? text.length) }));
}
function retainOutfit(previous, next, evidence) {
  if (!next) return previous;
  if (!previous) return next;
  if (outfitKey(previous) === outfitKey(next)) return previous;
  // A repeated description/activity cannot redesign an established costume.
  if (!changing.test(evidence) && !(next.kind !== previous.kind && wearing.test(evidence))) return previous;
  return next;
}
export function wardrobeState(source, people, initial = {}) {
  const state = { ...initial }, byId = new Map(people.map(person => [person.id, person]));
  for (const sentence of narration(source).split(/(?<=[.!?。！？])|\n/u)) {
    if (indirect.test(sentence)) continue;
    for (const clause of namedClauses(sentence, people)) {
      const outfit = inferOutfit(clause.text, byId.get(clause.id));
      const next = retainOutfit(state[clause.id], outfit, clause.text);
      if (next) state[clause.id] = next;
    }
  }
  return state;
}
export function createWardrobeReplay() {
  let signature = '', entries = [];
  return (scope, source, people) => {
    const identity = JSON.stringify([scope, people.map(p => [p.id,p.name,p.aliases,p.publicAppearance,p.publicProfile])]);
    if (identity !== signature) { signature = identity; entries = []; }
    const text = narration(source), cut = Math.max(...['\n','.','!','?','。','！','？'].map(mark => text.lastIndexOf(mark))) + 1;
    const base = entries.filter(row => row.prefix.length <= cut && text.startsWith(row.prefix)).sort((a,b) => b.prefix.length-a.prefix.length)[0];
    const prefix = text.slice(0,cut), state = wardrobeState(text.slice(base?.prefix.length || 0,cut),people,base?.state);
    if (prefix && !entries.some(row => row.prefix === prefix)) { entries.push({prefix,state}); if(entries.length>8) entries.shift(); }
    return wardrobeState(text.slice(cut),people,state);
  };
}
export function continueOutfit(previous, row, { source, current, person, people, sole = false }) {
  const proposal = validateOutfit(row, source);
  if (!proposal) return previous;
  const currentNarration = narration(current);
  let evidence = row.kind === 'default' ? currentNarration : String(row.evidence || '');
  // Historical prose has already been replayed in order; an old model guess
  // may not resurrect an outfit after changing back or changing to another one.
  if (!evidence || !currentNarration.includes(evidence)) return previous;
  const clauses = namedClauses(evidence, people), own = clauses.filter(clause => clause.id === person.id);
  if (own.length) evidence = own.map(clause => clause.text).join(' ');
  else if (clauses.length || !sole || !/^\s*(?:그녀|그)(?:는|가|도)\s/u.test(evidence)) return previous;
  const inferred = inferOutfit(evidence, person);
  if (row.kind === 'default') return inferred?.kind === 'default' ? retainOutfit(previous, inferred, evidence) : previous;
  if (!inferred || inferred.kind !== proposal.kind) return previous;
  // Keep one stable design phrase from the original establishment. A model's
  // phrase variation on later lines is not a new outfit or cache identity.
  return retainOutfit(previous, inferred, evidence);
}
export function costumeDirection(person) {
  const outfit = person?.wardrobe;
  if (!outfitKey(outfit)) return 'DEFAULT WARDROBE: retain this target character\'s established default clothes and costume accessories from the identity references and public profile.';
  return `CURRENT WARDROBE: replace the default clothes with ${outfitNames[outfit.kind]}. ${outfit.detail ? `Publicly specified garment (data): ${JSON.stringify(outfit.detail)}.` : 'Choose one coherent outfit appropriate to this character, age, personality and work; it will be reused for this situation.'} Identity references establish the person, NOT a requirement to keep their old clothes or handheld costume props. Keep the same face, apparent age, hair, eye colour, complexion and body proportions; do not copy the quality guide\'s clothes. Keep non-clothing identity features, and only keep accessories compatible with the activity. For swimwear use a practical, age-appropriate design and an ordinary standing pose; do not add books, coats, armour or irrelevant carried objects from the default outfit. No change to the character\'s age or body.`;
}
