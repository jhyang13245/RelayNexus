import { withoutEventSchedule } from "./event-schedule-retirement";
import { normalizeProtectedTerms } from "./disclosure-contract";
import { retireLocationGraph } from "./location-retirement";
import type { AiKnowledgeScopes, AiRouteContext, AlternateBeat, MultirouteEventExtension, Package15Design, RuntimePredicate, SceneMarker } from "./package15-contract";
import { makePackage15Design, normalizePackage15Design } from "./package15-contract";
import type { InstantStoryDesign } from "./instant-story-contract";
import { makeInstantStoryDesign, normalizeInstantStoryDesign, validateInstantStory } from "./instant-story-contract";
import { lintCortexPackage } from "./cortex-package-lint";
import { eventDesign, migrateCortexProject, type CortexEventDesign } from "./cortex-event-design";

export type CharacterImage = {
  imageOptimization?: { profile: "screen_v1"; width: number; height: number; originalBytes: number };
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  /** Browser-only binary source. IndexedDB stores Blob without Base64 expansion. */
  sourceBlob?: Blob;
  assetPath?: string;
  assetRef?: string;
  byteLength?: number;
  dataUrlHeader?: string;
  sha256?: string;
  label: string;
  isPrimary: boolean;
  addedAt: string;
};

const reviveImagePreview = (image: CharacterImage): CharacterImage => {
  if (image.sourceBlob instanceof Blob && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    return { ...image, dataUrl: URL.createObjectURL(image.sourceBlob) };
  }
  return image;
};

/** Rebuilds ephemeral blob: preview URLs after an IndexedDB reload. */
export function reviveProjectImageUrls(project: Project): Project {
  return {
    ...project,
    player: { ...project.player, images: project.player.images.map(reviveImagePreview) },
    npcs: project.npcs.map((character) => ({ ...character, images: character.images.map(reviveImagePreview) })),
    imageTriggers: project.imageTriggers.map((trigger) => ({ ...trigger, attachedImages: trigger.attachedImages.map(reviveImagePreview) })),
  };
}

export type TriggerImage = CharacterImage;

export type Character = {
  id: string;
  name: string;
  role: string;
  age: string;
  gender: string;
  origin: string;
  status: string;
  occupation: string;
  affiliation: string;
  appearance: string;
  personality: string;
  values: string;
  speechStyle: string;
  skills: string;
  weaknesses: string;
  goals: string;
  assets: string;
  inventory: string;
  relationships: string;
  publicInfo: string;
  hiddenInfo: string;
  importance: "protagonist" | "major" | "supporting" | "minor";
  imageOnFirstAppearance: boolean;
  visualLock: boolean;
  visualAnchor: string;
  imageFallback: "generate_anime" | "prompt_only" | "none";
  images: CharacterImage[];
  isPlayer: boolean;
  preRevealAlias: string;
  revealCondition?: RuntimePredicate;
};

export type Faction = {
  id: string; name: string; leader: string; officialGoal: string; hiddenGoal: string;
  resources: string; territory: string; income: string; militaryPower: string;
  intelligencePower: string; politicalPower: string; internalConflict: string;
  allies: string; enemies: string; playerRelation: string; currentPlan: string;
};

export type CharacterRelation = {
  id: string; sourceId: string; targetId: string; relationType: string;
  trust: number; favor: number; fear: number; respect: number; suspicion: number;
  hostility: number; dependency: number; publicSummary: string; hiddenNotes: string;
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
  actionCadence: "every_turn" | "every_2_turns" | "every_3_to_5_turns" | "on_trigger";
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

export type AutonomySettings = {
  enabled: boolean;
  maxActionsPerTurn: number;
  factionTickTurns: number;
  deterministicSeed: boolean;
  requireTravelTime: boolean;
  enforceKnowledgeBounds: boolean;
  enforceResourceBounds: boolean;
  allowOffscreenFailure: boolean;
  tracePolicy: "observable_only" | "rumors_allowed" | "silent_until_discovered";
  rules: string;
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
  type: "promise_kept" | "promise_broken" | "rescue" | "betrayal" | "debt" | "secret_shared" | "humiliation" | "shared_success" | "shared_failure" | "custom";
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
};

export type RelationshipMemorySettings = {
  enabled: boolean;
  deriveScoresFromMemory: boolean;
  keepContradictoryMemories: boolean;
  decayEnabled: boolean;
  maxActiveMemoriesPerRelation: number;
  displayPublicReasonsInHud: boolean;
  rules: string;
};

export type FactionRelation = {
  id: string; sourceFactionId: string; targetFactionId: string; status: string;
  cooperation: number; tension: number; dependency: number; publicSummary: string; hiddenNotes: string;
};

export type StoryBeat = {
  id: string;
  viewpoint: string;
  content: string;
};

export type LocationReference = {
  locationRef: string;
  label: string;
  aliases: string[];
};

export type LocationNode = LocationReference & {
  parentRef?: string;
  relativeToRef?: string;
  relation?: string;
};

export type LocationLink = {
  from: string;
  to: string;
  relation: "ADJACENT_TO" | "REACHABLE_FROM";
  minimumTravelSec?: number;
};

export type LocationGraph = {
  schema: "CORTEX_LOCATION_GRAPH_V1";
  nodes: LocationNode[];
  links: LocationLink[];
};

export type CortexRequirementType = "PHYSICAL_FACT" | "READER_UNDERSTANDING" | "PLAYER_AGENCY" | "NEGATIVE_CONSTRAINT";

export type CortexRequiredFunction = {
  id: string;
  description: string;
  type: CortexRequirementType;
  required: boolean;
  alternatives: string[];
};

export type CortexDisclosure = { protectedTerms: string[] };

export type StoryEvent = {
  cortexDesign?: CortexEventDesign;
  id: string; name: string; type: "Fixed" | "Conditional" | "Random" | "Foreshadowing";
  kind: "event" | "constraint" | "compound";
  visibility: "Public" | "Hidden"; status: "Planned" | "Active" | "Paused" | "Completed" | "Cancelled";
  priority: number; timeWindow: string; conditions: string; cancelConditions: string;
  participants: string; effects: string; onSuccess: string; onFailure: string;
  followUp: string; description: string; playerCanIntervene: boolean;
  required: boolean;
  sequence: number;
  completionSignals: string;
  requiredItems: string;
  requiredDialogue: string;
  requiredSpeakerId: string;
  recoveryAlternatives: string;
  preservePlayerChoice: boolean;
  endSceneAfterCompletion: boolean;
  appliesTo: string[];
  rules: string[];
  beats: StoryBeat[];
  alternateBeats: AlternateBeat[];
  sceneMarkers: SceneMarker[];
  canonLocation: string;
  canonLocationRef: string;
  locationAliases: string[];
  locations: LocationReference[];
  multiroute?: MultirouteEventExtension;
  act: string;
  /** Legacy editor fields only; Cortex v1.41.9 runtime exports omit scheduling. */
  studioLegacySchedule?: Record<string, unknown>;
  storyDay: number;
  startTime: string;
  endTime: string;
  nextEventId: string;
  failureConditions: string;
  requiredFunctions: CortexRequiredFunction[];
  revealTerms: string[];
  transitionLocationRefs: string[];
  observationLocationRefs: string[];
};

export type EventClock = {
  id: string; name: string; visibility: "Public" | "Hidden"; status: "Active" | "Paused" | "Triggered" | "Resolved";
  current: number; maximum: number; relatedEventId: string; advanceRules: string; regressRules: string;
  triggerResult: string; publicHint: string; hiddenNotes: string;
};

export type Foreshadowing = {
  id: string; title: string; visibility: "Public" | "Hidden";
  status: "Planned" | "Planted" | "Reinforced" | "Revealed" | "Cancelled";
  earliestDate: string; latestDate: string; plantingScene: string; reinforcementPlan: string;
  payoffConditions: string; payoffResult: string; relatedEntities: string; misdirection: string; notes: string;
};

export type ImageTrigger = {
  id: string;
  name: string;
  enabled: boolean;
  visibility: "Public" | "Hidden";
  triggerType: "event_start" | "event_condition_met" | "event_success" | "event_failure" | "clock_value" | "clock_completed" | "foreshadow_revealed" | "story_progress" | "custom_condition";
  sourceId: string;
  threshold: number;
  storyProgress: string;
  customCondition: string;
  mode: "generate_scene" | "generate_character_variant" | "show_package_image" | "show_trigger_image";
  attachedImages: TriggerImage[];
  characterIds: string[];
  prompt: string;
  negativePrompt: string;
  aspectRatio: "landscape" | "portrait" | "square";
  shotType: string;
  styleOverride: string;
  useCharacterReferences: boolean;
  preserveFaces: boolean;
  spoilerProtection: boolean;
  once: boolean;
  priority: number;
  outputPosition: "before_scene" | "after_scene" | "turn_bottom";
  routeIds: string[];
  chapterIds: string[];
  endingIds: string[];
  revealPolicyId: string;
  requiredFlags: string[];
  forbiddenFlags: string[];
};

export type StatusStat = {
  id: string;
  icon: string;
  name: string;
  rank: string;
  current: number;
  max: number;
  color: "green" | "blue" | "amber" | "violet" | "red";
};

export type StatusResource = {
  id: string;
  icon: string;
  name: string;
  current: number;
  unit: string;
  visibility: "public" | "conditional";
  revealRule: string;
};

export type StatusFunds = {
  icon: string;
  name: string;
  current: number;
  unit: string;
};

export type StatusRelationshipDisplay = {
  id: string;
  entityType: "character" | "faction";
  entityId: string;
  label: string;
  visibility: "public" | "met_only" | "conditional";
  revealRule: string;
  showSentence: boolean;
  sentence: string;
  showStat: boolean;
  statLabel: string;
  current: number;
  minimum: number;
  maximum: number;
  showSymbol: boolean;
  symbol: string;
  updateRule: string;
};

export type StatusWindow = {
  schemaVersion: 3;
  enabled: boolean;
  title: string;
  displayMode: "always_full" | "always_compact" | "changes_only";
  theme: "dark_rpg" | "glass_navy" | "minimal";
  placement: "before_replies" | "turn_bottom";
  showDeltas: boolean;
  collapseOnMobile: boolean;
  highlightChanges: boolean;
  sections: {
    profile: boolean;
    skills: boolean;
    stats: boolean;
    resources: boolean;
    condition: boolean;
    funds: boolean;
    inventory: boolean;
    relationships: boolean;
    clocks: boolean;
    objective: boolean;
  };
  abilitySummary: string;
  conditionSummary: string;
  stats: StatusStat[];
  resources: StatusResource[];
  funds: StatusFunds;
  relationshipDisplays: StatusRelationshipDisplay[];
  updateRules: string;
};

export type AiWorldContext = {
  enabled: boolean;
  liveEvaluation: boolean;
  premise: string;
  referenceFramework: string;
  referenceUsage: string;
  localContext: string;
  enrichmentPriorities: string;
  protectedCanon: string;
  avoidElements: string;
  originalityRule: string;
  spoilerRule: string;
  knowledgePolicy: "package_only" | "model_knowledge" | "hybrid";
  updateDepth: "light" | "balanced" | "deep";
  evaluationMoments: {
    sessionStart: boolean;
    sceneTransition: boolean;
    eventGeneration: boolean;
    npcDecision: boolean;
    everyTurn: boolean;
  };
  referenceCharacterResearch: {
    enabled: boolean;
    allowWebSearch: boolean;
    characterNames: string;
    researchScope: string;
    sourcePriority: string;
    canonCutoff: string;
    cacheMode: "session" | "scene" | "none";
    verifyOnFirstAppearance: boolean;
    verifyOnCanonConflict: boolean;
    recordSourcesInLedger: boolean;
  };
  routeContexts: Record<string, AiRouteContext>;
  knowledgeScopes: AiKnowledgeScopes;
};

export type ProtagonistInvariant = {
  ref: string;
  label: string;
  severity: "HARD" | "SOFT";
  description: string;
};

export const defaultProtagonistInvariants = (): ProtagonistInvariant[] => [
  { ref: "invariant:survival", label: "주인공의 생존", severity: "HARD", description: "주인공은 죽지 않는다." },
  { ref: "invariant:mobility", label: "보행·자립 이동 능력", severity: "SOFT", description: "이동·추격·잠입이 필요한 사건이 남아 있다." },
  { ref: "invariant:senses", label: "시각·청각", severity: "SOFT", description: "단서 관찰과 대화가 사건의 기본 수단이다." },
  { ref: "invariant:identity", label: "자기 기억과 인격의 연속성", severity: "SOFT", description: "전면적 기억 상실이나 인격 교체로 확정되지 않는다." },
];

export const invariantRefFromLabel = (label: string, index: number) => {
  const slug = label.trim().toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `invariant:${slug}` : `invariant:${index + 1}`;
};

export const blankProtagonistInvariant = (index: number): ProtagonistInvariant =>
  ({ ref: "", label: "", severity: "SOFT", description: "" });

// 엔진(Cortex v1.36.4) 정규화 규칙과 동일하게 맞춘다.
// HARD만 HARD, 그 외 전부 SOFT. label 없으면 description으로 대체. 둘 다 없으면 버린다.
export function normalizeProtagonistInvariants(raw: unknown): ProtagonistInvariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.reduce<ProtagonistInvariant[]>((list, item, index) => {
    const source = typeof item === "string" ? { label: item } : (item && typeof item === "object" ? item as Partial<ProtagonistInvariant> : null);
    if (!source) return list;
    const label = String(source.label ?? "").trim();
    const description = String(source.description ?? "").trim();
    if (!label && !description) return list;
    const ref = String(source.ref ?? "").trim() || invariantRefFromLabel(label || description, index);
    const severity = String(source.severity ?? "").trim().toUpperCase() === "HARD" ? "HARD" : "SOFT";
    list.push({ ref, label: label || description, severity, description: description || label });
    return list;
  }, []);
}

export type Project = {
  packageTarget: "legacy" | "cortex";
  protagonistInvariants: ProtagonistInvariant[];
  locationGraph: LocationGraph;
  disclosure: CortexDisclosure;
  runtimeMode: "intelligent_canon" | "instant_story";
  projectId: string; title: string; genre: string; worldType: string; startDate: string;
  startLocation: string; tone: string; playStyle: string; difficulty: "EASY" | "NORMAL" | "HARD";
  author: string; notes: string; randomSeed: number; world: Record<string, string>;
  player: Character; npcs: Character[]; factions: Faction[]; events: StoryEvent[];
  characterRelations: CharacterRelation[]; factionRelations: FactionRelation[];
  eventClocks: EventClock[]; foreshadowings: Foreshadowing[]; imageTriggers: ImageTrigger[];
  autonomyActors: AutonomyActor[]; autonomySettings: AutonomySettings;
  relationshipMemories: RelationshipMemory[]; relationshipMemorySettings: RelationshipMemorySettings;
  gmData: Record<string, string>; opening: Record<string, string>; style: Record<string, string>;
  aiWorldContext: AiWorldContext;
  statusWindow: StatusWindow;
  package15: Package15Design;
  instantStory: InstantStoryDesign;
  turnPresentation: {
    recommendedReplies: { enabled: boolean; count: number; style: string; showRisk: boolean; revealHiddenInformation: boolean };
    sceneImage: { enabled: boolean; frequency: string; position: string; count: number; aspectRatio: string; textInImage: boolean; spoilerProtection: boolean; fallback: string; styleHint: string };
  };
  visualBible: {
    enabled: boolean;
    globalStyle: string;
    consistencyRules: string;
    introductionRule: string;
  };
};

export const worldFields = [
  ["overview", "세계 개요", "이 세계가 어떤 곳인지 한 문단으로 정리하세요."],
  ["history", "역사와 분기점", "현재 상황을 만든 역사적 사건과 달라진 지점을 적으세요."],
  ["politics", "정치 구조", "권력 기관, 법, 계급과 실제 의사결정 구조를 적으세요."],
  ["economy", "경제와 자원", "화폐, 물가, 주요 산업과 희소 자원을 적으세요."],
  ["technology", "기술 수준", "사용 가능한 기술과 넘을 수 없는 한계를 적으세요."],
  ["society", "사회·문화", "관습, 교육, 차별, 일상생활을 적으세요."],
  ["military", "군사", "전력, 지휘 체계와 실제 동원 능력을 적으세요."],
  ["religionIdeology", "종교·이념", "사람들을 움직이는 신념과 충돌을 적으세요."],
  ["transportCommunication", "교통·통신", "이동 속도와 정보 전달의 제약을 적으세요."],
  ["currencyPrices", "화폐·물가", "생활비와 거래 규모의 감각을 고정하세요."],
  ["supernatural", "초자연 요소", "능력 체계와 대가, 또는 ‘없음’을 명시하세요."],
  ["impossibilities", "불가능한 것", "AI가 편의적으로 만들면 안 되는 요소를 적으세요."],
  ["fixedCanon", "절대 유지할 핵심 정사", "시뮬레이션 중 어떤 경우에도 바뀌면 안 되는 사실입니다."],
  ["aiFillConstraints", "AI 자동 보완 제약", "빈칸을 보완할 때 지켜야 할 기준을 적으세요."],
] as const;

export const uid = (prefix = "ID") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const blankStoryEvent = (sequence = 1): StoryEvent => ({
  id: `EV_ACT1_${String(sequence).padStart(2, "0")}_NEW_EVENT`,
  name: "새 사건",
  kind: "event",
  type: "Conditional",
  visibility: "Hidden",
  status: "Planned",
  priority: 50,
  timeWindow: "",
  conditions: "",
  cancelConditions: "",
  participants: "",
  effects: "",
  onSuccess: "",
  onFailure: "",
  followUp: "",
  description: "",
  playerCanIntervene: true,
  required: false,
  sequence,
  completionSignals: "",
  requiredItems: "",
  requiredDialogue: "",
  requiredSpeakerId: "",
  recoveryAlternatives: "",
  preservePlayerChoice: true,
  endSceneAfterCompletion: false,
  appliesTo: [],
  rules: [],
  beats: [],
  alternateBeats: [],
  sceneMarkers: [],
  canonLocation: "",
  canonLocationRef: "",
  locationAliases: [],
  locations: [],
  act: "ACT1",
  storyDay: 0,
  startTime: "",
  endTime: "",
  nextEventId: "",
  failureConditions: "",
  requiredFunctions: [],
  revealTerms: [],
  transitionLocationRefs: [],
  observationLocationRefs: [],
});

export const blankCortexRequiredFunction = (index = 1): CortexRequiredFunction => ({
  id: `goal-${index}`,
  description: "",
  type: "PHYSICAL_FACT",
  required: true,
  alternatives: [],
});

export const blankLocationNode = (index = 1): LocationNode => ({
  locationRef: `location:new-${index}`,
  label: `새 위치 ${index}`,
  aliases: [],
});

export const normalizeLocationGraph = (raw: unknown): LocationGraph => {
  const source = raw && typeof raw === "object" ? raw as Partial<LocationGraph> : {};
  return {
    schema: "CORTEX_LOCATION_GRAPH_V1",
    nodes: Array.isArray(source.nodes) ? source.nodes.filter(Boolean).map((item) => {
      const node = item as Partial<LocationNode>;
      return {
        locationRef: String(node.locationRef ?? "").trim(),
        label: String(node.label ?? "").trim(),
        aliases: Array.isArray(node.aliases) ? node.aliases.map(String).map((value) => value.trim()).filter(Boolean) : [],
        ...(String(node.parentRef ?? "").trim() ? { parentRef: String(node.parentRef).trim() } : {}),
        ...(String(node.relativeToRef ?? "").trim() ? { relativeToRef: String(node.relativeToRef).trim() } : {}),
        ...(String(node.relation ?? "").trim() ? { relation: String(node.relation).trim() } : {}),
      };
    }) : [],
    links: Array.isArray(source.links) ? source.links.filter(Boolean).map((item) => {
      const link = item as Partial<LocationLink>;
      return {
        from: String(link.from ?? "").trim(),
        to: String(link.to ?? "").trim(),
        relation: link.relation === "REACHABLE_FROM" ? "REACHABLE_FROM" : "ADJACENT_TO",
        ...(Number.isFinite(link.minimumTravelSec) ? { minimumTravelSec: Math.max(0, Number(link.minimumTravelSec)) } : {}),
      };
    }) : [],
  };
};

export const blankStoryBeat = (index = 1): StoryBeat => ({
  id: uid("BEAT"),
  viewpoint: "",
  content: `복합 사건의 ${index}번째 국면`,
});

export const defaultAutonomyRules = `1. 플레이어가 보지 않는 곳에서도 활성 NPC와 세력은 자신의 목표·정보·자원·위치에 따라 행동 후보를 만든다.
2. 매 턴 모든 인물을 억지로 움직이지 않는다. 활동 등급·행동 주기·목표 우선도에 따라 최대 행동 수 안에서 선별한다.
3. 배우는 장부에 기록된 정보만 사용할 수 있으며, 다른 지역으로 이동하려면 세계관의 이동 시간이 실제로 흘러야 한다.
4. 성공을 보장하지 않는다. 자원·능력·협력·방해·위험도를 근거로 성공·부분 성공·실패를 판정한다.
5. 비공개 행동은 숨은 세계 장부에 먼저 기록하고, 플레이어에게는 목격 가능한 흔적·소문·결과만 공개한다.
6. 자율 행동의 결과는 사건 시계·위치·자원·관계 기억에 실제 변화를 남기며 다음 행동의 원인이 된다.`;

export const defaultRelationshipMemoryRules = `1. 관계 수치는 임의로 올리거나 내리지 않는다. 먼저 방향성 기억을 기록한 뒤 그 기억의 효과를 초기 기준값에 합산한다.
2. 기억에는 누가 누구를, 언제, 무엇 때문에 신뢰·의심·두려워하게 되었는지 원인을 남긴다.
3. 약속·배신·구조·빚·공유한 비밀·모욕과 미해결 감정은 장기 기억으로 보존하고 이후 판단의 근거로 사용한다.
4. 서로 모순되는 기억도 삭제하지 않는다. 중요도·영구성·최근성·현재 맥락을 함께 평가한다.
5. 숨은 기억과 미등장 인물의 이유는 공개하지 않는다. 상태창에는 직접 만난 인물의 공개 가능한 이유만 표시한다.
6. 관계는 방향성이므로 A가 B에게 느끼는 기억을 B가 A에게 자동 복제하지 않는다.`;

export const makeAutonomySettings = (): AutonomySettings => ({
  enabled: true,
  maxActionsPerTurn: 3,
  factionTickTurns: 3,
  deterministicSeed: true,
  requireTravelTime: true,
  enforceKnowledgeBounds: true,
  enforceResourceBounds: true,
  allowOffscreenFailure: true,
  tracePolicy: "observable_only",
  rules: defaultAutonomyRules,
});

export const makeRelationshipMemorySettings = (): RelationshipMemorySettings => ({
  enabled: true,
  deriveScoresFromMemory: true,
  keepContradictoryMemories: true,
  decayEnabled: true,
  maxActiveMemoriesPerRelation: 50,
  displayPublicReasonsInHud: true,
  rules: defaultRelationshipMemoryRules,
});

export const blankAutonomyActor = (entityType: AutonomyActor["entityType"], entityId: string): AutonomyActor => ({
  id: uid("AUTO"),
  entityType,
  entityId,
  enabled: true,
  activityTier: entityType === "faction" ? "regional" : "nearby",
  currentLocation: "",
  locationVisibility: "Hidden",
  shortTermGoal: "",
  mediumTermGoal: "",
  longTermGoal: "",
  goalPriority: 70,
  currentPlan: "",
  nextAction: "",
  actionCadence: entityType === "faction" ? "every_3_to_5_turns" : "every_2_turns",
  knowledge: "",
  misinformation: "",
  resources: "",
  constraints: "",
  riskTolerance: "moderate",
  cooperationRules: "",
  conflictRules: "",
  travelRules: "세계관의 교통·통신 제약을 따른다.",
  successOutcome: "",
  partialOutcome: "",
  failureOutcome: "",
  offscreenEnabled: true,
  canFailOffscreen: true,
  revealTraces: true,
});

export const blankRelationshipMemory = (relation?: CharacterRelation): RelationshipMemory => ({
  id: uid("MEM"),
  relationId: relation?.id ?? "",
  sourceId: relation?.sourceId ?? "",
  targetId: relation?.targetId ?? "",
  turnLabel: "초기 설정",
  eventId: "",
  type: "custom",
  title: "새 관계 기억",
  summary: "",
  cause: "",
  visibility: "Public",
  importance: 50,
  permanence: "decaying",
  effects: { trust: 0, favor: 0, fear: 0, respect: 0, suspicion: 0, hostility: 0, dependency: 0 },
  active: true,
  unresolved: false,
  resolutionConditions: "",
  tags: "",
  createdAt: new Date().toISOString(),
});

export const defaultStatusUpdateRules = `1. 매 턴 서술이 끝나면 비공개 세계 장부를 먼저 갱신하고, 플레이어가 알 수 있는 정보만 상태창에 반영한다.
2. 능력치·자원·상태 변화에는 반드시 이번 턴에 실제로 서술되거나 기록된 원인이 있어야 한다.
3. 매 턴 전체 상태창을 출력하고, 바뀐 값은 이전 값 대비 증감과 원인을 함께 강조한다.
4. Ability와 Condition은 플레이어가 현재 이해할 수 있는 말로 한두 줄만 표시하며, 정체·계약·미래 사건을 앞서 설명하지 않는다.
5. Resources는 각 항목에 적힌 공개·증감 조건이 실제 장면에서 충족된 뒤에만 표시하거나 변경한다.
6. 작품별 특수 자원과 장비는 실제 보유·사용이 확인된 경우에만 바꾸며, 자금은 확인된 지출·수입에 따라 갱신한다.
7. 미등장 인물, 진명, 비밀 진영, 숨은 관계와 비공개 사건 시계는 공개 조건이 충족되기 전까지 숨긴다.
8. 플레이어의 행동·대사·감정을 임의로 확정하지 않으며, 없던 아이템·자원·능력을 소급해 만들지 않는다.
9. 인물·세력 관계 표시는 실제 상호작용의 공개 가능한 결과가 있을 때만 문장·수치·기호를 갱신하고, 같은 원인을 중복 반영하지 않는다.`;

export const blankStatusRelationshipDisplay = (entityType: StatusRelationshipDisplay["entityType"] = "character"): StatusRelationshipDisplay => ({
  id: uid(entityType === "faction" ? "HUD_FACTION" : "HUD_REL"),
  entityType,
  entityId: "",
  label: entityType === "faction" ? "새 세력" : "새 인물",
  visibility: "met_only",
  revealRule: entityType === "faction" ? "해당 세력의 존재를 플레이어가 확인한 뒤 공개" : "해당 인물을 직접 만난 뒤 공개",
  showSentence: true,
  sentence: "아직 관계를 판단할 만한 일이 없다.",
  showStat: true,
  statLabel: entityType === "faction" ? "평판" : "호감",
  current: 0,
  minimum: -100,
  maximum: 100,
  showSymbol: true,
  symbol: "○",
  updateRule: "이번 턴의 직접 상호작용이나 공개된 사건 결과가 있을 때만 변경",
});

export const makeStatusWindow = (): StatusWindow => ({
  schemaVersion: 3,
  enabled: true,
  title: "TURN STATUS · LIVE",
  displayMode: "always_full",
  theme: "dark_rpg",
  placement: "before_replies",
  showDeltas: true,
  collapseOnMobile: true,
  highlightChanges: true,
  sections: {
    profile: true,
    skills: true,
    stats: true,
    resources: true,
    condition: true,
    funds: true,
    inventory: false,
    relationships: true,
    clocks: false,
    objective: false,
  },
  abilitySummary: "현재 공개된 특별 능력은 아직 없다.",
  conditionSummary: "현재 확인된 부상이나 이상 상태는 없다.",
  stats: [
    { id: uid("STAT"), icon: "❤", name: "체력", rank: "A", current: 100, max: 100, color: "green" },
    { id: uid("STAT"), icon: "◈", name: "집중력", rank: "B", current: 100, max: 100, color: "blue" },
    { id: uid("STAT"), icon: "✦", name: "능력 게이지", rank: "F", current: 0, max: 100, color: "violet" },
  ],
  resources: [
    { id: "primary_resource", icon: "spark", name: "핵심 자원", current: 0, unit: "개", visibility: "conditional", revealRule: "해당 자원의 존재와 보유량을 플레이어가 실제로 확인한 뒤 공개" },
    { id: "consumable_resource", icon: "gem", name: "소모 자원", current: 0, unit: "개", visibility: "conditional", revealRule: "획득 또는 사용이 실제 장면에서 확인된 뒤 공개하고 증감" },
    { id: "special_equipment", icon: "sword", name: "특수 장비", current: 0, unit: "개", visibility: "conditional", revealRule: "장비를 실제로 획득하고 용도를 확인한 뒤 공개" },
  ],
  funds: { icon: "wallet", name: "자금", current: 0, unit: "원" },
  relationshipDisplays: [],
  updateRules: defaultStatusUpdateRules,
});

export const makeFateStatusWindow = (): StatusWindow => ({
  ...makeStatusWindow(),
  resources: [
    { id: "command_seals", icon: "command-seal", name: "령주", current: 3, unit: "회", visibility: "conditional", revealRule: "서번트와의 계약 성립을 플레이어가 직접 확인한 턴에 공개" },
    { id: "magic_gems", icon: "gem", name: "보석", current: 0, unit: "개", visibility: "conditional", revealRule: "마술 자원인 보석을 실제로 보유하거나 성질을 확인한 뒤 공개" },
    { id: "magic_weapons", icon: "sword", name: "마술무기", current: 0, unit: "개", visibility: "conditional", revealRule: "마술무기를 실제로 획득하고 용도를 확인한 뒤 공개" },
  ],
  updateRules: `${defaultStatusUpdateRules}\n9. Fate 계열에서 령주는 계약 성립을 직접 확인한 턴부터 3회로 공개하고, 사용이 실제로 확정된 경우에만 차감한다.`,
});

export const blankCharacter = (isPlayer = false): Character => ({
  id: isPlayer ? "PLAYER" : uid("CHAR"), name: isPlayer ? "주인공" : "새 인물",
  role: isPlayer ? "플레이어 캐릭터" : "주요 NPC", age: "", gender: "", origin: "", status: "",
  occupation: "", affiliation: "", appearance: "", personality: "", values: "", speechStyle: "",
  skills: "", weaknesses: "", goals: "", assets: "", inventory: "", relationships: "",
  publicInfo: "", hiddenInfo: "", importance: isPlayer ? "protagonist" : "major",
  imageOnFirstAppearance: true, visualLock: true, visualAnchor: "", imageFallback: "generate_anime", images: [], isPlayer,
  preRevealAlias: "",
});

export const blankImageTrigger = (): ImageTrigger => ({
  id: uid("IMGTRG"),
  name: "새 이미지 트리거",
  enabled: true,
  visibility: "Hidden",
  triggerType: "event_start",
  sourceId: "",
  threshold: 1,
  storyProgress: "",
  customCondition: "",
  mode: "generate_scene",
  attachedImages: [],
  characterIds: [],
  prompt: "",
  negativePrompt: "텍스트, 워터마크, 스포일러, 설정과 다른 얼굴",
  aspectRatio: "landscape",
  shotType: "시네마틱 와이드 샷",
  styleOverride: "",
  useCharacterReferences: true,
  preserveFaces: true,
  spoilerProtection: true,
  once: true,
  priority: 70,
  outputPosition: "after_scene",
  routeIds: [],
  chapterIds: [],
  endingIds: [],
  revealPolicyId: "",
  requiredFlags: [],
  forbiddenFlags: [],
});

export const makeAiWorldContext = (): AiWorldContext => ({
  enabled: false,
  liveEvaluation: true,
  premise: "",
  referenceFramework: "",
  referenceUsage: "참고 세계관의 핵심 규칙·용어·세력 논리와 장르적 기대를 분석하되, 현재 패키지에 명시된 정사를 최우선으로 적용한다.",
  localContext: "",
  enrichmentPriorities: "지역의 역사·지리·기관·사회문화·일상생활, 인물 동기, 세력 이해관계, 사건의 개연성과 후폭풍",
  protectedCanon: "",
  avoidElements: "원작 사건의 그대로인 재연, 기존 캐릭터의 역할 복제, 근거 없는 설정 추가, 플레이어가 알지 못하는 스포일러의 조기 공개",
  originalityRule: "참고 세계관의 작동 원리와 분위기는 활용하되, 현재 프로젝트의 인물·지역·사건은 독자적인 원인과 결과로 전개한다.",
  spoilerRule: "진명·배후·비밀 세력·원작 지식은 현재 장면에서 플레이어가 관측하거나 추론할 근거가 생기기 전까지 공개하지 않는다.",
  knowledgePolicy: "hybrid",
  updateDepth: "balanced",
  evaluationMoments: { sessionStart: true, sceneTransition: true, eventGeneration: true, npcDecision: true, everyTurn: true },
  referenceCharacterResearch: {
    enabled: false,
    allowWebSearch: true,
    characterNames: "",
    researchScope: "공식 인물 설정, 성격과 핵심 가치관, 말투와 호칭, 능력과 한계, 주요 관계, 원작 시점별 목표와 알려진 사건",
    sourcePriority: "공식 작품·공식 캐릭터 소개·공식 설정 자료를 우선하고, 신뢰할 수 있는 2차 정리 자료는 교차 확인에만 사용한다. 팬덤 해석은 사실과 분리한다.",
    canonCutoff: "현재 시나리오 시작 시점까지 공개된 정보만 사용하며, 이후 전개의 중대 스포일러는 숨긴다.",
    cacheMode: "session",
    verifyOnFirstAppearance: true,
    verifyOnCanonConflict: true,
    recordSourcesInLedger: true,
  },
  routeContexts: {},
  knowledgeScopes: {
    playerMeta: "플레이어는 해금·회차·열람한 엔딩 같은 작품 메타 진행만 알 수 있다.",
    protagonist: "주인공은 현재 세계선에서 직접 경험하거나 기억 전이 규칙으로 보존된 사실만 안다.",
    npc: "NPC는 각자의 지식 장부와 관측 범위 안의 사실만 사용한다.",
  },
});

export const makeProject = (fresh = false): Project => ({
  packageTarget: "legacy",
  protagonistInvariants: [],
  locationGraph: { schema: "CORTEX_LOCATION_GRAPH_V1", nodes: [], links: [] },
  disclosure: { protectedTerms: [] },
  runtimeMode: "intelligent_canon",
  projectId: fresh ? `RN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now().toString().slice(-6)}` : "RN-DRAFT",
  title: "새 릴레이 소설", genre: "초능력 학원·미스터리", worldType: "완전한 가상세계",
  startDate: "1285-03-01", startLocation: "기성학원 A동",
  tone: "생동감 있는 학원물과 서서히 드러나는 미스터리", playStyle: "자유 행동형 장기 시뮬레이션",
  difficulty: "HARD", author: "", notes: "", randomSeed: fresh ? Math.floor(Math.random() * 899_999_999) + 100_000_000 : 420001285,
  world: Object.fromEntries(worldFields.map(([key]) => [key, ""])), player: blankCharacter(true), npcs: [],
  aiWorldContext: makeAiWorldContext(),
  factions: [], events: [], characterRelations: [], factionRelations: [], eventClocks: [], foreshadowings: [], imageTriggers: [],
  autonomyActors: [], autonomySettings: makeAutonomySettings(), relationshipMemories: [], relationshipMemorySettings: makeRelationshipMemorySettings(),
  gmData: { worldTruthLedger: "", hiddenTimeline: "", secretResources: "", plannedTwists: "", forbiddenDisclosures: "", failureEscalationRules: "", continuityNotes: "" },
  opening: { preHistory: "", currentSituation: "", immediateProblem: "", knownRisks: "", hiddenRisks: "", openingCharacters: "", openingLocation: "", openingEvent: "", firstGoal: "", openingLine: "" },
  style: { narrationPerson: "3인칭 제한 시점", proseStyle: "몰입감 있는 현실주의 소설체", dialogueStyle: "시대·신분·성격에 맞는 자연스러운 대사", descriptionDensity: "보통", violenceLevel: "중간", romanceLevel: "선택적", statusDisclosure: "중요 변화만 공개", customRules: "플레이어 캐릭터의 행동·대사·감정을 예측하여 대신 서술하지 않는다." },
  statusWindow: makeStatusWindow(),
  package15: makePackage15Design(),
  instantStory: makeInstantStoryDesign(),
  turnPresentation: {
    recommendedReplies: { enabled: true, count: 3, style: "diverse", showRisk: true, revealHiddenInformation: false },
    sceneImage: { enabled: true, frequency: "important_only", position: "bottom", count: 1, aspectRatio: "landscape", textInImage: false, spoilerProtection: true, fallback: "IMAGE_PROMPT", styleHint: "시나리오 분위기에 맞는 고품질 애니메이션 콘셉트 아트" },
  },
  visualBible: {
    enabled: true,
    globalStyle: "고품질 애니메이션 일러스트, 선명한 인물 중심 구도, 장면의 조명과 시대 의상을 정사에 맞춤",
    consistencyRules: "기준 이미지가 있는 인물은 얼굴형·눈·머리·체형·고유 액세서리를 동일하게 유지한다. 의상 변화가 있어도 정체성 앵커를 보존한다.",
    introductionRule: "비중 높은 새 캐릭터가 처음 등장하면 반드시 인물 이미지를 함께 출력한다. 패키지 기준 이미지가 없으면 애니풍 이미지를 생성하고, 그 최초 결과를 이후 외형의 기준으로 고정한다.",
  },
});

const mergeObject = <T extends object>(base: T, raw: unknown): T => ({ ...base, ...(raw && typeof raw === "object" ? raw : {}) });

export function normalizeProject(raw: unknown): Project {
  const base = makeProject(true);
  const source = raw && typeof raw === "object" ? raw as Partial<Project> : {};
  const project = { ...base, ...source } as Project;
  project.packageTarget = source.packageTarget === "cortex" ? "cortex" : "legacy";
  project.protagonistInvariants = normalizeProtagonistInvariants(source.protagonistInvariants);
  project.locationGraph = normalizeLocationGraph(source.locationGraph);
  project.disclosure = {
    protectedTerms: normalizeProtectedTerms(source.disclosure?.protectedTerms ?? (source as Record<string, unknown>).protectedTerms),
  };
  delete (project as unknown as Record<string, unknown>).protectedTerms;
  project.runtimeMode = source.runtimeMode === "instant_story" || (source.runtimeMode === undefined && source.instantStory?.enabled)
    ? "instant_story"
    : "intelligent_canon";
  project.world = mergeObject(base.world, source.world);
  project.gmData = mergeObject(base.gmData, source.gmData);
  project.opening = mergeObject(base.opening, source.opening);
  project.style = mergeObject(base.style, source.style);
  project.visualBible = mergeObject(base.visualBible, source.visualBible);
  project.aiWorldContext = {
    ...mergeObject(base.aiWorldContext, source.aiWorldContext),
    evaluationMoments: mergeObject(base.aiWorldContext.evaluationMoments, source.aiWorldContext?.evaluationMoments),
    referenceCharacterResearch: mergeObject(base.aiWorldContext.referenceCharacterResearch, source.aiWorldContext?.referenceCharacterResearch),
    routeContexts: source.aiWorldContext?.routeContexts && typeof source.aiWorldContext.routeContexts === "object" ? source.aiWorldContext.routeContexts : {},
    knowledgeScopes: mergeObject(base.aiWorldContext.knowledgeScopes, source.aiWorldContext?.knowledgeScopes),
  };
  project.package15 = normalizePackage15Design(source.package15);
  project.instantStory = normalizeInstantStoryDesign(source.instantStory);
  project.statusWindow = {
    ...mergeObject(base.statusWindow, source.statusWindow),
    schemaVersion: 3,
    sections: source.statusWindow?.sections
      ? mergeObject(base.statusWindow.sections, source.statusWindow.sections)
      : base.statusWindow.sections,
    abilitySummary:
      typeof source.statusWindow?.abilitySummary === "string" &&
        source.statusWindow.abilitySummary.trim()
        ? source.statusWindow.abilitySummary.trim()
        : base.statusWindow.abilitySummary,
    conditionSummary:
      typeof source.statusWindow?.conditionSummary === "string" &&
        source.statusWindow.conditionSummary.trim()
        ? source.statusWindow.conditionSummary.trim()
        : base.statusWindow.conditionSummary,
    stats: Array.isArray(source.statusWindow?.stats) ? source.statusWindow.stats.filter(Boolean) : base.statusWindow.stats,
    resources: Array.isArray(source.statusWindow?.resources) && source.statusWindow.resources.length
      ? source.statusWindow.resources.filter(Boolean).slice(0, 3).map((saved, index) => ({
          ...(base.statusWindow.resources[index] ?? base.statusWindow.resources[0]),
          ...saved,
          id: saved.id?.trim() || `resource_${index + 1}`,
          name: saved.name?.trim() || `자원 ${index + 1}`,
          icon: saved.icon?.trim() || base.statusWindow.resources[index]?.icon || "spark",
        }))
      : base.statusWindow.resources,
    funds: mergeObject(base.statusWindow.funds, source.statusWindow?.funds),
    relationshipDisplays: Array.isArray(source.statusWindow?.relationshipDisplays)
      ? source.statusWindow.relationshipDisplays.filter(Boolean).map((saved) => ({
          ...blankStatusRelationshipDisplay(saved.entityType === "faction" ? "faction" : "character"),
          ...saved,
          id: saved.id?.trim() || uid("HUD_REL"),
          label: saved.label?.trim() || (saved.entityType === "faction" ? "새 세력" : "새 인물"),
          minimum: Number.isFinite(saved.minimum) ? Number(saved.minimum) : -100,
          maximum: Number.isFinite(saved.maximum) ? Number(saved.maximum) : 100,
          current: Number.isFinite(saved.current) ? Number(saved.current) : 0,
        }))
      : [],
  };
  project.turnPresentation = {
    recommendedReplies: mergeObject(base.turnPresentation.recommendedReplies, source.turnPresentation?.recommendedReplies),
    sceneImage: mergeObject(base.turnPresentation.sceneImage, source.turnPresentation?.sceneImage),
  };
  project.player = mergeObject(base.player, source.player);
  project.player.images = Array.isArray(source.player?.images) ? source.player.images : [];
  project.npcs = Array.isArray(source.npcs) ? source.npcs.filter(Boolean).map((item) => {
    const next = mergeObject(blankCharacter(false), item);
    next.images = Array.isArray((item as Character).images) ? (item as Character).images : [];
    return next;
  }) : [];
  project.factions = Array.isArray(source.factions) ? source.factions : [];
  project.events = Array.isArray(source.events)
    ? source.events.filter(Boolean).map((item, index) => {
      const rawEvent = item as Partial<StoryEvent>;
        const legacyWindow = project.packageTarget === "cortex" ? "" : String(rawEvent.timeWindow ?? "");
        const legacyTimes = [...legacyWindow.matchAll(/(\d{1,2}:\d{2}(?::\d{2})?)/gu)].map((match) => match[1]);
        const legacyDay = /D\+(\d+)/iu.exec(legacyWindow)?.[1];
        const normalizeClock = (value: unknown) => {
          const clock = String(value ?? "").trim();
          return /^\d{1,2}:\d{2}(?::\d{2})?$/u.test(clock) ? clock.split(":").map((part) => part.padStart(2, "0")).concat(clock.split(":").length === 2 ? ["00"] : []).join(":") : clock;
        };
        const requirements = Array.isArray(rawEvent.requiredFunctions) ? rawEvent.requiredFunctions.filter(Boolean).map((item, requirementIndex) => {
          const requirement = typeof item === "string" ? { description: item } : item as Partial<CortexRequiredFunction>;
          const declaredType = String(requirement.type ?? "PHYSICAL_FACT").toUpperCase();
          const type: CortexRequirementType = (["PHYSICAL_FACT", "READER_UNDERSTANDING", "PLAYER_AGENCY", "NEGATIVE_CONSTRAINT"] as string[]).includes(declaredType)
            ? declaredType as CortexRequirementType
            : "PHYSICAL_FACT";
          return {
            id: String(requirement.id ?? `goal-${requirementIndex + 1}`).trim() || `goal-${requirementIndex + 1}`,
            description: String(requirement.description ?? "").trim(),
            type,
            required: requirement.required !== false,
            alternatives: Array.isArray(requirement.alternatives) ? requirement.alternatives.map(String).map((value) => value.trim()).filter(Boolean) : [],
          };
        }) : [];
        const transitionLocationRefs = Array.isArray(rawEvent.transitionLocationRefs)
          ? rawEvent.transitionLocationRefs.map(String).map((value) => value.trim()).filter(Boolean)
          : Array.isArray(rawEvent.locations) ? rawEvent.locations.map((location) => String(location?.locationRef ?? "").trim()).filter(Boolean) : [];
        const observationLocationRefs = Array.isArray(rawEvent.observationLocationRefs)
          ? rawEvent.observationLocationRefs.map(String).map((value) => value.trim()).filter(Boolean)
          : [];
        const next = {
          ...blankStoryEvent(index + 1),
          ...rawEvent,
          kind: ["constraint", "compound"].includes(String(rawEvent.kind)) ? rawEvent.kind as StoryEvent["kind"] : "event",
          sequence: Number.isFinite((item as StoryEvent).sequence)
            ? Math.max(1, Number((item as StoryEvent).sequence))
            : index + 1,
          appliesTo: Array.isArray(rawEvent.appliesTo) ? rawEvent.appliesTo.filter((id): id is string => typeof id === "string") : [],
          rules: Array.isArray(rawEvent.rules) ? rawEvent.rules.filter((rule): rule is string => typeof rule === "string") : [],
          beats: Array.isArray(rawEvent.beats) ? rawEvent.beats.filter(Boolean).map((beat, beatIndex) => ({
            ...blankStoryBeat(beatIndex + 1),
            ...beat,
          })) : [],
          alternateBeats: Array.isArray(rawEvent.alternateBeats) ? rawEvent.alternateBeats.filter(Boolean) : [],
          sceneMarkers: Array.isArray(rawEvent.sceneMarkers) ? rawEvent.sceneMarkers.filter(Boolean) : [],
          canonLocation: String(rawEvent.canonLocation ?? "").trim(),
          canonLocationRef: String(rawEvent.canonLocationRef ?? "").trim(),
          locationAliases: Array.isArray(rawEvent.locationAliases) ? rawEvent.locationAliases.map(String).map((value) => value.trim()).filter(Boolean) : [],
          locations: Array.isArray(rawEvent.locations) ? rawEvent.locations.filter(Boolean).map((location) => ({
            locationRef: String(location.locationRef ?? "").trim(),
            label: String(location.label ?? "").trim(),
            aliases: Array.isArray(location.aliases) ? location.aliases.map(String).map((value) => value.trim()).filter(Boolean) : [],
          })) : [],
          act: String(rawEvent.act ?? "").trim(),
          storyDay: Number.isFinite(rawEvent.storyDay) ? Math.max(0, Number(rawEvent.storyDay)) : legacyDay ? Math.max(0, Number(legacyDay)) : 0,
          startTime: normalizeClock(rawEvent.startTime || legacyTimes[0]),
          endTime: normalizeClock(rawEvent.endTime || legacyTimes[1]),
          nextEventId: String(rawEvent.nextEventId ?? "").trim(),
          failureConditions: String(rawEvent.failureConditions ?? "").trim(),
          requiredFunctions: requirements,
          revealTerms: Array.isArray(rawEvent.revealTerms) ? rawEvent.revealTerms.map(String).map((value) => value.trim()).filter(Boolean) : [],
          transitionLocationRefs,
          observationLocationRefs,
        } satisfies StoryEvent;
        return project.packageTarget === "cortex" ? { ...withoutEventSchedule(next, true), cortexDesign: eventDesign(next) } : next;
      })
    : [];
  project.characterRelations = Array.isArray(source.characterRelations) ? source.characterRelations : [];
  project.factionRelations = Array.isArray(source.factionRelations) ? source.factionRelations : [];
  project.eventClocks = Array.isArray(source.eventClocks) ? source.eventClocks : [];
  project.foreshadowings = Array.isArray(source.foreshadowings) ? source.foreshadowings : [];
  project.imageTriggers = Array.isArray(source.imageTriggers) ? source.imageTriggers.filter(Boolean).map((item) => {
    const next = mergeObject(blankImageTrigger(), item);
    next.characterIds = Array.isArray((item as ImageTrigger).characterIds) ? (item as ImageTrigger).characterIds.filter((id) => typeof id === "string") : [];
    next.attachedImages = Array.isArray((item as ImageTrigger).attachedImages) ? (item as ImageTrigger).attachedImages.filter(Boolean) : [];
    next.routeIds = Array.isArray((item as ImageTrigger).routeIds) ? (item as ImageTrigger).routeIds.filter((id) => typeof id === "string") : [];
    next.chapterIds = Array.isArray((item as ImageTrigger).chapterIds) ? (item as ImageTrigger).chapterIds.filter((id) => typeof id === "string") : [];
    next.endingIds = Array.isArray((item as ImageTrigger).endingIds) ? (item as ImageTrigger).endingIds.filter((id) => typeof id === "string") : [];
    next.requiredFlags = Array.isArray((item as ImageTrigger).requiredFlags) ? (item as ImageTrigger).requiredFlags.filter((id) => typeof id === "string") : [];
    next.forbiddenFlags = Array.isArray((item as ImageTrigger).forbiddenFlags) ? (item as ImageTrigger).forbiddenFlags.filter((id) => typeof id === "string") : [];
    return next;
  }) : [];
  project.autonomySettings = mergeObject(base.autonomySettings, source.autonomySettings);
  project.autonomyActors = Array.isArray(source.autonomyActors) ? source.autonomyActors.filter(Boolean).map((item) => {
    const rawActor = item as AutonomyActor;
    return mergeObject(blankAutonomyActor(rawActor.entityType === "faction" ? "faction" : "character", rawActor.entityId ?? ""), rawActor);
  }) : [];
  project.relationshipMemorySettings = mergeObject(base.relationshipMemorySettings, source.relationshipMemorySettings);
  project.relationshipMemories = Array.isArray(source.relationshipMemories) ? source.relationshipMemories.filter(Boolean).map((item) => {
    const rawMemory = item as RelationshipMemory;
    const next = mergeObject(blankRelationshipMemory(), rawMemory);
    next.effects = mergeObject(blankRelationshipMemory().effects, rawMemory.effects);
    return next;
  }) : [];
  project.instantStory.enabled = project.runtimeMode === "instant_story";
  // 불변식은 Cortex 패키지 전용 계약이다. 레거시 패키지에서는 선언 자체가 존재하지 않는다.
  if (project.packageTarget !== "cortex") project.protagonistInvariants = [];
  if (project.runtimeMode === "instant_story") {
    project.factions = [];
    project.events = [];
    project.characterRelations = [];
    project.factionRelations = [];
    project.eventClocks = [];
    project.foreshadowings = [];
    project.imageTriggers = [];
    project.autonomyActors = [];
    project.relationshipMemories = [];
    project.autonomySettings.enabled = false;
    project.relationshipMemorySettings.enabled = false;
    project.package15 = makePackage15Design();
    project.aiWorldContext.enabled = false;
    project.aiWorldContext.liveEvaluation = false;
    project.aiWorldContext.referenceCharacterResearch.enabled = false;
    project.aiWorldContext.routeContexts = {};
    project.instantStory.deepPathTriggers = project.instantStory.deepPathTriggers.filter((trigger) => trigger === "identity_reveal" || trigger === "ending");
  }
  return retireLocationGraph(project);
}

export function makeProjectForRuntime(runtimeMode: Project["runtimeMode"], fresh = true): Project {
  const project = makeProject(fresh);
  project.runtimeMode = runtimeMode;
  project.instantStory.enabled = runtimeMode === "instant_story";
  project.playStyle = runtimeMode === "instant_story"
    ? "Instant Story 자유 역할극 · 키워드 활성화형 실시간 스트리밍"
    : "지능형 정사 전개 · 사건·인과·자율 세계 시뮬레이션";
  return project;
}

export function makeProjectForPackageTarget(packageTarget: Project["packageTarget"], runtimeMode: Project["runtimeMode"] = "intelligent_canon", fresh = true): Project {
  const project = makeProjectForRuntime(runtimeMode, fresh);
  project.packageTarget = packageTarget;
  project.protagonistInvariants = packageTarget === "cortex" ? defaultProtagonistInvariants() : [];
  return project;
}

/** New authoring sessions use Cortex. Legacy import normalization is unchanged. */
export function makeNewStudioProject(runtimeMode: Project["runtimeMode"] = "intelligent_canon"): Project {
  return makeProjectForPackageTarget("cortex", runtimeMode, true);
}

export type CortexConversionReport = {
  runtimeMode: Project["runtimeMode"];
  eventIdsRemapped: number;
  beatsCreated: number;
  beatsMerged: number;
  requirementsCreated: number;
  locationsCreated: number;
  unresolvedEventLocations: number;
  preservedImages: number;
};

export function convertLotusProjectToCortex(input: Project): { project: Project; report: CortexConversionReport } {
  const source = normalizeProject(input);
  const project = migrateCortexProject({ ...source, events: source.events.map((event) => withoutEventSchedule(event, true)) });
  if (!project.protagonistInvariants.length) project.protagonistInvariants = defaultProtagonistInvariants();
  return { project, report: {
    runtimeMode: source.runtimeMode, eventIdsRemapped: 0, beatsCreated: 0, beatsMerged: 0,
    requirementsCreated: source.events.filter((e) => e.required && eventDesign(e).closure.trim()).length,
    locationsCreated: 0, unresolvedEventLocations: 0,
    preservedImages: [source.player, ...source.npcs].reduce((sum, c) => sum + c.images.length, 0) + source.imageTriggers.reduce((sum, t) => sum + t.attachedImages.length, 0),
  } };
}

export function demoProject(): Project {
  const p = makeProject(true);
  p.title = "기성학원: 첫 번째 공명";
  p.author = "Relay Novel Studio 데모";
  p.world.overview = "인간의 뇌파에서 측정되는 ‘기’가 능력으로 발현되는 세계. 기 수치 5,000 이상인 청소년은 국가에 하나뿐인 초능력 학교 기성학원에서 능력과 윤리를 함께 배운다.";
  p.world.history = "뇌파 연구에서 기의 존재가 입증된 뒤 한 세대 만에 능력자 교육 체계가 확립되었다. 능력은 개인마다 한 계열로 발현되지만 성장 과정과 심리 상태에 따라 형태가 달라진다.";
  p.world.supernatural = "기는 신체와 정신을 매개로 고유 능력을 강화한다. 무한 사용은 불가능하며 과부하, 집중력 저하와 신체 손상이 대가로 발생한다.";
  p.world.fixedCanon = "능력은 대가 없이 무한히 사용할 수 없다. NPC는 플레이어와 무관하게 자신의 목표에 따라 움직인다. 플레이어 캐릭터의 행동과 감정은 사용자가 직접 결정한다.";
  p.aiWorldContext = {
    ...makeAiWorldContext(),
    enabled: true,
    premise: "현대 한국의 국가 관리형 초능력 기숙학교에서 벌어지는 장기 미스터리",
    referenceFramework: "한국형 학원물, 능력자 성장물, 폐쇄 공간 미스터리의 장르 문법",
    localContext: "한국의 학교 문화·기숙사 생활·교내 행정·학부모와 국가 기관의 영향이 실제 사회처럼 작동한다.",
    protectedCanon: "능력에는 반드시 대가가 있고, 기성학원 지하 공명 실험의 진실은 충분한 단서가 쌓이기 전까지 공개하지 않는다.",
  };
  p.player = { ...blankCharacter(true), id: "PLAYER_YJH", name: "윤지훈", age: "17", gender: "남성", role: "신입생", occupation: "기성학원 1학년", affiliation: "기성학원", appearance: "검은 머리와 짙은 눈. 단정한 교복 차림.", personality: "현실적이며 낯선 상황에서 우선 관찰한다.", skills: "원소조작: 주변의 물·불·바람·땅 중 하나를 제한적으로 다룬다. 원소 전환에는 시간이 필요하다.\n특이 케이스로 한가지의 능력을 더 다룰 수 있게 되는 잠재력이 보인다.", weaknesses: "원소를 즉시 전환할 수 없고 주변 환경에 존재하지 않는 원소를 만들어낼 수 없다.", visualAnchor: "검은 단정한 머리, 짙은 눈, 남색 기성학원 교복", isPlayer: true };
  p.npcs = [
    { ...blankCharacter(false), id: "NPC_LENA", name: "레나", role: "신입생 수석", age: "17", gender: "여성", affiliation: "기성학원", appearance: "긴 은빛 머리와 자색 눈동자, 차가운 인상.", personality: "무심하고 독립적이며 쉽게 타인을 신뢰하지 않는다.", speechStyle: "짧고 건조한 말투.", importance: "major", visualAnchor: "긴 은빛 머리, 자색 눈동자, 차가운 인상, 기성학원 교복", publicInfo: "압도적인 기 수치로 입학한 신입생 수석.", hiddenInfo: "자신의 능력 폭주와 관련된 사고를 감추고 있다." },
    { ...blankCharacter(false), id: "NPC_LILIA", name: "릴리아 발렌하르트", role: "기사 지망 신입생", age: "17", gender: "여성", affiliation: "기성학원", appearance: "붉은 머리와 금색 눈동자, 활기찬 표정.", personality: "직선적이고 친화력이 강하다.", speechStyle: "감탄사가 많고 밝은 말투.", importance: "major", visualAnchor: "붉은 머리, 금색 눈동자, 건강한 체형, 활기찬 표정, 기성학원 교복", publicInfo: "유명 기사 가문의 신입생." },
  ];
  p.factions = [{ id: "FAC_ACADEMY", name: "기성학원", leader: "교장", officialGoal: "능력자 교육과 사회적 책임 양성", hiddenGoal: "학원 지하의 공명 실험을 은폐한다.", resources: "교육시설, 교관, 연구동, 학생 기록", territory: "기성학원 전 구역", income: "국가 예산", militaryPower: "중간", intelligencePower: "높음", politicalPower: "높음", internalConflict: "교육파와 연구파의 갈등", allies: "정부 능력자 관리국", enemies: "미확인", playerRelation: "재학생", currentPlan: "신입생의 공명 반응을 비밀리에 관찰한다." }];
  p.characterRelations = [
    { id: "REL_LENA_TO_PLAYER", sourceId: "NPC_LENA", targetId: "PLAYER_YJH", relationType: "경계하는 동급생", trust: -8, favor: 0, fear: 0, respect: 8, suspicion: 12, hostility: 0, dependency: 0, publicSummary: "아직 서로를 관찰하는 사이", hiddenNotes: "레나는 윤지훈의 원소 파장이 과거 사고와 닮았다고 느낀다." },
    { id: "REL_LILIA_TO_PLAYER", sourceId: "NPC_LILIA", targetId: "PLAYER_YJH", relationType: "호기심 많은 동급생", trust: 5, favor: 12, fear: 0, respect: 4, suspicion: 0, hostility: 0, dependency: 0, publicSummary: "먼저 말을 건 활기찬 동급생", hiddenNotes: "" },
  ];
  p.autonomyActors = [
    { ...blankAutonomyActor("character", "NPC_LENA"), id: "AUTO_LENA", currentLocation: "A동 기숙사 2층", shortTermGoal: "부서진 205호 문에서 자신의 기 흔적을 지운다.", mediumTermGoal: "공명 사고와 윤지훈의 연관성을 확인한다.", longTermGoal: "과거 능력 폭주의 진실을 찾아 통제법을 얻는다.", goalPriority: 88, currentPlan: "사람이 없는 시간에 문 파편을 회수하고 연구동 기록에 접근한다.", nextAction: "야간 점호 전에 남은 파편의 위치를 확인한다.", actionCadence: "every_2_turns", knowledge: "자신의 과거 사고, 문에서 느껴진 낯익은 공명, 학원 기본 동선", misinformation: "연구부가 자신을 보호하려 한다고 믿는다.", resources: "높은 기 수치, 신입생 수석 권한, 제한적인 연구동 출입", constraints: "감정이 흔들리면 능력이 폭주할 수 있다. 공개적으로 움직이면 연구부의 관심이 증가한다.", riskTolerance: "moderate", cooperationRules: "증거를 강요하지 않고 비밀을 지켜주는 사람과 제한적으로 협력한다.", conflictRules: "과거 사고를 들추거나 통제권을 빼앗으려는 상대를 회피한 뒤 증거부터 제거한다.", successOutcome: "파편을 확보하고 연구부보다 먼저 공명 흔적을 분석한다.", partialOutcome: "파편 일부만 확보하지만 누군가 자신을 감시한다는 단서를 얻는다.", failureOutcome: "감시 카메라에 동선이 남고 비밀 연구부의 관심 시계가 전진한다." },
    { ...blankAutonomyActor("character", "NPC_LILIA"), id: "AUTO_LILIA", currentLocation: "A동 기숙사 복도", locationVisibility: "Public", shortTermGoal: "윤지훈과 레나를 식당으로 데려가 친구가 된다.", mediumTermGoal: "가문에 의존하지 않고 자신의 실력으로 기사반에 들어간다.", longTermGoal: "가문의 명예보다 옳은 선택을 하는 기사가 된다.", goalPriority: 72, currentPlan: "신입생 정보를 모으고 훈련 파트너를 찾는다.", nextAction: "두 사람에게 점심을 제안하고 반응을 살핀다.", actionCadence: "every_turn", knowledge: "기사 가문 인맥, 공개된 입학생 정보, 학원 규칙", resources: "가문 명성, 체력, 사교성", constraints: "거짓말에 서툴고 의심스러운 일을 그냥 지나치지 못한다.", riskTolerance: "high", cooperationRules: "곤란한 사람을 먼저 돕고 빚으로 계산하지 않는다.", conflictRules: "약자를 괴롭히는 행동을 보면 관계 손해를 감수하고 개입한다.", successOutcome: "세 사람이 자연스럽게 동행하며 첫 신뢰의 계기가 생긴다.", partialOutcome: "한 명과만 동행하지만 다른 한 명의 사정을 기억한다.", failureOutcome: "제안이 거절되어도 원망하지 않고 다음 기회를 찾는다." },
    { ...blankAutonomyActor("faction", "FAC_ACADEMY"), id: "AUTO_ACADEMY", currentLocation: "기성학원 전 구역", shortTermGoal: "205호 파손 사건의 공명 잔류물을 회수한다.", mediumTermGoal: "세 신입생의 동시 공명 가능성을 검증한다.", longTermGoal: "지하 공명 실험과 과거 사고를 외부에 노출하지 않는다.", goalPriority: 94, currentPlan: "시설 점검으로 위장해 파편과 감시 기록을 수거한다.", nextAction: "연구부 소속 교관 한 명을 A동에 배치한다.", actionCadence: "every_3_to_5_turns", knowledge: "학원 감시망, 연구 자료, 학생 기록과 지하 장치의 존재", misinformation: "동시 공명은 통제 가능한 실험 변수라고 과신한다.", resources: "교관, 감시망, 연구동, 행정 권한", constraints: "교육파의 반대와 외부 감사 때문에 노골적인 강제 조사는 어렵다.", riskTolerance: "high", cooperationRules: "교육파에는 안전 점검으로 설명하고 필요한 정보만 공유한다.", conflictRules: "증거 유출 조짐이 보이면 행정 조치와 비공식 감시를 단계적으로 강화한다.", successOutcome: "흔적을 조용히 회수하고 학생들이 눈치채지 못한 채 관찰을 시작한다.", partialOutcome: "흔적은 얻지만 학생 한 명이 연구부의 개입을 눈치챈다.", failureOutcome: "핵심 파편을 놓치고 내부 갈등과 비밀 연구부의 관심 시계가 함께 전진한다." },
  ];
  p.relationshipMemories = [
    { ...blankRelationshipMemory(p.characterRelations[0]), id: "MEM_LENA_RESONANCE", turnLabel: "프롤로그", type: "custom", title: "낯익은 공명 파장", summary: "윤지훈에게서 과거 사고와 닮은 원소 파장을 느꼈다.", cause: "205호 문이 파손된 직후 두 사람의 기가 짧게 반응했다.", visibility: "Hidden", importance: 78, permanence: "permanent", effects: { trust: -3, favor: 0, fear: 2, respect: 4, suspicion: 12, hostility: 0, dependency: 0 }, unresolved: true, resolutionConditions: "윤지훈이 공명에 관해 솔직한 정보를 제공하거나 과거 사고와 무관하다는 증거를 찾는다.", tags: "공명, 과거 사고, 첫인상" },
    { ...blankRelationshipMemory(p.characterRelations[1]), id: "MEM_LILIA_FIRST_MEETING", turnLabel: "프롤로그", type: "custom", title: "혼자 두지 않은 첫 만남", summary: "어색한 두 신입생에게 먼저 다가가 함께 점심을 제안했다.", cause: "부서진 문 앞에서 두 사람이 도움을 청하지 못하는 모습을 보았다.", visibility: "Public", importance: 42, permanence: "decaying", effects: { trust: 4, favor: 7, fear: 0, respect: 2, suspicion: 0, hostility: 0, dependency: 0 }, unresolved: false, resolutionConditions: "", tags: "첫 만남, 친절, 점심 약속" },
  ];
  p.events = [{ ...blankStoryEvent(1), id: "EVT_FIRST_RESONANCE", name: "첫 번째 공명", type: "Conditional", visibility: "Hidden", status: "Planned", priority: 90, timeWindow: "입학 첫 주", conditions: "윤지훈, 레나, 릴리아가 같은 공간에서 동시에 능력을 사용할 때", cancelConditions: "세 인물이 분리되거나 능력 사용을 중단할 때", participants: "윤지훈, 레나, 릴리아", effects: "학원 지하의 봉인된 장치가 반응한다.", onSuccess: "공명의 일부를 통제하고 흔적을 확보한다.", onFailure: "능력 폭주와 시설 손상이 발생한다.", followUp: "교관의 조사와 비밀 연구부의 접근", description: "서로 다른 기의 파장이 순간적으로 겹친다.", playerCanIntervene: true, required: true, completionSignals: "봉인된 장치가 반응|세 파장이 공명", recoveryAlternatives: "지하 장치의 지연 반응 | 다른 훈련실에서 발생한 동시 공명 | 연구부 장비의 자동 공진", endSceneAfterCompletion: true }];
  p.eventClocks = [{ id: "CLOCK_RESEARCH", name: "비밀 연구부의 관심", visibility: "Hidden", status: "Active", current: 1, maximum: 6, relatedEventId: "EVT_FIRST_RESONANCE", advanceRules: "이례적인 능력 사용, 금지 구역 접근, 공명 흔적 노출 시 1칸 전진", regressRules: "증거를 은폐하거나 의심을 다른 원인으로 돌리면 1칸 후퇴", triggerResult: "연구부가 플레이어를 강제 조사 대상으로 지정한다.", publicHint: "교관과 연구원들의 시선이 늘어난다.", hiddenNotes: "4칸부터 비공식 감시 시작" }];
  p.foreshadowings = [{ id: "FSH_DOOR", title: "A동 205호의 부서진 문", visibility: "Hidden", status: "Planted", earliestDate: "D+2", latestDate: "D+14", plantingScene: "입학 첫날 기숙사 문이 비정상적인 방식으로 파손된다.", reinforcementPlan: "문 재료에서 교내 시설과 다른 공명 잔류물이 검출된다.", payoffConditions: "지하 연구동 또는 과거 사고 기록을 조사한다.", payoffResult: "누군가 신입생의 능력 반응을 유도했다는 사실이 드러난다.", relatedEntities: "윤지훈, 레나, 기성학원 연구부", misdirection: "레나의 통제 실패처럼 보이게 한다.", notes: "근거 없이 범인을 확정하지 않는다." }];
  p.imageTriggers = [{ ...blankImageTrigger(), id: "IMGTRG_FIRST_RESONANCE", name: "첫 번째 공명 발현 컷", triggerType: "event_condition_met", sourceId: "EVT_FIRST_RESONANCE", characterIds: ["PLAYER_YJH", "NPC_LENA", "NPC_LILIA"], prompt: "기성학원 지하의 봉인 장치가 반응하는 순간. 윤지훈의 원소, 레나의 자색 기류, 릴리아의 붉은 기가 삼각형으로 공명하며 어두운 복도를 밝힌다. 인물들의 얼굴과 고유 외형은 기준 이미지를 그대로 유지한다.", shotType: "역동적인 로우 앵글 시네마틱 장면", outputPosition: "after_scene", priority: 95 }];
  p.opening.currentSituation = "입학식 직후 A동 기숙사 2층. 205호 문이 부서진 채 복도에 떨어져 있고, 신입생 수석 레나와 윤지훈 사이에 어색한 침묵이 흐른다.";
  p.opening.openingLocation = "기성학원 A동 기숙사 2층 복도";
  p.opening.openingCharacters = "윤지훈, 레나, 릴리아 발렌하르트";
  p.opening.openingEvent = "릴리아가 두 사람을 발견하고 함께 점심을 먹자며 다가온다.";
  p.opening.firstGoal = "식당으로 이동하며 학원의 분위기와 두 인물의 관계를 파악한다.";
  p.statusWindow.stats = [
    { id: uid("STAT"), icon: "❤", name: "체력", rank: "B", current: 92, max: 100, color: "green" },
    { id: uid("STAT"), icon: "◈", name: "집중력", rank: "C+", current: 74, max: 100, color: "blue" },
    { id: uid("STAT"), icon: "✦", name: "기 공명", rank: "F", current: 12, max: 100, color: "violet" },
  ];
  p.statusWindow.resources = [
    { id: "ki_reserve", icon: "spark", name: "기력", current: 100, unit: "점", visibility: "public", revealRule: "능력 사용과 회복이 장면에서 확인될 때만 증감" },
    { id: "resonance_crystals", icon: "gem", name: "공명 결정", current: 0, unit: "개", visibility: "conditional", revealRule: "공명 결정을 실제로 획득하거나 용도를 확인한 뒤 공개" },
    { id: "training_relics", icon: "sword", name: "훈련 장비", current: 0, unit: "개", visibility: "conditional", revealRule: "등록된 훈련 장비를 실제로 지급받은 뒤 공개" },
  ];
  p.statusWindow.abilitySummary = "주변 원소의 흐름을 느끼고 제한적으로 다룰 수 있다. 원소를 바꾸려면 짧은 집중 시간이 필요하다.";
  p.statusWindow.conditionSummary = "가벼운 피로가 있지만 행동에는 지장이 없다.";
  p.statusWindow.funds = { icon: "wallet", name: "자금", current: 35000, unit: "원" };
  p.statusWindow.relationshipDisplays = [
    { ...blankStatusRelationshipDisplay("character"), id: "HUD_REL_LENA", entityId: "NPC_LENA", label: "레나", visibility: "met_only", revealRule: "레나를 직접 만난 뒤 공개", sentence: "낯익은 공명을 느끼고 윤지훈을 경계하며 관찰한다.", statLabel: "신뢰", current: -8, minimum: -100, maximum: 100, symbol: "🟣", updateRule: "레나가 직접 관찰한 윤지훈의 말과 행동, 둘 사이의 공개된 상호작용만 반영" },
    { ...blankStatusRelationshipDisplay("character"), id: "HUD_REL_LILIA", entityId: "NPC_LILIA", label: "릴리아", visibility: "met_only", revealRule: "릴리아를 직접 만난 뒤 공개", sentence: "먼저 말을 건 활기찬 동급생으로 함께 행동할 계기를 찾는다.", statLabel: "호감", current: 12, minimum: -100, maximum: 100, showSymbol: false, symbol: "", updateRule: "릴리아와 직접 나눈 대화와 서로 확인 가능한 도움·갈등만 반영" },
    { ...blankStatusRelationshipDisplay("faction"), id: "HUD_REL_ACADEMY", entityId: "FAC_ACADEMY", label: "기성학원", visibility: "public", revealRule: "입학과 동시에 공개", sentence: "윤지훈을 신입생으로 등록하고 능력 반응을 평가 중이다.", showStat: false, statLabel: "평판", current: 0, minimum: -100, maximum: 100, symbol: "🏫", updateRule: "공개된 교칙 위반·성과·징계·공식 평가만 반영하고 숨은 연구부의 판단은 노출하지 않음" },
  ];
  return p;
}

export type ValidationIssue = { severity: "error" | "warning" | "info"; area: string; message: string };
export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...validateInstantStory(project));
  const required = (value: unknown, area: string, message: string) => { if (!String(value ?? "").trim()) issues.push({ severity: "error", area, message }); };
  required(project.title, "프로젝트", "시나리오 제목이 비어 있습니다.");
  required(project.genre, "프로젝트", "장르가 비어 있습니다.");
  required(project.startLocation, "프로젝트", "시작 지역이 비어 있습니다.");
  required(project.player.name, "캐릭터", "플레이어 이름이 비어 있습니다.");
  if (project.packageTarget === "cortex") {
    const invariantRefs = project.protagonistInvariants.map((item) => item.ref.trim()).filter(Boolean);
    project.protagonistInvariants.forEach((item, index) => {
      if (!item.label.trim()) issues.push({ severity: "error", area: "주인공 불변식", message: `${index + 1}번째 불변식의 이름이 비어 있습니다.` });
      if (!item.ref.trim()) issues.push({ severity: "error", area: "주인공 불변식", message: `${item.label || `${index + 1}번째 항목`}의 고정 ref가 발급되지 않았습니다.` });
      if (!(["HARD", "SOFT"] as const).includes(item.severity)) issues.push({ severity: "error", area: "주인공 불변식", message: `${item.label || `${index + 1}번째 항목`}의 심각도는 HARD 또는 SOFT여야 합니다.` });
    });
    if (new Set(invariantRefs).size !== invariantRefs.length) issues.push({ severity: "error", area: "주인공 불변식", message: "불변식 ref는 서로 중복될 수 없습니다." });
    if (project.protagonistInvariants.length > 5) issues.push({ severity: "warning", area: "주인공 불변식", message: "불변식이 5개를 넘으면 작가 계약이 길어져 본문 품질에 영향을 줄 수 있습니다. 작품 완주에 꼭 필요한 항목만 남기세요." });
    if (!project.protagonistInvariants.length) issues.push({ severity: "info", area: "주인공 불변식", message: "선언된 불변식이 없어 Cortex의 전개 보호 기능이 비활성화됩니다." });
    if (!project.protagonistInvariants.some((item) => item.ref === "invariant:survival" && item.severity === "HARD")) issues.push({ severity: "error", area: "주인공 불변식", message: "Cortex 패키지는 invariant:survival을 HARD로 선언해야 합니다." });
    if (project.runtimeMode === "intelligent_canon") {
      const lint = lintCortexPackage(project);
      issues.push(...lint.findings.map((finding) => ({
        severity: finding.level === "ERROR" ? "error" as const : finding.level === "WARN" ? "warning" as const : "info" as const,
        area: `Cortex 린터 · ${finding.code}${finding.where ? ` · ${finding.where}` : ""}`,
        message: finding.message,
      })));
    }
  }
  required(project.opening.currentSituation, "연출과 GM", "첫 장면의 현재 상황이 비어 있습니다.");
  required(project.opening.openingLocation, "연출과 GM", "첫 장면 장소가 비어 있습니다.");
  required(project.opening.openingEvent, "연출과 GM", "첫 장면 사건이 비어 있습니다.");
  if (!project.world.overview.trim()) issues.push({ severity: "warning", area: "세계관", message: "세계 개요가 비어 있습니다." });
  if (!project.world.fixedCanon.trim()) issues.push({ severity: "warning", area: "세계관", message: "절대 유지할 핵심 정사가 없습니다." });
  if (project.aiWorldContext.enabled) {
    if (!project.aiWorldContext.premise.trim()) issues.push({ severity: "warning", area: "AI 세계관 고려", message: "실시간 고려가 활성화되어 있지만 핵심 전제가 비어 있습니다." });
    if (!project.aiWorldContext.referenceFramework.trim()) issues.push({ severity: "warning", area: "AI 세계관 고려", message: "참고할 작품·장르·역사적 틀이 비어 있습니다." });
    if (!project.aiWorldContext.localContext.trim()) issues.push({ severity: "warning", area: "AI 세계관 고려", message: "현지화할 지역·시대·사회문화 맥락이 비어 있습니다." });
    if (!Object.values(project.aiWorldContext.evaluationMoments).some(Boolean)) issues.push({ severity: "error", area: "AI 세계관 고려", message: "API가 세계관 맥락을 다시 평가할 시점을 하나 이상 선택하세요." });
  }
  if (project.aiWorldContext.referenceCharacterResearch.enabled && !project.aiWorldContext.referenceCharacterResearch.characterNames.trim()) issues.push({ severity: "warning", area: "AI 인물 조사", message: "실시간으로 조사할 기존 작품 캐릭터 이름을 한 명 이상 입력하세요." });
  if (project.difficulty === "HARD" && !project.player.weaknesses.trim()) issues.push({ severity: "warning", area: "캐릭터", message: "HARD 난이도인데 플레이어 약점이 비어 있습니다." });
  [...project.npcs, project.player].filter((c) => ["protagonist", "major"].includes(c.importance) && c.imageOnFirstAppearance && !c.images.length)
    .forEach((c) => issues.push({ severity: "warning", area: "캐릭터 이미지", message: `${c.name}의 첫 등장 이미지가 활성화되어 있지만 기준 이미지가 없습니다. AI 애니풍 이미지 생성 규칙이 적용됩니다.` }));
  const playableEvents = project.events.filter((event) => event.kind !== "constraint");
  const playableIds = new Set(playableEvents.map((event) => event.id));
  const eventIds = project.events.map((event) => event.id.trim()).filter(Boolean);
  if (eventIds.length !== project.events.length) issues.push({ severity: "error", area: "사건", message: "ID가 비어 있는 사건 또는 장면 제약이 있습니다." });
  if (new Set(eventIds).size !== eventIds.length) issues.push({ severity: "error", area: "사건", message: "사건·장면 제약 ID는 서로 중복될 수 없습니다." });
  playableEvents.filter((event) => event.type === "Conditional" && !event.conditions.trim()).forEach((event) => issues.push({ severity: "warning", area: "사건", message: `${event.name}의 발생 조건이 비어 있습니다.` }));
  project.events.forEach((event) => {
    if (event.kind === "constraint") {
      if (!event.rules.some((rule) => rule.trim())) issues.push({ severity: "error", area: "장면 제약", message: `${event.name}에 적용할 규칙을 한 개 이상 작성하세요.` });
      if (!event.appliesTo.length) issues.push({ severity: "warning", area: "장면 제약", message: `${event.name}은 적용 대상이 없어 모든 사건에 적용됩니다.` });
      event.appliesTo.filter((id) => !playableIds.has(id)).forEach((id) => issues.push({ severity: "error", area: "장면 제약", message: `${event.name}의 적용 대상 '${id}'를 일반·복합 사건에서 찾을 수 없습니다.` }));
      return;
    }
    if (project.packageTarget !== "cortex" && (!Number.isFinite(event.priority) || event.priority < 0 || event.priority > 100)) issues.push({ severity: "error", area: "사건", message: `${event.name}의 우선순위는 0~100이어야 합니다. 필수 여부는 별도 스위치로 지정하세요.` });
    if (event.kind === "compound") {
      if (event.beats.length < 2) issues.push({ severity: "error", area: "복합 사건", message: `${event.name}은 교차 진행할 비트가 2개 이상 필요합니다.` });
      const beatIds = event.beats.map((beat) => beat.id.trim()).filter(Boolean);
      if (beatIds.length !== event.beats.length) issues.push({ severity: "error", area: "복합 사건", message: `${event.name}에 ID가 비어 있는 비트가 있습니다.` });
      if (new Set(beatIds).size !== beatIds.length) issues.push({ severity: "error", area: "복합 사건", message: `${event.name}의 비트 ID가 중복되었습니다.` });
      event.beats.forEach((beat, index) => {
        if (!beat.content.trim()) issues.push({ severity: "error", area: "복합 사건", message: `${event.name}의 ${index + 1}번째 비트 내용이 비어 있습니다.` });
      });
    }
    if (!event.required) return;
    if (!Number.isFinite(event.sequence) || event.sequence < 1) issues.push({ severity: "error", area: "필수 사건", message: `${event.name}의 필수 전개 순서는 1 이상이어야 합니다.` });
    if (project.packageTarget === "cortex") {
      if (!eventDesign(event).closure.trim()) issues.push({ severity: "warning", area: "필수 사건", message: `${event.name}에 종결조건이 없습니다.` });
    } else if (!event.completionSignals.trim() && !event.effects.trim() && !event.description.trim()) issues.push({ severity: "error", area: "필수 사건", message: `${event.name}을 완료로 판정할 문구나 핵심 효과가 필요합니다.` });
    if (event.requiredDialogue.trim() && !event.requiredSpeakerId.trim()) issues.push({ severity: "warning", area: "필수 사건", message: `${event.name}의 필수 대사 화자를 지정하면 정확한 캐릭터 이미지와 함께 출력할 수 있습니다.` });
    if (event.requiredSpeakerId && !project.npcs.some((character) => character.id === event.requiredSpeakerId)) issues.push({ severity: "error", area: "필수 사건", message: `${event.name}의 필수 대사 화자 ID를 NPC 목록에서 찾을 수 없습니다.` });
    if (project.packageTarget !== "cortex" && !event.recoveryAlternatives.trim()) issues.push({ severity: "warning", area: "필수 사건", message: `${event.name}을 플레이어가 피했을 때 사용할 우회 경로가 비어 있습니다.` });
  });
  const requiredSequences = playableEvents.filter((event) => event.required).map((event) => event.sequence);
  if (new Set(requiredSequences).size !== requiredSequences.length) issues.push({ severity: "error", area: "필수 사건", message: "필수 전개 순서는 겹칠 수 없습니다. 사건마다 고유한 순서를 지정하세요." });
  const sortedSequences = [...new Set(requiredSequences)].sort((a, b) => a - b);
  if (sortedSequences.some((sequence, index) => sequence !== index + 1)) issues.push({ severity: "warning", area: "필수 사건", message: "필수 전개 순서에 빈 번호가 있습니다. 1부터 연속된 순서를 권장합니다." });
  project.eventClocks.forEach((clock) => {
    if (clock.maximum < 1 || clock.current < 0 || clock.current > clock.maximum) issues.push({ severity: "error", area: "사건 시계", message: `${clock.name}의 현재/최대 칸 범위를 확인하세요.` });
  });
  if (project.statusWindow.enabled) {
    if (!project.statusWindow.stats.length) issues.push({ severity: "warning", area: "상태창 HUD", message: "상태창이 활성화되어 있지만 추적할 능력치가 없습니다." });
    if (!project.statusWindow.abilitySummary.trim()) issues.push({ severity: "warning", area: "상태창 HUD", message: "Ability의 쉬운 공개 설명이 비어 있습니다." });
    if (project.statusWindow.abilitySummary.length > 180) issues.push({ severity: "warning", area: "상태창 HUD", message: "Ability 설명이 너무 깁니다. 한두 줄(180자 이하)로 줄여 주세요." });
    if (!project.statusWindow.conditionSummary.trim()) issues.push({ severity: "warning", area: "상태창 HUD", message: "Condition의 현재 상태 설명이 비어 있습니다." });
    if (project.statusWindow.conditionSummary.length > 180) issues.push({ severity: "warning", area: "상태창 HUD", message: "Condition 설명이 너무 깁니다. 한두 줄(180자 이하)로 줄여 주세요." });
    if (project.statusWindow.resources.length < 1 || project.statusWindow.resources.length > 3) issues.push({ severity: "error", area: "상태창 HUD", message: "Resources는 작품별 핵심 자원 1~3개로 구성해야 합니다." });
    project.statusWindow.resources.forEach((resource) => {
      if (!resource.name.trim()) issues.push({ severity: "error", area: "상태창 HUD", message: "이름이 비어 있는 Resources 항목이 있습니다." });
      if (!resource.revealRule.trim()) issues.push({ severity: "warning", area: "상태창 HUD", message: `${resource.name || "자원"}의 공개 조건이 비어 있습니다.` });
    });
    if (!Number.isFinite(project.statusWindow.funds.current) || project.statusWindow.funds.current < 0) issues.push({ severity: "error", area: "상태창 HUD", message: "현재 자금은 0 이상의 숫자여야 합니다." });
    if (!project.statusWindow.updateRules.trim()) issues.push({ severity: "warning", area: "상태창 HUD", message: "매 턴 상태 갱신 규칙이 비어 있습니다." });
    project.statusWindow.stats.forEach((stat) => {
      if (!stat.name.trim()) issues.push({ severity: "error", area: "상태창 HUD", message: "이름이 비어 있는 능력치가 있습니다." });
      if (!Number.isFinite(stat.max) || stat.max < 1 || !Number.isFinite(stat.current) || stat.current < 0 || stat.current > stat.max) issues.push({ severity: "error", area: "상태창 HUD", message: `${stat.name || "능력치"}의 현재/최대 값 범위를 확인하세요.` });
    });
    if (project.runtimeMode === "instant_story" && project.statusWindow.sections.relationships && !project.statusWindow.relationshipDisplays.length) issues.push({ severity: "warning", area: "관계 현황 HUD", message: "Instant Story 상태창에 표시할 인물·세력 관계가 없습니다." });
    project.statusWindow.relationshipDisplays.forEach((relation) => {
      if (!relation.label.trim()) issues.push({ severity: "error", area: "관계 현황 HUD", message: "이름이 비어 있는 관계 표시 항목이 있습니다." });
      if (!relation.showSentence && !relation.showStat && !relation.showSymbol) issues.push({ severity: "error", area: "관계 현황 HUD", message: `${relation.label || relation.id}은 문장·수치·기호 중 하나 이상을 표시해야 합니다.` });
      if (relation.showSentence && !relation.sentence.trim()) issues.push({ severity: "warning", area: "관계 현황 HUD", message: `${relation.label || relation.id}의 공개 관계 문장이 비어 있습니다.` });
      if (relation.showSymbol && !relation.symbol.trim()) issues.push({ severity: "warning", area: "관계 현황 HUD", message: `${relation.label || relation.id}의 이모지·기호가 비어 있습니다.` });
      if (relation.showStat && (!Number.isFinite(relation.minimum) || !Number.isFinite(relation.maximum) || relation.maximum <= relation.minimum || !Number.isFinite(relation.current) || relation.current < relation.minimum || relation.current > relation.maximum)) issues.push({ severity: "error", area: "관계 현황 HUD", message: `${relation.label || relation.id}의 관계 수치 범위를 확인하세요.` });
      if (relation.visibility === "conditional" && !relation.revealRule.trim()) issues.push({ severity: "warning", area: "관계 현황 HUD", message: `${relation.label || relation.id}의 조건부 공개 규칙이 비어 있습니다.` });
    });
  }
  if (project.autonomySettings.enabled) {
    if (!Number.isFinite(project.autonomySettings.maxActionsPerTurn) || project.autonomySettings.maxActionsPerTurn < 1 || project.autonomySettings.maxActionsPerTurn > 10) issues.push({ severity: "error", area: "자율 행동 엔진", message: "턴당 최대 자율 행동 수는 1~10이어야 합니다." });
    if (!Number.isFinite(project.autonomySettings.factionTickTurns) || project.autonomySettings.factionTickTurns < 1 || project.autonomySettings.factionTickTurns > 20) issues.push({ severity: "error", area: "자율 행동 엔진", message: "세력 기본 주기는 1~20턴이어야 합니다." });
    const seenEntities = new Set<string>();
    project.autonomyActors.filter((actor) => actor.enabled).forEach((actor) => {
      const key = `${actor.entityType}:${actor.entityId}`;
      if (seenEntities.has(key)) issues.push({ severity: "error", area: "자율 행동 엔진", message: `같은 배우(${actor.entityId})의 자율 프로필이 중복되었습니다.` });
      seenEntities.add(key);
      const exists = actor.entityType === "character" ? project.npcs.some((character) => character.id === actor.entityId) : project.factions.some((faction) => faction.id === actor.entityId);
      if (!exists) issues.push({ severity: "error", area: "자율 행동 엔진", message: `자율 배우 '${actor.entityId}'를 현재 NPC 또는 세력에서 찾을 수 없습니다.` });
      if (!actor.currentLocation.trim()) issues.push({ severity: "warning", area: "자율 행동 엔진", message: `${actor.entityId}의 현재 위치가 비어 있어 이동 제약을 판정할 수 없습니다.` });
      if (!actor.shortTermGoal.trim() || !actor.currentPlan.trim()) issues.push({ severity: "warning", area: "자율 행동 엔진", message: `${actor.entityId}의 단기 목표 또는 현재 계획이 비어 있습니다.` });
      if (actor.goalPriority < 0 || actor.goalPriority > 100) issues.push({ severity: "error", area: "자율 행동 엔진", message: `${actor.entityId}의 목표 우선도는 0~100이어야 합니다.` });
    });
    if (!project.autonomyActors.length && (project.npcs.length || project.factions.length)) issues.push({ severity: "warning", area: "자율 행동 엔진", message: "NPC와 세력은 있지만 자율 행동 프로필이 없습니다." });
  }
  if (project.relationshipMemorySettings.enabled) {
    const scoreKeys: (keyof RelationshipMemoryEffect)[] = ["trust", "favor", "fear", "respect", "suspicion", "hostility", "dependency"];
    project.relationshipMemories.forEach((memory) => {
      const relation = project.characterRelations.find((item) => item.id === memory.relationId);
      if (!relation) issues.push({ severity: "error", area: "관계 이유 기억", message: `${memory.title || memory.id}에 연결된 방향성 관계를 찾을 수 없습니다.` });
      else if (relation.sourceId !== memory.sourceId || relation.targetId !== memory.targetId) issues.push({ severity: "error", area: "관계 이유 기억", message: `${memory.title || memory.id}의 인물 방향이 연결 관계와 일치하지 않습니다.` });
      if (!memory.title.trim() || !memory.cause.trim()) issues.push({ severity: "warning", area: "관계 이유 기억", message: "제목 또는 원인이 비어 있는 관계 기억이 있습니다." });
      if (memory.eventId && !project.events.some((event) => event.id === memory.eventId)) issues.push({ severity: "error", area: "관계 이유 기억", message: `${memory.title || memory.id}에 연결된 원인 사건을 찾을 수 없습니다.` });
      if (memory.importance < 0 || memory.importance > 100) issues.push({ severity: "error", area: "관계 이유 기억", message: `${memory.title || memory.id}의 중요도는 0~100이어야 합니다.` });
      scoreKeys.forEach((key) => { if (!Number.isFinite(memory.effects[key]) || memory.effects[key] < -100 || memory.effects[key] > 100) issues.push({ severity: "error", area: "관계 이유 기억", message: `${memory.title || memory.id}의 ${key} 효과는 -100~100이어야 합니다.` }); });
    });
    project.characterRelations.forEach((relation) => {
      const activeCount = project.relationshipMemories.filter((memory) => memory.relationId === relation.id && memory.active).length;
      if (activeCount > project.relationshipMemorySettings.maxActiveMemoriesPerRelation) issues.push({ severity: "warning", area: "관계 이유 기억", message: `${relation.id}의 활성 기억 ${activeCount}개가 설정 상한을 넘었습니다. 중요도가 낮은 기억을 비활성화하세요.` });
    });
    if (project.characterRelations.length && !project.relationshipMemories.length) issues.push({ severity: "warning", area: "관계 이유 기억", message: "관계는 있지만 그 이유를 설명하는 기억이 아직 없습니다." });
  }
  project.imageTriggers.filter((trigger) => trigger.enabled).forEach((trigger) => {
    if (!trigger.name.trim()) issues.push({ severity: "error", area: "이미지 트리거", message: "이름이 비어 있는 이미지 트리거가 있습니다." });
    if (!["show_package_image", "show_trigger_image"].includes(trigger.mode) && !trigger.prompt.trim()) issues.push({ severity: "warning", area: "이미지 트리거", message: `${trigger.name}의 이미지 프롬프트가 비어 있습니다.` });
    if (["event_start", "event_condition_met", "event_success", "event_failure"].includes(trigger.triggerType) && !project.events.some((event) => event.id === trigger.sourceId)) issues.push({ severity: "error", area: "이미지 트리거", message: `${trigger.name}에 연결된 사건을 찾을 수 없습니다.` });
    if (["clock_value", "clock_completed"].includes(trigger.triggerType) && !project.eventClocks.some((clock) => clock.id === trigger.sourceId)) issues.push({ severity: "error", area: "이미지 트리거", message: `${trigger.name}에 연결된 사건 시계를 찾을 수 없습니다.` });
    if (trigger.triggerType === "foreshadow_revealed" && !project.foreshadowings.some((item) => item.id === trigger.sourceId)) issues.push({ severity: "error", area: "이미지 트리거", message: `${trigger.name}에 연결된 복선을 찾을 수 없습니다.` });
    if (trigger.triggerType === "story_progress" && !trigger.storyProgress.trim()) issues.push({ severity: "warning", area: "이미지 트리거", message: `${trigger.name}의 스토리 진행 조건이 비어 있습니다.` });
    if (trigger.triggerType === "custom_condition" && !trigger.customCondition.trim()) issues.push({ severity: "warning", area: "이미지 트리거", message: `${trigger.name}의 사용자 지정 조건이 비어 있습니다.` });
    if (trigger.mode === "show_package_image" && !trigger.characterIds.length) issues.push({ severity: "warning", area: "이미지 트리거", message: `${trigger.name}은 패키지 이미지를 표시하지만 선택한 캐릭터가 없습니다.` });
    if (trigger.mode === "show_package_image" && trigger.characterIds.some((id) => ![project.player, ...project.npcs].find((character) => character.id === id)?.images.length)) issues.push({ severity: "warning", area: "이미지 트리거", message: `${trigger.name}이 참조하는 캐릭터 중 기준 이미지가 없는 인물이 있습니다.` });
    if (trigger.mode === "show_trigger_image" && !trigger.attachedImages.length) issues.push({ severity: "warning", area: "이미지 트리거", message: `${trigger.name}은 전용 이미지 표시 모드이지만 불러온 이미지가 없습니다.` });
    if (trigger.triggerType === "clock_value") {
      const clock = project.eventClocks.find((item) => item.id === trigger.sourceId);
      if (clock && (trigger.threshold < 0 || trigger.threshold > clock.maximum)) issues.push({ severity: "error", area: "이미지 트리거", message: `${trigger.name}의 시계 실행 값이 0~${clock.maximum} 범위를 벗어났습니다.` });
    }
    trigger.characterIds.filter((id) => ![project.player, ...project.npcs].some((character) => character.id === id)).forEach((id) => issues.push({ severity: "error", area: "이미지 트리거", message: `${trigger.name}에서 인물 ID '${id}'를 찾을 수 없습니다.` }));
  });
  project.events.forEach((event) => {
    const alternateIds = event.alternateBeats.map((beat) => beat.id.trim()).filter(Boolean);
    if (alternateIds.length !== event.alternateBeats.length || new Set(alternateIds).size !== alternateIds.length) issues.push({ severity: "error", area: "서사 런타임 확장", message: `${event.name}의 alternateBeats ID가 비어 있거나 중복되었습니다.` });
    const markerIds = event.sceneMarkers.map((marker) => marker.id.trim()).filter(Boolean);
    if (markerIds.length !== event.sceneMarkers.length || new Set(markerIds).size !== markerIds.length) issues.push({ severity: "error", area: "서사 런타임 확장", message: `${event.name}의 sceneMarkers ID가 비어 있거나 중복되었습니다.` });
  });
  if (project.package15.enabled) {
    const p15 = project.package15;
    const unique = (ids: string[], label: string) => {
      if (ids.some((id) => !id.trim())) issues.push({ severity: "error", area: "Package 1.5", message: `${label}에 빈 ID가 있습니다.` });
      if (new Set(ids).size !== ids.length) issues.push({ severity: "error", area: "Package 1.5", message: `${label} ID가 중복되었습니다.` });
    };
    const routeIds = p15.routes.map((route) => route.id);
    const chapterIds = p15.chapters.map((chapter) => chapter.id);
    const endingIds = p15.endings.map((ending) => ending.id);
    const policyIds = p15.revealPolicies.map((policy) => policy.id);
    const eventIdSet = new Set(project.events.map((event) => event.id));
    unique(routeIds, "루트"); unique(chapterIds, "챕터"); unique(endingIds, "엔딩"); unique(policyIds, "공개 정책");
    if (!p15.requiredFeatures.length) issues.push({ severity: "error", area: "Package 1.5", message: "Nexus 기능 협상을 위한 requiredFeatures를 하나 이상 지정하세요." });
    if (p15.branchEnding.enabled && project.packageTarget !== "cortex") issues.push({ severity: "error", area: "Package 1.5 분기", message: "새 분기·엔딩 수렴 계약은 Cortex 전용입니다. Lotus에서는 이 기능을 끄세요." });
    if (["multi_route", "multi_route_time_loop"].includes(p15.storyMode) && !p15.requiredFeatures.includes("multi_route_v1")) issues.push({ severity: "error", area: "Package 1.5", message: "멀티루트 작품은 multi_route_v1을 필수 기능으로 지정해야 합니다." });
    if (["time_loop", "multi_route_time_loop"].includes(p15.storyMode) && (!p15.loopPolicy.enabled || !p15.requiredFeatures.includes("time_loop_v1"))) issues.push({ severity: "error", area: "Package 1.5", message: "시간 루프 작품은 loopPolicy와 time_loop_v1 필수 기능을 함께 활성화해야 합니다." });
    p15.routes.forEach((route) => {
      if (!route.name.trim()) issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.id}의 이름이 비어 있습니다.` });
      if (route.entryEventId && !eventIdSet.has(route.entryEventId)) issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.name}의 진입 사건 '${route.entryEventId}'을 찾을 수 없습니다.` });
      if (route.lockEventId && !eventIdSet.has(route.lockEventId)) issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.name}의 확정 사건 '${route.lockEventId}'을 찾을 수 없습니다.` });
      const entryEvent = project.events.find((event) => event.id === route.entryEventId);
      if (entryEvent && entryEvent.multiroute?.routeEntryFor !== route.id) issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.name}의 진입 사건이 routeEntryFor로 같은 루트를 역참조해야 합니다.` });
      const lockEvent = project.events.find((event) => event.id === route.lockEventId);
      if (lockEvent && (lockEvent.multiroute?.routeId !== route.id || lockEvent.multiroute?.routeLockOnComplete !== true)) issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.name}의 확정 사건은 같은 routeId와 routeLockOnComplete=true가 필요합니다.` });
      route.chapterIds.filter((id) => !chapterIds.includes(id)).forEach((id) => issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.name}의 chapterId '${id}'를 찾을 수 없습니다.` }));
      route.endingIds.filter((id) => !endingIds.includes(id)).forEach((id) => issues.push({ severity: "error", area: "Package 1.5 루트", message: `${route.name}의 endingId '${id}'를 찾을 수 없습니다.` }));
      route.revealPolicyIds.filter((id) => !policyIds.includes(id)).forEach((id) => issues.push({ severity: "error", area: "Package 1.5 공개", message: `${route.name}의 revealPolicyId '${id}'를 찾을 수 없습니다.` }));
    });
    p15.chapters.forEach((chapter) => {
      if (chapter.scope === "route" && (!chapter.routeId || !routeIds.includes(chapter.routeId))) issues.push({ severity: "error", area: "Package 1.5 챕터", message: `${chapter.name}의 routeId가 유효하지 않습니다.` });
      chapter.eventIds.filter((id) => !eventIdSet.has(id)).forEach((id) => issues.push({ severity: "error", area: "Package 1.5 챕터", message: `${chapter.name}의 eventId '${id}'를 찾을 수 없습니다.` }));
    });
    p15.endings.forEach((ending) => {
      if (!routeIds.includes(ending.routeId)) issues.push({ severity: "error", area: "Package 1.5 엔딩", message: `${ending.name}의 routeId '${ending.routeId}'를 찾을 수 없습니다.` });
      ending.condition.completedEventIds?.filter((id) => !eventIdSet.has(id)).forEach((id) => issues.push({ severity: "error", area: "Package 1.5 엔딩", message: `${ending.name}의 완료 사건 '${id}'를 찾을 수 없습니다.` }));
    });
    if (p15.endings.some((ending) => ending.effects.some((effect) => effect.kind === "unlock_route")) && !p15.requiredFeatures.includes("ending_meta_progress_v1")) issues.push({ severity: "error", area: "Package 1.5 엔딩", message: "엔딩이 후속 루트를 해금하므로 ending_meta_progress_v1을 필수 기능으로 지정해야 합니다." });
    const revealFactIds = new Set(p15.revealFacts.map((fact) => fact.id));
    p15.revealPolicies.forEach((policy) => policy.rules.forEach((rule) => {
      if (!revealFactIds.has(rule.factId)) issues.push({ severity: "error", area: "Package 1.5 공개", message: `${policy.id}가 참조하는 factId '${rule.factId}'를 찾을 수 없습니다.` });
      if (!rule.beforeMode || !rule.afterMode) issues.push({ severity: "error", area: "Package 1.5 공개", message: `${policy.id}/${rule.factId}에는 beforeMode와 afterMode가 모두 필요합니다.` });
    }));
    project.events.forEach((event) => {
      if (event.multiroute?.routeId && !routeIds.includes(event.multiroute.routeId)) issues.push({ severity: "error", area: "Package 1.5 사건", message: `${event.name}의 routeId를 찾을 수 없습니다.` });
      if (event.multiroute?.chapterId && !chapterIds.includes(event.multiroute.chapterId)) issues.push({ severity: "error", area: "Package 1.5 사건", message: `${event.name}의 chapterId를 찾을 수 없습니다.` });
      if (event.multiroute?.routeEntryFor) {
        const route = p15.routes.find((item) => item.id === event.multiroute?.routeEntryFor);
        if (!route || route.entryEventId !== event.id) issues.push({ severity: "error", area: "Package 1.5 사건", message: `${event.name}의 routeEntryFor가 route_graph의 entryEventId와 양방향 일치하지 않습니다.` });
      }
      if (event.multiroute?.routeLockOnComplete) {
        const route = p15.routes.find((item) => item.id === event.multiroute?.routeId);
        if (!route || route.lockEventId !== event.id) issues.push({ severity: "error", area: "Package 1.5 사건", message: `${event.name}의 루트 확정 참조가 route_graph의 lockEventId와 양방향 일치하지 않습니다.` });
      }
    });
  }
  if (!issues.length) issues.push({ severity: "info", area: "검증", message: "치명적인 오류나 경고가 없습니다. ScenarioPack을 내보낼 수 있습니다." });
  return issues;
}
