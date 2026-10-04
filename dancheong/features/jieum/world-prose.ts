import type { Project } from "./studio-model";

// Only descriptive categories are combined. Engine constraints and unknown future
// fields keep their own keys, and opening a project never migrates its data.
export const worldProseFields = [
  ["history", "역사와 분기점"], ["politics", "정치 구조"],
  ["economy", "경제와 자원"], ["technology", "기술 수준"],
  ["society", "사회·문화"], ["military", "군사"],
  ["religionIdeology", "종교·이념"], ["transportCommunication", "교통·통신"],
  ["currencyPrices", "화폐·물가"], ["supernatural", "초자연 요소"],
] as const;

export function worldProse(world: Project["world"]) {
  return [world.overview || "", ...worldProseFields.flatMap(([key, label]) =>
    world[key]?.trim() ? [`[${label}]\n${world[key]}`] : [])].filter(Boolean).join("\n\n");
}

export function updateWorldProse(world: Project["world"], overview: string): Project["world"] {
  const next: Project["world"] = { ...world, overview };
  for (const [key] of worldProseFields) next[key] = "";
  return next;
}

export const instantWorldRuleFields = [
  ["fixedCanon", "고정 사실·진행 원칙"],
  ["impossibilities", "불가능한 것·능력 한계"],
  ["aiFillConstraints", "설정 보완 기준"],
] as const satisfies ReadonlyArray<readonly [keyof Project["world"], string]>;

export function instantWorldProse(world: Project["world"]) {
  return [worldProse(world), ...instantWorldRuleFields.flatMap(([key, label]) => {
    const value = world[key];
    return typeof value === "string" && value.trim() ? [`[${label}]\n${value}`] : [];
  })].filter(Boolean).join("\n\n");
}

export function updateInstantWorldProse(world: Project["world"], overview: string): Project["world"] {
  const next = updateWorldProse(world, overview);
  for (const [key] of instantWorldRuleFields) next[key] = "";
  return next;
}

export const privateWorldProseFields = [
  ["hiddenTimeline", "비공개 연표"], ["secretResources", "숨은 자원·단서"],
  ["plannedTwists", "예정된 반전"], ["forbiddenDisclosures", "아직 공개하면 안 되는 정보"],
  ["failureEscalationRules", "실패와 악화 규칙"], ["continuityNotes", "연속성 메모"],
] as const;

export function privateWorldProse(gmData: Project["gmData"]) {
  return [gmData.worldTruthLedger || "", ...privateWorldProseFields.flatMap(([key, label]) =>
    gmData[key]?.trim() ? [`[${label}]\n${gmData[key]}`] : [])].filter(Boolean).join("\n\n");
}

export function updatePrivateWorldProse(gmData: Project["gmData"], worldTruthLedger: string): Project["gmData"] {
  const next:Project['gmData'] = { ...gmData, worldTruthLedger };
  for (const [key] of privateWorldProseFields) next[key] = "";
  return next;
}
