import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import {
  createInitialState,
  normalizeImageAspect,
  normalizeImageResolution,
} from "../lib/scenario";

test("이미지 저장 해상도는 360p와 480p만 허용한다", () => {
  assert.equal(normalizeImageResolution("360p"), "360p");
  assert.equal(normalizeImageResolution("480p"), "480p");
  assert.equal(normalizeImageResolution("720p"), "480p");
});

test("패키지의 이미지 비율 표기를 세 가지 런타임 값으로 정규화한다", () => {
  assert.equal(normalizeImageAspect("16:9"), "landscape");
  assert.equal(normalizeImageAspect("세로"), "portrait");
  assert.equal(normalizeImageAspect("3:4"), "portrait");
  assert.equal(normalizeImageAspect("1:1"), "square");
  assert.equal(normalizeImageAspect("unknown", "portrait"), "portrait");
});

test("새 세션은 480p와 패키지 기본 비율을 이미지 설정에 보존한다", () => {
  const pack = {
    ...demoScenario,
    turnPresentation: {
      ...demoScenario.turnPresentation,
      sceneImage: {
        ...demoScenario.turnPresentation.sceneImage,
        aspectRatio: "portrait",
      },
    },
  };
  const state = createInitialState(pack);

  assert.equal(state.imageResolution, "480p");
  assert.equal(state.imageAspect, "portrait");
});
