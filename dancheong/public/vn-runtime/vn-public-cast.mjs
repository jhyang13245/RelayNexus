import { resolveWorkPresentation, publishedEventTurns } from '../cortex-vn-presentation.mjs?v=ef485ae04925';
const workIdentities = {
  "fate-seoul": {
    "requiredCharacterIds": ["NPC_SERVANT_SABER_JEONGJO_TS", "NPC_SERVANT_LANCER_SCATHACH", "NPC_SERVANT_ARCHER_TESLA"],
    "requiredEventIds": ["EV_ACT1_HISHIRI_05_FAKE_LIGHTNING", "EV_ACT1_HISHIRI_06_LIGHTNING_USER", "EV_ACT1_HISHIRI_07_STRANGERS", "EV_ACT1_HISHIRI_08_SECOND_MIMIC"]
  }
}
;
// Package-authored public aliases take precedence. Old published packages can
// use the small work-keyed compatibility data file until their author updates
// the package; generic directing code contains no work or character IDs.
import { resolveEventAliases, identityLabel, labelOccurrences } from './vn-identity.mjs?v=ef485ae04925';
const compatibility = {
  "fate-seoul": {
    "publicAliases": {
      "NPC_SERVANT_SABER_JEONGJO_TS": ["소녀 검사", "소녀검사", "세이버"]
    },
    "roleNames": ["세이버", "Saber"],
    "eventPublicAliases": [
      {
        "characterId": "NPC_SERVANT_LANCER_SCATHACH",
        "eventIds": [
          "EV_ACT2_KADOC_04_RED_SPEAR",
          "EV_ACT2_KADOC_05_PROBE_DUEL",
          "EV_ACT2_KADOC_06_ENOUGH",
          "EV_ACT2_KADOC_07_SPEAR_SCAR",
          "EV_ACT2_KADOC_08_MASTER_AND_LANCER",
          "EV_ACT2_NIGHT_01_TWO_TRUTHS",
          "EV_ACT2_NIGHT_03_WORD_SPEAR",
          "EV_ACT2_NIGHT_05_SPEAR_AND_GENERAL_1",
          "EV_ACT2_NIGHT_07_RAIL_AND_FLEET",
          "EV_ACT2_NIGHT_08_LANCER_NP",
          "EV_ACT2_NIGHT_09_GENERAL_RISES",
          "EV_ACT2_NIGHT_10_COUNTER_NP",
          "EV_ACT2_NIGHT_11_DEFEAT",
          "EV_ACT2_NIGHT_12_GOLDEN_NET",
          "EV_ACT2_NIGHT_13_LAST_CHOICE"
        ],
        "name": "붉은 창의 여자",
        "aliases": ["붉은 창을 든 여자", "붉은 쌍창의 여자", "랜서", "Lancer"]
      },
      {
        "characterId": "NPC_SERVANT_ARCHER_TESLA",
        "eventIds": ["EV_ACT1_HISHIRI_05_FAKE_LIGHTNING", "EV_ACT1_HISHIRI_06_LIGHTNING_USER", "EV_ACT1_HISHIRI_07_STRANGERS", "EV_ACT1_HISHIRI_08_SECOND_MIMIC"],
        "name": "정체불명의 남자",
        "aliases": ["능선의 남자", "장신의 남자", "정체불명의 뇌전 사용자", "남자"]
      }
    ]
  }
}
;
export async function loadWorkPresentation() {}

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
  const concealedAlias = String(person.preRevealAlias || source.preRevealAlias || person.reveal?.preRevealAlias || source.revealPolicy?.preRevealAlias || '').trim();
  // An explicit public alias in the package/event is equally valid for a
  // first-appearance portrait. Missing preRevealAlias is not missing permission.
  // Never synthesize a label from a private name, role or visual resemblance.
  const alias = concealedAlias || names[0] || '';
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
  const visible = experience.publicCharacter(person, scenario)
    || (!concealedAlias && names.length ? experience.publicCharacter({ ...person, preRevealAlias: alias }, scenario) : null);
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
  turns = publishedEventTurns(turns);
  const legacy = resolveWorkPresentation(scenario, scope, compatibility, workIdentities);
  const packaged = scenario.runtime?.packageContract?.presentation || {};
  const current = scenario.presentation || {};
  // A partial package presentation (e.g. music only) must not erase its public
  // identity links. Explicit package fields, including empty arrays, still win.
  const metadata = { ...legacy, ...packaged, ...current,
    publicAliases: { ...legacy.publicAliases, ...packaged.publicAliases, ...current.publicAliases } };
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
