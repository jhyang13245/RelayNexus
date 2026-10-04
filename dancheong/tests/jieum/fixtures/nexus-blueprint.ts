import { CORTEX_TARGET_VERSION, CORTEX_PACKAGE_FORMAT } from "../../../features/jieum/cortex-target";

export function nexusBlueprint(runtimeMode: "intelligent_canon" | "instant_story" = "intelligent_canon") {
  return {
    format: "RELAY_NEXUS_STUDIO_BLUEPRINT_V1",
    target: { packageTarget: "cortex", format: CORTEX_PACKAGE_FORMAT, targetEngine: "dancheong-cortex", minimumTargetVersion: CORTEX_TARGET_VERSION, eventDesignSchema: "STUDIO_EVENT_DESIGN_V2" },
    runtimeMode, sourcePrompt: "기억을 잃은 기자와 무녀가 경성의 미제 사건을 추적한다.",
    project: {
      packageTarget: "legacy", title: "경성의 봉인", genre: "미스터리", startDate: "1930-09-10", startLocation: "경성 역 앞",
      player: { id: "PC_REPORTER", name: "서윤", goals: "잃어버린 기억을 조사한다." },
      npcs: [{ id: "NPC_SHAMAN", name: "연화", preRevealAlias: "무녀", goals: "사라진 인장을 찾는다." }],
      factions: [{ id: "FACTION_PRESS", name: "경성일보" }],
      world: { overview: "경성의 가을.", fixedCanon: "기자의 기억은 일부 사라졌다." },
      opening: { openingLocation: "경성 역 앞", openingTime: "09:00:00", openingEvent: "EVT_SEAL", openingCharacters: "서윤, 연화", openingLine: "역전 시계가 멈췄다. 무녀가 젖은 봉투를 내밀었다." },
      protagonistInvariants: [{ ref: "invariant:choice", label: "선택권", severity: "HARD", description: "주인공의 중대한 결정을 대신 확정하지 않는다." }],
      disclosure: { protectedTerms: ["흑월인"] },
      statusWindow: { relationshipDisplay: { entries: [
        { id: "HUD_SHAMAN", entityType: "character", entityId: "NPC_SHAMAN", label: "무녀", order: 10, visibility: "met_only", revealRule: "직접 만난 뒤", displayParts: ["sentence", "stat"], sentence: "협력을 제안했다.", stat: { label: "신뢰", current: 5, minimum: -100, maximum: 100 }, symbol: "", updateRule: "공개된 상호작용만 반영" },
        { id: "HUD_PRESS", entityType: "faction", entityId: "FACTION_PRESS", label: "경성일보", order: 20, visibility: "public", revealRule: "", displayParts: ["sentence"], sentence: "소속 신문사", symbol: "", updateRule: "공개 사건만 반영" },
      ] } },
      events: runtimeMode === "instant_story" ? [] : ["EVT_SEAL", "EVT_ARCHIVE"].map((id, index) => ({
        id, name: index === 0 ? "봉인된 편지" : "기록보관소", required: index === 0, nextEventId: index === 0 ? "EVT_ARCHIVE" : "",
        description: "봉투와 기록에서 남겨진 단서를 조사한다.", participants: "서윤, 연화", revealTerms: index ? ["흑월인"] : [],
        cortexDesign: {
          schema: "STUDIO_EVENT_DESIGN_V2", occurrenceEnabled: index > 0, occurrence: index ? "기록보관소에 도착한 뒤" : "",
          otherViewpoint: false, viewpoint: "", closureConditions: [{ id: id + "_SEAL", text: "봉투의 인장이 훼손되었음을 확인한다." }],
          closure: "", selectionScope: "단서 하나 이상", constraints: "미공개 진명을 누설하지 않는다.",
          success: "다음 조사 대상을 공개한다.", unmet: "조사하지 않으면 목격자의 공개 증언으로 단서를 얻는다.",
        },
        beats: [1, 2, 3].map((n) => ({ title: "단계 " + n, goal: "현장을 관찰한다.", requiredSignals: "공개된 흔적", transition: "다음 관찰" })),
      })),
      instantStory: { corePrompt: "기억의 빈자리를 따라 자유롭게 조사한다.", startProfiles: [{ title: "역전", situation: "멈춘 시계 앞", location: "경성 역 앞", immediateHook: "젖은 봉투" }], exampleScenes: ["역전의 시계가 멈췄다."], keywordNotes: ["경성, 전차가 다니는 거리"] },
    },
  };
}
