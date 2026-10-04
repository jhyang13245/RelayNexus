import type { SceneFactContract } from "./scene-fact";
import { sceneFactPrompt } from "./scene-fact";

export const buildDirectExecutionRescuePrompt = (
  sceneFact: SceneFactContract,
): string => [
  "[단일 작가 직접 실행 복구]",
  "- narration은 한국어 장르소설 650~1100자, 3~5문단으로 처음부터 다시 쓴다.",
  "- 각 선언 절을 행동 → 현장 반응 → 달라진 상황으로 잇고 뒤 절이 불성립해도 앞 절을 취소하지 않는다.",
  "- 이동은 출발·경로 또는 수단·경과 시간·도착을 쓰고, 재회·말 걸기는 실제 반응 또는 부재의 구체적 근거까지 처리한다.",
  "- 인사·질문·사과·부탁은 물건에 하는 행동처럼 바꾸지 않는다. 현재 대화 상대가 듣고, 인물의 성격과 사정에 따라 수락·거절·유보·역질문 중 하나를 실제 대사와 행동으로 판정한다.",
  "- 장시간 동행을 부탁한 말만으로 시간이 밤까지 경과한 것으로 쓰지 않는다.",
  "- D형은 실제 시도와 대상·주변 반응, 현실적인 대가를 확정하고 일반 이동으로 바꾸지 않는다.",
  "- sceneFact 계약:",
  sceneFactPrompt(sceneFact),
  "- 활성 사건은 입력 결과 때문에 생긴 연락·지연·우회·목격에만 연결한다.",
].join("\n");
