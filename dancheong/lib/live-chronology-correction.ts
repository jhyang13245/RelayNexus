import {
  liveCanonAnchorDriftReason,
  liveCanonAnchorFallbackParagraph,
  liveCanonAnchorParagraphDriftReason,
  type LiveCanonAnchorGuard,
} from "./live-canon-anchor";
import type { LivePlanEnvelope } from "./live-story-runtime";

export const chronologyCorrectionDeveloperPrompt = (envelope: LivePlanEnvelope): string =>
  `너는 실시간 소설의 시간·장소 정사 장면 재집필 작가다.
초안에서 시간 이탈이 처음 발생한 문단부터 장면 끝까지의 연속된 꼬리 장면이 전달된다. 사용자의 욕구와 목표는 삭제하지 말고 현재 시각의 생각·의도·준비·출발·즉시 반응으로 바꿔, 전달된 꼬리 전체가 하나의 흥미로운 장면이 되도록 다시 쓴다.
- 현재 기준은 ${envelope.canonAnchorGuard?.currentTime || envelope.plan.targetTime} · ${envelope.canonAnchorGuard?.currentLocation || envelope.plan.targetLocation}이다.
- 사건 시간창은 ${envelope.canonAnchorGuard?.eventTimeWindow || envelope.diagnosticContract.timeWindow}이며 절대 마감이다. 현재 비트 신호나 종결 조건을 같은 문단에서 충족했더라도 마감을 넘길 수 없다. 지나지 않은 몇 시간·저녁·밤·다음 날·1년을 이미 산 것처럼 확정하지 않는다.
- 현재 사건은 ${envelope.canonAnchorGuard?.eventName || envelope.diagnosticContract.eventName}이다. 정사 합류가 필요한 문단이면 사용자 욕구의 가능한 첫 행동 뒤에 인물 중심의 구체적 이유와 사건 자극을 이어, 현재 비트 신호(${(envelope.canonAnchorGuard?.currentBeatSignals ?? envelope.diagnosticContract.currentBeatSignals).join(" / ") || "현재 장면의 핵심 행동과 반응"}) 중 가장 자연스러운 하나를 실제 장면으로 성립시킨다. 마지막 비트 전에는 사건을 종결하지 않는다.
- ‘저녁까지 공부한다’처럼 마감 밖의 종료 시각이 입력됐더라도 그 시각까지 압축해 완주하지 않는다. 공부를 시작하는 짧은 단계만 보여 준 뒤 ‘그러나 얼마 지나지 않아’, ‘그때’처럼 자연스러운 전환으로 끊고 현재 사건 자극과 대응을 집필한다.
- 먼 목적지에 순간 도착시키지 않는다. 이동 욕구를 보존하고 현재 장면의 인물·환경이 반응해 정사 동선에 합류하게 한다.
- 원래 문단의 인물 말투·감각·즉시 인과를 보존하고, 전달되지 않은 이미 공개된 앞부분은 바꾸지 않는다. 전달된 문단끼리는 시간 흐름과 인과가 자연스럽도록 함께 재구성할 수 있다.
- 여러 문단에서 현재 비트 신호를 반복하지 않는다. 판정 결과를 설명하지 말고 감각적 변화→인물의 행동→즉각적인 반응이 이어지는 실제 장면을 쓴다.
- ‘현재 시각’, ‘현재 장소’, ‘현재 사건’, ‘시간창’, ‘비트’, ‘정사’, ‘교정’, ‘사용자 의도’, ‘가능한 행동’, ‘다음 선택’ 같은 검증기 표현을 본문에 쓰지 않는다.
- 보고서·다큐·선택지 안내처럼 요약하지 않는다. 추상적인 의도 설명보다 손짓·시선·소리·거리·물리적 변화를 보여 준다.
- 시스템 용어와 교정 설명 없이 요청된 문단만 JSON으로 출력한다.`;

export type CorrectionParagraph = {
  index: number;
  text: string;
  separator: string;
};

export const selectChronologyCorrectionTargets = (
  paragraphs: CorrectionParagraph[],
  narration: string,
  guard?: LiveCanonAnchorGuard,
): { targets: CorrectionParagraph[]; wholeSceneReason?: string } => {
  const local = paragraphs.filter((paragraph) => Boolean(
    liveCanonAnchorParagraphDriftReason(paragraph.text, guard),
  ));
  const wholeSceneReason = liveCanonAnchorDriftReason(narration, guard);
  // A chronology jump changes the meaning of every paragraph after it. Rewriting
  // only the sentences that contain an explicit clock leaves distributed cues
  // such as closing announcements, dark windows, and "same time" side scenes in
  // place. Preserve the safe prefix and rewrite the complete unpublished tail.
  const firstLocalIndex = local.at(0)?.index;
  const targets = firstLocalIndex !== undefined
    ? paragraphs.filter((paragraph) => paragraph.index >= firstLocalIndex)
    : wholeSceneReason && paragraphs.length ? [paragraphs.at(-1)!] : [];
  return { targets, wholeSceneReason };
};

export const chronologyProgressionFallback = (
  paragraph: string,
  guard: LiveCanonAnchorGuard,
  includeBeatBridge: boolean,
): string => {
  const sentences = paragraph.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)|\n+/gu) ?? [paragraph];
  const preserved = sentences.filter((sentence) =>
    !liveCanonAnchorParagraphDriftReason(sentence, guard)
  ).join("").trim();
  const bridge = includeBeatBridge ? liveCanonAnchorFallbackParagraph(guard) : "";
  return [preserved, bridge].filter(Boolean).join(" ") ||
    "가까운 곳에서 마른 소리가 튀었다. 그는 펜을 멈추고 고개를 들었다.";
};

export const chronologySafetyRecovery = (
  paragraphs: CorrectionParagraph[],
  guard: LiveCanonAnchorGuard,
): string => {
  const firstDriftIndex = paragraphs.findIndex((paragraph) =>
    Boolean(liveCanonAnchorParagraphDriftReason(paragraph.text, guard))
  );
  const safePrefix = firstDriftIndex >= 0
    ? paragraphs.slice(0, firstDriftIndex)
    : paragraphs.slice(0, Math.max(0, paragraphs.length - 1));
  const safeContext = safePrefix
    .map((paragraph) => paragraph.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const bridge = liveCanonAnchorFallbackParagraph(guard);
  const recovered = [safeContext, bridge].filter(Boolean).join("\n\n");
  return liveCanonAnchorDriftReason(recovered, guard) ? bridge : recovered;
};
