import {
  isTriggerBoundMediaAsset,
  selectScenarioMediaAsset,
  type NarrativeVariable,
  type RuntimeClock,
  type ScenarioImageTrigger,
  type ScenarioMediaAsset,
  type ScenarioPack,
} from "./scenario";

type ClockDelta = { clockId: string; delta: number };

export type ImageTriggerRuntimeContext = {
  activeEventId?: string;
  completedEventId?: string;
  currentText: string;
  sceneSummary?: string;
  userText?: string;
  day: number;
  date: string;
  time: string;
  location: string;
  clocks: RuntimeClock[];
  clockChanges?: ClockDelta[];
  variables: NarrativeVariable[];
  variablesAdd?: Array<Pick<NarrativeVariable, "id" | "label" | "detail" | "visibility">>;
  variablesResolve?: string[];
  priorMediaAssetIds?: string[];
};

export type EligibleTriggeredMedia = {
  trigger: ScenarioImageTrigger;
  asset: ScenarioMediaAsset;
};

const compact = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const conditionMatches = (condition: string, context: string): boolean => {
  const normalizedCondition = condition.normalize("NFKC").trim();
  if (!normalizedCondition) return false;
  const contextKey = compact(context);
  const clauses = normalizedCondition
    .split(/[|;\n]/u)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
  return clauses.some((clause) => {
    const clauseKey = compact(clause);
    if (clauseKey.length >= 4 && contextKey.includes(clauseKey)) return true;
    const tokens = [...new Set(clause
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/gu)
      .map(compact)
      .filter((token) => token.length >= 2))];
    if (!tokens.length) return false;
    const matched = tokens.filter((token) => contextKey.includes(token)).length;
    return matched >= Math.min(2, tokens.length) && matched / tokens.length >= 0.6;
  });
};

const packageAssetForTrigger = (
  pack: ScenarioPack,
  trigger: ScenarioImageTrigger,
): ScenarioMediaAsset | undefined => {
  const attached = [...(pack.mediaAssets ?? [])]
    .filter(
      (asset) =>
        asset.source !== "generated" &&
        isTriggerBoundMediaAsset(asset) &&
        (asset.triggerId === trigger.id ||
          (asset.triggerSourceId === trigger.sourceId && asset.kind === "scene")),
    )
    .sort((left, right) => right.priority - left.priority)[0];
  if (attached) return attached;
  if (trigger.mode === "show_package_image" && trigger.characterIds[0]) {
    return selectScenarioMediaAsset(pack, trigger.characterIds[0]);
  }
  return undefined;
};

const triggerHasFired = (
  pack: ScenarioPack,
  trigger: ScenarioImageTrigger,
  priorMediaAssetIds: Set<string>,
): boolean => (pack.mediaAssets ?? []).some(
  (asset) =>
    priorMediaAssetIds.has(asset.id) &&
    (asset.triggerId === trigger.id ||
      (asset.triggerSourceId === trigger.sourceId && isTriggerBoundMediaAsset(asset))),
);

const postClock = (
  clock: RuntimeClock,
  changes: ClockDelta[],
): number => {
  const delta = changes
    .filter((change) => change.clockId === clock.id)
    .reduce((sum, change) => sum + Math.max(-1, Math.min(1, change.delta)), 0);
  return Math.max(0, Math.min(clock.maximum, clock.current + delta));
};

const triggerConditionSatisfied = (
  pack: ScenarioPack,
  trigger: ScenarioImageTrigger,
  context: ImageTriggerRuntimeContext,
): boolean => {
  const text = [
    context.userText ?? "",
    context.currentText,
    context.sceneSummary ?? "",
    `D+${context.day}`,
    context.date,
    context.time,
    context.location,
  ].join("\n");
  const event = pack.events.find((candidate) => candidate.id === trigger.sourceId);
  const eventVisible = event
    ? [
        event.name,
        event.completionSignals,
        event.requiredDialogue,
        event.effects,
        event.onSuccess,
        event.onFailure,
      ].some((value) => conditionMatches(value ?? "", text))
    : false;
  const type = trigger.triggerType.trim().toLowerCase();

  if (type === "event_start") {
    // Mere prose mention is not an event transition. Only the director's
    // structured active-event ID may fire an event_start trigger.
    return context.activeEventId === trigger.sourceId;
  }
  if (type === "event_condition_met") {
    return context.completedEventId === trigger.sourceId ||
      (context.activeEventId === trigger.sourceId &&
        conditionMatches(event?.conditions ?? "", text));
  }
  if (type === "event_success") {
    return context.completedEventId === trigger.sourceId &&
      (!event?.onSuccess || conditionMatches(event.onSuccess, text) || eventVisible);
  }
  if (type === "event_failure") {
    return context.completedEventId === trigger.sourceId &&
      Boolean(event?.onFailure && conditionMatches(event.onFailure, text));
  }
  if (type === "clock_value" || type === "clock_completed") {
    const clock = context.clocks.find((candidate) => candidate.id === trigger.sourceId);
    if (!clock) return false;
    const current = postClock(clock, context.clockChanges ?? []);
    return type === "clock_completed"
      ? current >= clock.maximum
      : current >= trigger.threshold;
  }
  if (type === "foreshadow_revealed") {
    const addedPublic = (context.variablesAdd ?? []).some(
      (variable) =>
        variable.visibility === "public" &&
        (variable.id === trigger.sourceId ||
          conditionMatches(trigger.sourceId, `${variable.label} ${variable.detail}`)),
    );
    const existingPublic = context.variables.some(
      (variable) =>
        variable.visibility === "public" &&
        variable.status === "active" &&
        variable.id === trigger.sourceId,
    );
    return addedPublic || existingPublic ||
      (context.variablesResolve ?? []).includes(trigger.sourceId);
  }
  if (type === "story_progress") {
    return conditionMatches(trigger.storyProgress, text);
  }
  if (type === "custom_condition") {
    return conditionMatches(trigger.customCondition, text);
  }
  return false;
};

/**
 * Evaluates package image triggers on trusted runtime state. Luna never gets
 * to declare that a trigger fired; it can only provide the prose/state changes
 * that this deterministic gate validates.
 */
export const selectEligibleTriggeredMedia = (
  pack: ScenarioPack,
  context: ImageTriggerRuntimeContext,
): EligibleTriggeredMedia | undefined => {
  const priorMediaAssetIds = new Set(context.priorMediaAssetIds ?? []);
  return (pack.imageTriggers ?? [])
    .filter((trigger) => trigger.enabled)
    .filter((trigger) => !trigger.once || !triggerHasFired(pack, trigger, priorMediaAssetIds))
    .filter((trigger) => triggerConditionSatisfied(pack, trigger, context))
    .map((trigger) => ({ trigger, asset: packageAssetForTrigger(pack, trigger) }))
    .filter((candidate): candidate is EligibleTriggeredMedia => Boolean(candidate.asset))
    .sort(
      (left, right) =>
        right.trigger.priority - left.trigger.priority ||
        right.asset.priority - left.asset.priority,
    )[0];
};
