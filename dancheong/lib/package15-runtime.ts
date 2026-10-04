export const NARRATIVE_RUNTIME_FORMAT =
  "RELAY_NOVEL_NARRATIVE_RUNTIME_EXTENSION_V1" as const;
export const ROUTE_GRAPH_FORMAT = "RELAY_NOVEL_ROUTE_GRAPH_V1" as const;
export const CHAPTERS_FORMAT = "RELAY_NOVEL_CHAPTERS_V1" as const;
export const ROUTE_LENSES_FORMAT = "RELAY_NOVEL_ROUTE_LENSES_V1" as const;
export const REVEAL_FACTS_FORMAT = "RELAY_NOVEL_REVEAL_FACTS_V1" as const;
export const REVEAL_POLICIES_FORMAT =
  "RELAY_NOVEL_REVEAL_POLICIES_V1" as const;
export const ENDINGS_FORMAT = "RELAY_NOVEL_ENDINGS_V1" as const;
export const FLAGS_FORMAT = "RELAY_NOVEL_FLAGS_V1" as const;
export const GALLERIES_FORMAT = "RELAY_NOVEL_GALLERIES_V1" as const;
export const EPILOGUES_FORMAT = "RELAY_NOVEL_EPILOGUES_V1" as const;
export const CHECKPOINTS_FORMAT = "RELAY_NOVEL_CHECKPOINTS_V1" as const;
export const CLUES_FORMAT = "RELAY_NOVEL_CLUES_V1" as const;
export const LOOP_POLICY_FORMAT = "RELAY_NOVEL_LOOP_POLICY_V1" as const;
export const ITEM_DEFINITIONS_FORMAT =
  "RELAY_NOVEL_ITEM_DEFINITIONS_V1" as const;
export const ZONE_DEFINITIONS_FORMAT =
  "RELAY_NOVEL_ZONE_DEFINITIONS_V1" as const;
export const WORLD_FACT_DEFINITIONS_FORMAT =
  "RELAY_NOVEL_WORLD_FACT_DEFINITIONS_V1" as const;

export type Package15FeatureId =
  | "multi_route_v1"
  | "time_loop_v1"
  | "reveal_policy_v1"
  | "ending_meta_progress_v1"
  | "instant_story_runtime_v1"
  | "instant_story_runtime_v2"
  | "status_relationship_display_v1";

export const SUPPORTED_PACKAGE15_FEATURES: readonly Package15FeatureId[] = [
  "multi_route_v1",
  "time_loop_v1",
  "reveal_policy_v1",
  "ending_meta_progress_v1",
  "instant_story_runtime_v1",
  "instant_story_runtime_v2",
  "status_relationship_display_v1",
] as const;

export type RuntimePredicate =
  | { allOf: RuntimePredicate[] }
  | { anyOf: RuntimePredicate[] }
  | { not: RuntimePredicate }
  | { kind: "flag_equals"; flagId: string; value: boolean | number | string }
  | { kind: "event_completed"; eventId: string }
  | { kind: "clock_at_least"; clockId: string; value: number }
  | { kind: "actor_in_zone_at_trigger"; actorId?: string; zoneId: string }
  | { kind: "actor_has_tag"; actorId?: string; tagId: string };

export type AlternateBeat = {
  id: string;
  priority: number;
  when?: RuntimePredicate;
  narrativeGoal: string;
  requiredSignals: string[];
  preservePlayerChoice: boolean;
};

export type SceneMarker = {
  id: string;
  label: string;
  phase: "entry" | "progress" | "complete" | "sealed";
  when?: RuntimePredicate;
};

export type NarrativeRuntimeExtension = {
  format: typeof NARRATIVE_RUNTIME_FORMAT;
  packageCompatibility: string[];
  mergeRules: Record<string, string>;
  characterDisclosure: Array<{
    characterId: string;
    preRevealAlias: string;
    revealCondition?: RuntimePredicate;
  }>;
  events: Array<{
    eventId: string;
    alternateBeats: AlternateBeat[];
    sceneMarkers: SceneMarker[];
  }>;
};

export type Package15Runtime = {
  packageVersion: "1.5";
  requiredFeatures: Package15FeatureId[];
  optionalFeatures: Package15FeatureId[];
  negotiatedFeatures: Package15FeatureId[];
  routeGraph: Record<string, unknown>;
  chapters: Record<string, unknown>;
  routeLenses: Record<string, unknown>;
  revealFacts: Record<string, unknown>;
  revealPolicies: Record<string, unknown>;
  endings: Record<string, unknown>;
  flags: Record<string, unknown>;
  galleries: Record<string, unknown>;
  epilogues: Record<string, unknown>;
  checkpoints: Record<string, unknown>;
  clues: Record<string, unknown>;
  loopPolicy: Record<string, unknown>;
  items: Record<string, unknown>;
  zones: Record<string, unknown>;
  worldFacts: Record<string, unknown>;
};

export type Package15RevealGuard = {
  factId: string;
  label: string;
  mode: "forbidden" | "hint_only" | "partial" | "full";
  protectedTerms: string[];
  allowedSummary: string;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const text = (value: unknown): string => typeof value === "string" ? value : "";
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const featureList = (value: unknown): Package15FeatureId[] => {
  const supported = new Set<string>(SUPPORTED_PACKAGE15_FEATURES);
  return [...new Set(strings(value).filter((id) => supported.has(id)))] as Package15FeatureId[];
};

const assertFormat = (
  value: unknown,
  expected: string,
  path: string,
  required: boolean,
): Record<string, unknown> => {
  const parsed = record(value);
  if (!Object.keys(parsed).length) {
    if (required) throw new Error(`Package 1.5 필수 문서 ${path}가 없습니다.`);
    return {};
  }
  if (text(parsed.format) !== expected) {
    throw new Error(`${path}의 format이 ${expected}이 아닙니다.`);
  }
  return parsed;
};

export const parseNarrativeRuntimeExtension = (
  value: unknown,
): NarrativeRuntimeExtension | undefined => {
  const root = record(value);
  if (!Object.keys(root).length) return undefined;
  if (text(root.format) !== NARRATIVE_RUNTIME_FORMAT) {
    throw new Error(`rules/narrative_runtime.json의 format이 ${NARRATIVE_RUNTIME_FORMAT}이 아닙니다.`);
  }
  const disclosures = Array.isArray(root.characterDisclosure)
    ? root.characterDisclosure.map(record).filter((item) => text(item.characterId))
    : [];
  const events = Array.isArray(root.events)
    ? root.events.map(record).filter((item) => text(item.eventId))
    : [];
  return {
    format: NARRATIVE_RUNTIME_FORMAT,
    packageCompatibility: strings(root.packageCompatibility),
    mergeRules: Object.fromEntries(
      Object.entries(record(root.mergeRules)).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"
      ),
    ),
    characterDisclosure: disclosures.map((item) => ({
      characterId: text(item.characterId),
      preRevealAlias: text(item.preRevealAlias),
      ...(item.revealCondition ? { revealCondition: item.revealCondition as RuntimePredicate } : {}),
    })),
    events: events.map((item) => ({
      eventId: text(item.eventId),
      alternateBeats: Array.isArray(item.alternateBeats)
        ? item.alternateBeats as AlternateBeat[]
        : [],
      sceneMarkers: Array.isArray(item.sceneMarkers)
        ? item.sceneMarkers as SceneMarker[]
        : [],
    })),
  };
};

export const parsePackage15Runtime = ({
  packageVersion,
  manifest,
  documents,
}: {
  packageVersion: string;
  manifest: unknown;
  documents: Record<string, unknown>;
}): Package15Runtime | undefined => {
  if (packageVersion !== "1.5") return undefined;
  const manifestEnvelope = record(manifest);
  const nestedManifest = record(manifestEnvelope.manifest);
  const manifestRecord = Object.keys(nestedManifest).length
    ? { ...manifestEnvelope, ...nestedManifest }
    : manifestEnvelope;
  const rawRequired = strings(manifestRecord.requiredFeatures);
  const unsupported = rawRequired.filter((id) =>
    !(SUPPORTED_PACKAGE15_FEATURES as readonly string[]).includes(id)
  );
  if (unsupported.length) {
    throw new Error(`Nexus가 지원하지 않는 Package 1.5 필수 기능입니다: ${unsupported.join(", ")}`);
  }
  const requiredFeatures = featureList(rawRequired);
  const optionalFeatures = featureList(manifestRecord.optionalFeatures);
  const needs = (feature: Package15FeatureId) => requiredFeatures.includes(feature);
  const routeGraph = assertFormat(
    documents.routeGraph,
    ROUTE_GRAPH_FORMAT,
    "routes/route_graph.json",
    needs("multi_route_v1"),
  );
  const chapters = assertFormat(
    documents.chapters,
    CHAPTERS_FORMAT,
    "routes/chapters.json",
    needs("multi_route_v1"),
  );
  const routeLenses = assertFormat(
    documents.routeLenses,
    ROUTE_LENSES_FORMAT,
    "routes/route_lenses.json",
    false,
  );
  const revealFacts = assertFormat(
    documents.revealFacts,
    REVEAL_FACTS_FORMAT,
    "routes/reveal_facts.json",
    needs("reveal_policy_v1"),
  );
  const revealPolicies = assertFormat(
    documents.revealPolicies,
    REVEAL_POLICIES_FORMAT,
    "routes/reveal_policies.json",
    needs("reveal_policy_v1"),
  );
  const endings = assertFormat(
    documents.endings,
    ENDINGS_FORMAT,
    "routes/endings.json",
    needs("ending_meta_progress_v1"),
  );
  const flags = assertFormat(
    documents.flags,
    FLAGS_FORMAT,
    "routes/flags.json",
    needs("ending_meta_progress_v1") || needs("time_loop_v1"),
  );
  const galleries = assertFormat(documents.galleries, GALLERIES_FORMAT, "routes/galleries.json", false);
  const epilogues = assertFormat(documents.epilogues, EPILOGUES_FORMAT, "routes/epilogues.json", false);
  const checkpoints = assertFormat(documents.checkpoints, CHECKPOINTS_FORMAT, "routes/checkpoints.json", false);
  const clues = assertFormat(documents.clues, CLUES_FORMAT, "routes/clues.json", false);
  const loopPolicy = assertFormat(
    documents.loopPolicy,
    LOOP_POLICY_FORMAT,
    "loops/loop_policy.json",
    needs("time_loop_v1"),
  );
  const items = assertFormat(documents.items, ITEM_DEFINITIONS_FORMAT, "state/item_definitions.json", false);
  const zones = assertFormat(documents.zones, ZONE_DEFINITIONS_FORMAT, "state/zone_definitions.json", false);
  const worldFacts = assertFormat(
    documents.worldFacts,
    WORLD_FACT_DEFINITIONS_FORMAT,
    "state/world_fact_definitions.json",
    false,
  );
  return {
    packageVersion: "1.5",
    requiredFeatures,
    optionalFeatures,
    negotiatedFeatures: [...new Set([...requiredFeatures, ...optionalFeatures])],
    routeGraph,
    chapters,
    routeLenses,
    revealFacts,
    revealPolicies,
    endings,
    flags,
    galleries,
    epilogues,
    checkpoints,
    clues,
    loopPolicy,
    items,
    zones,
    worldFacts,
  };
};

export const package15PromptContext = (runtime: Package15Runtime): Record<string, unknown> => ({
  featureNegotiation: {
    required: runtime.requiredFeatures,
    optional: runtime.optionalFeatures,
    negotiated: runtime.negotiatedFeatures,
    unsupportedRequired: [],
  },
  routeGraph: runtime.routeGraph,
  chapters: runtime.chapters,
  routeLenses: runtime.routeLenses,
  revealFacts: runtime.revealFacts,
  revealPolicies: runtime.revealPolicies,
  endings: runtime.endings,
  loopPolicy: runtime.loopPolicy,
  registries: {
    flags: runtime.flags,
    galleries: runtime.galleries,
    epilogues: runtime.epilogues,
    checkpoints: runtime.checkpoints,
    clues: runtime.clues,
    items: runtime.items,
    zones: runtime.zones,
    worldFacts: runtime.worldFacts,
  },
  hardRules: [
    "필수 기능 협상이 완료된 Package 1.5 계약을 축소하거나 Package 1.4처럼 추측 실행하지 않는다.",
    "루트 상태는 targeting → locked → ending → completed 순서로만 진행한다.",
    "RevealPolicy가 겹치면 forbidden > hint_only > partial > full 순서로 더 제한적인 공개 범위를 적용한다.",
    "플레이어 메타 지식, 주인공 기억, NPC 지식을 서로 자동 공유하지 않는다.",
    "루프 리셋은 event_reset_behavior → entity_definition → category_state_rule → default_restore_baseline 순서를 지킨다.",
  ],
});

export const runtimePredicateSatisfied = (
  predicate: RuntimePredicate | undefined,
  context: {
    completedEventIds?: Iterable<string>;
    clocks?: Iterable<{ id: string; current: number }>;
    flags?: Record<string, boolean | number | string>;
  },
): boolean => {
  if (!predicate) return false;
  if ("allOf" in predicate) {
    return predicate.allOf.length > 0 && predicate.allOf.every((item) =>
      runtimePredicateSatisfied(item, context)
    );
  }
  if ("anyOf" in predicate) {
    return predicate.anyOf.some((item) => runtimePredicateSatisfied(item, context));
  }
  if ("not" in predicate) return !runtimePredicateSatisfied(predicate.not, context);
  if (predicate.kind === "event_completed") {
    return new Set(context.completedEventIds ?? []).has(predicate.eventId);
  }
  if (predicate.kind === "clock_at_least") {
    return [...(context.clocks ?? [])].some((clock) =>
      clock.id === predicate.clockId && clock.current >= predicate.value
    );
  }
  if (predicate.kind === "flag_equals") {
    return context.flags?.[predicate.flagId] === predicate.value;
  }
  // Zone and actor-tag predicates require an explicit structured actor ledger.
  // Unknown state is deliberately false so a reveal can never open by guess.
  return false;
};

const revealModeRank = (mode: string): number => {
  if (mode === "forbidden") return 0;
  if (mode === "hint_only") return 1;
  if (mode === "partial") return 2;
  return 3;
};

export const package15RevealGuards = (
  runtime: Package15Runtime | undefined,
  context: Parameters<typeof runtimePredicateSatisfied>[1],
): Package15RevealGuard[] => {
  if (!runtime) return [];
  const facts = Array.isArray(runtime.revealFacts.facts)
    ? runtime.revealFacts.facts.map(record).filter((fact) => text(fact.id))
    : [];
  const factMap = new Map(facts.map((fact) => [text(fact.id), fact] as const));
  const policies = Array.isArray(runtime.revealPolicies.policies)
    ? runtime.revealPolicies.policies.map(record)
    : [];
  const guards = new Map<string, Package15RevealGuard>();
  policies.forEach((policy) => {
    const rules = Array.isArray(policy.rules) ? policy.rules.map(record) : [];
    rules.forEach((rule) => {
      const factId = text(rule.factId);
      const fact = factMap.get(factId);
      if (!fact) return;
      const transitioned = runtimePredicateSatisfied(
        rule.transitionWhen as RuntimePredicate | undefined,
        context,
      );
      const candidateMode = text(transitioned ? rule.afterMode : rule.beforeMode) || "forbidden";
      const mode = (["forbidden", "hint_only", "partial", "full"].includes(candidateMode)
        ? candidateMode
        : "forbidden") as Package15RevealGuard["mode"];
      const candidate: Package15RevealGuard = {
        factId,
        label: text(fact.label) || factId,
        mode,
        protectedTerms: [...new Set([
          ...strings(fact.protectedTerms),
          ...strings(rule.forbiddenTerms),
        ].filter((term) => term.trim().length >= 2))],
        allowedSummary: text(
          transitioned ? rule.allowedSummaryAfter : rule.allowedSummaryBefore,
        ),
      };
      const current = guards.get(factId);
      if (!current || revealModeRank(candidate.mode) < revealModeRank(current.mode)) {
        guards.set(factId, candidate);
      } else if (current && revealModeRank(candidate.mode) === revealModeRank(current.mode)) {
        current.protectedTerms = [...new Set([
          ...current.protectedTerms,
          ...candidate.protectedTerms,
        ])];
        if (!current.allowedSummary && candidate.allowedSummary) {
          current.allowedSummary = candidate.allowedSummary;
        }
      }
    });
  });
  return [...guards.values()];
};
