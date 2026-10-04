import type { ScenarioEvent, ScenarioPack } from "./scenario";
import { splitContractSignals } from "./contract-signals";
import { sanitizeProtectedTerms } from "./live-story-runtime";

const compact = (value: string): string =>
  value.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

const effectPhrases = (value?: string): string[] => String(value ?? "")
  .split(/(?:\||\r?\n|(?<=[.!?。！？]))/u)
  .map((part) => part.trim())
  .filter((part) => compact(part).length >= 4);

const eventGuardPhrases = (
  event: ScenarioEvent,
  completionOnly = false,
): string[] => [
  ...(completionOnly ? [] : [
    event.name,
    ...splitContractSignals(event.requiredItems),
    ...splitContractSignals(event.requiredDialogue),
  ]),
  ...splitContractSignals(event.completionSignals),
  ...effectPhrases(event.effects),
  ...effectPhrases(event.onSuccess),
];

const currentEventAuthorizedPhrases = (event?: ScenarioEvent): string[] => event
  ? [
      ...splitContractSignals(event.requiredDialogue),
      ...splitContractSignals(event.completionSignals),
      ...(event.beats ?? []).flatMap((beat) => splitContractSignals(beat.requiredSignals)),
    ]
  : [];

/**
 * High-confidence lexical guard for events that have not started yet.
 * Only the next three events are included so an imported package cannot turn
 * its full canon into an oversized regexp. A phrase explicitly required by
 * the current event remains legal as a handoff proposal; the next event's
 * actual completion or result is still guarded by its other phrases. On a
 * final closure turn the nearest event's opening vocabulary is legal so the
 * writer can bridge time/location and open its first stimulus; its completion,
 * effects and success state remain guarded.
 */
export const futureEventGuardTerms = ({
  pack,
  activeEventId,
  observedText = "",
  allowNextEventOpening = false,
}: {
  pack: ScenarioPack;
  activeEventId: string;
  observedText?: string;
  allowNextEventOpening?: boolean;
}): string[] => {
  const activeIndex = pack.events.findIndex((event) => event.id === activeEventId);
  if (activeIndex < 0) return [];
  const active = pack.events[activeIndex];
  const authorized = currentEventAuthorizedPhrases(active).map(compact).filter(Boolean);
  const observed = compact(observedText);
  return sanitizeProtectedTerms(
    pack.events.slice(activeIndex + 1, activeIndex + 4).flatMap((event, index) =>
      eventGuardPhrases(event, allowNextEventOpening && index === 0)
    ),
  ).filter((term) => {
    const key = compact(term);
    if (key.length < 4 || observed.includes(key)) return false;
    return !authorized.some((allowed) => allowed.includes(key));
  });
};
