export const INSTANT_STORY_RUNTIME_FORMAT =
  "RELAY_NOVEL_INSTANT_STORY_RUNTIME_V1" as const;
export const INSTANT_STORY_RUNTIME_V2_FORMAT =
  "RELAY_NOVEL_INSTANT_STORY_RUNTIME_V2" as const;
export const INSTANT_CONTEXT_INDEX_FORMAT =
  "RELAY_NOVEL_INSTANT_CONTEXT_INDEX_V1" as const;
export const INSTANT_KEYWORD_INDEX_FORMAT =
  "RELAY_NOVEL_INSTANT_KEYWORD_INDEX_V1" as const;
export const INSTANT_MEDIA_LOOKUP_FORMAT =
  "RELAY_NOVEL_INSTANT_MEDIA_LOOKUP_V1" as const;
export const INSTANT_ENDING_SCHEDULE_FORMAT =
  "RELAY_NOVEL_INSTANT_ENDING_SCHEDULE_V1" as const;

export type InstantKeywordNote = {
  id: string;
  title: string;
  priority: number;
  normalizedKeywords: string[];
  content: string;
};

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

export type InstantStoryRuntime = {
  format: typeof INSTANT_STORY_RUNTIME_FORMAT | typeof INSTANT_STORY_RUNTIME_V2_FORMAT;
  featureId: "instant_story_runtime_v1" | "instant_story_runtime_v2";
  schemaVersion: "1.0" | "2.0";
  compilerVersion: string;
  sourcePackageSha256: string;
  runtimeMode: "instant_story";
  exclusiveRuntime: boolean;
  enabled: boolean;
  profile: string;
  promptPreset: string;
  corePrompt: string;
  exampleScenes: InstantExampleScene[];
  startProfiles: InstantStartProfile[];
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
    singleCallPreferred: boolean;
    reasoningEffort: "none" | "low" | "medium" | "high";
    streamingRequiredForFastPath: boolean;
  };
  deepPathTriggers: string[];
  beatPolicy: Record<string, unknown>;
  streamContract: Record<string, unknown>;
  endingPolicy: { minimumTurn: number; checkInterval: number };
  researchPolicy: Record<string, unknown>;
  fallback: string;
  contextIndex: Record<string, unknown>;
  keywordNotes: InstantKeywordNote[];
  mediaLookup: Record<string, unknown>;
  endingSchedule: Record<string, unknown>;
};

export type InstantStoryDerivedDocuments = {
  contextIndex?: unknown;
  keywordIndex?: unknown;
  mediaLookup?: unknown;
  endingSchedule?: unknown;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
  : [];
const number = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const bounded = (value: unknown, fallback: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Math.round(number(value, fallback))));

const validDerivedDocument = (
  value: unknown,
  format: string,
  sourcePackageSha256: string,
  schemaVersion: "1.0" | "2.0",
): Record<string, unknown> | undefined => {
  const parsed = record(value);
  if (text(parsed.format) !== format || text(parsed.schemaVersion) !== schemaVersion) return undefined;
  if (schemaVersion === "2.0" && (!text(parsed.compilerVersion) || !text(parsed.generatedAt))) {
    return undefined;
  }
  if (!sourcePackageSha256 || text(parsed.sourcePackageSha256) !== sourcePackageSha256) {
    return undefined;
  }
  return parsed;
};

export const parseInstantStoryRuntime = (
  value: unknown,
  documents: InstantStoryDerivedDocuments = {},
  sourceValue: unknown = {},
): InstantStoryRuntime | undefined => {
  const root = record(value);
  const v2 = text(root.featureId) === "instant_story_runtime_v2";
  const schemaVersion = v2 ? "2.0" : "1.0";
  const expectedFormat = v2 ? INSTANT_STORY_RUNTIME_V2_FORMAT : INSTANT_STORY_RUNTIME_FORMAT;
  const streamContract = record(root.streamContract);
  const v2StreamEvents = strings(streamContract.publicEvents);
  if (
    text(root.format) !== expectedFormat ||
    !["instant_story_runtime_v1", "instant_story_runtime_v2"].includes(text(root.featureId)) ||
    text(root.schemaVersion) !== schemaVersion ||
    root.enabled !== true ||
    (v2 && (
      text(root.runtimeMode) !== "instant_story" ||
      root.exclusiveRuntime !== true ||
      text(root.fallback) !== "reject_if_unsupported" ||
      ["turn_ack", "narration_commit", "turn_sidecar", "turn_abort", "done", "error"]
        .some((event, index) => v2StreamEvents[index] !== event)
    ))
  ) return undefined;
  const sourcePackageSha256 = text(root.sourcePackageSha256).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sourcePackageSha256)) return undefined;
  let contextIndex = validDerivedDocument(
    documents.contextIndex,
    INSTANT_CONTEXT_INDEX_FORMAT,
    sourcePackageSha256,
    schemaVersion,
  );
  let keywordIndex = validDerivedDocument(
    documents.keywordIndex,
    INSTANT_KEYWORD_INDEX_FORMAT,
    sourcePackageSha256,
    schemaVersion,
  );
  let mediaLookup = validDerivedDocument(
    documents.mediaLookup,
    INSTANT_MEDIA_LOOKUP_FORMAT,
    sourcePackageSha256,
    schemaVersion,
  );
  let endingSchedule = validDerivedDocument(
    documents.endingSchedule,
    INSTANT_ENDING_SCHEDULE_FORMAT,
    sourcePackageSha256,
    schemaVersion,
  );
  // V2 is exclusive: stale derived caches are rebuilt from its embedded
  // source instead of silently falling back to the standard event runtime.
  if (v2 && (!contextIndex || !keywordIndex || !mediaLookup || !endingSchedule)) {
    const sourceEnvelope = record(sourceValue);
    const embeddedSource = record(sourceEnvelope.instantStory);
    const source = Object.keys(embeddedSource).length ? embeddedSource : sourceEnvelope;
    if (!Object.keys(source).length) return undefined;
    const compilerVersion = text(root.compilerVersion).replace(/^studio-/u, "") || "1.8.0";
    const generatedAt = text(root.generatedAt) || new Date(0).toISOString();
    const notes = Array.isArray(source.keywordNotes) ? source.keywordNotes.map(record) : [];
    const characters = [sourceEnvelope.player, ...(
      Array.isArray(sourceEnvelope.npcs) ? sourceEnvelope.npcs : []
    )].map(record).filter((character) => text(character.id)).map((character) => ({
      id: text(character.id),
      searchTerms: [text(character.name), text(character.role), text(character.affiliation)].filter(Boolean),
    }));
    contextIndex ??= {
      format: INSTANT_CONTEXT_INDEX_FORMAT, schemaVersion, compilerVersion, generatedAt, sourcePackageSha256,
      source: "rebuilt_from_exclusive_runtime_source", characters,
    };
    keywordIndex ??= {
      format: INSTANT_KEYWORD_INDEX_FORMAT, schemaVersion, compilerVersion, generatedAt, sourcePackageSha256,
      maximumActiveNotesPerTurn: 3,
      notes: notes.map((note) => ({
        ...note,
        normalizedKeywords: strings(note.normalizedKeywords ?? note.keywords)
          .map((item) => item.normalize("NFKC").toLowerCase()),
      })),
    };
    mediaLookup ??= {
      format: INSTANT_MEDIA_LOOKUP_FORMAT, schemaVersion, compilerVersion, generatedAt, sourcePackageSha256, entries: [],
    };
    endingSchedule ??= {
      format: INSTANT_ENDING_SCHEDULE_FORMAT, schemaVersion, compilerVersion, generatedAt, sourcePackageSha256,
      ...record(root.endingPolicy),
    };
  }
  // V1 remains an optional extension and may use the legacy standard fallback.
  if (!contextIndex || !keywordIndex || !mediaLookup || !endingSchedule) return undefined;

  const budget = record(root.contextBudget);
  const generation = record(root.generation);
  const endingPolicy = record(root.endingPolicy);
  const effort = text(generation.reasoningEffort).toLowerCase();
  const keywordNotes = Array.isArray(keywordIndex.notes)
    ? keywordIndex.notes.map(record).flatMap((note) => {
        const id = text(note.id);
        const content = text(note.content);
        if (!id || !content) return [];
        return [{
          id,
          title: text(note.title),
          priority: bounded(note.priority, 50, 0, 100),
          normalizedKeywords: strings(note.normalizedKeywords).map((item) =>
            item.normalize("NFKC").toLowerCase()
          ),
          content,
        }];
      })
    : [];
  const exampleScenes = Array.isArray(root.exampleScenes)
    ? root.exampleScenes.map(record).flatMap((scene) => {
        const id = text(scene.id);
        const narration = text(scene.narration);
        if (!id || !narration) return [];
        return [{
          id,
          userInput: text(scene.userInput),
          narration,
          recommendations: strings(scene.recommendations).slice(0, 3),
        }];
      }).slice(0, 3)
    : [];
  const startProfiles = Array.isArray(root.startProfiles)
    ? root.startProfiles.map(record).flatMap((profile) => {
        const id = text(profile.id);
        const prologue = text(profile.prologue);
        if (!id || !prologue) return [];
        return [{
          id,
          name: text(profile.name),
          prologue,
          startSituation: text(profile.startSituation),
          recommendedReplies: strings(profile.recommendedReplies).slice(0, 3),
        }];
      })
    : [];
  return {
    format: expectedFormat,
    featureId: v2 ? "instant_story_runtime_v2" : "instant_story_runtime_v1",
    schemaVersion,
    compilerVersion: text(root.compilerVersion),
    sourcePackageSha256,
    runtimeMode: "instant_story",
    exclusiveRuntime: v2 && root.exclusiveRuntime === true,
    enabled: true,
    profile: text(root.profile) || "instant_story",
    promptPreset: text(root.promptPreset) || "simulation",
    corePrompt: text(root.corePrompt),
    exampleScenes,
    startProfiles,
    contextBudget: {
      maxDynamicPromptChars: bounded(budget.maxDynamicPromptChars, 10_000, 4_000, 24_000),
      recentTurns: bounded(budget.recentTurns, 4, 1, 8),
      activeCharacters: bounded(budget.activeCharacters, 5, 1, 12),
      semanticMemories: bounded(budget.semanticMemories, 10, 0, 24),
      activeKeywordNotes: bounded(budget.activeKeywordNotes, 3, 0, 5),
      relevantMedia: bounded(budget.relevantMedia, 6, 0, 12),
    },
    generation: {
      ordinaryTurnMaxOutputTokens: bounded(
        generation.ordinaryTurnMaxOutputTokens,
        2_200,
        1_200,
        3_800,
      ),
      singleCallPreferred: generation.singleCallPreferred !== false,
      reasoningEffort: ["none", "low", "medium", "high"].includes(effort)
        ? effort as InstantStoryRuntime["generation"]["reasoningEffort"]
        : "none",
      streamingRequiredForFastPath: generation.streamingRequiredForFastPath === true,
    },
    deepPathTriggers: strings(root.deepPathTriggers),
    beatPolicy: record(root.beatPolicy),
    streamContract,
    endingPolicy: {
      minimumTurn: bounded(endingPolicy.minimumTurn, 10, 0, 10_000),
      checkInterval: bounded(endingPolicy.checkInterval, 5, 1, 100),
    },
    researchPolicy: record(root.researchPolicy),
    fallback: text(root.fallback) || "standard_package15_runtime",
    contextIndex,
    keywordNotes,
    mediaLookup,
    endingSchedule,
  };
};

const normalized = (value: string): string => value.normalize("NFKC").toLowerCase();

export const selectInstantKeywordNotes = (
  runtime: InstantStoryRuntime | undefined,
  relevanceText: string,
): InstantKeywordNote[] => {
  if (!runtime?.enabled || runtime.contextBudget.activeKeywordNotes <= 0) return [];
  const corpus = normalized(relevanceText);
  return runtime.keywordNotes
    .map((note, index) => ({
      note,
      index,
      hits: note.normalizedKeywords.filter((keyword) => keyword && corpus.includes(keyword)).length,
    }))
    .filter(({ hits }) => hits > 0)
    .sort((left, right) =>
      right.hits - left.hits || right.note.priority - left.note.priority || left.index - right.index
    )
    .slice(0, runtime.contextBudget.activeKeywordNotes)
    .map(({ note }) => note);
};

export const selectInstantExampleScene = (
  runtime: InstantStoryRuntime | undefined,
  userInput: string,
): InstantExampleScene | undefined => {
  if (!runtime?.enabled || !runtime.exampleScenes.length) return undefined;
  const inputTerms = new Set(normalized(userInput).match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  return runtime.exampleScenes
    .map((scene, index) => ({
      scene,
      index,
      score: (normalized(scene.userInput).match(/[\p{L}\p{N}]{2,}/gu) ?? [])
        .filter((term) => inputTerms.has(term)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.scene;
};
