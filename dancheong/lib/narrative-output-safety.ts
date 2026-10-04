import type { EngineTurnResponse } from "./engine";
import type { ScenarioPack } from "./scenario";
import type { StoryDrive } from "./story-director";
import { splitContractSignals } from "./contract-signals";

type PublicTurn = Omit<EngineTurnResponse, "mode" | "usage">;

export const publicTurnText = (turn: PublicTurn): string => [
  ...turn.blocks.flatMap((block) => [block.speakerName ?? "", block.text]),
  turn.statePatch.sceneSummary,
  ...(turn.statePatch.statusAdd ?? []),
  ...(turn.statePatch.statusRemove ?? []),
  ...(turn.statePatch.inventoryAdd ?? []),
  ...(turn.statePatch.inventoryRemove ?? []),
  ...(turn.statePatch.memoryAdd ?? []),
  ...(turn.statePatch.encounteredCharactersAdd ?? []).flatMap((character) => [
    character.name,
    character.relationType,
  ]),
  ...(turn.statePatch.variablesAdd ?? [])
    .filter((variable) => variable.visibility === "public")
    .flatMap((variable) => [variable.label, variable.detail]),
  ...(turn.statePatch.relationChanges ?? []).flatMap((change) => [change.reason]),
  ...(turn.statePatch.clockChanges ?? []).flatMap((change) => [change.reason]),
  ...(turn.statePatch.statusLedgerChanges ?? []).flatMap((change) => [
    change.value,
    ...change.items,
    change.grade,
    change.reason,
  ]),
  ...(turn.statePatch.autonomyActions ?? [])
    .filter((action) => action.traceVisibility !== "hidden")
    .flatMap((action) => [action.trace]),
  ...(turn.statePatch.relationshipMemoriesAdd ?? [])
    .filter((memory) => memory.visibility === "Public")
    .flatMap((memory) => [memory.title, memory.summary, memory.cause]),
  ...turn.recommendations.map((recommendation) => recommendation.label),
  ...(turn.characterVisuals ?? []).flatMap((visual) => [
    visual.characterName,
    visual.appearancePrompt,
    visual.reason,
  ]),
  turn.image.reason,
  turn.image.prompt,
].join("\n");

export const compactDisclosureTerm = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const NARRATIVE_CONTROL_LEAK_PATTERN =
  /(?:사용자(?:의)?\s*(?:직접\s*)?(?:행동|입력)|플레이어(?:가|의|에게)?\s*(?:직접\s*)?(?:판단|대응|선택|입력)|NPC(?:의)?\s*(?:독립|자율)\s*행동|새\s*대응\s*지점|다음\s*판단은\s*플레이어|현재\s*사건의\s*직접\s*결과|패키지\s*정석\s*전개|(?:routeLock|statePatch|narrativeAudit|agencyAudit|recommendations|dynamicContext)|(?:시스템|서버)\s*(?:지시|복구|판정)|이번\s*(?:응답|턴)의?\s*(?:blocks?|블록)|(?:여부|경우)에\s*따라.{0,40}(?:장면|사건|전개).{0,24}(?:진행|전개|처리)|(?:일상|후속|분기|선택지|다른)\s*장면을?\s*(?:진행|전개|처리)(?:한다|한다\.|함)?)/iu;

export const containsNarrativeControlLeak = (value: string): boolean =>
  NARRATIVE_CONTROL_LEAK_PATTERN.test(value.normalize("NFKC"));

export const narrativeControlLeaks = (turn: PublicTurn): string[] => [
  ...turn.blocks.filter((block) => block.type !== "system").map((block) => block.text),
  ...turn.recommendations.map((recommendation) => recommendation.label),
].filter(containsNarrativeControlLeak);

export const hiddenFutureEventLeaks = (
  turn: PublicTurn,
  drive: StoryDrive,
  pack: ScenarioPack,
  { allowNextEventOpening = false }: { allowNextEventOpening?: boolean } = {},
): string[] => {
  const publicKey = compactDisclosureTerm(publicTurnText(turn));
  const activeIndex = pack.events.findIndex(
    (event) => event.id === drive.routeLock.currentEventId,
  );
  const hiddenFutureNames = activeIndex >= 0
    ? pack.events.slice(activeIndex + 1)
      .filter((event) => event.visibility === "Hidden")
      .map((event) => event.name)
    : [];
  const nextEvent = activeIndex >= 0 ? pack.events[activeIndex + 1] : undefined;
  const nextFirstBeat = nextEvent
    ? [...(nextEvent.beats ?? [])].sort((left, right) => left.order - right.order)[0]
    : undefined;
  const currentResolved = turn.claudeSignals?.eventResolved === true ||
    turn.narrativeAudit?.routeEventStatus === "completed";
  const authorizedOpeningKeys = allowNextEventOpening && currentResolved && nextEvent
    ? [
        nextEvent.name,
        nextEvent.requiredItems ?? "",
        nextEvent.requiredDialogue ?? "",
        nextFirstBeat?.title ?? "",
        nextFirstBeat?.content ?? "",
        ...splitContractSignals(nextFirstBeat?.requiredSignals),
      ].map(compactDisclosureTerm).filter((term) => term.length >= 3)
    : [];
  return [...new Set([
    ...drive.routeLock.forbiddenProgression,
    ...hiddenFutureNames,
  ])].filter((futureEvent) => {
    const futureKey = compactDisclosureTerm(futureEvent);
    if (futureKey.length < 3 || !publicKey.includes(futureKey)) return false;
    return !authorizedOpeningKeys.some((allowed) =>
      allowed.includes(futureKey) || futureKey.includes(allowed)
    );
  });
};

const DETERMINISTIC_RECOVERY_PROSE_PATTERN =
  /(?:말뿐인\s*충동으로\s*끝나지\s*않았다|말뿐인\s*충동으로\s*흘려보내지\s*않고|막\s*출발하려던\s*순간|짧은\s*우회\s*끝에|손에\s*잡히는\s*결과가\s*눈앞에\s*남았다|뜻밖의\s*일을\s*먼저\s*매듭지은\s*뒤|현재\s*선택의\s*결과를\s*보존한\s*시간[·\s]*장소\s*우회)/u;

export const containsDeterministicRecoveryProse = (turn: PublicTurn): boolean =>
  DETERMINISTIC_RECOVERY_PROSE_PATTERN.test(publicTurnText(turn));

export const firstDiegeticEventSentence = (
  ...values: Array<string | undefined>
): string => {
  for (const value of values) {
    const sentence = value
      ?.split(/[.!?。！？\n]/u)
      .map((candidate) => candidate.trim())
      .find((candidate) =>
        candidate.length >= 4 && !containsNarrativeControlLeak(candidate)
      );
    if (sentence) return sentence;
  }
  return "눈앞의 상황에 분명한 변화가 생겼다";
};
