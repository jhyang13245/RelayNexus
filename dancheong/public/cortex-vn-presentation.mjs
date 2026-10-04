// Storage namespaces are not work identities. A main-site session gets a
// hashed namespace, while the original renderer used the catalog slug.
// Apply reviewed compatibility metadata only to an exact package fingerprint.
// Authored presentation metadata is merged later and remains authoritative.
export function resolveWorkPresentation(scenario, scope, compatibility, identities) {
  const slug = String(scope || '').split(':')[0];
  if (Object.hasOwn(compatibility, slug)) return compatibility[slug];
  const characters = new Set((scenario?.characters || []).map(person => person?.id));
  const nodes = scenario?.runtime?.packageContract?.eventGraph?.nodes;
  const events = new Set((Array.isArray(nodes) ? nodes : nodes && typeof nodes === 'object' ? Object.values(nodes) : []).map(event => event?.id));
  const matches = Object.entries(identities).filter(([key, rule]) => Object.hasOwn(compatibility, key)
    && rule.requiredCharacterIds?.length && rule.requiredEventIds?.length
    && rule.requiredCharacterIds.every(id => characters.has(id))
    && rule.requiredEventIds.every(id => events.has(id)));
  return matches.length === 1 ? compatibility[matches[0][0]] : {};
}
export function publishedEventTurns(turns) {
  // Older bridge turns can carry the event only on the transaction. Never use
  // today's active event as the identity scope for a historical paragraph.
  return turns.map(turn => turn && !turn.sourceEventId && typeof turn.txn?.eventId === 'string'
    ? {...turn, sourceEventId:turn.txn.eventId} : turn);
}
