import type {
  NarrativeVariable,
  RuntimeState,
  ScenarioEvent,
  ScenarioEventBeat,
  ScenarioPack,
} from "./scenario";
import {
  compactContractText,
  contractInventoryContainsItem,
  contractItemMentioned,
  contractSituationSatisfied,
  missingContractSignals,
  splitContractSignals,
} from "./contract-signals";

export const NEXUS_COMPOUND_BEAT_PREFIX = "RELAY_NEXUS_COMPOUND_BEAT:";

const compact = compactContractText;

const splitContractList = splitContractSignals;

export const activeSceneConstraints = (
  pack: ScenarioPack,
  activeEventId: string,
): ScenarioEvent[] =>
  (pack.constraints ?? []).filter((constraint) => {
    const targets = constraint.appliesTo ?? [];
    return targets.length === 0 || targets.includes("*") || targets.includes(activeEventId);
  });

export const sceneConstraintPrompt = (
  pack: ScenarioPack,
  activeEventId: string,
) => ({
  policy:
    "아래 항목은 사건이 아니라 현재 장면의 지속 제약이다. 사건 커서·완료 판정·봉인 대상에 절대 포함하지 말고, 적용 대상 사건을 쓰는 동안 매 턴 준수한다.",
  constraints: activeSceneConstraints(pack, activeEventId).map((constraint) => ({
    id: constraint.id,
    name: constraint.name,
    appliesTo: constraint.appliesTo ?? [],
    rules: constraint.rules?.length
      ? constraint.rules
      : [constraint.conditions, constraint.description].filter(Boolean),
  })),
});

export const compoundBeatVariableId = (eventId: string) =>
  `${NEXUS_COMPOUND_BEAT_PREFIX}${eventId}`;

export const orderedCompoundBeats = (event?: ScenarioEvent): ScenarioEventBeat[] =>
  [...(event?.beats ?? [])].sort((a, b) => a.order - b.order);

export const readCompoundBeatIndex = (
  state: RuntimeState,
  event?: ScenarioEvent,
): number => {
  const beats = orderedCompoundBeats(event);
  if (!event || beats.length === 0) return 0;
  const variable = state.variables.find(
    (candidate) =>
      candidate.id === compoundBeatVariableId(event.id) &&
      candidate.status === "active",
  );
  if (!variable) return 0;
  try {
    const detail = JSON.parse(variable.detail) as { beatIndex?: unknown };
    const index = Number(detail.beatIndex);
    return Number.isInteger(index)
      ? Math.max(0, Math.min(beats.length - 1, index))
      : 0;
  } catch {
    return 0;
  }
};

export const compoundBeatPrompt = (
  state: RuntimeState,
  event?: ScenarioEvent,
) => {
  const beats = orderedCompoundBeats(event);
  if (!event || event.kind !== "compound" || beats.length === 0) {
    return { active: false as const };
  }
  const beatIndex = readCompoundBeatIndex(state, event);
  const beat = beats[beatIndex];
  return {
    active: true as const,
    eventId: event.id,
    eventName: event.name,
    beatIndex,
    beatNumber: beatIndex + 1,
    beatTotal: beats.length,
    beat,
    policy:
      "이번 응답은 현재 비트 하나만 성립시킨다. 마지막 비트 전에는 사건 전체를 completed/resolved로 판정하지 않는다. 다음 비트나 다음 사건을 같은 응답에 섞지 않는다.",
  };
};

const beatSignalsSatisfied = (beat: ScenarioEventBeat, observedText: string) => {
  return missingContractSignals(beat.requiredSignals, observedText).length === 0;
};

export type CompoundResolutionDecision = {
  allowEventCompletion: boolean;
  advanceBeat: boolean;
  beatIndex: number;
  nextBeatIndex: number;
  reason: string;
};

export const adjudicateCompoundResolution = ({
  event,
  state,
  requestedEventResolved,
  observedText,
}: {
  event?: ScenarioEvent;
  state: RuntimeState;
  requestedEventResolved: boolean;
  observedText: string;
}): CompoundResolutionDecision => {
  const beats = orderedCompoundBeats(event);
  const beatIndex = readCompoundBeatIndex(state, event);
  if (!event || event.kind !== "compound" || beats.length === 0) {
    return {
      allowEventCompletion: requestedEventResolved,
      advanceBeat: false,
      beatIndex: 0,
      nextBeatIndex: 0,
      reason: "단일 사건",
    };
  }
  if (!requestedEventResolved) {
    return {
      allowEventCompletion: false,
      advanceBeat: false,
      beatIndex,
      nextBeatIndex: beatIndex,
      reason: "현재 비트가 아직 성립하지 않음",
    };
  }
  const currentBeat = beats[beatIndex];
  if (!beatSignalsSatisfied(currentBeat, observedText)) {
    return {
      allowEventCompletion: false,
      advanceBeat: false,
      beatIndex,
      nextBeatIndex: beatIndex,
      reason: "현재 비트의 필수 신호가 본문에 없음",
    };
  }
  const lastBeat = beatIndex >= beats.length - 1;
  return {
    allowEventCompletion: lastBeat,
    advanceBeat: !lastBeat,
    beatIndex,
    nextBeatIndex: lastBeat ? beatIndex : beatIndex + 1,
    reason: lastBeat
      ? "마지막 비트가 실제 본문에서 성립함"
      : "현재 비트만 완료되어 다음 비트로 이동함",
  };
};

export const compoundBeatProgressVariable = (
  event: ScenarioEvent,
  beatIndex: number,
  turn: number,
): NarrativeVariable => ({
  id: compoundBeatVariableId(event.id),
  label: `Nexus compound beat · ${event.name}`,
  detail: JSON.stringify({ eventId: event.id, beatIndex }),
  visibility: "hidden",
  reason: "복합 사건의 비트 순서를 서버가 단방향으로 보존",
  status: "active",
  createdTurn: turn,
});

export const requiredEventContractSatisfied = (
  event: ScenarioEvent,
  observedText: string,
  inventory: string[],
) => {
  const observed = compact(`${observedText}\n${inventory.join("\n")}`);
  const requiredItems = splitContractList(event.requiredItems);
  const requiredDialogue = event.requiredDialogue?.trim() ?? "";
  const completionSignals = splitContractList(event.completionSignals);
  return (
    requiredItems.every((item) =>
      contractInventoryContainsItem(inventory, item) ||
      contractItemMentioned(item, observedText)
    ) &&
    (!requiredDialogue || observed.includes(compact(requiredDialogue))) &&
    (completionSignals.length === 0 ||
      completionSignals.some((signal) => contractSituationSatisfied(signal, observedText)))
  );
};

export type DerailmentCoSealPlan = {
  allowed: boolean;
  sealableEventIds: string[];
  stoppedAtEventId?: string;
  reason: string;
};

/**
 * Claude-style co-sealing is deliberately narrow in Relay Nexus. It may only
 * run on a turn that the caller has already classified as an explicit
 * derailment-prevention turn, and the current event contract is checked before
 * any future event is considered. Every intermediate event must independently
 * exist in the observed prose; scanning stops at the first missing contract.
 */
export const buildDerailmentCoSealPlan = ({
  explicitDerailmentTurn,
  currentEvent,
  followingEvents,
  observedText,
  inventory,
}: {
  explicitDerailmentTurn: boolean;
  currentEvent: ScenarioEvent;
  followingEvents: ScenarioEvent[];
  observedText: string;
  inventory: string[];
}): DerailmentCoSealPlan => {
  if (!explicitDerailmentTurn) {
    return { allowed: false, sealableEventIds: [], reason: "일반 턴에서는 동반 봉인 금지" };
  }
  if (!requiredEventContractSatisfied(currentEvent, observedText, inventory)) {
    return {
      allowed: false,
      sealableEventIds: [],
      stoppedAtEventId: currentEvent.id,
      reason: "현재 사건의 필수 조건이 성립하지 않아 동반 봉인 금지",
    };
  }
  const sealableEventIds = [currentEvent.id];
  for (const event of followingEvents) {
    if (!requiredEventContractSatisfied(event, observedText, inventory)) {
      return {
        allowed: true,
        sealableEventIds,
        stoppedAtEventId: event.id,
        reason: "중간 사건의 실제 성립 지점에서 동반 봉인 정지",
      };
    }
    sealableEventIds.push(event.id);
  }
  return {
    allowed: true,
    sealableEventIds,
    reason: "모든 사건의 필수 조건이 본문에서 실제 성립함",
  };
};

/**
 * A failed rewrite is not a failed player turn. Prefer a verified correction;
 * otherwise let the caller retain the safe intent-bearing parts of the first
 * draft and rebuild only the conflicting bridge.
 */
export const selectNarrativeCandidate = <T>({
  original,
  corrected,
  correctedIsSafe,
  recover,
}: {
  original: T;
  corrected?: T;
  correctedIsSafe: boolean;
  recover: (original: T) => T;
}): T => corrected && correctedIsSafe ? corrected : recover(original);
