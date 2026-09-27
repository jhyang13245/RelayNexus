// Package-authored public aliases take precedence. Old published packages can
// use the small work-keyed compatibility data file until their author updates
// the package; generic directing code contains no work or character IDs.
import { resolveEventAliases, identityLabel, labelOccurrences } from './vn-identity.mjs';
let compatibility = {}, pending;
export function loadWorkPresentation(fetchAsset = fetch) {
  return pending ||= Promise.resolve().then(() => fetchAsset('/work-presentation.json', { cache: 'no-cache' })).then(async response => {
    const data = response.ok ? await response.json() : {};
    compatibility = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }).catch(() => { pending = undefined; });
}
const list = value => Array.isArray(value) ? value : [];
const visualProjection = Symbol('public visual projection');
const firstAppearance = /^\s*첫\s*(?:물리(?:적)?\s*)?등장\s*(?:뒤|후|이후)\s*공개\s*[:：]/u;
const conditionalDisclosure = /(?:첫\s*(?:물리(?:적)?\s*)?등장|정체\s*공개|해금|이벤트|사건).{0,30}(?:뒤|후|시점|이후).{0,12}공개|공개\s*(?:조건|시점)\s*[:：]/u;
const privateIdentity = person => {
  const source = person.source || {};
  return person.secret || source.secret
    || person.revealCondition || source.revealCondition || person.reveal?.condition || source.revealPolicy?.condition
    || /secret|hidden|private|gm|비공개/iu.test(String(person.visibility || person.disclosure || source.visibility || source.disclosure || ''));
};
// A package can expressly request its portrait on first appearance while keeping
// the real name secret. That is a visual permission, not an identity disclosure.
// Project this permission ONLY for the VN renderer; leave Cortex and its ledger
// untouched. Explicit secret/conditional gates and pre-reveal media still win.
function firstAppearanceVisual(person, scenario, names, aliases, experience) {
  const source = person.source || {};
  const alias = String(person.preRevealAlias || source.preRevealAlias || person.reveal?.preRevealAlias || source.revealPolicy?.preRevealAlias || '').trim();
  const info = String(person.publicInfo || source.publicInfo || person.publicProfile || source.publicProfile || '');
  // Some authored packages repeat the already-public registered name as the
  // pre-reveal label. Cortex treats ANY such label as guarded. With explicit
  // first-appearance art permission and no disclosure gate, that redundant
  // label must not suppress an ordinary registered person's visual candidate.
  // This does not infer identity from an occupation, appearance or prose guess.
  const samePublicName = Boolean(info.trim() && !conditionalDisclosure.test(info)
    && [person.name, source.name].some(name => identityLabel(name) === identityLabel(alias)));
  if (!alias || privateIdentity(person) || !(firstAppearance.test(info) || samePublicName)
    || (person.imageOnFirstAppearance ?? source.imageOnFirstAppearance) !== true) return null;
  const visible = experience.publicCharacter(person, scenario);
  if (!visible) return null;
  const authored = [...new Set([alias, ...names, ...(samePublicName ? experience.surfaceNames?.(person, scenario) || [] : [])]
    .map(identityLabel).filter(name => name.length >= 2 && name.length <= 60))];
  const others = [scenario.protagonist, ...list(scenario.characters)].filter(row => row && row.id !== person.id);
  const unambiguous = authored.filter(name => !others.some(other => {
    const otherSource = other.source || {};
    const labels = [...(experience.surfaceNames?.(other, scenario) || [other.name]), other.preRevealAlias, otherSource.preRevealAlias,
      ...list(other.publicAliases), ...list(otherSource.publicAliases), ...list(aliases[other.id])].filter(Boolean);
    return labels.some(label => labelOccurrences(identityLabel(label), name).length || labelOccurrences(name, identityLabel(label)).length);
  }));
  if (!unambiguous.includes(identityLabel(alias))) return null;
  const restrictedMedia = visible.referenceMode === 'PRE_REVEAL_ONLY';
  // Only authored visual fields, never the gated biography/publicInfo, are used
  // before identity reveal. Remove undisclosed names even from weapon labels.
  let appearance = String(restrictedMedia ? person.preRevealProfile || source.preRevealProfile || ''
    : person.publicAppearance || source.publicAppearance || person.appearance || source.appearance || person.preRevealProfile || source.preRevealProfile || '');
  if (visible.referenceMode !== 'PRIMARY') for (const name of [...(experience.surfaceNames?.(person, scenario) || [person.name])].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (!unambiguous.includes(identityLabel(name))) appearance = appearance.split(name).join('');
  }
  appearance = String(experience.publicText ? experience.publicText(scenario, appearance, 1600) : appearance).trim().slice(0, 1600);
  return { ...visible, aliases: [...new Set([...visible.aliases, ...unambiguous])].filter(name => name !== visible.name),
    publicProfile: visible.referenceMode === 'PRIMARY' ? visible.publicProfile : appearance,
    publicAppearance: appearance, portraitCacheProfile: 'public-first-appearance-v1',
    // No dedicated concealed-form assets: the author's explicit first-appearance
    // permission authorizes the ordinary portrait, even if no image is embedded.
    ...(!restrictedMedia ? { visualDisclosure: 'PUBLIC_APPEARANCE', referenceMode: 'PRIMARY', allowedAssetRefs: ['*'] } : {}) };
}
export function visualCharacter(person, scenario, experience) {
  return person?.[visualProjection] || experience.publicCharacter(person, scenario);
}
// Use Cortex's disclosure gate unless the author expressly permits a public
// first-appearance portrait. Gated biography is never an appearance fallback.
export function publicAppearance(person, scenario, experience) {
  if (person?.[visualProjection]) return person[visualProjection].publicAppearance;
  const source = person?.source || {};
  const appearance = person?.publicAppearance || source.publicAppearance || person?.appearance || source.appearance || '';
  if (typeof appearance !== 'string' || !appearance.trim()) return '';
  const projected = experience.publicCharacter({ ...person, publicProfile: appearance,
    source: { ...source, publicProfile: appearance } }, scenario);
  if (!projected || projected.referenceMode !== 'PRIMARY') return '';
  const visible = projected.publicProfile || '';
  return String(experience.publicText ? experience.publicText(scenario, visible, 1600) : visible).slice(0, 1600).trim();
}
export function presentationScenario(scenario, scope, turns, experience) {
  const metadata = scenario.presentation || scenario.runtime?.packageContract?.presentation || compatibility[String(scope).split(':')[0]] || {};
  const aliases = metadata.publicAliases || {};
  const published = turns.filter(turn => turn?.status === 'COMMITTED').map(turn => String(turn.text || '')).join('\n');
  // Anonymous surface labels are author-owned and local to a story event.
  // Never turn a generic "man" into a global alias or use the latest scenario
  // event while replaying an older turn.
  const eventId = String(turns.at(-1)?.sourceEventId || '');
  const bindings = resolveEventAliases(scenario, metadata, turns, experience);
  const characters = list(scenario.characters).map(person => {
    const source = person.source || {};
    const matches = bindings.filter(row => row.characterId === person.id);
    if (matches.length > 1) return person;
    const binding = matches.length === 1 ? matches[0] : null;
    const boundNames = binding ? [binding.name, ...list(binding.aliases)].filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()) : [];
    // Ambiguous author metadata must not attach one anonymous role to two people.
    const ambiguous = binding && bindings.some(row => row !== binding && row.characterId !== person.id && [row.name, ...list(row.aliases)].some(name => boundNames.includes(name)));
    if (ambiguous) return person;
    const names = binding ? boundNames : list(person.publicAliases || source.publicAliases || aliases[person.id]).filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
    const vnPublicVisual = firstAppearanceVisual(person, scenario, names, aliases, experience);
    if (vnPublicVisual) return { ...person, [visualProjection]: vnPublicVisual,
      ...(binding ? { eventAliasScope: eventId,
        eventAliasText: turns.filter(turn => turn?.status === 'COMMITTED' && binding.eventIds.includes(turn.sourceEventId)).map(turn => String(turn.text || '')).join('\n').slice(-14400),
        ...(binding.confirmations ? { eventAliasConfirmations: binding.confirmations } : {}),
        portraitCacheProfile: vnPublicVisual.portraitCacheProfile } : {}) };
    if (!names.length) return person;
    const info = String(person.publicInfo || source.publicInfo || person.publicProfile || source.publicProfile || '');
    // Only a first-appearance gate can use these public surface names. Explicit
    // identity/media restrictions remain entirely under Cortex's disclosure gate.
    const appearanceGate = firstAppearance.test(info);
    if ((!appearanceGate && experience.publicCharacter(person, scenario)?.referenceMode !== 'PRIMARY')
      || person.secret || source.secret || person.preRevealAlias || source.preRevealAlias || person.reveal?.preRevealAlias || source.revealPolicy?.preRevealAlias
      || person.revealCondition || source.revealCondition || person.reveal?.condition || source.revealPolicy?.condition
      || /secret|hidden|private|gm|비공개/iu.test(String(person.visibility || person.disclosure || source.visibility || source.disclosure || ''))) return person;
    const originalNames = experience.surfaceNames?.(person, scenario) || [person.name];
    const roles = new Set(['·', ...list(metadata.roleNames)]);
    const named = binding?.provenance.every(value => value === 'PUBLISHED_NARRATOR_IDENTITY') || !binding && originalNames.filter(name => !roles.has(name)).some(name => name && (experience.nameOffset?.(published, name) ?? published.indexOf(name)) >= 0);
    const appearance = String(person.publicAppearance || source.publicAppearance || person.appearance || source.appearance || person.publicProfile || source.publicProfile || '');
    let visibleAppearance = appearance;
    // Appearance prompts and labels do not need the unrevealed proper name.
    for (const name of [...originalNames].filter(Boolean).sort((a, b) => b.length - a.length)) visibleAppearance = visibleAppearance.split(name).join('');
    return { ...person, publicInfo: info, publicProfile: visibleAppearance.trim(),
      surfaceName: named ? person.surfaceName || source.surfaceName || person.name : names[0],
      publicAliases: [...new Set([...(binding ? [] : list(person.publicAliases || person.aliases || source.publicAliases || source.aliases)), ...names, ...(named ? originalNames : [])])],
      ...(binding ? {
        eventAliasScope: eventId,
        eventAliasText: turns.filter(turn => turn?.status === 'COMMITTED' && binding.eventIds.includes(turn.sourceEventId)).map(turn => String(turn.text || '')).join('\n').slice(-14400),
        eventAliasProvenance: binding.provenance,
        ...(binding.confirmations ? { eventAliasConfirmations: binding.confirmations } : {}),
        // Learning a proper name later must reuse the same paid portrait.
        portraitCacheProfile: person.publicProfile || source.publicProfile || '',
      } : {}) };
  });
  return { ...scenario, characters };
}
