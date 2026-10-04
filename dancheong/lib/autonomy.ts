import {
  clamp,
  type AutonomyActionOutcome,
  type AutonomyActor,
  type PublicWorldTrace,
  type RelationshipMemory,
  type RelationshipMemoryEffect,
  type RuntimeAutonomyActor,
  type RuntimeChronology,
  type RuntimeRelation,
  type RuntimeState,
  type RuntimeWorldFact,
  type ScenarioPack,
} from "./scenario";

export type AutonomyCandidate = {
  actorId: string;
  entityId: string;
  entityName: string;
  isOnScreen: boolean;
  deterministicRoll: number;
  requiredOutcome: "success" | "partial" | "failure";
  definition: AutonomyActor;
  runtime: RuntimeAutonomyActor;
};

export type AutonomyActionPatch = {
  actorId: string;
  intent: string;
  outcome: "success" | "partial" | "failure" | "blocked";
  locationAfter: string;
  resourcesAfter: string;
  currentPlanAfter: string;
  nextActionAfter: string;
  evidenceUsed: string[];
  resourcesSpent: string[];
  worldMutations: string[];
  knowledgeAdd: string[];
  misinformationRemove: string[];
  trace: string;
  traceVisibility: "hidden" | "observable" | "rumor" | "discovered";
  reason: string;
  travelJustification: string;
};

export type RelationshipMemoryPatch = {
  id: string;
  relationId: string;
  sourceId: string;
  targetId: string;
  eventId: string;
  type: RelationshipMemory["type"];
  title: string;
  summary: string;
  cause: string;
  visibility: RelationshipMemory["visibility"];
  importance: number;
  permanence: RelationshipMemory["permanence"];
  effects: RelationshipMemoryEffect;
  unresolved: boolean;
  resolutionConditions: string;
  tags: string;
};

const cleanText = (value: unknown, maximum: number): string =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const cleanItems = (value: unknown, maximum = 12): string[] =>
  [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => cleanText(item, 300))
      .filter(Boolean),
  )].slice(0, maximum);

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const entityName = (pack: ScenarioPack, actor: AutonomyActor): string => {
  if (actor.entityType === "faction") {
    return pack.factions.find((faction) => faction.id === actor.entityId)?.name ||
      actor.entityId;
  }
  return pack.npcs.find((npc) => npc.id === actor.entityId)?.name || actor.entityId;
};

const sameLocation = (left: string, right: string): boolean => {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
};

export const normalizeRuntimeAutonomyActors = (
  pack: ScenarioPack,
  entries: RuntimeAutonomyActor[] | undefined,
): RuntimeAutonomyActor[] => {
  const saved = new Map(
    (entries ?? []).filter((entry) => entry?.actorId).map((entry) => [
      entry.actorId,
      entry,
    ] as const),
  );
  return (pack.autonomyActors ?? []).map((actor) => {
    const entry = saved.get(actor.id);
    return {
      actorId: actor.id,
      entityType: actor.entityType,
      entityId: actor.entityId,
      enabled: entry?.enabled ?? actor.enabled,
      currentLocation: cleanText(entry?.currentLocation, 500) || actor.currentLocation,
      resources: cleanText(entry?.resources, 1600) || actor.resources,
      currentPlan: cleanText(entry?.currentPlan, 1200) || actor.currentPlan,
      nextAction: cleanText(entry?.nextAction, 1200) || actor.nextAction,
      knowledge: cleanText(entry?.knowledge, 3000) || actor.knowledge,
      misinformation: cleanText(entry?.misinformation, 2000) || actor.misinformation,
      lastActionTurn: Number.isFinite(entry?.lastActionTurn)
        ? Number(entry?.lastActionTurn)
        : -1,
      actionAttempts: Number.isFinite(entry?.actionAttempts)
        ? Math.max(0, Number(entry?.actionAttempts))
        : 0,
    };
  });
};

export const normalizeRuntimeRelationshipMemories = (
  pack: ScenarioPack,
  entries: RelationshipMemory[] | undefined,
): RelationshipMemory[] => {
  const merged = new Map(
    (pack.initialRelationshipMemories ?? []).map((memory) => [
      memory.id,
      { ...memory, effects: { ...memory.effects } },
    ] as const),
  );
  (entries ?? []).forEach((memory) => {
    if (!memory?.id) return;
    merged.set(memory.id, {
      ...memory,
      title: cleanText(memory.title, 240),
      summary: cleanText(memory.summary, 800),
      cause: cleanText(memory.cause, 800),
      effects: {
        trust: clamp(Number(memory.effects?.trust) || 0, -100, 100),
        favor: clamp(Number(memory.effects?.favor) || 0, -100, 100),
        fear: clamp(Number(memory.effects?.fear) || 0, -100, 100),
        respect: clamp(Number(memory.effects?.respect) || 0, -100, 100),
        suspicion: clamp(Number(memory.effects?.suspicion) || 0, -100, 100),
        hostility: clamp(Number(memory.effects?.hostility) || 0, -100, 100),
        dependency: clamp(Number(memory.effects?.dependency) || 0, -100, 100),
      },
      createdTurn: Number.isFinite(memory.createdTurn) ? memory.createdTurn : 0,
    });
  });
  return [...merged.values()].slice(-800);
};

export const normalizeRuntimeRelations = (
  pack: ScenarioPack,
  entries: RuntimeRelation[] | undefined,
): RuntimeRelation[] => (entries ?? []).map((entry) => {
  const baseline = pack.relations.find((relation) => relation.id === entry.relationId) ??
    pack.relations.find((relation) =>
      (relation.sourceId === entry.characterId && relation.targetId === pack.player.id) ||
      (relation.targetId === entry.characterId && relation.sourceId === pack.player.id));
  const sourceId = entry.sourceId || baseline?.sourceId || entry.characterId;
  const targetId = entry.targetId || baseline?.targetId || pack.player.id;
  return {
    ...entry,
    relationId: entry.relationId || baseline?.id ||
      `RUNTIME_${sourceId}_${targetId}`,
    sourceId,
    targetId,
    publicTrust: Number.isFinite(entry.publicTrust)
      ? entry.publicTrust
      : Number(entry.trust) || 0,
    fear: Number(entry.fear) || 0,
    dependency: Number(entry.dependency) || 0,
  };
});

const actionIsDue = (
  actor: AutonomyActor,
  runtime: RuntimeAutonomyActor,
  nextTurn: number,
  factionTickTurns: number,
  isTriggered: boolean,
): boolean => {
  if (actor.activityTier === "event_only" || actor.actionCadence === "on_trigger") {
    return isTriggered;
  }
  const elapsed = runtime.lastActionTurn < 0
    ? Number.POSITIVE_INFINITY
    : nextTurn - runtime.lastActionTurn;
  if (actor.entityType === "faction" && elapsed < factionTickTurns) return false;
  if (actor.actionCadence === "every_turn") return elapsed >= 1;
  if (actor.actionCadence === "every_2_turns") {
    if (runtime.lastActionTurn >= 0) return elapsed >= 2;
    return (nextTurn + stableHash(actor.id)) % 2 === 0;
  }
  const interval = 3 + stableHash(actor.id) % 3;
  if (runtime.lastActionTurn >= 0) return elapsed >= interval;
  return nextTurn >= interval || (nextTurn + stableHash(actor.id)) % interval === 0;
};

const seededOutcome = (
  pack: ScenarioPack,
  actor: AutonomyActor,
  runtime: RuntimeAutonomyActor,
  nextTurn: number,
  isOnScreen: boolean,
): { roll: number; outcome: "success" | "partial" | "failure" } => {
  const seed = pack.autonomyRuntime.deterministicSeed
    ? pack.randomSeed
    : pack.randomSeed + statefulFallback(nextTurn);
  const roll = stableHash(
    `${seed}:${nextTurn}:${actor.id}:${runtime.actionAttempts + 1}`,
  ) % 100 + 1;
  const thresholds = {
    low: [68, 92],
    moderate: [58, 86],
    high: [48, 79],
    extreme: [38, 70],
  }[actor.riskTolerance];
  let outcome: "success" | "partial" | "failure" = roll <= thresholds[0]
    ? "success"
    : roll <= thresholds[1]
      ? "partial"
      : "failure";
  if (
    outcome === "failure" &&
    ((!isOnScreen && (!actor.canFailOffscreen || !pack.autonomyRuntime.allowOffscreenFailure)))
  ) {
    outcome = "partial";
  }
  return { roll, outcome };
};

const statefulFallback = (turn: number) => (turn * 7919) % 104729;

export const selectAutonomyCandidates = (
  pack: ScenarioPack,
  state: RuntimeState,
  userText: string,
): AutonomyCandidate[] => {
  if (!pack.autonomyRuntime?.enabled) return [];
  const runtimeById = new Map(
    normalizeRuntimeAutonomyActors(pack, state.autonomyActors).map((actor) => [
      actor.actorId,
      actor,
    ] as const),
  );
  const nextTurn = state.turn + 1;
  const triggerContext = [
    userText,
    state.sceneSummary,
    ...(state.variables ?? []).filter((item) => item.status === "active").map(
      (item) => `${item.label} ${item.detail}`,
    ),
  ].join(" ").normalize("NFKC").toLowerCase();
  const candidates = (pack.autonomyActors ?? [])
    .filter((actor) => actor.enabled && runtimeById.get(actor.id)?.enabled)
    .flatMap((actor) => {
      const runtime = runtimeById.get(actor.id);
      if (!runtime) return [];
      const name = entityName(pack, actor);
      const isOnScreen = sameLocation(runtime.currentLocation, state.location) ||
        (actor.entityType === "character" &&
          (state.encounteredCharacterIds ?? []).includes(actor.entityId) &&
          userText.includes(name));
      const isTriggered = triggerContext.includes(name.toLowerCase()) ||
        triggerContext.includes(actor.entityId.toLowerCase()) ||
        isOnScreen;
      if (!actor.offscreenEnabled && !isOnScreen) return [];
      if (!actionIsDue(
        actor,
        runtime,
        nextTurn,
        pack.autonomyRuntime.factionTickTurns,
        isTriggered,
      )) return [];
      const resolution = seededOutcome(pack, actor, runtime, nextTurn, isOnScreen);
      const staleTurns = runtime.lastActionTurn < 0
        ? 6
        : Math.max(0, nextTurn - runtime.lastActionTurn);
      const score = actor.goalPriority +
        (isOnScreen ? 20 : 0) +
        (triggerContext.includes(name.toLowerCase()) ? 12 : 0) +
        Math.min(12, staleTurns * 2) +
        (stableHash(`${actor.id}:${nextTurn}`) % 100) / 1000;
      return [{
        candidate: {
          actorId: actor.id,
          entityId: actor.entityId,
          entityName: name,
          isOnScreen,
          deterministicRoll: resolution.roll,
          requiredOutcome: resolution.outcome,
          definition: actor,
          runtime,
        } satisfies AutonomyCandidate,
        score,
      }];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, pack.autonomyRuntime.maxActionsPerTurn)
    .map((item) => item.candidate);
  return candidates;
};

export const sanitizeAutonomyActionPatches = (
  pack: ScenarioPack,
  state: RuntimeState,
  candidates: AutonomyCandidate[],
  actions: AutonomyActionPatch[] | undefined,
): AutonomyActionPatch[] => {
  const candidatesById = new Map(candidates.map((candidate) => [
    candidate.actorId,
    candidate,
  ] as const));
  const seen = new Set<string>();
  const sanitized: AutonomyActionPatch[] = [];
  for (const raw of actions ?? []) {
    const candidate = candidatesById.get(cleanText(raw?.actorId, 160));
    if (!candidate || seen.has(candidate.actorId)) continue;
    seen.add(candidate.actorId);
    const requestedOutcome = raw.outcome === "blocked"
      ? "blocked"
      : candidate.requiredOutcome;
    const locationBefore = candidate.runtime.currentLocation;
    const requestedLocation = cleanText(raw.locationAfter, 500) || locationBefore;
    const travelJustification = cleanText(raw.travelJustification, 600);
    const locationAfter = pack.autonomyRuntime.requireTravelTime &&
        !sameLocation(locationBefore, requestedLocation) &&
        !travelJustification
      ? locationBefore
      : requestedLocation;
    let traceVisibility = ["observable", "rumor", "discovered"].includes(
      raw.traceVisibility,
    )
      ? raw.traceVisibility
      : "hidden";
    if (!candidate.definition.revealTraces) traceVisibility = "hidden";
    if (
      pack.autonomyRuntime.tracePolicy === "silent_until_discovered" &&
      !(traceVisibility === "discovered" && candidate.isOnScreen)
    ) {
      traceVisibility = "hidden";
    }
    if (
      pack.autonomyRuntime.tracePolicy === "observable_only" &&
      traceVisibility === "rumor"
    ) {
      traceVisibility = "hidden";
    }
    sanitized.push({
      actorId: candidate.actorId,
      intent: cleanText(raw.intent, 800) || candidate.runtime.nextAction ||
        candidate.definition.nextAction,
      outcome: requestedOutcome,
      locationAfter,
      resourcesAfter: cleanText(raw.resourcesAfter, 1600),
      currentPlanAfter: cleanText(raw.currentPlanAfter, 1200),
      nextActionAfter: cleanText(raw.nextActionAfter, 1200),
      evidenceUsed: cleanItems(raw.evidenceUsed),
      resourcesSpent: cleanItems(raw.resourcesSpent),
      worldMutations: cleanItems(raw.worldMutations),
      knowledgeAdd: cleanItems(raw.knowledgeAdd),
      misinformationRemove: cleanItems(raw.misinformationRemove),
      trace: cleanText(raw.trace, 1000),
      traceVisibility: traceVisibility as AutonomyActionPatch["traceVisibility"],
      reason: cleanText(raw.reason, 800),
      travelJustification,
    });
  }
  return sanitized.slice(0, pack.autonomyRuntime.maxActionsPerTurn);
};

export const applyAutonomyActionPatches = (
  pack: ScenarioPack,
  state: RuntimeState,
  actions: AutonomyActionPatch[] | undefined,
  chronology: RuntimeChronology = state,
): {
  actors: RuntimeAutonomyActor[];
  log: AutonomyActionOutcome[];
  facts: RuntimeWorldFact[];
  traces: PublicWorldTrace[];
} => {
  const definitions = new Map(
    (pack.autonomyActors ?? []).map((actor) => [actor.id, actor] as const),
  );
  const actors = new Map(
    normalizeRuntimeAutonomyActors(pack, state.autonomyActors).map((actor) => [
      actor.actorId,
      actor,
    ] as const),
  );
  const newLog: AutonomyActionOutcome[] = [];
  const newFacts: RuntimeWorldFact[] = [];
  const newTraces: PublicWorldTrace[] = [];
  const seen = new Set<string>();
  for (const action of (actions ?? []).slice(0, pack.autonomyRuntime.maxActionsPerTurn)) {
    const actor = actors.get(action.actorId);
    const definition = definitions.get(action.actorId);
    if (!actor || !definition || seen.has(action.actorId)) continue;
    seen.add(action.actorId);
    const attempt = actor.actionAttempts + 1;
    const id = `AUTOLOG_${state.turn + 1}_${action.actorId}_${attempt}`;
    const traceVisibility = ["observable", "rumor", "discovered"].includes(
      action.traceVisibility,
    ) && definition.revealTraces
      ? action.traceVisibility
      : "hidden";
    const outcome: AutonomyActionOutcome = {
      id,
      actorId: action.actorId,
      turn: state.turn + 1,
      day: chronology.day,
      date: chronology.date,
      weekday: chronology.weekday,
      time: chronology.time,
      intent: cleanText(action.intent, 800),
      outcome: ["success", "partial", "failure", "blocked"].includes(action.outcome)
        ? action.outcome
        : "blocked",
      locationBefore: actor.currentLocation,
      locationAfter: cleanText(action.locationAfter, 500) || actor.currentLocation,
      resourcesSpent: cleanItems(action.resourcesSpent),
      evidenceUsed: cleanItems(action.evidenceUsed),
      worldMutations: cleanItems(action.worldMutations),
      trace: cleanText(action.trace, 1000),
      traceVisibility: traceVisibility as AutonomyActionOutcome["traceVisibility"],
      reason: cleanText(action.reason, 800),
    };
    newLog.push(outcome);
    outcome.worldMutations.forEach((mutation, mutationIndex) => {
      newFacts.push({
        id: `WORLD_${id}_${mutationIndex + 1}`,
        actorId: action.actorId,
        turn: state.turn + 1,
        day: chronology.day,
        date: chronology.date,
        weekday: chronology.weekday,
        time: chronology.time,
        text: mutation,
      });
    });
    const knowledgeAdd = cleanItems(action.knowledgeAdd).join("\n");
    let misinformation = actor.misinformation;
    cleanItems(action.misinformationRemove).forEach((item) => {
      misinformation = misinformation.replaceAll(item, "").trim();
    });
    actors.set(action.actorId, {
      ...actor,
      currentLocation: outcome.locationAfter,
      resources: cleanText(action.resourcesAfter, 1600) || actor.resources,
      currentPlan: cleanText(action.currentPlanAfter, 1200) || actor.currentPlan,
      nextAction: cleanText(action.nextActionAfter, 1200) || actor.nextAction,
      knowledge: [actor.knowledge, knowledgeAdd].filter(Boolean).join("\n").slice(-3000),
      misinformation,
      lastActionTurn: state.turn + 1,
      actionAttempts: attempt,
    });
    if (outcome.trace && outcome.traceVisibility !== "hidden") {
      newTraces.push({
        id: `TRACE_${id}`,
        turn: state.turn + 1,
        day: chronology.day,
        date: chronology.date,
        weekday: chronology.weekday,
        time: chronology.time,
        text: outcome.trace,
        kind: outcome.traceVisibility,
      });
    }
  }
  return {
    actors: [...actors.values()],
    log: [...(state.autonomyLog ?? []), ...newLog].slice(-240),
    facts: [...(state.worldFacts ?? []), ...newFacts].slice(-160),
    traces: [...(state.observableTraces ?? []), ...newTraces].slice(-80),
  };
};

const validMemoryType = (value: string): value is RelationshipMemory["type"] =>
  [
    "promise_kept",
    "promise_broken",
    "rescue",
    "betrayal",
    "debt",
    "secret_shared",
    "humiliation",
    "shared_success",
    "shared_failure",
    "custom",
  ].includes(value);

export const sanitizeRelationshipMemoryPatches = (
  pack: ScenarioPack,
  state: RuntimeState,
  patches: RelationshipMemoryPatch[] | undefined,
): RelationshipMemory[] => {
  if (!pack.relationshipMemoryRuntime?.enabled) return [];
  const relations = new Map(pack.relations.map((relation) => [relation.id, relation]));
  const validEntities = new Set([
    pack.player.id,
    ...pack.npcs.map((npc) => npc.id),
    ...pack.factions.map((faction) => faction.id),
  ]);
  const entityIsValid = (id: string) =>
    validEntities.has(id) || /^dynamic-[\p{L}\p{N}-]+$/u.test(id);
  const existingIds = new Set((state.relationshipMemories ?? []).map((memory) => memory.id));
  const additions: RelationshipMemory[] = [];
  for (const [index, raw] of (patches ?? []).entries()) {
    const relation = relations.get(cleanText(raw?.relationId, 160)) ??
      pack.relations.find(
        (candidate) =>
          candidate.sourceId === raw?.sourceId && candidate.targetId === raw?.targetId,
      );
    const sourceId = relation?.sourceId || cleanText(raw?.sourceId, 160);
    const targetId = relation?.targetId || cleanText(raw?.targetId, 160);
    if (
      !sourceId ||
      !targetId ||
      sourceId === targetId ||
      !entityIsValid(sourceId) ||
      !entityIsValid(targetId)
    ) continue;
    const baseId = cleanText(raw?.id, 180) ||
      `MEM_T${state.turn + 1}_${sourceId}_${targetId}_${index + 1}`;
    const id = existingIds.has(baseId)
      ? `${baseId}_T${state.turn + 1}_${index + 1}`
      : baseId;
    existingIds.add(id);
    const effect = (key: keyof RelationshipMemoryEffect) =>
      clamp(Number(raw?.effects?.[key]) || 0, -30, 30);
    const typeValue = cleanText(raw?.type, 60);
    const permanence = ["temporary", "decaying", "permanent"].includes(
      raw?.permanence,
    )
      ? raw.permanence
      : "decaying";
    const title = cleanText(raw?.title, 240);
    const cause = cleanText(raw?.cause, 800);
    const summary = cleanText(raw?.summary, 800);
    if (!title || (!cause && !summary)) continue;
    additions.push({
      id,
      relationId: relation?.id || cleanText(raw?.relationId, 160),
      sourceId,
      targetId,
      turnLabel: `TURN ${state.turn + 1} · D+${state.day}`,
      eventId: cleanText(raw?.eventId, 160),
      type: validMemoryType(typeValue) ? typeValue : "custom",
      title,
      summary,
      cause,
      visibility: raw?.visibility === "Public" ? "Public" : "Hidden",
      importance: clamp(Number(raw?.importance) || 50, 0, 100),
      permanence: permanence as RelationshipMemory["permanence"],
      effects: {
        trust: effect("trust"),
        favor: effect("favor"),
        fear: effect("fear"),
        respect: effect("respect"),
        suspicion: effect("suspicion"),
        hostility: effect("hostility"),
        dependency: effect("dependency"),
      },
      active: true,
      unresolved: Boolean(raw?.unresolved),
      resolutionConditions: cleanText(raw?.resolutionConditions, 800),
      tags: cleanText(raw?.tags, 400),
      createdAt: "",
      createdTurn: state.turn + 1,
    });
    if (additions.length >= 8) break;
  }
  return additions;
};

export const applyRelationshipMemoryPatches = (
  pack: ScenarioPack,
  state: RuntimeState,
  additions: RelationshipMemory[] | undefined,
  resolveIds: string[] | undefined,
): { memories: RelationshipMemory[]; addedIds: string[] } => {
  const resolved = new Set(cleanItems(resolveIds, 20));
  const memories = normalizeRuntimeRelationshipMemories(
    pack,
    state.relationshipMemories,
  ).map((memory) => resolved.has(memory.id)
    ? { ...memory, active: false, unresolved: false }
    : memory);
  const existing = new Set(memories.map((memory) => memory.id));
  const accepted = (additions ?? []).filter((memory) => {
    if (!memory?.id || existing.has(memory.id)) return false;
    existing.add(memory.id);
    return true;
  });
  return {
    memories: [...memories, ...accepted].slice(-800),
    addedIds: accepted.map((memory) => memory.id),
  };
};

const effectSum = (
  memories: RelationshipMemory[],
  relationId: string,
  sourceId: string,
  targetId: string,
  key: keyof RelationshipMemoryEffect,
  publicOnly = false,
  maximum = Number.POSITIVE_INFINITY,
) => memories
  .filter(
    (memory) =>
      memory.active &&
      (!publicOnly || memory.visibility === "Public") &&
      (memory.relationId === relationId ||
        (memory.sourceId === sourceId && memory.targetId === targetId)),
  )
  .sort((left, right) =>
    Number(right.unresolved) - Number(left.unresolved) ||
    Number(right.permanence === "permanent") -
      Number(left.permanence === "permanent") ||
    right.importance - left.importance ||
    right.createdTurn - left.createdTurn,
  )
  .slice(0, maximum)
  .reduce((sum, memory) => sum + memory.effects[key], 0);

export const deriveRuntimeRelationsFromMemories = (
  pack: ScenarioPack,
  relationPool: RuntimeRelation[],
  memories: RelationshipMemory[],
): RuntimeRelation[] => relationPool.map((runtime) => {
  const baseline = pack.relations.find((relation) => relation.id === runtime.relationId) ??
    pack.relations.find(
      (relation) =>
        relation.sourceId === runtime.sourceId && relation.targetId === runtime.targetId,
    );
  const base = {
    trust: baseline?.trust ?? 0,
    favor: baseline?.favor ?? 0,
    fear: baseline?.fear ?? 0,
    respect: baseline?.respect ?? 0,
    suspicion: baseline?.suspicion ?? 0,
    hostility: baseline?.hostility ?? 0,
    dependency: baseline?.dependency ?? 0,
  };
  const score = (key: keyof RelationshipMemoryEffect) => clamp(
    base[key] + effectSum(
      memories,
      runtime.relationId,
      runtime.sourceId,
      runtime.targetId,
      key,
      false,
      pack.relationshipMemoryRuntime.maxActiveMemoriesPerRelation,
    ),
    -100,
    100,
  );
  return {
    ...runtime,
    trust: score("trust"),
    publicTrust: clamp(
      base.trust + effectSum(
        memories,
        runtime.relationId,
        runtime.sourceId,
        runtime.targetId,
        "trust",
        true,
        pack.relationshipMemoryRuntime.maxActiveMemoriesPerRelation,
      ),
      -100,
      100,
    ),
    favor: score("favor"),
    fear: score("fear"),
    respect: score("respect"),
    suspicion: score("suspicion"),
    hostility: score("hostility"),
    dependency: score("dependency"),
  };
});
