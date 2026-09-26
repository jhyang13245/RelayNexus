// Conservative identity plumbing. This never guesses from a role, appearance,
// gender, participant count, or an LLM confidence score, and never calls a model.
const list = value => Array.isArray(value) ? value : [];
const str = value => typeof value === 'string' ? value.trim() : '';
const esc = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
export const identityLabel = value => str(value).normalize('NFKC').replace(/\s+/gu, ' ');
const participantLabel = /남자|여자|남성|여성|소년|소녀|학생|검사|검객|조사관|교수|선생|노인|방문자|손님|점원|안내자|상인|경찰|사제|기사|인물|청년|사람|stranger|visitor|man|woman/iu;
const genericOnly = /^(?:그|그녀|그들|누군가|누구|저 사람|이 사람|상대|주인공|독자)$/u;
const safeLabel = value => {
  const label = identityLabel(value);
  return label.length >= 2 && label.length <= 60 && !/[<>⟦⟧\r\n]/u.test(label) && !/^(?:NPC_|CHARACTER_|sha256:)/iu.test(label) && !genericOnly.test(label) ? label : '';
};
export function labelOccurrences(text, name) {
  if (!name) return [];
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${esc(name)})(?=$|[^\\p{L}\\p{N}_]|(?:은|는|이|가|을|를|의|와|과|에게|에서|도|만|께|야|아)(?=$|[^\\p{L}\\p{N}_]))`, 'gu');
  return [...String(text || '').matchAll(pattern)].map(match => match.index + match[1].length);
}
const hasLabel = (text, label) => labelOccurrences(text, label).length > 0;
const withoutSpeech = text => String(text || '').replace(/[“「『][^”」』]*[”」』]|"[^"\n]*"/gu, value => ' '.repeat(value.length));
const doubtful = /아니(?:다|었다|라고|었|라)|아닌|않았|않는|않은|않다|같았|같은|닮았|닮은|처럼|인\s*줄|일지도|일\s*수|일\s*것|라고\s*생각|추측|착각|만약|가정|꿈|회상|기억|떠올|사진|영상|녹음|전화|통화|편지|대본|소설|그때|어릴|옛날|지난|어제|내일|언젠가|예정|올\s*것|올지도/u;

function eventFor(scenario, eventId) {
  const nodes = scenario?.runtime?.packageContract?.eventGraph?.nodes;
  const stored = Array.isArray(nodes) ? nodes.find(row => row?.id === eventId) : nodes?.[eventId];
  // The historical event is authoritative; never borrow a later active event.
  return stored?.id === eventId ? stored : scenario?.event?.id === eventId ? scenario.event : null;
}
function registeredPerson(ref, people) {
  const token = identityLabel(ref);
  if (!token) return null;
  const exactId = people.filter(person => person.id === token);
  if (exactId.length === 1) return exactId[0];
  const exactName = people.filter(person => [person.name, person.source?.name].some(name => identityLabel(name) === token));
  return exactName.length === 1 ? exactName[0] : null;
}

// Read ONLY explicit association syntax. Ordinary prose in an event, e.g.
// "a man appears" + one male participant, is deliberately insufficient.
function authoredTextBindings(event, people) {
  const text = typeof event?.participants === 'string' ? event.participants : '';
  const results = [];
  for (const entry of text.split(/[,;\n]/u)) {
    const match = /^\s*([^()]+?)\s*\(\s*(?:공개\s*호칭|등장\s*호칭|public\s*name)\s*[:：]\s*([^()]+?)\s*\)\s*$/iu.exec(entry);
    if (!match) continue;
    const person = registeredPerson(match[1], people), name = safeLabel(match[2]);
    if (person && name) results.push({ characterId: person.id, name, aliases: [], provenance: 'AUTHORED_PARTICIPANT_LABEL' });
  }
  return results;
}

// A narrow, affirmative narrator identification is evidence. Dialogue, a
// resemblance, speculation or a remembered identity is not. No fuzzy matching.
function narratedBindings(turns, eventId, people, scenario, experience) {
  const results = [];
  for (const turn of turns.filter(row => row?.status === 'COMMITTED' && row.sourceEventId === eventId)) {
    for (const sentence of withoutSpeech(turn.text).split(/\n\s*\n/u).filter(paragraph => !doubtful.test(paragraph)).flatMap(paragraph => paragraph.split(/[.!?。！？\n]/u)).map(str).filter(Boolean)) {
      if (sentence.length > 220 || doubtful.test(sentence)) continue;
      for (const person of people) {
        const names = [...new Set([person.name, person.source?.name].map(identityLabel).filter(Boolean))];
        for (const name of names) {
          // "금발 여학생은 김다윤이었다." / "김다윤이라는 이름의 금발 여학생이 ..."
          const equality = new RegExp(`^([^,;:：“”"'‘’]{2,45}?)(?:은|는)\\s+${esc(name)}(?:이었다|였다|이다)$`, 'u').exec(sentence);
          const introduction = new RegExp(`^${esc(name)}(?:이라는|라는)\\s+이름의\\s+([^,;:：“”"'‘’]{2,45}?)(?:이|가|은|는)\\s+`, 'u').exec(sentence);
          const label = safeLabel(equality?.[1] || introduction?.[1]);
          if (!label || !participantLabel.test(label) || !experience.validPublicSpeakerName?.(scenario, label)) continue;
          results.push({ characterId: person.id, name: label, aliases: [], provenance: 'PUBLISHED_NARRATOR_IDENTITY', proof: sentence, prior: turn !== turns.at(-1) });
        }
      }
    }
  }
  // A subsequent public correction or conflicting identification cancels an
  // automatic association. It must not survive as a sticky character alias.
  const paragraphs = turns.filter(row => row?.status === 'COMMITTED' && row.sourceEventId === eventId).flatMap(row => withoutSpeech(row.text).split(/\n\s*\n/u));
  return results.filter(row => !paragraphs.some(paragraph => doubtful.test(paragraph) && hasLabel(paragraph, row.name)));
}

export function resolveEventAliases(scenario, metadata, turns, experience) {
  const eventId = str(turns.at(-1)?.sourceEventId);
  if (!eventId) return [];
  const people = list(scenario?.characters), event = eventFor(scenario, eventId);
  const authored = [
    ...list(metadata?.eventPublicAliases).filter(row => list(row?.eventIds).includes(eventId)),
    ...list(event?.presentation?.eventPublicAliases || event?.publicAliases).map(row => ({ ...row, eventIds: [eventId] })),
    // Structured authored event participants can already carry a public name.
    ...list(event?.participants).filter(row => row && typeof row === 'object' && row.publicName).map(row => ({ characterId: row.characterId || row.id || row.characterName, name: row.publicName, aliases: row.publicAliases, eventIds: [eventId] })),
    ...authoredTextBindings(event, people).map(row => ({ ...row, eventIds: [eventId] })),
  ];
  const automatic = narratedBindings(turns, eventId, people, scenario, experience).map(row => ({ ...row, eventIds: [eventId] }));
  // Explicit author mappings remain authoritative. Do not add inferred labels
  // to an identity whose event labels have already been declared by the author.
  const authoredIds = new Set(authored.filter(row => [row.name, ...list(row.aliases)].some(safeLabel)).map(row => registeredPerson(row.characterId, people)?.id).filter(Boolean));
  const byPerson = new Map();
  for (const row of [...authored, ...automatic.filter(row => !authoredIds.has(row.characterId))]) {
    const person = registeredPerson(row.characterId, people);
    const names = [...new Set([row.name, ...list(row.aliases)].map(safeLabel).filter(Boolean))];
    if (!person || !names.length) continue;
    let binding = byPerson.get(person.id);
    if (!binding) { binding = { characterId: person.id, eventIds: [], names: [], provenance: [], confirmations: {}, priorNames: new Set() }; byPerson.set(person.id, binding); }
    binding.names.push(...names); binding.eventIds.push(...list(row.eventIds)); binding.provenance.push(row.provenance || 'AUTHORED_EVENT_ALIAS');
    if (row.proof) for (const name of names) {
      (binding.confirmations[name] ||= []).push(row.proof);
      if (row.prior) binding.priorNames.add(name);
    }
  }
  // One generic label cannot bind to two people, even when one competing label
  // is more specific ("남자" vs "다른 남자"). Include public package names too.
  const labels = [...byPerson.values()].flatMap(row => [...new Set(row.names)].map(name => ({ id: row.characterId, name })));
  for (const person of people) for (const name of experience.surfaceNames?.(person, scenario) || [person.name]) {
    if (safeLabel(name)) labels.push({ id: person.id, name: identityLabel(name) });
  }
  return [...byPerson.values()].flatMap(row => {
    const names = [...new Set(row.names)].filter(name => !labels.some(other => other.id !== row.characterId && (hasLabel(other.name, name) || hasLabel(name, other.name))));
    const confirmations = Object.fromEntries(names.filter(name => row.confirmations[name]).map(name => [name, row.priorNames.has(name) ? [] : [...new Set(row.confirmations[name])]]));
    return names.length ? [{ characterId: row.characterId, eventIds: [...new Set(row.eventIds)], name: names[0], aliases: names.slice(1), provenance: [...new Set(row.provenance)], ...(Object.keys(confirmations).length ? { confirmations } : {}) }] : [];
  });
}

// Reject unsafe evidence even if a directing model mistakenly selects it.
export function unsafePresenceEvidence(text) {
  const narration = withoutSpeech(text).trim();
  if (!narration) return true;
  return /전화(?:기)?\s*(?:너머|속)|수(?:화|신)기\s*(?:너머|속)|통화\s*중|무전기\s*(?:너머|속)|라디오\s*속|사진\s*속|영상\s*속|녹음(?:된|\s*속)|기억\s*속|회상\s*속|꿈\s*속|내일|언젠가|만약|가정|예정|올\s*것|올지도|나타날\s*것|여기에는?\s*없|현장에\s*없|자리에\s*없|모습을\s*드러내지\s*않|돌아오지\s*않|나타나지\s*않/u.test(narration);
}

export function evidenceContext(source, evidence) {
  const at = String(source).lastIndexOf(evidence);
  if (at < 0) return '';
  const head = source.slice(0, at), tail = source.slice(at + evidence.length);
  const before = head.match(/[^.!?。！？\n]*$/u)?.[0] || '';
  const after = tail.match(/^[^.!?。！？\n]*/u)?.[0] || '';
  return `${before}${evidence}${after}`.trim();
}
