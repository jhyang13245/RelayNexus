import type { SceneFactContract } from "./scene-fact";
import { sceneFactVisible } from "./scene-fact";

export type DirectSceneFactAssessment = {
  required: boolean;
  satisfied: boolean;
  reasons: string[];
};

export const assessDirectSceneFact = (
  contract: SceneFactContract,
  publicText: string,
): DirectSceneFactAssessment => {
  if (!contract.active) {
    return { required: false, satisfied: true, reasons: [] };
  }
  const satisfied = sceneFactVisible(contract, publicText);
  return {
    required: true,
    satisfied,
    reasons: satisfied
      ? []
      : ["플레이어 sceneFact의 도구·대상·행동·즉시 결과 누락"],
  };
};
