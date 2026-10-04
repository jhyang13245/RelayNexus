import { strFromU8, unzipSync } from "fflate";
import {
  BlobReader,
  Uint8ArrayWriter,
  ZipReader,
} from "@zip.js/zip.js";

import { sanitizeRecommendedReplies } from "./disclosure";
import type { EngineUsage } from "./engine";
import type { ImageCostBreakdown } from "./api-cost";
import {
  parseInstantStoryRuntime,
  type InstantStoryRuntime,
} from "./instant-story-runtime";
import {
  parseNarrativeRuntimeExtension,
  parsePackage15Runtime,
  type AlternateBeat,
  type NarrativeRuntimeExtension,
  type Package15Runtime,
  type RuntimePredicate,
  type SceneMarker,
} from "./package15-runtime";

let localIdCounter = 0;

export const createId = (): string => {
  localIdCounter += 1;
  // This function is also used while the built-in scenario is normalised at
  // module load. Cloudflare Workers forbid random-value generation in global
  // scope, so IDs must remain deterministic and side-effect free here.
  return `relay-${localIdCounter.toString(36)}`;
};

export type StoryBlock = {
  id: string;
  type: "narration" | "dialogue" | "system";
  text: string;
  speakerId?: string;
  speakerName?: string;
  emotion?: string;
  mediaAssetId?: string;
};

export type ScenarioMediaAsset = {
  id: string;
  path: string;
  kind: "character" | "scene";
  characterId: string;
  characterName: string;
  label: string;
  emotionTags: string[];
  sceneTags: string[];
  placement: "after_block" | "turn_end";
  priority: number;
  alt: string;
  caption: string;
  source?: "package" | "generated";
  canonical?: boolean;
  triggerId?: string;
  triggerSourceId?: string;
  /** Studio Asset-Once physical-original identity. */
  assetRef?: string;
  /** Verified uncompressed package byte length. */
  byteLength?: number;
  /** Studio-declared SHA-256, retained after import verification. */
  sha256?: string;
  /** Restoration metadata only; never used as the physical identity key. */
  dataUrlHeader?: string;
  dataUrl?: string;
};

export const STUDIO_MEDIA_MANIFEST_FORMAT =
  "RELAY_NOVEL_MEDIA_ASSET_MANIFEST_V2" as const;
export const STUDIO_ASSET_ONCE_FORMAT =
  "RELAY_NOVEL_ASSET_ONCE_V1" as const;
export const STUDIO_AI_WORLD_CONTEXT_FORMAT =
  "RELAY_NOVEL_AI_WORLD_CONTEXT_RUNTIME_V1" as const;

export type PackagePhysicalAsset = {
  assetRef: string;
  path: string;
  sha256: string;
  byteLength: number;
  logicalAssetIds: string[];
};

export type PackageAssetLedger = {
  format: typeof STUDIO_ASSET_ONCE_FORMAT;
  integrity: "SHA-256";
  logicalAssetCount: number;
  physicalAssetCount: number;
  originalAssetBytes: number;
  storedAssetBytes: number;
  assets: PackagePhysicalAsset[];
};

export type AiWorldContextRuntime = {
  format: typeof STUDIO_AI_WORLD_CONTEXT_FORMAT;
  enabled: boolean;
  liveEvaluation: boolean;
  execution: {
    mode: string;
    evaluationMoments: string[];
    updateDepth: string;
    knowledgePolicy: string;
  };
  worldContext: {
    premise: string;
    referenceFramework: string;
    referenceUsage: string;
    localContext: string;
    enrichmentPriorities: string;
    protectedCanon: string;
    avoidElements: string;
    originalityRule: string;
    spoilerRule: string;
  };
  referenceCharacterResearch: {
    enabled: boolean;
    lookupMode: string;
    characters: string[];
    researchScope: string;
    sourcePriority: string;
    canonCutoff: string;
    cacheMode: string;
    lookupTiming: {
      sessionStart: boolean;
      beforeFirstAppearance: boolean;
      onCanonConflict: boolean;
      everyTurn: boolean;
    };
    recordSourcesInLedger: boolean;
  };
};

export type PackageCompatibility = {
  studioPackage14: boolean;
  studioPackage15: boolean;
  supportedPackageVersion: boolean;
  mediaManifestV2: boolean;
  assetOnceV1: boolean;
  integrityVerified: boolean;
  aiWorldContextRuntimeV1: boolean;
  narrativeRuntimeExtensionV1: boolean;
  instantStoryRuntimeV1: boolean;
  instantStoryRuntimeV2: boolean;
  package15FeatureNegotiated: boolean;
  fullSupport: boolean;
  warnings: string[];
};

export type ScenarioImageTrigger = {
  id: string;
  name: string;
  enabled: boolean;
  visibility: string;
  triggerType: string;
  sourceId: string;
  threshold: number;
  storyProgress: string;
  customCondition: string;
  mode: string;
  characterIds: string[];
  prompt: string;
  negativePrompt: string;
  once: boolean;
  priority: number;
  outputPosition: string;
};

/**
 * Trigger-authored scene assets are controlled by the simulator, not by the
 * prose model.  Keeping this distinction explicit prevents a valid package
 * asset ID from bypassing its event/clock/story condition.
 */
export const isTriggerBoundMediaAsset = (
  asset: Pick<ScenarioMediaAsset, "triggerId" | "triggerSourceId">,
): boolean => Boolean(asset.triggerId?.trim() || asset.triggerSourceId?.trim());

export type Character = {
  id: string;
  name: string;
  /** Public-safe alternate names, titles and contextual labels for one entity. */
  aliases?: string[];
  role: string;
  affiliation: string;
  personality: string;
  speechStyle: string;
  appearance: string;
  status: string;
  publicInfo: string;
  hiddenInfo: string;
  inventory: string;
  skills: string;
  assets: string;
  preRevealAlias?: string;
  revealCondition?: RuntimePredicate;
  isPlayer: boolean;
};

export type CharacterRelation = {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  trust: number;
  favor: number;
  fear: number;
  respect: number;
  suspicion: number;
  hostility: number;
  dependency: number;
  publicSummary: string;
  hiddenNotes: string;
};

export type ScenarioFaction = {
  id: string;
  name: string;
  leader: string;
  officialGoal: string;
  hiddenGoal: string;
  resources: string;
  territory: string;
  allies: string;
  enemies: string;
  currentPlan: string;
};

export type AutonomyActor = {
  id: string;
  entityType: "character" | "faction";
  entityId: string;
  enabled: boolean;
  activityTier: "nearby" | "regional" | "distant" | "event_only";
  currentLocation: string;
  locationVisibility: "Public" | "Hidden";
  shortTermGoal: string;
  mediumTermGoal: string;
  longTermGoal: string;
  goalPriority: number;
  currentPlan: string;
  nextAction: string;
  actionCadence:
    | "every_turn"
    | "every_2_turns"
    | "every_3_to_5_turns"
    | "on_trigger";
  knowledge: string;
  misinformation: string;
  resources: string;
  constraints: string;
  riskTolerance: "low" | "moderate" | "high" | "extreme";
  cooperationRules: string;
  conflictRules: string;
  travelRules: string;
  successOutcome: string;
  partialOutcome: string;
  failureOutcome: string;
  offscreenEnabled: boolean;
  canFailOffscreen: boolean;
  revealTraces: boolean;
};

export type AutonomyRuntimeDefinition = {
  enabled: boolean;
  maxActionsPerTurn: number;
  factionTickTurns: number;
  deterministicSeed: boolean;
  requireTravelTime: boolean;
  enforceKnowledgeBounds: boolean;
  enforceResourceBounds: boolean;
  allowOffscreenFailure: boolean;
  tracePolicy:
    | "observable_only"
    | "rumors_allowed"
    | "silent_until_discovered";
  authorRules: string[];
  hardRules: string[];
};

export type RelationshipMemoryEffect = {
  trust: number;
  favor: number;
  fear: number;
  respect: number;
  suspicion: number;
  hostility: number;
  dependency: number;
};

export type RelationshipMemory = {
  id: string;
  relationId: string;
  sourceId: string;
  targetId: string;
  turnLabel: string;
  eventId: string;
  type:
    | "promise_kept"
    | "promise_broken"
    | "rescue"
    | "betrayal"
    | "debt"
    | "secret_shared"
    | "humiliation"
    | "shared_success"
    | "shared_failure"
    | "custom";
  title: string;
  summary: string;
  cause: string;
  visibility: "Public" | "Hidden";
  importance: number;
  permanence: "temporary" | "decaying" | "permanent";
  effects: RelationshipMemoryEffect;
  active: boolean;
  unresolved: boolean;
  resolutionConditions: string;
  tags: string;
  createdAt: string;
  createdTurn: number;
};

export type RelationshipMemoryRuntimeDefinition = {
  enabled: boolean;
  deriveScoresFromMemory: boolean;
  keepContradictoryMemories: boolean;
  decayEnabled: boolean;
  maxActiveMemoriesPerRelation: number;
  displayPublicReasonsInHud: boolean;
  authorRules: string[];
  hardRules: string[];
};

export type EventClock = {
  id: string;
  name: string;
  current: number;
  maximum: number;
  visibility: string;
  publicHint: string;
  hiddenNotes: string;
};

export type ScenarioEvent = {
  id: string;
  name: string;
  type: string;
  visibility: string;
  status: string;
  priority: number;
  timeWindow?: string;
  conditions: string;
  cancelConditions?: string;
  participants?: string;
  effects?: string;
  onSuccess?: string;
  onFailure?: string;
  followUp?: string;
  description: string;
  playerCanIntervene?: boolean;
  required?: boolean;
  sequence?: number;
  completionSignals?: string;
  requiredItems?: string;
  requiredDialogue?: string;
  requiredSpeakerId?: string;
  recoveryAlternatives?: string;
  preservePlayerChoice?: boolean;
  endSceneAfterCompletion?: boolean;
  /**
   * Relay Nexus extension. Constraints are durable scene rules, not events:
   * they never advance the route cursor and can never be resolved.
   */
  kind?: "event" | "constraint" | "compound";
  appliesTo?: string[];
  rules?: string[];
  beats?: ScenarioEventBeat[];
  alternateBeats?: AlternateBeat[];
  sceneMarkers?: SceneMarker[];
  multiroute?: Record<string, unknown>;
};

export type ScenarioEventBeat = {
  id: string;
  order: number;
  title: string;
  content: string;
  viewpoint?: string;
  requiredSignals?: string;
};

export type Opening = {
  currentSituation: string;
  immediateProblem: string;
  knownRisks: string;
  hiddenRisks: string;
  openingCharacters: string;
  openingLocation: string;
  openingEvent: string;
  firstGoal: string;
  openingLine: string;
};

export type ScenarioStyle = {
  narrationPerson: string;
  proseStyle: string;
  dialogueStyle: string;
  descriptionDensity: string;
  customRules: string;
};

export type TurnPresentation = {
  recommendedReplies: {
    enabled: boolean;
    count: number;
    showRisk: boolean;
  };
  sceneImage: {
    enabled: boolean;
    frequency: string;
    aspectRatio: string;
    styleHint: string;
  };
};

export type StatusVisibility =
  | "public"
  | "encountered"
  | "conditional"
  | "hidden";

export type StatusFieldKind = "number" | "text" | "list";

export type StatusRank = {
  label: string;
  minimum: number;
};

export type StatusFieldDefinition = {
  id: string;
  label: string;
  sectionId: string;
  sectionLabel: string;
  kind: StatusFieldKind;
  visibility: StatusVisibility;
  source: string;
  characterId: string;
  icon: string;
  unit?: string;
  order: number;
  minimum?: number;
  maximum?: number;
  maxDelta: number;
  showDelta: boolean;
  summary: boolean;
  updateRule: string;
  ranks: StatusRank[];
  relationshipDisplayId?: string;
  relationshipEntityType?: "character" | "faction";
  relationshipEntityId?: string;
  relationshipPart?: "sentence" | "stat" | "symbol";
  relationshipLabel?: string;
};

export type RelationshipDisplayEntryDefinition = {
  id: string;
  entityType: "character" | "faction";
  entityId: string;
  label: string;
  order: number;
  visibility: "public" | "met_only" | "conditional";
  revealRule: string;
  displayParts: Array<"sentence" | "stat" | "symbol">;
  sentence: string;
  stat: {
    label: string;
    current: number;
    minimum: number;
    maximum: number;
    showDelta: boolean;
  };
  symbol: string;
  updateRule: string;
};

export type RelationshipDisplayDefinition = {
  format: "RELAY_NOVEL_RELATIONSHIP_DISPLAY_V1";
  enabled: boolean;
  allowCombinedParts: boolean;
  supportedParts: Array<"sentence" | "stat" | "symbol">;
  entries: RelationshipDisplayEntryDefinition[];
  updatePolicy: string;
};

export type StatusSectionDefinition = {
  id: string;
  label: string;
  icon: string;
  order: number;
  enabled: boolean;
};

export type StatusWindowDefinition = {
  enabled: boolean;
  title: string;
  displayMode: "full" | "summary" | "changes";
  defaultExpanded: boolean;
  showTurnDelta: boolean;
  sections: StatusSectionDefinition[];
  fields: StatusFieldDefinition[];
  disclosureRules: string[];
  relationshipDisplay?: RelationshipDisplayDefinition;
};

export type StatusValue = string | number | boolean | string[];

export type RuntimeStatusEntry = {
  fieldId: string;
  value: StatusValue;
  grade: string;
  revealed: boolean;
  updatedTurn: number;
};

export type StatusLedgerChange = {
  fieldId: string;
  operation: "set" | "increment" | "add" | "remove" | "reveal";
  numericDelta: number;
  value: string;
  items: string[];
  grade: string;
  reveal: boolean;
  reason: string;
};

export type PublicStatusItem = {
  id: string;
  label: string;
  kind: StatusFieldKind;
  icon: string;
  unit?: string;
  value: StatusValue;
  displayValue: string;
  grade: string;
  maximum?: number;
  delta?: number;
  reason: string;
};

export type PublicStatusSection = {
  id: string;
  label: string;
  icon: string;
  items: PublicStatusItem[];
};

export type PublicStatusRelation = {
  characterId: string;
  name: string;
  relationType: string;
  trust: number;
  delta: number;
  reasonTitle: string;
  reasonSummary: string;
};

export type PublicStatusRelationshipDisplay = {
  id: string;
  entityType: "character" | "faction";
  entityId: string;
  label: string;
  displayParts: Array<"sentence" | "stat" | "symbol">;
  sentence?: string;
  stat?: {
    label: string;
    current: number;
    minimum: number;
    maximum: number;
    delta?: number;
  };
  symbol?: string;
  reason: string;
};

export type PublicWorldTrace = {
  id: string;
  turn: number;
  day?: number;
  date?: string;
  weekday?: string;
  time?: string;
  text: string;
  kind: "observable" | "rumor" | "discovered";
};

export type PublicStatusSnapshot = {
  turn: number;
  title: string;
  displayMode: "full" | "summary" | "changes";
  defaultExpanded: boolean;
  day: number;
  date: string;
  weekday: string;
  time: string;
  weather: string;
  location: string;
  sections: PublicStatusSection[];
  relations: PublicStatusRelation[];
  relationshipDisplays?: PublicStatusRelationshipDisplay[];
  worldTraces: PublicWorldTrace[];
  changedCount: number;
};

export type ScenarioPack = {
  packageVersion: string;
  engineVersion: string;
  projectId: string;
  title: string;
  genre: string;
  tone: string;
  startDate: string;
  startTime: string;
  startLocation: string;
  randomSeed: number;
  player: Character;
  npcs: Character[];
  factions: ScenarioFaction[];
  relations: CharacterRelation[];
  clocks: EventClock[];
  events: ScenarioEvent[];
  constraints: ScenarioEvent[];
  opening: Opening;
  style: ScenarioStyle;
  turnPresentation: TurnPresentation;
  statusWindow: StatusWindowDefinition;
  initialStatusLedger: RuntimeStatusEntry[];
  autonomyActors: AutonomyActor[];
  autonomyRuntime: AutonomyRuntimeDefinition;
  initialRelationshipMemories: RelationshipMemory[];
  relationshipMemoryRuntime: RelationshipMemoryRuntimeDefinition;
  difficulty: Record<string, unknown>;
  world: Record<string, unknown>;
  gmData: Record<string, unknown>;
  mediaAssets: ScenarioMediaAsset[];
  assetLedger?: PackageAssetLedger;
  aiWorldContext?: AiWorldContextRuntime;
  narrativeRuntime?: NarrativeRuntimeExtension;
  instantStoryRuntime?: InstantStoryRuntime;
  package15Runtime?: Package15Runtime;
  compatibility?: PackageCompatibility;
  imageTriggers?: ScenarioImageTrigger[];
  rawProject: Record<string, unknown>;
};

export type NarrativeVariable = {
  id: string;
  label: string;
  detail: string;
  visibility: "public" | "hidden";
  reason: string;
  status: "active" | "resolved";
  createdTurn: number;
};

export type SessionCanonKind =
  | "player_hypothesis"
  | "refuted_hypothesis"
  | "confirmed_reveal"
  | "branch_canon"
  | "scene_fact"
  | "pending_consequence";

export type SessionCanonTruth =
  | "unconfirmed"
  | "refuted"
  | "confirmed"
  | "pending";

/**
 * Server-authoritative memory of facts created or tested during play. Package
 * fixedCanon remains immutable; this ledger remembers every accepted branch,
 * observed scene fact, unresolved guess and consequence without flattening
 * them into an ambiguous prose summary.
 */
export type SessionCanonEntry = {
  id: string;
  kind: SessionCanonKind;
  statement: string;
  truth: SessionCanonTruth;
  origin: "player" | "scene";
  subjectIds: string[];
  evidence: string;
  consequence: string;
  relatedEventIds: string[];
  createdTurn: number;
  updatedTurn: number;
  active: boolean;
};

export type SessionCanonUpdate = Pick<
  SessionCanonEntry,
  "kind" | "statement" | "subjectIds" | "evidence" | "consequence" | "relatedEventIds"
>;

export const STORY_ROUTE_PROGRESS_VARIABLE_ID =
  "RELAY_SERVER_STORY_ROUTE_PROGRESS";

export type CharacterVisualProfile = {
  characterId: string;
  characterName: string;
  appearancePrompt: string;
  assetId: string;
  source: "package" | "generated" | "pending";
  introducedTurn: number;
};

export type CharacterVisualCue = {
  blockIndex: number;
  characterId: string;
  characterName: string;
  importance: "major" | "supporting";
  isFirstMajorAppearance: boolean;
  appearancePrompt: string;
  reason: string;
  canonicalAssetId: string;
  source: "package" | "generated" | "pending";
};

export type RuntimeRelation = {
  relationId: string;
  sourceId: string;
  targetId: string;
  characterId: string;
  name: string;
  relationType: string;
  trust: number;
  publicTrust: number;
  favor: number;
  fear: number;
  respect: number;
  suspicion: number;
  hostility: number;
  dependency: number;
};

export type RuntimeAutonomyActor = {
  actorId: string;
  entityType: "character" | "faction";
  entityId: string;
  enabled: boolean;
  currentLocation: string;
  resources: string;
  currentPlan: string;
  nextAction: string;
  knowledge: string;
  misinformation: string;
  lastActionTurn: number;
  actionAttempts: number;
};

export type AutonomyActionOutcome = {
  id: string;
  actorId: string;
  turn: number;
  day?: number;
  date?: string;
  weekday?: string;
  time?: string;
  intent: string;
  outcome: "success" | "partial" | "failure" | "blocked";
  locationBefore: string;
  locationAfter: string;
  resourcesSpent: string[];
  evidenceUsed: string[];
  worldMutations: string[];
  trace: string;
  traceVisibility: "hidden" | "observable" | "rumor" | "discovered";
  reason: string;
};

export type RuntimeWorldFact = {
  id: string;
  actorId: string;
  turn: number;
  day?: number;
  date?: string;
  weekday?: string;
  time?: string;
  text: string;
};

export type RuntimeClock = EventClock;

export type ImageQuality = "low" | "medium";
export type ImageResolution = "360p" | "480p";
export type ImageAspect = "landscape" | "portrait" | "square";
export type SceneImageInterval = 0 | 2 | 5 | 10 | 20;

export const normalizeImageQuality = (value: unknown): ImageQuality =>
  value === "low" ? "low" : "medium";

export const normalizeImageResolution = (value: unknown): ImageResolution =>
  value === "360p" ? "360p" : "480p";

export const normalizeImageAspect = (
  value: unknown,
  fallback: ImageAspect = "landscape",
): ImageAspect => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "portrait" ||
    normalized === "vertical" ||
    normalized === "세로" ||
    normalized === "3:4" ||
    normalized === "9:16"
  ) return "portrait";
  if (
    normalized === "square" ||
    normalized === "정사각" ||
    normalized === "1:1"
  ) return "square";
  if (
    normalized === "landscape" ||
    normalized === "horizontal" ||
    normalized === "가로" ||
    normalized === "16:9"
  ) return "landscape";
  return fallback;
};

export const normalizeSceneImageInterval = (
  value: unknown,
  fallback: SceneImageInterval = 5,
): SceneImageInterval => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.match(/\d+/)?.[0])
      : Number.NaN;
  return parsed === 0 || parsed === 2 || parsed === 5 || parsed === 10 || parsed === 20
    ? parsed
    : fallback;
};

export type RuntimeChronology = {
  day: number;
  date: string;
  weekday: string;
  time: string;
};

export type CharacterResearchSource = {
  title: string;
  url: string;
};

export type CharacterResearchCacheEntry = {
  characterName: string;
  summary: string;
  canonCutoff: string;
  researchedAt: string;
  sources: CharacterResearchSource[];
};

export type RuntimeState = RuntimeChronology & {
  turn: number;
  weather: string;
  location: string;
  status: string[];
  inventory: string[];
  relations: RuntimeRelation[];
  encounteredCharacterIds: string[];
  clocks: RuntimeClock[];
  sceneSummary: string;
  memories: string[];
  sessionCanonLedger: SessionCanonEntry[];
  variables: NarrativeVariable[];
  characterVisuals: CharacterVisualProfile[];
  statusLedger: RuntimeStatusEntry[];
  lastStatusChanges: StatusLedgerChange[];
  autonomyActors: RuntimeAutonomyActor[];
  autonomyLog: AutonomyActionOutcome[];
  worldFacts: RuntimeWorldFact[];
  relationshipMemories: RelationshipMemory[];
  lastRelationshipMemoryIds: string[];
  observableTraces: PublicWorldTrace[];
  characterResearchCache: CharacterResearchCacheEntry[];
  imageEvery: SceneImageInterval;
  imageQuality: ImageQuality;
  imageResolution: ImageResolution;
  imageAspect: ImageAspect;
};

export type RecommendedReply = {
  label: string;
  risk: "낮음" | "보통" | "높음";
};

export type TurnRecord = {
  id: string;
  turn: number;
  /** Relay Nexus app version that generated this measured turn. */
  appVersion?: string;
  role: "opening" | "exchange";
  userText?: string;
  advanceMode?: "player" | "canonical";
  /** Canonical authored prose retained before UI paragraph projection. */
  narration?: string;
  /** Image API spend attributed to this turn (scene + first-major-character visuals). */
  imageCostUsd?: number;
  /** Measured token and modality breakdown for every image request on this turn. */
  imageCosts?: ImageCostBreakdown[];
  blocks: StoryBlock[];
  recommendations: RecommendedReply[];
  createdAt: string;
  imagePrompt?: string;
  imageUrl?: string;
  imageQuality?: ImageQuality;
  imageResolution?: ImageResolution;
  imageAspect?: ImageAspect;
  imageReferenceAssetIds?: string[];
  characterVisuals?: CharacterVisualCue[];
  /** Turn-local text-generation cost and rewrite telemetry. */
  usage?: EngineUsage;
  statusSnapshot?: PublicStatusSnapshot;
  /**
   * Full private runtime checkpoint after this turn. Unlike statusSnapshot,
   * this also contains hidden event ledgers, compound beats, NPC autonomy,
   * relationship memories, inventory, and the authoritative world clock.
   */
  runtimeSnapshot?: RuntimeState;
};

export type LongTermMemoryRecord = {
  id: string;
  sourceTurnId: string;
  turn: number;
  day: number;
  date: string;
  weekday: string;
  time: string;
  location: string;
  title: string;
  summary: string;
  canonEntries?: SessionCanonEntry[];
  createdAt: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const number = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const candidate = text(value).trim();
    if (candidate) return candidate;
  }
  return "";
};

const dateFromText = (value: unknown): string => {
  const candidate = text(value).normalize("NFKC");
  const separated = candidate.match(
    /(?:^|\D)((?:19|20)\d{2})[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12]\d|3[01])(?:\D|$)/u,
  );
  if (separated) {
    return `${separated[1]}-${separated[2].padStart(2, "0")}-${separated[3].padStart(2, "0")}`;
  }
  const compact = candidate.match(
    /(?:^|\D)((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:\D|$)/u,
  );
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : "";
};

const timeFromText = (value: unknown): string => {
  const candidate = text(value).normalize("NFKC");
  const numericMatch = candidate.match(
    /(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\D|$)/u,
  );
  if (numericMatch) {
    return `${numericMatch[1].padStart(2, "0")}:${numericMatch[2]}`;
  }
  const koreanMatch = candidate.match(
    /(?:^|\s)(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?(?:\s|[,，.!?]|$)/u,
  );
  if (!koreanMatch) return "";
  let hour = Number(koreanMatch[2]);
  const minute = Math.min(59, Number(koreanMatch[3] ?? 0));
  if (koreanMatch[1] === "오후" && hour < 12) hour += 12;
  if (koreanMatch[1] === "오전" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/**
 * A package can carry a future appointment or delivery time in startTime even
 * though its opening prose begins earlier. The prose is the authoritative
 * clock for a fresh story and for the opening HUD of restored packages.
 */
export const scenarioOpeningTime = (
  pack: Pick<ScenarioPack, "opening" | "startTime">,
): string =>
  timeFromText(pack.opening.openingLine) ||
  timeFromText(pack.opening.currentSituation) ||
  pack.startTime ||
  "00:00";

const stringList = (value: unknown): string[] => {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  return [...new Set(values.map((item) => text(item).trim()).filter(Boolean))];
};

type ImageDataUrlInfo = {
  dataUrl: string;
  mime: string;
  byteLength: number;
};

const imageDataUrlInfo = (value: unknown): ImageDataUrlInfo | undefined => {
  const dataUrl = text(value).trim();
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpe?g|webp|gif|avif));base64,([a-z0-9+/=\s]+)$/iu,
  );
  if (!match) return undefined;
  const payload = match[2].replace(/\s+/g, "");
  if (!payload || payload.length % 4 === 1) return undefined;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return {
    dataUrl,
    mime: match[1].toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : match[1].toLowerCase(),
    byteLength: Math.max(0, Math.floor((payload.length * 3) / 4) - padding),
  };
};

const mediaAssetFrom = (
  value: unknown,
  index: number,
): ScenarioMediaAsset => {
  const item = asRecord(value);
  const inlineData = imageDataUrlInfo(
    firstText(
      item.dataUrl,
      text(item.src).startsWith("data:image/") ? item.src : "",
      text(item.url).startsWith("data:image/") ? item.url : "",
    ),
  );
  const rawPath = firstText(
    item.path,
    item.file,
    item.filePath,
    text(item.src).startsWith("data:") ? "" : item.src,
    text(item.url).startsWith("data:") ? "" : item.url,
  );
  const path = rawPath.replace(/\\/g, "/");
  const kindText = firstText(item.kind, item.type, item.assetType).toLowerCase();
  const kind = /scene|background|cg|장면|배경/.test(kindText)
    ? "scene"
    : "character";
  const placement = text(item.placement).toLowerCase() === "turn_end"
    ? "turn_end"
    : "after_block";
  return {
    id: firstText(item.id, item.assetId, item.visualId) || `media-${index + 1}`,
    path,
    kind,
    characterId: firstText(
      item.characterId,
      item.character_id,
      item.character,
      item.ownerId,
    ),
    characterName: firstText(item.characterName, item.character_name, item.ownerName),
    label: text(item.label, text(item.name)),
    emotionTags: stringList(
      item.emotionTags ?? item.emotions ?? item.emotion,
    ),
    sceneTags: stringList(item.sceneTags ?? item.triggers ?? item.tags),
    placement,
    priority: number(item.priority, 50),
    alt: text(item.alt),
    caption: text(item.caption),
    source: text(item.source).toLowerCase() === "generated"
      ? "generated"
      : "package",
    canonical: bool(
      item.canonical,
      bool(
        item.isCanonical,
        bool(item.isPrimary, bool(item.isDefault, bool(item.default))),
      ),
    ),
    triggerId: firstText(item.triggerId, item.imageTriggerId),
    triggerSourceId: firstText(item.triggerSourceId, item.sourceId),
    assetRef: firstText(item.assetRef),
    byteLength: Math.max(0, number(item.byteLength)),
    sha256: firstText(item.sha256).toLowerCase(),
    dataUrlHeader: firstText(item.dataUrlHeader),
    dataUrl: inlineData?.dataUrl,
  };
};

const characterFrom = (value: unknown, isPlayer = false): Character => {
  const item = asRecord(value);
  return {
    id: text(item.id, isPlayer ? "PLAYER" : createId()),
    name: text(item.name, isPlayer ? "플레이어" : "이름 없는 인물"),
    aliases: stringList(
      item.aliases ??
        item.alternateNames ??
        item.publicAliases ??
        item.visibleAliases ??
        item.titles ??
        item.epithets,
    ),
    role: text(item.role),
    affiliation: text(item.affiliation),
    personality: text(item.personality),
    speechStyle: text(item.speechStyle),
    appearance: text(item.appearance),
    status: text(item.status),
    publicInfo: text(item.publicInfo),
    hiddenInfo: text(item.hiddenInfo),
    inventory: text(item.inventory),
    skills: text(item.skills),
    assets: text(item.assets),
    preRevealAlias: text(item.preRevealAlias),
    ...(item.revealCondition
      ? { revealCondition: item.revealCondition as RuntimePredicate }
      : {}),
    isPlayer: bool(item.isPlayer, isPlayer),
  };
};

const relationFrom = (value: unknown): CharacterRelation => {
  const item = asRecord(value);
  return {
    id: text(item.id, createId()),
    sourceId: text(item.sourceId),
    targetId: text(item.targetId),
    relationType: text(item.relationType, "미정"),
    trust: number(item.trust),
    favor: number(item.favor),
    fear: number(item.fear),
    respect: number(item.respect),
    suspicion: number(item.suspicion),
    hostility: number(item.hostility),
    dependency: number(item.dependency),
    publicSummary: text(item.publicSummary),
    hiddenNotes: text(item.hiddenNotes),
  };
};

const factionFrom = (value: unknown, index: number): ScenarioFaction => {
  const item = asRecord(value);
  return {
    id: text(item.id, `FACTION_${index + 1}`),
    name: text(item.name, `이름 없는 세력 ${index + 1}`),
    leader: text(item.leader),
    officialGoal: text(item.officialGoal, text(item.goal)),
    hiddenGoal: text(item.hiddenGoal),
    resources: text(item.resources),
    territory: text(item.territory, text(item.location)),
    allies: text(item.allies),
    enemies: text(item.enemies),
    currentPlan: text(item.currentPlan, text(item.plan)),
  };
};

const autonomyActorFrom = (value: unknown, index: number): AutonomyActor => {
  const item = asRecord(value);
  const entityType = text(item.entityType).toLowerCase() === "faction"
    ? "faction"
    : "character";
  const tier = text(item.activityTier).toLowerCase();
  const cadence = text(item.actionCadence).toLowerCase();
  const risk = text(item.riskTolerance).toLowerCase();
  return {
    id: text(item.id, `AUTO_${index + 1}`),
    entityType,
    entityId: text(item.entityId, text(item.characterId, text(item.factionId))),
    enabled: bool(item.enabled, true),
    activityTier: ["nearby", "regional", "distant", "event_only"].includes(tier)
      ? tier as AutonomyActor["activityTier"]
      : entityType === "faction"
        ? "regional"
        : "nearby",
    currentLocation: text(item.currentLocation, text(item.location)),
    locationVisibility: text(item.locationVisibility).toLowerCase() === "public"
      ? "Public"
      : "Hidden",
    shortTermGoal: text(item.shortTermGoal),
    mediumTermGoal: text(item.mediumTermGoal),
    longTermGoal: text(item.longTermGoal),
    goalPriority: Math.min(100, Math.max(0, number(item.goalPriority, 50))),
    currentPlan: text(item.currentPlan),
    nextAction: text(item.nextAction),
    actionCadence: [
      "every_turn",
      "every_2_turns",
      "every_3_to_5_turns",
      "on_trigger",
    ].includes(cadence)
      ? cadence as AutonomyActor["actionCadence"]
      : "every_2_turns",
    knowledge: text(item.knowledge),
    misinformation: text(item.misinformation),
    resources: text(item.resources),
    constraints: text(item.constraints),
    riskTolerance: ["low", "moderate", "high", "extreme"].includes(risk)
      ? risk as AutonomyActor["riskTolerance"]
      : "moderate",
    cooperationRules: text(item.cooperationRules),
    conflictRules: text(item.conflictRules),
    travelRules: text(item.travelRules),
    successOutcome: text(item.successOutcome),
    partialOutcome: text(item.partialOutcome),
    failureOutcome: text(item.failureOutcome),
    offscreenEnabled: bool(item.offscreenEnabled, true),
    canFailOffscreen: bool(item.canFailOffscreen, true),
    revealTraces: bool(item.revealTraces, true),
  };
};

const relationshipEffectFrom = (value: unknown): RelationshipMemoryEffect => {
  const item = asRecord(value);
  const effect = (key: keyof RelationshipMemoryEffect) =>
    Math.min(100, Math.max(-100, number(item[key])));
  return {
    trust: effect("trust"),
    favor: effect("favor"),
    fear: effect("fear"),
    respect: effect("respect"),
    suspicion: effect("suspicion"),
    hostility: effect("hostility"),
    dependency: effect("dependency"),
  };
};

const relationshipMemoryFrom = (
  value: unknown,
  index: number,
): RelationshipMemory => {
  const item = asRecord(value);
  const typeValue = text(item.type).toLowerCase();
  const permanenceValue = text(item.permanence).toLowerCase();
  const turnLabel = text(item.turnLabel, text(item.turn));
  const turnFromLabel = Number(turnLabel.match(/\d+/)?.[0]);
  return {
    id: text(item.id, `MEM_${index + 1}`),
    relationId: text(item.relationId),
    sourceId: text(item.sourceId),
    targetId: text(item.targetId),
    turnLabel,
    eventId: text(item.eventId),
    type: [
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
    ].includes(typeValue)
      ? typeValue as RelationshipMemory["type"]
      : "custom",
    title: text(item.title, "이름 없는 관계 기억"),
    summary: text(item.summary),
    cause: text(item.cause),
    visibility: text(item.visibility).toLowerCase() === "public"
      ? "Public"
      : "Hidden",
    importance: Math.min(100, Math.max(0, number(item.importance, 50))),
    permanence: ["temporary", "decaying", "permanent"].includes(permanenceValue)
      ? permanenceValue as RelationshipMemory["permanence"]
      : "decaying",
    effects: relationshipEffectFrom(item.effects),
    active: bool(item.active, true),
    unresolved: bool(item.unresolved),
    resolutionConditions: text(item.resolutionConditions),
    tags: text(item.tags),
    createdAt: text(item.createdAt),
    createdTurn: Math.max(
      0,
      number(
        item.createdTurn,
        Number.isFinite(turnFromLabel) ? turnFromLabel : 0,
      ),
    ),
  };
};

export const defaultAutonomyRuntime = (): AutonomyRuntimeDefinition => ({
  enabled: false,
  maxActionsPerTurn: 3,
  factionTickTurns: 3,
  deterministicSeed: true,
  requireTravelTime: true,
  enforceKnowledgeBounds: true,
  enforceResourceBounds: true,
  allowOffscreenFailure: true,
  tracePolicy: "observable_only",
  authorRules: [],
  hardRules: [],
});

export const defaultRelationshipMemoryRuntime =
  (): RelationshipMemoryRuntimeDefinition => ({
    enabled: false,
    deriveScoresFromMemory: true,
    keepContradictoryMemories: true,
    decayEnabled: true,
    maxActiveMemoriesPerRelation: 50,
    displayPublicReasonsInHud: true,
    authorRules: [],
    hardRules: [],
  });

const normalizeAutonomyRuntime = (value: unknown): AutonomyRuntimeDefinition => {
  const raw = asRecord(value);
  const config = asRecord(raw.configuration ?? raw.config ?? raw.settings ?? raw);
  const fallback = defaultAutonomyRuntime();
  const tracePolicy = text(config.tracePolicy, fallback.tracePolicy).toLowerCase();
  return {
    enabled: bool(raw.enabled, bool(config.enabled, fallback.enabled)),
    maxActionsPerTurn: Math.min(
      5,
      Math.max(0, number(config.maxActionsPerTurn, fallback.maxActionsPerTurn)),
    ),
    factionTickTurns: Math.min(
      10,
      Math.max(1, number(config.factionTickTurns, fallback.factionTickTurns)),
    ),
    deterministicSeed: bool(config.deterministicSeed, fallback.deterministicSeed),
    requireTravelTime: bool(config.requireTravelTime, fallback.requireTravelTime),
    enforceKnowledgeBounds: bool(
      config.enforceKnowledgeBounds,
      fallback.enforceKnowledgeBounds,
    ),
    enforceResourceBounds: bool(
      config.enforceResourceBounds,
      fallback.enforceResourceBounds,
    ),
    allowOffscreenFailure: bool(
      config.allowOffscreenFailure,
      fallback.allowOffscreenFailure,
    ),
    tracePolicy: [
      "observable_only",
      "rumors_allowed",
      "silent_until_discovered",
    ].includes(tracePolicy)
      ? tracePolicy as AutonomyRuntimeDefinition["tracePolicy"]
      : fallback.tracePolicy,
    authorRules: stringList(raw.authorRules ?? raw.rules),
    hardRules: stringList(raw.hardRules),
  };
};

const normalizeRelationshipMemoryRuntime = (
  value: unknown,
): RelationshipMemoryRuntimeDefinition => {
  const raw = asRecord(value);
  const config = asRecord(raw.configuration ?? raw.config ?? raw.settings ?? raw);
  const fallback = defaultRelationshipMemoryRuntime();
  return {
    enabled: bool(raw.enabled, bool(config.enabled, fallback.enabled)),
    deriveScoresFromMemory: bool(
      config.deriveScoresFromMemory,
      fallback.deriveScoresFromMemory,
    ),
    keepContradictoryMemories: bool(
      config.keepContradictoryMemories,
      fallback.keepContradictoryMemories,
    ),
    decayEnabled: bool(config.decayEnabled, fallback.decayEnabled),
    maxActiveMemoriesPerRelation: Math.min(
      200,
      Math.max(
        1,
        number(
          config.maxActiveMemoriesPerRelation,
          fallback.maxActiveMemoriesPerRelation,
        ),
      ),
    ),
    displayPublicReasonsInHud: bool(
      config.displayPublicReasonsInHud,
      fallback.displayPublicReasonsInHud,
    ),
    authorRules: stringList(raw.authorRules ?? raw.rules),
    hardRules: stringList(raw.hardRules),
  };
};

const clockFrom = (value: unknown): EventClock => {
  const item = asRecord(value);
  return {
    id: text(item.id, createId()),
    name: text(item.name, "이름 없는 시계"),
    current: number(item.current),
    maximum: Math.max(1, number(item.maximum, 6)),
    visibility: text(item.visibility, "Public"),
    publicHint: text(item.publicHint),
    hiddenNotes: text(item.hiddenNotes),
  };
};

const eventFrom = (value: unknown): ScenarioEvent => {
  const item = asRecord(value);
  const rawKind = firstText(item.kind, item.eventKind).toLowerCase();
  const kind: NonNullable<ScenarioEvent["kind"]> =
    rawKind === "constraint"
      ? "constraint"
      : rawKind === "compound" || asArray(item.beats).length > 0
        ? "compound"
        : "event";
  return {
    id: text(item.id, createId()),
    name: text(item.name, "이름 없는 사건"),
    type: text(item.type, "Conditional"),
    visibility: text(item.visibility, "Public"),
    status: text(item.status, "Planned"),
    priority: number(item.priority, 50),
    timeWindow: text(item.timeWindow),
    conditions: text(item.conditions),
    cancelConditions: text(item.cancelConditions),
    participants: text(item.participants),
    effects: text(item.effects),
    onSuccess: text(item.onSuccess),
    onFailure: text(item.onFailure),
    followUp: text(item.followUp),
    description: text(item.description),
    playerCanIntervene: bool(item.playerCanIntervene, true),
    required: bool(item.required, bool(item.mandatory, bool(item.isRequired))),
    sequence: Math.max(1, number(item.sequence, number(item.order, 1))),
    completionSignals: firstText(
      item.completionSignals,
      item.completionMarkers,
      item.completionCriteria,
    ),
    requiredItems: firstText(item.requiredItems, item.mandatoryItems),
    requiredDialogue: firstText(item.requiredDialogue, item.mandatoryDialogue),
    requiredSpeakerId: firstText(
      item.requiredSpeakerId,
      item.mandatorySpeakerId,
    ),
    recoveryAlternatives: firstText(
      item.recoveryAlternatives,
      item.rerouteAlternatives,
    ),
    preservePlayerChoice: bool(item.preservePlayerChoice, true),
    endSceneAfterCompletion: bool(item.endSceneAfterCompletion),
    kind,
    appliesTo: stringList(item.appliesTo ?? item.targetEventIds),
    rules: stringList(item.rules ?? item.constraintRules),
    beats: asArray(item.beats).map((value, index) => {
      const beat = asRecord(value);
      return {
        id: firstText(beat.id, beat.beatId) || `${text(item.id, "event")}-beat-${index + 1}`,
        order: Math.max(1, number(beat.order, index + 1)),
        title: firstText(beat.title, beat.name) || `비트 ${index + 1}`,
        content: firstText(beat.content, beat.description, beat.summary),
        viewpoint: firstText(beat.viewpoint, beat.pov, beat.characterId),
        requiredSignals: firstText(
          beat.requiredSignals,
          beat.completionSignals,
          beat.requiredConditions,
        ),
      };
    }),
    alternateBeats: asArray(item.alternateBeats) as AlternateBeat[],
    sceneMarkers: asArray(item.sceneMarkers) as SceneMarker[],
    multiroute: {
      ...asRecord(item.multiroute),
      ...Object.fromEntries(
        [
          "scope",
          "routeId",
          "chapterId",
          "expectedLoopOrdinal",
          "loopDay",
          "completionScope",
          "resetBehavior",
          "revealPolicyId",
          "routeEntryFor",
          "routeLockOnComplete",
          "endingFlagsAdd",
          "endingFlagsRemove",
          "alternativeFulfillment",
        ].flatMap((key) => item[key] === undefined ? [] : [[key, item[key]]]),
      ),
    },
  };
};

const imageTriggerFrom = (value: unknown): ScenarioImageTrigger => {
  const item = asRecord(value);
  return {
    id: text(item.id, createId()),
    name: text(item.name, "이름 없는 이미지 트리거"),
    enabled: bool(item.enabled, true),
    visibility: text(item.visibility, "Hidden"),
    triggerType: text(item.triggerType, "custom_condition"),
    sourceId: text(item.sourceId),
    threshold: number(item.threshold),
    storyProgress: text(item.storyProgress),
    customCondition: text(item.customCondition),
    mode: text(item.mode, "generate_scene"),
    characterIds: stringList(item.characterIds),
    prompt: text(item.prompt),
    negativePrompt: text(item.negativePrompt),
    once: bool(item.once, true),
    priority: number(item.priority, 50),
    outputPosition: text(item.outputPosition, "after_scene"),
  };
};

const slugId = (value: string, fallback: string): string => {
  const slug = value
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || fallback;
};

const statusVisibilityFrom = (value: unknown): StatusVisibility => {
  const normalized = text(value, "public").trim().toLowerCase();
  if (/hidden|secret|private|gm|비공개|숨김/.test(normalized)) return "hidden";
  if (/encounter|meet|대면|만남/.test(normalized)) return "encountered";
  if (/conditional|reveal|unlock|조건|공개후/.test(normalized)) {
    return "conditional";
  }
  return "public";
};

const statusValueFrom = (value: unknown): StatusValue => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item).trim()
          : "",
      )
      .filter(Boolean)
      .slice(0, 40);
  }
  return typeof value === "string" ? value.trim().slice(0, 1200) : "";
};

const statusFieldKindFrom = (
  value: unknown,
  initialValue: StatusValue,
): StatusFieldKind => {
  const normalized = text(value).toLowerCase();
  if (/number|numeric|meter|gauge|stat|resource|수치|능력치|자원/.test(normalized)) {
    return "number";
  }
  if (/list|items|inventory|skills|relations|clocks|목록|인벤토리|스킬|관계/.test(normalized)) {
    return "list";
  }
  if (typeof initialValue === "number") return "number";
  if (Array.isArray(initialValue)) return "list";
  return "text";
};

export const defaultStatusWindow = (): StatusWindowDefinition => ({
  enabled: true,
  title: "실시간 상태",
  displayMode: "full",
  defaultExpanded: true,
  showTurnDelta: true,
  sections: [
    { id: "profile", label: "현재 정보", icon: "profile", order: 10, enabled: true },
    { id: "abilities", label: "능력·상태", icon: "spark", order: 20, enabled: true },
    { id: "progress", label: "장부·진행", icon: "clock", order: 30, enabled: true },
  ],
  fields: [
    {
      id: "affiliation",
      label: "소속",
      sectionId: "profile",
      sectionLabel: "현재 정보",
      kind: "text",
      visibility: "public",
      source: "player.affiliation",
      characterId: "",
      icon: "building",
      order: 10,
      maxDelta: 100,
      showDelta: false,
      summary: true,
      updateRule: "플레이어의 공개 소속이 바뀔 때만 갱신",
      ranks: [],
    },
    {
      id: "position",
      label: "직위",
      sectionId: "profile",
      sectionLabel: "현재 정보",
      kind: "text",
      visibility: "public",
      source: "player.status",
      characterId: "",
      icon: "badge",
      order: 20,
      maxDelta: 100,
      showDelta: false,
      summary: true,
      updateRule: "공개 신분이나 직위가 바뀔 때만 갱신",
      ranks: [],
    },
    {
      id: "skills",
      label: "스킬",
      sectionId: "abilities",
      sectionLabel: "능력·상태",
      kind: "list",
      visibility: "public",
      source: "player.skills",
      characterId: "",
      icon: "spark",
      order: 10,
      maxDelta: 100,
      showDelta: false,
      summary: true,
      updateRule: "획득하거나 공개된 스킬만 표시",
      ranks: [],
    },
    {
      id: "conditions",
      label: "상태",
      sectionId: "abilities",
      sectionLabel: "능력·상태",
      kind: "list",
      visibility: "public",
      source: "state.status",
      characterId: "",
      icon: "heart",
      order: 20,
      maxDelta: 100,
      showDelta: false,
      summary: true,
      updateRule: "관측 가능한 부상·상태이상만 표시",
      ranks: [],
    },
    {
      id: "inventory",
      label: "인벤토리",
      sectionId: "progress",
      sectionLabel: "장부·진행",
      kind: "list",
      visibility: "public",
      source: "state.inventory",
      characterId: "",
      icon: "bag",
      order: 10,
      maxDelta: 100,
      showDelta: false,
      summary: false,
      updateRule: "실제로 획득하거나 소모한 공개 아이템만 표시",
      ranks: [],
    },
    {
      id: "objectives",
      label: "현재 목표",
      sectionId: "progress",
      sectionLabel: "장부·진행",
      kind: "list",
      visibility: "public",
      source: "state.objectives",
      characterId: "",
      icon: "target",
      order: 20,
      maxDelta: 100,
      showDelta: false,
      summary: true,
      updateRule: "플레이어가 인지한 목표와 변수만 표시",
      ranks: [],
    },
    {
      id: "clocks",
      label: "사건 시계",
      sectionId: "progress",
      sectionLabel: "장부·진행",
      kind: "list",
      visibility: "public",
      source: "state.clocks",
      characterId: "",
      icon: "clock",
      order: 30,
      maxDelta: 100,
      showDelta: false,
      summary: false,
      updateRule: "공개 사건 시계만 표시",
      ranks: [],
    },
    {
      id: "relations",
      label: "만난 인물 관계",
      sectionId: "progress",
      sectionLabel: "장부·진행",
      kind: "list",
      visibility: "encountered",
      source: "state.relations",
      characterId: "",
      icon: "people",
      order: 40,
      maxDelta: 100,
      showDelta: true,
      summary: true,
      updateRule: "직접 대면한 인물만 공개하고 비밀 정체와 숨은 관계를 노출하지 않음",
      ranks: [],
    },
  ],
  disclosureRules: [
    "직접 만난 인물만 관계도에 표시한다.",
    "미공개 진명·비밀 세력·숨은 수치는 공개 상태창에서 제외한다.",
    "플레이어가 관측했거나 확인한 정보만 공개한다.",
  ],
});

const normalizeStatusWindow = (
  statusWindowValue: unknown,
  initialLedgerValue: unknown,
  fateStyle = false,
): { definition: StatusWindowDefinition; ledger: RuntimeStatusEntry[] } => {
  const raw = asRecord(statusWindowValue);
  const fallback = defaultStatusWindow();
  const sectionValues = asArray(raw.sections ?? raw.groups ?? raw.categories);
  const sections = sectionValues.map((sectionValue, index) => {
    const section = asRecord(sectionValue);
    const label = text(section.label, text(section.name, `상태 ${index + 1}`));
    return {
      id: text(section.id, text(section.key, slugId(label, `section-${index + 1}`))),
      label,
      icon: text(section.icon),
      order: number(section.order, (index + 1) * 10),
      enabled: bool(section.enabled, true),
    } satisfies StatusSectionDefinition;
  });

  const fieldInputs: Array<{ value: unknown; section?: StatusSectionDefinition }> = [];
  asArray(raw.fields ?? raw.items ?? raw.metrics).forEach((value) => {
    fieldInputs.push({ value });
  });
  sectionValues.forEach((sectionValue, index) => {
    const sectionRaw = asRecord(sectionValue);
    asArray(sectionRaw.fields ?? sectionRaw.items ?? sectionRaw.metrics).forEach(
      (value) => fieldInputs.push({ value, section: sections[index] }),
    );
  });

  const relationshipRoot = asRecord(
    raw.relationshipDisplay ??
      (raw.relationshipDisplays
        ? {
            format: "RELAY_NOVEL_RELATIONSHIP_DISPLAY_V1",
            enabled: true,
            allowCombinedParts: true,
            supportedParts: ["sentence", "stat", "symbol"],
            entries: raw.relationshipDisplays,
            updatePolicy: "update_only_from_observable_interaction_or_public_event_result",
          }
        : undefined),
  );
  const relationshipFormat = text(relationshipRoot.format);
  if (
    Object.keys(relationshipRoot).length > 0 &&
    relationshipFormat &&
    relationshipFormat !== "RELAY_NOVEL_RELATIONSHIP_DISPLAY_V1"
  ) {
    throw new Error(`지원하지 않는 관계 상태창 형식입니다: ${relationshipFormat}`);
  }
  const relationshipEntries = asArray(
    relationshipRoot.entries ?? relationshipRoot.relationships,
  ).map((value, index) => {
    const entry = asRecord(value);
    const stat = asRecord(entry.stat);
    const explicitParts = stringList(entry.displayParts).filter(
      (part): part is "sentence" | "stat" | "symbol" =>
        part === "sentence" || part === "stat" || part === "symbol",
    );
    const displayParts = explicitParts.length
      ? explicitParts
      : ([
          ...(bool(entry.showSentence, Boolean(text(entry.sentence))) ? ["sentence" as const] : []),
          ...(bool(entry.showStat, entry.current !== undefined || stat.current !== undefined)
            ? ["stat" as const]
            : []),
          ...(bool(entry.showSymbol, Boolean(text(entry.symbol))) ? ["symbol" as const] : []),
        ]);
    const visibilityValue = text(entry.visibility, "public").toLowerCase();
    const visibility = visibilityValue === "met_only"
      ? "met_only"
      : visibilityValue === "conditional"
        ? "conditional"
        : "public";
    return {
      id: text(entry.id, `relationship-display-${index + 1}`),
      entityType: text(entry.entityType).toLowerCase() === "faction"
        ? "faction"
        : "character",
      entityId: text(entry.entityId, text(entry.characterId, text(entry.factionId))),
      label: text(entry.label, text(entry.name, `관계 ${index + 1}`)),
      order: number(entry.order, (index + 1) * 10),
      visibility,
      revealRule: text(entry.revealRule),
      displayParts,
      sentence: text(entry.sentence),
      stat: {
        label: text(stat.label, text(entry.statLabel, "관계")),
        current: number(stat.current, number(entry.current)),
        minimum: number(stat.minimum, number(entry.minimum, -100)),
        maximum: number(stat.maximum, number(entry.maximum, 100)),
        showDelta: bool(stat.showDelta, bool(entry.showDelta, true)),
      },
      symbol: text(entry.symbol),
      updateRule: text(
        entry.updateRule,
        "공개 장면에서 관측된 직접 상호작용이나 공개 사건 결과가 있을 때만 변경",
      ),
    } satisfies RelationshipDisplayEntryDefinition;
  }).filter((entry) => entry.id && entry.entityId && entry.displayParts.length);
  const relationshipDisplay = relationshipEntries.length
    ? {
        format: "RELAY_NOVEL_RELATIONSHIP_DISPLAY_V1" as const,
        enabled: bool(relationshipRoot.enabled, true),
        allowCombinedParts: bool(relationshipRoot.allowCombinedParts, true),
        supportedParts: stringList(relationshipRoot.supportedParts).filter(
          (part): part is "sentence" | "stat" | "symbol" =>
            part === "sentence" || part === "stat" || part === "symbol",
        ).length
          ? stringList(relationshipRoot.supportedParts).filter(
              (part): part is "sentence" | "stat" | "symbol" =>
                part === "sentence" || part === "stat" || part === "symbol",
            )
          : ["sentence", "stat", "symbol"] as Array<"sentence" | "stat" | "symbol">,
        entries: relationshipEntries,
        updatePolicy: text(
          relationshipRoot.updatePolicy,
          "update_only_from_observable_interaction_or_public_event_result",
        ),
      }
    : undefined;

  if (relationshipDisplay?.enabled) {
    const relationshipSection = sections.find((section) => section.id === "relationships") ?? {
      id: "relationships",
      label: "관계",
      icon: "people",
      order: 60,
      enabled: true,
    } satisfies StatusSectionDefinition;
    if (!sections.some((section) => section.id === relationshipSection.id)) {
      sections.push(relationshipSection);
    }
    relationshipEntries.forEach((entry) => {
      const visibility: StatusVisibility = entry.visibility === "met_only"
        ? "encountered"
        : entry.visibility;
      const base = {
        sectionId: relationshipSection.id,
        sectionLabel: relationshipSection.label,
        visibility,
        characterId: entry.entityType === "character" ? entry.entityId : "",
        relationshipDisplayId: entry.id,
        relationshipEntityType: entry.entityType,
        relationshipEntityId: entry.entityId,
        relationshipLabel: entry.label,
        updateRule: `${entry.updateRule} (관측된 동일 원인은 결합 표시 전체에서 한 번만 반영)`,
        order: entry.order * 10,
        summary: true,
      };
      if (entry.displayParts.includes("sentence")) fieldInputs.push({
        value: {
          ...base,
          id: `relationship_display:${entry.id}:sentence`,
          label: entry.label,
          kind: "text",
          initialValue: entry.sentence,
          showDelta: false,
          relationshipPart: "sentence",
        },
        section: relationshipSection,
      });
      if (entry.displayParts.includes("stat")) fieldInputs.push({
        value: {
          ...base,
          id: `relationship_display:${entry.id}:stat`,
          label: entry.stat.label,
          kind: "number",
          initialValue: entry.stat.current,
          minimum: entry.stat.minimum,
          maximum: entry.stat.maximum,
          maxDelta: Math.max(1, Math.min(25, entry.stat.maximum - entry.stat.minimum)),
          showDelta: entry.stat.showDelta,
          relationshipPart: "stat",
          order: entry.order * 10 + 1,
        },
        section: relationshipSection,
      });
      if (entry.displayParts.includes("symbol")) fieldInputs.push({
        value: {
          ...base,
          id: `relationship_display:${entry.id}:symbol`,
          label: entry.label,
          kind: "text",
          initialValue: entry.symbol,
          showDelta: false,
          relationshipPart: "symbol",
          order: entry.order * 10 + 2,
        },
        section: relationshipSection,
      });
    });
  }

  // Studio v1 stored the HUD editor model directly (stats/resources arrays)
  // instead of exporting runtime fields. Upgrade that shape on import so old
  // packages receive the same spoiler-safe six-part HUD as Studio v2.
  const legacyStats = asArray(raw.stats);
  const legacyResources = asArray(raw.resources);
  if (!fieldInputs.length && (legacyStats.length || legacyResources.length)) {
    sections.push(
      { id: "ability", label: "ABILITY", icon: "zap", order: 10, enabled: true },
      { id: "core_stats", label: "CORE STATS", icon: "gauge", order: 20, enabled: true },
      { id: "resources", label: "RESOURCES", icon: "resource", order: 30, enabled: true },
      { id: "condition", label: "CONDITION", icon: "heart", order: 40, enabled: true },
      { id: "funds", label: "FUNDS", icon: "wallet", order: 50, enabled: true },
    );
    fieldInputs.push({
      value: {
        id: "ability_summary",
        label: "능력 설명",
        sectionId: "ability",
        kind: "text",
        visibility: "public",
        initialValue: text(raw.abilitySummary, "현재 공개된 특별 능력은 아직 없다."),
        showDelta: false,
        summary: true,
        updateRule: "현재 이해하고 공개할 수 있는 능력만 한두 줄의 쉬운 문장으로 갱신",
      },
    });
    legacyStats.forEach((statValue, index) => {
      const stat = asRecord(statValue);
      fieldInputs.push({
        value: {
          ...stat,
          id: text(stat.id, `core_stat_${index + 1}`),
          label: text(stat.name, `능력치 ${index + 1}`),
          sectionId: "core_stats",
          kind: "number",
          visibility: "public",
          initialValue: number(stat.current),
          maximum: Math.max(1, number(stat.max, 100)),
          grade: text(stat.rank),
          summary: true,
        },
      });
    });
    const fateResourceSlots = [
      {
        id: "command_seals",
        label: "령주",
        icon: "command-seal",
        unit: "회",
        initialValue: Math.max(0, number(asRecord(legacyResources[0]).current, 3)),
        updateRule: "서번트와의 계약 성립을 플레이어가 직접 확인한 턴에 3회로 공개",
      },
      {
        id: "magic_gems",
        label: "보석",
        icon: "gem",
        unit: "개",
        initialValue: Math.max(0, number(asRecord(legacyResources[1]).current, 0)),
        updateRule: "마술 세계 진입 또는 보석의 보유와 성질을 직접 확인한 뒤 공개",
      },
      {
        id: "magic_weapons",
        label: "마술무기",
        icon: "sword",
        unit: "개",
        initialValue: Math.max(0, number(asRecord(legacyResources[2]).current, 0)),
        updateRule: "마술 세계 진입 또는 마술무기의 보유와 용도를 직접 확인한 뒤 공개",
      },
    ];
    const genericResourceSlots = legacyResources.slice(0, 3).map((value, index) => {
      const resource = asRecord(value);
      return {
        id: text(resource.id, `resource_${index + 1}`),
        label: text(resource.name, text(resource.label, `자원 ${index + 1}`)),
        icon: text(resource.icon, ["spark", "gem", "sword"][index] ?? "spark"),
        unit: text(resource.unit),
        initialValue: Math.max(0, number(resource.current, number(resource.value, 0))),
        updateRule: text(
          resource.revealRule,
          text(resource.updateRule, "실제 획득·사용·소모가 장면에서 확인된 뒤 공개하고 갱신"),
        ),
        visibility: text(resource.visibility, "conditional"),
        revealed: bool(resource.revealed, text(resource.visibility).toLowerCase() === "public"),
      };
    });
    const resourceSlots = fateStyle ? fateResourceSlots : genericResourceSlots;
    resourceSlots.forEach((resource, index) => fieldInputs.push({
      value: {
        ...resource,
        sectionId: "resources",
        kind: "number",
        visibility: "visibility" in resource ? resource.visibility : "conditional",
        revealed: "revealed" in resource ? resource.revealed : false,
        order: (index + 1) * 10,
        summary: true,
      },
    }));
    fieldInputs.push(
      {
        value: {
          id: "condition_summary",
          label: "현재 상태",
          sectionId: "condition",
          kind: "text",
          visibility: "public",
          initialValue: text(raw.conditionSummary, "현재 확인된 부상이나 이상 상태는 없다."),
          showDelta: false,
          summary: true,
          updateRule: "현재 관측 가능한 상태만 한두 줄로 표시",
        },
      },
      {
        value: {
          id: "funds",
          label: text(asRecord(raw.funds).name, "자금"),
          sectionId: "funds",
          kind: "number",
          visibility: "public",
          icon: text(asRecord(raw.funds).icon, "wallet"),
          unit: text(asRecord(raw.funds).unit, "원"),
          initialValue: Math.max(0, number(asRecord(raw.funds).current, 0)),
          showDelta: true,
          summary: true,
          updateRule: "확인된 수입과 지출이 발생한 경우에만 갱신",
        },
      },
    );
  }

  const ledgerRoot = initialLedgerValue ?? raw.initialLedger ?? raw.initialState ?? raw.ledger;
  const ledgerCandidates = new Map<
    string,
    {
      value: StatusValue;
      grade: string;
      revealed: boolean;
      revealedExplicitly: boolean;
      visibility?: StatusVisibility;
    }
  >();
  const collectLedger = (value: unknown, path: string[] = [], depth = 0) => {
    if (depth > 4 || value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const record = asRecord(item);
        const id = text(record.fieldId, text(record.id, text(record.key)));
        if (id) {
          const rawValue = record.value ?? record.current ?? record.initialValue ?? record.items;
          ledgerCandidates.set(id, {
            value: statusValueFrom(rawValue),
            grade: text(record.grade, text(record.rank)),
            revealed: bool(record.revealed, statusVisibilityFrom(record.visibility) === "public"),
            revealedExplicitly: record.revealed !== undefined,
            visibility: record.visibility === undefined
              ? undefined
              : statusVisibilityFrom(record.visibility),
          });
        } else if (typeof item === "object") {
          collectLedger(item, [...path, String(index)], depth + 1);
        }
      });
      return;
    }
    const record = asRecord(value);
    const directId = text(record.fieldId, text(record.id, text(record.key)));
    const hasDirectValue =
      record.value !== undefined ||
      record.current !== undefined ||
      record.initialValue !== undefined ||
      record.items !== undefined;
    if (directId && hasDirectValue) {
      ledgerCandidates.set(directId, {
        value: statusValueFrom(
          record.value ?? record.current ?? record.initialValue ?? record.items,
        ),
        grade: text(record.grade, text(record.rank)),
        revealed: bool(record.revealed, statusVisibilityFrom(record.visibility) === "public"),
        revealedExplicitly: record.revealed !== undefined,
        visibility: record.visibility === undefined
          ? undefined
          : statusVisibilityFrom(record.visibility),
      });
      return;
    }
    Object.entries(record).forEach(([key, nested]) => {
      if (/^(version|enabled|title|displayMode|mode|defaultExpanded|rules)$/i.test(key)) {
        return;
      }
      if (
        typeof nested === "string" ||
        typeof nested === "number" ||
        typeof nested === "boolean" ||
        (Array.isArray(nested) && nested.every((item) => typeof item !== "object"))
      ) {
        ledgerCandidates.set(key, {
          value: statusValueFrom(nested),
          grade: "",
          revealed: true,
          revealedExplicitly: false,
        });
      } else {
        collectLedger(nested, [...path, key], depth + 1);
      }
    });
  };
  collectLedger(ledgerRoot);

  const fields: StatusFieldDefinition[] = fieldInputs.map(({ value, section }, index) => {
    const item = asRecord(value);
    const label = text(item.label, text(item.name, `상태 항목 ${index + 1}`));
    const id = text(
      item.id,
      text(item.fieldId, text(item.key, slugId(label, `field-${index + 1}`))),
    );
    const sectionId = text(
      item.sectionId,
      text(item.section, text(item.category, section?.id ?? "status")),
    );
    const sectionDefinition = sections.find((candidate) => candidate.id === sectionId) ?? section;
    const candidate = ledgerCandidates.get(id);
    const inlineValue = statusValueFrom(
      item.initialValue ?? item.initial ?? item.current ?? item.value ?? item.defaultValue,
    );
    if (!candidate && inlineValue !== "") {
      ledgerCandidates.set(id, {
        value: inlineValue,
        grade: text(item.grade, text(item.rank)),
        revealed: bool(item.revealed, statusVisibilityFrom(item.visibility) === "public"),
        revealedExplicitly: item.revealed !== undefined,
        visibility: item.visibility === undefined
          ? undefined
          : statusVisibilityFrom(item.visibility),
      });
    }
    const rankValues = asArray(item.ranks ?? item.grades ?? item.thresholds)
      .map((rankValue) => {
        const rank = asRecord(rankValue);
        return {
          label: text(rank.label, text(rank.name, text(rank.grade))),
          minimum: number(rank.minimum, number(rank.min, number(rank.threshold))),
        };
      })
      .filter((rank) => rank.label)
      .sort((a, b) => a.minimum - b.minimum);
    const explicitVisibilityValue =
      item.visibility ?? item.disclosure ?? item.publicScope;
    const explicitVisibility = explicitVisibilityValue === undefined
      ? undefined
      : statusVisibilityFrom(explicitVisibilityValue);
    return {
      id,
      label,
      sectionId: sectionDefinition?.id ?? sectionId,
      sectionLabel:
        sectionDefinition?.label ?? text(item.sectionLabel, text(item.categoryLabel, "상태")),
      kind: statusFieldKindFrom(item.kind ?? item.type ?? item.format, candidate?.value ?? inlineValue),
      visibility: explicitVisibility ?? candidate?.visibility ?? "public",
      source: text(item.source, text(item.binding, text(item.path))),
      characterId: text(item.characterId, text(item.character)),
      icon: text(item.icon),
      unit: text(item.unit),
      order: number(item.order, (index + 1) * 10),
      minimum:
        typeof item.minimum === "number"
          ? item.minimum
          : typeof item.min === "number"
            ? item.min
            : undefined,
      maximum:
        typeof item.maximum === "number"
          ? item.maximum
          : typeof item.max === "number"
            ? item.max
            : undefined,
      maxDelta: Math.max(0, number(item.maxDelta, number(item.deltaLimit, 100))),
      showDelta: bool(item.showDelta, true),
      summary: bool(item.summary, bool(item.showInSummary, index < 6)),
      updateRule: text(item.updateRule, text(item.rule, text(item.conditions))),
      ranks: rankValues,
      relationshipDisplayId: text(item.relationshipDisplayId) || undefined,
      relationshipEntityType:
        text(item.relationshipEntityType) === "faction" ? "faction" :
          text(item.relationshipEntityType) === "character" ? "character" : undefined,
      relationshipEntityId: text(item.relationshipEntityId) || undefined,
      relationshipPart:
        text(item.relationshipPart) === "sentence" ||
        text(item.relationshipPart) === "stat" ||
        text(item.relationshipPart) === "symbol"
          ? text(item.relationshipPart) as "sentence" | "stat" | "symbol"
          : undefined,
      relationshipLabel: text(item.relationshipLabel) || undefined,
    } satisfies StatusFieldDefinition;
  });

  for (const [id, candidate] of ledgerCandidates) {
    if (fields.some((field) => field.id === id)) continue;
    const label = id.replace(/[-_]+/g, " ");
    fields.push({
      id,
      label,
      sectionId: "status",
      sectionLabel: "상태",
      kind: statusFieldKindFrom("", candidate.value),
      visibility: candidate.visibility ?? (candidate.revealed ? "public" : "hidden"),
      source: "",
      characterId: "",
      icon: "",
      order: fields.length * 10 + 10,
      minimum: undefined,
      maximum: undefined,
      maxDelta: 100,
      showDelta: true,
      summary: fields.length < 6,
      updateRule: "작품 규칙과 실제 사건에 따라 갱신",
      ranks: [],
    });
  }

  const useFallback = fields.length === 0;
  const definition: StatusWindowDefinition = {
    enabled: bool(raw.enabled, true),
    title: text(raw.title, text(raw.label, fallback.title)),
    displayMode: ["summary", "changes"].includes(text(raw.displayMode, text(raw.mode)).toLowerCase())
      ? (text(raw.displayMode, text(raw.mode)).toLowerCase() as "summary" | "changes")
      : "full",
    defaultExpanded: bool(raw.defaultExpanded, bool(raw.defaultOpen, true)),
    showTurnDelta: bool(raw.showTurnDelta, bool(raw.showDelta, true)),
    sections: useFallback
      ? fallback.sections
      : sections.length
        ? sections
        : [
            { id: "status", label: "상태", icon: "spark", order: 10, enabled: true },
          ],
    fields: useFallback ? fallback.fields : fields,
    disclosureRules: stringList(
      raw.disclosureRules ?? raw.visibilityRules ?? raw.spoilerRules,
    ).concat(fallback.disclosureRules),
    relationshipDisplay,
  };
  const ledger = definition.fields
    .filter((field) => !field.source)
    .map((field) => {
      const candidate = ledgerCandidates.get(field.id);
      return {
        fieldId: field.id,
        value: candidate?.value ?? (field.kind === "list" ? [] : field.kind === "number" ? 0 : ""),
        grade: candidate?.grade ?? "",
        revealed:
          candidate?.revealedExplicitly
            ? candidate.revealed
            : field.visibility === "public",
        updatedTurn: 0,
      } satisfies RuntimeStatusEntry;
    });
  return { definition, ledger };
};

const readJson = (files: Record<string, Uint8Array>, path: string): unknown => {
  const bytes = files[path];
  if (!bytes) return undefined;
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`${path} 파일의 JSON 형식이 올바르지 않습니다.`);
  }
};

export function normalizeScenarioPack(
  manifestValue: unknown,
  projectValue: unknown,
  parts: Record<string, unknown> = {},
): ScenarioPack {
  const manifestEnvelope = asRecord(manifestValue);
  const manifestNested = asRecord(manifestEnvelope.manifest);
  const manifest = Object.keys(manifestNested).length
    ? { ...manifestEnvelope, ...manifestNested }
    : manifestEnvelope;
  const projectEnvelope = asRecord(projectValue);
  const projectNested = asRecord(projectEnvelope.project);
  const project = Object.keys(projectNested).length
    ? { ...projectEnvelope, ...projectNested }
    : projectEnvelope;
  const playerRaw = project.player ?? parts.player;
  const player = characterFrom(playerRaw, true);
  const npcRawValues = asArray(project.npcs ?? parts.npcs);
  const npcs = npcRawValues.map((item) =>
    characterFrom(item),
  );
  const factions = asArray(project.factions ?? parts.factions).map(factionFrom);
  const relationValues = asArray(
    project.characterRelations ?? parts.characterRelations,
  );
  const clockValues = asArray(project.eventClocks ?? parts.eventClocks);
  const eventValues = [
    ...asArray(project.events ?? parts.events),
    ...asArray(
      project.constraints ??
        project.sceneConstraints ??
        parts.constraints ??
        parts.sceneConstraints,
    ),
  ];
  const normalizedEvents = eventValues.map(eventFrom);
  const openingRaw = asRecord(project.opening ?? parts.opening);
  const initialStateRaw = asRecord(project.initialState ?? parts.initialState);
  const styleRaw = asRecord(project.style ?? parts.style);
  const presentationRaw = asRecord(
    project.turnPresentation ?? parts.turnPresentation,
  );
  const repliesRaw = asRecord(presentationRaw.recommendedReplies);
  const imageRaw = asRecord(presentationRaw.sceneImage);
  const embeddedCharacterMediaValues = [
    { raw: playerRaw, character: player },
    ...npcRawValues.map((raw, index) => ({ raw, character: npcs[index] })),
  ].flatMap(({ raw, character }) => {
    const rawCharacter = asRecord(raw);
    const images = [
      ...asArray(rawCharacter.images),
      ...asArray(rawCharacter.imageAssets),
    ];
    return images.map((imageValue, imageIndex) => {
      const image = asRecord(imageValue);
      const primary = bool(
        image.isPrimary,
        bool(image.canonical, bool(image.isDefault, bool(image.default))),
      );
      const existingEmotionTags = stringList(
        image.emotionTags ?? image.emotions ?? image.emotion,
      );
      return {
        ...image,
        id: firstText(image.id, image.assetId, image.visualId) ||
          `${character.id}-embedded-${imageIndex + 1}`,
        kind: "character",
        characterId: character.id,
        characterName: character.name,
        label: firstText(image.label, image.name, image.fileName) ||
          `${character.name} 기본 프로필 ${imageIndex + 1}`,
        emotionTags: existingEmotionTags.length
          ? existingEmotionTags
          : primary
            ? ["canonical", "default"]
            : [`variant-${imageIndex + 1}`],
        placement: "after_block",
        priority: number(image.priority, primary ? 1000 : 100 - imageIndex),
        alt: firstText(image.alt) || `${character.name} 기본 프로필 이미지`,
        source: "package",
        canonical: primary,
      };
    });
  });
  const mediaValues = [
    ...asArray(project.mediaAssets ?? parts.mediaAssets),
    ...embeddedCharacterMediaValues,
  ];
  const normalizedMediaById = new Map<string, ScenarioMediaAsset>();
  mediaValues.map(mediaAssetFrom).forEach((asset) => {
    const existing = normalizedMediaById.get(asset.id);
    if (!existing) {
      normalizedMediaById.set(asset.id, asset);
      return;
    }
    normalizedMediaById.set(asset.id, {
      ...existing,
      ...asset,
      path: asset.path || existing.path,
      characterId: asset.characterId || existing.characterId,
      characterName: asset.characterName || existing.characterName,
      label: asset.label || existing.label,
      emotionTags: [...new Set([...existing.emotionTags, ...asset.emotionTags])],
      sceneTags: [...new Set([...existing.sceneTags, ...asset.sceneTags])],
      priority: Math.max(existing.priority, asset.priority),
      alt: asset.alt || existing.alt,
      caption: asset.caption || existing.caption,
      canonical: Boolean(existing.canonical || asset.canonical),
      triggerId: asset.triggerId || existing.triggerId,
      triggerSourceId: asset.triggerSourceId || existing.triggerSourceId,
      dataUrl: asset.dataUrl || existing.dataUrl,
    });
  });
  const imageTriggerValues = asArray(
    project.imageTriggers ?? parts.imageTriggers,
  );
  const normalizedStatus = normalizeStatusWindow(
    project.statusWindow ?? parts.statusWindow,
    project.initialStatusLedger ?? project.statusLedger ?? parts.initialStatusLedger,
    /(?:fate\s*\/?|성배\s*전쟁|서번트|servant)/iu.test(
      [
        text(project.title, text(manifest.title)),
        text(project.genre),
        text(project.tone),
      ].join(" "),
    ),
  );
  const autonomyActors = asArray(
    project.autonomyActors ?? parts.autonomyActors,
  ).map(autonomyActorFrom);
  const initialRelationshipMemories = asArray(
    project.relationshipMemories ?? parts.relationshipMemories,
  ).map(relationshipMemoryFrom);
  const autonomyRuntime = normalizeAutonomyRuntime(
    project.autonomyRuntime ?? project.autonomySettings ?? parts.autonomyRuntime,
  );
  const relationshipMemoryRuntime = normalizeRelationshipMemoryRuntime(
    project.relationshipMemoryRuntime ??
      project.relationshipMemorySettings ??
      parts.relationshipMemoryRuntime,
  );

  if (!text(manifest.projectId) && !text(project.projectId)) {
    throw new Error("ScenarioPack의 projectId를 찾을 수 없습니다.");
  }
  if (!player.name) {
    throw new Error("ScenarioPack의 플레이어 정보를 찾을 수 없습니다.");
  }

  const sourceProjectId = firstText(project.projectId, manifest.projectId);
  const startDate = firstText(
    project.startDate,
    project.date,
    manifest.startDate,
    openingRaw.startDate,
    openingRaw.date,
    initialStateRaw.startDate,
    initialStateRaw.date,
  ) || dateFromText(sourceProjectId);
  // 첫 본문에 명시된 현재 시각이 있으면 그것을 우선한다. 패키지의
  // startTime에 택배 도착 예정 시각 같은 미래 시간이 잘못 들어 있어도
  // 오프닝 본문과 상태창이 서로 다른 시간에서 시작하지 않게 한다.
  const startTime = timeFromText(openingRaw.openingLine) ||
    timeFromText(openingRaw.currentSituation) || timeFromText(firstText(
    project.startTime,
    project.time,
    manifest.startTime,
    openingRaw.startTime,
    openingRaw.time,
    initialStateRaw.startTime,
    initialStateRaw.time,
  )) || "00:00";
  const startLocation = firstText(
    project.startLocation,
    openingRaw.openingLocation,
    initialStateRaw.startLocation,
    initialStateRaw.location,
  );

  return {
    packageVersion: text(manifest.packageVersion, "unknown"),
    engineVersion: text(manifest.engineVersion, "unknown"),
    projectId: sourceProjectId,
    title: text(project.title, text(manifest.title, "이름 없는 시나리오")),
    genre: text(project.genre),
    tone: text(project.tone),
    startDate,
    startTime,
    startLocation,
    randomSeed: number(project.randomSeed, number(manifest.randomSeed)),
    player,
    npcs,
    factions,
    relations: relationValues.map(relationFrom),
    clocks: clockValues.map(clockFrom),
    events: normalizedEvents.filter((event) => event.kind !== "constraint"),
    constraints: normalizedEvents.filter((event) => event.kind === "constraint"),
    opening: {
      currentSituation: text(openingRaw.currentSituation),
      immediateProblem: text(openingRaw.immediateProblem),
      knownRisks: text(openingRaw.knownRisks),
      hiddenRisks: text(openingRaw.hiddenRisks),
      openingCharacters: text(openingRaw.openingCharacters),
      openingLocation: text(openingRaw.openingLocation),
      openingEvent: text(openingRaw.openingEvent),
      firstGoal: text(openingRaw.firstGoal),
      openingLine: text(openingRaw.openingLine),
    },
    style: {
      narrationPerson: text(styleRaw.narrationPerson),
      proseStyle: text(styleRaw.proseStyle),
      dialogueStyle: text(styleRaw.dialogueStyle),
      descriptionDensity: text(styleRaw.descriptionDensity),
      customRules: text(styleRaw.customRules),
    },
    turnPresentation: {
      recommendedReplies: {
        enabled: bool(repliesRaw.enabled, true),
        count: number(repliesRaw.count, 3),
        showRisk: bool(repliesRaw.showRisk, true),
      },
      sceneImage: {
        enabled: bool(imageRaw.enabled, true),
        frequency: text(imageRaw.frequency, "every_turn"),
        aspectRatio: text(imageRaw.aspectRatio, "landscape"),
        styleHint: text(imageRaw.styleHint),
      },
    },
    statusWindow: normalizedStatus.definition,
    initialStatusLedger: normalizedStatus.ledger,
    autonomyActors,
    autonomyRuntime: {
      ...autonomyRuntime,
      enabled: autonomyRuntime.enabled && autonomyActors.some((actor) => actor.enabled),
    },
    initialRelationshipMemories,
    relationshipMemoryRuntime: {
      ...relationshipMemoryRuntime,
      enabled:
        relationshipMemoryRuntime.enabled && relationValues.length > 0,
    },
    difficulty: asRecord(project.difficulty ?? parts.difficulty),
    world: asRecord(project.world ?? parts.world),
    gmData: asRecord(project.gmData ?? parts.gmData),
    mediaAssets: [...normalizedMediaById.values()],
    imageTriggers: imageTriggerValues.map(imageTriggerFrom),
    // The simulator already normalises every runtime field above. Keeping the
    // generator's full project object here can duplicate embedded image data
    // and push a large package over D1's row limit.
    rawProject: {
      projectId: sourceProjectId,
      title: text(project.title, text(manifest.title)),
      genre: text(project.genre),
      tone: text(project.tone),
      startDate,
      startTime,
      startLocation,
      randomSeed: number(project.randomSeed, number(manifest.randomSeed)),
      mediaSchemaVersion: SCENARIO_MEDIA_SCHEMA_VERSION,
    },
  };
}

const MEDIA_MANIFEST_PATHS = [
  "assets/manifest.json",
  "media/manifest.json",
  "characters/media.json",
] as const;
/** Nexus-local persistence schema; Studio manifest itself remains V2. */
export const SCENARIO_MEDIA_SCHEMA_VERSION = 3;
const IMAGE_PATH = /\.(?:png|jpe?g|webp|gif|avif)$/i;
export const MAX_SCENARIO_PACKAGE_BYTES = 1024 * 1024 * 1024;
export const CLOUD_PACKAGE_UPLOAD_BYTES = 80 * 1024 * 1024;
const EAGER_PACKAGE_BYTES = 40 * 1024 * 1024;
const MAX_MEDIA_ASSETS = 500;
const MAX_MEDIA_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES = 1536 * 1024 * 1024;
export const MAX_SCENARIO_JSON_BYTES = 100 * 1024 * 1024;
const MAX_JSON_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_EXTRACTED_FILES = 1500;
const MAX_EAGER_EXTRACTED_BYTES = 160 * 1024 * 1024;
const MAX_EAGER_EXTRACTED_FILES = 500;

const mimeForImagePath = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return "";
};

const encodeBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output: string[] = [];
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const combined = (a << 16) | (b << 8) | c;
    output.push(
      alphabet[(combined >> 18) & 63],
      alphabet[(combined >> 12) & 63],
      index + 1 < bytes.length ? alphabet[(combined >> 6) & 63] : "=",
      index + 2 < bytes.length ? alphabet[combined & 63] : "=",
    );
  }
  return output.join("");
};

const cleanZipPath = (value: string): string => {
  const path = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    return "";
  }
  return path;
};

const characterKey = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

const PROJECT_JSON_PATH = "project.json";
const REQUIRED_SPLIT_JSON_PATHS = [
  "manifest.json",
  "characters/player.json",
] as const;
const CORE_SPLIT_JSON_PATHS = [
  "characters/npcs.json",
  "world/world.json",
  "start/opening.json",
  "gm/gm_data.json",
] as const;

export const hasUsableSplitScenarioJson = (
  paths: Iterable<string>,
): boolean => {
  const normalizedPaths = new Set(
    Array.from(paths, (path) => cleanZipPath(path).toLowerCase()).filter(Boolean),
  );
  return (
    REQUIRED_SPLIT_JSON_PATHS.every((path) => normalizedPaths.has(path)) &&
    CORE_SPLIT_JSON_PATHS.some((path) => normalizedPaths.has(path))
  );
};

const oversizedJsonError = (path: string): Error =>
  path.toLowerCase() === PROJECT_JSON_PATH
    ? new Error(
        "project.json이 100MB 제한을 초과했으며 대신 사용할 분할 JSON이 부족합니다. 패키지 생성기에서 분할 파일을 포함해 다시 내보내 주세요.",
      )
    : new Error(`${path} JSON 파일이 100MB 제한을 초과합니다.`);

const inferCharacter = (
  folder: string,
  pack: ScenarioPack,
): Character | undefined => {
  const key = characterKey(folder);
  if (!key) return undefined;
  return [pack.player, ...pack.npcs].find(
    (character) =>
      characterKey(character.id) === key || characterKey(character.name) === key,
  );
};

const inferCharacterFromPath = (
  path: string,
  pack: ScenarioPack,
): Character | undefined => {
  const segments = cleanZipPath(path).split("/").filter(Boolean);
  const markerIndex = segments.findIndex((segment) =>
    /^(?:characters?|npcs?|portraits?|캐릭터|인물)$/iu.test(segment),
  );
  if (markerIndex >= 0 && segments[markerIndex + 1]) {
    const marked = inferCharacter(segments[markerIndex + 1], pack);
    if (marked) return marked;
  }
  for (const segment of segments.slice(0, -1).reverse()) {
    const matched = inferCharacter(segment, pack);
    if (matched) return matched;
  }
  return undefined;
};

const autoMediaEntry = (
  path: string,
  pack: ScenarioPack,
  index: number,
): ScenarioMediaAsset => {
  const segments = path.split("/");
  const fileName = segments.at(-1) ?? `image-${index + 1}`;
  const stem = fileName.replace(/\.[^.]+$/, "");
  const character = inferCharacterFromPath(path, pack);
  const characterFolder = character?.id ?? "";
  const emotionTags = /^\d+$/.test(stem)
    ? [
        ...(stem === "1" ? ["canonical", "default"] : ["default"]),
        `variant-${stem}`,
      ]
    : [stem.toLowerCase()];
  return {
    id: `asset-${path.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}]+/gu, "-")}`,
    path,
    kind: characterFolder ? "character" : "scene",
    characterId: character?.id ?? characterFolder,
    characterName: character?.name ?? characterFolder,
    label: stem,
    emotionTags,
    sceneTags: [],
    placement: "after_block",
    priority: /^\d+$/.test(stem) ? 100 - Number(stem) : 50,
    alt: character
      ? `${character.name}의 ${stem} 캐릭터 이미지`
      : `${pack.title} 장면 이미지`,
    caption: "",
    source: "package",
    canonical: stem === "1" || /^(?:default|normal|calm|canonical|main|대표|기본)$/iu.test(stem),
  };
};

type PackageMediaSource = {
  byteLength: number;
  bytes?: Uint8Array;
  readBytes?: () => Promise<Uint8Array>;
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("이 환경에서는 Studio 패키지 SHA-256 검증을 수행할 수 없습니다.");
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const aiWorldContextFrom = (value: unknown): AiWorldContextRuntime | undefined => {
  const root = asRecord(value);
  if (!Object.keys(root).length) return undefined;
  if (text(root.format) !== STUDIO_AI_WORLD_CONTEXT_FORMAT) {
    throw new Error(
      `rules/ai_world_context.json의 format이 ${STUDIO_AI_WORLD_CONTEXT_FORMAT}이 아닙니다.`,
    );
  }
  const execution = asRecord(root.execution);
  const worldContext = asRecord(root.worldContext);
  const research = asRecord(root.referenceCharacterResearch);
  const lookupTiming = asRecord(research.lookupTiming);
  return {
    format: STUDIO_AI_WORLD_CONTEXT_FORMAT,
    enabled: bool(root.enabled, true),
    liveEvaluation: bool(root.liveEvaluation, true),
    execution: {
      mode: text(execution.mode),
      evaluationMoments: stringList(execution.evaluationMoments),
      updateDepth: text(execution.updateDepth),
      knowledgePolicy: text(execution.knowledgePolicy),
    },
    worldContext: {
      premise: text(worldContext.premise),
      referenceFramework: text(worldContext.referenceFramework),
      referenceUsage: text(worldContext.referenceUsage),
      localContext: text(worldContext.localContext),
      enrichmentPriorities: text(worldContext.enrichmentPriorities),
      protectedCanon: text(worldContext.protectedCanon),
      avoidElements: text(worldContext.avoidElements),
      originalityRule: text(worldContext.originalityRule),
      spoilerRule: text(worldContext.spoilerRule),
    },
    referenceCharacterResearch: {
      enabled: bool(research.enabled),
      lookupMode: text(research.lookupMode),
      characters: stringList(research.characters),
      researchScope: text(research.researchScope),
      sourcePriority: text(research.sourcePriority),
      canonCutoff: text(research.canonCutoff),
      cacheMode: text(research.cacheMode, "session"),
      lookupTiming: {
        sessionStart: bool(lookupTiming.sessionStart),
        beforeFirstAppearance: bool(lookupTiming.beforeFirstAppearance),
        onCanonConflict: bool(lookupTiming.onCanonConflict),
        everyTurn: bool(lookupTiming.everyTurn),
      },
      recordSourcesInLedger: bool(research.recordSourcesInLedger),
    },
  };
};

type PackageMediaLoadResult = {
  mediaAssets: ScenarioMediaAsset[];
  assetLedger?: PackageAssetLedger;
  mediaManifestV2: boolean;
  assetOnceV1: boolean;
  integrityVerified: boolean;
};

const loadPackageMediaSources = async (
  sources: Map<string, PackageMediaSource>,
  jsonFiles: Record<string, Uint8Array>,
  pack: ScenarioPack,
): Promise<PackageMediaLoadResult> => {
  const manifestValue = MEDIA_MANIFEST_PATHS
    .map((path) => readJson(jsonFiles, path))
    .find((value) => value !== undefined);
  const manifest = asRecord(manifestValue);
  const storage = asRecord(manifest.storage);
  const mediaManifestV2 = text(manifest.format) === STUDIO_MEDIA_MANIFEST_FORMAT;
  const assetOnceV1 = text(storage.format) === STUDIO_ASSET_ONCE_FORMAT;
  const officialAssetOnce = mediaManifestV2 && assetOnceV1;
  if (mediaManifestV2 !== assetOnceV1) {
    throw new Error(
      "Studio 자산 매니페스트와 Asset-Once 저장 규격이 서로 맞지 않습니다.",
    );
  }
  if (officialAssetOnce) {
    if (text(storage.integrity).toUpperCase() !== "SHA-256") {
      throw new Error("Studio Asset-Once 패키지는 integrity가 SHA-256이어야 합니다.");
    }
    if (bool(storage.inlineDataUrls)) {
      throw new Error("Asset-Once V1 패키지는 inlineDataUrls=false여야 합니다.");
    }
  }
  const declaredValues = Array.isArray(manifestValue)
    ? manifestValue
    : asArray(manifest.assets ?? manifest.images ?? manifest.mediaAssets);
  const declared = declaredValues.length > 0
    ? declaredValues.map(mediaAssetFrom)
    : pack.mediaAssets;
  const declaredPaths = new Set(
    declared.map((asset) => cleanZipPath(asset.path)).filter(Boolean),
  );
  const autoPaths = officialAssetOnce ? [] : [...sources.keys()]
    .map(cleanZipPath)
    .filter(
      (path) => {
        const lower = path.toLowerCase();
        const supportedFolder =
          /(?:^|\/)(?:assets|media|images|이미지)\/(?:characters?|npcs?|portraits?|scenes?|backgrounds?|cg|캐릭터|인물|장면|배경)\//u.test(
            lower,
          ) ||
          /(?:^|\/)(?:characters?|npcs?|캐릭터|인물)\/[^/]+\/(?:images?|portraits?|assets|이미지)\//u.test(
            lower,
          );
        return IMAGE_PATH.test(path) && supportedFolder && !declaredPaths.has(path);
      },
    );
  const candidates = [
    ...declared,
    ...autoPaths.map((path, index) =>
      autoMediaEntry(path, pack, declared.length + index),
    ),
  ];
  if (candidates.length > MAX_MEDIA_ASSETS) {
    throw new Error(`패키지 이미지 자산은 최대 ${MAX_MEDIA_ASSETS}개까지 지원합니다.`);
  }

  let totalBytes = 0;
  let logicalBytes = 0;
  const ids = new Set<string>();
  const physical = new Map<string, PackagePhysicalAsset>();
  const mediaAssets: ScenarioMediaAsset[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const path = cleanZipPath(candidate.path);
    const source = path ? sources.get(path) : undefined;
    const inlineData = imageDataUrlInfo(candidate.dataUrl);
    const mime = mimeForImagePath(path) || inlineData?.mime || "";
    if (!inlineData && (!path || !source || !mime)) {
      throw new Error(
        `캐릭터 이미지 자산을 찾을 수 없습니다: ${candidate.path || candidate.id}`,
      );
    }
    const byteLength = source?.byteLength ?? inlineData?.byteLength ?? 0;
    logicalBytes += byteLength;
    if (byteLength > MAX_MEDIA_FILE_BYTES) {
      throw new Error(`${path || candidate.id} 이미지가 20MB 제한을 초과합니다.`);
    }
    const character = inferCharacter(candidate.characterId, pack) ??
      inferCharacter(candidate.characterName, pack) ??
      inferCharacterFromPath(path, pack);
    const baseId = candidate.id || `media-${index + 1}`;
    const id = ids.has(baseId) ? `${baseId}-${index + 1}` : baseId;
    ids.add(id);
    const asset: ScenarioMediaAsset = {
      ...candidate,
      id,
      path,
      characterId: character?.id ?? candidate.characterId,
      characterName:
        character?.name ?? candidate.characterName ?? candidate.characterId,
      alt:
        candidate.alt ||
        (character
          ? `${character.name} 캐릭터 이미지`
          : `${pack.title} 장면 이미지`),
      dataUrl: inlineData?.dataUrl,
    };

    if (officialAssetOnce) {
      const declaredHash = candidate.sha256?.trim().toLowerCase() ?? "";
      const assetRef = candidate.assetRef?.trim().toLowerCase() ?? "";
      const declaredLength = Math.max(0, Math.floor(candidate.byteLength ?? 0));
      if (!/^[a-f0-9]{64}$/u.test(declaredHash)) {
        throw new Error(`${candidate.id}의 sha256 값이 64자리 16진수가 아닙니다.`);
      }
      if (assetRef !== `sha256:${declaredHash}`) {
        throw new Error(`${candidate.id}의 assetRef와 sha256이 일치하지 않습니다.`);
      }
      if (
        candidate.dataUrlHeader &&
        !/^data:image\/(?:png|jpe?g|webp|gif|avif);base64$/iu.test(candidate.dataUrlHeader)
      ) {
        throw new Error(`${candidate.id}의 dataUrlHeader가 지원 이미지 형식이 아닙니다.`);
      }
      if (!declaredLength || declaredLength !== byteLength) {
        throw new Error(
          `${candidate.id}의 byteLength(${declaredLength})와 실제 ZIP 크기(${byteLength})가 다릅니다.`,
        );
      }
      const previous = physical.get(assetRef);
      if (previous) {
        if (
          previous.path !== path ||
          previous.sha256 !== declaredHash ||
          previous.byteLength !== declaredLength
        ) {
          throw new Error(
            `${assetRef}를 공유하는 논리 자산의 경로·해시·크기가 서로 다릅니다.`,
          );
        }
        previous.logicalAssetIds.push(id);
      } else {
        const bytes = source?.bytes ?? await source?.readBytes?.();
        if (!bytes) {
          throw new Error(`${path}의 실제 바이트를 읽어 SHA-256을 검증하지 못했습니다.`);
        }
        if (bytes.byteLength !== declaredLength) {
          throw new Error(`${path}의 실제 byteLength가 매니페스트와 다릅니다.`);
        }
        const actualHash = await sha256Hex(bytes);
        if (actualHash !== declaredHash) {
          throw new Error(`${path}의 SHA-256이 매니페스트와 다릅니다.`);
        }
        physical.set(assetRef, {
          assetRef,
          path,
          sha256: actualHash,
          byteLength: declaredLength,
          logicalAssetIds: [id],
        });
        totalBytes += declaredLength;
      }
      asset.assetRef = assetRef;
      asset.sha256 = declaredHash;
      asset.byteLength = declaredLength;
      asset.dataUrlHeader = candidate.dataUrlHeader;
    } else {
      totalBytes += byteLength;
    }
    if (totalBytes > MAX_MEDIA_TOTAL_BYTES) {
      throw new Error("패키지 이미지 물리 원본 전체 용량이 1.5GB 제한을 초과합니다.");
    }
    if (source?.bytes) {
      asset.dataUrl = `data:${mime};base64,${encodeBase64(source.bytes)}`;
    }
    mediaAssets.push(asset);
  }

  let assetLedger: PackageAssetLedger | undefined;
  if (officialAssetOnce) {
    const physicalAssets = [...physical.values()];
    const declaredLogicalCount = Math.max(0, Math.floor(number(storage.logicalAssetCount)));
    const declaredStoredCount = Math.max(0, Math.floor(number(storage.storedAssetCount)));
    const declaredStoredBytes = Math.max(0, Math.floor(number(storage.storedAssetBytes)));
    const declaredOriginalBytes = Math.max(0, Math.floor(number(storage.originalAssetBytes)));
    if (declaredLogicalCount !== mediaAssets.length) {
      throw new Error("Asset-Once logicalAssetCount가 assets[] 개수와 다릅니다.");
    }
    if (declaredStoredCount !== physicalAssets.length) {
      throw new Error("Asset-Once storedAssetCount가 실제 물리 원본 수와 다릅니다.");
    }
    if (declaredStoredBytes !== totalBytes) {
      throw new Error("Asset-Once storedAssetBytes가 검증된 물리 원본 바이트와 다릅니다.");
    }
    if (declaredOriginalBytes !== logicalBytes) {
      throw new Error("Asset-Once originalAssetBytes가 논리 자산 바이트 합계와 다릅니다.");
    }
    assetLedger = {
      format: STUDIO_ASSET_ONCE_FORMAT,
      integrity: "SHA-256",
      logicalAssetCount: mediaAssets.length,
      physicalAssetCount: physicalAssets.length,
      originalAssetBytes: declaredOriginalBytes,
      storedAssetBytes: totalBytes,
      assets: physicalAssets,
    };
  }
  return {
    mediaAssets,
    assetLedger,
    mediaManifestV2,
    assetOnceV1,
    integrityVerified: officialAssetOnce,
  };
};

const loadPackageMedia = async (
  files: Record<string, Uint8Array>,
  pack: ScenarioPack,
): Promise<PackageMediaLoadResult> => {
  const sources = new Map<string, PackageMediaSource>();
  Object.entries(files).forEach(([rawPath, bytes]) => {
    const path = cleanZipPath(rawPath);
    if (path && IMAGE_PATH.test(path)) {
      sources.set(path, { byteLength: bytes.byteLength, bytes });
    }
  });
  return loadPackageMediaSources(sources, files, pack);
};

export const detachScenarioMedia = (
  pack: ScenarioPack,
): { pack: ScenarioPack; mediaUrls: Record<string, string> } => {
  const mediaUrls: Record<string, string> = {};
  const mediaAssets = (pack.mediaAssets ?? []).map((asset) => {
    if (asset.dataUrl) mediaUrls[asset.id] = asset.dataUrl;
    return {
      id: asset.id,
      path: asset.path,
      kind: asset.kind,
      characterId: asset.characterId,
      characterName: asset.characterName,
      label: asset.label,
      emotionTags: asset.emotionTags,
      sceneTags: asset.sceneTags,
      placement: asset.placement,
      priority: asset.priority,
      alt: asset.alt,
      caption: asset.caption,
      source: asset.source ?? "package",
      canonical: asset.canonical ?? false,
      triggerId: asset.triggerId ?? "",
      triggerSourceId: asset.triggerSourceId ?? "",
      assetRef: asset.assetRef ?? "",
      byteLength: asset.byteLength ?? 0,
      sha256: asset.sha256 ?? "",
      dataUrlHeader: asset.dataUrlHeader ?? "",
    };
  });
  return { pack: { ...pack, mediaAssets }, mediaUrls };
};

export const selectScenarioMediaAsset = (
  pack: ScenarioPack,
  characterId?: string,
  emotion?: string,
): ScenarioMediaAsset | undefined => {
  const normalizedEmotion = emotion?.trim().toLowerCase() ?? "";
  const matchingAssets = [...(pack.mediaAssets ?? [])]
    .filter(
      (asset) =>
        asset.kind === "character" &&
        (!characterId ||
          asset.characterId === characterId ||
          asset.characterName === characterId),
    )
    .sort((a, b) => {
      const score = (asset: ScenarioMediaAsset) =>
        asset.priority +
        (normalizedEmotion &&
        asset.emotionTags.some(
          (tag) => tag.toLowerCase() === normalizedEmotion,
        )
          ? 100
          : 0) +
        (asset.emotionTags.some((tag) =>
          ["default", "normal", "calm", "canonical"].includes(tag.toLowerCase()),
        )
          ? 20
          : 0);
      return score(b) - score(a);
    });
  return matchingAssets.find((asset) => asset.source !== "generated") ??
    matchingAssets[0];
};

const mediaTriggerKey = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

const mediaTriggerScore = (
  asset: ScenarioMediaAsset,
  sceneContext: string,
): number => {
  const contextKey = mediaTriggerKey(sceneContext);
  if (!contextKey) return 0;
  let matched = 0;
  for (const exactSource of [asset.triggerSourceId, asset.triggerId]) {
    const exactKey = mediaTriggerKey(exactSource ?? "");
    if (exactKey.length >= 2 && contextKey.includes(exactKey)) {
      matched += 5_000;
    }
  }
  for (const tag of asset.sceneTags ?? []) {
    const tagKey = mediaTriggerKey(tag);
    if (tagKey.length < 2) continue;
    if (contextKey.includes(tagKey)) {
      matched += 420 + Math.min(80, tagKey.length * 4);
      continue;
    }
    const tokens = tag
      .normalize("NFKC")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/gu)
      .map(mediaTriggerKey)
      .filter((token) => token.length >= 2);
    const tokenMatches = tokens.filter((token) => contextKey.includes(token));
    if (tokens.length && tokenMatches.length === tokens.length) {
      matched += 260 + tokenMatches.length * 30;
    } else if (tokenMatches.length) {
      matched += tokenMatches.length * 45;
    }
  }
  const labelKey = mediaTriggerKey(
    `${asset.label} ${asset.caption} ${asset.alt}`,
  );
  const explicitSceneTerm = labelKey.match(
    /소환|마법진|현현|첫등장|계약|일상|사복|외출|전투|summon|magiccircle|firstappearance|daily|casual|battle/gu,
  ) ?? [];
  explicitSceneTerm.forEach((term) => {
    if (contextKey.includes(term)) matched += 90;
  });
  return matched;
};

export const scenarioMediaAssetMatchesSceneContext = (
  asset: ScenarioMediaAsset,
  sceneContext: string,
): boolean => mediaTriggerScore(asset, sceneContext) > 0;

const sceneContextContainsTriggerIdentity = (
  asset: ScenarioMediaAsset,
  sceneContext: string,
): boolean => {
  const contextKey = mediaTriggerKey(sceneContext);
  return [asset.triggerSourceId, asset.triggerId].some((value) => {
    const key = mediaTriggerKey(value ?? "");
    return key.length >= 2 && contextKey.includes(key);
  });
};

export const selectTriggeredScenarioMediaAsset = (
  pack: ScenarioPack,
  sceneContext: string,
  characterId?: string,
): ScenarioMediaAsset | undefined =>
  [...(pack.mediaAssets ?? [])]
    .filter(
      (asset) => {
        if (asset.source === "generated") return false;
        // Event/clock/story trigger images must never become ordinary semantic
        // search results.  A trusted server path has to include the exact
        // source or trigger ID before these assets are eligible.
        if (
          isTriggerBoundMediaAsset(asset) &&
          !sceneContextContainsTriggerIdentity(asset, sceneContext)
        ) {
          return false;
        }
        if (!characterId) return true;
        if (asset.kind === "scene" && !asset.characterId && !asset.characterName) {
          return true;
        }
        return asset.characterId === characterId ||
          asset.characterName === characterId;
      },
    )
    .map((asset) => ({
      asset,
      triggerScore: mediaTriggerScore(asset, sceneContext),
    }))
    .filter((candidate) => candidate.triggerScore > 0)
    .sort(
      (left, right) =>
        right.triggerScore - left.triggerScore ||
        right.asset.priority - left.asset.priority ||
        Number(right.asset.kind === "scene") - Number(left.asset.kind === "scene"),
    )[0]?.asset;

export const selectScenarioImageTriggerForEvent = (
  pack: ScenarioPack,
  eventId: string,
): ScenarioImageTrigger | undefined =>
  [...(pack.imageTriggers ?? [])]
    .filter(
      (trigger) =>
        trigger.enabled &&
        trigger.sourceId === eventId &&
        /^(?:event_start|event_condition_met|event_success|event_failure)$/iu.test(
          trigger.triggerType,
        ),
    )
    .sort((left, right) => right.priority - left.priority)[0];

export const selectEventTriggeredMediaAsset = (
  pack: ScenarioPack,
  eventId: string,
): ScenarioMediaAsset | undefined => {
  const trigger = selectScenarioImageTriggerForEvent(pack, eventId);
  if (!trigger) return undefined;
  const exact = trigger
    ? [...(pack.mediaAssets ?? [])]
        .filter(
          (asset) =>
            asset.source !== "generated" &&
            (asset.triggerId === trigger.id ||
              (asset.triggerSourceId === eventId && asset.kind === "scene")),
        )
        .sort((left, right) => right.priority - left.priority)[0]
    : undefined;
  if (exact) return exact;
  const characterId = trigger?.characterIds[0];
  if (trigger?.mode === "show_package_image" && characterId) {
    return selectScenarioMediaAsset(pack, characterId);
  }
  // No attached trigger asset means there is no package image to display.
  // Falling back to a semantically similar asset here can leak a different
  // event's CG, which is worse than showing no image.
  return undefined;
};

export const selectEventCharacterReferenceIds = (
  pack: ScenarioPack,
  eventId: string,
): string[] => {
  const trigger = selectScenarioImageTriggerForEvent(pack, eventId);
  const event = pack.events.find((candidate) => candidate.id === eventId);
  const participantText = event?.participants ?? "";
  const resolvedParticipants = pack.npcs
    .filter(
      (npc) =>
        participantText.includes(npc.id) ||
        visibleCharacterAliases(npc).some((alias) =>
          participantText.includes(alias)
        ),
    )
    .map((npc) => npc.id);
  return [...new Set([
    ...(trigger?.characterIds ?? []),
    ...(event?.requiredSpeakerId ? [event.requiredSpeakerId] : []),
    ...resolvedParticipants,
  ])].filter((id) => id && id !== pack.player.id).slice(0, 4);
};

const allPackCharacters = (pack: ScenarioPack): Character[] => [
  pack.player,
  ...pack.npcs,
];

const normalizedCharacterIdentity = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

export const visibleCharacterAliases = (character: Character): string[] => [
  ...new Set([
    character.id,
    character.name,
    character.preRevealAlias ?? "",
    ...(character.aliases ?? []),
  ].map((value) => value.trim()).filter(Boolean)),
];

/**
 * Resolve only identities the package or the current session has explicitly
 * declared. This is the trust boundary for speaker portraits: descriptive
 * similarity must never turn an unregistered role such as "교수" into an
 * unrelated packaged character.
 */
export const resolveDeclaredCharacterAlias = (
  pack: ScenarioPack,
  rawId = "",
  rawName = "",
  knownAliases: Array<{ alias: string; characterId: string }> = [],
): Character | undefined => {
  const candidates = [rawId, rawName]
    .map((value) => normalizedCharacterIdentity(value.trim()))
    .filter(Boolean);
  if (!candidates.length) return undefined;
  const characters = allPackCharacters(pack);
  const direct = characters.find((character) =>
    visibleCharacterAliases(character).some((alias) =>
      candidates.includes(normalizedCharacterIdentity(alias))
    )
  );
  if (direct) return direct;
  const partialMatches = characters.filter((character) =>
    visibleCharacterAliases(character).some((alias) => {
      const declared = normalizedCharacterIdentity(alias);
      return candidates.some((candidate) =>
        candidate.length >= 4 && declared.length >= 4 &&
        (candidate.includes(declared) || declared.includes(candidate))
      );
    })
  );
  if (partialMatches.length === 1) return partialMatches[0];
  const learned = knownAliases.find((entry) =>
    candidates.includes(normalizedCharacterIdentity(entry.alias))
  );
  return learned
    ? characters.find((character) => character.id === learned.characterId)
    : undefined;
};

export const resolveTrustedDialogueCharacter = (
  pack: ScenarioPack,
  rawId = "",
  rawName = "",
  knownAliases: Array<{ alias: string; characterId: string }> = [],
): Character | undefined => {
  const id = rawId.trim();
  const name = rawName.trim();
  const byId = id ? resolveDeclaredCharacterAlias(pack, id, "", knownAliases) : undefined;
  const byName = name ? resolveDeclaredCharacterAlias(pack, "", name, knownAliases) : undefined;
  if (name && !byName) return undefined;
  if (byId && byName && byId.id !== byName.id) return undefined;
  return byName ?? byId;
};

export type CharacterAliasResolutionOptions = {
  /** Public prose or appearance text that can disambiguate an otherwise short alias. */
  hintText?: string;
  /** Characters already active in this scene receive a small tie-breaking boost. */
  preferredCharacterIds?: string[];
  /** Aliases learned from canonical IDs already stored in this session. */
  knownAliases?: Array<{ alias: string; characterId: string }>;
};

const saberLikeCharacter = (pack: ScenarioPack): Character | undefined =>
  pack.npcs
    .map((npc) => {
      const descriptor = `${npc.name} ${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.hiddenInfo}`;
      let score = 0;
      if (/(?:^|\b)saber(?:\b|$)|세이버/iu.test(descriptor)) score += 120;
      if (/(?:^|\b)servant(?:\b|$)|서번트|영령/iu.test(descriptor)) score += 50;
      if (/홍재|정조|이산/u.test(descriptor)) score += 40;
      return { npc, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.npc;

const SABER_VISIBLE_ALIAS_PATTERN =
  /정체불명의\s*소녀\s*검사|소녀\s*검사|검을\s*든\s*소녀|세이버|saber|홍재/iu;

const genericAliasCharacter = (
  pack: ScenarioPack,
  rawAlias: string,
  options: CharacterAliasResolutionOptions = {},
): Character | undefined => {
  const alias = rawAlias.normalize("NFKC").toLowerCase().trim();
  if (alias.length < 2) return undefined;
  const aliasKey = normalizedCharacterIdentity(alias);
  const hint = options.hintText?.normalize("NFKC").toLowerCase().trim() ?? "";
  const preferredIds = new Set(options.preferredCharacterIds ?? []);
  const aliasTokens = [...new Set(alias
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !/^(?:dynamic|정체불명|인물|사람|남자|여자|여성|남성|소년|소녀|목소리|화자|그녀|그|the)$/iu.test(token)))];
  const hintTokens = [...new Set(hint
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !/^(?:정체불명|인물|사람|남자|여자|여성|남성|소년|소녀|목소리|화자|그녀|그|그리고|하지만|에서|으로|에게)$/iu.test(token)))];
  const ranked = allPackCharacters(pack)
    .map((npc) => {
      const authoredAliases = visibleCharacterAliases(npc);
      const descriptor = `${authoredAliases.join(" ")} ${npc.role} ${npc.affiliation} ${npc.publicInfo} ${npc.appearance}`
        .normalize("NFKC")
        .toLowerCase();
      const descriptorKey = normalizedCharacterIdentity(descriptor);
      let score = 0;
      const exactAlias = authoredAliases.some(
        (candidate) => normalizedCharacterIdentity(candidate) === aliasKey,
      );
      if (exactAlias) score += 1_000;
      if (
        !exactAlias &&
        aliasKey.length >= 2 &&
        authoredAliases.some((candidate) => {
          const candidateKey = normalizedCharacterIdentity(candidate);
          return candidateKey.length >= 2 &&
            (candidateKey.includes(aliasKey) || aliasKey.includes(candidateKey));
        })
      ) {
        score += 260;
      } else if (!exactAlias && aliasKey.length >= 2 && descriptorKey.includes(aliasKey)) {
        score += 190;
      }
      for (const token of aliasTokens) {
        if (descriptor.includes(token)) score += 30 + Math.min(20, token.length * 2);
      }
      let hintMatches = 0;
      for (const token of hintTokens) {
        if (!descriptor.includes(token)) continue;
        hintMatches += 1;
        score += 10 + Math.min(10, token.length);
      }
      if (hintMatches >= 2) score += 35;
      if (score > 0 && preferredIds.has(npc.id)) score += 24;
      return { npc, score, exactAlias, hintMatches };
    })
    .filter((candidate) => candidate.score >= 60)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return undefined;
  const second = ranked[1];
  if (
    second &&
    !best.exactAlias &&
    best.score - second.score < 24
  ) {
    return undefined;
  }
  return best.npc;
};

/**
 * Resolve a model-authored public name or role alias back to the package NPC.
 * The canonical ID is safe to keep in the private runtime ledger while the
 * public alias remains unchanged in narration and UI labels.
 */
export const resolveVisibleCharacterAlias = (
  pack: ScenarioPack,
  rawId = "",
  rawName = "",
  options: CharacterAliasResolutionOptions = {},
): Character | undefined => {
  const id = rawId.trim();
  const name = rawName.trim();
  const characters = allPackCharacters(pack);
  const exact = characters.find(
    (npc) =>
      npc.id === id ||
      npc.name === id ||
      npc.name === name,
  );
  if (exact) return exact;

  const normalizedAliases = [id, name]
    .filter(Boolean)
    .map(normalizedCharacterIdentity)
    .filter(Boolean);
  const learnedAlias = (options.knownAliases ?? []).find((entry) => {
    const learned = normalizedCharacterIdentity(entry.alias);
    return learned && normalizedAliases.some((candidate) => candidate === learned);
  });
  if (learnedAlias) {
    const learnedCharacter = characters.find(
      (character) => character.id === learnedAlias.characterId,
    );
    if (learnedCharacter) return learnedCharacter;
  }
  const authoredAliasMatches = characters.filter((npc) =>
    visibleCharacterAliases(npc).some((alias) => {
      const normalized = normalizedCharacterIdentity(alias);
      return normalizedAliases.some(
        (candidate) =>
          candidate === normalized ||
          (candidate.length >= 2 && normalized.length >= 2 &&
            (candidate.includes(normalized) || normalized.includes(candidate))),
      );
    })
  );
  if (authoredAliasMatches.length === 1) return authoredAliasMatches[0];
  if (authoredAliasMatches.length > 1) {
    const exactAuthored = authoredAliasMatches.filter((npc) =>
      visibleCharacterAliases(npc).some((alias) =>
        normalizedAliases.includes(normalizedCharacterIdentity(alias))
      )
    );
    if (exactAuthored.length === 1) return exactAuthored[0];
  }

  const combined = `${id} ${name}`.trim();
  if (SABER_VISIBLE_ALIAS_PATTERN.test(combined)) {
    const saber = saberLikeCharacter(pack);
    if (saber) return saber;
  }
  return genericAliasCharacter(pack, combined, options);
};

/**
 * Resolve every visibly participating NPC to its package ID. Luna sometimes
 * emits only a public alias (for example, "정체불명의 소녀 검사") or omits
 * image.characterIds entirely. Scene generation must still receive the
 * package character reference in those cases.
 */
export const selectSceneCharacterReferenceIds = (
  pack: ScenarioPack,
  blocks: Array<Pick<StoryBlock, "type" | "text" | "speakerId" | "speakerName">>,
  suggestedIds: string[] = [],
  limit = 4,
): string[] => {
  const byId = new Map(pack.npcs.map((npc) => [npc.id, npc] as const));
  const byName = new Map(pack.npcs.map((npc) => [npc.name, npc] as const));
  const saber = saberLikeCharacter(pack);
  const resolved: string[] = [];
  const add = (rawId = "", rawName = "") => {
    const id = rawId.trim();
    const name = rawName.trim();
    const exact = byId.get(id) ?? byName.get(id) ?? byName.get(name);
    const aliasMatch = exact
      ? undefined
      : resolveVisibleCharacterAlias(pack, id, name) ??
        (SABER_VISIBLE_ALIAS_PATTERN.test(`${id} ${name}`) ? saber : undefined);
    const characterId = exact?.id ?? aliasMatch?.id ?? id;
    if (
      !characterId ||
      characterId === pack.player.id ||
      resolved.includes(characterId)
    ) {
      return;
    }
    resolved.push(characterId);
  };

  blocks
    .filter((block) => block.type === "dialogue")
    .forEach((block) => add(block.speakerId, block.speakerName));
  suggestedIds.forEach((id) => add(id));
  return resolved.slice(0, Math.max(0, limit));
};

export const selectSaberSummoningMediaAsset = (
  pack: ScenarioPack,
  sceneContext = "",
): ScenarioMediaAsset | undefined => {
  const saber = saberLikeCharacter(pack);
  const triggerContext = [
    "EV_PROLOGUE_07_SABER_SUMMONING",
    "홍재 소환",
    "summoning summon magic-circle first-appearance",
    "소환 소환진 마법진 현현 첫 등장 계약",
    "묻겠다. 그대가 나의 마스터인가.",
    sceneContext,
  ].join(" ");
  return selectTriggeredScenarioMediaAsset(pack, triggerContext, saber?.id) ??
    selectTriggeredScenarioMediaAsset(pack, triggerContext);
};

export const characterVisualAssetId = (characterId: string): string => {
  const safeId = characterId
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `generated-character-${safeId || "unknown"}`;
};

export const selectCharacterReferenceAsset = (
  pack: ScenarioPack,
  characterId: string,
): ScenarioMediaAsset | undefined => {
  const packaged = selectPackageCharacterReferenceAsset(pack, characterId);
  if (packaged) return packaged;
  return [...(pack.mediaAssets ?? [])]
    .filter(
      (asset) =>
        asset.kind === "character" &&
        asset.source === "generated" &&
        (asset.characterId === characterId ||
          asset.characterName === characterId),
    )
    .sort((a, b) => {
      const score = (asset: ScenarioMediaAsset) =>
        asset.priority +
        (asset.canonical ? 1000 : 0) +
        (asset.emotionTags.some((tag) =>
          ["default", "normal", "calm", "canonical"].includes(
            tag.toLowerCase(),
          ),
        )
          ? 20
          : 0);
      return score(b) - score(a);
    })[0];
};

export const selectPackageCharacterReferenceAsset = (
  pack: ScenarioPack,
  characterId: string,
): ScenarioMediaAsset | undefined => {
  const resolved = resolveVisibleCharacterAlias(pack, characterId, characterId);
  const acceptedIds = new Set(
    [characterId, resolved?.id ?? "", resolved?.name ?? ""].filter(Boolean),
  );
  return [...(pack.mediaAssets ?? [])]
    .filter(
      (asset) =>
        asset.kind === "character" &&
        asset.source !== "generated" &&
        (acceptedIds.has(asset.characterId) ||
          acceptedIds.has(asset.characterName)),
    )
    .sort((a, b) => {
      const score = (asset: ScenarioMediaAsset) =>
        asset.priority +
        (asset.canonical ? 1000 : 0) +
        (asset.emotionTags.some((tag) =>
          ["default", "normal", "calm", "canonical"].includes(
            tag.toLowerCase(),
          ),
        )
          ? 20
          : 0);
      return score(b) - score(a);
    })[0];
};

export type PackageVisualRepairResult = {
  pack: ScenarioPack;
  state: RuntimeState;
  turns: TurnRecord[];
  repairedCharacterCount: number;
  clearedSceneCount: number;
  removedGeneratedAssetIds: string[];
};

export const repairPackageCharacterVisuals = (
  pack: ScenarioPack,
  state: RuntimeState,
  turns: TurnRecord[],
): PackageVisualRepairResult => {
  type IdentityObservation = {
    characterId: string;
    characterName: string;
    hintText: string;
  };
  const observations: IdentityObservation[] = [];
  const observe = (characterId = "", characterName = "", hintText = "") => {
    if (!characterId.trim() && !characterName.trim()) return;
    observations.push({ characterId, characterName, hintText });
  };
  const observeState = (snapshot: RuntimeState) => {
    snapshot.characterVisuals.forEach((profile) =>
      observe(profile.characterId, profile.characterName, profile.appearancePrompt)
    );
    snapshot.relations.forEach((relation) =>
      observe(relation.characterId, relation.name, relation.relationType)
    );
  };
  observeState(state);
  turns.forEach((turn) => {
    turn.blocks.forEach((block) =>
      observe(block.speakerId, block.speakerName, block.text)
    );
    (turn.characterVisuals ?? []).forEach((cue) =>
      observe(
        cue.characterId,
        cue.characterName,
        `${cue.appearancePrompt} ${cue.reason}`,
      )
    );
    if (turn.runtimeSnapshot) observeState(turn.runtimeSnapshot);
  });

  const knownAliases: Array<{ alias: string; characterId: string }> = [];
  const rememberAlias = (alias = "", characterId = "") => {
    const value = alias.trim();
    if (!value || !characterId) return;
    if (knownAliases.some((entry) =>
      entry.alias === value && entry.characterId === characterId
    )) return;
    knownAliases.push({ alias: value, characterId });
  };
  for (let pass = 0; pass < 2; pass += 1) {
    observations.forEach((observation) => {
      const character = resolveVisibleCharacterAlias(
        pack,
        observation.characterId,
        observation.characterName,
        { hintText: observation.hintText, knownAliases },
      );
      if (!character) return;
      rememberAlias(observation.characterId, character.id);
      rememberAlias(observation.characterName, character.id);
    });
  }
  const resolveIdentity = (
    characterId = "",
    characterName = "",
    hintText = "",
  ) => resolveVisibleCharacterAlias(pack, characterId, characterName, {
    hintText,
    knownAliases,
  });
  const canonicalId = (characterId = "", characterName = "", hintText = "") =>
    resolveIdentity(characterId, characterName, hintText)?.id ?? characterId;

  const changedRawIds = new Set<string>();
  observations.forEach((observation) => {
    const resolved = resolveIdentity(
      observation.characterId,
      observation.characterName,
      observation.hintText,
    );
    if (resolved && observation.characterId && observation.characterId !== resolved.id) {
      changedRawIds.add(observation.characterId);
    }
  });
  const repairedCharacterKeys = new Set(changedRawIds);
  const removedGeneratedAssetIds = new Set<string>();
  const replacementAssetFor = (
    characterId: string,
    characterName: string,
    previousAssetId: string,
  ) => {
    const character = resolveIdentity(characterId, characterName);
    const reference = character
      ? selectPackageCharacterReferenceAsset(pack, character.id)
      : selectPackageCharacterReferenceAsset(pack, characterId) ??
        selectPackageCharacterReferenceAsset(pack, characterName);
    if (!reference) return undefined;
    const previousAsset = (pack.mediaAssets ?? []).find(
      (asset) => asset.id === previousAssetId,
    );
    if (previousAsset?.source === "generated" && previousAsset.id !== reference.id) {
      removedGeneratedAssetIds.add(previousAsset.id);
    }
    if (previousAssetId && previousAssetId !== reference.id) {
      repairedCharacterKeys.add(character?.id ?? characterId ?? characterName);
    }
    return reference;
  };

  const repairProfile = (profile: CharacterVisualProfile): CharacterVisualProfile => {
    const character = resolveIdentity(
      profile.characterId,
      profile.characterName,
      profile.appearancePrompt,
    );
    if (!character) return profile;
    const reference = replacementAssetFor(
      profile.characterId,
      profile.characterName,
      profile.assetId,
    );
    return {
      ...profile,
      characterId: character.id,
      appearancePrompt: character.appearance?.trim() || profile.appearancePrompt,
      ...(reference
        ? { assetId: reference.id, source: "package" as const }
        : {}),
    };
  };
  const dedupeProfiles = (profiles: CharacterVisualProfile[]) => {
    const byId = new Map<string, CharacterVisualProfile>();
    profiles.forEach((profile) => {
      const existing = byId.get(profile.characterId);
      if (!existing || (profile.source === "package" && existing.source !== "package")) {
        byId.set(profile.characterId, profile);
      }
    });
    return [...byId.values()];
  };
  const repairRuntimeState = (snapshot: RuntimeState): RuntimeState => {
    const relations = snapshot.relations.map((relation) => {
      const character = resolveIdentity(
        relation.characterId,
        relation.name,
        relation.relationType,
      );
      const characterId = character?.id ?? relation.characterId;
      const sourceId = canonicalId(
        relation.sourceId,
        relation.sourceId === relation.characterId ? relation.name : "",
        relation.relationType,
      );
      const targetId = canonicalId(
        relation.targetId,
        relation.targetId === relation.characterId ? relation.name : "",
        relation.relationType,
      );
      const authored = pack.relations.find((candidate) =>
        (candidate.sourceId === sourceId && candidate.targetId === targetId) ||
        (candidate.sourceId === targetId && candidate.targetId === sourceId)
      );
      return {
        ...relation,
        relationId: authored?.id ?? relation.relationId,
        sourceId,
        targetId,
        characterId,
      };
    });
    const uniqueRelations = [...new Map(
      relations.map((relation) => [relation.characterId || relation.relationId, relation]),
    ).values()];
    const relationshipMemories = snapshot.relationshipMemories.map((memory) => {
      const hint = `${memory.title} ${memory.summary} ${memory.cause}`;
      const sourceId = canonicalId(memory.sourceId, "", hint);
      const targetId = canonicalId(memory.targetId, "", hint);
      const authored = pack.relations.find((candidate) =>
        (candidate.sourceId === sourceId && candidate.targetId === targetId) ||
        (candidate.sourceId === targetId && candidate.targetId === sourceId)
      );
      return {
        ...memory,
        relationId: authored?.id ?? memory.relationId,
        sourceId,
        targetId,
      };
    });
    return {
      ...snapshot,
      characterVisuals: dedupeProfiles(snapshot.characterVisuals.map(repairProfile)),
      encounteredCharacterIds: [...new Set(snapshot.encounteredCharacterIds.map(
        (characterId) => canonicalId(characterId),
      ))],
      relations: uniqueRelations,
      relationshipMemories,
      autonomyActors: snapshot.autonomyActors.map((actor) => ({
        ...actor,
        entityId: actor.entityType === "character"
          ? canonicalId(actor.entityId)
          : actor.entityId,
      })),
      sessionCanonLedger: snapshot.sessionCanonLedger.map((entry) => ({
        ...entry,
        subjectIds: [...new Set(entry.subjectIds.map((id) => canonicalId(id)))],
      })),
    };
  };

  let clearedSceneCount = 0;
  const repairedTurns = turns.map((turn) => {
    const originalCues = turn.characterVisuals ?? [];
    const repairedCues = originalCues.map((cue) => {
      const character = resolveIdentity(
        cue.characterId,
        cue.characterName,
        `${cue.appearancePrompt} ${cue.reason}`,
      );
      if (!character) return cue;
      const reference = replacementAssetFor(
        cue.characterId,
        cue.characterName,
        cue.canonicalAssetId,
      );
      return {
        ...cue,
        characterId: character.id,
        appearancePrompt: character.appearance?.trim() || cue.appearancePrompt,
        ...(reference
          ? { canonicalAssetId: reference.id, source: "package" as const }
          : {}),
      };
    });
    const blocks = turn.blocks.map((block, blockIndex) => {
      const cue = originalCues.find((candidate) => candidate.blockIndex === blockIndex);
      const character = resolveIdentity(
        block.speakerId,
        block.speakerName,
        `${cue?.appearancePrompt ?? ""} ${block.text}`,
      );
      const reference = cue
        ? replacementAssetFor(cue.characterId, cue.characterName, cue.canonicalAssetId)
        : character
          ? replacementAssetFor(
              block.speakerId ?? "",
              block.speakerName ?? "",
              block.mediaAssetId ?? "",
            )
          : undefined;
      const mediaWasGenerated = Boolean(
        block.mediaAssetId && removedGeneratedAssetIds.has(block.mediaAssetId),
      );
      return {
        ...block,
        ...(character ? { speakerId: character.id } : {}),
        ...((reference && (mediaWasGenerated || (cue && !block.mediaAssetId)))
          ? { mediaAssetId: reference.id }
          : {}),
      };
    });
    const replacedPackagedIdentity = originalCues.some((cue) => {
      const character = resolveIdentity(cue.characterId, cue.characterName);
      return Boolean(
        character &&
        selectPackageCharacterReferenceAsset(pack, character.id) &&
        (cue.characterId !== character.id ||
          removedGeneratedAssetIds.has(cue.canonicalAssetId)),
      );
    });
    const clearScene = Boolean(turn.imageUrl && replacedPackagedIdentity);
    if (clearScene) clearedSceneCount += 1;
    return {
      ...turn,
      blocks,
      characterVisuals: repairedCues,
      ...(turn.runtimeSnapshot
        ? { runtimeSnapshot: repairRuntimeState(turn.runtimeSnapshot) }
        : {}),
      ...(clearScene
        ? { imageUrl: undefined, imageQuality: undefined }
        : {}),
    };
  });

  return {
    pack: {
      ...pack,
      mediaAssets: (pack.mediaAssets ?? []).filter(
        (asset) => !removedGeneratedAssetIds.has(asset.id),
      ),
    },
    state: repairRuntimeState(state),
    turns: repairedTurns,
    repairedCharacterCount: repairedCharacterKeys.size,
    clearedSceneCount,
    removedGeneratedAssetIds: [...removedGeneratedAssetIds],
  };
};

const buildScenarioPackFromFiles = async (
  files: Record<string, Uint8Array>,
  indexedMedia?: Map<string, PackageMediaSource>,
): Promise<ScenarioPack> => {
  const manifest = readJson(files, "manifest.json");
  const project = readJson(files, "project.json");
  const parts = {
    player: readJson(files, "characters/player.json"),
    npcs: readJson(files, "characters/npcs.json"),
    factions: readJson(files, "factions/factions.json"),
    autonomyActors:
      readJson(files, "actors/autonomy_actors.json") ??
      readJson(files, "actors/autonomy.json"),
    characterRelations: readJson(
      files,
      "relations/character_relations.json",
    ),
    relationshipMemories:
      readJson(files, "relations/relationship_memories.json") ??
      readJson(files, "relations/relationship_memory.json") ??
      readJson(files, "relationship_memories.json") ??
      readJson(files, "relationship_memory.json"),
    eventClocks: readJson(files, "events/clocks.json"),
    events: readJson(files, "events/events.json"),
    constraints:
      readJson(files, "events/constraints.json") ??
      readJson(files, "events/scene_constraints.json") ??
      readJson(files, "rules/scene_constraints.json") ??
      readJson(files, "constraints/scene_constraints.json"),
    imageTriggers: readJson(files, "events/image_triggers.json"),
    opening: readJson(files, "start/opening.json"),
    initialState:
      readJson(files, "state/initial_state.json") ??
      readJson(files, "start/initial_state.json") ??
      readJson(files, "initial/initial_state.json"),
    style: readJson(files, "rules/style.json"),
    turnPresentation: readJson(files, "rules/turn_presentation.json"),
    statusWindow: readJson(files, "rules/status_window.json"),
    autonomyRuntime:
      readJson(files, "rules/autonomy_runtime.json") ??
      readJson(files, "autonomy_runtime.json") ??
      readJson(files, "actors/autonomy_runtime.json"),
    relationshipMemoryRuntime:
      readJson(files, "rules/relationship_memory_runtime.json") ??
      readJson(files, "relationship_memory_runtime.json") ??
      readJson(files, "relations/relationship_memory_runtime.json"),
    initialStatusLedger:
      readJson(files, "state/initial_status_ledger.json") ??
      readJson(files, "state/status_ledger.json") ??
      readJson(files, "state/initial_state.json") ??
      readJson(files, "start/initial_status.json") ??
      readJson(files, "start/status_ledger.json") ??
      readJson(files, "start/initial_state.json") ??
      readJson(files, "initial/status_ledger.json") ??
      readJson(files, "status/initial_ledger.json") ??
      readJson(files, "status/initial_status.json"),
    difficulty: readJson(files, "rules/difficulty.json"),
    world: readJson(files, "world/world.json"),
    gmData: readJson(files, "gm/gm_data.json"),
    aiWorldContext: readJson(files, "rules/ai_world_context.json"),
    narrativeRuntime: readJson(files, "rules/narrative_runtime.json"),
    instantStoryRuntime: readJson(files, "rules/instant_story_runtime.json"),
    instantContextIndex: readJson(files, "runtime/context_index.json"),
    instantKeywordIndex: readJson(files, "runtime/keyword_index.json"),
    instantMediaLookup: readJson(files, "runtime/media_lookup.json"),
    instantEndingSchedule: readJson(files, "runtime/ending_schedule.json"),
    routeGraph: readJson(files, "routes/route_graph.json"),
    chapters: readJson(files, "routes/chapters.json"),
    routeLenses: readJson(files, "routes/route_lenses.json"),
    revealFacts: readJson(files, "routes/reveal_facts.json"),
    revealPolicies: readJson(files, "routes/reveal_policies.json"),
    endings: readJson(files, "routes/endings.json"),
    flags: readJson(files, "routes/flags.json"),
    galleries: readJson(files, "routes/galleries.json"),
    epilogues: readJson(files, "routes/epilogues.json"),
    checkpoints: readJson(files, "routes/checkpoints.json"),
    clues: readJson(files, "routes/clues.json"),
    loopPolicy: readJson(files, "loops/loop_policy.json"),
    items: readJson(files, "state/item_definitions.json"),
    zones: readJson(files, "state/zone_definitions.json"),
    packageWorldFacts: readJson(files, "state/world_fact_definitions.json"),
  };

  const pack = normalizeScenarioPack(manifest, project, parts);
  const media = indexedMedia
    ? await loadPackageMediaSources(indexedMedia, files, pack)
    : await loadPackageMedia(files, pack);
  const aiWorldContext = aiWorldContextFrom(parts.aiWorldContext);
  const narrativeRuntime = parseNarrativeRuntimeExtension(parts.narrativeRuntime);
  const instantStoryRuntime = parseInstantStoryRuntime(
    parts.instantStoryRuntime,
    {
      contextIndex: parts.instantContextIndex,
      keywordIndex: parts.instantKeywordIndex,
      mediaLookup: parts.instantMediaLookup,
      endingSchedule: parts.instantEndingSchedule,
    },
    project,
  );
  narrativeRuntime?.characterDisclosure.forEach((disclosure) => {
    const character = [pack.player, ...pack.npcs].find(
      (candidate) => candidate.id === disclosure.characterId,
    );
    if (!character) return;
    if (disclosure.preRevealAlias) character.preRevealAlias = disclosure.preRevealAlias;
    if (disclosure.revealCondition) character.revealCondition = disclosure.revealCondition;
  });
  narrativeRuntime?.events.forEach((runtimeEvent) => {
    const event = pack.events.find((candidate) => candidate.id === runtimeEvent.eventId);
    if (!event) return;
    if (runtimeEvent.alternateBeats.length) event.alternateBeats = runtimeEvent.alternateBeats;
    if (runtimeEvent.sceneMarkers.length) event.sceneMarkers = runtimeEvent.sceneMarkers;
  });
  const parsedPackage15Runtime = parsePackage15Runtime({
    packageVersion: pack.packageVersion,
    manifest,
    documents: {
      routeGraph: parts.routeGraph,
      chapters: parts.chapters,
      routeLenses: parts.routeLenses,
      revealFacts: parts.revealFacts,
      revealPolicies: parts.revealPolicies,
      endings: parts.endings,
      flags: parts.flags,
      galleries: parts.galleries,
      epilogues: parts.epilogues,
      checkpoints: parts.checkpoints,
      clues: parts.clues,
      loopPolicy: parts.loopPolicy,
      items: parts.items,
      zones: parts.zones,
      worldFacts: parts.packageWorldFacts,
    },
  });
  const requiresInstantV1 = parsedPackage15Runtime?.requiredFeatures.includes("instant_story_runtime_v1");
  const requiresInstantV2 = parsedPackage15Runtime?.requiredFeatures.includes("instant_story_runtime_v2");
  const manifestRuntime = asRecord(manifest);
  if (requiresInstantV1 && instantStoryRuntime?.featureId !== "instant_story_runtime_v1") {
    throw new Error(
      "Package 1.5가 요구한 instant_story_runtime_v1 문서 또는 파생 캐시가 올바르지 않습니다.",
    );
  }
  if (requiresInstantV2 && (
    text(manifestRuntime.runtimeMode) !== "instant_story" ||
    manifestRuntime.exclusiveRuntime !== true ||
    text(manifestRuntime.unsupportedBehavior) !== "reject_package" ||
    instantStoryRuntime?.featureId !== "instant_story_runtime_v2" ||
    !instantStoryRuntime.exclusiveRuntime ||
    instantStoryRuntime.fallback !== "reject_if_unsupported"
  )) throw new Error(
    "독립 실행 Package가 요구한 instant_story_runtime_v2 문서·캐시·거부 정책이 올바르지 않습니다.",
  );
  const package15Runtime = parsedPackage15Runtime && !instantStoryRuntime
    ? {
        ...parsedPackage15Runtime,
        negotiatedFeatures: parsedPackage15Runtime.negotiatedFeatures.filter(
          (feature) => feature !== "instant_story_runtime_v1",
        ),
      }
    : parsedPackage15Runtime;
  const studioPackage14 = pack.packageVersion === "1.4";
  const studioPackage15 = pack.packageVersion === "1.5";
  const supportedPackageVersion = studioPackage14 || studioPackage15;
  const warnings = [
    ...(!supportedPackageVersion ? ["지원되는 Studio Package Version 1.4/1.5가 아닙니다."] : []),
    ...(!media.mediaManifestV2 ? ["Media Asset Manifest V2가 없습니다."] : []),
    ...(!media.assetOnceV1 ? ["Asset-Once V1 장부가 없습니다."] : []),
    ...(!media.integrityVerified ? ["SHA-256·byteLength 실검증 대상이 아닙니다."] : []),
    ...(!aiWorldContext && !instantStoryRuntime?.exclusiveRuntime
      ? ["AI World Context Runtime V1이 없습니다."]
      : []),
    ...(pack.packageVersion === "1.5" &&
        (package15Runtime?.optionalFeatures ?? []).includes("instant_story_runtime_v1") &&
        !instantStoryRuntime
      ? ["Instant Story Runtime 파생 캐시를 사용할 수 없어 일반 Package 1.5 경로로 실행합니다."]
      : []),
    ...(studioPackage15 && !package15Runtime ? ["Package 1.5 기능 협상 장부가 없습니다."] : []),
  ];
  const fullSupport = supportedPackageVersion && media.mediaManifestV2 &&
    media.assetOnceV1 && media.integrityVerified &&
    (instantStoryRuntime?.exclusiveRuntime || Boolean(aiWorldContext)) &&
    (!studioPackage15 || Boolean(package15Runtime));
  return {
    ...pack,
    mediaAssets: media.mediaAssets,
    assetLedger: media.assetLedger,
    aiWorldContext,
    narrativeRuntime,
    instantStoryRuntime,
    package15Runtime,
    compatibility: {
      studioPackage14,
      studioPackage15,
      supportedPackageVersion,
      mediaManifestV2: media.mediaManifestV2,
      assetOnceV1: media.assetOnceV1,
      integrityVerified: media.integrityVerified,
      aiWorldContextRuntimeV1: Boolean(aiWorldContext),
      narrativeRuntimeExtensionV1: Boolean(narrativeRuntime),
      instantStoryRuntimeV1: instantStoryRuntime?.featureId === "instant_story_runtime_v1",
      instantStoryRuntimeV2: instantStoryRuntime?.featureId === "instant_story_runtime_v2",
      package15FeatureNegotiated: !studioPackage15 || Boolean(package15Runtime),
      fullSupport,
      warnings,
    },
  };
};

export type ScenarioImportProgress = {
  ratio: number;
  phase: string;
  detail: string;
};

type ScenarioParseOptions = {
  indexMediaOnly?: boolean;
  onProgress?: (progress: ScenarioImportProgress) => void;
};

const reportScenarioImportProgress = (
  options: ScenarioParseOptions,
  ratio: number,
  phase: string,
  detail: string,
) => {
  options.onProgress?.({
    ratio: Math.max(0, Math.min(1, ratio)),
    phase,
    detail,
  });
};

const readScenarioFile = async (
  file: File,
  options: ScenarioParseOptions,
): Promise<ArrayBuffer> => {
  if (typeof FileReader === "undefined") {
    reportScenarioImportProgress(
      options,
      0.12,
      "ZIP 데이터 읽는 중",
      "패키지 원본을 메모리로 불러오고 있습니다.",
    );
    const buffer = await file.arrayBuffer();
    reportScenarioImportProgress(
      options,
      0.55,
      "ZIP 데이터 읽기 완료",
      "압축된 파일을 분석할 준비가 끝났습니다.",
    );
    return buffer;
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      const ratio = event.lengthComputable && event.total > 0
        ? event.loaded / event.total
        : 0;
      reportScenarioImportProgress(
        options,
        0.08 + ratio * 0.47,
        "ZIP 데이터 읽는 중",
        `${Math.round(ratio * 100)}% 읽었습니다.`,
      );
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("ScenarioPack ZIP을 읽지 못했습니다."));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("ScenarioPack ZIP 데이터가 올바르지 않습니다."));
        return;
      }
      reportScenarioImportProgress(
        options,
        0.55,
        "ZIP 데이터 읽기 완료",
        "압축된 파일을 분석할 준비가 끝났습니다.",
      );
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(file);
  });
};

const parseIndexedScenarioPack = async (
  file: File,
  options: ScenarioParseOptions,
): Promise<ScenarioPack> => {
  reportScenarioImportProgress(
    options,
    0.05,
    "대용량 ZIP 검사 중",
    "압축을 통째로 풀지 않고 파일 목록을 먼저 확인합니다.",
  );
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries({ checkAmbiguity: true });
    reportScenarioImportProgress(
      options,
      0.16,
      "파일 목록 확인 완료",
      `ZIP 내부에서 ${entries.length.toLocaleString("ko-KR")}개 항목을 찾았습니다.`,
    );
    if (entries.length > MAX_EXTRACTED_FILES) {
      throw new Error(
        `ScenarioPack 내부 파일 수가 ${MAX_EXTRACTED_FILES}개 제한을 초과합니다.`,
      );
    }

    const files: Record<string, Uint8Array> = {};
    const mediaSources = new Map<string, PackageMediaSource>();
    const availablePaths = entries
      .filter((entry) => !entry.directory)
      .map((entry) => cleanZipPath(entry.filename))
      .filter(Boolean);
    const canUseSplitJson = hasUsableSplitScenarioJson(availablePaths);
    let jsonBytes = 0;
    let indexedBytes = 0;
    let skippedOversizedProject = false;

    const reportInterval = Math.max(1, Math.floor(entries.length / 80));
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];
      if (entryIndex % reportInterval === 0 || entryIndex === entries.length - 1) {
        reportScenarioImportProgress(
          options,
          0.16 + ((entryIndex + 1) / Math.max(1, entries.length)) * 0.68,
          "세계관·이미지 목록 분석 중",
          `${entryIndex + 1}/${entries.length}개 항목을 확인하고 있습니다.`,
        );
      }
      if (entry.directory) continue;
      const path = cleanZipPath(entry.filename);
      const isJson = /\.json$/i.test(path);
      const isImage = IMAGE_PATH.test(path);
      if (!path || (!isJson && !isImage)) continue;
      if (entry.encrypted) {
        throw new Error(`${path} 파일은 암호화되어 있어 불러올 수 없습니다.`);
      }

      indexedBytes += entry.uncompressedSize;
      if (indexedBytes > MAX_EXTRACTED_BYTES) {
        throw new Error("ScenarioPack 압축 해제 예상 용량이 2GB 제한을 초과합니다.");
      }

      if (isImage) {
        if (entry.uncompressedSize > MAX_MEDIA_FILE_BYTES) {
          throw new Error(`${path} 이미지가 20MB 제한을 초과합니다.`);
        }
        mediaSources.set(path, {
          byteLength: entry.uncompressedSize,
          readBytes: () => entry.getData(
            new Uint8ArrayWriter(Math.min(entry.uncompressedSize, 1024 * 1024)),
            { checkSignature: true, useWebWorkers: false },
          ),
        });
        continue;
      }

      if (entry.uncompressedSize > MAX_SCENARIO_JSON_BYTES) {
        if (path.toLowerCase() === PROJECT_JSON_PATH && canUseSplitJson) {
          skippedOversizedProject = true;
          continue;
        }
        throw oversizedJsonError(path);
      }
      jsonBytes += entry.uncompressedSize;
      if (jsonBytes > MAX_JSON_TOTAL_BYTES) {
        throw new Error("ScenarioPack JSON 전체 용량이 300MB 제한을 초과합니다.");
      }
      files[path] = await entry.getData(
        new Uint8ArrayWriter(Math.min(entry.uncompressedSize, 1024 * 1024)),
        { checkSignature: true, useWebWorkers: false },
      );
    }

    reportScenarioImportProgress(
      options,
      0.9,
      "시나리오 구조 구성 중",
      skippedOversizedProject
        ? "100MB를 넘는 project.json 대신 분할 세계관 데이터를 조립하고 있습니다."
        : "세계관, 캐릭터, 규칙과 이미지 연결 정보를 조립하고 있습니다.",
    );
    const pack = await buildScenarioPackFromFiles(files, mediaSources);
    reportScenarioImportProgress(
      options,
      1,
      "패키지 분석 완료",
      `${pack.title}의 시뮬레이션 데이터를 준비했습니다.`,
    );
    return pack;
  } finally {
    await reader.close();
  }
};

export async function parseScenarioPackFile(
  file: File,
  options: ScenarioParseOptions = {},
): Promise<ScenarioPack> {
  reportScenarioImportProgress(
    options,
    0.02,
    "ScenarioPack 확인 중",
    "파일 형식과 용량을 검사하고 있습니다.",
  );
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("ZIP 형식의 ScenarioPack을 선택해 주세요.");
  }
  if (file.size > MAX_SCENARIO_PACKAGE_BYTES) {
    throw new Error("ScenarioPack ZIP은 최대 1GB까지 불러올 수 있습니다.");
  }
  if (options.indexMediaOnly || file.size > EAGER_PACKAGE_BYTES) {
    return parseIndexedScenarioPack(file, options);
  }

  let extractedBytes = 0;
  let extractedFiles = 0;
  let jsonBytes = 0;
  let skippedOversizedProject = false;
  const archive = await readScenarioFile(file, options);
  reportScenarioImportProgress(
    options,
    0.62,
    "압축 해제·무결성 검사 중",
    "세계관 JSON과 패키지 이미지를 안전하게 분리하고 있습니다.",
  );
  const files = unzipSync(new Uint8Array(archive), {
    filter: (entry) => {
      const path = cleanZipPath(entry.name);
      const isJson = /\.json$/i.test(path);
      const isImage = IMAGE_PATH.test(path);
      if (!path || (!isJson && !isImage)) return false;
      if (isJson && entry.originalSize > MAX_SCENARIO_JSON_BYTES) {
        if (path.toLowerCase() === PROJECT_JSON_PATH) {
          skippedOversizedProject = true;
          return false;
        }
        throw oversizedJsonError(path);
      }
      if (isImage && entry.originalSize > MAX_MEDIA_FILE_BYTES) {
        throw new Error(`${path} 이미지가 20MB 제한을 초과합니다.`);
      }
      if (isJson) {
        jsonBytes += entry.originalSize;
        if (jsonBytes > MAX_JSON_TOTAL_BYTES) {
          throw new Error("ScenarioPack JSON 전체 용량이 300MB 제한을 초과합니다.");
        }
      }
      extractedBytes += entry.originalSize;
      extractedFiles += 1;
      if (extractedBytes > MAX_EAGER_EXTRACTED_BYTES) {
        throw new Error("ScenarioPack 압축 해제 용량이 160MB 제한을 초과합니다.");
      }
      if (extractedFiles > MAX_EAGER_EXTRACTED_FILES) {
        throw new Error(
          `ScenarioPack 내부 파일 수가 ${MAX_EAGER_EXTRACTED_FILES}개 제한을 초과합니다.`,
        );
      }
      return true;
    },
  });
  if (skippedOversizedProject && !hasUsableSplitScenarioJson(Object.keys(files))) {
    throw oversizedJsonError(PROJECT_JSON_PATH);
  }
  reportScenarioImportProgress(
    options,
    0.9,
    "시나리오 구조 구성 중",
    skippedOversizedProject
      ? "100MB를 넘는 project.json 대신 분할 세계관 데이터를 조립하고 있습니다."
      : "세계관, 캐릭터, 규칙과 이미지 연결 정보를 조립하고 있습니다.",
  );
  const pack = await buildScenarioPackFromFiles(files);
  reportScenarioImportProgress(
    options,
    1,
    "패키지 분석 완료",
    `${pack.title}의 시뮬레이션 데이터를 준비했습니다.`,
  );
  return pack;
}

const embeddedMediaDataUrlFromJson = (
  value: unknown,
  asset: ScenarioMediaAsset,
): string | undefined => {
  const envelope = asRecord(value);
  const nestedProject = asRecord(envelope.project);
  const root = Object.keys(nestedProject).length ? nestedProject : envelope;
  const characters: unknown[] = Array.isArray(value)
    ? value
    : [
        root.player,
        ...asArray(root.npcs),
        ...asArray(root.characters),
        ...(root.id && (root.images || root.imageAssets) ? [root] : []),
      ];
  for (const characterValue of characters) {
    const character = asRecord(characterValue);
    const characterMatches =
      !asset.characterId && !asset.characterName
        ? true
        : firstText(character.id) === asset.characterId ||
          firstText(character.name) === asset.characterName;
    if (!characterMatches) continue;
    const images = [
      ...asArray(character.images),
      ...asArray(character.imageAssets),
    ];
    const matched = images
      .map(asRecord)
      .find((image) => firstText(image.id, image.assetId, image.visualId) === asset.id);
    const inlineData = imageDataUrlInfo(matched?.dataUrl);
    if (inlineData) return inlineData.dataUrl;
  }
  return undefined;
};

export async function extractScenarioMediaDataUrl(
  archive: Blob,
  asset: ScenarioMediaAsset,
): Promise<string> {
  if (archive.size > MAX_SCENARIO_PACKAGE_BYTES) {
    throw new Error("저장된 ScenarioPack이 1GB 제한을 초과합니다.");
  }
  const directInlineData = imageDataUrlInfo(asset.dataUrl);
  if (directInlineData) return directInlineData.dataUrl;
  const path = cleanZipPath(asset.path);
  const mime = mimeForImagePath(path);

  const reader = new ZipReader(new BlobReader(archive), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries({ checkAmbiguity: true });
    if (!path || !mime) {
      const inlineJsonPaths = new Set([
        "project.json",
        "characters/player.json",
        "characters/npcs.json",
      ]);
      for (const jsonEntry of entries) {
        if (
          jsonEntry.directory ||
          !inlineJsonPaths.has(cleanZipPath(jsonEntry.filename).toLowerCase())
        ) {
          continue;
        }
        if (jsonEntry.encrypted) {
          throw new Error(`${jsonEntry.filename} 파일은 암호화되어 있어 읽을 수 없습니다.`);
        }
        if (jsonEntry.uncompressedSize > MAX_SCENARIO_JSON_BYTES) continue;
        const bytes = await jsonEntry.getData(
          new Uint8ArrayWriter(Math.min(jsonEntry.uncompressedSize, 1024 * 1024)),
          { checkSignature: true, useWebWorkers: false },
        );
        try {
          const inlineDataUrl = embeddedMediaDataUrlFromJson(
            JSON.parse(strFromU8(bytes)),
            asset,
          );
          if (inlineDataUrl) return inlineDataUrl;
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
      throw new Error(`${asset.id} 내장 이미지를 패키지 JSON에서 찾을 수 없습니다.`);
    }
    const entry = entries.find(
      (candidate) =>
        !candidate.directory && cleanZipPath(candidate.filename) === path,
    );
    if (!entry || entry.directory) {
      throw new Error(`${path} 이미지를 패키지에서 찾을 수 없습니다.`);
    }
    if (entry.encrypted) {
      throw new Error(`${path} 이미지는 암호화되어 있어 읽을 수 없습니다.`);
    }
    if (entry.uncompressedSize > MAX_MEDIA_FILE_BYTES) {
      throw new Error(`${path} 이미지가 20MB 제한을 초과합니다.`);
    }
    const bytes = await entry.getData(
      new Uint8ArrayWriter(Math.min(entry.uncompressedSize, 1024 * 1024)),
      { checkSignature: true, useWebWorkers: false },
    );
    if (asset.byteLength && bytes.byteLength !== asset.byteLength) {
      throw new Error(`${path}의 복원 byteLength가 검증 장부와 다릅니다.`);
    }
    if (asset.sha256) {
      const actualHash = await sha256Hex(bytes);
      if (actualHash !== asset.sha256.toLowerCase()) {
        throw new Error(`${path}의 복원 SHA-256이 검증 장부와 다릅니다.`);
      }
    }
    const header = asset.dataUrlHeader?.trim() || `data:${mime};base64`;
    return `${header},${encodeBase64(bytes)}`;
  } finally {
    await reader.close();
  }
}

const splitItems = (value: string): string[] =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const weekdayFor = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "요일 미상";
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][
    parsed.getUTCDay()
  ];
};

const openingLineParts = (openingLine: string): {
  narration: string;
  dialogue: string;
} => {
  const line = openingLine.trim();
  const quoteIndex = line.search(/[“\"]/);
  return {
    narration: quoteIndex >= 0 ? line.slice(0, quoteIndex).trim() : line,
    dialogue: quoteIndex >= 0
      ? line.slice(quoteIndex).replace(/^[“\"]|[”\"]$/g, "").trim()
      : "",
  };
};

const selectOpeningNpc = (pack: ScenarioPack): Character | undefined => {
  const { narration, dialogue } = openingLineParts(pack.opening.openingLine);
  if (!dialogue) return undefined;
  const namedSpeaker = pack.npcs.find((npc) => {
    if (!narration.includes(npc.name)) return false;
    const escapedName = npc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`발송인\\s*[:：]?[^.!?\\n]{0,24}${escapedName}`, "u").test(
      narration,
    );
  });
  if (namedSpeaker) return namedSpeaker;
  if (/발송인|택배|배송|수령|알림|문자|화면/u.test(narration)) {
    return undefined;
  }
  return pack.npcs.find((npc) =>
    pack.opening.openingCharacters.includes(npc.name),
  );
};

const openingDisplayText = (pack: ScenarioPack): string => {
  const packageOpeningLine = pack.opening.openingLine.trim();
  const packageOpeningHasDialogue = Boolean(
    openingLineParts(packageOpeningLine).dialogue,
  );
  return (packageOpeningHasDialogue
    ? packageOpeningLine
    : pack.instantStoryRuntime?.startProfiles[0]?.prologue || packageOpeningLine
  ).trim();
};

const openingCharacterLabels = (character: Character): string[] => [
  character.preRevealAlias ?? "",
  ...(character.aliases ?? []),
  character.name,
].map((label) => label.trim()).filter(Boolean);

/**
 * Opening prose can introduce several important package characters before any
 * dialogue block exists. Treat the package's openingCharacters declaration as
 * the authoritative roster and the visible opening prose as proof that each
 * character actually appeared. This keeps the rule work-independent while
 * avoiding image generation for characters that are only hidden setup.
 */
const selectOpeningVisualCharacters = (
  pack: ScenarioPack,
  visibleText = openingDisplayText(pack),
): Character[] => {
  const declared = new Set(
    pack.opening.openingCharacters
      .split(/[,;\n]/u)
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const dialogueSpeaker = selectOpeningNpc(pack);
  const selected = pack.npcs.filter((character) => {
    if (dialogueSpeaker?.id === character.id) return true;
    const labels = openingCharacterLabels(character);
    const isSenderReference = labels.some((label) => {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `발송인\\s*[:：]?[^.!?\\n]{0,40}${escapedLabel}`,
        "u",
      ).test(pack.opening.openingLine);
    });
    if (isSenderReference) return false;
    const isDeclared = declared.has(character.id) ||
      labels.some((label) => declared.has(label));
    return isDeclared && labels.some((label) => visibleText.includes(label));
  });
  return [...new Map(selected.map((character) => [character.id, character])).values()];
};

const openingCharacterDisplayName = (
  character: Character,
  visibleText: string,
): string => openingCharacterLabels(character)
  .find((label) => visibleText.includes(label)) ?? character.name;

export function createInitialState(pack: ScenarioPack): RuntimeState {
  const characters = new Map(pack.npcs.map((npc) => [npc.id, npc]));
  const playerId = pack.player.id;
  const groupedRelations = new Map<string, CharacterRelation[]>();
  pack.relations
    .filter(
      (relation) =>
        relation.sourceId === playerId || relation.targetId === playerId,
    )
    .forEach((relation) => {
      const otherId = relation.sourceId === playerId
        ? relation.targetId
        : relation.sourceId;
      groupedRelations.set(otherId, [
        ...(groupedRelations.get(otherId) ?? []),
        relation,
      ]);
    });

  const relations = [...groupedRelations.entries()].map(
    ([otherId, candidates]) => {
      const relation =
        candidates.find(
          (candidate) =>
            candidate.sourceId === otherId && candidate.targetId === playerId,
        ) ?? candidates[0];
      const relationMemories = (pack.relationshipMemoryRuntime.enabled
        ? pack.initialRelationshipMemories ?? []
        : [])
        .filter(
          (memory) =>
            memory.active &&
            (memory.relationId === relation.id ||
              (memory.sourceId === relation.sourceId &&
                memory.targetId === relation.targetId)),
        )
        .sort((left, right) =>
          Number(right.unresolved) - Number(left.unresolved) ||
          Number(right.permanence === "permanent") -
            Number(left.permanence === "permanent") ||
          right.importance - left.importance ||
          right.createdTurn - left.createdTurn,
        )
        .slice(0, pack.relationshipMemoryRuntime.maxActiveMemoriesPerRelation);
      const memoryDelta = (
        key: keyof RelationshipMemoryEffect,
        publicOnly = false,
      ) => relationMemories
        .filter((memory) => !publicOnly || memory.visibility === "Public")
        .reduce((sum, memory) => sum + memory.effects[key], 0);
      return {
        relationId: relation.id,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        characterId: otherId,
        name: characters.get(otherId)?.name ?? otherId,
        relationType: relation.relationType,
        trust: clamp(relation.trust + memoryDelta("trust"), -100, 100),
        publicTrust: clamp(
          relation.trust + memoryDelta("trust", true),
          -100,
          100,
        ),
        favor: clamp(relation.favor + memoryDelta("favor"), -100, 100),
        fear: clamp(relation.fear + memoryDelta("fear"), -100, 100),
        respect: clamp(relation.respect + memoryDelta("respect"), -100, 100),
        suspicion: clamp(
          relation.suspicion + memoryDelta("suspicion"),
          -100,
          100,
        ),
        hostility: clamp(
          relation.hostility + memoryDelta("hostility"),
          -100,
          100,
        ),
        dependency: clamp(
          relation.dependency + memoryDelta("dependency"),
          -100,
          100,
        ),
      };
    },
  );
  const openingText = openingDisplayText(pack);
  const openingNpcs = selectOpeningVisualCharacters(pack, openingText);
  openingNpcs.forEach((npc) => {
    if (relations.some((relation) => relation.characterId === npc.id)) return;
    relations.push({
      relationId: `RUNTIME_${npc.id}_${playerId}`,
      sourceId: npc.id,
      targetId: playerId,
      characterId: npc.id,
      name: npc.name,
      relationType: "첫 만남",
      trust: 0,
      publicTrust: 0,
      favor: 0,
      fear: 0,
      respect: 0,
      suspicion: 0,
      hostility: 0,
      dependency: 0,
    });
  });

  return {
    turn: 0,
    day: 0,
    date: pack.startDate || "날짜 미상",
    weekday: weekdayFor(pack.startDate),
    time: scenarioOpeningTime(pack),
    weather: "맑음",
    location:
      pack.startLocation || pack.opening.openingLocation || "시작 장소 미상",
    status: splitItems(pack.player.status),
    inventory: splitItems(pack.player.inventory),
    relations,
    encounteredCharacterIds: openingNpcs.map((npc) => npc.id),
    clocks: pack.clocks.map((clock) => ({ ...clock })),
    sceneSummary: pack.opening.currentSituation,
    // firstGoal is GM guidance, not a fact the player has already observed.
    // Keeping it in public runtime memory leaked package-level story goals into
    // the HUD before the scene had established them.
    memories: [],
    sessionCanonLedger: [],
    variables: [],
    characterVisuals: openingNpcs.map((character) => {
      const openingReference = selectCharacterReferenceAsset(pack, character.id);
      return {
        characterId: character.id,
        characterName: openingCharacterDisplayName(character, openingText),
        appearancePrompt:
          character.appearance ||
          `${character.role || "주요 인물"}, ${character.personality}`,
        assetId:
          openingReference?.id ?? characterVisualAssetId(character.id),
        source: openingReference ? "package" as const : "pending" as const,
        introducedTurn: 0,
      };
    }),
    statusLedger: (pack.initialStatusLedger ?? []).map((entry) => ({ ...entry })),
    lastStatusChanges: [],
    autonomyActors: (pack.autonomyActors ?? []).map((actor) => ({
      actorId: actor.id,
      entityType: actor.entityType,
      entityId: actor.entityId,
      enabled: actor.enabled,
      currentLocation: actor.currentLocation,
      resources: actor.resources,
      currentPlan: actor.currentPlan,
      nextAction: actor.nextAction,
      knowledge: actor.knowledge,
      misinformation: actor.misinformation,
      lastActionTurn: -1,
      actionAttempts: 0,
    })),
    autonomyLog: [],
    worldFacts: [],
    relationshipMemories: (pack.initialRelationshipMemories ?? []).map(
      (memory) => ({ ...memory, effects: { ...memory.effects } }),
    ),
    lastRelationshipMemoryIds: [],
    observableTraces: [],
    characterResearchCache: [],
    imageEvery: pack.turnPresentation.sceneImage.enabled
      ? normalizeSceneImageInterval(pack.turnPresentation.sceneImage.frequency)
      : 0,
    imageQuality: "medium",
    imageResolution: "480p",
    imageAspect: normalizeImageAspect(
      pack.turnPresentation.sceneImage.aspectRatio,
      "landscape",
    ),
  };
}

export function deriveEncounteredCharacterIds(
  pack: ScenarioPack,
  turns: TurnRecord[],
): string[] {
  const encountered = new Set(
    selectOpeningVisualCharacters(pack).map((character) => character.id),
  );
  const npcIdByName = new Map(pack.npcs.map((npc) => [npc.name, npc.id]));
  turns.forEach((turn) => {
    turn.blocks.forEach((block) => {
      if (block.type !== "dialogue") return;
      const characterId = block.speakerId ||
        (block.speakerName ? npcIdByName.get(block.speakerName) : undefined);
      if (characterId && characterId !== pack.player.id) {
        encountered.add(characterId);
      }
    });
  });
  return [...encountered];
}

export function createOpeningTurn(pack: ScenarioPack): TurnRecord {
  const instantStartProfile = pack.instantStoryRuntime?.startProfiles[0];
  const packageOpeningLine = pack.opening.openingLine.trim();
  const packageOpeningHasDialogue = Boolean(
    openingLineParts(packageOpeningLine).dialogue,
  );
  const line = (packageOpeningHasDialogue
    ? packageOpeningLine
    : instantStartProfile?.prologue || packageOpeningLine).trim();
  const { narration, dialogue } = instantStartProfile && !packageOpeningHasDialogue
    ? { narration: line, dialogue: "" }
    : openingLineParts(line);
  const senderName = line.match(/발송인\s*[:：]\s*['‘“"]?([가-힣]{2,5})/u)?.[1] ?? "";
  const visibleOpeningContext = [
    pack.opening.currentSituation,
    pack.opening.immediateProblem,
    pack.opening.knownRisks,
  ].join(" ");
  const missingPersonSentence = senderName
    ? visibleOpeningContext
        .split(/(?<=[.!?])\s+/u)
        .find((sentence) =>
          sentence.includes(senderName) && /실종/u.test(sentence)
        ) ?? ""
    : "";
  const missingDuration = missingPersonSentence.match(
    /\d+\s*(?:년|개월|주|일)\s*(?:전|간|째|동안)?/u,
  )?.[0] ?? "";
  const missingRelation = missingPersonSentence.match(
    /외할머니|외할아버지|친할머니|친할아버지|할머니|할아버지|어머니|아버지|누나|언니|형|오빠|동생|배우자/u,
  )?.[0] ?? "";
  const openingContextBridge =
    senderName &&
    missingPersonSentence &&
    !/실종/u.test(line)
      ? `그 이름은 ${missingDuration ? `${missingDuration} ` : ""}실종된 ${
          missingRelation ? `${pack.player.name}의 ${missingRelation}, ` : "인물, "
        }${senderName}이었다. 그런데 왜 지금 그 이름으로 택배가 오는 걸까.`
      : "";
  const openingNpc = selectOpeningNpc(pack);
  const openingMedia = selectScenarioMediaAsset(
    pack,
    openingNpc?.id,
    "calm",
  );

  const blocks: StoryBlock[] = [];
  if (narration) {
    blocks.push({
      id: createId(),
      type: "narration",
      text: narration,
    });
  }
  if (openingContextBridge) {
    blocks.push({
      id: createId(),
      type: "narration",
      text: openingContextBridge,
    });
  }
  if (dialogue) {
    blocks.push({
      id: createId(),
      type: "dialogue",
      text: dialogue,
      speakerId: openingNpc?.id,
      speakerName: openingNpc?.name ?? "이름 없는 인물",
      emotion: "calm",
      mediaAssetId: openingMedia?.id,
    });
  }

  const recommendationCount = pack.turnPresentation.recommendedReplies.enabled
    ? Math.max(
        1,
        Math.min(
          3,
          Math.round(pack.turnPresentation.recommendedReplies.count || 3),
        ),
      )
    : 0;
  const defaultRecommendationCandidates: RecommendedReply[] = [
    {
      label: openingNpc && dialogue
        ? `${openingNpc.name}에게 방금 한 말의 구체적인 뜻을 묻는다.`
        : senderName
          ? "택배 알림에서 발송인 표시와 도착 시각을 확인한다."
          : "주변 상황을 살피고 지금 확인된 사실부터 정리한다.",
      risk: "낮음",
    },
    {
      label: senderName
        ? "무인택배함의 보관 위치와 수령 가능 시간을 확인한다."
        : openingNpc && dialogue
          ? `${openingNpc.name}에게 지금 선택할 수 있는 방법과 각각의 차이를 설명해 달라고 한다.`
        : "주변의 인물과 환경을 살펴 놓치고 있는 단서를 찾는다.",
      risk: "보통",
    },
    {
      label: senderName
        ? "발송 기록이 실제인지 택배함 관리 시스템에 문의한다."
        : openingNpc && dialogue
          ? `${openingNpc.name}에게 결정을 내리기 전에 감수해야 할 위험과 대가를 묻는다.`
        : "눈앞의 문제에 먼저 개입해 사건의 흐름을 바꾼다.",
      risk: "높음",
    },
  ];
  const recommendationCandidates: RecommendedReply[] =
    instantStartProfile?.recommendedReplies.length
      ? instantStartProfile.recommendedReplies.map((label, index) => ({
          label,
          risk: (["낮음", "보통", "높음"] as const)[index] ?? "보통",
        }))
      : defaultRecommendationCandidates;
  const observableText = blocks
    .map((block) => `${block.speakerName ?? ""} ${block.text}`)
    .join("\n");
  const recommendations = instantStartProfile?.recommendedReplies.length
    ? recommendationCandidates.slice(0, recommendationCount)
    : sanitizeRecommendedReplies(
        recommendationCandidates,
        {
          observableText,
          focusText: observableText,
          speakerName: dialogue ? openingNpc?.name : "",
          characterNames: pack.npcs.map((npc) => npc.name),
          availableCharacterNames: pack.npcs
            .filter((npc) => observableText.includes(npc.name))
            .map((npc) => npc.name),
          count: recommendationCount,
        },
      );
  const openingVisualText = blocks.map((block) => block.text).join("\n");
  const openingCharacterVisuals = selectOpeningVisualCharacters(
    pack,
    openingVisualText,
  ).map((character) => {
    const labels = openingCharacterLabels(character);
    const blockIndex = Math.max(
      0,
      blocks.findIndex((block) =>
        block.speakerId === character.id ||
        labels.some((label) => block.text.includes(label))
      ),
    );
    const packageReference = selectCharacterReferenceAsset(pack, character.id);
    const packageDisplay = selectScenarioMediaAsset(pack, character.id, "calm");
    const packageAsset = packageReference ?? packageDisplay;
    return {
      blockIndex,
      characterId: character.id,
      characterName: openingCharacterDisplayName(character, openingVisualText),
      importance: "major" as const,
      isFirstMajorAppearance: true,
      appearancePrompt:
        character.appearance ||
        `${character.role || "주요 인물"}, ${character.personality}`,
      reason: "작품 오프닝에서 직접 모습을 드러낸 주요 인물의 첫 등장",
      canonicalAssetId:
        packageAsset?.id ?? characterVisualAssetId(character.id),
      source: packageAsset ? "package" as const : "pending" as const,
    };
  });

  return {
    id: createId(),
    turn: 0,
    role: "opening",
    blocks,
    recommendations,
    createdAt: new Date().toISOString(),
    characterVisuals: openingCharacterVisuals,
  };
}

export function isPlayerAgencyViolation(
  block: StoryBlock,
  player: Character,
): boolean {
  if (block.type === "dialogue" && block.speakerId === player.id) return true;
  if (block.type !== "narration") return false;

  const escaped = player.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const decisiveActions =
    "말했다|대답했다|외쳤다|결심했다|생각했다|느꼈다|깨달았다|걸었다|달렸다|움직였다|웃었다|울었다|고개를 끄덕였다|손을 뻗었다";
  return new RegExp(
    `${escaped}(?:은|는|이|가)?[^.!?]{0,42}(?:${decisiveActions})`,
  ).test(block.text);
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
