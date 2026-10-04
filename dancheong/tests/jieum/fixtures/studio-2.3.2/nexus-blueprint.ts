import type { Character, Faction, Project, StoryEvent } from "./studio-model";
import { makeNewStudioProject, normalizeProject } from "./studio-model";
import { CORTEX_PACKAGE_FORMAT, CORTEX_TARGET_VERSION } from "./cortex-target";

type NexusBlueprint = {
  format?: string;
  runtimeMode?: "intelligent_canon" | "instant_story";
  sourcePrompt?: string;
  target?: { packageTarget?: string; format?: string; targetEngine?: string; minimumTargetVersion?: string; eventDesignSchema?: string };
  project?: Omit<Partial<Project>, "player" | "npcs" | "factions" | "events" | "instantStory" | "statusWindow"> & {
    statusWindow?: Partial<Project["statusWindow"]> & {
      relationshipDisplay?: { entries?: Array<{
        id: string; entityType: "character" | "faction"; entityId: string; label: string;
        order?: number; visibility: "public" | "met_only" | "conditional"; revealRule: string;
        displayParts: string[]; sentence: string; symbol: string; updateRule: string;
        stat?: { label: string; current: number; minimum: number; maximum: number };
      }> };
    };
    player?: Partial<Character>;
    npcs?: Array<Partial<Character>>;
    factions?: Array<Partial<Faction>>;
    events?: Array<Omit<Partial<StoryEvent>, "beats"> & { beats?: Array<{ title?: string; goal?: string; requiredSignals?: string; transition?: string }> }>;
    instantStory?: {
      corePrompt?: string;
      startProfiles?: Array<{ title?: string; situation?: string; location?: string; immediateHook?: string }>;
      exampleScenes?: string[];
      keywordNotes?: string[];
    };
  };
};

export function projectFromNexusBlueprint(raw: unknown): Project {
  const blueprint = raw && typeof raw === "object" ? raw as NexusBlueprint : {};
  if (blueprint.format !== "RELAY_NEXUS_STUDIO_BLUEPRINT_V1" || !blueprint.project) {
    throw new Error("Nexus Studio JSON 형식이 올바르지 않습니다.");
  }
  if (blueprint.target && (
    blueprint.target.packageTarget !== "cortex" ||
    blueprint.target.format !== CORTEX_PACKAGE_FORMAT ||
    blueprint.target.targetEngine !== "dancheong-cortex" ||
    blueprint.target.minimumTargetVersion !== CORTEX_TARGET_VERSION ||
    blueprint.target.eventDesignSchema !== "STUDIO_EVENT_DESIGN_V2"
  )) throw new Error("이 Studio에서 지원하지 않는 Cortex 청사진입니다. 메인화면을 새로고침해 다시 생성해 주세요.");
  const runtimeMode = blueprint.runtimeMode === "instant_story" ? "instant_story" : "intelligent_canon";
  const source = blueprint.project;
  const base = makeNewStudioProject(runtimeMode);
  const player = { ...base.player, ...(source.player ?? {}), id: source.player?.id?.trim() || "PLAYER", importance: "protagonist" as const, isPlayer: true };
  const npcs = (source.npcs ?? []).map((character, index) => ({
    ...character,
    id: character.id?.trim() || `NPC_${String(index + 1).padStart(2, "0")}`,
    isPlayer: false,
    imageOnFirstAppearance: true,
    visualLock: true,
  }));
  const factions = (source.factions ?? []).map((faction, index) => ({
    ...faction,
    id: faction.id?.trim() || `FACTION_${String(index + 1).padStart(2, "0")}`,
    name: faction.name ?? "새 세력", leader: faction.leader ?? "", officialGoal: faction.officialGoal ?? "", hiddenGoal: faction.hiddenGoal ?? "", resources: faction.resources ?? "", territory: faction.territory ?? "",
    income: faction.income ?? "", militaryPower: faction.militaryPower ?? "", intelligencePower: faction.intelligencePower ?? "", politicalPower: faction.politicalPower ?? "", internalConflict: faction.internalConflict ?? "",
    allies: faction.allies ?? "", enemies: faction.enemies ?? "", playerRelation: faction.playerRelation ?? "", currentPlan: faction.currentPlan ?? "",
  }));
  const events = runtimeMode === "instant_story" ? [] : (source.events ?? []).map((event, index) => ({
    ...event,
    id: event.id?.trim() || `EVENT_${String(index + 1).padStart(2, "0")}`,
    kind: "event" as const,
    type: "Conditional" as const,
    visibility: "Hidden" as const,
    status: "Planned" as const,
    required: event.required ?? true,
    sequence: index + 1,
    playerCanIntervene: true,
    preservePlayerChoice: true,
    endSceneAfterCompletion: true,
    beats: (event.beats ?? []).map((beat, beatIndex) => ({
      id: `${event.id?.trim() || `EVENT_${String(index + 1).padStart(2, "0")}`}_BEAT_${String(beatIndex + 1).padStart(2, "0")}`,
      viewpoint: beat.title ?? "",
      content: [beat.goal, beat.requiredSignals && `관측 신호: ${beat.requiredSignals}`, beat.transition && `다음 전환: ${beat.transition}`].filter(Boolean).join("\n"),
    })),
  }));
  for (const rows of [[player, ...npcs], factions, events]) {
    const ids = rows.map((row) => row.id);
    if (new Set(ids).size !== ids.length) throw new Error("Studio 청사진에 중복된 ID가 있습니다.");
  }
  const eventIds = new Set(events.map((event) => event.id));
  if (events.some((event) => event.nextEventId && !eventIds.has(event.nextEventId))) throw new Error("후속 사건 ID가 실제 사건을 가리키지 않습니다.");
  const characterIds = new Set([player, ...npcs].map((character) => character.id));
  const factionIds = new Set(factions.map((faction) => faction.id));
  for (const entry of source.statusWindow?.relationshipDisplay?.entries ?? []) {
    if (!(entry.entityType === "faction" ? factionIds : characterIds).has(entry.entityId)) throw new Error("관계 HUD의 대상 ID가 실제 인물·세력을 가리키지 않습니다.");
  }
  const relationshipDisplays = source.statusWindow?.relationshipDisplay?.entries
    ?.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((entry) => ({
      id: entry.id, entityType: entry.entityType, entityId: entry.entityId,
      label: entry.label, visibility: entry.visibility, revealRule: entry.revealRule,
      showSentence: entry.displayParts.includes("sentence"), sentence: entry.sentence,
      showStat: entry.displayParts.includes("stat"), statLabel: entry.stat?.label ?? "",
      current: entry.stat?.current ?? 0, minimum: entry.stat?.minimum ?? -100, maximum: entry.stat?.maximum ?? 100,
      showSymbol: entry.displayParts.includes("symbol"), symbol: entry.symbol, updateRule: entry.updateRule,
    })) ?? source.statusWindow?.relationshipDisplays ?? [];
  const generatedInstant = source.instantStory;
  const instantStory = runtimeMode === "instant_story" ? {
    ...base.instantStory,
    enabled: true,
    corePrompt: generatedInstant?.corePrompt || blueprint.sourcePrompt || "",
    startProfiles: (generatedInstant?.startProfiles ?? []).map((profile, index) => ({
      id: `START_${String(index + 1).padStart(2, "0")}`,
      name: profile.title || `시작 ${index + 1}`,
      prologue: profile.situation || "",
      startSituation: [profile.location, profile.immediateHook].filter(Boolean).join("\n"),
      recommendedReplies: ["주변 상황을 구체적으로 살핀다", "가장 가까운 인물에게 말을 건다", "당면한 문제에 직접 행동한다"],
    })),
    exampleScenes: (generatedInstant?.exampleScenes ?? []).slice(0, 3).map((narration, index) => ({
      id: `EXAMPLE_${String(index + 1).padStart(2, "0")}`,
      userInput: "현재 상황에서 자연스럽게 다음 행동을 선택한다.",
      narration,
      recommendations: ["상황을 더 조사한다", "인물과 대화한다", "위험을 감수하고 행동한다"],
    })),
    keywordNotes: (generatedInstant?.keywordNotes ?? []).slice(0, 20).map((content, index) => ({
      id: `NOTE_${String(index + 1).padStart(2, "0")}`,
      title: `핵심 설정 ${index + 1}`,
      keywords: content.split(/[·,，/]/u).map((item) => item.trim()).filter(Boolean).slice(0, 5),
      priority: Math.max(40, 90 - index * 4),
      content,
    })),
  } : base.instantStory;
  return normalizeProject({
    ...base,
    ...source,
    runtimeMode,
    packageTarget: "cortex",
    projectId: base.projectId,
    author: source.author || "Nexus AI Studio Draft",
    notes: source.notes || blueprint.sourcePrompt || "",
    player,
    npcs,
    factions,
    events,
    instantStory,
    statusWindow: {
      ...base.statusWindow, ...source.statusWindow,
      sections: { ...base.statusWindow.sections, ...source.statusWindow?.sections, relationships: relationshipDisplays.length > 0 },
      relationshipDisplays,
    },
    aiWorldContext: {
      ...base.aiWorldContext,
      ...(source.aiWorldContext ?? {}),
      enabled: runtimeMode === "intelligent_canon",
    },
  });
}
