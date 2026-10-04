import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import { createInitialState, createOpeningTurn } from "../lib/scenario";
import {
  buildSessionTranscriptHtml,
  sessionTranscriptFileName,
} from "../lib/session-export";
import { buildPublicStatusSnapshot } from "../lib/status-window";
import {
  claudeRuntimeVariable,
  closeClaudeEventManually,
  readClaudeRuntime,
} from "../lib/claude-runtime";

test("전문 HTML은 대화, 공개 상태창, 장기기억과 이미지를 한 파일에 담는다", () => {
  const state = createInitialState(demoScenario);
  const opening = {
    ...createOpeningTurn(demoScenario),
    userText: "<script>위험</script>",
    imageUrl: "data:image/jpeg;base64,QUJD",
    statusSnapshot: buildPublicStatusSnapshot(demoScenario, state),
  };
  const html = buildSessionTranscriptHtml({
    pack: demoScenario,
    sessionName: "검증 이야기",
    chapterTitle: "첫 장",
    exportedAt: "2026년 8월 16일 오전 7:30",
    currentScene: {
      day: state.day,
      date: state.date,
      weekday: state.weekday,
      time: state.time,
      weather: state.weather,
      location: state.location,
      summary: state.sceneSummary,
    },
    turns: [opening],
    longTermMemories: [{
      id: "memory-1",
      sourceTurnId: opening.id,
      turn: opening.turn,
      day: state.day,
      date: state.date,
      weekday: state.weekday,
      time: state.time,
      location: state.location,
      title: "확인한 사건",
      summary: "문을 열고 단서를 확인했다.",
      createdAt: opening.createdAt,
    }],
    mediaUrls: {},
    generatedSceneImageLimit: 5,
  });

  assert.match(html, /대화 및 스토리 전문/);
  assert.match(html, /TURN STATUS · LIVE/);
  assert.match(html, /확인한 사건/);
  assert.match(html, /data:image\/jpeg;base64,QUJD/);
  assert.match(html, /&lt;script&gt;위험&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>위험<\/script>/);
  assert.doesNotMatch(html, /gmData/);
});

test("전문 파일명은 작품과 세션 이름을 보존하면서 안전한 HTML 이름을 만든다", () => {
  const name = sessionTranscriptFileName(
    "Fate/Seoul — 거짓 왕관",
    "새 이야기 2",
    new Date(2026, 7, 16, 7, 5),
  );
  assert.equal(
    name,
    "Fate_Seoul_거짓_왕관_새_이야기_2_전문_20260816_0705.html",
  );
});

test("전문은 실제 출력된 이미지만 세고 첫 등장 기준본을 프로필 카드로 보존한다", () => {
  const state = createInitialState(demoScenario);
  const opening = {
    ...createOpeningTurn(demoScenario),
    blocks: [{
      id: "nadia-line",
      type: "dialogue" as const,
      text: "길을 좀 물어도 될까요?",
      speakerId: "NPC_NADIA",
      speakerName: "나디아 알 하다드",
      mediaAssetId: "nadia-profile",
    }],
    characterVisuals: [{
      blockIndex: 0,
      characterId: "NPC_NADIA",
      characterName: "나디아 알 하다드",
      importance: "major" as const,
      isFirstMajorAppearance: true,
      appearancePrompt: "방문 연구자",
      reason: "첫 등장",
      canonicalAssetId: "nadia-profile",
      source: "package" as const,
    }],
    statusSnapshot: buildPublicStatusSnapshot(demoScenario, state),
  };
  const pack = {
    ...demoScenario,
    mediaAssets: [{
      id: "nadia-profile",
      path: "characters/nadia.png",
      kind: "character" as const,
      characterId: "NPC_NADIA",
      characterName: "나디아 알 하다드",
      label: "대표 이미지",
      emotionTags: [],
      sceneTags: [],
      placement: "after_block" as const,
      priority: 100,
      alt: "나디아 알 하다드",
      caption: "나디아 알 하다드",
    }],
  };
  const html = buildSessionTranscriptHtml({
    pack,
    sessionName: "이미지 검증",
    chapterTitle: "프롤로그",
    exportedAt: "2026년 8월 16일 오전 8:30",
    currentScene: {
      day: 0,
      date: state.date,
      weekday: state.weekday,
      time: state.time,
      weather: state.weather,
      location: state.location,
      summary: state.sceneSummary,
    },
    turns: [opening],
    longTermMemories: [],
    mediaUrls: {
      "nadia-profile": "data:image/png;base64,QUJD",
      "unused-image": "data:image/png;base64,REVG",
    },
    playerImageUrl: "data:image/png;base64,R0hJ",
    generatedSceneImageLimit: 5,
  });

  assert.match(html, /CHARACTER PROFILE<strong>나디아 알 하다드<\/strong>/);
  assert.match(html, /포함된 이미지<\/span><strong>2개<\/strong>/);
  assert.doesNotMatch(html, /REVG/);
});

test("전문은 수동 종결 사건의 이월 항목과 실제 해소 턴을 상호 참조한다", () => {
  const initial = createInitialState(demoScenario);
  const closed = closeClaudeEventManually(demoScenario, initial);
  const ledger = readClaudeRuntime(demoScenario, closed.state);
  const sealed = ledger.sealed[0];
  assert.ok(sealed);
  sealed.carryoverItems = [{
    id: "carryover-1",
    requirement: "필수 단서를 직접 확인",
    status: "resolved",
    resolvedTurn: 4,
    resolutionSummary: "다음 사건의 조사 장면에서 단서를 확인했다.",
  }];
  sealed.carryoverResolution = "앞서 남은 조건이 다음 사건의 인과 안에서 마무리됐다.";
  const runtimeState = {
    ...closed.state,
    variables: [
      ...closed.state.variables.filter((variable) =>
        variable.id !== claudeRuntimeVariable(ledger).id
      ),
      {
        ...claudeRuntimeVariable(ledger),
        status: "active" as const,
        createdTurn: closed.state.turn,
      },
    ],
  };
  const opening = {
    ...createOpeningTurn(demoScenario),
    runtimeSnapshot: runtimeState,
  };
  const html = buildSessionTranscriptHtml({
    pack: demoScenario,
    sessionName: "이월 검증",
    chapterTitle: "첫 장",
    exportedAt: "2026년 8월 22일 오후 8:00",
    currentScene: {
      day: runtimeState.day,
      date: runtimeState.date,
      weekday: runtimeState.weekday,
      time: runtimeState.time,
      weather: runtimeState.weather,
      location: runtimeState.location,
      summary: runtimeState.sceneSummary,
    },
    turns: [opening],
    longTermMemories: [],
    mediaUrls: {},
    generatedSceneImageLimit: 5,
  });
  assert.match(html, /이월 조건 처리 기록/);
  assert.match(html, /필수 단서를 직접 확인/);
  assert.match(html, /TURN 04에서 처리/);
});
