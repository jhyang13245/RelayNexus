// Public presentation data only. Never infer stature from canvas dimensions,
// clothing, names or the amount of a body visible in a reference photograph.
export const STAGE_ANATOMY = Object.freeze({ crown: .03, eyes: .26, headWidth: .25, eyeGap: .068, faceWidth: .145, maxFallbackHeadWidth: .26, thighFraction: .65 });
const valid = cm => Number.isFinite(cm) && cm >= 60 && cm <= 300;
export function characterHeight(person = '') {
  const data = typeof person === 'object' && person ? person : { publicProfile: String(person) };
  if (valid(data.heightCm)) return data.heightCm;
  const text = [data.publicAppearance, data.publicProfile || data.profile].filter(value => typeof value === 'string').join('\n').normalize('NFKC');
  const labelled = text.match(/(?:키|신장|height)\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:cm|센티(?:미터)?)/iu);
  const plain = [...text.matchAll(/\b(\d{2,3}(?:\.\d+)?)\s*cm\b/giu)].find(match => !/(?:머리카락|머리길이|허리|가슴|소매|굽|힐|칼날|검|무기)[^.!?\n]{0,18}$/u.test(text.slice(0,match.index)));
  const metres = text.match(/(?:키|신장|height)\s*[:：]?\s*([12]\.\d{1,2})\s*(?:m\b|미터)/iu);
  const explicit = labelled || plain;
  const cm = explicit ? Number(explicit[1]) : metres ? Number(metres[1]) * 100 : NaN;
  if (valid(cm)) return cm;
  const age = Number(String(data.age || '').match(/^\s*(\d{1,3})(?:\s*세|\s*살|\s*years?\s*old)?\s*$/iu)?.[1]);
  const adult = Number.isFinite(age) && age >= 18 || /성인|중년|장년|노년|청년|[2-9]0대|\b(?:adult|middle[- ]aged|elderly)\b/iu.test(text);
  const gender = String(data.gender || '');
  const male = /남성|남자|\b(?:man|male)\b/iu.test(text) || /^(?:남|남성|남자|male|man)$/iu.test(gender);
  const female = /여성|여자|\b(?:woman|female)\b/iu.test(text) || /^(?:여|여성|여자|female|woman)$/iu.test(gender);
  return adult && male !== female ? female ? 162 : 178 : 168;
}
export function heightScale(person = '', referenceCm = 168) {
  return characterHeight(person) / (valid(referenceCm) ? referenceCm : 168);
}
// Use the publicly available roster, including people whose pixels are still
// loading. Joining/leaving a dialogue or changing the speaker cannot zoom it.
export function stageReferenceHeight(people = []) {
  return Math.max(178, ...people.map(person => characterHeight(person)));
}
export function projectStature(person, referenceCm = 178) {
  const heightCm = characterHeight(person), scale = heightScale(person, referenceCm);
  // Every normalised image ends at mid-thigh, NOT at the feet. Reconstruct the
  // offscreen leg length so all figures share one virtual ground plane. Simply
  // pinning their cropped bottoms together makes a short person float upward.
  const belowFrame = (1 - STAGE_ANATOMY.crown) * (1 - STAGE_ANATOMY.thighFraction) / STAGE_ANATOMY.thighFraction;
  return { heightCm, scale, lift: belowFrame * (scale - 1) };
}
