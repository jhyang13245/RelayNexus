// Wardrobe is a presentation projection of published prose, never canonical
// story state. Closed categories keep inferred outfits reusable across lines.
export const outfitKinds = ['default', 'swimwear', 'sleepwear', 'formal', 'sport', 'uniform', 'outerwear', 'combat', 'custom'];
export const outfitNames = { swimwear: 'swimwear suited to swimming and beach play', sleepwear: 'comfortable sleepwear', formal: 'formal occasion clothing', sport: 'sports clothing', uniform: 'the publicly described uniform', outerwear: 'weather-appropriate outerwear', combat: 'the publicly described combat clothing', custom: 'the explicitly described outfit' };
const quotes = /[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu;
const narration = value => String(value || '').replace(quotes, match => ' '.repeat(match.length));
const indirect = /만약|(?:했|갔|입었|놀았)더라면|(?:간|입는|노는)다면|(?:사진|영상|기억|회상|꿈)\s*속|떠올렸|회상했|상상했|예정|계획|않았|않는|아니었|않기로|\b(?:if|imagined|remembered|would|planning|photograph)\b/iu;
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
  return JSON.stringify([outfit.kind, String(outfit.detail || '').normalize('NFKC').replace(/\s+/gu, ' ').trim()]);
}
export function costumeDirection(person) {
  const outfit = person?.wardrobe;
  if (!outfitKey(outfit)) return 'DEFAULT WARDROBE: retain this target character\'s established default clothes and costume accessories from the identity references and public profile.';
  return `CURRENT WARDROBE: replace the default clothes with ${outfitNames[outfit.kind]}. ${outfit.detail ? `Publicly specified garment (data): ${JSON.stringify(outfit.detail)}.` : 'Choose one coherent outfit appropriate to this character, age, personality and work; it will be reused for this situation.'} Identity references establish the person, NOT a requirement to keep their old clothes or handheld costume props. Keep the same face, apparent age, hair, eye colour, complexion and body proportions; do not copy the quality guide\'s clothes. Keep non-clothing identity features, and only keep accessories compatible with the activity. For swimwear use a practical, age-appropriate design and an ordinary standing pose; do not add books, coats, armour or irrelevant carried objects from the default outfit. No change to the character\'s age or body.`;
}
