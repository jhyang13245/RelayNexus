import type {
  EngineContextProfile,
  SimulateRequest,
} from "./engine";
import {
  deriveNarrativeSceneContract,
  type NarrativeSceneContract,
} from "./narrative-kernel";
import { runtimePredicateSatisfied } from "./package15-runtime";
import {
  deriveSceneFactContract,
  sceneFactPrompt,
} from "./scene-fact";
import type {
  Character,
  ScenarioEvent,
  ScenarioPack,
} from "./scenario";
import { activeSessionCanonForPrompt } from "./session-canon";
import {
  selectInstantExampleScene,
  selectInstantKeywordNotes,
} from "./instant-story-runtime";
export { MAX_PLAYER_INPUT_CHARS } from "./player-input";
import { MAX_PLAYER_INPUT_CHARS } from "./player-input";

export const SCENE_CONTEXT_COMPILER_VERSION = "scene-context-v1" as const;

type LongTermMemory = NonNullable<SimulateRequest["longTermMemories"]>[number];
type RecentTurn = SimulateRequest["recentTurns"][number];

export type ScenePathSignal = {
  id: string;
  active: boolean;
};

export type PlayerInputContract = {
  original: string;
  clauses: Array<{
    order: number;
    kind: string;
    authority: string;
    mode: string;
    text: string;
    mustAttempt: boolean;
    mustNotExecute: boolean;
    completionRule: string;
  }>;
  sceneFact: {
    active: boolean;
    kind: string;
    tools: string[];
    targets: string[];
    temporaryEffect: boolean;
    evidenceContract: string;
  };
  requiredEvidence: string[];
  policy: string[];
};

export type CompiledSceneContext = {
  compiler: {
    version: typeof SCENE_CONTEXT_COMPILER_VERSION;
    path: "fast" | "deep";
    reason: string[];
    policy: string;
  };
  playerInputContract: PlayerInputContract;
  workContext: {
    projectId: string;
    title: string;
    genre: string;
    tone: string;
    world: Record<string, unknown>;
    style: Record<string, unknown>;
  };
  sceneAnchor: {
    turn: number;
    day: number;
    date: string;
    weekday: string;
    time: string;
    weather: string;
    location: string;
    summary: string;
    status: string[];
    inventory: string[];
  };
  activeEvent: Record<string, unknown> | null;
  activeConstraints: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  sessionCanon: ReturnType<typeof activeSessionCanonForPrompt>;
  semanticMemories: LongTermMemory[];
  recentTurns: RecentTurn[];
  publicState: {
    variables: Array<Record<string, unknown>>;
    observableTraces: Array<Record<string, unknown>>;
    introducedCharacterIds: string[];
    lastStatusChanges: Array<Record<string, unknown>>;
    publicClocks: Array<Record<string, unknown>>;
    statusDefinitions: Array<Record<string, unknown>>;
    statusEntries: Array<Record<string, unknown>>;
  };
  runtimeExtensions: {
    negotiatedPackageFeatures: string[];
    relevantMediaAssets: Array<Record<string, unknown>>;
    instantStory: Record<string, unknown> | null;
  };
  worldContext: Record<string, unknown> | null;
  disclosure: {
    excludedCanonicalFacts: boolean;
    protectedTermCount: number;
    policy: string[];
  };
};

export type CompiledSceneResult = {
  context: CompiledSceneContext;
  contract: NarrativeSceneContract;
  profile: EngineContextProfile;
};

const normalize = (value: string): string =>
  value.normalize("NFKC").toLowerCase();

const tokens = (value: string): string[] => [...new Set(
  normalize(value).match(/[\p{L}\p{N}_-]{2,}/gu) ?? [],
)].slice(0, 96);

const compactName = (value: string): string =>
  normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");

const containsName = (corpus: string, character: Character): boolean => {
  const normalized = normalize(corpus);
  const publicNames = [
    character.name,
    character.preRevealAlias ?? "",
    ...(character.aliases ?? []),
  ].filter(Boolean);
  if (publicNames.some((name) => normalized.includes(normalize(name)))) return true;
  return publicNames
    .flatMap((name) => name.split(/[\s·/()]+/u))
    .filter((part) => part.length >= 2)
    .some((part) => normalized.includes(normalize(part)));
};

const relevance = (value: string, keywords: string[]): number => {
  const normalized = normalize(value);
  return keywords.reduce(
    (score, keyword) => score + (normalized.includes(keyword) ? Math.min(8, keyword.length) : 0),
    0,
  );
};

const replaceProtectedTerms = (
  value: string,
  protectedTerms: string[],
): string => protectedTerms.reduce((text, term) => {
  const normalizedTerm = term.trim();
  if (normalizedTerm.length < 2) return text;
  return text.replaceAll(normalizedTerm, "[공개 전 정보]");
}, value);

const redactPackageValue = (
  value: unknown,
  protectedTerms: string[],
  depth = 0,
): unknown => {
  if (depth > 8) return "[하위 구조 생략]";
  if (typeof value === "string") return replaceProtectedTerms(value, protectedTerms);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 48).map((item) =>
      redactPackageValue(item, protectedTerms, depth + 1)
    );
  }
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(?:hidden|secret|trueName|canonicalName|gmData)/iu.test(key))
      .slice(0, 64)
      .map(([key, item]) => [key, redactPackageValue(item, protectedTerms, depth + 1)]),
  );
};

const playerInputContract = (
  original: string,
  contract: NarrativeSceneContract,
): PlayerInputContract => {
  const sceneFact = deriveSceneFactContract(original);
  const requiredEvidence = contract.clauses.flatMap((clause) => {
    if (clause.mode !== "execution") {
      return [`${clause.order}번 절을 ${clause.mode}로 유지하고 현재 행동으로 실행하지 않음`];
    }
    if (clause.kind === "move") {
      return [`${clause.order}번 이동의 출발·경로 또는 수단·경과 시간·도착`];
    }
    if (clause.kind === "encounter") {
      return [`${clause.order}번 재회의 성립 반응 또는 부재·착각·엇갈림의 현장 근거`];
    }
    if (clause.kind === "speak") {
      return [`${clause.order}번 발화를 들은 상대의 직접 답변·거절·유보·역질문`];
    }
    if (clause.kind === "overreach") {
      return [`${clause.order}번 시도·대상 반응·주변 반응·현실적인 대가`];
    }
    return [`${clause.order}번 행동의 실행 과정·즉시 반응·달라진 다음 상황`];
  });
  if (sceneFact.active) {
    requiredEvidence.unshift(
      "도구·대상·실행 동작·관측 가능한 즉시 효과를 정사 진행보다 먼저 보여 줌",
    );
    if (sceneFact.temporaryEffect) {
      requiredEvidence.push("잠시 성립한 효과와 효과가 끝나거나 반동이 생기는 원인을 모두 보존");
    }
  }
  return {
    original,
    clauses: contract.clauses.map((clause) => ({
      order: clause.order,
      kind: clause.kind,
      authority: clause.authority,
      mode: clause.mode,
      text: clause.text,
      mustAttempt: clause.mode === "execution",
      mustNotExecute: clause.mode !== "execution",
      completionRule: clause.completionRule,
    })),
    sceneFact: {
      active: sceneFact.active,
      kind: sceneFact.kind,
      tools: sceneFact.tools,
      targets: sceneFact.targets,
      temporaryEffect: sceneFact.temporaryEffect,
      evidenceContract: sceneFactPrompt(sceneFact),
    },
    requiredEvidence,
    policy: [
      "플레이어 입력은 사건 진행보다 먼저 처리한다.",
      "뒤 절의 불성립 때문에 앞 절을 취소하거나 플레이어를 원래 상태로 되돌리지 않는다.",
      "플레이어 권한의 실행은 실제로 시도하고, 세계 권한의 결과는 직접 반응으로 판정한다.",
      "입력과 정사가 충돌하면 입력 결과를 원인으로 정사를 재구성한다.",
      "원문에 없는 플레이어의 대사·감정·판단·행동은 추가하지 않는다.",
    ],
  };
};

const selectedMemories = (
  memories: LongTermMemory[],
  relevanceText: string,
  path: "fast" | "deep",
  fastLimit?: number,
): LongTermMemory[] => {
  const limit = path === "deep" ? 28 : fastLimit ?? 14;
  if (memories.length <= limit) return memories;
  const keywords = tokens(relevanceText);
  const recentKeys = new Set(memories.slice(-(path === "deep" ? 12 : 6)).map((memory) =>
    `${memory.turn}:${memory.title}`
  ));
  return memories
    .map((memory, index) => ({
      memory,
      index,
      score: relevance([
        memory.title,
        memory.summary,
        memory.location,
        memory.date,
        memory.time,
      ].join(" "), keywords) +
        (recentKeys.has(`${memory.turn}:${memory.title}`) ? 100 : 0),
    }))
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index)
    .map(({ memory }) => memory);
};

const characterDisclosure = (
  pack: ScenarioPack,
  completedEventIds: string[],
  clocks: SimulateRequest["state"]["clocks"],
  character: Character,
) => {
  const runtime = pack.narrativeRuntime?.characterDisclosure.find((item) =>
    item.characterId === character.id
  );
  const revealCondition = runtime?.revealCondition ?? character.revealCondition;
  const guarded = Boolean(runtime || character.preRevealAlias || revealCondition);
  const revealed = !guarded || runtimePredicateSatisfied(revealCondition, {
    completedEventIds,
    clocks,
  });
  return {
    guarded,
    revealed,
    visibleName: revealed
      ? character.name
      : runtime?.preRevealAlias || character.preRevealAlias || "정체불명의 인물",
  };
};

const selectedCharacters = ({
  pack,
  request,
  activeEvent,
  completedEventIds,
  clocks,
  protectedTerms,
  path,
  fastLimit,
}: {
  pack: ScenarioPack;
  request: SimulateRequest;
  activeEvent?: ScenarioEvent;
  completedEventIds: string[];
  clocks: SimulateRequest["state"]["clocks"];
  protectedTerms: string[];
  path: "fast" | "deep";
  fastLimit?: number;
}) => {
  const recentText = request.recentTurns.slice(-(path === "deep" ? 8 : 4))
    .flatMap((turn) => [
      turn.userText ?? "",
      ...turn.blocks.map((block) => `${block.speakerName ?? ""} ${block.text}`),
    ]).join("\n");
  const eventText = activeEvent
    ? [
        activeEvent.id,
        activeEvent.name,
        activeEvent.participants,
        activeEvent.description,
        activeEvent.requiredSpeakerId,
      ].filter(Boolean).join("\n")
    : "";
  const limit = path === "deep" ? 14 : fastLimit ?? 8;
  const selected = [pack.player, ...pack.npcs]
    .map((character, index) => {
      const namedInInput = containsName(request.userText, character);
      const namedInEvent = containsName(eventText, character) ||
        eventText.includes(character.id);
      const namedInScene = containsName([
        request.state.sceneSummary,
        request.state.location,
        recentText,
      ].join("\n"), character);
      const encountered = request.state.encounteredCharacterIds.includes(character.id);
      return {
        character,
        index,
        namedInInput,
        namedInEvent,
        namedInScene,
        encountered,
        score: character.isPlayer
          ? 10_000
          : (namedInInput ? 500 : 0) +
            (namedInEvent ? 260 : 0) +
            (namedInScene ? 160 : 0) +
            (encountered ? 20 : 0),
      };
    })
    .filter(({ character, score }) => character.isPlayer || score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);
  const characters = selected.map(({ character }) => character);
  const scenePresence = new Map(selected.map((item) => [
    item.character.id,
    item.character.isPlayer
      ? "player"
      : item.namedInInput
        ? "named_in_input"
        : item.namedInScene
          ? "recent_scene"
          : item.namedInEvent
            ? "event_context_only"
            : item.encountered
              ? "memory_only"
              : "unknown",
  ]));

  const ids = new Set(characters.map((character) => character.id));
  const names = new Map<string, string>();
  const capsules = characters.map((character) => {
    const disclosure = characterDisclosure(
      pack,
      completedEventIds,
      clocks,
      character,
    );
    names.set(character.id, disclosure.visibleName);
    return redactPackageValue({
      id: character.id,
      visibleName: disclosure.visibleName,
      visibleAliases: character.aliases ?? [],
      role: disclosure.revealed ? character.role : "공개 전 역할",
      affiliation: disclosure.revealed ? character.affiliation : "",
      personality: character.personality,
      speechStyle: character.speechStyle,
      appearance: character.appearance,
      status: character.status,
      publicInfo: character.publicInfo,
      knownSkills: disclosure.revealed ? character.skills : "",
      disclosureState: disclosure.revealed ? "revealed" : "alias_only",
      scenePresence: scenePresence.get(character.id) ?? "unknown",
      isPlayer: character.isPlayer,
    }, protectedTerms) as Record<string, unknown>;
  });
  const relationships = request.state.relations
    .filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId))
    .slice(-(path === "deep" ? 18 : 10))
    .map((relation) => ({
      relationId: relation.relationId,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      sourceName: names.get(relation.sourceId) ?? relation.sourceId,
      targetName: names.get(relation.targetId) ?? relation.targetId,
      relationType: relation.relationType,
      trust: relation.trust,
      favor: relation.favor,
      fear: relation.fear,
      respect: relation.respect,
      suspicion: relation.suspicion,
      hostility: relation.hostility,
      dependency: relation.dependency,
    }));
  return {
    capsules,
    relationships,
    ids: characters.map((character) => character.id),
    excluded: Math.max(0, pack.npcs.length + 1 - characters.length),
  };
};

const activeEventContext = (
  pack: ScenarioPack,
  event: ScenarioEvent | undefined,
  beatIndex: number,
  completedEventIds: string[],
  clocks: SimulateRequest["state"]["clocks"],
  protectedTerms: string[],
): Record<string, unknown> | null => {
  if (!event) return null;
  const beats = [...(event.beats ?? [])].sort((left, right) => left.order - right.order);
  const currentBeat = beats[Math.min(Math.max(0, beatIndex), Math.max(0, beats.length - 1))];
  const runtime = pack.narrativeRuntime?.events.find((item) => item.eventId === event.id);
  const alternateBeats = [...(event.alternateBeats ?? []), ...(runtime?.alternateBeats ?? [])]
    .filter((beat) => !beat.when || runtimePredicateSatisfied(beat.when, {
      completedEventIds,
      clocks,
    }))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 4);
  return redactPackageValue({
    id: event.id,
    name: event.name,
    type: event.type,
    kind: event.kind ?? "event",
    required: Boolean(event.required),
    timeWindow: event.timeWindow ?? "",
    participants: event.participants ?? "",
    description: event.description,
    effects: event.effects ?? "",
    requiredItems: event.requiredItems ?? "",
    requiredDialogue: event.requiredDialogue ?? "",
    requiredSpeakerId: event.requiredSpeakerId ?? "",
    completionSignals: event.completionSignals ?? "",
    recoveryAlternatives: event.recoveryAlternatives ?? "",
    currentBeat: currentBeat
      ? {
          number: beatIndex + 1,
          total: beats.length,
          id: currentBeat.id,
          title: currentBeat.title,
          content: currentBeat.content,
          viewpoint: currentBeat.viewpoint ?? "",
          requiredSignals: currentBeat.requiredSignals ?? "",
        }
      : null,
    alternateBeats,
    sceneMarkers: [...(event.sceneMarkers ?? []), ...(runtime?.sceneMarkers ?? [])]
      .filter((marker) => !marker.when || runtimePredicateSatisfied(marker.when, {
        completedEventIds,
        clocks,
      }))
      .slice(0, 12),
  }, protectedTerms) as Record<string, unknown>;
};

const publicWorldContext = (
  pack: ScenarioPack,
  protectedTerms: string[],
): Record<string, unknown> | null => {
  const runtime = pack.aiWorldContext;
  if (!runtime?.enabled) return null;
  return redactPackageValue({
    premise: runtime.worldContext.premise,
    referenceFramework: runtime.worldContext.referenceFramework,
    referenceUsage: runtime.worldContext.referenceUsage,
    localContext: runtime.worldContext.localContext,
    enrichmentPriorities: runtime.worldContext.enrichmentPriorities,
    avoidElements: runtime.worldContext.avoidElements,
    originalityRule: runtime.worldContext.originalityRule,
    spoilerRule: runtime.worldContext.spoilerRule,
  }, protectedTerms) as Record<string, unknown>;
};

export const compileSceneContext = ({
  request,
  activeEvent,
  beatIndex,
  totalBeats,
  completedEventIds,
  protectedTerms,
  pathSignals,
  visibleInventory,
}: {
  request: SimulateRequest;
  activeEvent?: ScenarioEvent;
  beatIndex: number;
  totalBeats: number;
  completedEventIds: string[];
  protectedTerms: string[];
  pathSignals: ScenePathSignal[];
  visibleInventory: string[];
}): CompiledSceneResult => {
  const startedAt = Date.now();
  if (request.userText.length > MAX_PLAYER_INPUT_CHARS) {
    throw new Error(`PLAYER_INPUT_TOO_LONG:${request.userText.length}`);
  }
  const contract = deriveNarrativeSceneContract(
    request.advanceMode === "canonical" ? "" : request.userText,
  );
  const instantRuntime = request.pack.instantStoryRuntime?.enabled
    ? request.pack.instantStoryRuntime
    : undefined;
  const ordinaryActiveReasons = pathSignals
    .filter((signal) => signal.active)
    .map((signal) => signal.id);
  const instantSignalMap: Record<string, string> = {
    required_completion: "final_beat",
    forced_event_closure: "final_beat",
    event_reroute: "route_transition",
    manual_carryover: "route_transition",
  };
  const instantDeepTriggers = new Set(instantRuntime?.deepPathTriggers ?? []);
  const activeReasons = instantRuntime
    ? [...new Set([
        ...(totalBeats > 0 && beatIndex >= totalBeats - 1 && instantDeepTriggers.has("final_beat")
          ? ["final_beat"]
          : []),
        ...ordinaryActiveReasons.flatMap((reason) => {
          const mapped = instantSignalMap[reason] ?? reason;
          return instantDeepTriggers.has(mapped) ? [mapped] : [];
        }),
      ])]
    : ordinaryActiveReasons;
  const path: "fast" | "deep" = activeReasons.length ? "deep" : "fast";
  const recentLimit = path === "deep"
    ? 8
    : instantRuntime?.contextBudget.recentTurns ?? 4;
  const recentTurns = request.recentTurns.slice(-recentLimit).map((turn) => ({
    turn: turn.turn,
    userText: turn.userText?.slice(0, 4_000),
    location: turn.location
      ? replaceProtectedTerms(turn.location, protectedTerms)
      : undefined,
    time: turn.time,
    blocks: turn.blocks.slice(-12).map((block) => ({
      id: replaceProtectedTerms(block.id, protectedTerms),
      type: block.type,
      text: replaceProtectedTerms(block.text.slice(0, 4_000), protectedTerms),
      speakerId: block.speakerId
        ? replaceProtectedTerms(block.speakerId, protectedTerms)
        : undefined,
      speakerName: block.speakerName
        ? replaceProtectedTerms(block.speakerName, protectedTerms)
        : undefined,
      emotion: block.emotion
        ? replaceProtectedTerms(block.emotion, protectedTerms)
        : undefined,
    })),
  }));
  const relevanceText = [
    request.userText,
    request.state.location,
    request.state.sceneSummary,
    activeEvent?.name ?? "",
    activeEvent?.description ?? "",
    ...recentTurns.flatMap((turn) => [
      turn.userText ?? "",
      ...turn.blocks.map((block) => block.text),
    ]),
  ].join("\n");
  const semanticMemories = selectedMemories(
    request.longTermMemories ?? [],
    relevanceText,
    path,
    instantRuntime?.contextBudget.semanticMemories,
  ).map((memory) => ({
    ...memory,
    location: replaceProtectedTerms(memory.location, protectedTerms),
    title: replaceProtectedTerms(memory.title, protectedTerms),
    summary: replaceProtectedTerms(memory.summary, protectedTerms),
  }));
  const characterSelection = selectedCharacters({
    pack: request.pack,
    request,
    activeEvent,
    completedEventIds,
    clocks: request.state.clocks,
    protectedTerms,
    path,
    fastLimit: instantRuntime?.contextBudget.activeCharacters,
  });
  const activeEventCompiled = activeEventContext(
    request.pack,
    activeEvent,
    beatIndex,
    completedEventIds,
    request.state.clocks,
    protectedTerms,
  );
  const activeConstraints = (request.pack.constraints ?? [])
    .filter((constraint) => {
      const appliesTo = constraint.appliesTo ?? [];
      return appliesTo.length === 0 || appliesTo.includes("*") ||
        (activeEvent && appliesTo.includes(activeEvent.id));
    })
    .slice(0, path === "deep" ? 12 : 6)
    .map((constraint) => redactPackageValue({
      id: constraint.id,
      name: constraint.name,
      rules: constraint.rules?.length
        ? constraint.rules
        : [constraint.conditions, constraint.description].filter(Boolean),
    }, protectedTerms) as Record<string, unknown>);
  const inputContract = playerInputContract(
    request.advanceMode === "canonical" ? "" : request.userText,
    contract,
  );
  const sessionCanon = redactPackageValue(
    activeSessionCanonForPrompt(request.state.sessionCanonLedger ?? [])
      .slice(-(path === "deep" ? 48 : 24)),
    protectedTerms,
  ) as ReturnType<typeof activeSessionCanonForPrompt>;
  const activeKeywordNotes = selectInstantKeywordNotes(
    instantRuntime,
    relevanceText,
  );
  const selectedExampleScene = selectInstantExampleScene(
    instantRuntime,
    request.userText,
  );
  const context: CompiledSceneContext = {
    compiler: {
      version: SCENE_CONTEXT_COMPILER_VERSION,
      path,
      reason: activeReasons.length ? activeReasons : ["ordinary_current_scene"],
      policy:
        "이 객체 밖의 패키지 미래 사건과 비공개 사실을 추측하지 않는다. playerInputContract를 먼저 장면화하고 activeEvent는 그 결과에 인과적으로 연결한다.",
    },
    playerInputContract: inputContract,
    workContext: {
      projectId: replaceProtectedTerms(request.pack.projectId, protectedTerms),
      title: replaceProtectedTerms(request.pack.title, protectedTerms),
      genre: replaceProtectedTerms(request.pack.genre, protectedTerms),
      tone: replaceProtectedTerms(request.pack.tone, protectedTerms),
      world: redactPackageValue(
        request.pack.world,
        protectedTerms,
      ) as Record<string, unknown>,
      style: redactPackageValue(
        request.pack.style,
        protectedTerms,
      ) as Record<string, unknown>,
    },
    sceneAnchor: {
      turn: request.state.turn,
      day: request.state.day,
      date: replaceProtectedTerms(request.state.date, protectedTerms),
      weekday: replaceProtectedTerms(request.state.weekday, protectedTerms),
      time: replaceProtectedTerms(request.state.time, protectedTerms),
      weather: replaceProtectedTerms(request.state.weather, protectedTerms),
      location: replaceProtectedTerms(request.state.location, protectedTerms),
      summary: replaceProtectedTerms(request.state.sceneSummary, protectedTerms),
      status: request.state.status
        .slice(-12)
        .map((item) => replaceProtectedTerms(item, protectedTerms)),
      inventory: visibleInventory.map((item) =>
        replaceProtectedTerms(item, protectedTerms)
      ),
    },
    activeEvent: activeEventCompiled,
    activeConstraints,
    characters: characterSelection.capsules,
    relationships: characterSelection.relationships,
    sessionCanon,
    semanticMemories,
    recentTurns,
    publicState: {
      variables: request.state.variables
        .filter((variable) => variable.status === "active" && variable.visibility === "public")
        .slice(-(path === "deep" ? 24 : 12))
        .map((variable) => redactPackageValue(
          variable,
          protectedTerms,
        ) as Record<string, unknown>),
      observableTraces: request.state.observableTraces
        .slice(-(path === "deep" ? 16 : 8))
        .map((trace) => redactPackageValue(
          trace,
          protectedTerms,
        ) as Record<string, unknown>),
      introducedCharacterIds: request.state.characterVisuals
        .slice(-48)
        .map((visual) => replaceProtectedTerms(
          visual.characterId,
          protectedTerms,
        )),
      lastStatusChanges: request.state.lastStatusChanges
        .slice(-(path === "deep" ? 16 : 8))
        .map((change) => redactPackageValue(
          change,
          protectedTerms,
        ) as Record<string, unknown>),
      publicClocks: request.state.clocks
        .filter((clock) => {
          const definition = request.pack.clocks.find((item) => item.id === clock.id);
          return definition?.visibility.toLowerCase() !== "hidden";
        })
        .slice(-(path === "deep" ? 16 : 8))
        .map((clock) => {
          const definition = request.pack.clocks.find((item) => item.id === clock.id);
          return redactPackageValue({
            id: clock.id,
            name: definition?.name ?? clock.name,
            current: clock.current,
            maximum: clock.maximum,
            publicHint: definition?.publicHint ?? clock.publicHint,
          }, protectedTerms) as Record<string, unknown>;
        }),
      statusDefinitions: request.pack.statusWindow.fields
        .filter((field) => field.visibility !== "hidden")
        .slice(0, path === "deep" ? 32 : 16)
        .map((field) => redactPackageValue({
          id: field.id,
          label: field.label,
          kind: field.kind,
          source: field.source,
          minimum: field.minimum,
          maximum: field.maximum,
          maxDelta: field.maxDelta,
          updateRule: field.updateRule,
        }, protectedTerms) as Record<string, unknown>),
      statusEntries: request.state.statusLedger
        .filter((entry) => {
          const definition = request.pack.statusWindow.fields.find(
            (field) => field.id === entry.fieldId,
          );
          return Boolean(definition && definition.visibility !== "hidden");
        })
        .slice(-(path === "deep" ? 32 : 16))
        .map((entry) => redactPackageValue(
          entry,
          protectedTerms,
        ) as Record<string, unknown>),
    },
    runtimeExtensions: {
      negotiatedPackageFeatures: request.pack.package15Runtime?.negotiatedFeatures ?? [],
      relevantMediaAssets: request.pack.mediaAssets
        .filter((asset) =>
          Boolean(
            characterSelection.ids.includes(asset.characterId) ||
              (activeEvent && (
                asset.sceneTags.some((tag) => normalize(activeEvent.name).includes(normalize(tag))) ||
                asset.sceneTags.some((tag) => normalize(activeEvent.description).includes(normalize(tag)))
              )),
          )
        )
        .slice(
          0,
          path === "deep"
            ? 24
            : instantRuntime?.contextBudget.relevantMedia ?? 12,
        )
        .map((asset) => redactPackageValue({
          id: asset.id,
          kind: asset.kind,
          characterId: asset.characterId,
          characterName: asset.characterName,
          label: asset.label,
          emotionTags: asset.emotionTags,
          sceneTags: asset.sceneTags,
          placement: asset.placement,
        }, protectedTerms) as Record<string, unknown>),
      instantStory: instantRuntime
        ? redactPackageValue({
            profile: instantRuntime.profile,
            promptPreset: instantRuntime.promptPreset,
            corePrompt: instantRuntime.corePrompt,
            beatPolicy: instantRuntime.beatPolicy,
            activeKeywordNotes,
            exampleScene: selectedExampleScene ?? null,
            singleCallPreferred: instantRuntime.generation.singleCallPreferred,
          }, protectedTerms) as Record<string, unknown>
        : null,
    },
    worldContext: publicWorldContext(request.pack, protectedTerms),
    disclosure: {
      excludedCanonicalFacts: true,
      protectedTermCount: protectedTerms.length,
      policy: [
        "미공개 진명·흑막·미래 계약·미래 사건은 작가 컨텍스트에서 제외한다.",
        "플레이어가 직접 말한 비공개 명칭과 추측은 삭제하지 않고 NPC가 부정·회피·유보할 대상으로 취급한다.",
        "과거 AI 본문·요약·장부에 남은 공개 전 명칭은 현재 공개 상태를 기준으로 다시 가린다.",
        "alias_only 인물은 visibleName만 사용한다.",
      ],
    },
  };
  const serialized = JSON.stringify(context);
  const profile: EngineContextProfile = {
    compilerVersion: SCENE_CONTEXT_COMPILER_VERSION,
    path,
    pathReasons: context.compiler.reason,
    compileDurationMs: Math.max(0, Date.now() - startedAt),
    staticPromptChars: 0,
    dynamicPromptChars: serialized.length,
    estimatedPromptTokens: Math.ceil(serialized.length / 3),
    activeEventId: activeEvent?.id ?? "",
    currentBeat: Math.max(0, beatIndex + 1),
    totalBeats: Math.max(0, totalBeats),
    inputClauseCount: contract.clauses.length,
    executableClauseCount: contract.clauses.filter((clause) => clause.mode === "execution").length,
    includedCharacterIds: characterSelection.ids,
    includedMemoryTurns: semanticMemories.map((memory) => memory.turn),
    includedRecentTurns: recentTurns.map((turn) => turn.turn),
    excludedCharacterCount: characterSelection.excluded,
    excludedEventCount: Math.max(0, request.pack.events.length - (activeEvent ? 1 : 0)),
    excludedMemoryCount: Math.max(0, (request.longTermMemories?.length ?? 0) - semanticMemories.length),
    protectedTermCount: protectedTerms.length,
    fallbackUsed: false,
  };
  return { context, contract, profile };
};

export const contextProfileWithPromptSizes = (
  profile: EngineContextProfile,
  staticPrompt: string,
  dynamicPrompt: string,
): EngineContextProfile => ({
  ...profile,
  staticPromptChars: staticPrompt.length,
  dynamicPromptChars: dynamicPrompt.length,
  estimatedPromptTokens: Math.ceil((staticPrompt.length + dynamicPrompt.length) / 3),
});

export const protectedTermsAbsentFromCompiledPackageContext = (
  context: CompiledSceneContext,
  protectedTerms: string[],
): boolean => {
  const packageOnly = JSON.stringify({
    activeEvent: context.activeEvent,
    activeConstraints: context.activeConstraints,
    workContext: context.workContext,
    sceneAnchor: context.sceneAnchor,
    characters: context.characters,
    relationships: context.relationships,
    sessionCanon: context.sessionCanon,
    semanticMemories: context.semanticMemories,
    recentAssistantBlocks: context.recentTurns.map((turn) => turn.blocks),
    publicState: context.publicState,
    runtimeExtensions: context.runtimeExtensions,
    worldContext: context.worldContext,
  });
  return protectedTerms
    .filter((term) => compactName(term).length >= 2)
    .every((term) => !packageOnly.includes(term));
};
