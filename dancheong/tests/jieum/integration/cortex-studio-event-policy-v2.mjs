/** Cortex integration module. Accepts model decisions; never infers meaning from words. */
export const schema = "CORTEX_STUDIO_EVENT_POLICY_V2";
/** Reference integration only; does not install itself into a Cortex engine.
 * Explicit links win even when their target is earlier in the authoring array.
 * Conditions are external model/state decisions, never inferred from text/time.
 * @param {{events: Array<any>, finishedId?: string, consumedIds?: string[], eligibility?: Record<string, boolean>, seed?: number|string}} input
 */
export function selectNextEvent({ events, finishedId = "", consumedIds = [], eligibility = {} }) {
  const list = events.filter((event) => event.kind !== "constraint");
  const index = list.findIndex((event) => event.id === finishedId);
  const finished = index >= 0 ? list[index] : null;
  const explicit = finished?.nextEventId;
  const start = explicit ? list.findIndex((event) => event.id === explicit) : index + 1;
  if (explicit && start < 0) return { status: "INVALID_NEXT_EVENT", eventId: null, skippedIds: [], candidates: [] };
  const consumed = new Set(consumedIds), skippedIds = [];
  for (let i = start; i < list.length; i++) {
    const event = list[i];
    if (consumed.has(event.id) && !(explicit && i === start)) continue;
    if (event.eventPolicy?.occurrenceEnabled) {
      if (eligibility[event.id] !== true && eligibility[event.id] !== false) return { status: "NEEDS_CONDITION_REVIEW", eventId: null, candidates: [{ id: event.id, condition: event.conditions }], skippedIds };
      if (!eligibility[event.id]) { skippedIds.push(event.id); continue; }
    }
    return { status: "ACTIVE", eventId: event.id, skippedIds, candidates: [] };
  }
  return { status: "END", eventId: null, skippedIds, candidates: [] };
}

/** @param {{completedBeats: number, extensionRound?: number, closureMet?: boolean, recoveryResolved?: boolean, unresolvedRefs?: string[]}} input */
export function closureDecision({ completedBeats, extensionRound = 0, closureMet = false, recoveryResolved = false, unresolvedRefs = [] }) {
  if (completedBeats < 2) return { status: "CONTINUE", carryover: [] };
  if (closureMet) return { status: "SEALED_SUCCESS", carryover: [] };
  if (recoveryResolved) return { status: "SEALED_TRANSITION", carryover: [] };
  if (completedBeats >= 3 && extensionRound >= 2) return { status: "SEALED_FORCED_INCOMPLETE", carryover: [...new Set(unresolvedRefs)] };
  return { status: completedBeats >= 3 ? "EXTEND" : "CONTINUE", carryover: [] };
}
