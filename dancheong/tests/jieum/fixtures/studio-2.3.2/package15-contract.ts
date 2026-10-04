export type FeatureId =
  | "multi_route_v1"
  | "time_loop_v1"
  | "reveal_policy_v1"
  | "ending_meta_progress_v1"
  | "branch_ending_convergence_v1";
export type StoryMode =
  | "single_route"
  | "branching"
  | "multi_route"
  | "time_loop"
  | "multi_route_time_loop";
export type CompletionScope =
  | "scene_once"
  | "loop_each"
  | "worldline_once"
  | "route_meta_once";
export type ResetBehavior =
  | "reset_to_pending"
  | "preserve_completion"
  | "preserve_evidence_only"
  | "disable_after_route_lock";

export type RuntimePredicate =
  | { allOf: RuntimePredicate[] }
  | { anyOf: RuntimePredicate[] }
  | { not: RuntimePredicate }
  | { kind: "flag_equals"; flagId: string; value: boolean | number | string }
  | { kind: "flag_at_least"; flagId: string; value: number }
  | {
      kind: "choice_status";
      choiceId: string;
      status: "satisfied" | "not_satisfied" | "evaluated";
    }
  | {
      kind: "relation_at_least";
      characterId: string;
      field: "trust" | "favor" | "respect";
      value: number;
      direction: "character_to_protagonist" | "protagonist_to_character";
    }
  | { kind: "event_completed"; eventId: string }
  | { kind: "clock_at_least"; clockId: string; value: number }
  | { kind: "actor_in_zone_at_trigger"; actorId?: string; zoneId: string }
  | { kind: "actor_has_tag"; actorId?: string; tagId: string };

/** Package 1.4 optional narrative runtime extension. Package 1.5 inherits it unchanged. */
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

export type AlternativeFulfillment = {
  id: string;
  description: string;
  completionSignals: string[];
  requiredStateFacts?: string[];
  resultingEffects?: string[];
};

export type MultirouteEventExtension = {
  scope?: "common" | "route" | "global" | "ending";
  routeId?: string;
  chapterId?: string;
  expectedLoopOrdinal?: number;
  loopDay?: number;
  completionScope?: CompletionScope;
  resetBehavior?: ResetBehavior;
  revealPolicyId?: string;
  routeEntryFor?: string;
  routeLockOnComplete?: boolean;
  endingFlagsAdd?: string[];
  endingFlagsRemove?: string[];
  alternativeFulfillment?: AlternativeFulfillment[];
};

export type CommonArcDefinition = {
  id: string;
  name: string;
  chapterIds: string[];
  routeLensIds: string[];
};
export type UnlockCondition = {
  allOf?: UnlockCondition[];
  anyOf?: UnlockCondition[];
  not?: UnlockCondition;
  routeCleared?: string;
  endingSeen?: string;
  flagSet?: string;
};
export type RouteDefinition = {
  id: string;
  name: string;
  description: string;
  order: number;
  heroineCharacterId?: string;
  initiallyUnlocked: boolean;
  unlockCondition?: UnlockCondition;
  recommendedPrerequisiteRouteIds: string[];
  lensId?: string;
  entryEventId: string;
  lockEventId: string;
  chapterIds: string[];
  endingIds: string[];
  revealPolicyIds: string[];
  spoilerWarning?: string;
};
export type ChapterDefinition = {
  id: string;
  scope: "common" | "route";
  routeId?: string;
  ordinal: number;
  name: string;
  eventIds: string[];
};
export type RouteLens = {
  id: string;
  routeId: string;
  focusCharacterIds: string[];
  focusClueIds: string[];
  focusRules: string[];
  revealPolicyIds: string[];
  recommendedImageTags: string[];
};

export type ActorSelector =
  | { kind: "actor_ids"; actorIds: string[] }
  | {
      kind: "actors_matching";
      where: RuntimePredicate;
      includePlayer?: boolean;
    };
export type LoopStateRule = {
  category:
    | "date_time"
    | "location"
    | "protagonist_memory"
    | "npc_memory"
    | "relations"
    | "inventory"
    | "story_ledger"
    | "world_facts"
    | "autonomy_state";
  action:
    | "restore_baseline"
    | "preserve"
    | "preserve_tagged"
    | "conditional_memory_transfer"
    | "recalculate";
  preserveTags?: string[];
  when?: RuntimePredicate;
  memoryTransfer?: {
    subjectSelector: ActorSelector;
    source: "pre_reset_actor_memory";
    target: "baseline_same_actor_body";
  };
};
export type LoopPolicy = {
  format: "RELAY_NOVEL_LOOP_POLICY_V1";
  enabled: boolean;
  resetPoint: { date: string; time: string; locationId?: string };
  activeWindow: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  };
  trigger: { allOf: RuntimePredicate[] };
  resetPrecedence: [
    "event_reset_behavior",
    "entity_definition",
    "category_state_rule",
    "default_restore_baseline",
  ];
  stateRules: LoopStateRule[];
  protagonistDeathMode: "game_over" | "loop" | "package_defined";
  maxLoops: number | null;
};

export type RevealMode = "forbidden" | "hint_only" | "partial" | "full";
export type RevealFactDefinition = {
  id: string;
  label: string;
  description: string;
  protectedTerms: string[];
};
export type RevealRule = {
  factId: string;
  beforeMode: RevealMode;
  afterMode: RevealMode;
  transitionWhen?: RuntimePredicate;
  allowedSummaryBefore?: string;
  allowedSummaryAfter?: string;
  forbiddenTerms?: string[];
};
export type RevealPolicy = {
  id: string;
  scope: "global" | "common" | "route";
  routeId?: string;
  chapterIdFrom?: string;
  chapterIdTo?: string;
  rules: RevealRule[];
};
export type AiRouteContext = { revealPolicyIds: string[]; routeCanon?: string };
export type AiKnowledgeScopes = {
  playerMeta: string;
  protagonist: string;
  npc: string;
};

export type RegistryEntry = { id: string; label: string; description?: string };
export type FlagDefinition = RegistryEntry & {
  valueType: "boolean" | "number" | "string";
  defaultValue: boolean | number | string;
  scope: "session" | "worldline" | "route_meta" | "work_meta";
};
export type GalleryDefinition = RegistryEntry & { mediaAssetIds: string[] };
export type EpilogueDefinition = RegistryEntry & { chapterId: string };
export type CheckpointDefinition = RegistryEntry & {
  chapterId: string;
  eventId?: string;
};
export type ClueDefinition = RegistryEntry & { revealFactIds: string[] };
export type ItemDefinition = RegistryEntry & {
  tags: string[];
  resetBehavior?: "restore_baseline" | "preserve";
};
export type ZoneDefinition = RegistryEntry & {
  locationId: string;
  tags: string[];
};
export type WorldFactDefinition = RegistryEntry & { tags: string[] };
export type EndingDefinition = {
  id: string;
  routeId: string;
  name: string;
  type: "bad" | "normal" | "good" | "true" | "final";
  priority: number;
  condition: {
    completedEventIds?: string[];
    requiredFlags?: string[];
    forbiddenFlags?: string[];
    minimumRelations?: Array<{
      characterId: string;
      field: "trust" | "favor" | "respect";
      value: number;
    }>;
  };
  effects: Array<{
    kind:
      | "unlock_route"
      | "record_ending"
      | "unlock_gallery"
      | "unlock_epilogue";
    targetId: string;
  }>;
  returnPolicy: "stay_ended" | "return_checkpoint" | "new_worldline";
  checkpointId?: string;
  terminalEventId?: string;
  exclusiveGroupId?: string;
};

export type ChoiceRecordDefinition = {
  id: string;
  name: string;
  sourceEventId: string;
  criterion: string;
  evaluationSource: "PUBLIC_PROSE";
  applyPolicy: "ONCE_PER_EVENT";
  satisfiedEffect?: {
    kind: "increment_flag" | "set_flag";
    flagId: string;
    value: number | boolean | string;
  };
};

export type BranchRuleDefinition = {
  id: string;
  label: string;
  when: RuntimePredicate;
  nextEventId: string;
};
export type BranchDecisionDefinition = {
  id: string;
  name: string;
  decisionEventId: string;
  rules: BranchRuleDefinition[];
  matchPolicy: "FIRST_AUTHORED_MATCH";
  recoveryAttempts: 0 | 1 | 2;
  fallback: {
    nextEventId: string;
    acceptsUnevaluated: boolean;
    narrativeGuidance: string;
  };
  unresolvedPolicy: "FALLBACK_WITHOUT_ASSERTING_CONDITION";
};

export type BranchEndingContract = {
  enabled: boolean;
  primaryEndingGroupId: string;
  choiceRecords: ChoiceRecordDefinition[];
  decisions: BranchDecisionDefinition[];
};

export type Package15Design = {
  enabled: boolean;
  storyMode: StoryMode;
  requiredFeatures: FeatureId[];
  optionalFeatures: FeatureId[];
  defaultUnlockMode: "canonical_order" | "all_open";
  allowAllOpenOverride: boolean;
  commonArc: CommonArcDefinition;
  routes: RouteDefinition[];
  chapters: ChapterDefinition[];
  routeLenses: RouteLens[];
  revealFacts: RevealFactDefinition[];
  revealPolicies: RevealPolicy[];
  endings: EndingDefinition[];
  branchEnding: BranchEndingContract;
  flags: FlagDefinition[];
  galleries: GalleryDefinition[];
  epilogues: EpilogueDefinition[];
  checkpoints: CheckpointDefinition[];
  clues: ClueDefinition[];
  items: ItemDefinition[];
  zones: ZoneDefinition[];
  worldFacts: WorldFactDefinition[];
  loopPolicy: LoopPolicy;
};

export const makePackage15Design = (): Package15Design => ({
  enabled: false,
  storyMode: "single_route",
  requiredFeatures: ["ending_meta_progress_v1"],
  optionalFeatures: [],
  defaultUnlockMode: "canonical_order",
  allowAllOpenOverride: false,
  commonArc: { id: "COMMON", name: "공통편", chapterIds: [], routeLensIds: [] },
  routes: [],
  chapters: [],
  routeLenses: [],
  revealFacts: [],
  revealPolicies: [],
  endings: [],
  flags: [],
  branchEnding: {
    enabled: false,
    primaryEndingGroupId: "primary",
    choiceRecords: [],
    decisions: [],
  },
  galleries: [],
  epilogues: [],
  checkpoints: [],
  clues: [],
  items: [],
  zones: [],
  worldFacts: [],
  loopPolicy: {
    format: "RELAY_NOVEL_LOOP_POLICY_V1",
    enabled: false,
    resetPoint: { date: "", time: "" },
    activeWindow: { startDate: "", startTime: "", endDate: "", endTime: "" },
    trigger: { allOf: [] },
    resetPrecedence: [
      "event_reset_behavior",
      "entity_definition",
      "category_state_rule",
      "default_restore_baseline",
    ],
    stateRules: [],
    protagonistDeathMode: "game_over",
    maxLoops: null,
  },
});

export const normalizePackage15Design = (raw: unknown): Package15Design => {
  const base = makePackage15Design();
  const source =
    raw && typeof raw === "object" ? (raw as Partial<Package15Design>) : {};
  const list = <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value.filter(Boolean) as T[]) : [];
  const loopSource: Partial<LoopPolicy> =
    source.loopPolicy && typeof source.loopPolicy === "object"
      ? source.loopPolicy
      : {};
  const branchSource: Partial<BranchEndingContract> =
    source.branchEnding && typeof source.branchEnding === "object"
      ? source.branchEnding
      : {};
  return {
    ...base,
    ...source,
    requiredFeatures: list<FeatureId>(source.requiredFeatures),
    optionalFeatures: list<FeatureId>(source.optionalFeatures),
    commonArc: {
      ...base.commonArc,
      ...(source.commonArc ?? {}),
      chapterIds: list<string>(source.commonArc?.chapterIds),
      routeLensIds: list<string>(source.commonArc?.routeLensIds),
    },
    routes: list<RouteDefinition>(source.routes),
    chapters: list<ChapterDefinition>(source.chapters),
    routeLenses: list<RouteLens>(source.routeLenses),
    revealFacts: list<RevealFactDefinition>(source.revealFacts),
    revealPolicies: list<RevealPolicy>(source.revealPolicies),
    endings: list<EndingDefinition>(source.endings),
    branchEnding: {
      ...base.branchEnding,
      ...branchSource,
      choiceRecords: list<ChoiceRecordDefinition>(
        branchSource.choiceRecords,
      ).map((choice) => ({
        ...choice,
        evaluationSource: "PUBLIC_PROSE",
        applyPolicy: "ONCE_PER_EVENT",
      })),
      decisions: list<BranchDecisionDefinition>(branchSource.decisions).map(
        (decision) => ({
          ...decision,
          rules: list<BranchRuleDefinition>(decision.rules),
          matchPolicy: "FIRST_AUTHORED_MATCH",
          recoveryAttempts: ([0, 1, 2].includes(
            Number(decision.recoveryAttempts),
          )
            ? Number(decision.recoveryAttempts)
            : 1) as 0 | 1 | 2,
          fallback: decision.fallback
            ? {
                nextEventId: String(decision.fallback.nextEventId ?? ""),
                acceptsUnevaluated:
                  decision.fallback.acceptsUnevaluated !== false,
                narrativeGuidance: String(
                  decision.fallback.narrativeGuidance ?? "",
                ),
              }
            : {
                nextEventId: "",
                acceptsUnevaluated: true,
                narrativeGuidance: "",
              },
          unresolvedPolicy: "FALLBACK_WITHOUT_ASSERTING_CONDITION",
        }),
      ),
    },
    flags: list<FlagDefinition>(source.flags),
    galleries: list<GalleryDefinition>(source.galleries),
    epilogues: list<EpilogueDefinition>(source.epilogues),
    checkpoints: list<CheckpointDefinition>(source.checkpoints),
    clues: list<ClueDefinition>(source.clues),
    items: list<ItemDefinition>(source.items),
    zones: list<ZoneDefinition>(source.zones),
    worldFacts: list<WorldFactDefinition>(source.worldFacts),
    loopPolicy: {
      ...base.loopPolicy,
      ...loopSource,
      resetPoint: {
        ...base.loopPolicy.resetPoint,
        ...(loopSource.resetPoint ?? {}),
      },
      activeWindow: {
        ...base.loopPolicy.activeWindow,
        ...(loopSource.activeWindow ?? {}),
      },
      trigger: { allOf: list<RuntimePredicate>(loopSource.trigger?.allOf) },
      resetPrecedence: base.loopPolicy.resetPrecedence,
      stateRules: list<LoopStateRule>(loopSource.stateRules),
    },
  };
};
