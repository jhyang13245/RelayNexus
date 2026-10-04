import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import { selectEligibleTriggeredMedia } from "../lib/image-trigger-runtime";
import { createInitialState } from "../lib/scenario";

const eventId = "EVENT_OPEN_STAR_GATE";
const triggerId = "TRIGGER_OPEN_STAR_GATE";
const assetId = "star-gate-trigger-scene";

const eventTriggerPack = {
  ...demoScenario,
  projectId: "GENERIC-IMAGE-TRIGGER-RUNTIME",
  title: "별빛 천문대의 기록",
  genre: "현대 판타지",
  events: [{
    ...demoScenario.events[0],
    id: eventId,
    name: "별문 개방",
    completionSignals: "별문이 열렸다",
  }],
  imageTriggers: [{
    id: triggerId,
    name: "별문 개방 CG",
    enabled: true,
    visibility: "Hidden",
    triggerType: "event_start",
    sourceId: eventId,
    threshold: 0,
    storyProgress: "",
    customCondition: "",
    mode: "show_trigger_image",
    characterIds: [],
    prompt: "",
    negativePrompt: "",
    once: true,
    priority: 100,
    outputPosition: "after_scene",
  }],
  mediaAssets: [{
    id: assetId,
    path: "scenes/star-gate.webp",
    kind: "scene" as const,
    characterId: "",
    characterName: "",
    label: "별문 개방",
    emotionTags: [],
    sceneTags: [eventId, "별문 개방"],
    placement: "after_block" as const,
    priority: 1000,
    alt: "별문 개방",
    caption: "",
    source: "package" as const,
    canonical: false,
    triggerId,
    triggerSourceId: eventId,
  }],
};

const contextFor = (activeEventId = "EVENT_ORDINARY_MORNING") => {
  const state = createInitialState(eventTriggerPack);
  return {
    activeEventId,
    currentText: "별문 개방은 아직 일어나지 않았고 평범한 오전 수업이 시작됐다.",
    sceneSummary: "아직 천문대 사건은 시작되지 않았다.",
    userText: "수업을 준비한다.",
    day: state.day,
    date: state.date,
    time: state.time,
    location: state.location,
    clocks: state.clocks,
    variables: state.variables,
  };
};

test("이벤트 트리거 이미지는 다른 사건이 활성화된 동안 선택되지 않는다", () => {
  assert.equal(
    selectEligibleTriggeredMedia(eventTriggerPack, contextFor()),
    undefined,
  );
});

test("이벤트 트리거 이미지는 정확한 연결 사건이 활성화된 경우에만 선택된다", () => {
  assert.equal(
    selectEligibleTriggeredMedia(eventTriggerPack, contextFor(eventId))?.asset.id,
    assetId,
  );
});

test("once 트리거 이미지는 이전 대화에서 사용됐다면 다시 선택되지 않는다", () => {
  assert.equal(
    selectEligibleTriggeredMedia(eventTriggerPack, {
      ...contextFor(eventId),
      priorMediaAssetIds: [assetId],
    }),
    undefined,
  );
});

test("시계 트리거는 서버가 계산한 임계값 도달 뒤에만 선택된다", () => {
  const clockId = eventTriggerPack.clocks[0].id;
  const clockAsset = {
    ...eventTriggerPack.mediaAssets[0],
    id: "clock-threshold-scene",
    label: "공명 임계점",
    triggerId: "TRIGGER_CLOCK_THRESHOLD",
    triggerSourceId: clockId,
  };
  const clockPack = {
    ...eventTriggerPack,
    imageTriggers: [{
      ...eventTriggerPack.imageTriggers[0],
      id: "TRIGGER_CLOCK_THRESHOLD",
      name: "공명 임계점 CG",
      triggerType: "clock_value",
      sourceId: clockId,
      threshold: 1,
    }],
    mediaAssets: [clockAsset],
  };
  const state = createInitialState(clockPack);
  const baseContext = {
    ...contextFor(),
    clocks: state.clocks,
  };

  assert.equal(selectEligibleTriggeredMedia(clockPack, baseContext), undefined);
  assert.equal(
    selectEligibleTriggeredMedia(clockPack, {
      ...baseContext,
      clockChanges: [{ clockId, delta: 1 }],
    })?.asset.id,
    clockAsset.id,
  );
});
