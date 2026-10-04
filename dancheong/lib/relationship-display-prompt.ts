import type { ScenarioPack } from "./scenario";

export const instantRelationshipDisplayPrompt = (pack: ScenarioPack): string => {
  const enabled = pack.instantStoryRuntime?.enabled &&
    pack.package15Runtime?.negotiatedFeatures.includes("status_relationship_display_v1");
  if (!enabled) return "";
  return `- relationship_display: 접두사의 관계 상태 필드는 공개 장면에서 해당 인물과 직접 대화·공동 행동·충돌했거나 공개된 세력 사건 결과가 생겼을 때만 statusLedgerChanges로 갱신한다.
- 문장·수치·기호가 결합된 같은 relationshipDisplayId는 하나의 관측 원인을 공유한다. 같은 원인을 세 번 계산하지 말고 함께 바꿀 때 reason을 동일하게 쓴다.
- 이 Instant HUD를 위해 relationChanges, relationshipMemoriesAdd, autonomyActions를 생성하지 않는다. 숨은 관계 장부·자율 행동·미공개 정체를 활성화하거나 추론하지 않는다.`;
};
