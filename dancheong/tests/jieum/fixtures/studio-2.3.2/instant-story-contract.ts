import type { Project, ValidationIssue } from "./studio-model";

export const INSTANT_STORY_FEATURE_ID = "instant_story_runtime_v2" as const;
export const INSTANT_STORY_FORMAT = "RELAY_NOVEL_INSTANT_STORY_RUNTIME_V2" as const;
export const INSTANT_STORY_SCHEMA_VERSION = "2.0" as const;
export const INSTANT_STORY_COMPILER_VERSION = "studio-1.8.3" as const;

export type InstantPromptPreset = "basic_novel" | "one_to_one" | "simulation" | "custom";
export type InstantDeepTrigger = "final_beat" | "identity_reveal" | "route_transition" | "ending" | "loop_reset" | "multiple_reveal_policy_changes";

export type InstantExampleScene = {
  id: string;
  userInput: string;
  narration: string;
  recommendations: string[];
};

export type InstantStartProfile = {
  id: string;
  name: string;
  prologue: string;
  startSituation: string;
  recommendedReplies: string[];
};

export type InstantStatTier = { id: string; minimum: number; maximum: number; prompt: string };
export type InstantStatRule = {
  id: string;
  label: string;
  minimum: number;
  maximum: number;
  initial: number;
  unit: string;
  increaseWhen: string;
  decreaseWhen: string;
  tiers: InstantStatTier[];
};

export type InstantKeywordNote = {
  id: string;
  title: string;
  keywords: string[];
  priority: number;
  content: string;
};

export type InstantStoryDesign = {
  enabled: boolean;
  promptPreset: InstantPromptPreset;
  corePrompt: string;
  exampleScenes: InstantExampleScene[];
  startProfiles: InstantStartProfile[];
  statRules: InstantStatRule[];
  keywordNotes: InstantKeywordNote[];
  contextBudget: {
    maxDynamicPromptChars: number;
    recentTurns: number;
    activeCharacters: number;
    semanticMemories: number;
    activeKeywordNotes: number;
    relevantMedia: number;
  };
  generation: {
    ordinaryTurnMaxOutputTokens: number;
    singleCallPreferred: true;
    reasoningEffort: "none";
  };
  deepPathTriggers: InstantDeepTrigger[];
  endingPolicy: { minimumTurn: number; checkInterval: number };
};

export const makeInstantStoryDesign = (): InstantStoryDesign => ({
  enabled: false,
  promptPreset: "simulation",
  corePrompt: "플레이어의 실행 가능한 행동·대사·이동을 첫 인과로 장면화하고, 패키지 정사와 현재 비트 안에서 NPC와 환경의 현실적인 반응을 이어 쓴다. 경미한 문체 문제로 본문을 폐기하지 않는다.",
  exampleScenes: [],
  startProfiles: [],
  statRules: [],
  keywordNotes: [],
  contextBudget: {
    maxDynamicPromptChars: 10_000,
    recentTurns: 4,
    activeCharacters: 6,
    semanticMemories: 10,
    activeKeywordNotes: 3,
    relevantMedia: 8,
  },
  generation: {
    ordinaryTurnMaxOutputTokens: 2_400,
    singleCallPreferred: true,
    reasoningEffort: "none",
  },
  deepPathTriggers: ["identity_reveal", "ending"],
  endingPolicy: { minimumTurn: 10, checkInterval: 5 },
});

const list = <T>(value: unknown): T[] => Array.isArray(value) ? value.filter(Boolean) as T[] : [];

export const normalizeInstantStoryDesign = (raw: unknown): InstantStoryDesign => {
  const base = makeInstantStoryDesign();
  const source = raw && typeof raw === "object" ? raw as Partial<InstantStoryDesign> : {};
  return {
    ...base,
    ...source,
    exampleScenes: list<InstantExampleScene>(source.exampleScenes).slice(0, 3),
    startProfiles: list<InstantStartProfile>(source.startProfiles),
    statRules: list<InstantStatRule>(source.statRules).slice(0, 7),
    keywordNotes: list<InstantKeywordNote>(source.keywordNotes).slice(0, 20),
    contextBudget: { ...base.contextBudget, ...(source.contextBudget ?? {}), activeKeywordNotes: Math.min(3, Math.max(1, source.contextBudget?.activeKeywordNotes ?? base.contextBudget.activeKeywordNotes)) },
    generation: { ...base.generation, ...(source.generation ?? {}), singleCallPreferred: true, reasoningEffort: "none" },
    deepPathTriggers: list<InstantDeepTrigger>(source.deepPathTriggers).filter((value) => base.deepPathTriggers.includes(value)),
    endingPolicy: { ...base.endingPolicy, ...(source.endingPolicy ?? {}) },
  };
};

const normalizeKeyword = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");

export const instantContextIndex = (project: Project) => ({
  format: "RELAY_NOVEL_INSTANT_CONTEXT_INDEX_V1",
  characters: [project.player, ...project.npcs].map((character) => ({
    id: character.id,
    searchTerms: [...new Set([character.name, character.preRevealAlias, character.role, character.affiliation].map(normalizeKeyword).filter(Boolean))],
  })),
  source: "characters_and_instant_story_only",
});

export const instantKeywordIndex = (project: Project) => ({
  format: "RELAY_NOVEL_INSTANT_KEYWORD_INDEX_V1",
  maximumActiveNotesPerTurn: project.instantStory.contextBudget.activeKeywordNotes,
  notes: project.instantStory.keywordNotes.map((note) => ({
    id: note.id,
    title: note.title,
    priority: note.priority,
    normalizedKeywords: [...new Set(note.keywords.map(normalizeKeyword).filter(Boolean))],
    content: note.content,
  })).sort((left, right) => right.priority - left.priority),
});

export const instantMediaLookup = (_project: Project) => ({
  format: "RELAY_NOVEL_INSTANT_MEDIA_LOOKUP_V1",
  entries: [],
  source: "instant_story_media_only",
});

export const instantEndingSchedule = (project: Project) => ({
  format: "RELAY_NOVEL_INSTANT_ENDING_SCHEDULE_V1",
  minimumTurn: project.instantStory.endingPolicy.minimumTurn,
  checkInterval: project.instantStory.endingPolicy.checkInterval,
  endingIds: [],
  loopEnabled: false,
});

export const instantStoryRuntime = (project: Project, sourcePackageSha256: string, generatedAt: string) => ({
  format: INSTANT_STORY_FORMAT,
  schemaVersion: INSTANT_STORY_SCHEMA_VERSION,
  compilerVersion: INSTANT_STORY_COMPILER_VERSION,
  sourcePackageSha256,
  sourceHashMethod: "sha256(stable-json(runtime-source-without-derived-cache))",
  generatedAt,
  featureId: INSTANT_STORY_FEATURE_ID,
  runtimeMode: "instant_story",
  exclusiveRuntime: true,
  incompatibleRuntimeFeatures: ["narrative_runtime_extension_v1", "required_event_contracts", "npc_autonomy", "route_graph", "loop_policy"],
  enabled: project.instantStory.enabled,
  profile: "instant_story",
  promptPreset: project.instantStory.promptPreset,
  corePrompt: project.instantStory.corePrompt,
  exampleScenes: project.instantStory.exampleScenes,
  startProfiles: project.instantStory.startProfiles,
  statRules: project.instantStory.statRules,
  contextBudget: project.instantStory.contextBudget,
  generation: { ...project.instantStory.generation, streamingRequiredForFastPath: true },
  deepPathTriggers: project.instantStory.deepPathTriggers,
  turnPolicy: {
    inputFirst: "player_input_becomes_immediate_scene_cause",
    continuation: "activate_bounded_keyword_notes_and_continue_freely",
    directPlayerActionFirst: true,
    immediateDiscardReasons: ["undisclosed_information_leak", "structured_output_corruption"],
  },
  endingPolicy: project.instantStory.endingPolicy,
  streamContract: {
    endpoint: "/api/simulate/stream",
    ...(project.packageTarget === 'cortex' ? { requestDiscriminator: { cortexInstant: true }, sidecarRuntime: 'cortex_instant_v1', publicRelease: 'complete_response_after_validation' } : {}),
    publicEvents: ["turn_ack", "narration_commit", "turn_sidecar", "turn_abort", "done", "error"],
    upstreamDeltaVisibility: "server_internal_only",
    sentenceSafetyGate: project.packageTarget !== 'cortex',
    usePreRevealAlias: true,
    turnAbortRemovesProvisionalNarration: true,
    doneSemantics: "validated_and_memory_applied",
    durableCommit: "existing_debounced_session_save",
    futureAtomicCommitExtension: true,
  },
  researchPolicy: {
    cacheFirst: true,
    missBehavior: project.packageTarget === 'cortex' ? 'continue_with_package_canon' : 'stream_with_package_canon_and_research_in_background',
    ...(project.packageTarget === 'cortex' ? { automaticBackgroundResearch: false } : {}),
    applyFreshResult: "next_turn",
    failureBehavior: "continue_with_package_canon",
  },
  fallback: "reject_if_unsupported",
});

export const instantStoryRuntimeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://relay-novel-studio.juno12345.chatgpt.site/schemas/instant_story_runtime_v2.json",
  title: "Relay Novel Instant Story Runtime v2",
  type: "object",
  additionalProperties: false,
  required: ["format", "schemaVersion", "compilerVersion", "sourcePackageSha256", "generatedAt", "featureId", "runtimeMode", "exclusiveRuntime", "enabled", "contextBudget", "generation", "deepPathTriggers", "turnPolicy", "streamContract", "fallback"],
  properties: {
    format: { const: INSTANT_STORY_FORMAT },
    schemaVersion: { const: INSTANT_STORY_SCHEMA_VERSION },
    compilerVersion: { type: "string", minLength: 1 },
    sourcePackageSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    sourceHashMethod: { type: "string" },
    generatedAt: { type: "string", format: "date-time" },
    featureId: { const: INSTANT_STORY_FEATURE_ID },
    runtimeMode: { const: "instant_story" },
    exclusiveRuntime: { const: true },
    incompatibleRuntimeFeatures: { type: "array" },
    enabled: { type: "boolean" },
    profile: { const: "instant_story" },
    promptPreset: { enum: ["basic_novel", "one_to_one", "simulation", "custom"] },
    corePrompt: { type: "string" },
    exampleScenes: { type: "array", maxItems: 3 },
    startProfiles: { type: "array" },
    statRules: { type: "array", maxItems: 7 },
    contextBudget: { type: "object", required: ["maxDynamicPromptChars", "recentTurns", "activeCharacters", "semanticMemories", "activeKeywordNotes", "relevantMedia"] },
    generation: { type: "object", required: ["ordinaryTurnMaxOutputTokens", "singleCallPreferred", "reasoningEffort", "streamingRequiredForFastPath"] },
    deepPathTriggers: { type: "array", uniqueItems: true },
    turnPolicy: { type: "object" },
    endingPolicy: { type: "object" },
    streamContract: { type: "object" },
    researchPolicy: { type: "object" },
    fallback: { const: "reject_if_unsupported" },
  },
} as const;

export const instantStoryTestVectors = (project: Project, sourcePackageSha256: string, generatedAt: string) => {
  const normal = instantStoryRuntime(project, sourcePackageSha256, generatedAt);
  return {
    normal,
    staleCache: { ...normal, sourcePackageSha256: "0".repeat(64), expectedResult: "ignore_derived_cache_and_recompile_instant_only" },
    legacyPackage: { packageVersion: "1.5", requiredFeatures: [INSTANT_STORY_FEATURE_ID], expectedResult: "reject_if_instant_runtime_unsupported" },
    disclosureAbort: { publicEvents: ["turn_ack", "narration_commit", "turn_abort"], protectedTermInjectedAfterSafeSentence: true, expectedClientResult: "remove_all_provisional_narration_and_keep_previous_session" },
    malformedStream: { publicEvents: ["turn_ack", "narration_commit", "error"], malformedSidecar: true, expectedClientResult: "do_not_commit_turn" },
  };
};

export const validateInstantStory = (project: Project): ValidationIssue[] => {
  if (!project.instantStory.enabled) return [];
  const design = project.instantStory;
  const issues: ValidationIssue[] = [];
  if (project.runtimeMode !== "instant_story") issues.push({ severity: "error", area: "Instant Story", message: "Instant Story Runtime은 지능형 정사 전개 Runtime과 함께 활성화할 수 없습니다." });
  if (project.events.length || project.autonomyActors.length || project.package15.enabled) issues.push({ severity: "error", area: "Instant Story", message: "Instant Story 프로젝트에는 표준 사건·자율 정사·루트 엔진 데이터를 포함할 수 없습니다." });
  if (!design.corePrompt.trim()) issues.push({ severity: "error", area: "Instant Story", message: "고속 핵심 프롬프트가 비어 있습니다." });
  if (design.exampleScenes.length > 3) issues.push({ severity: "error", area: "Instant Story", message: "예시 장면은 최대 3개입니다." });
  if (design.statRules.length > 7) issues.push({ severity: "error", area: "Instant Story", message: "고속 스탯은 최대 7개입니다." });
  if (design.keywordNotes.length > 20) issues.push({ severity: "error", area: "Instant Story", message: "키워드 노트는 최대 20개입니다." });
  if (design.contextBudget.activeKeywordNotes > 3) issues.push({ severity: "error", area: "Instant Story", message: "한 턴에 활성화할 키워드 노트는 최대 3개입니다." });
  if (design.contextBudget.maxDynamicPromptChars > 16_000) issues.push({ severity: "warning", area: "Instant Story", message: "동적 프롬프트가 커지면 응답 시간과 사용량이 늘어날 수 있습니다." });
  if (project.packageTarget === 'cortex') {
    const error = (message: string) => issues.push({ severity: 'error', area: 'Instant Story · Cortex', message });
    for (const [key, min, max] of [['maxDynamicPromptChars', 4000, 24000], ['recentTurns', 1, 8], ['activeCharacters', 1, 12], ['activeKeywordNotes', 0, 3], ['semanticMemories', 0, 24], ['relevantMedia', 0, 12]] as const) {
      const value = design.contextBudget[key];
      if (!Number.isInteger(value) || value < min || value > max) error(`${key}는 ${min}~${max} 범위의 정수여야 합니다.`);
    }
    const output = design.generation.ordinaryTurnMaxOutputTokens;
    if (!Number.isInteger(output) || output < 1200 || output > 16000) error('출력 토큰 예산은 1200~16000 범위의 정수여야 합니다.');
    if (!Number.isInteger(design.endingPolicy.minimumTurn) || design.endingPolicy.minimumTurn < 0 || !Number.isInteger(design.endingPolicy.checkInterval) || design.endingPolicy.checkInterval < 1) error('엔딩 최초 턴은 0 이상, 검사 간격은 1 이상의 정수여야 합니다.');
    const ids = new Set<string>();
    for (const stat of design.statRules) {
      if (!stat.id.trim() || ids.has(stat.id) || ![stat.minimum, stat.maximum, stat.initial].every(Number.isFinite) || stat.minimum > stat.maximum || stat.initial < stat.minimum || stat.initial > stat.maximum) error(`${stat.label || stat.id}: 수치 ID·범위·초깃값이 올바르지 않습니다.`);
      ids.add(stat.id);
      for (const tier of stat.tiers) if (![tier.minimum, tier.maximum].every(Number.isFinite) || tier.minimum > tier.maximum) error(`${stat.label || stat.id}: 구간 범위가 올바르지 않습니다.`);
    }
  }
  if (design.exampleScenes.some((scene) => !scene.userInput.trim() || !scene.narration.trim())) issues.push({ severity: "warning", area: "Instant Story", message: "입력 또는 본문이 빈 예시 장면이 있습니다." });
  if (design.keywordNotes.some((note) => !note.keywords.length || !note.content.trim())) issues.push({ severity: "warning", area: "Instant Story", message: "키워드 또는 주입 내용이 빈 노트가 있습니다." });
  return issues;
};
