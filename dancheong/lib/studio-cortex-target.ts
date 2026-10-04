import engine from "../vendor/cortex/manifest.json";

// The Studio handoff follows the engine bundled with this Nexus release.
export const STUDIO_CORTEX_TARGET = {
  packageTarget: "cortex",
  format: "DANCHEONG_CORTEX_PACK_V1",
  targetEngine: "dancheong-cortex",
  minimumTargetVersion: engine.version,
  eventDesignSchema: "STUDIO_EVENT_DESIGN_V2",
} as const;

export const CORTEX_DESIGN_INSTRUCTION = `단청에 탑재된 Cortex ${engine.version} 전용 CortexPack을 설계한다.
- 정사 중심과 자유 전개는 모두 Cortex 패키지다. Lotus 전용 계약으로 생성하지 않는다.
- opening.openingTime은 HH:mm:ss 형식으로 오프닝 산문의 실제 시작 시각과 일치시킨다. 사건별 고정 시간표는 만들지 않는다.
- 발생·종결·미충족 조건의 단일 편집 원본은 cortexDesign이다. 옛 conditions·cancelConditions·effects·onSuccess·onFailure·completionSignals·recoveryAlternatives에는 같은 조건을 중복 작성하지 말고 빈 문자열로 둔다.
- 사건은 입력 배열 순서로 진행하고 nextEventId는 명시된 후속 사건 ID만 사용한다. 날짜·시각·우선순위로 사건을 정렬하거나 실행을 강제하지 않는다.
- 사건별 cortexDesign에 발생조건 사용 여부와 자연어 발생조건, 개별 ID가 있는 종결조건, 수량·선택 범위, 장면 제약, 달성 시 마무리, 미충족 시 허용 전개를 작성한다. 원문을 사실로 간주하지 않고 공개 본문에서 달성 여부를 판정한다.
- 기본 사건 비트는 3개로 설계한다. 최소 2비트 후 조기 종결과 최대 2비트 연장 여부는 엔진이 결정한다. 수습되지 않은 의무만 이월하고 허용된 대체 목표를 다시 강제하지 않는다.
- 다른 인물 시점은 cortexDesign.otherViewpoint와 viewpoint로 표시한다. 시점 전환을 주인공의 이동·정보 습득으로 확정하지 않는다.
- protagonistInvariants는 작품에 필요한 불변식만 HARD/SOFT로 작성하고 사용자 설정과 충돌하는 불멸·기억 보존을 임의로 넣지 않는다. 없으면 빈 배열로 둔다.
- disclosure.protectedTerms에는 미공개 진명·고유 비밀 명칭만 넣고 평범한 일반어는 보호어로 쓰지 않는다. revealTerms는 해당 사건에서 공개가 허용되는 보호어만 담는다.
- 인물·세력·사건·조건 ID는 중복되지 않게 유지하고 관계 HUD의 entityId가 실제 대상 ID를 가리키게 한다. 숨은 인물의 preRevealAlias는 공개 전 사용할 별칭이며 진명을 누설하지 않는다.
- 추천답변·화자 메타데이터·시공간 트랙은 실행 중 작가와 엔진이 생성한다. 오프닝 산문에 내부 마커나 상태표를 강제로 넣지 않는다.`;
