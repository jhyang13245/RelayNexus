// Package-authored public aliases take precedence. Old published packages can
// use the small work-keyed compatibility data file until their author updates
// the package; generic directing code contains no work or character IDs.
import { resolveEventAliases } from './vn-identity.mjs';
let compatibility = {}, pending;
export function loadWorkPresentation(fetchAsset = fetch) {
  return pending ||= Promise.resolve().then(() => fetchAsset('/work-presentation.json')).then(async response => {
    const data = response.ok ? await response.json() : {};
    compatibility = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }).catch(() => { pending = undefined; });
}
const list = value => Array.isArray(value) ? value : [];
// Project appearance through Cortex's same disclosure gate as the public bio.
// Never copy a raw package appearance into an unrevealed identity's prompt.
export function publicAppearance(person, scenario, experience) {
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
    if (!names.length) return person;
    const info = String(person.publicInfo || source.publicInfo || person.publicProfile || source.publicProfile || '');
    // Only a first-appearance gate can use these public surface names. Explicit
    // identity/media restrictions remain entirely under Cortex's disclosure gate.
    const appearanceGate = /^\s*첫\s*(?:물리(?:적)?\s*)?등장\s*(?:뒤|후|이후)\s*공개\s*[:：]/u.test(info);
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
