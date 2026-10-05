import { writerBindings } from '../cortex-vn-writer-speakers.mjs?v=889f2cc97573';
// Presentation metadata only: the story and its canonical state remain in Cortex.
import { presentationScenario, publicAppearance, visualCharacter } from './vn-public-cast.mjs?v=889f2cc97573';
import { lightFor, placeIdentity, weatherIdentity } from './vn-environment.mjs?v=889f2cc97573';
export { lightFor } from './vn-environment.mjs?v=889f2cc97573';
export function environmentKey(scope, world) {
  // Cast, turn number and minute changes do not change an environment.
  return JSON.stringify(['vn-environment-1', scope, placeIdentity(world?.location), lightFor(world?.time), weatherIdentity(world?.weather)]);
}
export function locationAnchorKey(scope, world) {
  return JSON.stringify(['vn-place-anchor-1', scope, placeIdentity(world?.location)]);
}
export const expressions = {
  // Legacy labels for reuse/transition bookkeeping, not image drawing recipes.
  neutral: 'neutral', smile: 'smile', angry: 'angry', sad: 'sad',
  surprised: 'surprised', worried: 'worried', blush: 'blush', closed: 'closed', serious: 'serious',
};
const cues = [
  ['smile', /미소|웃었|웃음(?:을|이)|웃으며|웃는다|웃었다|빙긋|싱긋|방긋|smil/giu],
  ['angry', /노려보|노려봤|분노|이를 악물|눈살을 찌푸|화난|화가 난|격분|glare|angry/giu],
  ['sad', /눈물|울먹|슬픈|슬퍼|울었|울었다|tearful|sad/giu],
  ['surprised', /깜짝|놀라|놀랐|놀란|눈을 크게|눈이 커|경악|surpris/giu],
  ['worried', /불안|걱정|초조|긴장한|worried|anxious/giu],
  ['blush', /얼굴을 붉|얼굴이 붉|볼이 붉|홍조|수줍|blush/giu],
  ['closed', /눈을 감|눈을 지그시|eyes closed/giu],
  ['serious', /진지한|진지해|굳은 표정|표정을 굳|serious/giu],
  ['neutral', /무표정|평온한|담담한|표정을 풀|웃음을 거두|미소를 거두|neutral/giu],
];
export function expressionFrom(text) {
  let latest = null;
  for (const [expression, pattern] of cues) for (const match of String(text).matchAll(pattern)) {
    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 18);
    if (/^[^.!?。\n]{0,10}(?:않|아니|없)/u.test(tail)) continue;
    if (!latest || match.index >= latest.index) latest = { expression, index: match.index };
  }
  return latest?.expression || null;
}
export function expressionTimeline(text, characters, previous = {}) {
  // Quoted emotions are someone speaking about an emotion, not facial direction.
  const narration = String(text).replace(/[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu, value => ' '.repeat(value.length));
  const events = characters.map(person => ({ offset: 0, characterId: person.id, expression: previous[person.id] || 'neutral' }));
  for (const sentence of narration.matchAll(/[^.!?。！？\n]+/gu)) {
    const subjects = [];
    for (const person of characters) for (const name of [person.name, ...(person.aliases || [])].filter(Boolean)) {
      let at = sentence[0].indexOf(name);
      while (at >= 0) {
        const before = sentence[0].slice(0, at);
        const after = sentence[0].slice(at + name.length);
        if ((!before || /[\s,;]$/u.test(before)) && /^(?:은|는|이|가|도)(?:\s|$)/u.test(after)) subjects.push({ at, person });
        at = sentence[0].indexOf(name, at + name.length);
      }
    }
    subjects.sort((a, b) => a.at - b.at);
    for (const [index, subject] of subjects.entries()) {
      const end = subjects[index + 1]?.at ?? sentence[0].length;
      const expression = expressionFrom(sentence[0].slice(subject.at, end));
      if (expression) events.push({ offset: sentence.index + end, characterId: subject.person.id, expression });
    }
  }
  return events.sort((a, b) => a.offset - b.offset);
}
export function expressionsAt(scene, offset = Infinity) {
  return Object.fromEntries((scene?.expressions || []).filter(event => event.offset <= offset).map(event => [event.characterId, event.expression]));
}
export function portraitKey(scope, character, expression = 'neutral') {
  return JSON.stringify(['vn-portrait-1', scope, character.id, character.referenceMode, character.allowedAssetRefs, character.primaryAssetRef || '', character.portraitCacheProfile ?? character.publicProfile ?? '', expression]);
}
export const sceneVersion = 5;
export function captureScene({ scope, scenario, turn, previous, experience, priorTurns = [], timeline = false }) {
  // Persistence can run before Cortex's next display refresh. Recompute only
  // its public appearance projection on a copy, without changing canonical state.
  const originalScenario = scenario;
  scenario = { ...presentationScenario(scenario, scope, [...priorTurns, turn], experience), runtime: { ...scenario?.runtime } };
  experience.refreshPublicAppearances?.(scenario, [...priorTurns, turn]);
  const world = { ...(Number.isFinite(scenario?.world?.day) ? {day:scenario.world.day} : {}), location: String(scenario?.world?.location || ''), time: String(scenario?.world?.time || ''), weather: String(scenario?.world?.weather || '') };
  const key = environmentKey(scope, world);
  const present = new Set(scenario?.scene?.presentCharacterIds || []);
  // Final-scene reference exclusions cannot decide an earlier dialogue beat.
  // In timeline mode all publicly available identities are optional candidates;
  // the director must establish physical presence separately for every beat.
  if (timeline) for (const person of scenario?.characters || []) present.add(person.id);
  // These are reference candidates only, never automatic on-stage occupants.
  if (previous?.environmentKey === key) for (const person of previous.candidates || previous.characters || []) present.add(person.id);
  // Instant Story packages can declare an opening cast as a comma-separated
  // openingCharacters field. It is presentation input for the opening only.
  if (turn.id === 'opening') {
    const opening = scenario?.runtime?.packageContract?.openingContract || {};
    const declared = opening.openingCharacters;
    const refs = Array.isArray(declared) ? declared : String(declared || '').split(/[,;\n]/u);
    for (const ref of refs) {
      const id = typeof ref === 'object' ? ref?.id || ref?.characterId : String(ref).trim();
      if (id) present.add(id);
    }
  }
  const capsule = experience.createImageCapsule({ scenario, turn, visible: turn.text, graph: turn.commitGraph, canonicalRevision: turn.canonicalRevisionAtCommit });
  // Prose-only Cortex turns may leave the scene roster at its opening value.
  // Reuse Cortex's public prose/speaker evidence instead of requiring that roster.
  const witnessed = experience.imageCharacters?.(scenario, turn.text, turn.commitGraph, undefined, turn) || capsule?.characters || [];
  for (const person of witnessed) if (person?.id) present.add(person.id);
  const excludedNames = new Set(capsule?.excludedReferenceNames || []);
  const candidates = [scenario?.protagonist, ...(scenario?.characters || [])].filter(person => person && present.has(person.id))
    .map(person => visualCharacter(person, scenario, experience)).filter(person => person && person.referenceMode !== 'NONE')
    .filter(person => timeline || ![person.name, ...(person.aliases || [])].some(name => excludedNames.has(name)))
    .map(person => {
      const original = [scenario?.protagonist, ...(scenario?.characters || [])].find(row => row?.id === person.id);
      const images = original?.source?.images || original?.images || [];
      const primary = images.find(row => row.isPrimary) || images.find(row => /대표/u.test(row.label || '')) || images[0];
      const primaryAssetRef = person.referenceMode === 'PRIMARY' ? String(primary?.assetPath || primary?.path || primary?.ref || primary?.assetRef || '') : '';
      const priorPerson = originalScenario.characters?.find(row => row?.id === person.id);
      const priorPublic = priorPerson && priorPerson !== original ? experience.publicCharacter(priorPerson, scenario) : null;
      // Public alias/appearance improvements must not charge again for an
      // already drawn identity. Use the old approved profile for cache lookup
      // only; prompts and labels use the new public projection above.
      const cacheProfile = person.portraitCacheProfile === undefined && priorPublic?.referenceMode === person.referenceMode ? { portraitCacheProfile: priorPublic.publicProfile || '' } : {};
      return { ...person, ...cacheProfile,
        ...(original?.eventAliasScope ? { eventAliasScope: original.eventAliasScope, eventAliasText: original.eventAliasText, ...(original.eventAliasConfirmations ? { eventAliasConfirmations: original.eventAliasConfirmations } : {}), portraitCacheProfile: original.portraitCacheProfile } : {}),
        publicAppearance: publicAppearance(original, scenario, experience), primaryAssetRef: primaryAssetRef || capsule?.visualReferences?.find(row => row.characterId === person.id)?.primaryAssetRef || '' };
    });
  const priorExpressions = previous?.environmentKey === key ? expressionsAt(previous) : {};
  return { version: sceneVersion, scope, writerText: String(turn.text || ''), writerBindings: writerBindings(turn, scenario, experience), mediaTurn: turn.id === 'opening' ? 0 : priorTurns.length + 1, world, environmentKey: key, candidates, characters: [], protagonistId: scenario?.protagonist?.id,
    expressions: expressionTimeline(turn.text, candidates, priorExpressions), publicText: String(turn.text || ''), previousText: String(priorTurns.at(-1)?.text || previous?.publicText || previous?.excerpt || ''), excerpt: String(turn.text || '').slice(-1800) };
}
export function stageCast(scene, speakerId = '') {
  const cast = scene?.characters || [];
  const people = cast.filter(person => person.id !== scene.protagonistId);
  // Keep established positions stable; the protagonist is the viewpoint camera.
  const visible = people.slice(0, 3);
  const speaker = people.find(person => person.id === speakerId);
  if (speaker && !visible.includes(speaker)) visible[visible.length - 1] = speaker;
  return visible;
}
