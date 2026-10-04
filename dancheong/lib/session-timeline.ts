import {
  createInitialState,
  deriveEncounteredCharacterIds,
  type RuntimeState,
  type ScenarioPack,
  type TurnRecord,
} from "./scenario";
import {
  deriveRuntimeRelationsFromMemories,
  normalizeRuntimeAutonomyActors,
} from "./autonomy";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const cloneRuntimeCheckpoint = (state: RuntimeState): RuntimeState =>
  clone(state);

const visibleTurnText = (turns: TurnRecord[]): string =>
  turns.flatMap((turn) => [
    turn.userText ?? "",
    ...turn.blocks.map((block) => `${block.speakerName ?? ""} ${block.text}`),
  ]).join("\n");

/**
 * v19 and older saves did not keep private per-turn checkpoints. This one-time
 * migration reconstructs the strongest safe point available from the public
 * turn snapshot and every runtime record that carries a turn number. New turns
 * always use the exact runtimeSnapshot path below.
 */
export const reconstructLegacyRuntimeCheckpoint = (
  pack: ScenarioPack,
  currentState: RuntimeState,
  targetTurn: TurnRecord,
  retainedTurns: TurnRecord[],
): RuntimeState => {
  const initial = createInitialState(pack);
  const turnNumber = targetTurn.turn;
  const publicSnapshot = targetTurn.statusSnapshot;
  const observedText = visibleTurnText(retainedTurns).normalize("NFKC");
  const relationshipMemories = (currentState.relationshipMemories ?? [])
    .filter((memory) => memory.createdTurn <= turnNumber)
    .map((memory) => clone(memory));
  const relationPool = currentState.relations.length
    ? currentState.relations
    : initial.relations;
  const derivedRelations = pack.relationshipMemoryRuntime.enabled
    ? deriveRuntimeRelationsFromMemories(pack, relationPool, relationshipMemories)
    : clone(initial.relations);
  const publicRelations = new Map(
    (publicSnapshot?.relations ?? []).map((relation) => [relation.characterId, relation]),
  );
  const relations = derivedRelations.map((relation) => {
    const observed = publicRelations.get(relation.characterId);
    return observed
      ? {
          ...relation,
          relationType: observed.relationType || relation.relationType,
          publicTrust: observed.trust,
          trust: observed.trust,
        }
      : relation;
  });
  const initialInventory = new Set(initial.inventory);
  const inventory = currentState.inventory.filter((item) =>
    initialInventory.has(item) || observedText.includes(item.normalize("NFKC"))
  );
  const ledgerById = new Map(initial.statusLedger.map((entry) => [entry.fieldId, clone(entry)]));
  currentState.statusLedger
    .filter((entry) => entry.updatedTurn <= turnNumber)
    .forEach((entry) => ledgerById.set(entry.fieldId, clone(entry)));
  const autonomyLog = currentState.autonomyLog
    .filter((entry) => entry.turn <= turnNumber)
    .map((entry) => clone(entry));
  const autonomyActors = normalizeRuntimeAutonomyActors(pack, initial.autonomyActors)
    .map((actor) => {
      const actions = autonomyLog.filter((entry) => entry.actorId === actor.actorId);
      const latest = actions.at(-1);
      return latest
        ? {
            ...actor,
            currentLocation: latest.locationAfter || actor.currentLocation,
            lastActionTurn: latest.turn,
            actionAttempts: actions.length,
          }
        : actor;
    });
  return {
    ...initial,
    turn: turnNumber,
    day: publicSnapshot?.day ?? initial.day,
    date: publicSnapshot?.date ?? initial.date,
    weekday: publicSnapshot?.weekday ?? initial.weekday,
    time: publicSnapshot?.time ?? initial.time,
    weather: publicSnapshot?.weather ?? initial.weather,
    location: publicSnapshot?.location ?? initial.location,
    status: turnNumber >= currentState.turn ? clone(currentState.status) : clone(initial.status),
    inventory,
    relations,
    encounteredCharacterIds: deriveEncounteredCharacterIds(pack, retainedTurns),
    clocks: turnNumber >= currentState.turn ? clone(currentState.clocks) : clone(initial.clocks),
    sceneSummary: targetTurn.blocks
      .filter((block) => block.type !== "system")
      .slice(-3)
      .map((block) => block.text)
      .join(" ") || initial.sceneSummary,
    memories: currentState.memories.filter((memory) => observedText.includes(memory.normalize("NFKC"))),
    variables: currentState.variables
      .filter((variable) => variable.createdTurn <= turnNumber)
      .map((variable) => clone(variable)),
    characterVisuals: currentState.characterVisuals
      .filter((profile) => profile.introducedTurn <= turnNumber)
      .map((profile) => clone(profile)),
    statusLedger: [...ledgerById.values()],
    lastStatusChanges: [],
    autonomyActors,
    autonomyLog,
    worldFacts: currentState.worldFacts
      .filter((fact) => fact.turn <= turnNumber)
      .map((fact) => clone(fact)),
    relationshipMemories,
    lastRelationshipMemoryIds: relationshipMemories.slice(-8).map((memory) => memory.id),
    observableTraces: currentState.observableTraces
      .filter((trace) => trace.turn <= turnNumber)
      .map((trace) => clone(trace)),
    characterResearchCache: clone(currentState.characterResearchCache ?? []),
    imageEvery: currentState.imageEvery,
    imageQuality: currentState.imageQuality,
    imageResolution: currentState.imageResolution,
    imageAspect: currentState.imageAspect,
  };
};

export const attachRuntimeCheckpoints = (
  pack: ScenarioPack,
  currentState: RuntimeState,
  turns: TurnRecord[],
): TurnRecord[] => turns.map((turn, index) => {
  if (turn.runtimeSnapshot) {
    return { ...turn, runtimeSnapshot: cloneRuntimeCheckpoint(turn.runtimeSnapshot) };
  }
  const retainedTurns = turns.slice(0, index + 1);
  const runtimeSnapshot = index === 0 && turn.role === "opening"
    ? createInitialState(pack)
    : index === turns.length - 1
      ? cloneRuntimeCheckpoint(currentState)
      : reconstructLegacyRuntimeCheckpoint(pack, currentState, turn, retainedTurns);
  return { ...turn, runtimeSnapshot };
});

export const runtimeCheckpointForTurn = (
  pack: ScenarioPack,
  currentState: RuntimeState,
  turn: TurnRecord,
  retainedTurns: TurnRecord[],
): RuntimeState => {
  const checkpoint = turn.runtimeSnapshot
    ? cloneRuntimeCheckpoint(turn.runtimeSnapshot)
    : reconstructLegacyRuntimeCheckpoint(pack, currentState, turn, retainedTurns);
  // Image generation preferences are device/user choices, not story history.
  return {
    ...checkpoint,
    imageEvery: currentState.imageEvery,
    imageQuality: currentState.imageQuality,
    imageResolution: currentState.imageResolution,
    imageAspect: currentState.imageAspect,
  };
};
