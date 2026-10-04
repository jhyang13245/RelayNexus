import assert from "node:assert/strict";
import test from "node:test";

import {
  createValidatedSimulationStream,
  publicSimulationStreamErrorMessage,
} from "../app/api/simulate/stream/route";
import {
  normalizeSimulateRequest,
  runLunaInternal,
  turnSchema,
} from "../app/api/simulate/route";
import type { EngineTurnResponse } from "../lib/engine";
import {
  appendNarrationCommit,
  consumeSimulationStream,
  createNarrationCommitEvents,
  encodeSimulationStreamEvent,
  finalResponseNarration,
  hydrateValidatedLiveBlocks,
  isDirectLiveBlockStream,
  liveScrollerShouldFollow,
  parseSimulationStreamFrame,
  projectStableLiveBlocks,
  revealNarrationCommit,
  rewindNarrationBlocks,
  shouldStartInitialStreamScroll,
  typewriterDurationMs,
  typewriterGraphemesPerFrame,
  validatedLiveNarrationMatches,
  validatedLiveProjectionMatches,
  validatedStoryBlocksMatch,
  type SimulationStreamEvent,
} from "../lib/simulation-stream";
import { createInitialState, type StoryBlock } from "../lib/scenario";
import {
  LIVE_PLAN_KIND,
  drainCompletedNarration,
  extractPartialLiveBlocks,
  extractPartialJsonStringField,
  findProtectedTerm,
  isLivePlanEnvelope,
  liveSpeakerBindingsFromContext,
  livePlanDeveloperPrompt,
  MAX_PROTECTED_TERM_CHARACTERS,
  publicWriterContextFromScene,
  sanitizeProtectedTerms,
  splitDisclosureSafePrefix,
  type LivePlanEnvelope,
} from "../lib/live-story-runtime";
import {
  authoredTurnFromLiveBlocks,
  correctionProseViolationReason,
  liveSidecarRequestBody,
  liveWriterRequestBody,
  requestProtectedParagraphCorrection,
} from "../lib/live-stream-pipeline";
import { liveCanonAnchorDriftReason } from "../lib/live-canon-anchor";
import { firstBeatInstantPlan, middleBeatMicroPlan } from "../lib/live-beat-policy";
import {
  buildLiveWriterStaticPrompt,
  LIVE_WRITER_PROTOCOL_VERSION,
  liveWriterContextFromScene,
  ORDINARY_LIVE_CONTEXT_BUDGET,
} from "../lib/live-writer-context";
import { demoScenario } from "../lib/demo-scenario";

const blocks: StoryBlock[] = [
  { id: "n1", type: "narration", text: "문이 열렸다. 바람이 들어왔다." },
  {
    id: "d1",
    type: "dialogue",
    text: "기다렸어.",
    speakerId: "NPC_RENA",
    speakerName: "레나",
  },
];

const result = {
  mode: "luna",
  blocks,
  statePatch: {},
  recommendations: [],
  image: { recommended: false, reason: "", prompt: "", characterIds: [] },
  characterVisuals: [],
  agencyAudit: { playerActionInvented: false, note: "" },
} as unknown as EngineTurnResponse;

const firstBeatPolicy = {
  phase: "first_draft" as const,
  beat: 1,
  totalBeats: 4,
  correctionLimit: 0 as const,
  preserveFailedDraft: false,
};

const diagnosticContract = {
  eventName: "시험 사건",
  timeWindow: "12:00~13:00",
  currentTime: "12:20",
  currentLocation: "교실",
  targetLocation: "교실",
  requiredItems: [],
  requiredDialogue: [],
  completionSignals: [],
  currentBeatSignals: [],
};

test("보호어 정제는 문법 기능어를 버리고 실제 고유 비밀만 유지한다", () => {
  const terms = sanitizeProtectedTerms([
    "또는",
    "않는다",
    "공개하지 않는다",
    "정체",
    "니콜라 테슬라",
    "홍재",
    "NIKOLA TESLA",
  ]);
  assert.equal(terms.includes("또는"), false);
  assert.equal(terms.includes("않는다"), false);
  assert.equal(terms.includes("공개하지 않는다"), false);
  assert.equal(terms.includes("니콜라 테슬라"), true);
  assert.equal(terms.includes("홍재"), true);
  const safePlan = "계약은 확정하지 않는다. 치료 또는 대화를 먼저 처리한다.";
  assert.equal(findProtectedTerm(safePlan, ["또는", "않는다"]), undefined);
  assert.equal(findProtectedTerm("뇌전의 아처는 니콜라 테슬라였다.", terms), "니콜라 테슬라");
  assert.equal(findProtectedTerm("rethinking 과정", ["king"]), undefined);
});

test("내부 사건 원장 전체는 보호 명칭 정규식으로 컴파일하지 않는다", () => {
  const serializedLedger = JSON.stringify({
    version: "claude-html-2026-08-22+relay-nexus-v38",
    activeEventId: "EV_PROLOGUE_01_ORDINARY_MORNING",
    eventText: "한명진의 기록물과 현재 장면 본문 ".repeat(1_200),
  });
  assert.ok([...serializedLedger].length > MAX_PROTECTED_TERM_CHARACTERS);
  assert.deepEqual(
    sanitizeProtectedTerms([serializedLedger, "홍재"]),
    ["홍재"],
  );
  assert.doesNotThrow(() => findProtectedTerm("현재 공개 본문은 안전하다.", [serializedLedger]));
  assert.equal(findProtectedTerm("소녀 검사의 진명은 홍재였다.", [serializedLedger, "홍재"]), "홍재");
});

test("예상하지 못한 정규식 오류는 내부 원문 없이 안전한 안내만 표시한다", () => {
  const rawMessage = `Invalid regular expression: /${"activeEventId".repeat(2_000)}/u`;
  const publicMessage = publicSimulationStreamErrorMessage({ message: rawMessage });
  assert.match(publicMessage, /내부 오류/u);
  assert.doesNotMatch(publicMessage, /Invalid regular expression|activeEventId/u);
});

test("중간 비트 Micro Plan은 별도 모델 호출 없이 종결 원인만 쌓는다", () => {
  const plan = middleBeatMicroPlan({
    time: "12:20",
    location: "A205호 앞",
    eventName: "A205호의 부서진 문",
    beatTitle: "직원의 증언",
    beatIntent: "시설팀 직원의 관측 범위를 대화로 확인한다.",
    requiredEvidence: ["사용자 질문의 직접 답변"],
    currentBeatSignals: ["문틈의 은회색 파편 확인"],
  });
  assert.equal(plan.eventResolved, false);
  assert.equal(plan.beatAdvanced, true);
  assert.ok(plan.mustShow.includes("사용자 질문의 직접 답변"));
  assert.ok(plan.mustShow.includes("문틈의 은회색 파편 확인"));
  assert.match(plan.scenePlan, /시설팀 직원의 관측 범위/u);
  assert.doesNotMatch(plan.scenePlan, /단서.*하나/u);
});

test("첫 비트 Micro Plan도 공개된 현재 비트 목적을 범용 미스터리보다 우선한다", () => {
  const plan = firstBeatInstantPlan("06:45", "한명진의 집", {
    eventName: "평범한 아침",
    beatTitle: "빈집의 확인",
    beatIntent: "한명진의 부재가 일상적인 외출이 아님을 생활 흔적으로 확인한다.",
    requiredEvidence: ["기록물만 챙긴 행동"],
  });
  assert.match(plan.scenePlan, /부재가 일상적인 외출이 아님/u);
  assert.ok(plan.mustShow.includes("기록물만 챙긴 행동"));
  assert.match(plan.mustAvoid.join(" "), /근거 없는 새 기록/u);
});

test("v33 압축 블록 파서는 짧은 화자 ID 뒤 첫 글자부터 노출한다", () => {
  const partial = '{"b":[{"k":"d","s":"VISIBLE_SPEAKER_1","n":"","e":"","c":"+0 12:20","t":"문';
  const parsed = extractPartialLiveBlocks(partial);
  assert.equal(parsed.found, true);
  assert.equal(parsed.malformed, false);
  assert.equal(parsed.blocks[0]?.type, "dialogue");
  assert.equal(parsed.blocks[0]?.speakerId, "VISIBLE_SPEAKER_1");
  assert.equal(parsed.blocks[0]?.text, "문");
  assert.equal(parsed.blocks[0]?.textComplete, false);
});

test("등록 화자는 작가 스키마에서 ID가 제한되고 이름만 쓴 블록도 확정 ID로 복원된다", () => {
  const envelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "레나가 답한다.",
      openingDirection: "질문의 직접 반응",
      endingDirection: "레나의 답변",
      mustShow: ["레나의 답변"],
      mustAvoid: [],
      targetTime: "12:21",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    speakerBindings: [{
      streamId: "VISIBLE_SPEAKER_1",
      characterId: "NPC_RENA",
      visibleName: "레나",
    }],
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-speaker-contract",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  };
  const body = liveWriterRequestBody(envelope, { type: "object" });
  const format = (body.text as Record<string, unknown>).format as Record<string, unknown>;
  const schema = format.schema as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown>;
  const blocksProperty = properties.b as Record<string, unknown>;
  const items = blocksProperty.items as Record<string, unknown>;
  const blockProperties = items.properties as Record<string, unknown>;
  assert.deepEqual((blockProperties.s as Record<string, unknown>).enum, [
    "",
    "VISIBLE_SPEAKER_1",
  ]);
  assert.deepEqual(Object.keys(blockProperties), ["k", "s", "n", "e", "c", "t"]);

  const converted = authoredTurnFromLiveBlocks({
    rawTurn: {
      b: [{ k: "d", s: "", n: "레나", e: "침착", c: "+0 12:21", t: "제가 확인할게요." }],
    },
    envelope,
  });
  assert.equal(converted.blocks[0]?.speakerId, "NPC_RENA");
  assert.equal(converted.blocks[0]?.speakerName, "레나");
});

test("대사 블록의 빈 화자와 등록되지 않은 화자 ID는 공개 전에 거부된다", () => {
  const envelope = {
    kind: LIVE_PLAN_KIND,
    speakerBindings: [{
      streamId: "VISIBLE_SPEAKER_1",
      characterId: "NPC_RENA",
      visibleName: "레나",
    }],
  } as LivePlanEnvelope;
  assert.throws(() => authoredTurnFromLiveBlocks({
    rawTurn: { b: [{ k: "d", s: "", n: "", e: "", c: "+0 12:21", t: "누구지?" }] },
    envelope,
  }), /화자 ID 또는 공개 호칭/u);
  assert.throws(() => authoredTurnFromLiveBlocks({
    rawTurn: { b: [{ k: "d", s: "UNKNOWN", n: "", e: "", c: "+0 12:21", t: "누구지?" }] },
    envelope,
  }), /등록되지 않은 실시간 화자 ID/u);
});

test("본문 전용 프롬프트는 장부 규칙을 제외하고 공개 컨텍스트를 예산 안에 둔다", () => {
  const writerPrompt = buildLiveWriterStaticPrompt(demoScenario);
  assert.ok(writerPrompt.length < 6_500);
  assert.match(writerPrompt, new RegExp(LIVE_WRITER_PROTOCOL_VERSION, "u"));
  assert.match(writerPrompt, /입력의 제한어와 순서/u);
  assert.match(writerPrompt, /보고서·다큐·학술/u);
  assert.match(writerPrompt, /실제로 현장에 있거나 전화·방송·문 너머/u);
  assert.match(writerPrompt, /한 턴에 하나 이하/u);
  assert.match(writerPrompt, /지금 원하는 것→그것을 막는 저항→이번에 택한 말이나 행동/u);
  assert.match(writerPrompt, /정보·주도권·거리·신뢰 중 하나를 바꿔야/u);
  assert.match(writerPrompt, /문단의 끝은 다음 문단의 원인이 되게/u);
  assert.match(writerPrompt, /주장과 근거, 상대의 반응 또는 재반론을 실제 대사/u);
  assert.match(writerPrompt, /계약·동의·연애 확정·공격·항복·배신/u);
  assert.match(writerPrompt, /다음 정사 사건의 첫 자극·도착 알림/u);
  assert.match(livePlanDeveloperPrompt, /현재 사건의 완료 근거를 먼저 모두 성립/u);
  assert.match(livePlanDeveloperPrompt, /다음 사건의 해결·획득·승패·비밀 공개/u);
  assert.doesNotMatch(writerPrompt, /statePatch|recommendations|characterVisuals/u);
  const context = liveWriterContextFromScene({
    playerInputContract: {
      original: "레나에게 파편을 묻는다.",
      clauses: [{ order: 1, kind: "speak", authority: "player", mode: "execution", text: "기록물만 챙기고 레나에게 파편을 묻는다.", mustAttempt: true, mustNotExecute: false }],
      requiredEvidence: ["레나의 직접 답변"],
      policy: Array.from({ length: 80 }, () => "중복 정책"),
    },
    workContext: { title: demoScenario.title, genre: demoScenario.genre, tone: demoScenario.tone, world: demoScenario.world, style: demoScenario.style },
    sceneAnchor: { time: "12:20", location: "A205호 앞", summary: "은회색 파편을 발견했다.", status: [], inventory: [] },
    characters: demoScenario.npcs,
    drama: {
      eventName: "A205호의 부서진 문",
      currentBeat: { number: 1, total: 4, title: "첫 접촉", intent: "직원의 증언을 듣는다.", requiredSignals: "직원의 직접 답변" },
    },
    requiredEventReroute: {
      active: true,
      eventName: "A205호의 부서진 문",
      policy: "이탈 욕구를 보존하며 현재 비트에 합류한다.",
      destinationHint: "도서관",
      preservePlayerIntent: true,
      resolveCurrentEvent: false,
      currentBeatSignals: ["직원의 직접 답변"],
    },
    recentTurns: Array.from({ length: 12 }, (_, turn) => ({ turn, blocks: [{ type: "narration", text: "긴 장면 ".repeat(900) }] })),
    publicState: { variables: [], observableTraces: [], publicClocks: [], statusEntries: [], statusDefinitions: Array.from({ length: 100 }, () => ({ id: "unused" })) },
    runtimeExtensions: { relevantMediaAssets: Array.from({ length: 100 }, () => ({ id: "unused-media" })) },
  }, ORDINARY_LIVE_CONTEXT_BUDGET);
  const serialized = JSON.stringify(context);
  assert.ok(serialized.length <= ORDINARY_LIVE_CONTEXT_BUDGET);
  assert.doesNotMatch(serialized, /statusDefinitions|relevantMediaAssets/u);
  assert.match(serialized, /기록물만 챙기고/u);
  assert.match(serialized, /직원의 증언을 듣는다/u);
  assert.match(serialized, /recentEchoesToAvoid/u);
  assert.match(serialized, /canonRecovery/u);
  assert.match(serialized, /resolveCurrentEvent/u);
});

test("모든 작품의 화자 바인딩은 플레이어와 현장 화자만 남기고 언급뿐인 인물을 제외한다", () => {
  const publicContext = publicWriterContextFromScene({
    playerInputContract: {
      original: "교수와 도시 설계를 두고 열띤 토론을 한다.",
    },
    characters: [
      { id: "PLAYER_GENERIC", visibleName: "서윤", isPlayer: true },
      { id: "NPC_ABSENT", visibleName: "먼 도시의 보호자", isPlayer: false },
      { id: "NPC_PARTICIPANT", visibleName: "현장 연구원", isPlayer: false },
    ],
    activeEvent: {
      name: "공개 수업",
      participants: "NPC_PARTICIPANT",
      currentBeat: {
        number: 1,
        total: 2,
        title: "논증",
        content: "현장 연구원이 토론을 지켜보고 먼 도시의 보호자의 부재는 기록으로만 확인한다.",
        requiredSignals: "논거와 재반론",
      },
    },
    recentTurns: [{
      blocks: [{
        type: "narration",
        text: "먼 도시의 보호자를 떠올렸다.",
        speakerName: "",
      }],
    }],
  });
  const compact = liveWriterContextFromScene(publicContext, ORDINARY_LIVE_CONTEXT_BUDGET);
  const bindings = liveSpeakerBindingsFromContext(compact);
  assert.deepEqual(bindings.map((binding) => binding.visibleName), ["서윤", "현장 연구원"]);
  assert.equal(bindings.some((binding) => binding.visibleName === "먼 도시의 보호자"), false);
});

test("발화를 선언한 플레이어와 직접 지목한 상대는 작품과 무관하게 대사 화자가 될 수 있다", () => {
  const publicContext = publicWriterContextFromScene({
    playerInputContract: { original: "기록관 세림에게 오류의 근거를 묻고 반론한다." },
    characters: [
      { id: "P_ARCHIVE", visibleName: "도현", isPlayer: true },
      { id: "N_ARCHIVE", visibleName: "세림", isPlayer: false },
      { id: "N_REMOTE", visibleName: "유건", isPlayer: false },
    ],
    recentTurns: [],
  });
  const compact = liveWriterContextFromScene(publicContext, ORDINARY_LIVE_CONTEXT_BUDGET);
  assert.deepEqual(
    liveSpeakerBindingsFromContext(compact).map((binding) => binding.visibleName),
    ["도현", "세림"],
  );
});

test("기성학원 첫 비트의 실제 본문 요청은 품질 캡슐을 포함해도 1.5만 자 이하이다", async () => {
  const request = normalizeSimulateRequest({
    pack: demoScenario,
    state: createInitialState(demoScenario),
    userText: "은회색 파편을 살펴보고 레나에게 이것이 무엇인지 묻는다.",
    recentTurns: [],
  });
  const planned = await runLunaInternal(request, "sk-test-live-prompt", { phase: "plan" });
  assert.equal(isLivePlanEnvelope(planned), true);
  if (!isLivePlanEnvelope(planned)) return;
  const body = liveWriterRequestBody(planned, turnSchema as unknown as Record<string, unknown>);
  const promptChars = JSON.stringify(body.input ?? []).length;
  assert.ok(promptChars <= 15_000, `writer prompt was ${promptChars} chars`);
  const sidecarStaticPrompt = planned.sidecarStaticPrompt ?? planned.sidecarStaticPromptFactory?.() ?? "";
  assert.ok(planned.writerStaticPrompt.length < sidecarStaticPrompt.length * 0.6);
  assert.ok(JSON.stringify(planned.publicWriterContext).length < JSON.stringify(planned.publicSidecarContext).length);
  assert.ok(planned.speakerBindings?.some((speaker) => speaker.visibleName === "레나"));
  assert.match(JSON.stringify(planned.publicWriterContext), /currentBeat/u);
});

test("실패 턴의 계획형 재집필은 첫 비트도 모델 작업계획을 확정한 뒤 스트리밍한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return Response.json({
      output_text: JSON.stringify({
        scenePlan: "꺼진 휴대전화와 공부 의도를 보존하되 오후의 택배 알림이 인물의 주의를 끌어 현재 사건으로 자연스럽게 합류시킨다.",
        openingDirection: "휴대전화 전원을 끈 직접 결과와 도서관의 오후",
        endingDirection: "무인택배함 알림을 확인하고 즉시 대응할 지점",
        mustShow: ["무인택배함 알림 확인", "공부 의도의 보존"],
        mustAvoid: ["저녁 전환", "폐관 방송", "사건 조기 종결"],
        targetTime: "15:30",
        targetLocation: "대학교 도서관",
        beatAdvanced: true,
        eventResolved: false,
      }),
      usage: { input_tokens: 120, output_tokens: 80 },
    });
  }) as typeof fetch;

  try {
    const request = normalizeSimulateRequest({
      pack: demoScenario,
      state: createInitialState(demoScenario),
      userText: "무인택배함은 무시하고 휴대폰 전원을 종료한 채 저녁까지 공부한다.",
      generationMode: "planned_recovery",
      recoveryContext: {
        failedNarration: "저녁 안내 방송이 흐르고 열람실의 조명이 켜졌다.",
        failureReasons: ["현재 사건의 시간창을 넘긴 시간 이탈"],
      },
      recentTurns: [],
    });
    const planned = await runLunaInternal(request, "sk-test-live-planned-recovery", { phase: "plan" });
    assert.equal(isLivePlanEnvelope(planned), true);
    if (!isLivePlanEnvelope(planned)) return;
    const input = capturedBody?.input as Array<Record<string, unknown>>;
    const dynamicText = String(((input[1].content as Array<Record<string, unknown>>)[0]).text);
    assert.match(dynamicText, /v1\.7\.8_style_plan_first_retry/u);
    assert.match(dynamicText, /저녁 안내 방송/u);
    assert.match(planned.plan.scenePlan, /택배 알림/u);
    assert.match(planned.writerStaticPrompt, /계획형 재집필/u);
    assert.equal(planned.planUsage.stage, "scene_plan");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("보호명칭 꼬리 버퍼는 안전한 첫 토큰은 즉시 내고 비밀 접두부만 보류한다", () => {
  const safe = splitDisclosureSafePrefix("문이 열렸다", ["니콜라 테슬라"]);
  assert.equal(safe.release, "문이 열렸다");
  assert.equal(safe.pending, "");
  const prefix = splitDisclosureSafePrefix("그는 니콜라", ["니콜라 테슬라"]);
  assert.equal(prefix.release, "그는");
  assert.equal(prefix.pending, " 니콜라");
  const leaked = splitDisclosureSafePrefix("니콜라 테슬라", ["니콜라 테슬라"]);
  assert.equal(leaked.protectedTerm, "니콜라 테슬라");
  assert.equal(leaked.release, "");
});

test("마지막 비트 작가는 공개 가능한 종결 계약과 확장 분량을 직접 받는다", () => {
  const envelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "세이버가 한시우의 무지를 확인하고 감독관에게 인계할 필요를 설명한다.",
      openingDirection: "전투 직후 대화",
      endingDirection: "성당교회 감독관을 만나러 가자는 제안",
      mustShow: ["마술사 세계에 대한 한시우의 무지", "감독관에게 가자는 제안"],
      mustAvoid: ["다음 사건 시작"],
      targetTime: "23:58",
      targetLocation: "서촌 주택가",
      beatAdvanced: true,
      eventResolved: true,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: {
      phase: "final_closure" as const,
      beat: 2,
      totalBeats: 2,
      correctionLimit: 0 as const,
      preserveFailedDraft: true,
    },
    diagnosticContract: {
      ...diagnosticContract,
      requiredDialogue: ["아무것도 모른 채 불려온 모양이군. 그렇다면 먼저 이 싸움의 감독을 만나야 한다. 걸을 수 있겠나?"],
    },
    model: "gpt-5.6-luna",
    reasoningEffort: "none" as const,
    maxOutputTokens: 5200,
    promptCacheKey: "test-final-extended-writer",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  } satisfies LivePlanEnvelope;
  const body = liveWriterRequestBody(envelope, { type: "object" });
  const userMessage = (body.input as Array<Record<string, unknown>>)[1];
  const content = userMessage.content as Array<Record<string, unknown>>;
  const payload = JSON.parse(String(content[0]?.text ?? "{}"));
  const responseText = body.text as Record<string, unknown>;
  const format = responseText.format as Record<string, unknown>;
  const schema = format.schema as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown>;
  assert.equal(body.max_output_tokens, 5200);
  assert.deepEqual(payload.closure.requiredDialogue, envelope.diagnosticContract.requiredDialogue);
  assert.equal(payload.instruction, undefined);
  assert.ok(properties.b);
  assert.equal("narration" in properties, false);
});

test("simulation SSE frames preserve Unicode JSON payloads", () => {
  const source: SimulationStreamEvent = {
    event: "narration_commit",
    data: {
      blockIndex: 0,
      block: { id: "n1", type: "narration" },
      delta: "검증된 문장입니다.",
    },
  };
  assert.deepEqual(
    parseSimulationStreamFrame(encodeSimulationStreamEvent(source).trim()),
    source,
  );
});

test("sentence-gated commits rebuild the exact validated blocks", () => {
  let rebuilt: StoryBlock[] = [];
  const commits = createNarrationCommitEvents(blocks);
  assert.ok(commits.length >= 3);
  for (const event of commits) {
    const wireEvent = parseSimulationStreamFrame(
      encodeSimulationStreamEvent(event).trim(),
    );
    assert.equal(wireEvent?.event, "narration_commit");
    if (wireEvent?.event === "narration_commit") {
      rebuilt = appendNarrationCommit(rebuilt, wireEvent);
    }
  }
  assert.deepEqual(rebuilt, blocks);
  assert.notEqual(
    JSON.stringify(rebuilt),
    JSON.stringify(blocks),
    "재조립 블록은 같은 내용이어도 속성 삽입 순서가 다를 수 있어야 한다",
  );
  assert.equal(validatedStoryBlocksMatch(rebuilt, blocks), true);
});

test("semantic block validation still rejects an actual text mismatch", () => {
  assert.equal(
    validatedStoryBlocksMatch(
      [{ id: "n1", type: "narration", text: "문이 열렸다." }],
      [{ id: "n1", type: "narration", text: "문이 닫혔다." }],
    ),
    false,
  );
});

test("typewriter reveal starts with a partial first line and ends exactly", async () => {
  const commit = createNarrationCommitEvents([
    { id: "n1", type: "narration", text: "첫 줄부터 타자처럼 표시된다." },
  ])[0];
  assert.equal(commit?.event, "narration_commit");
  if (!commit || commit.event !== "narration_commit") return;

  const frames: StoryBlock[][] = [];
  const revealed = await revealNarrationCommit(
    [],
    commit,
    (frame) => frames.push(frame),
    { frameMs: 0 },
  );
  assert.ok(frames.length > 1);
  assert.equal(frames[0]?.[0]?.text, "첫");
  assert.equal(revealed[0]?.text, commit.data.delta);
  assert.equal(typewriterDurationMs(1), 900);
  assert.equal(typewriterDurationMs(10_000), 2_800);
  assert.ok(typewriterGraphemesPerFrame(1_000) > 1);
});

test("narration rewind removes only prose after the approved grapheme edge", () => {
  const source: StoryBlock[] = [{
    id: "live-narration",
    type: "narration",
    text: "첫 문장은 남는다. 교정할 문장은 사라진다.",
  }];
  const edge = [..."첫 문장은 남는다. "].length;
  assert.deepEqual(rewindNarrationBlocks(source, edge), [{
    id: "live-narration",
    type: "narration",
    text: "첫 문장은 남는다. ",
  }]);
  assert.throws(() => rewindNarrationBlocks(source, 10_000), /초과/u);
});

test("SSE consumer waits for asynchronous typewriter frames in order", async () => {
  const source = [
    encodeSimulationStreamEvent({
      event: "turn_ack",
      data: { phase: "generating", message: "시작" },
    }),
    encodeSimulationStreamEvent({
      event: "done",
      data: { validated: true, memoryApplied: true },
    }),
  ].join("");
  const order: string[] = [];
  await consumeSimulationStream(new Response(source), async (event) => {
    if (event.event === "turn_ack") {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      order.push("ack-finished");
    } else {
      order.push(event.event);
    }
  });
  assert.deepEqual(order, ["ack-finished", "done"]);
});

test("live JSON parser exposes only complete sentence gates", () => {
  const first = extractPartialJsonStringField(
    '{"narration":"첫 문장이 완성됐다. 두 번째',
    "narration",
  );
  assert.equal(first.value, "첫 문장이 완성됐다. 두 번째");
  assert.equal(first.complete, false);
  const drained = drainCompletedNarration(first.value);
  assert.deepEqual(drained.commits, ["첫 문장이 완성됐다."]);
  assert.equal(drained.rest, " 두 번째");

  const completed = extractPartialJsonStringField(
    '{"narration":"첫 문장.\\n둘째 문장."}',
    "narration",
  );
  assert.equal(completed.complete, true);
  assert.equal(completed.value, "첫 문장.\n둘째 문장.");
});

test("live writer context excludes closure secrets but preserves a public Drama Capsule", () => {
  const publicContext = publicWriterContextFromScene({
    sceneAnchor: { location: "교실" },
    activeEvent: {
      name: "부서진 문",
      description: "사건 전체 결말",
      requiredItems: "비밀 열쇠",
      requiredDialogue: "비밀 대사",
      completionSignals: "비밀 종결",
      recoveryAlternatives: "비밀 복구",
      currentBeat: {
        number: 2,
        total: 4,
        title: "직원의 증언",
        content: "직원이 실제로 본 범위를 확인한다.",
        requiredSignals: "직접 답변",
      },
    },
    disclosure: { protectedTerms: ["진명"] },
  });
  const serialized = JSON.stringify(publicContext);
  assert.match(serialized, /부서진 문|직원의 증언|실제로 본 범위/u);
  assert.doesNotMatch(serialized, /requiredItems|비밀 열쇠|비밀 대사|비밀 종결|비밀 복구|사건 전체 결말/u);
  assert.doesNotMatch(serialized, /activeEvent|disclosure|protectedTerms/u);
});

test("live narration validation accepts the one streamed narration projection", () => {
  assert.equal(
    validatedLiveNarrationMatches(
      [{ id: "live-narration", type: "narration", text: "완성된 장면이다." }],
      "완성된 장면이다.",
    ),
    true,
  );
  assert.equal(
    validatedLiveNarrationMatches(
      [{ id: "live-narration", type: "narration", text: "다른 장면이다." }],
      "완성된 장면이다.",
    ),
    false,
  );
});

test("live finalization preserves the exact accepted stream instead of reserializing dialogue blocks", () => {
  const accepted = "문이 열렸다. “기다렸어.” 그녀가 안으로 들어왔다.";
  const projected = "문이 열렸다.\n\n“기다렸어.”\n\n그녀가 안으로 들어왔다.";
  const finalized = finalResponseNarration(true, accepted, projected);

  assert.equal(finalized, accepted);
  assert.equal(
    validatedLiveNarrationMatches(
      [{ id: "live-narration", type: "narration", text: accepted }],
      finalized,
    ),
    true,
  );
  assert.equal(finalResponseNarration(false, accepted, projected), projected);
  assert.equal(finalResponseNarration(true, "", projected), projected);
});

test("live narration integrity ignores only transport newline differences", () => {
  assert.equal(
    validatedLiveNarrationMatches(
      [{ id: "live-narration", type: "narration", text: "첫 문장.\n둘째 문장." }],
      "첫 문장.\r\n둘째 문장.",
    ),
    true,
  );
  assert.equal(
    validatedLiveNarrationMatches(
      [{ id: "live-narration", type: "narration", text: "첫 문장.\n둘째 문장." }],
      "첫 문장.\n바뀐 문장.",
    ),
    false,
  );
});

test("live dialogue uses stable block IDs and hydrates speaker metadata without replacing prose", () => {
  const first = "문이 열렸다. “기다렸어.”";
  const completed = `${first} 그녀가 안으로 들어왔다.`;
  const provisional = projectStableLiveBlocks({
    narration: first,
    turnId: "turn-77",
  });
  const appended = projectStableLiveBlocks({
    narration: completed,
    turnId: "turn-77",
  });
  const hydrated = projectStableLiveBlocks({
    narration: completed,
    turnId: "turn-77",
    dialogueAnnotations: [{
      quote: "기다렸어.",
      speakerId: "NPC_RENA",
      speakerName: "레나",
      emotion: "안도",
    }],
    validatedBlocks: [
      { id: "server-n1", type: "narration", text: "문이 열렸다." },
      {
        id: "server-d1",
        type: "dialogue",
        text: "기다렸어.",
        speakerId: "NPC_RENA",
        speakerName: "레나",
        emotion: "안도",
      },
      { id: "server-n2", type: "narration", text: "그녀가 안으로 들어왔다." },
    ],
  });

  assert.deepEqual(provisional.map((block) => block.type), ["narration", "dialogue"]);
  assert.equal(provisional[1]?.speakerName, "");
  assert.deepEqual(
    appended.slice(0, 2).map((block) => block.id),
    provisional.map((block) => block.id),
  );
  assert.deepEqual(
    hydrated.map((block) => block.id),
    appended.map((block) => block.id),
  );
  assert.equal(hydrated[1]?.speakerName, "레나");
  assert.equal(hydrated[1]?.emotion, "안도");
  assert.equal(hydrated.map((block) => block.text).join(" "),
    "문이 열렸다. 기다렸어. 그녀가 안으로 들어왔다.");

  const typingDialogue = projectStableLiveBlocks({
    narration: "문이 열렸다. “기다",
    turnId: "turn-77",
  });
  assert.deepEqual(typingDialogue.map((block) => block.type), [
    "narration",
    "dialogue",
  ]);
  assert.equal(typingDialogue[1]?.text, "기다");

  const finalizedWithoutAnnotation = projectStableLiveBlocks({
    narration: first,
    validatedBlocks: [{ id: "server-n1", type: "narration", text: first }],
    turnId: "turn-77",
    inferDialogue: false,
  });
  assert.deepEqual(finalizedWithoutAnnotation.map((block) => block.type), [
    "narration",
  ]);
});

test("live story auto-follow stops as soon as the reader scrolls away from the bottom", () => {
  assert.equal(liveScrollerShouldFollow({
    scrollHeight: 2_000,
    clientHeight: 800,
    scrollTop: 1_100,
  }), true);
  assert.equal(liveScrollerShouldFollow({
    scrollHeight: 2_000,
    clientHeight: 800,
    scrollTop: 900,
  }), false);
});

test("문단 교정기는 검증 판정문을 소설 본문으로 통과시키지 않는다", () => {
  assert.match(
    correctionProseViolationReason(
      "그러나 현재 시각에서 그 시간이 이미 지나거나 이동이 끝난 것은 아니었다. 그는 지금 가능한 행동부터 이어 갔다.",
    ) ?? "",
    /메타 문체/u,
  );
  assert.match(
    correctionProseViolationReason(
      "꺼진 화면을 밀어 둔 순간, 열람실 문밖에서 젖은 구두가 멈춰 섰다.",
    ) ?? "",
    /^$/u,
  );
});

test("저녁 이탈 문단의 작가 교정이 실패해도 현재 사건에 합류한 서사로 턴을 살린다", async () => {
  const narration = [
    "한시우가 한명진의 휴대전화 전원을 끄자 검은 화면에 창가의 밝은 하늘만 비쳤다.",
    "도서관 안의 오후는 낮은 소리로 흘렀다. 한시우는 도시공학 자료와 노트 사이에서 보행 흐름을 정리했다.",
    "해가 기울 무렵, 도서관의 빈자리가 조금씩 늘었다. 안내 방송이 폐관 시간을 알리기 전까지 학생들이 가방을 챙겼다. 노트 한쪽에는 시간별 관찰값이 남았다.",
    "같은 시각, 윤재민은 3번 계단을 따라 옥상으로 올라가 안테나 연결부를 확인했다. 케이블 덮개를 닫은 뒤 캠퍼스의 저녁 안내 방송이 낮게 번졌다.",
    "교내 무인택배함 안의 물품은 수령되지 않은 채 남아 있었다. 창가의 빛이 노트 위에서 빠져나가고 책상 스탠드와 천장등이 차례로 켜졌다. 공부를 마무리할 시간은 아직 남아 있었다.",
  ].join("\n\n");
  const canonAnchorGuard = {
    active: true,
    currentTime: "15:27",
    currentLocation: "대학교 도서관",
    eventTimeWindow: "15:30~18:00",
    eventLocation: "교내 무인택배함",
    longSpan: true,
    restrictLocation: false,
    highRiskTravel: false,
    destinationHint: "",
    requestedEndTime: "19:00",
    requestedMinimumMinutes: 213,
    strictEventTime: true,
    canonAbsorptionRequired: true,
    eventName: "첫 번째 택배",
    currentBeatSignals: ["무인택배함 알림 확인"],
  };
  const envelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "휴대전화 전원을 끈 직접 결과 뒤 현재 오후의 택배 사건이 끼어든다.",
      openingDirection: "꺼진 휴대전화의 직접 결과",
      endingDirection: "무인택배함 알림을 확인한 즉시 반응",
      mustShow: ["무인택배함 알림 확인"],
      mustAvoid: ["저녁 전환", "사건 조기 종결"],
      targetTime: "15:30",
      targetLocation: "대학교 도서관",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "현재 오후의 인과만 장르소설 문체로 쓴다.",
    protectedTerms: [],
    beatPolicy: firstBeatPolicy,
    diagnosticContract: {
      ...diagnosticContract,
      eventName: "첫 번째 택배",
      timeWindow: "15:30~18:00",
      currentTime: "15:27",
      currentLocation: "대학교 도서관",
      currentBeatSignals: ["무인택배함 알림 확인"],
    },
    canonAnchorGuard,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1800,
    promptCacheKey: "test-chronology-rescue",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  } satisfies LivePlanEnvelope;

  const correction = await requestProtectedParagraphCorrection({
    fetcher: async () => new Response("writer unavailable", { status: 503 }),
    apiKey: "sk-test-live",
    envelope,
    narration,
    guardKind: "chronology",
  });

  assert.equal(correction.fallbackApplied, true);
  assert.deepEqual(correction.correctedIndexes, [2, 3, 4]);
  assert.match(correction.narration, /도서관 안의 오후/u);
  assert.doesNotMatch(correction.narration, /윤재민은 3번 계단/u);
  assert.match(correction.narration, /무인택배함\s*알림을\s*확인/u);
  assert.doesNotMatch(correction.narration, /해가 기울|폐관 시간|저녁 안내 방송|천장등이 차례로 켜/u);
  assert.equal(liveCanonAnchorDriftReason(correction.narration, canonAnchorGuard), undefined);
});

test("live story scrolls exactly once when the first visible block arrives", () => {
  assert.equal(shouldStartInitialStreamScroll({
    alreadyScheduled: false,
    visibleBlockCount: 0,
  }), false);
  assert.equal(shouldStartInitialStreamScroll({
    alreadyScheduled: false,
    visibleBlockCount: 1,
  }), true);
  assert.equal(shouldStartInitialStreamScroll({
    alreadyScheduled: true,
    visibleBlockCount: 2,
  }), false);
});

test("prose-first schema excludes sidecars and the follow-up schema excludes prose", () => {
  const envelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현재 장면의 반응을 쓴다.",
      openingDirection: "즉시 반응",
      endingDirection: "다음 선택",
      mustShow: ["반응"],
      mustAvoid: [],
      targetTime: "12:30",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    splitSidecar: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "none" as const,
    maxOutputTokens: 1000,
    promptCacheKey: "test-prose-first-schema",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  } satisfies LivePlanEnvelope;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      narration: { type: "string" },
      dialogueAnnotations: { type: "array" },
      statePatch: { type: "object" },
    },
    required: ["narration", "dialogueAnnotations", "statePatch"],
  };
  const writerBody = liveWriterRequestBody(envelope, schema);
  const writerFormat = (writerBody.text as Record<string, unknown>).format as Record<string, unknown>;
  const writerSchema = writerFormat.schema as Record<string, unknown>;
  assert.deepEqual(writerSchema.required, ["b"]);
  assert.deepEqual(Object.keys(writerSchema.properties as Record<string, unknown>), ["b"]);

  const sidecarBody = liveSidecarRequestBody(envelope, schema, "문이 열렸다.", []);
  const sidecarFormat = (sidecarBody.text as Record<string, unknown>).format as Record<string, unknown>;
  const sidecarSchema = sidecarFormat.schema as Record<string, unknown>;
  assert.deepEqual(sidecarSchema.required, ["statePatch"]);
  assert.deepEqual(Object.keys(sidecarSchema.properties as Record<string, unknown>), ["statePatch"]);
  assert.equal(sidecarBody.stream, false);
});

test("actual Luna output deltas publish narration before the final sidecar", async () => {
  const liveNarration = "첫 문장이 도착했다. 이어서 두 번째 문장이 적혔다.";
  const authoredTurn = JSON.stringify({ narration: liveNarration });
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현재 장면을 이어 두 문장으로 변화와 대응 지점을 만든다.",
      openingDirection: "현재 행동의 직접 결과",
      endingDirection: "다음 대응 지점",
      mustShow: ["현재 행동의 결과"],
      mustAvoid: ["공개 전 정보"],
      targetTime: "12:30",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: ["비공개진명"],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-plan",
    planUsage: {
      call: 1,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 4,
      repairScope: "none",
      inputTokens: 10,
      uncachedInputTokens: 10,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 5,
      estimatedCostUsd: 0,
    },
  };
  const finalized = {
    ...result,
    narration: liveNarration,
    blocks: [{ id: "n-final", type: "narration", text: liveNarration }],
  } as EngineTurnResponse;
  const engine = async (
    _request: unknown,
    _key: string | undefined,
    runtime: { phase: "plan" | "finalize" },
  ) => runtime.phase === "plan" ? planEnvelope : finalized;
  const frames = [
    `event: response.output_text.delta\ndata: ${JSON.stringify({
      type: "response.output_text.delta",
      delta: authoredTurn.slice(0, 28),
    })}\n\n`,
    `event: response.output_text.delta\ndata: ${JSON.stringify({
      type: "response.output_text.delta",
      delta: authoredTurn.slice(28),
    })}\n\n`,
    `event: response.completed\ndata: ${JSON.stringify({
      type: "response.completed",
      response: { usage: { input_tokens: 20, output_tokens: 10 } },
    })}\n\n`,
  ].join("");
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    engine as never,
    async () => new Response(frames, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  const narrationIndex = events.findIndex((event) => event.event === "narration_commit");
  const sidecarIndex = events.findIndex((event) => event.event === "turn_sidecar");
  assert.ok(narrationIndex >= 0);
  assert.ok(sidecarIndex > narrationIndex);
  assert.deepEqual(
    events.filter((event) => event.event === "turn_ack").map((event) =>
      event.event === "turn_ack" ? event.data.phase : ""
    ),
    ["planning", "writing"],
  );
});

test("비트 1도 다음 사건 선행 진행 문단만 되감아 현재 사건 안에서 교정한다", async () => {
  const narration = "현관에서 대화를 마쳤다. 성당 도착 뒤 새 심문이 시작됐다.";
  const correctedNarration = "현관에서 대화를 마쳤다. 그는 감독관을 만나러 가자는 제안만 남기고 답을 기다렸다.";
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현관의 현재 사건만 이어 간다.",
      openingDirection: "현재 대화의 결과",
      endingDirection: "감독관을 만나러 가자는 제안",
      mustShow: ["현재 사건의 인계 제안"],
      mustAvoid: ["다음 사건 시작"],
      targetTime: "23:50",
      targetLocation: "현관",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "현재 사건만 쓴다.",
    protectedTerms: [],
    futureProgressionTerms: ["성당 도착 뒤 새 심문이 시작됐다"],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-future-event-rewind",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  };
  let fetchCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      const corrected = String(runtime.turn.narration ?? "");
      return {
        ...result,
        narration: corrected,
        blocks: [{ id: "future-corrected", type: "narration", text: corrected }],
      } as EngineTurnResponse;
    },
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify({ narration }),
          })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return Response.json({
        output_text: JSON.stringify({
          paragraphs: [{ index: 0, text: correctedNarration }],
        }),
        usage: { input_tokens: 20, output_tokens: 10 },
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  const rewind = events.find((event) => event.event === "narration_rewind");
  assert.equal(rewind?.event, "narration_rewind");
  if (rewind?.event === "narration_rewind") assert.match(rewind.data.reason, /다음 사건/u);
  let visible: StoryBlock[] = [];
  for (const event of events) {
    if (event.event === "narration_commit") visible = appendNarrationCommit(visible, event);
    if (event.event === "narration_rewind") visible = rewindNarrationBlocks(visible, event.data.toGrapheme);
  }
  assert.equal(visible[0]?.text, correctedNarration);
  assert.equal(events.some((event) => event.event === "turn_abort"), false);
  assert.ok(events.some((event) => event.event === "done"));
});

test("다음 사건 문단 교정 호출이 실패해도 안전 문장 폴백으로 현재 턴을 살린다", async () => {
  const narration = "현관에서 대화를 마쳤다. 성당 도착 뒤 새 심문이 시작됐다.";
  const fallbackNarration = "현관에서 대화를 마쳤다.";
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현관의 현재 사건만 이어 간다.",
      openingDirection: "현재 대화의 결과",
      endingDirection: "현재 사건의 인계 제안",
      mustShow: ["현재 사건의 결과"],
      mustAvoid: ["다음 사건 시작"],
      targetTime: "23:50",
      targetLocation: "현관",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "현재 사건만 쓴다.",
    protectedTerms: [],
    futureProgressionTerms: ["성당 도착 뒤 새 심문이 시작됐다"],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-future-event-fallback",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  };
  let fetchCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      assert.equal(runtime.turn.narration, fallbackNarration);
      return {
        ...result,
        narration: fallbackNarration,
        blocks: [{ id: "future-fallback", type: "narration", text: fallbackNarration }],
      } as EngineTurnResponse;
    },
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify({ narration }),
          })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return new Response("correction unavailable", { status: 503 });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  let visible: StoryBlock[] = [];
  for (const event of events) {
    if (event.event === "narration_commit") visible = appendNarrationCommit(visible, event);
    if (event.event === "narration_rewind") {
      visible = rewindNarrationBlocks(visible, event.data.toGrapheme);
    }
  }
  assert.equal(fetchCalls, 2);
  assert.equal(visible[0]?.text, fallbackNarration);
  assert.equal(events.some((event) => event.event === "turn_abort"), false);
  const sidecar = events.find((event) => event.event === "turn_sidecar");
  assert.equal(sidecar?.event, "turn_sidecar");
  if (sidecar?.event === "turn_sidecar") {
    assert.equal(sidecar.data.result.usage?.liveReliability?.discarded, false);
    assert.equal(sidecar.data.result.usage?.liveReliability?.rewindCount, 1);
  }
  assert.ok(events.some((event) => event.event === "done"));
});

test("prose-first runtime streams body before requesting and merging the sidecar", async () => {
  const narration = "첫 글자가 바로 나타났다.";
  const rawTurn = JSON.stringify({
    b: [{
      k: "n",
      s: "",
      c: "+0 12:21",
      t: narration,
      n: "",
      e: "",
    }],
  });
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "문이 열린 직후의 반응을 쓴다.",
      openingDirection: "문의 변화",
      endingDirection: "다음 선택",
      mustShow: ["문의 변화"],
      mustAvoid: [],
      targetTime: "12:30",
      targetLocation: "복도",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    splitSidecar: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1200,
    promptCacheKey: "test-split-sidecar",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  };
  let fetchCalls = 0;
  let finalizeCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      finalizeCalls += 1;
      assert.equal(runtime.turn.narration, narration);
      assert.deepEqual(runtime.turn.statePatch, {
        location: "복도",
        time: "12:21",
        dayDelta: 0,
      });
      assert.deepEqual(runtime.turn.writerSceneClock, { time: "12:21", dayDelta: 0 });
      return {
        ...result,
        narration,
        blocks: [{ id: "n-final", type: "narration", text: narration }],
        statePatch: runtime.turn.statePatch,
      } as EngineTurnResponse;
    },
    async (_url, init) => {
      fetchCalls += 1;
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (fetchCalls === 1) {
        assert.equal(requestBody.stream, true);
        const format = (requestBody.text as Record<string, unknown>).format as Record<string, unknown>;
        const schema = format.schema as Record<string, unknown>;
        assert.deepEqual(Object.keys(schema.properties as Record<string, unknown>), ["b"]);
        return new Response([
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: rawTurn,
          })}\n\n`,
          `data: ${JSON.stringify({
            type: "response.completed",
            response: { usage: { input_tokens: 10, output_tokens: 5 } },
          })}\n\n`,
        ].join(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      assert.equal(requestBody.stream, false);
      assert.equal(finalizeCalls, 0);
      const messages = requestBody.input as Array<Record<string, unknown>>;
      const content = messages[1]?.content as Array<Record<string, unknown>>;
      assert.match(String(content[0]?.text ?? ""), /writerTimeMarks/u);
      assert.match(String(content[0]?.text ?? ""), /12:21/u);
      return Response.json({
        output_text: JSON.stringify({ statePatch: { location: "복도" } }),
        usage: { input_tokens: 12, output_tokens: 4 },
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  assert.equal(fetchCalls, 2);
  assert.equal(finalizeCalls, 1);
  assert.ok(events.findIndex((event) => event.event === "narration_commit") <
    events.findIndex((event) => event.event === "turn_sidecar"));
  const sidecar = events.find((event) => event.event === "turn_sidecar");
  assert.equal(sidecar?.event, "turn_sidecar");
  if (sidecar?.event === "turn_sidecar") {
    assert.equal(sidecar.data.result.usage?.liveReliability?.sidecarSplit, true);
    assert.ok((sidecar.data.result.usage?.liveReliability?.writerSchemaChars ?? 0) > 0);
  }
});

test("v33 compact blocks stream the first grapheme and speaker card before final validation", async () => {
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현재 문 앞의 반응과 공개된 검사의 답변을 쓴다.",
      openingDirection: "문이 열리는 직접 결과",
      endingDirection: "다음 선택 지점",
      mustShow: ["문의 변화", "검사의 답변"],
      mustAvoid: ["공개 전 정체"],
      targetTime: "12:30",
      targetLocation: "복도",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    speakerBindings: [{
      streamId: "VISIBLE_SPEAKER_1",
      characterId: "CHAR_HONGJAE",
      visibleName: "소녀 검사",
    }],
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-v33",
    planUsage: {} as LivePlanEnvelope["planUsage"],
  };
  const rawTurn = JSON.stringify({
    b: [
      {
        k: "n",
        s: "",
        c: "+0 12:21",
        t: "문이 열렸다.",
        n: "",
        e: "",
      },
      {
        k: "d",
        s: "VISIBLE_SPEAKER_1",
        c: "+0 12:22",
        t: "여기서 기다려요.",
        n: "",
        e: "침착",
      },
    ],
  });
  const splitAt = rawTurn.indexOf("문이") + 1;
  const canonicalNarration = "문이 열렸다.\n\n“여기서 기다려요.”";
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      assert.equal(runtime.turn.narration, canonicalNarration);
      assert.deepEqual(runtime.turn.dialogueAnnotations, [{
        quote: "여기서 기다려요.",
        speakerId: "CHAR_HONGJAE",
        speakerName: "소녀 검사",
        emotion: "침착",
      }]);
      return {
        ...result,
        narration: canonicalNarration,
        dialogueAnnotations: runtime.turn.dialogueAnnotations as never,
        blocks: [
          { id: "n-final", type: "narration", text: "문이 열렸다." },
          {
            id: "d-final",
            type: "dialogue",
            text: "여기서 기다려요.",
            speakerId: "CHAR_HONGJAE",
            speakerName: "소녀 검사",
            emotion: "침착",
          },
        ],
      } as EngineTurnResponse;
    },
    async () => new Response([
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: rawTurn.slice(0, splitAt),
      })}\n\n`,
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: rawTurn.slice(splitAt),
      })}\n\n`,
      `data: ${JSON.stringify({
        type: "response.completed",
        response: { usage: { input_tokens: 20, output_tokens: 10 } },
      })}\n\n`,
    ].join(""), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  const commits = events.filter((event) => event.event === "narration_commit");
  assert.equal(commits[0]?.event, "narration_commit");
  if (commits[0]?.event === "narration_commit") {
    assert.equal(commits[0].data.delta, "문");
    assert.equal(commits[0].data.block?.type, "narration");
  }
  const dialogueCommit = commits.find((event) =>
    event.event === "narration_commit" && event.data.blockIndex === 1
  );
  assert.equal(dialogueCommit?.event, "narration_commit");
  if (dialogueCommit?.event === "narration_commit") {
    assert.equal(dialogueCommit.data.block?.speakerId, "CHAR_HONGJAE");
    assert.equal(dialogueCommit.data.block?.speakerName, "소녀 검사");
  }
  let streamed: StoryBlock[] = [];
  for (const event of commits) {
    if (event.event === "narration_commit") streamed = appendNarrationCommit(streamed, event);
  }
  assert.equal(isDirectLiveBlockStream(streamed), true);
  assert.equal(validatedLiveProjectionMatches(streamed, canonicalNarration), true);
  const hydrated = hydrateValidatedLiveBlocks({
    streamed,
    validated: [
      { id: "n-final", type: "narration", text: "문이 열렸다." },
      {
        id: "d-final",
        type: "dialogue",
        text: "여기서 기다려요.",
        speakerId: "CHAR_HONGJAE",
        speakerName: "소녀 검사",
      },
    ],
    turnId: "turn-9",
  });
  assert.equal(hydrated[1]?.id, "turn-9-live-dialogue-1");
  assert.equal(events.at(-2)?.event, "turn_sidecar");
  assert.equal(events.at(-1)?.event, "done");
});

test("첫 비트의 비공개 누설은 해당 문단만 되감아 작가 교정본으로 완주한다", async () => {
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "공개된 현재 장면의 반응만 두 문장으로 쓴다.",
      openingDirection: "현재 반응",
      endingDirection: "안전한 대응 지점",
      mustShow: ["현재 반응"],
      mustAvoid: ["공개 전 정보"],
      targetTime: "12:30",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: ["비공개진명"],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-leak",
    planUsage: {
      call: 1,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 1,
      repairScope: "none",
      inputTokens: 1,
      uncachedInputTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 0,
    },
  };
  const narration = "첫 문단은 안전하다.\n\n두 번째 문단에 비공개진명이 나온다.";
  const correctedNarration = "첫 문단은 안전하다.\n\n두 번째 문단에는 정체를 알 수 없는 검사가 나온다.";
  const authoredTurn = JSON.stringify({ narration });
  let fetchCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      assert.equal(runtime.turn.narration, correctedNarration);
      return {
        ...result,
        blocks: [{ id: "live-narration", type: "narration", text: correctedNarration }],
      } as EngineTurnResponse;
    },
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: authoredTurn,
          })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return Response.json({
        output_text: JSON.stringify({
          paragraphs: [{
            index: 1,
            text: "두 번째 문단에는 정체를 알 수 없는 검사가 나온다.",
          }],
        }),
        usage: { input_tokens: 20, output_tokens: 10 },
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  let visible: StoryBlock[] = [];
  for (const event of events) {
    if (event.event === "narration_commit") visible = appendNarrationCommit(visible, event);
    if (event.event === "narration_rewind") {
      visible = rewindNarrationBlocks(visible, event.data.toGrapheme);
    }
  }
  assert.equal(fetchCalls, 2);
  assert.equal(visible[0]?.text, correctedNarration);
  assert.equal(visible[0]?.text.includes("비공개진명"), false);
  assert.ok(events.some((event) => event.event === "narration_rewind"));
  assert.equal(events.some((event) => event.event === "turn_abort"), false);
  const sidecar = events.find((event) => event.event === "turn_sidecar");
  assert.equal(sidecar?.event, "turn_sidecar");
  if (sidecar?.event === "turn_sidecar") {
    assert.equal(sidecar.data.result.usage?.liveReliability?.discarded, false);
    assert.equal(sidecar.data.result.usage?.liveReliability?.rewindCount, 1);
    assert.equal(sidecar.data.result.usage?.liveReliability?.correctionPasses, 1);
  }
  assert.ok(events.some((event) => event.event === "done"));
});

test("장면 계획의 비공개 정보 폐기도 원문과 정확한 보호 명칭을 진단으로 보존한다", async () => {
  const failedPlan = JSON.stringify({
    scenePlan: "아처의 진명이 니콜라 테슬라임을 계획에 적는다.",
    mustAvoid: ["독자에게는 아직 공개하지 않는다"],
  }, null, 2);
  const diagnostic = {
    code: "NARRATIVE_REWRITE_FAILED",
    summary: "장면 계획에 비공개 정보가 포함되어 이번 턴을 시작하지 않았습니다.",
    reasons: ["장면 계획에서 공개 전 보호 정보 ‘니콜라 테슬라’가 감지되었습니다."],
    narration: failedPlan,
    draftKind: "scene_plan" as const,
    beat: 2,
    totalBeats: 4,
    phase: "closure_build_up" as const,
    correctionApplied: false,
  };
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async () => {
      throw Object.assign(new Error(diagnostic.summary), {
        code: diagnostic.code,
        diagnostic,
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  const failure = events.find((event) => event.event === "error");
  assert.equal(failure?.event, "error");
  if (failure?.event === "error") {
    assert.equal(failure.data.diagnostic?.draftKind, "scene_plan");
    assert.equal(failure.data.diagnostic?.narration, failedPlan);
    assert.deepEqual(failure.data.diagnostic?.reasons, diagnostic.reasons);
    assert.equal(failure.data.diagnostic?.reliability?.discardReason, "protected_term");
    assert.equal(failure.data.diagnostic?.reliability?.discarded, true);
  }
  assert.equal(events.some((event) => event.event === "narration_commit"), false);
  assert.equal(events.some((event) => event.event === "turn_sidecar"), false);
});

test("중간 비트도 비공개 누설 문단 교정과 종결 빌드업 검사를 각각 한 번 수행한다", async () => {
  const narration = "첫 문장은 안전하다. 비공개진명이 문 앞에 섰다.";
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현재 선택의 결과를 보존하면서 마지막 종결의 원인을 쌓는다.",
      openingDirection: "현재 행동의 직접 결과",
      endingDirection: "종결을 위한 단서",
      mustShow: ["종결 빌드업"],
      mustAvoid: ["공개 전 정체"],
      targetTime: "12:30",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: ["비공개진명"],
    beatPolicy: {
      phase: "closure_build_up",
      beat: 2,
      totalBeats: 4,
      correctionLimit: 1,
      preserveFailedDraft: false,
    },
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-correction",
    planUsage: {
      call: 1,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 1,
      repairScope: "none",
      inputTokens: 1,
      uncachedInputTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 0,
    },
  };
  const correctedNarration = "첫 문장은 안전하다. 정체불명의 검사가 문 앞에 섰다.";
  let fetchCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      const corrected = String(runtime.turn.narration ?? "");
      return {
        ...result,
        narration: corrected,
        blocks: [{ id: "n-corrected", type: "narration", text: corrected }],
      } as EngineTurnResponse;
    },
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify({ narration }),
          })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      if (fetchCalls === 2) {
        return Response.json({
          output_text: JSON.stringify({
            paragraphs: [{ index: 0, text: correctedNarration }],
          }),
          usage: { input_tokens: 20, output_tokens: 10 },
        });
      }
      return Response.json({
        output_text: JSON.stringify({
          adequate: true,
          reason: "종결을 위한 인물 배치가 이미 성립함",
          replacementSentence: "",
        }),
        usage: { input_tokens: 20, output_tokens: 10 },
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  const protectedRewind = events.find((event) => event.event === "narration_rewind");
  assert.equal(protectedRewind?.event, "narration_rewind");
  if (protectedRewind?.event === "narration_rewind") {
    assert.equal(protectedRewind.data.toGrapheme, 0);
  }
  let visible: StoryBlock[] = [];
  for (const event of events) {
    if (event.event === "narration_commit") visible = appendNarrationCommit(visible, event);
    if (event.event === "narration_rewind") {
      visible = rewindNarrationBlocks(visible, event.data.toGrapheme);
    }
  }
  assert.equal(visible[0]?.text.includes("비공개진명"), false);
  assert.equal(visible[0]?.text, correctedNarration);
  assert.equal(fetchCalls, 3);
  assert.ok(events.some((event) => event.event === "narration_rewind"));
  assert.equal(events.some((event) => event.event === "turn_abort"), false);
  assert.ok(events.some((event) => event.event === "done"));
});

test("중간 비트 의미 교정은 마지막 문장만 되감아 종결 빌드업 문장으로 교체한다", async () => {
  const narration = "복도 끝에서 경보음이 멎었다. 그는 닫힌 문을 한 번 바라봤다.";
  const replacement = "그가 확인한 문틈의 긁힌 자국은 다음 선택을 더는 미룰 수 없게 만들었다.";
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "현재 선택의 결과에서 마지막 비트 종결을 위한 단서를 하나 쌓는다.",
      openingDirection: "경보음이 멎은 직접 결과",
      endingDirection: "문에 남은 단서",
      mustShow: ["다음 선택을 압박하는 단서"],
      mustAvoid: ["사건 조기 종결"],
      targetTime: "12:30",
      targetLocation: "복도",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: {
      phase: "closure_build_up",
      beat: 2,
      totalBeats: 4,
      correctionLimit: 1,
      preserveFailedDraft: false,
    },
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-semantic-rewind",
    planUsage: {
      call: 1,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 1,
      repairScope: "none",
      inputTokens: 1,
      uncachedInputTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 0,
    },
  };
  const authoredTurn = { narration, statePatch: {}, claudeSignals: { eventResolved: false } };
  let fetchCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      const corrected = String(runtime.turn.narration ?? "");
      return {
        ...result,
        narration: corrected,
        blocks: [{ id: "live-narration", type: "narration", text: corrected }],
      } as EngineTurnResponse;
    },
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify(authoredTurn),
          })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return Response.json({
        output_text: JSON.stringify({
          adequate: false,
          reason: "마지막 문장이 종결을 위한 단서로 이어지지 않음",
          replacementSentence: replacement,
        }),
        usage: { input_tokens: 20, output_tokens: 10 },
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  let visible: StoryBlock[] = [];
  for (const event of events) {
    if (event.event === "narration_commit") visible = appendNarrationCommit(visible, event);
    if (event.event === "narration_rewind") {
      visible = rewindNarrationBlocks(visible, event.data.toGrapheme);
    }
  }
  assert.equal(fetchCalls, 2);
  assert.ok(events.some((event) => event.event === "narration_rewind"));
  assert.equal(visible[0]?.text, `복도 끝에서 경보음이 멎었다. ${replacement}`);
  const sidecar = events.find((event) => event.event === "turn_sidecar");
  assert.equal(sidecar?.event, "turn_sidecar");
  if (sidecar?.event !== "turn_sidecar") return;
  assert.equal(sidecar.data.result.usage?.liveReliability?.rewindCount, 1);
  assert.equal(sidecar.data.result.usage?.liveReliability?.semanticAuditCount, 1);
  assert.equal(sidecar.data.result.usage?.liveReliability?.discarded, false);
  assert.equal(sidecar.data.result.usage?.liveReliability?.streamPath, "live");
});

test("마지막 비트 실패는 저장하지 않은 원문과 구체 진단을 보존한다", async () => {
  const narration = "문 앞에서 기다렸지만 열쇠는 없었고 문은 닫힌 채였다.";
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "잠긴 문 사건을 현재 시간과 장소 안에서 종결한다.",
      openingDirection: "문 앞의 직접 결과",
      endingDirection: "문의 관측 가능한 최종 결과",
      mustShow: ["문의 최종 결과"],
      mustAvoid: ["소지하지 않은 물품 조작"],
      targetTime: "12:20",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: true,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: {
      phase: "final_closure",
      beat: 4,
      totalBeats: 4,
      correctionLimit: 0,
      preserveFailedDraft: true,
    },
    diagnosticContract: {
      ...diagnosticContract,
      eventName: "잠긴 문",
      requiredItems: ["황동 열쇠"],
      completionSignals: ["문이 열렸다"],
      currentBeatSignals: ["문 너머가 확인됐다"],
    },
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-final-failure",
    planUsage: {
      call: 1,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 1,
      repairScope: "none",
      inputTokens: 1,
      uncachedInputTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 0,
    },
  };
  const authoredTurn = {
    narration,
    statePatch: { inventoryAdd: [], location: "교실", time: "12:20" },
    claudeSignals: { eventResolved: false },
  };
  const response = createValidatedSimulationStream(
    JSON.stringify({
      apiKey: "sk-test-live",
      state: { inventory: [], location: "교실", time: "12:20" },
    }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "plan") return planEnvelope;
      throw Object.assign(new Error("마지막 비트 종결 실패"), {
        code: "FINAL_BEAT_CLOSURE_FAILED",
      });
    },
    async () => new Response(
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: JSON.stringify(authoredTurn),
      })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ),
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  const abort = events.find((event) => event.event === "turn_abort");
  assert.equal(abort?.event, "turn_abort");
  if (abort?.event !== "turn_abort") return;
  assert.equal(abort.data.diagnostic?.narration, narration);
  assert.ok(abort.data.diagnostic?.reasons.some((reason) =>
    reason.includes("황동 열쇠") && reason.includes("미소지")
  ));
  assert.ok(abort.data.diagnostic?.reasons.some((reason) =>
    reason.includes("문이 열렸다")
  ));
});

test("damaged final JSON aborts provisional sentences without committing state", async () => {
  const planEnvelope: LivePlanEnvelope = {
    kind: LIVE_PLAN_KIND,
    plan: {
      scenePlan: "공개된 현재 장면의 반응을 한 문장으로 쓴다.",
      openingDirection: "현재 반응",
      endingDirection: "안전한 대응 지점",
      mustShow: ["현재 반응"],
      mustAvoid: ["공개 전 정보"],
      targetTime: "12:30",
      targetLocation: "교실",
      beatAdvanced: true,
      eventResolved: false,
    },
    publicWriterContext: {},
    writerStaticPrompt: "공개 정보만 사용한다.",
    protectedTerms: [],
    beatPolicy: firstBeatPolicy,
    diagnosticContract,
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 1000,
    promptCacheKey: "test-live-json",
    planUsage: {
      call: 1,
      stage: "scene_plan",
      reasoningEffort: "none",
      rewriteReasons: [],
      durationMs: 1,
      repairScope: "none",
      inputTokens: 1,
      uncachedInputTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 0,
    },
  };
  const damaged = '{"narration":"안전한 문장이 먼저 도착했다.","statePatch":';
  let finalizeCalls = 0;
  const response = createValidatedSimulationStream(
    JSON.stringify({ apiKey: "sk-test-live" }),
    "http://localhost/api/simulate/stream",
    async (_request, _key, runtime) => {
      if (runtime.phase === "finalize") finalizeCalls += 1;
      return planEnvelope;
    },
    async () => new Response(
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: damaged,
      })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ),
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  assert.ok(events.some((event) => event.event === "narration_commit"));
  assert.deepEqual(events.slice(-2).map((event) => event.event), ["turn_abort", "error"]);
  const abort = events.find((event) => event.event === "turn_abort");
  assert.equal(abort?.event, "turn_abort");
  if (abort?.event === "turn_abort") {
    assert.equal(abort.data.diagnostic?.reliability?.discarded, true);
    assert.equal(abort.data.diagnostic?.reliability?.discardReason, "json");
    assert.equal(abort.data.diagnostic?.reliability?.streamPath, "live");
    assert.ok((abort.data.diagnostic?.reliability?.firstSentenceMs ?? -1) >= 0);
  }
  assert.equal(events.some((event) => event.event === "turn_sidecar"), false);
  assert.equal(events.some((event) => event.event === "done"), false);
  assert.equal(finalizeCalls, 0);
});

test("validated simulation stream acknowledges, commits, sends sidecar, and completes", async () => {
  const response = createValidatedSimulationStream(
    JSON.stringify({ request: true }),
    "http://localhost/api/simulate/stream",
    async () => result,
  );
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/u);

  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  assert.equal(events[0]?.event, "turn_ack");
  assert.ok(events.some((event) => event.event === "narration_commit"));
  assert.equal(events.at(-2)?.event, "turn_sidecar");
  assert.equal(events.at(-1)?.event, "done");

  let rebuilt: StoryBlock[] = [];
  for (const event of events) {
    if (event.event === "narration_commit") {
      rebuilt = appendNarrationCommit(rebuilt, event);
    }
  }
  assert.deepEqual(rebuilt, blocks);
});

test("failed generation never exposes provisional narration", async () => {
  const response = createValidatedSimulationStream(
    "{}",
    "http://localhost/api/simulate/stream",
    async () => {
      throw Object.assign(new Error("응답 형식 오류"), {
        code: "LUNA_RESPONSE_REJECTED",
      });
    },
  );
  const events: SimulationStreamEvent[] = [];
  await consumeSimulationStream(response, (event) => events.push(event));
  assert.deepEqual(events.map((event) => event.event), ["turn_ack", "error"]);
});
