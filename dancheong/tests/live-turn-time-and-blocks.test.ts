import assert from "node:assert/strict";
import test from "node:test";

import type { StatePatch } from "../lib/engine";
import {
  authoredTurnFromLiveBlocks,
  isDeviceNotificationMisclassifiedAsDialogue,
} from "../lib/live-block-classification";
import {
  ensureElapsedTimeForLiveTurn,
  finalNarrativeChronologyMismatchReason,
} from "../lib/live-turn-time";
import { LIVE_PLAN_KIND, type LivePlanEnvelope } from "../lib/live-story-runtime";

const envelope = {
  kind: LIVE_PLAN_KIND,
  plan: {
    scenePlan: "현재 알림을 확인한다.", openingDirection: "화면 확인",
    endingDirection: "다음 선택", mustShow: [], mustAvoid: [],
    targetTime: "15:30", targetLocation: "교정",
    beatAdvanced: true, eventResolved: false,
  },
  publicWriterContext: {}, writerStaticPrompt: "", protectedTerms: [],
  beatPolicy: { phase: "closure_build_up", beat: 2, totalBeats: 3, correctionLimit: 1, preserveFailedDraft: false },
  diagnosticContract: {
    eventName: "알림", timeWindow: "오후", currentTime: "15:30",
    currentLocation: "교정", targetLocation: "교정", requiredItems: [],
    requiredDialogue: [], completionSignals: [], currentBeatSignals: [],
  },
  speakerBindings: [{ streamId: "p", characterId: "PLAYER", visibleName: "한시우" }],
  model: "gpt-5.6-luna", reasoningEffort: "none", maxOutputTokens: 1000,
  promptCacheKey: "block-test", planUsage: {} as LivePlanEnvelope["planUsage"],
} satisfies LivePlanEnvelope;

test("a displayed phone notification cannot borrow the player dialogue card", () => {
  const converted = authoredTurnFromLiveBlocks({
    envelope,
    rawTurn: { b: [
      { k: "n", s: "", c: "+0 15:30", t: "휴대전화가 진동했다. 화면에는 수령 알림과 보관 기한이 표시되었다.", n: "", e: "" },
      { k: "d", s: "p", c: "+0 15:31", t: "교내 무인택배함에 물건이 도착했습니다. 발송인은 한명진입니다.", n: "", e: "긴장" },
    ] },
  });
  assert.equal(converted.blocks[1].type, "narration");
  assert.equal(converted.blocks[1].speakerId, "");
  assert.deepEqual((converted.turn.dialogueAnnotations as unknown[]), []);
});

test("작가의 블록별 비공개 시각은 생활 장면의 큰 시간 경과를 최종 월드 시각으로 전달한다", () => {
  const converted = authoredTurnFromLiveBlocks({
    envelope: {
      ...envelope,
      diagnosticContract: { ...envelope.diagnosticContract, currentTime: "06:47" },
    },
    rawTurn: { b: [
      { k: "n", s: "", n: "", e: "", c: "+0 08:30", t: "첫 교시가 시작됐다." },
      { k: "n", s: "", n: "", e: "", c: "+0 09:20", t: "종이 울리며 쉬는 시간이 열렸다." },
    ] },
  });
  assert.equal(converted.writerSceneClock.time, "09:20");
  assert.equal(converted.writerSceneClock.dayDelta, 0);
  assert.deepEqual(converted.writerSceneClock.marks.map((mark) => mark.time), ["08:30", "09:20"]);
});

test("작가의 비공개 문단 시각이 현재보다 과거로 역행하면 저장 전에 거부한다", () => {
  assert.throws(() => authoredTurnFromLiveBlocks({
    envelope,
    rawTurn: { b: [
      { k: "n", s: "", n: "", e: "", c: "+0 15:29", t: "과거로 돌아갔다." },
    ] },
  }), /장면 시각이 과거로 역행/u);
});

test("an actual spoken report with a speech cue remains dialogue", () => {
  assert.equal(isDeviceNotificationMisclassifiedAsDialogue({
    previousText: "한시우는 휴대전화 화면을 확인한 뒤 소리 내어 읽어 주었다.",
    text: "발송인은 한명진입니다.",
  }), false);
});

test("a substantive middle beat advances a frozen world clock without another prose pass", () => {
  const statePatch = {
    time: "15:30", location: "교정", sceneSummary: "교수와 토론을 마치고 알림을 확인했다.",
  } as StatePatch;
  const turn = ensureElapsedTimeForLiveTurn({
    state: { day: 0, date: "2018-10-23", weekday: "화요일", time: "15:30", location: "교정" },
    beatPolicy: envelope.beatPolicy,
    turn: {
      blocks: [
        { type: "narration" as const, text: "토론이 이어지는 동안 교수는 지도 위의 경로를 다시 고쳤다." },
        { type: "dialogue" as const, text: "현장에서 확인한 자료를 다음 시간에 가져오세요." },
      ],
      statePatch,
      chronology: { day: 0, date: "2018-10-23", weekday: "화요일", time: "15:30" },
    },
  });
  assert.equal(turn.statePatch.time, "15:33");
  assert.equal(turn.chronology.time, "15:33");
});

test("location travel receives a larger deterministic elapsed-time floor", () => {
  const turn = ensureElapsedTimeForLiveTurn({
    state: { day: 0, date: "2018-10-23", weekday: "화요일", time: "15:30", location: "강의실" },
    beatPolicy: envelope.beatPolicy,
    canonAbsorption: true,
    turn: {
      blocks: [{ type: "narration" as const, text: "수업을 마친 뒤 캠퍼스 밖으로 걸어 나왔다. 젖은 교정을 가로질러 무인택배함 앞에 도착할 때까지 시간이 흘렀다." }],
      statePatch: { time: "15:30", location: "무인택배함" } as StatePatch,
      chronology: { day: 0, date: "2018-10-23", weekday: "화요일", time: "15:30" },
    },
  });
  assert.equal(turn.statePatch.time, "15:40");
});

test("sidecar 시간이 본문 사건 마감을 넘겨도 HUD 원장은 마감 시각에서 멈춘다", () => {
  const turn = ensureElapsedTimeForLiveTurn({
    state: { day: 0, date: "2018-10-23", weekday: "화요일", time: "17:55", location: "강의실" },
    beatPolicy: envelope.beatPolicy,
    eventTimeWindow: "15:00~18:00",
    turn: {
      blocks: [{ type: "narration" as const, text: "교수의 마지막 질문에 답하고 자료를 챙겼다." }],
      statePatch: { time: "18:30", location: "강의실" } as StatePatch,
      chronology: { day: 0, date: "2018-10-23", weekday: "화요일", time: "18:30" },
    },
  });
  assert.equal(turn.statePatch.time, "18:00");
  assert.equal(turn.chronology.time, "18:00");
});

test("이미 마감이 지난 복구 턴은 정사 합류 중 월드 시간을 더 소비하지 않는다", () => {
  const turn = ensureElapsedTimeForLiveTurn({
    state: { day: 0, date: "2018-10-23", weekday: "화요일", time: "18:30", location: "강의실" },
    beatPolicy: envelope.beatPolicy,
    eventTimeWindow: "15:00~18:00",
    turn: {
      blocks: [{ type: "narration" as const, text: "그는 즉시 연락을 확인하고 현재 사건으로 복귀했다." }],
      statePatch: { time: "18:40", location: "강의실" } as StatePatch,
      chronology: { day: 0, date: "2018-10-23", weekday: "화요일", time: "18:40" },
    },
  });
  assert.equal(turn.statePatch.time, "18:30");
  assert.equal(turn.chronology.time, "18:30");
});

test("실제 실패 본문의 18시와 15:27 HUD 불일치는 최종 저장 전에 차단한다", () => {
  const state = {
    day: 0,
    date: "2018-10-23",
    weekday: "화요일",
    time: "15:27",
  };
  const blocks = [{
    type: "narration" as const,
    text: [
      "낮의 페이지 넘기는 소리는 저녁이 가까워질수록 낮은 속삭임으로 바뀌었다.",
      "캠퍼스는 특별한 소란 없이 저녁의 흐름으로 넘어갔다.",
      "도서관 창가 자리에서 과제의 정리가 일단락될 무렵, 시계는 18시를 조금 앞두고 있었다.",
    ].join("\n"),
  }];

  assert.match(
    finalNarrativeChronologyMismatchReason({
      state,
      blocks,
      chronology: state,
    }) ?? "",
    /본문 시각.*18:00.*최종 상태 시각.*15:27/u,
  );
  assert.equal(finalNarrativeChronologyMismatchReason({
    state,
    blocks,
    chronology: { ...state, time: "18:00" },
  }), undefined);
});
