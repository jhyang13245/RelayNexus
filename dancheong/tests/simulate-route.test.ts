import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/simulate/route";
import {
  claudeRuntimeVariable,
  readClaudeRuntime,
} from "../lib/claude-runtime";
import { demoScenario } from "./fixtures/legacy-demo-scenario";
import {
  createInitialState,
  STORY_ROUTE_PROGRESS_VARIABLE_ID,
} from "../lib/scenario";

const assertNexusRewriteRejected = (
  response: Response,
  body: { code?: string; error?: string },
) => {
  if (response.status === 422) {
    assert.equal(body.code, "NARRATIVE_REWRITE_FAILED");
    assert.match(body.error ?? "", /본문 생성 오류|이번 (?:턴|초안)을? 저장하지 않았/u);
    return;
  }
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.code, undefined);
  assert.equal(body.error, undefined);
};

const importedPack = {
  ...demoScenario,
  projectId: "FATE-SEOUL-ROUTE-TEST",
  title: "Fate/Seoul",
};

const hiddenInventoryPack = {
  ...importedPack,
  player: {
    ...importedPack.player,
    inventory: "황동열쇠, 불탄 기록",
  },
};

const classGuardSaberNpc = {
  ...importedPack.npcs[0],
  id: "NPC_CLASS_GUARD_SABER",
  name: "붉은 옥새의 소녀 검사",
  role: "Saber 클래스 서번트",
  publicInfo: "진명을 밝히지 않은 소녀 검사",
  hiddenInfo: "진명 정조 이산",
};

const classGuardPack = {
  ...importedPack,
  npcs: [...importedPack.npcs, classGuardSaberNpc],
};

const requestFor = (apiKey?: string) =>
  new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: importedPack,
      state: createInitialState(importedPack),
      userText: "우선 눈앞의 일에 집중한다.",
      recentTurns: [],
      apiKey,
    }),
  });

const validLunaTurn = {
  blocks: [
    {
      type: "narration",
      text: "교실 뒤편에서 작은 진동음이 끊기고, 택배 알림 화면에 새 좌표가 떠올랐다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    },
    {
      type: "dialogue",
      text: "수업이 끝난 뒤에 확인해도 늦지 않겠지만, 발신 기록은 조금 이상하군요.",
      speakerId: "NPC_ADVISER",
      speakerName: "한명진",
      emotion: "calm",
      mediaAssetId: "",
    },
  ],
  statePatch: {
    time: "09:03",
    location: demoScenario.startLocation,
    weather: "맑음",
    sceneSummary: "택배 알림의 발신 기록에 이상한 점이 발견됐다.",
    statusAdd: [],
    statusRemove: [],
    inventoryAdd: [],
    inventoryRemove: [],
    relationChanges: [],
    clockChanges: [],
    memoryAdd: ["택배 알림의 발신 기록이 정상적이지 않다."],
    variablesAdd: [],
    variablesResolve: [],
    encounteredCharactersAdd: [],
    statusLedgerChanges: [],
    autonomyActions: [],
    relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  },
  claudeSignals: {
    inputMode: "advance" as const,
    sceneTime: "09:03",
    location: demoScenario.startLocation,
    appearing: ["NPC_ADVISER"],
    firstAppearance: [],
    mentioned: [],
    openQuestions: [],
    resolvedQuestions: [],
    beatAdvanced: true,
    eventResolved: false,
    resolutionSummary: "",
    autoAction: "",
  },
  recommendations: [
    { label: "눈앞의 물건을 손에 들어 살핀다.", risk: "낮음" },
    { label: "주변 사람에게 지금 필요한 도움을 요청한다.", risk: "보통" },
    { label: "가장 가까운 출구 쪽으로 이동한다.", risk: "높음" },
  ],
  image: {
    recommended: false,
    reason: "이미지 생성 주기가 아니다.",
    prompt: "",
    characterIds: [],
  },
  characterVisuals: [],
  agencyAudit: { playerActionInvented: false, note: "위반 없음" },
};

test("AI 세계관 캐릭터 조사는 세션 캐시에 저장되고 웹 검색 비용을 별도 기록한다", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  const researchPack = {
    ...importedPack,
    aiWorldContext: {
      format: "RELAY_NOVEL_AI_WORLD_CONTEXT_RUNTIME_V1" as const,
      enabled: true,
      liveEvaluation: true,
      execution: {
        mode: "inject_into_simulator_api_context",
        evaluationMoments: ["sessionStart", "npcDecision"],
        updateDepth: "deep",
        knowledgePolicy: "hybrid",
      },
      worldContext: {
        premise: "현대 서울의 비밀 전쟁",
        referenceFramework: "참고 작품",
        referenceUsage: "일반 규칙만 참고",
        localContext: "서울",
        enrichmentPriorities: "현대 사회 반응",
        protectedCanon: "패키지 정사",
        avoidElements: "직접 복제",
        originalityRule: "새 원인과 결과",
        spoilerRule: "비밀 차단",
      },
      referenceCharacterResearch: {
        enabled: true,
        lookupMode: "simulator_web_search_tool",
        characters: ["한명진"],
        researchScope: "성격·말투·호칭",
        sourcePriority: "공식 자료 우선",
        canonCutoff: "패키지 지정 시점",
        cacheMode: "session",
        lookupTiming: {
          sessionStart: true,
          beforeFirstAppearance: true,
          onCanonConflict: true,
          everyTurn: false,
        },
        recordSourcesInLedger: true,
      },
    },
  };
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) {
      return Response.json({
        output_text: JSON.stringify({
          characters: [{ characterName: "한명진", summary: "차분한 조언자 말투를 사용한다." }],
        }),
        output: [
          { type: "web_search_call", action: { sources: [{ title: "공식 인물 소개", url: "https://example.com/official" }] } },
        ],
        usage: {
          input_tokens: 500,
          output_tokens: 120,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        },
      });
    }
    return Response.json({
      output_text: JSON.stringify(validLunaTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack: researchPack,
        state: createInitialState(researchPack),
        userText: "눈앞의 알림을 확인한다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    const body = await response.json() as {
      statePatch: { characterResearchCacheUpsert?: Array<{ characterName: string; sources: unknown[] }> };
      usage: { researchCallCount?: number; webSearchCallCount?: number; researchCostUsd?: number };
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.statePatch.characterResearchCacheUpsert?.[0]?.characterName, "한명진");
    assert.equal(body.statePatch.characterResearchCacheUpsert?.[0]?.sources.length, 1);
    assert.equal(body.usage.researchCallCount, 1);
    assert.equal(body.usage.webSearchCallCount, 1);
    assert.ok((body.usage.researchCostUsd ?? 0) >= 0.01);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("v31은 narration 하나를 모델 원본으로 받고 서버가 대화 블록을 투영한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  const narration =
    "교실 뒤편의 진동음이 끊기자 택배 알림 화면에 새 좌표가 떠올랐다. 창가의 빛이 화면 가장자리에서 가늘게 떨렸다.\n\n“수업이 끝난 뒤 확인해도 늦지 않겠지만, 발신 기록은 조금 이상하군요.”";
  const authoredTurn = {
    ...validLunaTurn,
    blocks: undefined,
    narration,
    dialogueAnnotations: [{
      quote: "수업이 끝난 뒤 확인해도 늦지 않겠지만, 발신 기록은 조금 이상하군요.",
      speakerId: "NPC_ADVISER",
      speakerName: "한명진",
      emotion: "차분함",
    }],
  };
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      output_text: JSON.stringify(authoredTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(requestFor("sk-test-do-not-store"));
    const body = (await response.json()) as {
      narration: string;
      dialogueAnnotations: Array<{ quote: string; speakerName: string }>;
      blocks: Array<{ type: string; text: string; speakerName?: string }>;
    };
    const input = capturedBody?.input as Array<Record<string, unknown>>;
    const developerText = ((input[0].content as Array<Record<string, unknown>>)[0]
      .text) as string;
    const writerCore = developerText.match(
      /\[V31_WRITER_CORE_BEGIN\]([\s\S]*?)\[V31_WRITER_CORE_END\]/u,
    )?.[0] ?? "";
    const format = capturedBody?.text as Record<string, unknown>;
    const schema = format.format as { schema: { properties: Record<string, unknown> } };

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.match(body.narration, /택배 알림 화면/u);
    assert.equal(body.dialogueAnnotations[0]?.speakerName, "한명진");
    assert.equal(body.blocks.filter((block) => block.type === "dialogue").length, 1);
    assert.equal(body.blocks.find((block) => block.type === "dialogue")?.speakerName, "한명진");
    assert.equal(schema.schema.properties.blocks, undefined);
    assert.ok(schema.schema.properties.narration);
    assert.ok(writerCore.length >= 8_000 && writerCore.length <= 12_000, writerCore.length.toString());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 대화 반응 누락은 초안을 폐기·재작성하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...demoScenario.npcs[0],
    id: "NPC_NADIA_DIALOGUE_RECOVERY",
    name: "나디아 알 하다드",
    role: "편의점에서 다시 만난 유학생",
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-POLITE-DIALOGUE-RECOVERY",
    events: [],
    npcs: [nadia],
  };
  const state = {
    ...createInitialState(pack),
    turn: 4,
    time: "17:30",
    location: "편의점",
    sceneSummary: "편의점에서 나디아 알 하다드와 다시 만나 대화를 시작했다.",
    encounteredCharacterIds: [nadia.id],
  };
  const ignoredNarration = "편의점 냉장 진열대의 모터음이 낮게 이어졌다. 한시우는 손에 든 메모의 구겨진 모서리를 내려다보았다.";
  const answeredNarration = "한시우가 조심스럽게 말을 마치자 편의점 냉장고의 모터음만 잠시 두 사람 사이를 채웠다. 나디아는 웃어넘기지 않고 그의 손에 들린 메모와 굳은 표정을 번갈아 살폈다.\n\n“그런 메모를 받았다면 불안하실 만해요. 우선 내용을 보여 주시겠어요? 오늘 밤 일을 바로 약속하기 전에, 위험한 내용인지 확인하고 안전하게 있을 방법부터 같이 정해요.”\n\n그녀는 계산대에서 조금 떨어진 창가 자리를 가리켰다. 부탁을 무조건 받아들인 것도 거절한 것도 아니었지만, 적어도 한시우의 두려움을 혼자 감당하게 두지는 않겠다는 반응이었다.";
  const authoredRecommendations = [
    { label: "한시우는 나디아에게 메모를 건네 가장 수상한 문장을 함께 짚어 본다.", risk: "낮음" },
    { label: "한시우는 나디아와 창가 자리에 앉아 오늘 밤 머물 안전한 장소부터 정한다.", risk: "보통" },
    { label: "한시우는 거절당할 가능성을 감수하고 메모의 발신자를 함께 추적해 달라고 부탁한다.", risk: "높음" },
  ] as const;
  const baseTurn = {
    ...validLunaTurn,
    blocks: undefined,
    dialogueAnnotations: [],
    narration: ignoredNarration,
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "17:33",
      location: "편의점",
      sceneSummary: "편의점에서 메모를 내려다보았다.",
      memoryAdd: [],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "17:33",
      location: "편의점",
      appearing: [nadia.id],
      firstAppearance: [],
      beatAdvanced: false,
    },
  };
  const answeredTurn = {
    ...baseTurn,
    narration: answeredNarration,
    recommendations: authoredRecommendations,
    dialogueAnnotations: [{
      quote: "그런 메모를 받았다면 불안하실 만해요. 우선 내용을 보여 주시겠어요? 오늘 밤 일을 바로 약속하기 전에, 위험한 내용인지 확인하고 안전하게 있을 방법부터 같이 정해요.",
      speakerId: nadia.id,
      speakerName: nadia.name,
      emotion: "걱정하며 신중하게 답함",
    }],
    statePatch: {
      ...baseTurn.statePatch,
      sceneSummary: "나디아가 메모를 먼저 확인하고 안전한 방법을 함께 정하자고 답했다.",
      memoryAdd: ["나디아가 이상한 메모를 확인하고 안전한 방법을 함께 찾겠다고 했다."],
    },
    claudeSignals: {
      ...baseTurn.claudeSignals,
      beatAdvanced: true,
    },
  };
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(requestBodies.length === 1 ? baseTurn : answeredTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 240,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state,
        userText: "아.. 안녕하세요. 죄송한데 제가 오늘 이상한 메모를 받고 지금 살짝 두려움에 휩싸여 있는 상태여서 오늘 밤까지만 저와 시간을 보내주시면 안될까요? 부탁드립니다.",
        recentTurns: [{
          turn: 4,
          userText: "나디아에게 말을 건다.",
          blocks: [{ type: "dialogue", text: "무슨 일이신가요?", speakerId: nadia.id, speakerName: nadia.name }],
          location: "편의점",
          time: "17:30",
        }],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    const body = (await response.json()) as {
      blocks: Array<{ type: string; text: string; speakerName?: string }>;
      statePatch: { time: string; location: string };
      recommendations: Array<{ label: string; risk: string }>;
    };
    const text = body.blocks.map((block) => block.text).join(" ");
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(requestBodies.length, 1);
    assert.equal(
      (requestBodies[0]?.reasoning as { effort?: string })?.effort,
      "medium",
    );
    assert.equal(body.blocks.some((block) => block.type === "dialogue"), false);
    assert.match(text, /냉장 진열대|메모/u);
    assert.doesNotMatch(text, /안녕하세요에 관한 방금의 행동|손에 닿는 상태와 주변의 직접 반응/u);
    assert.equal(body.statePatch.location, "편의점");
    assert.notEqual(body.statePatch.time, "23:59");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 sceneFact 누락은 품질 권고로 남기고 첫 초안을 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-SCENE-FACT-FIRE",
    title: "검은 종이의 밤",
    genre: "현대 오컬트",
    events: [],
    npcs: [],
  };
  const state = {
    ...createInitialState(pack),
    turn: 8,
    time: "22:48",
    location: "주택 현관 안쪽",
    sceneSummary: "젖은 검은 종이가 열쇠 쪽으로 기어오고 있다.",
  };
  const ignoredTurn = {
    ...validLunaTurn,
    blocks: undefined,
    narration: "젖은 검은 종이가 식탁 다리를 타고 더 높이 올라왔다. 현관 밖의 추적자가 한 걸음 안으로 들어왔다.",
    dialogueAnnotations: [],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "22:49",
      location: state.location,
      sceneSummary: "종이와 추적자가 열쇠에 더 가까워졌다.",
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "22:49",
      location: state.location,
    },
  };
  const repairedTurn = {
    ...ignoredTurn,
    narration: "한시우가 라이터의 휠을 당기자 불꽃이 튀었다. 그는 불씨를 젖은 종이 끝에 밀어 넣었고, 기름 냄새와 함께 종이가 타들어 가며 검은 가장자리가 재로 부서졌다.\n\n불길이 번진 몇 초 동안 종이의 움직임은 실제로 멎었다. 열쇠를 향하던 검은 물기도 바닥 쪽으로 물러났고, 현관의 추적자도 팔로 얼굴을 가리며 한 걸음 멈췄다.\n\n하지만 효과는 잠시뿐이었다. 불꽃이 약해지자 타다 남은 검은 조각들이 다시 꿈틀거리며 서로 붙기 시작했다. 불태운 행동은 시간을 벌었고, 한시우는 그 짧은 틈에 다음 대응을 선택할 수 있게 됐다.",
    statePatch: {
      ...ignoredTurn.statePatch,
      sceneSummary: "라이터로 종이를 불태워 잠시 움직임을 멈추고 대응할 시간을 벌었다.",
      memoryAdd: ["라이터 불꽃이 젖은 종이를 잠시 태워 움직임을 멈췄지만 곧 다시 붙기 시작했다."],
    },
  };
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(requestBodies.length === 1 ? ignoredTurn : repairedTurn),
      usage: {
        input_tokens: 700,
        output_tokens: 240,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state,
        userText: "한시우는 라이터로 종이를 불태워 없앤다. 그것은 실제로 잠시나마 효과가 있었다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    const body = await response.json() as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string; sceneSummary: string };
    };
    const text = body.blocks.map((block) => block.text).join(" ");
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(requestBodies.length, 1);
    assert.match(text, /젖은 검은 종이|추적자/u);
    assert.doesNotMatch(text, /라이터|불꽃/u);
    assert.equal(body.statePatch.location, state.location);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("모델이 첫 등장 표시를 누락해도 패키지 인물의 대표 이미지와 프로필을 강제로 연결한다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...demoScenario.npcs[0],
    id: "NPC_NADIA",
    name: "나디아 알 하다드",
    role: "방문 연구자",
    publicInfo: "프랑스에서 온 연구자",
    hiddenInfo: "",
  };
  const nadiaAsset = {
    id: "nadia-canonical",
    path: "characters/nadia.png",
    kind: "character" as const,
    characterId: nadia.id,
    characterName: nadia.name,
    label: "나디아 대표 이미지",
    emotionTags: ["canonical", "default"],
    sceneTags: [],
    placement: "after_block" as const,
    priority: 1000,
    alt: "나디아 알 하다드",
    caption: "나디아 알 하다드",
    canonical: true,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-FIRST-APPEARANCE",
    title: "서울의 평범한 오후",
    genre: "현대 일상",
    events: [],
    npcs: [nadia],
    mediaAssets: [nadiaAsset],
    opening: {
      ...demoScenario.opening,
      openingCharacters: "",
      openingLine: "오후 수업이 끝나고 캠퍼스 안내도 앞에 섰다.",
    },
  };
  const turn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "캠퍼스 안내도 위로 가벼운 빗방울이 떨어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "실례합니다. 대학박물관 별관은 어느 쪽인가요?",
        speakerId: nadia.id,
        speakerName: nadia.name,
        emotion: "조심스러운 호의",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "16:10",
      location: "대학교 캠퍼스 안내도 앞",
      weather: "가벼운 비",
      sceneSummary: "캠퍼스 안내도 앞에서 나디아가 길을 물었다.",
      encounteredCharactersAdd: [],
    },
    characterVisuals: [],
    recommendations: [
      { label: "나디아에게 대학박물관 별관 방향을 알려준다.", risk: "낮음" },
      { label: "나디아에게 어느 행사로 왔는지 묻는다.", risk: "낮음" },
      { label: "나디아에게 가까운 교내 안내 창구를 가리킨다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;
  const initialState = {
    ...createInitialState(pack),
    time: "16:07",
    location: "대학교 캠퍼스 안내도 앞",
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state: initialState,
      userText: "안내도 앞에서 잠시 주변을 본다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ speakerId?: string; mediaAssetId?: string }>;
      characterVisuals: Array<{
        characterId: string;
        characterName: string;
        canonicalAssetId: string;
      }>;
    };

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.blocks[1]?.mediaAssetId, nadiaAsset.id);
    assert.deepEqual(body.characterVisuals[0], {
      ...body.characterVisuals[0],
      characterId: nadia.id,
      characterName: nadia.name,
      canonicalAssetId: nadiaAsset.id,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 과잉 행동 판정 누락도 첫 초안을 폐기하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const state = {
    ...createInitialState(importedPack),
    time: "07:10",
    location: "주인공의 집",
    sceneSummary: "등교를 준비하는 아침이다.",
  };
  const genericMovementTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "한시우는 집에서 하던 말을 마무리하고 직접 자리를 떠났다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "20분 동안 이동해 집 바깥 동선에 도착했다. 이전 장소의 대화와 사건은 그곳에 남았고, 현재의 시선과 동선은 새 장소로 이어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "07:30",
      location: "주인공의 집 바깥 동선",
      sceneSummary: "집 바깥으로 이동했다.",
      memoryAdd: ["집 바깥으로 이동했다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "07:30",
      location: "주인공의 집 바깥 동선",
    },
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: "직접 자리를 떠났다.",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "집 바깥 동선에 도착했다.",
      routeEventStatus: "in_progress",
      routeEventEvidence: "",
      chronologyConsistent: true,
      chronologyNote: "20분 이동했다.",
      recommendationsGrounded: true,
      recommendationBasis: ["집 바깥 동선"],
      currentScene: "집 바깥으로 이동했다.",
      currentLocation: "주인공의 집 바깥 동선",
      currentTime: "07:30",
      activeCharacters: [],
      activeThreats: [],
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(genericMovementTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: importedPack,
      state,
      userText: "대학교 등교하는 길에 보이는 사람을 모두 희롱하면서 간다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; location: string };
      claudeSignals?: { inputMode?: string; eventResolved?: boolean };
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    const text = body.blocks.map((block) => block.text).join(" ");

    assert.match(text, /집에서 하던 말을 마무리|집 바깥 동선/u);
    assert.doesNotMatch(text, /선을 넘는 말|희롱/u);
    assert.equal(body.claudeSignals?.inputMode, "advance");
    assert.equal(body.claudeSignals?.eventResolved, false);
    assert.equal(body.statePatch.location, "주인공의 집 바깥 동선");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트라도 내부 제어문이 섞인 복합 초안은 한 번 교정한다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...demoScenario.npcs[0],
    id: "NPC_NADIA_COMPOUND_REUNION",
    name: "나디아 알 하다드",
    role: "방문 연구자",
    publicInfo: "낮에 마주친 외국인 방문 연구자",
    hiddenInfo: "",
  };
  const event = {
    ...demoScenario.events[0],
    id: "EVENT_NADIA_COMPOUND_REUNION",
    name: "비 오는 날의 방문 연구자",
    required: true,
    sequence: 1,
    priority: 100,
    description: "나디아 알 하다드와 현재 공개 동선에서 다시 마주친다.",
    effects: "나디아와 평범한 대화를 시작한다.",
    completionSignals: "나디아 알 하다드가 한시우의 말을 듣고 반응했다",
    requiredDialogue: "",
    requiredSpeakerId: nadia.id,
    requiredItems: "",
    recoveryAlternatives: "현재 공개 동선의 상점이나 길목에서 자연스럽게 마주친다",
    endSceneAfterCompletion: false,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-COMPOUND-ACTION-PREFIX",
    title: "비 오는 서울의 저녁",
    genre: "현대 일상",
    startLocation: "한시우의 집",
    events: [event],
    player: {
      ...demoScenario.player,
      id: "PC_SIWOO",
      name: "한시우",
      inventory: "황동열쇠, 낡은 우산",
    },
    npcs: [nadia],
    mediaAssets: [],
  };
  const state = {
    ...createInitialState(pack),
    time: "17:10",
    location: "한시우의 집",
    weather: "비",
    inventory: ["황동열쇠", "낡은 우산"],
    sceneSummary: "한시우가 집 안에서 외출을 준비하고 있다.",
  };
  const ignoredTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "배달 여부에 따라 다른 일상 장면을 진행한다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "17:13",
      location: "한시우의 집",
      weather: "비",
      sceneSummary: "집 안에서 다음 선택을 기다린다.",
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "17:13",
      location: "한시우의 집",
      appearing: [],
    },
  };
  const authoredTurn = {
    ...ignoredTurn,
    blocks: [
      {
        type: "narration",
        text: "황동열쇠를 내려놓자 책상 나뭇결 위로 작은 금속음이 굴렀다. 한시우는 낡은 우산의 살을 한 번 펴 본 뒤 현관을 나섰고, 빗물이 번지는 서촌 골목을 따라 편의점 쪽으로 걸어갔다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "십여 분 뒤 편의점에 도착해 자동문을 지나자 따뜻한 공기와 커피 향이 젖은 소매에 감겼다. 냉장 진열대 끝에서 상품 라벨을 읽던 나디아 알 하다드가 익숙한 목소리에 고개를 들었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "한시우가 가까이 다가가 말을 건네자 나디아의 눈에 짧은 놀라움이 번졌다. 나디아 알 하다드는 한시우의 말을 듣고 그를 알아본 표정으로 반응했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "낮에 뵀던 분이군요. 이런 데서 다시 만날 줄은 몰랐어요.",
        speakerId: nadia.id,
        speakerName: nadia.name,
        emotion: "뜻밖의 재회에 놀람",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...ignoredTurn.statePatch,
      time: "17:22",
      location: "편의점",
      weather: "비",
      sceneSummary: "비 오는 저녁 편의점에서 나디아와 다시 만나 대화를 시작했다.",
      inventoryRemove: ["황동열쇠"],
      memoryAdd: ["편의점에서 나디아와 우연히 다시 만나 말을 건넸다."],
      encounteredCharactersAdd: [{
        characterId: nadia.id,
        name: nadia.name,
        relationType: "편의점에서 뜻밖의 재회",
      }],
    },
    claudeSignals: {
      ...ignoredTurn.claudeSignals,
      inputMode: "advance" as const,
      sceneTime: "17:22",
      location: "편의점",
      appearing: [nadia.id],
      firstAppearance: [nadia.id],
      beatAdvanced: true,
      eventResolved: false,
    },
    recommendations: [
      { label: "나디아에게 이 편의점에 온 이유를 묻는다.", risk: "낮음" as const },
      { label: "나디아에게 낮에 헤어진 뒤 어디를 다녀왔는지 묻는다.", risk: "낮음" as const },
      { label: "따뜻한 음료를 고르며 나디아와 대화를 이어 간다.", risk: "보통" as const },
    ],
    agencyAudit: { playerActionInvented: false, note: "입력한 행동만 장면화했다." },
  };
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
    output_text: JSON.stringify(requestBodies.length >= 2 ? authoredTurn : ignoredTurn),
    usage: {
      input_tokens: 800,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
  });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "한시우는 황동열쇠를 책상에 남겨 두고 낡은 우산과 함께 잠깐 편의점에 들르기로 한다. 그곳에서 나디아와 재회해 말을 건다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string; speakerName?: string }>;
      statePatch: {
        location: string;
        inventoryRemove: string[];
        encounteredCharactersAdd: Array<{ characterId: string }>;
      };
      warning?: string;
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    const text = body.blocks.map((block) => block.text).join(" ");
    assert.equal(requestBodies.length, 2);
    const firstFormat = (requestBodies[0]?.text as Record<string, unknown>)
      .format as Record<string, unknown>;
    const firstSchema = firstFormat.schema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    assert.equal(firstSchema.properties?.narrativeAudit, undefined);
    assert.ok(firstSchema.properties?.narration);
    assert.ok(firstSchema.properties?.dialogueAnnotations);
    assert.equal(firstSchema.properties?.blocks, undefined);
    assert.ok(!firstSchema.required?.includes("narrativeAudit"));
    assert.equal(body.statePatch.location, "편의점");
    assert.match(text, /황동열쇠.*책상.*금속음/u);
    assert.match(text, /편의점.*(?:간판|자동문)/u);
    assert.ok(body.blocks.some((block) => block.speakerName === nadia.name));
    assert.deepEqual(body.statePatch.inventoryRemove, ["황동열쇠"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 이동 누락은 목적지와 무관하게 첫 초안을 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-MOVEMENT-VERBS",
    title: "도시 산책",
    genre: "현대 일상",
    startLocation: "주인공의 작업실",
    events: [],
    npcs: [],
    mediaAssets: [],
  };
  const ignoredTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "주인공은 작업실에 그대로 남아 다음 선택을 기다렸다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "14:03",
      location: "주인공의 작업실",
      sceneSummary: "작업실에서 기다린다.",
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "14:03",
      location: "주인공의 작업실",
      appearing: [],
    },
  };
  globalThis.fetch = (async () => Response.json({
    output_text: JSON.stringify(ignoredTurn),
    usage: {
      input_tokens: 700,
      output_tokens: 180,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
  })) as typeof fetch;

  try {
    for (const [userText, destination] of [
      ["일단 도서관에 들르기로 한다.", "도서관"],
      ["우선 약국을 방문한다.", "약국"],
      ["주인공은 중앙역으로 향한다.", "중앙역"],
    ] as const) {
      const state = {
        ...createInitialState(pack),
        time: "14:00",
        location: "주인공의 작업실",
      };
      const request = new Request("http://localhost/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack,
          state,
          userText,
          recentTurns: [],
          apiKey: "sk-test-do-not-store",
        }),
      });
      const response = await POST(request);
      const body = (await response.json()) as {
        blocks: Array<{ text: string }>;
        statePatch: { location: string };
        code?: string;
        error?: string;
      };
      if (response.status === 422) {
        assert.equal(body.code, "NARRATIVE_REWRITE_FAILED");
        assert.equal(body.blocks, undefined);
        continue;
      }
      const text = body.blocks.map((block) => block.text).join(" ");

      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.statePatch.location, "주인공의 작업실");
      assert.match(text, /작업실에 그대로 남아/u);
      assert.doesNotMatch(text, new RegExp(`${destination}.*(?:간판|입구|닿았다)`, "u"));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const overreachMatrix = [
  {
    label: "폭력",
    input: "정문 경비를 때려눕히고 학교 안으로 들어간다.",
    attempt: /달려들|힘으로 밀어붙/u,
    reaction: /몸을 피|경비를 부르|더 다가오지 말/u,
    consequence: /제압하지 못|충돌만 커|벗어나기도 어려/u,
  },
  {
    label: "재산 침해",
    input: "상점 진열장을 부수고 물건을 훔쳐 간다.",
    attempt: /남의 물건|시설에 손을 대|가져가거나 망가뜨/u,
    reaction: /주인이.*막아|경비에게 현재 위치/u,
    consequence: /현장에서 막|손해와 책임/u,
  },
  {
    label: "강요",
    input: "처음 보는 사람을 협박해 억지로 따라오게 한다.",
    attempt: /억지로 따르게|거절할 틈/u,
    reaction: /단호하게 거절|사이에 끼어들|신고 화면/u,
    consequence: /거절은 뒤집히지 않|관계 단절/u,
  },
  {
    label: "불가능한 선언",
    input: "한순간에 모든 사람을 세뇌해 복종시킨다.",
    attempt: /상황 전체를 뒤집|실제로 시도/u,
    reaction: /아무도.*복종하지 않|반동/u,
    consequence: /바라던 결과는 일어나지 않|힘과 시간/u,
  },
] as const;

for (const scenario of overreachMatrix) {
  test(`${scenario.label} 과잉 입력 누락도 초기 비트에서는 초안을 폐기하지 않는다`, async () => {
    const originalFetch = globalThis.fetch;
    const state = {
      ...createInitialState(importedPack),
      time: "09:00",
      location: importedPack.startLocation,
    };
    const erasedTurn = {
      ...validLunaTurn,
      blocks: [
        {
          type: "narration",
          text: "윤시우는 생각을 접고 눈앞의 수업에 집중했다.",
          speakerId: "",
          speakerName: "",
          emotion: "",
          mediaAssetId: "",
        },
      ],
      statePatch: {
        ...validLunaTurn.statePatch,
        time: "09:03",
        location: importedPack.startLocation,
        sceneSummary: "수업에 집중했다.",
      },
      claudeSignals: {
        ...validLunaTurn.claudeSignals,
        sceneTime: "09:03",
        location: importedPack.startLocation,
      },
    };
    globalThis.fetch = (async () =>
      Response.json({
        output_text: JSON.stringify(erasedTurn),
        usage: {
          input_tokens: 900,
          output_tokens: 220,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        },
      })) as typeof fetch;

    const request = new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack: importedPack,
        state,
        userText: scenario.input,
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    });

    try {
      const response = await POST(request);
      const body = (await response.json()) as {
        blocks: Array<{ text: string }>;
        statePatch: { time: string };
        claudeSignals?: { inputMode?: string; eventResolved?: boolean };
        recommendations?: Array<{ label: string }>;
        code?: string;
        error?: string;
      };
      assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
      const text = body.blocks.map((block) => block.text).join(" ");

      assert.match(text, /생각을 접고 눈앞의 수업에 집중/u);
      assert.doesNotMatch(text, scenario.attempt);
      assert.doesNotMatch(text, scenario.reaction);
      assert.doesNotMatch(text, scenario.consequence);
      assert.equal(body.claudeSignals?.inputMode, "advance");
      assert.equal(body.claudeSignals?.eventResolved, false);
      assert.equal(body.statePatch.time, "09:03");
      assert.equal(body.recommendations?.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("초기 비트의 과잉 입력 누락은 필수 사건을 조기 봉인하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const guardedPack = {
    ...importedPack,
    events: importedPack.events.map((event, index) =>
      index === 0
        ? {
            ...event,
            required: true,
            completionSignals: "세 가지 발전 방향 가운데 하나를 실제로 선택했다",
            requiredDialogue: "선택한 발전 방향을 한세린에게 직접 말했다",
            requiredSpeakerId: "NPC_MASTER_HAN",
          }
        : event
    ),
  };
  const erasedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "윤시우는 생각을 접고 조용히 앉아 있었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      beatAdvanced: false,
      eventResolved: false,
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(erasedTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 180,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: guardedPack,
      state: createInitialState(guardedPack),
      userText: "한순간에 모든 사람을 세뇌해 복종시킨다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      claudeSignals?: { eventResolved?: boolean; resolutionSummary?: string };
      narrativeAudit?: { routeEventStatus?: string };
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    const text = body.blocks.map((block) => block.text).join(" ");

    assert.match(text, /생각을 접고 조용히 앉아/u);
    assert.doesNotMatch(text, /세 가지 발전 방향 가운데 하나를 실제로 선택/u);
    assert.doesNotMatch(text, /선택한 발전 방향을 한세린에게 직접 말/u);
    assert.equal(body.claudeSignals?.eventResolved, false);
    assert.equal(body.claudeSignals?.resolutionSummary, "");
    assert.notEqual(body.narrativeAudit?.routeEventStatus, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("가져온 작품은 API 키가 없을 때 데모 이야기를 대신 저장하지 않는다", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const response = await POST(requestFor());
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 401);
    assert.equal(body.code, "API_KEY_REQUIRED");
    assert.equal("blocks" in body, false);
    assert.equal(JSON.stringify(body).includes("한세린의 손끝"), false);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("Luna 요청 실패는 모의 턴이 아니라 재시도 가능한 오류로 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({ error: { message: "upstream failed" } }, { status: 500 })) as typeof fetch;

  try {
    const response = await POST(requestFor("sk-test-do-not-store"));
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 502);
    assert.equal(body.code, "LUNA_REQUEST_FAILED");
    assert.equal("blocks" in body, false);
    assert.match(String(body.error), /다음 장면을 만들지 못했습니다/);
    assert.match(String(body.error), /upstream failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("엄격한 출력 요청이 400이면 호환 JSON 요청으로 한 번 자동 재시도한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return Response.json(
        {
          error: {
            type: "invalid_request_error",
            code: "unknown_parameter",
            param: "prompt_cache_options",
            message: "Unsupported parameter: prompt_cache_options",
          },
        },
        { status: 400 },
      );
    }
    return Response.json({
      output_text: JSON.stringify(validLunaTurn),
      usage: {
        input_tokens: 1200,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(requestFor("sk-test-do-not-store"));
    const body = (await response.json()) as Record<string, unknown>;
    const secondFormat = (
      (requestBodies[1].text as Record<string, unknown>).format as Record<string, unknown>
    );

    assert.equal(response.status, 200);
    assert.equal(body.mode, "luna");
    assert.equal(requestBodies.length, 2);
    assert.equal(secondFormat.type, "json_object");
    assert.equal("prompt_cache_options" in requestBodies[1], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Luna JSON이 잘렸으면 동일 입력을 자동 재생성해 정상 턴으로 저장한다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({
        output_text: '{"blocks":[{"type":"narration","text":"중간에서 잘린 문장',
        usage: {
          input_tokens: 700,
          output_tokens: 180,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        },
      });
    }
    return Response.json({
      output_text: JSON.stringify(validLunaTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(requestFor("sk-test-do-not-store"));
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.error, undefined);
    assert.equal(body.mode, "luna");
    assert.ok(calls >= 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Luna JSON 재생성도 실패하면 서버 문장을 저장하지 않고 상태 보존 오류를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({
      output_text: '{"blocks":[{"type":"narration","text":"끝까지 닫히지 않은 문장',
      usage: {
        input_tokens: 650,
        output_tokens: 170,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(requestFor("sk-test-do-not-store"));
    const body = (await response.json()) as {
      error?: string;
      code?: string;
      mode?: string;
      warning?: string;
      blocks?: Array<{ text?: string }>;
    };

    assert.equal(response.status, 422, JSON.stringify(body));
    assert.equal(body.code, "LUNA_RESPONSE_REJECTED");
    assert.match(body.error ?? "", /이번 (?:턴|초안)(?:은|을) 저장하지 않았|세계 상태는 그대로 보존/u);
    assert.equal(body.blocks, undefined);
    assert.ok(calls >= 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("추천 행동 재작성이 같은 불안전한 결과를 반복하면 원본을 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const spoilerTurn = {
    ...validLunaTurn,
    recommendations: [
      { label: "발신 기록을 확인한다.", risk: "낮음" },
      { label: "곧 일어날 습격에 대비한다.", risk: "높음" },
      { label: "오베론에게 이후 배신의 이유를 묻는다.", risk: "보통" },
      { label: "황동열쇠와 불탄 기록을 꺼내 대조한다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(spoilerTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const state = {
    ...createInitialState(hiddenInventoryPack),
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: hiddenInventoryPack,
      state,
      userText: "우선 눈앞의 일에 집중한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      recommendations: Array<{ label: string; risk: string }>;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const text = body.recommendations.map((item) => item.label).join(" ");

    assert.equal(response.status, 200);
    assert.equal(body.recommendations.length, 3);
    assert.match(text, /기록|발신|알림|택배/);
    body.recommendations.forEach((recommendation) => {
      assert.match(recommendation.label, /기록|발신|알림|택배/);
    });
    assert.doesNotMatch(text, /다시 확인|계속 관찰|한 번 더 대조/);
    assert.doesNotMatch(
      text,
      /곧|이후|습격|배신|오베론|황동열쇠|불탄 기록/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("본문의 미공개 초기 소품만 문제면 API 재호출 없이 단어 범위에서 가린다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const leakedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "USB의 시간 기록을 확인하자, 옆에 있던 황동열쇠와 불탄 기록에도 같은 시각이 남아 있었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "두 물건에는 비슷한 선이 남아 있었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    recommendations: validLunaTurn.recommendations,
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1 ? leakedTurn : validLunaTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: requestBodies.length === 1
          ? { cached_tokens: 500, cache_write_tokens: 0 }
          : { cached_tokens: 600, cache_write_tokens: 100 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(hiddenInventoryPack),
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: hiddenInventoryPack,
      state,
      userText: "USB의 시간 기록을 확인한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      recommendations: Array<{ label: string }>;
      usage: {
        callCount: number;
        billedCallCount: number;
        rewriteCount: number;
        rewriteReasons: string[];
        inputTokens: number;
        uncachedInputTokens: number;
        cachedInputTokens: number;
        cacheWriteTokens: number;
        outputTokens: number;
        estimatedCostUsd: number;
        calls: Array<{
          stage: string;
          rewriteReasons: string[];
          uncachedInputTokens: number;
        }>;
        localRepairs: Array<{
          ruleId: string;
          repairScope: string;
          reasons: string[];
          success: boolean;
        }>;
      };
    };
    const firstInput = requestBodies[0].input as Array<Record<string, unknown>>;
    const guardText = ((firstInput[1].content as Array<Record<string, unknown>>)[0]
      .text) as string;
    assert.equal(response.status, 200, JSON.stringify(body));
    const visibleText = [
      ...body.blocks.map((block) => block.text),
      ...body.recommendations.map((item) => item.label),
    ].join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.match(guardText, /disclosureGuard/);
    assert.match(guardText, /forbiddenPublicTerms/);
    assert.match(guardText, /hiddenInventoryTermCount/);
    assert.doesNotMatch(guardText, /황동열쇠|불탄 기록/);
    assert.doesNotMatch(visibleText, /황동열쇠|불탄 기록/);
    assert.equal(body.usage.inputTokens, 800);
    assert.equal(body.usage.outputTokens, 260);
    assert.equal(body.usage.callCount, 1);
    assert.equal(body.usage.billedCallCount, 1);
    assert.equal(body.usage.rewriteCount, 0);
    assert.equal(body.usage.uncachedInputTokens, 300);
    assert.equal(body.usage.cachedInputTokens, 500);
    assert.equal(body.usage.cacheWriteTokens, 0);
    assert.equal(requestBodies[0].model, 'gpt-6-luna');
    assert.ok(Math.abs(body.usage.estimatedCostUsd - 0.000165) < 1e-12);
    assert.deepEqual(body.usage.calls.map((call) => call.stage), ["draft"]);
    assert.equal(body.usage.calls[0]?.uncachedInputTokens, 300);
    assert.equal(body.usage.localRepairs.length, 1);
    assert.equal(body.usage.localRepairs[0]?.ruleId, "protected-public-term-redaction");
    assert.equal(body.usage.localRepairs[0]?.repairScope, "word");
    assert.equal(body.usage.localRepairs[0]?.success, true);
    assert.match(body.usage.localRepairs[0]?.reasons.join(" ") ?? "", /미공개 소품 누설/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("진행 중 정상 획득한 소품은 최근 문맥에서 멀어져도 다시 숨기지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const acquiredTurn = {
    ...validLunaTurn,
    blocks: validLunaTurn.blocks.map((block, index) =>
      index === 0
        ? {
            ...block,
            text: "현장에서 받은 USB의 표시등이 켜지며 새 좌표 파일이 열렸다.",
          }
        : block
    ),
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(acquiredTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(importedPack),
    inventory: ["현장에서 받은 USB"],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: importedPack,
      state,
      userText: "좌표 파일을 연다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as { blocks: Array<{ text: string }> };
    const input = requestBodies[0].input as Array<Record<string, unknown>>;
    const dynamicText = ((input[1].content as Array<Record<string, unknown>>)[0]
      .text) as string;

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.match(body.blocks.map((block) => block.text).join(" "), /현장에서 받은 USB/);
    assert.match(dynamicText, /visibleInventory/);
    assert.match(dynamicText, /현장에서 받은 USB/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("비공개 소품이 재작성에서도 반복되면 원본을 자동 가림으로 보존하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const repeatedlyLeakedTurn = {
    ...validLunaTurn,
    blocks: validLunaTurn.blocks.map((block, index) =>
      index === 0
        ? {
            ...block,
            text: "황동열쇠와 불탄 기록을 책상 위에 나란히 놓자 좌표가 나타났다.",
          }
        : block
    ),
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "황동열쇠와 불탄 기록에서 같은 좌표가 발견됐다.",
      memoryAdd: ["황동열쇠와 불탄 기록의 좌표를 확인했다."],
    },
    recommendations: [
      { label: "황동열쇠를 다시 살핀다.", risk: "낮음" },
      { label: "불탄 기록을 펼친다.", risk: "보통" },
      { label: "눈앞의 좌표를 확인한다.", risk: "보통" },
    ],
    image: {
      ...validLunaTurn.image,
      prompt: "책상 위 황동열쇠와 불탄 기록",
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(repeatedlyLeakedTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: hiddenInventoryPack,
      state: createInitialState(hiddenInventoryPack),
      userText: "눈앞의 화면을 확인한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { sceneSummary: string; memoryAdd: string[] };
      recommendations: Array<{ label: string }>;
      image: { prompt: string };
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const publicText = [
      ...body.blocks.map((block) => block.text),
      body.statePatch.sceneSummary,
      ...body.statePatch.memoryAdd,
      ...body.recommendations.map((recommendation) => recommendation.label),
      body.image.prompt,
    ].join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(requestBodies.length, 2);
    assert.doesNotMatch(publicText, /황동열쇠|불탄 기록/);
    assert.match(publicText, /미확인 물건/);
    assert.equal(body.recommendations.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("공개 전 클래스명이 재작성에도 남으면 원본과 파손 보정본을 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const leakedClassTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "현관 밖의 그림자가 문 아래로 길게 번졌다. 젖은 종이가 바닥을 스치는 소리가 문 앞에서 멈췄다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "문을 열지 마세요. 제 목소리가 다시 들려도 먼저 확인해 주세요. 관리실 세이버 방금 새 문장이 떴습니다.",
        speakerId: "NPC_ADVISER",
        speakerName: "학생지원실 직원",
        emotion: "다급한 경고",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "직원이 문장을 읽기 직전 통화가 완전히 무음이 됐다. 이어진 세이버는 학생지원실 번호도 남기지 않았다. 현관 밖의 종이 끄는 소리만 멀어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "현관 밖의 정체불명 기척과 전화 속 소리가 겹쳐 들렸다.",
      memoryAdd: ["현관 밖의 기척이 전화 속 소리를 흉내 냈다."],
    },
    recommendations: [
      { label: "학생지원실 직원에게 다시 말해 달라고 요청한다.", risk: "낮음" },
      { label: "세이버의 정체를 확인한다.", risk: "보통" },
      { label: "현관문에서 거리를 둔다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(leakedClassTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: classGuardPack,
      state: {
        ...createInitialState(classGuardPack),
        memories: [
          "관리실 세이버 방금 새 문장이 떴습니다.",
          "이어진 세이버는 학생지원실 번호도 남기지 않았다.",
        ],
      },
      userText: "문을 열지 않고 통화를 계속 듣는다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ speakerName?: string; text: string }>;
      recommendations: Array<{ label: string }>;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const firstInput = requestBodies[0].input as Array<Record<string, unknown>>;
    const dynamicText = ((firstInput[1].content as Array<Record<string, unknown>>)[0]
      .text) as string;
    const visibleText = [
      ...body.blocks.flatMap((block) => [block.speakerName ?? "", block.text]),
      ...body.recommendations.map((recommendation) => recommendation.label),
    ].join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 2);
    assert.match(dynamicText, /saberClassObservedBeforeTurn/);
    assert.match(dynamicText, /"saberClassObservedBeforeTurn":false/);
    assert.match(dynamicText, /forbiddenClassTerms/);
    assert.doesNotMatch(visibleText, /세이버|\bSaber\b/i);
    assert.doesNotMatch(visibleText, /관리실\s+정체불명의 소녀 검사|이어진\s+정체불명의 소녀 검사/);
    assert.match(visibleText, /문을 열지 마세요|현관 밖/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("세이버 클래스명은 작중에서 명시적으로 처음 공개한 문장부터 허용한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const revealedClassTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "소환진의 빛이 걷히자 검을 든 소녀 검사가 모습을 드러내 날아든 칼날을 막았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "내 클래스는 세이버다. 진명은 아직 밝힐 수 없다.",
        speakerId: "NPC_CLASS_GUARD_SABER",
        speakerName: "정체불명의 소녀 검사",
        emotion: "경계",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "묻겠다. 그대가 나의 마스터인가.",
        speakerId: "NPC_CLASS_GUARD_SABER",
        speakerName: "정체불명의 소녀 검사",
        emotion: "경계",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "소녀 검사가 자신의 클래스를 세이버라고 밝혔다.",
      memoryAdd: [],
      encounteredCharactersAdd: [{
        characterId: "NPC_CLASS_GUARD_SABER",
        name: "정체불명의 소녀 검사",
        relationType: "첫 대면",
      }],
    },
    recommendations: [
      { label: "세이버에게 현관 밖의 기척을 묻는다.", risk: "낮음" },
      { label: "진명을 숨기는 이유는 나중에 묻겠다고 한다.", risk: "보통" },
      { label: "당장의 위협부터 확인해 달라고 요청한다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(revealedClassTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: classGuardPack,
      state: createInitialState(classGuardPack),
      userText: "빛 속의 인물을 바라본다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ speakerName?: string; text: string }>;
      statePatch: { memoryAdd: string[] };
    };

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.equal(body.blocks[1]?.speakerName, "정체불명의 소녀 검사");
    assert.ok(body.blocks.some((block) => /클래스는 세이버/.test(block.text)));
    assert.equal(body.blocks.at(-1)?.text, "묻겠다. 그대가 나의 마스터인가.");
    assert.ok(body.statePatch.memoryAdd.some((memory) => /세이버/.test(memory)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("모델이 소녀 검사 별칭과 임시 ID를 써도 홍재 패키지 기준본으로 확정한다", async () => {
  const originalFetch = globalThis.fetch;
  const saber = {
    ...classGuardSaberNpc,
    id: "NPC_HONGJAE_ALIAS_TEST",
    name: "홍재",
    preRevealAlias: "정체불명의 소녀 검사",
    appearance: "붉은 곤룡포와 조선식 장검을 갖춘 흑발의 소녀 검사",
  };
  const canonicalAsset = {
    id: "hongjae-alias-canonical",
    path: "characters/hongjae-alias-canonical.webp",
    kind: "character" as const,
    characterId: saber.id,
    characterName: saber.name,
    label: "홍재 내장 기준본",
    emotionTags: ["canonical", "default"],
    sceneTags: ["first-appearance"],
    placement: "after_block" as const,
    priority: 1000,
    alt: "붉은 곤룡포의 소녀 검사",
    caption: "정체불명의 소녀 검사",
    source: "package" as const,
    canonical: true,
  };
  const pack = {
    ...importedPack,
    events: [],
    imageTriggers: [],
    npcs: [saber],
    mediaAssets: [canonicalAsset],
  };
  const aliasTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "문틈으로 검은 가루가 흘러들자 소녀 검사는 장검을 비스듬히 세워 현관 안쪽을 지켰다. 붉은 옷자락이 바닥의 푸른 잔광 위에서 천천히 가라앉았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "문에서 물러서세요.",
        speakerId: "dynamic-girl-swordswoman",
        speakerName: "소녀 검사",
        emotion: "경계",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "공개 전 소녀 검사가 현관 안쪽을 지켰다.",
      encounteredCharactersAdd: [{
        characterId: "dynamic-girl-swordswoman",
        name: "소녀 검사",
        relationType: "첫 대면",
      }],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      appearing: ["dynamic-girl-swordswoman"],
      firstAppearance: ["dynamic-girl-swordswoman"],
    },
    characterVisuals: [{
      blockIndex: 0,
      characterId: "dynamic-girl-swordswoman",
      characterName: "소녀 검사",
      importance: "major" as const,
      isFirstMajorAppearance: true,
      appearancePrompt: "검은 사무라이 갑옷을 입은 낯선 소녀",
      reason: "공개 전 첫 등장",
    }],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(aliasTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state: createInitialState(pack),
      userText: "소녀 검사의 움직임을 지켜본다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ mediaAssetId?: string }>;
      statePatch: { encounteredCharactersAdd: Array<{ characterId: string; name: string }> };
      characterVisuals: Array<{
        characterId: string;
        characterName: string;
        appearancePrompt: string;
        canonicalAssetId: string;
        source: string;
      }>;
    };

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.characterVisuals[0]?.characterId, saber.id);
    assert.equal(body.characterVisuals[0]?.characterName, "소녀 검사");
    assert.match(body.characterVisuals[0]?.appearancePrompt ?? "", /붉은 곤룡포/);
    assert.doesNotMatch(body.characterVisuals[0]?.appearancePrompt ?? "", /사무라이/);
    assert.equal(body.characterVisuals[0]?.canonicalAssetId, canonicalAsset.id);
    assert.equal(body.characterVisuals[0]?.source, "package");
    assert.equal(body.blocks[0]?.mediaAssetId, canonicalAsset.id);
    assert.equal(body.blocks[1]?.speakerId, saber.id);
    assert.equal(
      body.statePatch.encounteredCharactersAdd[0]?.characterId,
      saber.id,
    );
    assert.equal(body.statePatch.encounteredCharactersAdd[0]?.name, "소녀 검사");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("미등록 역할 화자는 모델이 다른 캐릭터 ID를 붙여도 패키지 초상을 받지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const packagedCharacter = {
    ...importedPack.npcs[0],
    id: "NPC_BLACK_ADMIRAL",
    name: "검은 제독",
    aliases: ["북해의 제독"],
    preRevealAlias: "",
    role: "함대 지휘관",
    appearance: "검은 제복과 은빛 견장을 착용한 장년의 지휘관",
    publicInfo: "북해 함대를 지휘한다.",
    hiddenInfo: "",
  };
  const portrait = {
    id: "black-admiral-canonical",
    path: "characters/black-admiral.png",
    kind: "character" as const,
    characterId: packagedCharacter.id,
    characterName: packagedCharacter.name,
    label: "검은 제독 기본 초상",
    emotionTags: ["default"],
    sceneTags: [],
    placement: "after_block" as const,
    priority: 100,
    alt: "검은 제독",
    caption: "검은 제독",
    source: "package" as const,
    canonical: true,
  };
  const pack = {
    ...importedPack,
    projectId: "GENERIC-SPEAKER-PORTRAIT-TRUST",
    events: [],
    imageTriggers: [],
    npcs: [packagedCharacter],
    mediaAssets: [portrait],
  };
  const malformedBindingTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "강의실의 웅성거림이 잦아들자 앞쪽 교탁에서 질문이 이어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "그 반론의 전제부터 다시 설명해 보세요.",
        speakerId: packagedCharacter.id,
        speakerName: "교수",
        emotion: "차분함",
        mediaAssetId: portrait.id,
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "이름이 등록되지 않은 교수가 강의실에서 반론을 요청했다.",
      encounteredCharactersAdd: [],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      appearing: [],
      firstAppearance: [],
    },
    characterVisuals: [{
      blockIndex: 1,
      characterId: packagedCharacter.id,
      characterName: "교수",
      importance: "major" as const,
      isFirstMajorAppearance: true,
      appearancePrompt: packagedCharacter.appearance,
      reason: "교수의 첫 대사",
    }],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(malformedBindingTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state: createInitialState(pack),
      userText: "교수와 반론을 주고받는다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ speakerId?: string; speakerName?: string; mediaAssetId?: string }>;
      characterVisuals: Array<{ characterId: string }>;
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    const professor = body.blocks.find((block) => block.speakerName === "교수");
    assert.equal(professor?.speakerId, "");
    assert.equal(professor?.mediaAssetId, "");
    assert.equal(body.characterVisuals.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("소환 계약이 누락된 재작성이 반복되면 원본을 서버 문장으로 이어 붙여 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const canonicalAsset = {
    id: "hongjae-canonical",
    path: "characters/hongjae.png",
    kind: "character" as const,
    characterId: classGuardSaberNpc.id,
    characterName: classGuardSaberNpc.name,
    label: "대표 기준 이미지",
    emotionTags: ["canonical"],
    sceneTags: [],
    placement: "after_block" as const,
    priority: 1000,
    alt: "홍재 기준 이미지",
    caption: classGuardSaberNpc.name,
    source: "package" as const,
    canonical: true,
  };
  const summonAsset = {
    ...canonicalAsset,
    id: "hongjae-summoning-trigger",
    path: "scenes/hongjae-summoning.png",
    kind: "scene" as const,
    characterId: "",
    characterName: "",
    label: "홍재 소환",
    emotionTags: [],
    sceneTags: ["EV_PROLOGUE_07_SABER_SUMMONING"],
    priority: 1,
    canonical: false,
  };
  const pack = {
    ...classGuardPack,
    mediaAssets: [canonicalAsset, summonAsset],
  };
  const incompleteSummoningTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "바닥의 원형 문양이 붉게 빛났다. 빛 속에서 검을 든 소녀 검사가 나타나 종이가면의 칼날을 장검으로 쳐냈다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "뒤로 물러서십시오.",
        speakerId: "",
        speakerName: "정체불명의 소녀 검사",
        emotion: "경계",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "붉은 원형 문양에서 소녀 검사가 나타나 공격을 막았다.",
      encounteredCharactersAdd: [],
      memoryAdd: [],
    },
    image: {
      recommended: true,
      reason: "소환 장면",
      prompt: "붉은 원형 문양에서 검을 든 소녀가 공격을 막는 장면",
      characterIds: [],
    },
    characterVisuals: [],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(incompleteSummoningTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;
  const initialState = {
    ...createInitialState(pack),
    turn: 1,
    imageEvery: 2 as const,
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state: initialState,
      userText: "눈앞의 장면을 확인한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string; speakerId?: string; mediaAssetId?: string }>;
      statePatch: { encounteredCharactersAdd: Array<{ characterId: string }> };
      image: { characterIds: string[] };
      characterVisuals: Array<{ characterId: string; canonicalAssetId: string }>;
      code?: string;
      error?: string;
    };

    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;

    assert.equal(response.status, 200);
    assert.equal(body.blocks.at(-1)?.text, "묻겠다. 그대가 나의 마스터인가.");
    assert.equal(body.blocks.at(-1)?.speakerId, classGuardSaberNpc.id);
    assert.equal(body.blocks.at(-1)?.mediaAssetId, summonAsset.id);
    assert.ok(
      body.statePatch.encounteredCharactersAdd.some(
        (entry) => entry.characterId === classGuardSaberNpc.id,
      ),
    );
    assert.deepEqual(body.image.characterIds, [classGuardSaberNpc.id]);
    assert.equal(body.characterVisuals[0]?.canonicalAssetId, canonicalAsset.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("이전 장면에서 공개된 세이버 클래스명은 다음 턴부터 일반 호칭으로 쓸 수 있다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const knownClassTurn = {
    ...validLunaTurn,
    blocks: validLunaTurn.blocks.map((block, index) =>
      index === 1
        ? {
            ...block,
            speakerId: "NPC_CLASS_GUARD_SABER",
            speakerName: "세이버",
            text: "문밖의 기척이 다시 움직인다.",
          }
        : block
    ),
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(knownClassTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(classGuardPack),
    memories: ["소녀 검사의 클래스가 세이버로 확인됐다."],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: classGuardPack,
      state,
      userText: "그녀의 경고를 듣는다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ speakerName?: string; text: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.equal(body.blocks[1]?.speakerName, "세이버");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 직접 열기 누락은 한 번의 초안으로 진행한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const stagnantTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "택배함 화면이 한 번 깜박였지만 위치 표기는 여전히 그대로였다. 원인은 확인되지 않았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "스피커에서 미세한 잡음이 한 번 더 흘렀다. 두 현상이 연결됐을 가능성만 남았고 확정할 수 없었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "09:05",
      location: "대학교 지하 1층 택배함",
      sceneSummary: "택배함 화면과 스피커 잡음이 관련됐을 가능성이 생겼다.",
      memoryAdd: ["택배함 화면이 한 번 깜박였다."],
    },
  };
  const progressedTurn = {
    ...validLunaTurn,
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      beatAdvanced: false,
      eventResolved: false,
      resolutionSummary: "",
    },
    blocks: [
      {
        type: "narration",
        text: "한시우가 손잡이를 당기자 잠금쇠가 짧게 풀리며 택배함 문이 실제로 열렸다. 안쪽 화면이 한 번 깜박이고 스피커에서 낮은 잡음이 흘렀다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "09:05",
      location: "대학교 지하 1층 택배함",
      sceneSummary: "택배함 문을 직접 열자 화면 깜박임과 스피커 잡음이 확인됐다.",
      memoryAdd: ["택배함 문을 열자 화면이 한 번 깜박였다."],
      encounteredCharactersAdd: [],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1 ? stagnantTurn : progressedTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(importedPack),
    location: "대학교 지하 1층 택배함",
    time: "09:03",
    sceneSummary: "택배함 앞에서 번호표를 살피고 있다.",
  };
  const recentTurns = [1, 2, 3].map((turn) => ({
    turn,
    userText: turn === 1 ? "택배함을 살펴본다." : "문을 다시 확인한다.",
    location: "대학교 지하 1층 택배함",
    time: `09:0${turn}`,
    blocks: [{
      id: `block-${turn}`,
      type: "narration" as const,
      text: "택배함의 차가운 철판과 번호표가 그대로 보였다.",
    }],
  }));
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: importedPack,
      state,
      userText: "택배함을 연다.",
      recentTurns,
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      usage: {
        inputTokens: number;
        outputTokens: number;
        qualityAdvisories?: string[];
      };
    };

    assert.equal(response.status, 200, JSON.stringify({ body, calls: requestBodies.length }));
    assert.equal(requestBodies.length, 1);
    assert.match(body.blocks.map((block) => block.text).join(" "), /화면이 한 번 깜박|스피커.*잡음/u);
    assert.equal(body.usage.inputTokens, 800);
    assert.equal(body.usage.outputTokens, 260);
    assert.ok(!(body.usage.qualityAdvisories ?? []).includes("입력 결과·인과 강제 오류"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("진척 재작성이 같은 약한 결과를 반복하면 원본을 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const modestTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "택배함 화면이 한 번 깜박였지만 위치 표기는 여전히 그대로였다. 원인은 확인되지 않았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "지금 확인 가능한 기록은 여기까지입니다. 같은 절차를 반복해도 새 결과는 나오지 않습니다.",
        speakerId: "NPC_ADVISER",
        speakerName: "한명진",
        emotion: "calm",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "09:05",
      location: "대학교 지하 1층 택배함",
      sceneSummary: "택배함 표시의 원인은 아직 확인되지 않았고 현장 절차는 끝났다.",
      memoryAdd: ["택배함 현장 절차에서 더 확인할 기록은 없었다."],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(modestTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(importedPack),
    location: "대학교 지하 1층 택배함",
    time: "09:03",
    sceneSummary: "택배함 앞에서 번호표를 살피고 있다.",
  };
  const recentTurns = [1, 2, 3].map((turn) => ({
    turn,
    userText: "택배함을 다시 확인한다.",
    location: "대학교 지하 1층 택배함",
    time: `09:0${turn}`,
    blocks: [{
      id: `blocked-scene-${turn}`,
      type: "narration" as const,
      text: "택배함의 차가운 철판과 번호표가 그대로 보였다.",
    }],
  }));
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: importedPack,
      state,
      userText: "택배함을 연다.",
      recentTurns,
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      warning?: string;
      code?: string;
      error?: string;
    };

    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 2);
    assert.ok(body.blocks.length >= 2);
    assert.match(body.warning ?? "", /입력을 버리지 않고|자동 보강/);
    assert.equal(body.code, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("나디아 장면 재작성에도 미래 습격이 남으면 응답 전체를 폐기한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const routeEvent = (id: string, name: string, description: string) => ({
    id,
    name,
    type: "Conditional",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: description,
    description,
  });
  const nadiaNpc = {
    ...importedPack.npcs[0],
    id: "NPC_MASTER_NADIA",
    name: "나디아 알 하다드",
    role: "프랑스인 이름고고학자·방문 연구자",
    publicInfo: "한성도시대학교 박물관 자료를 조사하러 온 방문 연구자",
    hiddenInfo: "비공개 마술사 정보는 첫 만남에서 절대 드러나지 않는다.",
  };
  const actZeroPack = {
    ...importedPack,
    projectId: "FATE-SEOUL-ROUTE-RECOVERY-TEST",
    npcs: [...importedPack.npcs, nadiaNpc],
    events: [
      routeEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
      routeEvent("EV_PROLOGUE_03_GRANDMOTHER_PARCEL", "1년 늦은 택배", "한명진 명의 택배"),
      routeEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "비 오는 캠퍼스의 방문 연구자", "나디아를 인간 연구자로 만난다"),
      routeEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
      routeEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
      routeEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "옛 민방위 방공호", "야간 추적"),
      routeEvent("EV_PROLOGUE_07_SABER_SUMMONING", "마법진의 소녀 검사", "최소 사용자 행동 7턴 + D+0 23:41 우발 소환으로 세이버가 현현"),
      routeEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "소환 뒤 첫 전투"),
      routeEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회 감독관", "오요한 신부의 설명"),
    ],
  };
  const prematureTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "나디아가 길 안내에 감사하고 떠난 직후 서촌 전역이 정전됐다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "종이가면의 습격이 시작되며 곧장 방공호 추적이 이어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "22:47",
      location: "서촌 배달 골목",
      sceneSummary: "나디아 대화 직후 서촌 정전 습격이 시작됐다.",
      memoryAdd: ["서촌에서 종이가면의 습격을 받았다."],
    },
    recommendations: [
      { label: "종이가면에게서 달아난다.", risk: "높음" },
      { label: "방공호로 향한다.", risk: "높음" },
      { label: "소환진을 확인한다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(prematureTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;
  const state = {
    ...createInitialState(actZeroPack),
    turn: 6,
    time: "16:12",
    location: "한성도시대학교 중앙 보행로 안내도 앞",
    sceneSummary: "나디아 알 하다드에게 박물관 별관으로 가는 길을 안내하고 있다.",
    memories: ["실종된 외할머니 한명진 명의의 택배를 수령했다."],
    encounteredCharacterIds: [nadiaNpc.id],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: actZeroPack,
      state,
      userText: "별관은 언덕 꼭대기에 있어서 교내 셔틀을 타는 편이 낫다고 설명한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; location: string; sceneSummary: string };
      recommendations: Array<{ label: string }>;
      warning?: string;
      code?: string;
      error?: string;
    };
    assert.equal(response.status, 422, JSON.stringify(body));
    assert.equal(body.code, "NARRATIVE_REWRITE_FAILED");
    assert.match(body.error ?? "", /이번 (?:턴|초안)(?:은|을) 저장하지 않았|세계 상태는 그대로 보존/u);
    assert.equal(body.blocks, undefined);
    return;
    const publicText = [
      ...body.blocks.map((block) => block.text),
      body.statePatch.sceneSummary,
      ...body.recommendations.map((recommendation) => recommendation.label),
    ].join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 3);
    assert.match(publicText, /나디아|이름고고학자/);
    assert.match(publicText, /떠나|만남.*끝|대화.*끝/);
    assert.doesNotMatch(publicText, /서촌|정전|종이가면|방공호|소환진/);
    assert.equal(body.statePatch.location, state.location);
    assert.equal(body.statePatch.time, "16:15");
    assert.match(body.warning ?? "", /현재 허용 사건까지만|사건 순서를 자동 복구/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("수령 가능 상태를 반복 출력하는 재작성은 원본을 완료 처리하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const routeEvent = (id: string, name: string, description: string) => ({
    id,
    name,
    type: "Conditional",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: description,
    description,
  });
  const nadiaNpc = {
    ...importedPack.npcs[0],
    id: "NPC_MASTER_NADIA_PARCEL_GUARD",
    name: "나디아 알 하다드",
    role: "프랑스인 방문 연구자",
  };
  const parcelGuardPack = {
    ...importedPack,
    projectId: "FATE-SEOUL-PARCEL-COMPLETION-GUARD-TEST",
    npcs: [...importedPack.npcs, nadiaNpc],
    events: [
      routeEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
      {
        ...routeEvent(
          "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
          "1년 늦은 택배",
          "한명진 명의 택배",
        ),
        effects: "열었을 때 황동열쇠·불탄 고문서 조각 획득.",
      },
      routeEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "비 오는 캠퍼스의 방문 연구자", "나디아를 인간 연구자로 만난다"),
      routeEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
      routeEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
      routeEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "옛 민방위 방공호", "야간 추적"),
      routeEvent("EV_PROLOGUE_07_SABER_SUMMONING", "마법진의 소녀 검사", "우발 소환"),
      routeEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "소환 뒤 첫 전투"),
      routeEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회 감독관", "오요한 신부의 설명"),
    ],
  };
  const prematureNadiaTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "가벼운 비 속에서 외국인 방문 연구자가 캠퍼스 안내도 앞에 멈춰 섰다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "대학박물관 별관은 어느 쪽인가요?",
        speakerId: nadiaNpc.id,
        speakerName: nadiaNpc.name,
        emotion: "차분함",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:38",
      location: parcelGuardPack.startLocation,
      sceneSummary: "나디아 알 하다드가 박물관으로 가는 길을 물었다.",
      inventoryAdd: [],
    },
    recommendations: [
      { label: "박물관 별관으로 가는 길을 알려준다.", risk: "낮음" },
      { label: "방문 목적을 묻는다.", risk: "낮음" },
      { label: "교내 안내 창구를 가리킨다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(prematureNadiaTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(parcelGuardPack),
    turn: 2,
    time: "15:35",
    inventory: [],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: parcelGuardPack,
      state,
      userText: "",
      advanceMode: "canonical",
      recentTurns: [{
        turn: 2,
        userText: "",
        blocks: [{
          type: "narration",
          text: "무인택배함에 택배가 도착해 수령 가능 상태가 표시됐다. 상자를 직접 확인할지 선택할 수 있다.",
        }],
      }],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { inventoryAdd: string[] };
      code?: string;
      error?: string;
    };

    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;

    assert.equal(response.status, 200, JSON.stringify(body));
    const publicText = body.blocks.map((block) => block.text).join(" ");
    assert.ok(requestBodies.length >= 2);
    assert.doesNotMatch(publicText, /나디아|박물관/u);
    assert.match(publicText, /실제\s*수령|수령이\s*완료/u);
    assert.match(publicText, /황동열쇠/u);
    assert.match(publicText, /불탄 고문서 조각/u);
    assert.deepEqual(
      [...body.statePatch.inventoryAdd].sort(),
      ["불탄 고문서 조각", "황동열쇠"].sort(),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("전문 문맥이 사용자 귀가 입력을 무시하고 미래 위협을 추천하면 Luna가 현재 장면에서 다시 쓴다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const routeEvent = (id: string, name: string, description: string) => ({
    id,
    name,
    type: "Conditional",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: description,
    description,
  });
  const nadiaNpc = {
    ...importedPack.npcs[0],
    id: "NPC_NADIA_CONTEXT_AUDIT",
    name: "나디아 알 하다드",
    role: "방문 연구자",
  };
  const contextPack = {
    ...importedPack,
    projectId: "FATE-SEOUL-CONTEXT-AUDIT-TEST",
    npcs: [...importedPack.npcs, nadiaNpc],
    events: [
      routeEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
      routeEvent("EV_PROLOGUE_03_GRANDMOTHER_PARCEL", "1년 늦은 택배", "한명진 명의 택배"),
      routeEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "비 오는 캠퍼스의 방문 연구자", "나디아와 인간으로 대화"),
      routeEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
      routeEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
      routeEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "옛 민방위 방공호", "야간 추적"),
      routeEvent("EV_PROLOGUE_07_SABER_SUMMONING", "마법진의 소녀 검사", "우발 소환"),
      routeEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "소환 뒤 첫 전투"),
      routeEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회 감독관", "오요한 신부의 설명"),
    ],
  };
  const ignoredTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "낮의 만남과 분리된 채 몇 시간이 흘렀다. 캠퍼스에는 저녁 식사 안내와 과제 마감 알림이 쌓였다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "학생식당 메뉴판과 배달 앱, 젖은 자전거 안장처럼 오늘 밤의 생활을 정해야 할 것들이 남았다. 아직 위험은 없었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "16:15",
      location: "한성도시대학교 공학관",
      weather: "비",
      sceneSummary: "캠퍼스에서 저녁 일정을 정해야 한다.",
    },
    recommendations: [
      { label: "종이가면 추적자와 거리를 벌릴 퇴로를 찾는다.", risk: "높음" },
      { label: "학생식당 메뉴판을 확인한다.", risk: "낮음" },
      { label: "젖은 자전거를 점검한다.", risk: "보통" },
    ],
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: "오늘 밤의 생활을 정해야 할 것들이 남았다.",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "학생식당 메뉴판과 배달 앱, 젖은 자전거 안장",
      routeEventStatus: "in_progress",
      routeEventEvidence: "",
      chronologyConsistent: true,
      chronologyNote: "현재 캠퍼스 시점에서 3분만 지났다.",
      recommendationsGrounded: true,
      recommendationBasis: ["학생식당 메뉴판", "젖은 자전거"],
      currentScene: "캠퍼스의 평범한 저녁",
      currentLocation: "한성도시대학교 공학관",
      activeCharacters: [],
      activeThreats: [],
    },
  };
  const correctedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "한시우는 공학관에서 가방을 챙겨 나와 빗속 귀가길에 올랐다. 정류장 처마를 두드리는 빗소리 사이로 집 방향 버스가 도착했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "버스에서 내려 익숙한 골목을 지나자 집 현관이 보였다. 한시우가 현관문 안으로 들어서며 귀가가 완료됐고, 젖은 가방과 외투를 정리할 수 있게 됐다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "16:30",
      location: "한시우의 집",
      weather: "비",
      sceneSummary: "비를 뚫고 귀가해 집 현관 안에 도착했다.",
    },
    recommendations: [
      { label: "현관에서 젖은 가방의 내용물을 정리한다.", risk: "낮음" },
      { label: "집 안의 전등과 창문을 확인한다.", risk: "보통" },
      { label: "따뜻한 물을 준비하며 휴대전화 알림을 확인한다.", risk: "낮음" },
    ],
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: "한시우가 현관문 안으로 들어서며 귀가가 완료됐고",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "버스에서 내려 익숙한 골목을 지나자 집 현관이 보였다.",
      routeEventStatus: "completed",
      routeEventEvidence: "한시우가 현관문 안으로 들어서며 귀가가 완료됐고",
      chronologyConsistent: true,
      chronologyNote: "16:12에서 16:30으로 이동 시간을 포함해 전진했다.",
      recommendationsGrounded: true,
      recommendationBasis: ["집 현관", "젖은 가방", "휴대전화"],
      currentScene: "비 오는 밤의 귀가 완료",
      currentLocation: "한시우의 집",
      activeCharacters: [],
      activeThreats: [],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1 ? ignoredTurn : correctedTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 900,
        output_tokens: 320,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;
  const state = {
    ...createInitialState(contextPack),
    turn: 5,
    time: "16:12",
    location: "한성도시대학교 공학관",
    weather: "비",
    sceneSummary: "나디아와의 낮 만남이 끝난 뒤 캠퍼스에 남아 있다.",
    memories: [
      "한명진 명의 택배를 실제로 수령했다.",
      "나디아 알 하다드가 길 안내에 감사하고 박물관 별관 쪽으로 떠났다.",
    ],
    encounteredCharacterIds: [nadiaNpc.id],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: contextPack,
      state,
      userText: "비도 오는데 집으로 돌아가기로 한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; location: string };
      recommendations: Array<{ label: string }>;
    };
    const publicText = body.blocks.map((block) => block.text).join(" ");
    const recommendationText = body.recommendations.map((item) => item.label).join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(requestBodies.length, 2);
    assert.match(publicText, /귀가가 완료|현관문 안/u);
    assert.equal(body.statePatch.location, "한시우의 집");
    assert.equal(body.statePatch.time, "16:30");
    assert.doesNotMatch(recommendationText, /종이가면|추적자|퇴로/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("문맥 재작성이 계속 입력 미처리로 판정되면 원본 장면을 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-CONTEXT-BRIDGE-FALLBACK",
    title: "비 오는 오후",
    genre: "현대 일상",
    events: [],
    npcs: [],
  };
  const conservativeAuditTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "창문을 닫자 빗소리가 유리 너머로 한 겹 멀어졌고, 책상 위로 튀던 빗방울도 더는 들어오지 않았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "방 안이 조용해지면서 젖은 창틀을 닦을지, 멈춰 둔 책을 다시 펼칠지 선택할 여유가 생겼다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:03",
      location: "주인공의 방",
      weather: "비",
      sceneSummary: "창문을 닫아 비가 들이치는 것을 막고 조용해진 방에 머물렀다.",
      memoryAdd: ["비가 들이치던 창문을 닫았다."],
    },
    recommendations: [
      { label: "젖은 창틀과 책상 위의 물기를 닦는다.", risk: "낮음" },
      { label: "멈춰 둔 책을 다시 펼친다.", risk: "낮음" },
      { label: "창밖의 빗줄기가 잦아드는지 확인한다.", risk: "보통" },
    ],
    narrativeAudit: {
      inputHandled: false,
      inputOutcome: "in_progress",
      inputEvidence: "창문을 닫자 빗소리가 유리 너머로 한 겹 멀어졌다.",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "책상 위로 튀던 빗방울도 더는 들어오지 않았다.",
      routeEventStatus: "not_started",
      routeEventEvidence: "",
      chronologyConsistent: true,
      chronologyNote: "15:00에서 15:03으로 이어졌다.",
      recommendationsGrounded: true,
      recommendationBasis: ["젖은 창틀", "멈춰 둔 책", "창밖의 빗줄기"],
      currentScene: "비 오는 오후의 방",
      currentLocation: "주인공의 방",
      activeCharacters: [],
      activeThreats: [],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(conservativeAuditTurn),
      usage: {
        input_tokens: 700,
        output_tokens: 250,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state: {
        ...createInitialState(pack),
        time: "15:00",
        location: "주인공의 방",
        weather: "비",
        sceneSummary: "열린 창문으로 비가 조금씩 들이치고 있다.",
      },
      userText: "창문을 닫고 방 안에 있기로 한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string; time: string };
      error?: string;
      code?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const publicText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(requestBodies.length >= 3);
    assert.match(publicText, /창문을 닫|빗방울도 더는 들어오지/u);
    assert.equal(body.statePatch.location, "주인공의 방");
    assert.equal(body.statePatch.time, "15:03");
    assert.equal(body.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("끝난 택배 사건을 재작성에서도 반복하면 원본과 자동 연결문을 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const routeEvent = (
    id: string,
    name: string,
    description: string,
    requiredItems = "",
  ) => ({
    id,
    name,
    type: "Conditional",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: description,
    description,
    required: true,
    requiredItems,
  });
  const nadia = {
    ...importedPack.npcs[0],
    id: "NPC_NADIA_NO_REGRESSION",
    name: "나디아 알 하다드",
    role: "방문 연구자",
  };
  const pack = {
    ...importedPack,
    projectId: "FATE-SEOUL-NO-PAST-REPLAY",
    npcs: [...importedPack.npcs, nadia],
    events: [
      routeEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
      routeEvent(
        "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
        "1년 늦은 택배",
        "한명진 명의 택배를 실제 수령한다.",
        "황동열쇠|불탄 고문서 조각",
      ),
      routeEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "비 오는 캠퍼스의 방문 연구자", "나디아와 인간으로 대화"),
      routeEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
      routeEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
      routeEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "옛 민방위 방공호", "야간 추적"),
      routeEvent("EV_PROLOGUE_07_SABER_SUMMONING", "마법진의 소녀 검사", "우발 소환"),
      routeEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "소환 뒤 첫 전투"),
      routeEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회 감독관", "신부의 설명"),
    ],
  };
  const regressedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "교내 배송 서버가 미수령 건의 처리 오류를 감지해 안내 단말로 긴급 전달을 연결했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "발송인 한명진의 봉투에서 황동열쇠와 불탄 고문서 조각이 다시 확인되어 소지품으로 등록됐다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "16:10",
      location: "대학교 박물관 별관 처마",
      sceneSummary: "별관 처마에서 과거 택배를 다시 수령했다.",
      inventoryAdd: ["황동열쇠", "불탄 고문서 조각"],
    },
    recommendations: [
      { label: "한명진 명의 배송 기록을 확인한다.", risk: "낮음" },
      { label: "황동열쇠를 다시 살핀다.", risk: "보통" },
      { label: "택배 처리 오류를 문의한다.", risk: "보통" },
    ],
    narrativeAudit: {
      inputHandled: false,
      inputOutcome: "in_progress",
      inputEvidence: "",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "황동열쇠와 불탄 고문서 조각이 다시 확인되어",
      routeEventStatus: "completed",
      routeEventEvidence: "황동열쇠와 불탄 고문서 조각이 다시 확인되어",
      chronologyConsistent: true,
      chronologyNote: "",
      recommendationsGrounded: true,
      recommendationBasis: ["배송 기록", "황동열쇠"],
      currentScene: "택배 재수령",
      currentLocation: "대학교 박물관 별관 처마",
      currentTime: "16:10",
      activeCharacters: [],
      activeThreats: [],
    },
  };
  globalThis.fetch = (async () => Response.json({
    output_text: JSON.stringify(regressedTurn),
    usage: {
      input_tokens: 800,
      output_tokens: 260,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
  })) as typeof fetch;
  const state = {
    ...createInitialState(pack),
    turn: 5,
    time: "16:05",
    location: "대학교 박물관 별관 처마",
    weather: "비",
    sceneSummary: "나디아와 인사를 마치고 별관 처마에 서 있다.",
    inventory: [],
    encounteredCharacterIds: [nadia.id],
  };
  const recentTurns = [
    {
      turn: 2,
      userText: "택배를 챙긴다.",
      blocks: [{
        id: "parcel-done",
        type: "narration" as const,
        text: "택배함을 열어 황동열쇠와 불탄 고문서 조각을 꺼내 가방에 챙겼다.",
      }],
    },
    {
      turn: 5,
      userText: "인스타그램 아이디를 묻는다.",
      blocks: [
        {
          id: "nadia-bye",
          type: "dialogue" as const,
          speakerId: nadia.id,
          speakerName: nadia.name,
          text: "nadia.names예요. 그럼 이만 들어갈게요.",
        },
        {
          id: "nadia-left",
          type: "narration" as const,
          text: "나디아는 별관 안으로 들어갔고 유리문이 닫혔다. 낮의 만남은 완전히 끝났다.",
        },
      ],
    },
  ];
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "나디아에게 인사하고 별관 처마를 떠난다.",
      recentTurns,
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string; inventoryAdd: string[] };
      recommendations: Array<{ label: string }>;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const text = body.blocks.map((block) => block.text).join(" ");
    const recommendations = body.recommendations.map((item) => item.label).join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.match(text, /별관.*떠났|자리를 떠났다/u);
    assert.doesNotMatch(text, /배송 서버|택배|다시 수령|소지품으로 등록/u);
    assert.equal(body.statePatch.location, "대학교 박물관 별관 앞 보행로");
    assert.ok(body.statePatch.inventoryAdd.includes("황동열쇠"));
    assert.ok(body.statePatch.inventoryAdd.includes("불탄 고문서 조각"));
    assert.doesNotMatch(recommendations, /나디아|한명진|택배/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("평온한 첫 만남의 빠른 종료는 경미한 품질 문제면 첫 초안을 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const routeEvent = (id: string, name: string, description: string) => ({
    id,
    name,
    type: "Conditional",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: description,
    description,
  });
  const nadiaNpc = {
    ...importedPack.npcs[0],
    id: "NPC_NADIA_SLOW_SCENE",
    name: "나디아 알 하다드",
    role: "방문 연구자",
  };
  const pacingPack = {
    ...importedPack,
    projectId: "FATE-SEOUL-SCENE-PACING-TEST",
    npcs: [...importedPack.npcs, nadiaNpc],
    events: [
      routeEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
      routeEvent("EV_PROLOGUE_03_GRANDMOTHER_PARCEL", "1년 늦은 택배", "한명진 명의 택배"),
      routeEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "비 오는 캠퍼스의 방문 연구자", "나디아와 인간으로 대화"),
      routeEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
      routeEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
      routeEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "옛 민방위 방공호", "야간 추적"),
      routeEvent("EV_PROLOGUE_07_SABER_SUMMONING", "마법진의 소녀 검사", "우발 소환"),
      routeEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "소환 뒤 첫 전투"),
      routeEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회 감독관", "오요한 신부의 설명"),
    ],
  };
  const quickExitTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "나디아는 안내받은 방향을 확인하자 곧바로 고개를 숙였다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "감사합니다. 그럼 이만 가볼게요.",
        speakerId: nadiaNpc.id,
        speakerName: nadiaNpc.name,
        emotion: "미소",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "16:05",
      location: "한성도시대학교 중앙 보행로",
      sceneSummary: "나디아가 길 안내에 감사하고 즉시 떠났다.",
    },
    recommendations: [
      { label: "캠퍼스 안쪽으로 돌아간다.", risk: "낮음" },
      { label: "수업 일정을 확인한다.", risk: "낮음" },
      { label: "학생식당으로 향한다.", risk: "보통" },
    ],
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: "감사합니다. 그럼 이만 가볼게요.",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "나디아는 안내받은 방향을 확인하자 곧바로 고개를 숙였다.",
      routeEventStatus: "completed",
      routeEventEvidence: "감사합니다. 그럼 이만 가볼게요.",
      chronologyConsistent: true,
      chronologyNote: "현재 장면에서 5분 전진했다.",
      recommendationsGrounded: true,
      recommendationBasis: ["캠퍼스", "수업 일정", "학생식당"],
      currentScene: "나디아와의 첫 만남 종료",
      currentLocation: "한성도시대학교 중앙 보행로",
      activeCharacters: [nadiaNpc.name],
      activeThreats: [],
    },
  };
  const continuedConversationTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "나디아는 안내받은 건물 방향과 젖은 캠퍼스 지도를 번갈아 본 뒤, 한시우가 가리킨 길을 손가락으로 천천히 짚었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "고마워요. 그런데 이 길은 저녁에도 개방되나요? 자료 확인이 조금 길어질 것 같아서요.",
        speakerId: nadiaNpc.id,
        speakerName: nadiaNpc.name,
        emotion: "호기심",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "16:05",
      location: "한성도시대학교 중앙 보행로",
      sceneSummary: "나디아가 길 안내에 반응하며 저녁 통행 가능 여부를 물었다.",
    },
    recommendations: [
      { label: "나디아에게 저녁 통행 가능한 길을 설명한다.", risk: "낮음" },
      { label: "나디아에게 박물관에서 확인할 자료가 무엇인지 묻는다.", risk: "보통" },
      { label: "나디아에게 안내판의 폐쇄 시간을 함께 확인하자고 제안한다.", risk: "낮음" },
    ],
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "resolved",
      inputEvidence: "나디아는 안내받은 건물 방향과 젖은 캠퍼스 지도를 번갈아 본 뒤",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "그런데 이 길은 저녁에도 개방되나요?",
      routeEventStatus: "in_progress",
      routeEventEvidence: "",
      chronologyConsistent: true,
      chronologyNote: "같은 장소에서 5분 전진했다.",
      recommendationsGrounded: true,
      recommendationBasis: ["나디아", "저녁 통행", "박물관 자료", "안내판"],
      currentScene: "나디아와 길 안내를 계기로 대화하는 중",
      currentLocation: "한성도시대학교 중앙 보행로",
      activeCharacters: [nadiaNpc.name],
      activeThreats: [],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1
      ? quickExitTurn
      : continuedConversationTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 850,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;
  const state = {
    ...createInitialState(pacingPack),
    turn: 3,
    time: "16:00",
    location: "한성도시대학교 중앙 보행로",
    sceneSummary: "택배 사건이 끝난 뒤 캠퍼스 보행로를 지나고 있다.",
    memories: ["한명진 명의 택배를 실제로 수령했다."],
    variables: [{
      id: "RELAY_SERVER_STORY_ROUTE_PROGRESS",
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "ordinary_before_parcel",
        eventId: "EV_PROLOGUE_02_MAP_GLITCH",
        completedEventIds: ["EV_PROLOGUE_03_GRANDMOTHER_PARCEL"],
        adjudication: "semantic-v1",
      }),
      visibility: "hidden" as const,
      reason: "test",
      status: "active" as const,
      createdTurn: 3,
    }],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: pacingPack,
      state,
      userText: "박물관 별관으로 가는 길을 알려준다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { variablesAdd: Array<{ id: string }> };
    };
    const publicText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(requestBodies.length, 1);
    assert.match(publicText, /이만 가볼게요|즉시 떠났다/u);
    assert.equal(
      body.statePatch.variablesAdd.some((variable) =>
        variable.id === "RELAY_SERVER_STORY_ROUTE_PROGRESS"
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 시설 직원 장면 점유는 권고만 남기고 추가 호출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const majorNpc = importedPack.npcs[0];
  const staffLoopTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "dialogue",
        text: "오전 담당자의 확인이 더 필요합니다.",
        speakerId: "dynamic-facility-staff",
        speakerName: "시설관리 직원",
        emotion: "난처함",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "학생지원실에도 같은 내용을 다시 문의해 주세요.",
        speakerId: "dynamic-support-desk",
        speakerName: "학생지원실 직원",
        emotion: "사무적",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "07:04",
      location: "대학교 시설관리실 앞",
      sceneSummary: "시설 직원들이 추가 확인 절차를 안내하고 있다.",
      clockChanges: [{ clockId: "demo", delta: 1, reason: "확인 절차가 늘어났다." }],
    },
    recommendations: [
      { label: "시설관리 직원에게 다시 확인해 달라고 요청한다.", risk: "낮음" },
      { label: "학생지원실 직원에게 다른 담당자를 불러 달라고 요구한다.", risk: "보통" },
      { label: "관리실에서 답이 나올 때까지 기다린다.", risk: "낮음" },
    ],
  };
  const handedOffTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "직원들은 업무로 복귀했다. 그 순간 복도 창문이 강한 충격으로 떨리고, 교내 경보와는 다른 낮은 진동이 건물 전체를 훑었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "여기 있었구나. 지금은 그 사람들 설명을 들을 때가 아니야. 바깥에서 무언가 들어오고 있어.",
        speakerId: majorNpc.id,
        speakerName: majorNpc.name,
        emotion: "긴박",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "07:05",
      location: "대학교 시설관리실 앞",
      sceneSummary: "시설 업무는 종료됐고, 주요 인물이 외부 침입의 징후와 함께 장면을 이어받았다.",
      clockChanges: [{ clockId: "demo", delta: 1, reason: "외부 침입 징후가 현실화됐다." }],
    },
    recommendations: [
      { label: "시설관리 직원에게 경보의 원인을 묻는다.", risk: "낮음" },
      { label: "관리실에 다시 연락해 출입 기록을 요구한다.", risk: "보통" },
      { label: `${majorNpc.name}에게 방금 감지한 위험을 구체적으로 묻는다.`, risk: "높음" },
    ],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1 ? staffLoopTurn : handedOffTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(importedPack),
    turn: 18,
    time: "07:03",
    location: "대학교 시설관리실 앞",
    sceneSummary: "시설관리팀과 택배 기록을 확인하고 있다.",
  };
  const recentTurns = [
    ["시설관리 직원", "다른 담당자에게 확인해야 합니다."],
    ["당직 관리인", "학생지원실로 다시 문의해 주세요."],
    ["학생지원실 직원", "시설팀의 회신을 기다려 주세요."],
  ].map(([speakerName, text], index) => ({
    turn: 15 + index,
    userText: "확인 결과를 묻는다.",
    location: "대학교 시설관리실 앞",
    time: `07:0${index}`,
    blocks: [{
      id: `staff-block-${index}`,
      type: "dialogue" as const,
      text,
      speakerId: `dynamic-staff-${index}`,
      speakerName,
    }],
  }));
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: importedPack,
      state,
      userText: "이어서 상황을 본다.",
      recentTurns,
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ speakerName?: string; text: string }>;
      recommendations: Array<{ label: string }>;
      usage: { qualityAdvisories?: string[] };
    };
    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.equal(body.blocks.at(-1)?.speakerName, "학생지원실 직원");
    assert.ok((body.usage.qualityAdvisories ?? []).includes("장면 초점 이탈"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트도 미공개 진명 누설은 즉시 재작성한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const saberNpc = {
    ...importedPack.npcs[0],
    id: "NPC_SABER",
    name: "붉은 옥새의 소녀 검사",
    role: "Saber 클래스 서번트",
    appearance: "붉은 곤룡포와 조선식 검을 갖춘 흑발의 소녀",
    publicInfo: "진명을 밝히지 않은 소녀 검사",
    hiddenInfo: "진명 정조 이산",
  };
  const fatePack = {
    ...importedPack,
    npcs: [...importedPack.npcs, saberNpc],
    mediaAssets: [
      ...(importedPack.mediaAssets ?? []),
      {
        id: "saber-red-gonryongpo",
        path: "images/characters/NPC_SABER/red-gonryongpo.webp",
        kind: "character" as const,
        characterId: "NPC_SABER",
        characterName: "붉은 옥새의 소녀 검사",
        label: "붉은 곤룡포 공식 기준본",
        emotionTags: ["canonical", "default"],
        sceneTags: ["summoning"],
        placement: "after_block" as const,
        priority: 50,
        alt: "붉은 곤룡포를 입은 소녀 검사",
        caption: "소녀 검사의 첫 현현",
        source: "package" as const,
        canonical: true,
      },
      {
        id: "saber-summoning-circle-scene",
        path: "images/scenes/saber-summoning-circle.webp",
        kind: "scene" as const,
        characterId: "NPC_SABER",
        characterName: "붉은 옥새의 소녀 검사",
        label: "붉은 마법진 첫 현현",
        emotionTags: [],
        sceneTags: ["summoning", "magic-circle", "first-appearance"],
        placement: "after_block" as const,
        priority: 20,
        alt: "붉은 마법진에서 현현한 소녀 검사",
        caption: "계약 서번트의 소환",
        source: "package" as const,
        canonical: false,
      },
    ],
    events: [{
      id: "EVENT_ACCIDENTAL_SUMMONING",
      name: "한시우의 우발 소환",
      type: "Fixed Timeline",
      visibility: "Hidden",
      status: "Planned",
      priority: 100,
      conditions: "D+0 23:41",
      description: "세이버가 현현한다. 진명 정조는 비공개다.",
    }],
  };
  const delayedTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "집 안은 조용했고 화면에 정조라는 이름만 잠깐 나타났다가 사라졌다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "22:55",
      location: "한시우의 집",
      sceneSummary: "한시우의 집에 별다른 변화 없이 시간이 흘렀다.",
      memoryAdd: [],
    },
    recommendations: [
      { label: "계속 기다린다.", risk: "낮음" },
      { label: "창밖을 다시 살핀다.", risk: "보통" },
      { label: "잠을 청한다.", risk: "낮음" },
    ],
  };
  const summonedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "저녁의 남은 시간은 빠르게 흘렀다. 23시 41분, 건물 전체의 전등이 동시에 꺼졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "현관 밖에서 무언가 문을 부수려는 충격이 이어지자 바닥의 붉은 선과 촉매가 저절로 타올랐다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "폭발한 빛 속에서 우발 소환이 발생했다. 소환진 한가운데 검을 든 소녀 검사가 현현해 문을 뚫고 날아든 칼날을 검으로 막았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "묻겠다. 그대가 나의 마스터인가.",
        speakerId: "NPC_SABER",
        speakerName: "붉은 옥새의 소녀 검사",
        emotion: "경계",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "23:41",
      location: "한시우의 집",
      sceneSummary: "외부 침입과 촉매 반응으로 우발 소환이 발생해 소녀 검사가 현현했다.",
      memoryAdd: ["23시 41분, 붉은 빛 속에서 진명을 밝히지 않은 소녀 검사가 현현했다."],
      encounteredCharactersAdd: [{
        characterId: "NPC_SABER",
        name: "붉은 옥새의 소녀 검사",
        relationType: "첫 대면",
      }],
    },
    recommendations: [
      { label: "소녀 검사에게 지금 상황을 설명해 달라고 요청한다.", risk: "낮음" },
      { label: "소녀 검사에게 문밖의 침입자를 막아 달라고 요구한다.", risk: "보통" },
      { label: "현관을 봉쇄하고 즉시 안전한 곳으로 이동한다.", risk: "높음" },
    ],
    characterVisuals: [{
      blockIndex: 2,
      characterId: "NPC_SABER",
      characterName: "붉은 옥새의 소녀 검사",
      importance: "major",
      isFirstMajorAppearance: true,
      appearancePrompt: "검은 사무라이식 갑옷을 입은 흑발의 소녀 검사",
      reason: "메인 계약 서번트의 첫 현현",
    }],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1 ? delayedTurn : summonedTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 900,
        output_tokens: 400,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(fatePack),
    turn: 12,
    time: "22:50",
    location: "한시우의 집",
    sceneSummary: "택배함 단서에서 벗어나 집에서 상황을 정리하고 있다.",
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: fatePack,
      state,
      userText: "그냥 집에서 기다린다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string; mediaAssetId?: string }>;
      characterVisuals: Array<{
        characterId: string;
        appearancePrompt: string;
        canonicalAssetId: string;
        source: string;
      }>;
      usage: { outputTokenLimit?: number; reasoningEffort?: string };
    };
    const secondInput = requestBodies[1].input as Array<Record<string, unknown>>;
    const correctionText = ((secondInput[1].content as Array<Record<string, unknown>>)[0]
      .text) as string;
    assert.equal(response.status, 200, JSON.stringify(body));
    const storyText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0]?.max_output_tokens, 3000);
    assert.equal(body.usage.outputTokenLimit, 3000);
    assert.equal(body.usage.reasoningEffort, "none");
    assert.match(correctionText, /Relay Nexus v31 강제 오류 교정/);
    assert.match(correctionText, /미공개 정체 누설/u);
    assert.match(correctionText, /직전 초안 JSON/u);
    assert.doesNotMatch(correctionText, /longTermMemoryTimeline|recentTurns/u);
    assert.match(correctionText, /미공개 정체·클래스 누설 재작성 지시/);
    assert.match(storyText, /우발 소환|소환진/);
    assert.match(storyText, /묻겠다\. 그대가 나의 마스터인가/);
    assert.doesNotMatch(storyText, /정조|이산/);
    assert.ok(
      body.blocks.some(
        (block) => block.mediaAssetId === "saber-summoning-circle-scene",
      ),
    );
    assert.equal(body.characterVisuals[0]?.characterId, "NPC_SABER");
    assert.match(body.characterVisuals[0]?.appearancePrompt ?? "", /붉은 곤룡포/);
    assert.doesNotMatch(body.characterVisuals[0]?.appearancePrompt ?? "", /사무라이|갑옷/);
    assert.equal(body.characterVisuals[0]?.canonicalAssetId, "saber-red-gonryongpo");
    assert.equal(body.characterVisuals[0]?.source, "package");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("소환 후 관계 장면 부족은 품질 권고만 기록하고 초안을 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const saberNpc = {
    ...importedPack.npcs[0],
    id: "NPC_SABER_DAILY",
    name: "붉은 옥새의 소녀 검사",
    role: "Saber 클래스 서번트",
    appearance: "붉은 곤룡포와 조선식 검을 갖춘 흑발의 소녀",
    publicInfo: "진명과 클래스를 밝히지 않은 계약 서번트",
    hiddenInfo: "진명 정조 이산. 개혁과 백성의 삶을 중시한다.",
  };
  const fatePack = {
    ...importedPack,
    npcs: [...importedPack.npcs, saberNpc],
    mediaAssets: [
      {
        id: "jeongjo-canonical",
        path: "images/characters/NPC_SABER_DAILY/red-gonryongpo.webp",
        kind: "character" as const,
        characterId: saberNpc.id,
        characterName: saberNpc.name,
        label: "붉은 곤룡포 기준본",
        emotionTags: ["canonical", "default"],
        sceneTags: ["first-appearance"],
        placement: "after_block" as const,
        priority: 100,
        alt: "붉은 곤룡포를 입은 소녀 검사",
        caption: "공식 외형 기준본",
        source: "package" as const,
        canonical: true,
      },
      {
        id: "jeongjo-modern-daily",
        path: "images/characters/NPC_SABER_DAILY/modern-daily.webp",
        kind: "character" as const,
        characterId: saberNpc.id,
        characterName: saberNpc.name,
        label: "현대 서울 일상 사복",
        emotionTags: ["curious"],
        sceneTags: ["daily", "modern-life", "casual"],
        placement: "after_block" as const,
        priority: 20,
        alt: "현대 생활을 살피는 소녀 검사",
        caption: "서울에서의 첫 일상",
        source: "package" as const,
        canonical: false,
      },
    ],
  };
  const noBondTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "집 안의 오전은 별다른 대화 없이 조용히 흘렀다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "창밖의 차량 소리만 규칙적으로 이어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "10:25",
      location: "한시우의 집",
      sceneSummary: "집에서 조용한 오전을 보내고 있다.",
      memoryAdd: [],
    },
    recommendations: [
      { label: "창밖을 살핀다.", risk: "낮음" },
      { label: "휴대전화를 확인한다.", risk: "낮음" },
      { label: "잠시 더 쉰다.", risk: "낮음" },
    ],
  };
  const dailyBondTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "소녀 검사는 탁자 위 스마트폰의 시민 민원 앱과 서울 지도를 빠르게 넘겨 보았다. 처음 보는 기계였지만 사용법을 익히는 속도는 놀라울 만큼 빨랐다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "백성이 직접 고충을 올릴 수 있다니 좋은 제도군. 하지만 답하지 않는 관청이라면 이름만 달라졌을 뿐이다. 이 시대의 행정은 늘 이렇게 빠른가?",
        speakerId: saberNpc.id,
        speakerName: saberNpc.name,
        emotion: "호기심",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "10:28",
      location: "한시우의 집",
      sceneSummary: "소녀 검사가 스마트폰의 현대 행정 체계를 살피며 한시우에게 질문했다.",
      memoryAdd: ["소녀 검사는 현대의 시민 민원 제도에 깊은 관심을 보였다."],
    },
    recommendations: [
      { label: "스마트폰 민원 제도가 실제로 어떻게 운영되는지 설명한다.", risk: "낮음" },
      { label: "서울의 행정기관을 직접 둘러보자고 제안한다.", risk: "보통" },
      { label: "그녀가 생각하는 좋은 통치가 무엇인지 묻는다.", risk: "보통" },
    ],
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const turn = requestBodies.length === 1 ? noBondTurn : dailyBondTurn;
    return Response.json({
      output_text: JSON.stringify(turn),
      usage: {
        input_tokens: 800,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(fatePack),
    turn: 18,
    time: "10:20",
    location: "한시우의 집",
    sceneSummary: "성배전쟁의 첫 밤이 지난 뒤 집에서 쉬고 있다.",
    encounteredCharacterIds: [saberNpc.id],
    characterVisuals: [{
      characterId: saberNpc.id,
      characterName: saberNpc.name,
      appearancePrompt: saberNpc.appearance,
      assetId: "jeongjo-canonical",
      source: "package" as const,
      introducedTurn: 12,
    }],
  };
  const recentTurns = [15, 16, 17].map((turn) => ({
    turn,
    userText: "주변 상황을 정리한다.",
    location: "한성도시대학교 교정",
    time: `09:${turn}`,
    blocks: [{
      id: `daily-gap-${turn}`,
      type: "narration" as const,
      text: "대학의 오전 일정이 이어졌다.",
    }],
  }));
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: fatePack,
      state,
      userText: "집에서 잠시 쉬기로 한다.",
      recentTurns,
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string; speakerName?: string; mediaAssetId?: string }>;
      usage: { qualityAdvisories?: string[] };
    };
    const visibleText = body.blocks
      .flatMap((block) => [block.speakerName ?? "", block.text])
      .join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.match(visibleText, /조용히 흘렀|차량 소리/u);
    assert.doesNotMatch(visibleText, /정조|이산|세이버/);
    assert.ok((body.usage.qualityAdvisories ?? []).includes("인물 관계 연속성"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("대용량 패키지는 바이너리를 빼고 관련 설정만 프롬프트 예산 안에 넣는다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json(
      { error: { message: "temporary upstream failure" } },
      { status: 500 },
    );
  }) as typeof fetch;
  const hugePack = {
    ...importedPack,
    projectId: `FATE-${"아주긴프로젝트아이디".repeat(30)}`,
    world: {
      ...importedPack.world,
      relevantLore: `서울 성배전쟁 ${"왕관의 균열 ".repeat(80_000)}`,
    },
    gmData: {
      ...importedPack.gmData,
      imageData: `data:image/png;base64,${"A".repeat(800_000)}`,
      appendix: "후순위 비밀 설정 ".repeat(80_000),
    },
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: hugePack,
      state: createInitialState(hugePack),
      userText: "서울 성배전쟁의 왕관 균열을 조사한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    assert.equal(response.status, 502);
    assert.ok(capturedBody);
    const input = capturedBody.input as Array<Record<string, unknown>>;
    const developerText = ((input[0].content as Array<Record<string, unknown>>)[0]
      .text) as string;
    const dynamicText = ((input[1].content as Array<Record<string, unknown>>)[0]
      .text) as string;

    assert.ok(developerText.length <= 180_000);
    assert.ok(dynamicText.length <= 60_000);
    assert.equal(developerText.includes("data:image/png;base64"), false);
    assert.match(developerText, /\[출력 계약\]/);
    assert.match(dynamicText, /서울 성배전쟁/);
    assert.match(dynamicText, /scene-context-v1/);
    assert.match(dynamicText, /"mode":"brisk"/);
    assert.match(dynamicText, /"minimumStoryBeats":3/);
    assert.match(dynamicText, /characterKnowledgeLedger/u);
    assert.match(dynamicText, /다른 인물 항목의 비공개 사실은 전달 장면 전까지 모른다/u);
    assert.ok(Number(capturedBody.max_output_tokens) <= 3800);
    assert.ok(String(capturedBody.prompt_cache_key).length <= 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("전투 장면은 3800토큰을 쓰고 단순 대화는 더 작은 적응형 상한을 쓴다", async () => {
  const originalFetch = globalThis.fetch;
  const captured: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json(
      { error: { message: "temporary upstream failure" } },
      { status: 500 },
    );
  }) as typeof fetch;
  const genericPack = {
    ...demoScenario,
    projectId: "ADAPTIVE-OUTPUT-BUDGET-TEST",
    title: "적응형 출력 예산",
    events: [],
    constraints: [],
    clocks: [],
  };

  try {
    const combatResponse = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack: genericPack,
        state: createInitialState(genericPack),
        userText: "정면의 적과 전투를 시작한다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    assert.equal(combatResponse.status, 502);
    assert.equal(captured.at(-1)?.max_output_tokens, 3800);
    assert.equal(
      (captured.at(-1)?.reasoning as { effort?: string })?.effort,
      "medium",
    );

    const dialogueResponse = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack: genericPack,
        state: createInitialState(genericPack),
        userText: "안녕하세요. 지금 잠깐 이야기할 수 있을까요?",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    assert.equal(dialogueResponse.status, 502);
    assert.equal(captured.at(-1)?.max_output_tokens, 2000);
    assert.equal(
      (captured.at(-1)?.reasoning as { effort?: string })?.effort,
      "none",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("이어서 진행은 빈 입력으로 정석 자동 전개 요청을 보낼 수 있다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  const genericPack = {
    ...demoScenario,
    projectId: "GENERIC-CANONICAL-ADVANCE-TEST",
    title: "첫 번째 공명",
    genre: "초능력 아카데미",
  };
  const progressedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "수업 종료 종이 울리자 복도 비상등이 켜졌고, 담당 교사가 학생들을 즉시 운동장으로 이동시키기 시작했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "능력설계실 문이 열리고 대피 방송이 반복됐다. 학생들은 교실을 빠져나와 아카데미 본관 복도에 들어섰고, 평범한 오전 수업은 완전히 끝났다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "10:15",
      location: "아카데미 본관 복도",
      sceneSummary: "비상등과 대피 방송으로 평범한 수업 장면이 종료됐다.",
    },
  };
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      output_text: JSON.stringify(progressedTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(genericPack),
    time: "09:00",
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: genericPack,
      state,
      userText: "",
      advanceMode: "canonical",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as { blocks: Array<{ text: string }> };
    const input = capturedBody?.input as Array<Record<string, unknown>>;
    const developerText = ((input[0].content as Array<Record<string, unknown>>)[0]
      .text) as string;
    const dynamicText = ((input[1].content as Array<Record<string, unknown>>)[0]
      .text) as string;

    assert.equal(response.status, 200);
    assert.match(developerText, /\[V31_WRITER_CORE_BEGIN\]/);
    assert.match(dynamicText, /"advanceMode":"canonical"/);
    assert.match(dynamicText, /"playerInputContract":\{"original":""/);
    assert.match(body.blocks[0]?.text ?? "", /비상등|대피/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("비-Fate 필수 계약 누락이 재작성에도 남으면 서버 문장을 덧붙여 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const guide = {
    ...demoScenario.npcs[0],
    id: "NPC_GUIDE_MIRA",
    name: "사서 미라",
    role: "폐쇄 서고의 안내인",
    appearance: "짙은 남색 제복과 은색 열쇠 목걸이",
  };
  const canonicalAsset = {
    id: "mira-canonical",
    path: "characters/mira.webp",
    kind: "character" as const,
    characterId: guide.id,
    characterName: guide.name,
    label: "미라 대표 이미지",
    emotionTags: ["canonical"],
    sceneTags: [],
    placement: "after_block" as const,
    priority: 1000,
    alt: guide.name,
    caption: guide.name,
    source: "package" as const,
    canonical: true,
  };
  const eventAsset = {
    ...canonicalAsset,
    id: "archive-opening-scene",
    path: "scenes/archive-opening.webp",
    kind: "scene" as const,
    characterId: "",
    characterName: "",
    label: "봉인 서고 개방",
    emotionTags: [],
    sceneTags: ["EVENT_OPEN_ARCHIVE"],
    priority: 1,
    canonical: false,
    triggerId: "TRIGGER_ARCHIVE_OPEN",
    triggerSourceId: "EVENT_OPEN_ARCHIVE",
  };
  const pack = {
    ...demoScenario,
    projectId: "CLOCKWORK-LIBRARY-SIMULATE-TEST",
    title: "시계도서관의 마지막 열쇠",
    genre: "미스터리 어드벤처",
    npcs: [guide],
    events: [{
      ...demoScenario.events[0],
      id: "EVENT_OPEN_ARCHIVE",
      name: "봉인 서고 개방",
      visibility: "Hidden",
      status: "Planned",
      priority: 100,
      conditions: "첫 탐색 장면 이후",
      participants: guide.id,
      effects: "봉인문이 열리고 청동 인장을 회수한다.",
      description: "사서 미라의 도움으로 봉인 서고가 열린다.",
      required: true,
      sequence: 1,
      completionSignals: "봉인문이 열렸다|봉인이 해제됐다",
      requiredItems: "청동 인장",
      requiredDialogue: "문이 열렸습니다.",
      requiredSpeakerId: guide.id,
      recoveryAlternatives: "관리용 통로의 잠금장치가 자동 해제된다",
      preservePlayerChoice: true,
      endSceneAfterCompletion: true,
    }],
    imageTriggers: [{
      id: "TRIGGER_ARCHIVE_OPEN",
      name: "봉인 서고 개방 CG",
      enabled: true,
      visibility: "Hidden",
      triggerType: "event_success",
      sourceId: "EVENT_OPEN_ARCHIVE",
      threshold: 0,
      storyProgress: "",
      customCondition: "",
      mode: "show_trigger_image",
      characterIds: [guide.id],
      prompt: "",
      negativePrompt: "",
      once: true,
      priority: 100,
      outputPosition: "after_scene",
    }],
    mediaAssets: [canonicalAsset, eventAsset],
  };
  const omittedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "폐쇄 서고 앞의 먼지가 비상등 아래에서 천천히 가라앉았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "잠금장치를 조금 더 살펴보겠습니다.",
        speakerId: guide.id,
        speakerName: guide.name,
        emotion: "침착함",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "09:03",
      location: "시계도서관 폐쇄 서고 앞",
      sceneSummary: "사서 미라가 폐쇄 서고의 잠금장치를 살피고 있다.",
      inventoryAdd: [],
      memoryAdd: [],
      encounteredCharactersAdd: [],
    },
    image: {
      recommended: false,
      reason: "이미지 생성 주기가 아니다.",
      prompt: "",
      characterIds: [],
    },
    characterVisuals: [],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(omittedTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state: { ...createInitialState(pack), time: "09:00" },
      userText: "",
      advanceMode: "canonical",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string; speakerId?: string; mediaAssetId?: string }>;
      statePatch: {
        inventoryAdd: string[];
        encounteredCharactersAdd: Array<{ characterId: string }>;
        memoryAdd: string[];
        variablesAdd: Array<{ id: string; detail: string }>;
      };
      characterVisuals: Array<{ characterId: string; canonicalAssetId: string }>;
      image: { characterIds: string[] };
      warning?: string;
      code?: string;
      error?: string;
    };

    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;

    assert.equal(response.status, 200);
    assert.match(body.blocks.map((block) => block.text).join(" "), /봉인문이 열렸다/);
    assert.equal(body.blocks.at(-1)?.text, "문이 열렸습니다.");
    assert.equal(body.blocks.at(-1)?.speakerId, guide.id);
    assert.equal(body.blocks.at(-1)?.mediaAssetId, eventAsset.id);
    assert.ok(body.statePatch.inventoryAdd.includes("청동 인장"));
    assert.ok(body.statePatch.memoryAdd.some((memory) => /봉인|서고|사건/u.test(memory)));
    assert.ok(body.statePatch.variablesAdd.some((variable) =>
      variable.id === "RELAY_SERVER_STORY_ROUTE_PROGRESS" &&
      /EVENT_OPEN_ARCHIVE/.test(variable.detail)
    ));
    assert.ok(
      body.statePatch.encounteredCharactersAdd.some(
        (entry) => entry.characterId === guide.id,
      ),
    );
    assert.equal(body.characterVisuals[0]?.canonicalAssetId, canonicalAsset.id);
    assert.ok(body.image.characterIds.includes(guide.id));
    assert.match(body.warning ?? "", /필수 사건.*자동 복구/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI 오류에 섞인 API 키 모양 문자열은 화면에 노출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      {
        error: {
          message: "Rejected credential sk-this-is-a-secret-test-value",
          code: "invalid_api_key",
        },
      },
      { status: 401 },
    )) as typeof fetch;

  try {
    const response = await POST(requestFor("sk-test-do-not-store"));
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 502);
    assert.match(String(body.error), /API 키 숨김/);
    assert.doesNotMatch(String(body.error), /this-is-a-secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("다른 작품에서도 Luna가 미래 사건의 트리거 이미지 ID를 보내면 서버가 차단한다", async () => {
  const originalFetch = globalThis.fetch;
  const futureAsset = {
    id: "future-star-gate-scene",
    path: "scenes/future-star-gate.webp",
    kind: "scene" as const,
    characterId: "",
    characterName: "",
    label: "별문 개방",
    emotionTags: [],
    sceneTags: ["EVENT_OPEN_STAR_GATE", "별문 개방"],
    placement: "after_block" as const,
    priority: 1000,
    alt: "미래의 별문 개방 장면",
    caption: "",
    source: "package" as const,
    canonical: false,
    triggerId: "TRIGGER_OPEN_STAR_GATE",
    triggerSourceId: "EVENT_OPEN_STAR_GATE",
  };
  const firstEvent = {
    ...demoScenario.events[0],
    id: "EVENT_FIRST_BELL",
    name: "첫 번째 종",
    required: true,
    sequence: 1,
    priority: 100,
    completionSignals: "첫 번째 종이 울렸다",
    requiredItems: "",
    requiredDialogue: "",
    requiredSpeakerId: "",
    recoveryAlternatives: "복도의 자동 종이 울린다",
    endSceneAfterCompletion: true,
  };
  const futureEvent = {
    ...demoScenario.events[0],
    id: "EVENT_OPEN_STAR_GATE",
    name: "별문 개방",
    required: true,
    sequence: 2,
    priority: 100,
    completionSignals: "별문이 열렸다",
    requiredItems: "",
    requiredDialogue: "",
    requiredSpeakerId: "",
    recoveryAlternatives: "천문대의 보조 관측문이 열린다",
    endSceneAfterCompletion: true,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-FUTURE-TRIGGER-FIREWALL",
    title: "별빛 천문대의 기록",
    genre: "현대 판타지",
    events: [firstEvent, futureEvent],
    imageTriggers: [{
      id: "TRIGGER_OPEN_STAR_GATE",
      name: "별문 개방 CG",
      enabled: true,
      visibility: "Hidden",
      triggerType: "event_success",
      sourceId: futureEvent.id,
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
    mediaAssets: [futureAsset],
  };
  const maliciousTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "오전 아홉 시, 복도에서 첫 번째 종이 울렸다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: futureAsset.id,
      },
      {
        type: "narration",
        text: "학생들은 평소처럼 첫 수업을 준비했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      sceneSummary: "첫 번째 종이 울리고 평범한 수업 준비가 시작됐다.",
      memoryAdd: ["첫 번째 종이 울렸다."],
    },
    characterVisuals: [],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(maliciousTurn),
      usage: {
        input_tokens: 800,
        output_tokens: 220,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  try {
    const response = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state: createInitialState(pack),
        userText: "첫 수업을 준비한다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    const body = (await response.json()) as {
      blocks: Array<{ text: string; mediaAssetId?: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(
      body.blocks.some((block) => block.mediaAssetId === futureAsset.id),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("필수 소품 누락이 재작성에도 남으면 원본에 별도 배송 문장을 붙이지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const routeEvent = (
    id: string,
    name: string,
    description: string,
    effects = "",
  ) => ({
    id,
    name,
    type: "Conditional",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: description,
    cancelConditions: "",
    participants: "한시우",
    effects,
    description,
    onSuccess: "",
    onFailure: "",
    followUp: "",
    playerCanIntervene: true,
  });
  const continuityPack = {
    ...hiddenInventoryPack,
    projectId: "FATE-SEOUL-REQUIRED-CONTINUITY-TEST",
    player: {
      ...hiddenInventoryPack.player,
      inventory: "황동열쇠, 불탄 고문서 조각",
    },
    events: [
      routeEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
      routeEvent(
        "EV_PROLOGUE_03_GRANDMOTHER_PARCEL",
        "1년 늦은 택배",
        "발송인 한명진. 실종 전 예약 흔적이 남은 무인택배함이다.",
        "열었을 때 황동열쇠·불탄 고문서 조각 획득.",
      ),
      routeEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "방문 연구자", "나디아 인간 대화"),
      routeEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
      routeEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
      routeEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "방공호 추적", "야간 추적"),
      routeEvent("EV_PROLOGUE_07_SABER_SUMMONING", "우발 소환", "소녀 검사 현현"),
      routeEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "첫 전투"),
      routeEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회", "감독관 설명"),
    ],
  };
  const cashOnlyTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "열린 무인택배함 안에는 사용자가 확인한 돈뭉치만 놓여 있었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "system",
        text: "[수령 완료] 기존 보관함의 배송 처리가 끝났습니다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:42",
      location: "한성도시대학교 무인택배함",
      sceneSummary: "무인택배함에서 돈뭉치만 확인됐다.",
      inventoryAdd: ["돈뭉치"],
      memoryAdd: ["첫 번째 택배함에는 돈뭉치뿐이었다."],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(cashOnlyTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(continuityPack),
    turn: 2,
    time: "15:40",
    location: "한성도시대학교 무인택배함",
    sceneSummary: "한명진 명의 택배 알림을 확인했다.",
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: continuityPack,
      state,
      userText: "무인택배함을 열었다. 그곳에는 돈뭉치뿐이었다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { inventoryAdd: string[] };
      warning?: string;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const publicText = body.blocks.map((block) => block.text).join(" ");
    const secondInput = requestBodies[1]?.input as Array<Record<string, unknown>>;
    const correctionText = secondInput
      ? ((secondInput[1].content as Array<Record<string, unknown>>)[0].text as string)
      : "";

    assert.equal(response.status, 200);
    assert.ok(requestBodies.length >= 2);
    assert.match(correctionText, /필수 요소 우회 복구 지시/);
    assert.match(publicText, /돈뭉치/);
    assert.match(publicText, /바로 옆 보관함|별도 봉투/);
    assert.match(publicText, /한명진/);
    assert.match(publicText, /황동열쇠/);
    assert.match(publicText, /불탄 고문서 조각/);
    assert.ok(body.statePatch.inventoryAdd.includes("황동열쇠"));
    assert.ok(body.statePatch.inventoryAdd.includes("불탄 고문서 조각"));
    assert.match(body.warning ?? "", /필수 요소|별도 경로/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const rerouteEvent = (
  id: string,
  name: string,
  description: string,
) => ({
  id,
  name,
  type: "Conditional",
  visibility: "Hidden",
  status: "Planned",
  priority: 100,
  conditions: description,
  cancelConditions: "",
  participants: "한시우",
  effects: "",
  description,
  onSuccess: "",
  onFailure: "",
  followUp: "",
  playerCanIntervene: true,
});

const reroutePack = {
  ...importedPack,
  projectId: "FATE-SEOUL-REQUIRED-EVENT-REROUTE-TEST",
  events: [
    rerouteEvent("EV_PROLOGUE_02_MAP_GLITCH", "택배 전 일상", "평범한 대학 생활"),
    rerouteEvent("EV_PROLOGUE_03_GRANDMOTHER_PARCEL", "1년 늦은 택배", "발송인 한명진"),
    rerouteEvent("EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER", "방문 연구자", "나디아 인간 대화"),
    rerouteEvent("EV_PROLOGUE_04_EVENING_RAIN", "각자의 저녁", "별도 저녁 일상"),
    rerouteEvent("EV_PROLOGUE_05_CAMPUS_BLACKOUT", "서촌 정전", "22:47 종이가면 습격"),
    rerouteEvent("EV_PROLOGUE_06_NIGHT_PURSUIT", "방공호 추적", "야간 추적"),
    rerouteEvent("EV_PROLOGUE_07_SABER_SUMMONING", "우발 소환", "소녀 검사 현현"),
    rerouteEvent("EV_PROLOGUE_08_FIRST_BATTLE_AFTER_SUMMONING", "첫 방어전", "첫 전투"),
    rerouteEvent("EV_PROLOGUE_09_CHURCH_ORIENTATION", "성당교회", "감독관 설명"),
  ],
};

test("마지막 비트의 확장 종결본에도 계약이 남으면 현재 사건에 종결 전용 비트를 추가한다", async () => {
  const originalFetch = globalThis.fetch;
  const firstEvent = {
    ...rerouteEvent(
      "EV_STUCK_INTRUSION",
      "현관 침입",
      "침입자가 현관 안쪽까지 들어와 대치한다.",
    ),
    required: true,
    sequence: 1,
    requiredItems: "현관 열쇠",
    completionSignals: "침입자가 물러났다",
  };
  const nextEvent = {
    ...rerouteEvent("EV_NEXT_CASE", "다음 사건", "다음 날의 별도 사건"),
    required: true,
    sequence: 2,
  };
  const pack = {
    ...importedPack,
    projectId: "GENERIC-FORCED-CLOSURE-NEXT-TURN",
    startTime: "22:55",
    startLocation: "서촌 주택가 한명진의 집 현관 안쪽",
    events: [firstEvent, nextEvent],
  };
  const initialState = {
    ...createInitialState(pack),
    turn: 39,
    time: "22:55",
    location: pack.startLocation,
    sceneSummary: "같은 침입자와 현관 안팎에서 오래 대치하고 있다.",
    inventory: ["현관 열쇠"],
  };
  const ledger = readClaudeRuntime(pack, initialState, firstEvent.id);
  ledger.beat = ledger.beatTotal;
  ledger.eventTurns = 18;
  ledger.eventText = "현관 열쇠를 챙겨 잠금장치를 붙들었다.";
  const state = {
    ...initialState,
    variables: [{
      ...claudeRuntimeVariable(ledger),
      status: "active" as const,
      createdTurn: 1,
    }],
  };
  const unclosedTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "문밖의 기척을 확인하자 침입자가 다시 현관문을 공격했다. 대치는 그대로 이어졌다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "22:56",
      location: pack.startLocation,
      sceneSummary: "침입자가 다시 현관문을 공격하며 대치가 이어졌다.",
      memoryAdd: ["침입자가 다시 현관문을 공격했다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "22:56",
      location: pack.startLocation,
      appearing: [],
      beatAdvanced: false,
      eventResolved: false,
      resolutionSummary: "",
    },
    recommendations: [
      { label: "경찰의 도착 여부를 확인한다.", risk: "낮음" },
      { label: "현관 잠금을 다시 고정한다.", risk: "보통" },
      { label: "복도로 나가 침입자를 막는다.", risk: "높음" },
    ],
  };
  const closedTurn = {
    ...unclosedTurn,
    blocks: [{
      type: "narration",
      text: "문밖의 기척을 확인한 순간 복도 경보가 울렸다. 발소리는 계단 아래로 멀어졌지만 경찰의 도착도 침입자의 상태도 아직 직접 확인되지 않았다. 현관 안의 사람들은 문을 잠그고 더는 같은 대치를 반복하지 않기로 했다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...unclosedTurn.statePatch,
      time: "22:57",
      sceneSummary: "발소리는 멀어졌지만 침입자의 최종 상태는 확인되지 않은 채 현관 대치를 끝냈다.",
      memoryAdd: ["현관 대치를 끝내고 확인되지 않은 결과만 남겼다."],
    },
    claudeSignals: {
      ...unclosedTurn.claudeSignals,
      sceneTime: "22:57",
      beatAdvanced: true,
      eventResolved: true,
      resolutionSummary: "현관 대치를 여기서 끝냈지만 침입자의 최종 상태는 후속 인과에서 확인해야 한다.",
    },
  };
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return Response.json({
      output_text: JSON.stringify(callCount === 1 ? unclosedTurn : closedTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    });
  }) as typeof fetch;

  try {
    const response = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state,
        userText: "",
        advanceMode: "canonical",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    const body = await response.json() as {
      blocks?: Array<{ text: string }>;
      claudeSignals?: { eventResolved?: boolean };
      statePatch?: { variablesAdd?: Array<{ id: string; detail: string }> };
      warning?: string;
      code?: string;
      error?: string;
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(callCount >= 2);
    assert.equal(body.claudeSignals?.eventResolved, false);
    assert.match(body.warning ?? "", /임시 종결 비트 1개/u);
    const stored = body.statePatch?.variablesAdd?.find(
      (variable) => variable.id === "RELAY_CLAUDE_HTML_RUNTIME_V1",
    );
    const storedLedger = JSON.parse(stored?.detail ?? "{}");
    assert.equal(storedLedger.activeEventId, firstEvent.id);
    assert.equal(storedLedger.beatTotal, ledger.beatTotal + 1);
    assert.equal(storedLedger.beat, storedLedger.beatTotal - 1);
    assert.equal(storedLedger.closureExtensionCount, 1);
    assert.deepEqual(storedLedger.sealed, []);
    assert.equal(storedLedger.manualCarryover, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 장시간 이탈도 한 번 교정해 현재 사건 비트에 합류시킨다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const pack = {
    ...importedPack,
    projectId: "GENERIC-IMMEDIATE-CANON-ABSORPTION",
    title: "외할머니의 마지막 상자",
    genre: "현대 미스터리",
    startTime: "15:30",
    startLocation: "한성도시대학교 공학관 강의실",
    events: [{
      ...rerouteEvent(
        "EV_GRANDMOTHER_PARCEL",
        "외할머니의 마지막 택배",
        "공학관 밖 무인택배함으로 이동해 외할머니 이름의 택배를 열고 내용물을 확인한다.",
      ),
      required: true,
      sequence: 1,
      requiredItems: "황동열쇠, 불탄 고문서 조각",
      completionSignals: "무인택배함을 열어 내용물을 확인하고 챙겼다",
      recoveryAlternatives: "외할머니의 마지막 유품일지 모른다는 미련",
      effects: "열었을 때 황동열쇠·불탄 고문서 조각 획득.",
    }],
  };
  const unsafeDetourTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "한시우는 곧장 이태원 클럽으로 가서 다음 날 오전 일곱 시까지 밤을 샜다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "07:00",
      dayDelta: 1,
      location: "이태원 클럽 앞",
      sceneSummary: "이태원 클럽에서 밤을 새고 나왔다.",
      inventoryAdd: [],
      memoryAdd: ["이태원 클럽에서 밤을 샜다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      inputMode: "digress" as const,
      sceneTime: "07:00",
      location: "이태원 클럽 앞",
      beatAdvanced: false,
      eventResolved: false,
    },
  };
  const absorbedDetourTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "한시우는 이태원 클럽까지 갈 택시를 부르며 공학관 강의실을 나섰다. 그때 외할머니 이름으로 맡겨진 보관함이 곧 회수된다는 알림이 다시 울렸다. 그는 택시 호출을 취소하지 않은 채 승차 지점을 후문으로 바꾸고, 먼저 공학관 밖 무인택배함으로 내려가기 시작했다. 클럽에 갈 계획은 보류했을 뿐 사라지지 않았다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:35",
      dayDelta: 0,
      location: "한성도시대학교 공학관 강의실 바깥 동선",
      sceneSummary: "이태원행을 준비하던 중 보관 만료 알림을 받고 먼저 무인택배함으로 향했다.",
      inventoryAdd: [],
      memoryAdd: ["이태원행 택시를 유지한 채 먼저 무인택배함으로 향했다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      inputMode: "advance" as const,
      sceneTime: "15:35",
      location: "한성도시대학교 공학관 강의실 바깥 동선",
      beatAdvanced: true,
      eventResolved: false,
      resolutionSummary: "",
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(requestBodies.length === 1 ? unsafeDetourTurn : absorbedDetourTurn),
      usage: { input_tokens: 900, output_tokens: 240, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    turn: 2,
    time: "15:30",
    location: "한성도시대학교 공학관 강의실",
    sceneSummary: "외할머니 한명진의 이름이 표시된 보관함 알림을 보았지만 아직 상자를 열지 않았다.",
    inventory: [],
    memories: ["외할머니 한명진의 이름이 표시된 보관함 알림을 보았지만 아직 택배를 열지 않았다."],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "한시우는 무인택배함을 생까고 이태원 클럽으로 곧장 가서 다음날 오전 7시까지 밤을 새기로 한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; dayDelta?: number; location: string; inventoryAdd: string[] };
      claudeSignals?: { eventResolved?: boolean };
      code?: string;
      error?: string;
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.code, undefined);
    assert.equal(body.error, undefined);
    const text = body.blocks?.map((block) => block.text).join(" ") ?? "";
    assert.equal(requestBodies.length, 2);
    assert.match(text, /이태원\s*클럽/u);
    assert.doesNotMatch(text, /(?:생각|계획)을\s*(?:접|버렸)/u);
    assert.doesNotMatch(
      text,
      /현재\s*동선|관측\s*가능한\s*결과|핵심\s*인과|입력\s*의도|필수\s*사건|복구\s*경로|주변\s*인물과\s*환경의\s*움직임/u,
    );
    assert.equal(body.claudeSignals?.eventResolved, false);
    assert.deepEqual(body.statePatch.inventoryAdd, []);
    assert.match(text, /무인택배함/u);
    assert.equal(body.statePatch.dayDelta, 0);
    assert.equal(body.statePatch.time, "15:35");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 복합 수령 누락은 폐기하지 않고 다음 비트로 진행한다", async () => {
  const originalFetch = globalThis.fetch;
  const pack = {
    ...importedPack,
    projectId: "GENERIC-MOVE-AND-PICKUP-CONTINUITY",
    title: "수령 동선 연속성 검사",
    startTime: "15:35",
    startLocation: "한성도시대학교 공학관 도시공학과 강의실",
    events: [{
      ...rerouteEvent(
        "EV_REQUIRED_LOCKER_PICKUP",
        "보관함의 유품",
        "택배 알림에 표시된 공학관 밖 무인택배함으로 이동해 물품을 수령하고 내용물을 확인한다.",
      ),
      required: true,
      sequence: 1,
      requiredItems: "황동열쇠, 불탄 고문서 조각",
      completionSignals: "무인택배함을 열어 내용물을 확인하고 챙겼다",
      effects: "황동열쇠·불탄 고문서 조각을 획득한다.",
    }],
  };
  const incompleteTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "한시우는 강의실에서 하던 말을 마무리하고 직접 자리를 떠났다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "5분 동안 이어진 실제 이동 끝에 한성도시대학교 공학관 도시공학과 강의실 바깥 동선에 도착했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:40",
      dayDelta: 0,
      location: "한성도시대학교 공학관 도시공학과 강의실 바깥 동선",
      sceneSummary: "강의실 바깥 동선에 도착했다.",
      inventoryAdd: [],
      memoryAdd: ["강의실 바깥 동선으로 이동했다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      inputMode: "advance" as const,
      sceneTime: "15:40",
      location: "한성도시대학교 공학관 도시공학과 강의실 바깥 동선",
      beatAdvanced: false,
      eventResolved: false,
    },
  };
  globalThis.fetch = (async () => Response.json({
    output_text: JSON.stringify(incompleteTurn),
    usage: {
      input_tokens: 700,
      output_tokens: 180,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
  })) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    turn: 4,
    time: "15:35",
    location: "한성도시대학교 공학관 도시공학과 강의실",
    sceneSummary: "택배 알림을 확인했지만 아직 보관함으로 이동하지 않았다.",
    inventory: [],
    memories: ["공학관 밖 보관함에 물품이 도착했다는 알림을 받았다."],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "택배 알림에 표시된 보관함으로 이동해 물품을 수령한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; location: string; inventoryAdd: string[] };
      claudeSignals?: { eventResolved?: boolean };
      code?: string;
      error?: string;
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    const text = body.blocks?.map((block) => block.text).join(" ") ?? "";

    assert.match(body.statePatch.location, /강의실\s*바깥\s*동선/u);
    assert.match(text, /도착|닿았다/u);
    assert.doesNotMatch(text, /보관함을\s*직접\s*열|무인택배함을\s*열/u);
    assert.deepEqual(body.statePatch.inventoryAdd, []);
    assert.equal(body.claudeSignals?.eventResolved, false);
    assert.equal(body.statePatch.time, "15:40");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("초기 비트의 이탈 목적은 필수 만남으로 강제 회수하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...importedPack.npcs[0],
    id: "NPC_NADIA_INTENT_PRESERVED",
    name: "나디아 알 하다드",
    role: "프랑스인 방문 연구자",
    publicInfo: "대학박물관 별관을 찾는 방문 연구자",
    hiddenInfo: "",
  };
  const pack = {
    ...reroutePack,
    projectId: "FATE-SEOUL-NADIA-INTENT-PRESERVED",
    npcs: [...reroutePack.npcs, nadia],
    events: reroutePack.events.map((event) =>
      event.id === "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER"
        ? { ...event, required: true }
        : event
    ),
  };
  const unsafeDetourTurn = {
    ...validLunaTurn,
    blocks: [{
      type: "narration",
      text: "한시우는 이태원 클럽에 도착해 다음 날 아침까지 파티를 벌였다.",
      speakerId: "",
      speakerName: "",
      emotion: "",
      mediaAssetId: "",
    }],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "07:00",
      dayDelta: 1,
      location: "이태원 클럽",
      sceneSummary: "클럽에서 밤을 샜다.",
      memoryAdd: ["이태원 클럽에서 밤을 샜다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      inputMode: "digress" as const,
      sceneTime: "07:00",
      location: "이태원 클럽",
      beatAdvanced: false,
      eventResolved: false,
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(unsafeDetourTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 240,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    turn: 5,
    time: "15:40",
    location: "한성도시대학교 공학관",
    sceneSummary: "외할머니 명의 택배를 열어 내용물을 챙긴 뒤 수업을 마쳤다.",
    memories: ["한명진 명의 택배를 열어 내용물을 직접 수령했다."],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "갑자기 한시우는 이태원 클럽에 가고 싶어졌다. 그는 이태원 클럽으로 가 밤을 새며 광란의 파티를 벌인다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; dayDelta?: number; location: string; memoryAdd: string[] };
      recommendations: Array<{ label: string }>;
      code?: string;
      error?: string;
    };
    assert.equal(response.status, 200, JSON.stringify(body));
    const text = body.blocks.map((block) => block.text).join(" ");

    assert.equal(body.code, undefined);
    assert.equal(body.error, undefined);
    assert.match(text, /이태원\s*클럽/u);
    assert.doesNotMatch(text, /나디아\s*알\s*하다드|안내판|박물관/u);
    assert.equal(body.statePatch.dayDelta, 1);
    assert.match(body.statePatch.location, /이태원|클럽/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("나디아의 길 안내·연락처·다음 약속 대화는 정사 이탈로 오인하거나 저녁 사건으로 넘기지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...importedPack.npcs[0],
    id: "NPC_NADIA_TWO_TURN",
    name: "나디아 알 하다드",
    role: "프랑스인 방문 연구자",
    publicInfo: "대학박물관 별관을 찾는 방문 연구자",
    hiddenInfo: "",
  };
  const nadiaEvent = {
    ...rerouteEvent(
      "EV_PROLOGUE_04_NADIA_HUMAN_ENCOUNTER",
      "나디아와 인간적인 첫 대화",
      "안내판 앞에서 길을 묻고 답을 들은 뒤 서로 반응하고 대화를 자연스럽게 마친다.",
    ),
    required: true,
    sequence: 1,
    completionSignals: "",
  };
  const pack = {
    ...importedPack,
    projectId: "NADIA-NORMAL-CONVERSATION-TWO-TURN",
    startTime: "15:38",
    startLocation: "한성도시대학교 대학박물관 안내판 앞",
    npcs: [nadia],
    events: [nadiaEvent],
  };
  const firstTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "접힌 지도를 든 방문 연구자가 안내판의 두 건물을 번갈아 보다가 한시우를 향해 고개를 들었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "실례합니다. 대학박물관 별관은 어느 쪽인가요?",
        speakerId: nadia.id,
        speakerName: nadia.name,
        emotion: "조심스러운 호기심",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:40",
      location: pack.startLocation,
      sceneSummary: "나디아가 안내판 앞에서 박물관 별관으로 가는 길을 물었다.",
      encounteredCharactersAdd: [{ characterId: nadia.id, name: nadia.name, relationType: "첫 만남" }],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "15:40",
      location: pack.startLocation,
      appearing: [nadia.id],
      firstAppearance: [nadia.id],
      beatAdvanced: true,
      eventResolved: false,
    },
    recommendations: [
      { label: "별관이 왼쪽 언덕 위라고 알려준다.", risk: "낮음" },
      { label: "우산을 함께 쓰고 별관까지 안내한다.", risk: "낮음" },
      { label: "방문 연구 주제를 짧게 묻는다.", risk: "낮음" },
    ],
  };
  const secondTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "한시우가 왼쪽 언덕을 가리키며 우산을 기울이자, 나디아는 빗속의 경사로와 그의 얼굴을 차례로 보고 안도한 듯 웃었다. 두 사람은 안내판을 떠나 대학박물관 별관으로 오르는 길을 함께 걸어 별관 입구에 도착했다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "정말 고마워요. 괜찮다면 연락처를 교환해도 될까요? 다음에는 길을 잃지 않은 날에 차라도 대접하고 싶어요.",
        speakerId: nadia.id,
        speakerName: nadia.name,
        emotion: "호감과 감사",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "15:44",
      location: "한성도시대학교 대학박물관 별관 입구",
      sceneSummary: "한시우가 우산을 함께 쓰고 나디아를 별관 쪽으로 안내하며 연락처를 교환하기로 했다.",
      relationChanges: [{ characterId: nadia.id, trustDelta: 1, note: "친절한 안내에 감사와 호감을 느꼈다." }],
      memoryAdd: ["나디아와 연락처를 교환하고 다음에 차를 마시자는 약속을 나눴다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "15:44",
      location: "한성도시대학교 대학박물관 별관 입구",
      appearing: [nadia.id],
      beatAdvanced: true,
      eventResolved: false,
    },
    recommendations: [
      { label: "연락처를 저장하고 연구 주제를 묻는다.", risk: "낮음" },
      { label: "우산을 기울여 별관 입구까지 함께 걷는다.", risk: "낮음" },
      { label: "다음 만남의 편한 시간대를 짧게 확인한다.", risk: "낮음" },
    ],
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(secondTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  try {
    const nextState = {
      ...createInitialState(pack),
      turn: 1,
      time: "15:40",
      location: pack.startLocation,
      sceneSummary: "나디아가 안내판 앞에서 박물관 별관으로 가는 길을 물었다.",
      encounteredCharacterIds: [nadia.id],
    };
    const exactInput = "별관은 왼쪽 언덕 위입니다. 마침 우산도 없으시니 제가 데려다 드리지요. 나디아는 친절한 한시우의 모습에 호감을 느껴 연락처를 교환하자 한다. 그녀는 다음에 데이트를 하자는 약속을 남긴다.";
    const secondResponse = await POST(new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state: nextState,
        userText: exactInput,
        recentTurns: [{
          turn: 1,
          userText: "안내판 앞의 방문 연구자를 바라본다.",
          blocks: firstTurn.blocks,
          location: firstTurn.statePatch.location,
          time: firstTurn.statePatch.time,
        }],
        apiKey: "sk-test-do-not-store",
      }),
    }));
    const secondBody = await secondResponse.json() as typeof secondTurn & {
      code?: string;
      error?: string;
    };
    const text = secondBody.blocks.map((block) => block.text).join(" ");

    assert.equal(secondResponse.status, 200, JSON.stringify(secondBody));
    assert.equal(secondBody.code, undefined);
    assert.equal(secondBody.error, undefined);
    assert.match(text, /우산/u, JSON.stringify(secondBody));
    assert.match(text, /연락처/u);
    assert.match(text, /다음에는|차라도/u);
    assert.doesNotMatch(text, /그녀는\s*다음의\s*위치/u);
    assert.doesNotMatch(text, /식사|과제\s*정리|귀가\s*준비/u);
    assert.match(secondBody.statePatch.location, /대학박물관|별관/u);
    assert.equal(secondBody.statePatch.time, "15:44");
    assert.equal(secondBody.claudeSignals.eventResolved, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("끝난 나디아 장면을 재작성에서도 반복하면 현재 장면으로 둔갑시켜 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...demoScenario.npcs[0],
    id: "NPC_NADIA_COMPLETED_ENCOUNTER",
    name: "나디아 알 하다드",
    role: "방문 연구자",
    publicInfo: "대학박물관 별관을 찾던 외국인 연구자",
    hiddenInfo: "",
  };
  const pack = {
    ...reroutePack,
    projectId: "FATE-SEOUL-COMPLETED-NADIA-NO-REOPEN-TEST",
    npcs: [...reroutePack.npcs, nadia],
  };
  const duplicateNadiaTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "집에서 출발해 통학한 뒤 캠퍼스 안내도 앞에 도착하자 나디아 알 하다드가 다시 길을 물었다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "실례합니다. 대학박물관 별관은 어느 쪽인가요?",
        speakerId: nadia.id,
        speakerName: nadia.name,
        emotion: "차분함",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "08:50",
      location: "캠퍼스 안내도 앞",
      sceneSummary: "나디아 알 하다드가 다시 길을 물었다.",
      memoryAdd: ["나디아가 다시 등장했다."],
      encounteredCharactersAdd: [{
        characterId: nadia.id,
        name: nadia.name,
        relationType: "방문 연구자",
      }],
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(duplicateNadiaTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    turn: 34,
    time: "08:12",
    location: "한시우의 집 침실",
    sceneSummary: "밤사이 상황이 마무리되고 시간이 많이 흘러 집 침실에서 아침을 맞았다.",
    memories: [
      "무인택배함을 열어 택배를 수령했다.",
      "캠퍼스에서 방문 연구자 나디아 알 하다드가 박물관 별관으로 가는 길을 물었다.",
    ],
    encounteredCharacterIds: [nadia.id],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "어느 정도 상황도 마무리됐고 시간이 많이 흘렀다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; location: string; encounteredCharactersAdd: unknown[] };
      recommendations: Array<{ label: string }>;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const publicText = body.blocks.map((block) => block.text).join(" ");
    const recommendationText = body.recommendations
      .map((recommendation) => recommendation.label)
      .join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.statePatch.location, state.location);
    assert.equal(body.statePatch.time, "08:32");
    assert.match(publicText, /아침 식사|오늘 일정표/u);
    assert.doesNotMatch(publicText, /나디아|방문 연구자|캠퍼스 안내도|통학/u);
    assert.doesNotMatch(recommendationText, /나디아|박물관 별관|캠퍼스/u);
    assert.equal(body.statePatch.encounteredCharactersAdd.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const homePursuitState = () => ({
  ...createInitialState(reroutePack),
  turn: 7,
  time: "22:49",
  location: "한시우의 집",
  sceneSummary: "집의 전력이 끊기고 종이가면 추적자가 현관 밖에 나타났다.",
  memories: [
    "무인택배함을 열어 택배를 수령했다.",
    "나디아 알 하다드가 인사하고 떠나며 대화가 끝났다.",
    "저녁 식사를 마치고 과제를 정리했다.",
    "한시우의 집에서 정전이 발생하고 종이가면 추적자가 습격했다.",
  ],
});

test("초기 비트의 설명 없는 집→방공호 이동은 폐기·재작성하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const teleportedTurn = {
    ...validLunaTurn,
    blocks: [
      { type: "narration", text: "서촌 골목 끝의 방공호에는 비상등이 꺼져 있었다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
      { type: "narration", text: "방공호 출구를 종이가면 추적자가 막고 흉기를 들어 올렸다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "23:07",
      location: "서촌 옛 민방위 방공호",
      sceneSummary: "방공호에서 종이가면 추적자에게 퇴로가 막혔다.",
      memoryAdd: ["방공호에서 추적자에게 포위됐다."],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(teleportedTurn),
      usage: { input_tokens: 900, output_tokens: 260, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: reroutePack,
      state: homePursuitState(),
      userText: "현관 밖의 기척에 대비한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string };
      warning?: string;
      code?: string;
      error?: string;
    };
    const publicText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.equal(body.code, undefined);
    assert.equal(body.error, undefined);
    assert.equal(body.statePatch.location, "서촌 옛 민방위 방공호");
    assert.match(publicText, /방공호/u);
    assert.match(publicText, /종이가면|추적자/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("내부 제어문이 재작성에도 새면 원본을 실제 장면처럼 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const nadia = {
    ...demoScenario.npcs[0],
    id: "NPC_NADIA_META_LEAK_GUARD",
    name: "나디아 알 하다드",
    role: "방문 연구자",
    publicInfo: "대학박물관 별관을 찾는 외국인 연구자",
    hiddenInfo: "",
  };
  const event = {
    ...demoScenario.events[0],
    id: "EVENT_NADIA_HUMAN_ENCOUNTER_GENERIC",
    name: "비 오는 날의 방문 연구자",
    required: true,
    sequence: 1,
    priority: 100,
    description: "나디아 알 하다드가 평범한 방문 연구자로 길을 묻는다.",
    effects: "나디아와 마술과 무관한 첫 대화를 시작한다.",
    completionSignals: "나디아 알 하다드가 길을 물었다",
    requiredDialogue: "",
    requiredSpeakerId: nadia.id,
    requiredItems: "",
    recoveryAlternatives: "같은 날 현재 위치에서 자연스럽게 길을 묻는다",
    endSceneAfterCompletion: false,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-NARRATIVE-CONTROL-LEAK-GUARD",
    title: "비 오는 도시의 방문자",
    genre: "현대 미스터리",
    npcs: [nadia],
    events: [event],
  };
  const leakedTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "사용자의 직접 행동이 끝난 직후, NPC의 독립 행동이 현재 장소에서 별도로 이어졌다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "가벼운 비가 내리는 캠퍼스 안내도 앞에서 외국인 연구자가 길을 묻는다. 다음 판단은 플레이어가 직접 내릴 수 있는 새 대응 지점에 남았다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "00:10",
      location: "주인공의 집 침실",
      sceneSummary: "NPC의 독립 행동이 별도로 이어졌다.",
      memoryAdd: ["NPC의 독립 행동이 이어졌다."],
    },
    narrativeAudit: {
      inputHandled: true,
      inputOutcome: "not_applicable",
      inputEvidence: "",
      meaningfulBeat: true,
      meaningfulBeatEvidence: "외국인 연구자가 길을 묻는다.",
      routeEventStatus: "in_progress",
      routeEventEvidence: "외국인 연구자가 길을 묻는다.",
      chronologyConsistent: true,
      chronologyNote: "",
      recommendationsGrounded: true,
      recommendationBasis: ["방문 연구자"],
      currentScene: "방문 연구자 길 안내",
      currentLocation: "캠퍼스 안내도 앞",
      currentTime: "00:10",
      activeCharacters: ["나디아 알 하다드"],
      activeThreats: [],
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(leakedTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    day: 2,
    date: "2018-10-25",
    weekday: "목요일",
    turn: 27,
    time: "00:07",
    location: "주인공의 집 침실",
    weather: "가벼운 비",
    sceneSummary: "주인공이 집 침실에서 밤을 보내고 있다.",
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "",
      advanceMode: "canonical",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: {
        time: string;
        location: string;
        variablesAdd: Array<{ id: string }>;
        encounteredCharactersAdd: Array<{ name: string }>;
      };
      recommendations: Array<{ label: string }>;
      warning?: string;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const publicText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.doesNotMatch(
      publicText,
      /사용자의 직접 행동|NPC의 독립 행동|다음 판단은 플레이어|새 대응 지점/u,
    );
    assert.equal(body.statePatch.location, state.location);
    assert.equal(body.statePatch.time, "08:12");
    assert.match(publicText, /아침|알람|오늘 일정표/u);
    assert.match(publicText, /집 안|외출 준비/u);
    assert.doesNotMatch(publicText, /공동현관 인터폰|인터폰/u);
    assert.doesNotMatch(publicText, /나디아 알 하다드|외국인 연구자/u);
    assert.doesNotMatch(publicText, /캠퍼스 안내도 앞/u);
    assert.equal(body.statePatch.encounteredCharactersAdd.length, 0);
    assert.equal(
      body.statePatch.variablesAdd.some(
        (variable) => variable.id === STORY_ROUTE_PROGRESS_VARIABLE_ID,
      ),
      false,
    );
    assert.match(
      body.recommendations.map((recommendation) => recommendation.label).join(" "),
      /일정|이동 경로|현재 장소|공개 동선/u,
    );
    assert.match(body.warning ?? "", /필수 만남|실제 이동|일상|준비/u);

    const movementRequest = new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state: { ...state, time: "08:12" },
        userText: "우산과 가방을 챙겨 캠퍼스로 출발한다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    });
    const movementResponse = await POST(movementRequest);
    const movementBody = (await movementResponse.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: {
        time: string;
        location: string;
        variablesAdd: Array<{ id: string }>;
        encounteredCharactersAdd: Array<{ name: string }>;
      };
    };
    const movementText = movementBody.blocks.map((block) => block.text).join(" ");

    assert.equal(movementResponse.status, 200, JSON.stringify(movementBody));
    assert.match(movementBody.statePatch.location, /캠퍼스/u);
    assert.equal(movementBody.statePatch.time, "08:47");
    assert.match(movementText, /문을 나섰|35분 동안 이동|대중교통|도착/u);
    assert.doesNotMatch(movementText, /나디아|외국인 연구자|길을 묻/u);
    assert.equal(movementBody.statePatch.encounteredCharactersAdd.length, 0);
    assert.equal(
      movementBody.statePatch.variablesAdd.some(
        (variable) => variable.id === STORY_ROUTE_PROGRESS_VARIABLE_ID,
      ),
      false,
    );

    const nonResidentialState = {
      ...state,
      time: "00:55",
      location: "명동성당 부속 비공개 별관 지하 임시 보호실",
      sceneSummary: "오요한 신부의 설명이 끝난 뒤 지하 보호실에 남아 있다.",
    };
    const leaveCurrentVenueRequest = new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state: nonResidentialState,
        userText: "현재 장소를 떠나 가장 가까운 공개 동선으로 이동한다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    });
    const leaveCurrentVenueResponse = await POST(leaveCurrentVenueRequest);
    const leaveCurrentVenueBody = (await leaveCurrentVenueResponse.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { time: string; location: string };
    };
    const leaveCurrentVenueText = leaveCurrentVenueBody.blocks
      .map((block) => block.text)
      .join(" ");

    assert.equal(
      leaveCurrentVenueResponse.status,
      200,
      JSON.stringify(leaveCurrentVenueBody),
    );
    assert.notEqual(
      leaveCurrentVenueBody.statePatch.location,
      nonResidentialState.location,
    );
    assert.equal(leaveCurrentVenueBody.statePatch.time, "01:00");
    assert.match(leaveCurrentVenueText, /직접 자리를 떠났|실제로 이동해|도착/u);
    assert.doesNotMatch(
      leaveCurrentVenueText,
      /휴대전화 알람|오늘 일정표|아직 집 안이므로/u,
    );

    const campusTurn = {
      ...validLunaTurn,
      blocks: [
        {
          type: "narration",
          text: "캠퍼스 중앙 보행로의 안내도 앞에서 방문 지도를 든 연구자가 건물 이름을 확인하다가 이쪽을 바라보았다. 나디아 알 하다드가 길을 물었다.",
          speakerId: "",
          speakerName: "",
          emotion: "",
          mediaAssetId: "",
        },
        {
          type: "dialogue",
          text: "실례합니다. 대학박물관 별관은 어느 쪽인가요?",
          speakerId: nadia.id,
          speakerName: nadia.name,
          emotion: "차분함",
          mediaAssetId: "",
        },
      ],
      statePatch: {
        ...validLunaTurn.statePatch,
        time: "08:50",
        location: "캠퍼스 중앙 보행로 안내도 앞",
        sceneSummary: "캠퍼스에서 나디아 알 하다드가 길을 물었다.",
        memoryAdd: ["캠퍼스에서 방문 연구자 나디아가 길을 물었다."],
        encounteredCharactersAdd: [{
          characterId: nadia.id,
          name: nadia.name,
          relationType: "캠퍼스에서 처음 마주친 방문 연구자",
        }],
      },
      recommendations: [
        { label: "안내도에서 대학박물관 별관 위치를 짚어 준다.", risk: "낮음" },
        { label: "나디아에게 찾는 건물의 정확한 이름을 묻는다.", risk: "낮음" },
        { label: "가까운 교내 안내 창구를 함께 확인하자고 제안한다.", risk: "보통" },
      ],
    };
    globalThis.fetch = (async () =>
      Response.json({
        output_text: JSON.stringify(campusTurn),
        usage: {
          input_tokens: 900,
          output_tokens: 260,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        },
      })) as typeof fetch;
    const campusRequest = new Request("http://localhost/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack,
        state: {
          ...state,
          time: "08:47",
          location: "캠퍼스 중앙 보행로 안내도 앞",
          sceneSummary: "통학을 마치고 캠퍼스 안내도 앞에 도착했다.",
        },
        userText: "안내도에서 오늘 강의실 위치를 확인한다.",
        recentTurns: [],
        apiKey: "sk-test-do-not-store",
      }),
    });
    const campusResponse = await POST(campusRequest);
    const campusBody = (await campusResponse.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: {
        variablesAdd: Array<{ id: string }>;
        encounteredCharactersAdd: Array<{ name: string }>;
      };
    };
    const campusText = campusBody.blocks.map((block) => block.text).join(" ");

    assert.equal(campusResponse.status, 200, JSON.stringify(campusBody));
    assert.match(campusText, /나디아 알 하다드|대학박물관 별관/u);
    assert.doesNotMatch(campusText, /인터폰|집 침실/u);
    assert.equal(
      campusBody.statePatch.encounteredCharactersAdd.some(
        (character) => character.name === nadia.name,
      ),
      true,
    );
    assert.equal(
      campusBody.statePatch.variablesAdd.some(
        (variable) => variable.id === STORY_ROUTE_PROGRESS_VARIABLE_ID,
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("집 파손부터 이동과 도착까지 서술하면 방공호 필수 사건 전환을 허용한다", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  const bridgedTurn = {
    ...validLunaTurn,
    blocks: [
      { type: "narration", text: "한시우의 집 현관이 종이가면 추적자의 공격으로 무너지자 비상방송이 지하 민방위 방공호로 대피하라고 안내했다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
      { type: "narration", text: "그 안내를 따라 집을 빠져나와 비상계단과 연결 통로로 이동했다. 18분 뒤 서촌 옛 민방위 방공호에 도착했지만, 추적자가 출구를 막고 흉기를 들어 올렸다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "23:07",
      location: "서촌 옛 민방위 방공호",
      sceneSummary: "집의 파손으로 대피 동선을 따라 방공호에 도착했으나 추적자에게 퇴로가 막혔다.",
      memoryAdd: ["집에서 시작된 습격을 피해 안내된 통로로 이동해 방공호에 도착했다."],
    },
  };
  globalThis.fetch = (async () => {
    requestCount += 1;
    return Response.json({
      output_text: JSON.stringify(bridgedTurn),
      usage: { input_tokens: 900, output_tokens: 260, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: reroutePack,
      state: homePursuitState(),
      userText: "현관 밖의 기척에 대비한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string };
    };
    const publicText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestCount, 1);
    assert.equal(body.statePatch.location, "서촌 옛 민방위 방공호");
    assert.match(publicText, /집 현관.*무너지/u);
    assert.match(publicText, /18분 뒤.*방공호에 도착/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("비-Fate 초기 비트의 설명 없는 장소 이동도 첫 초안을 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const event = {
    ...demoScenario.events[0],
    id: "EVENT_OPEN_MOON_ARCHIVE",
    name: "달빛 기록문 개방",
    visibility: "Hidden",
    status: "Planned",
    priority: 100,
    conditions: "첫 사용자 행동 이후",
    effects: "달빛 기록문이 열리고 은빛 지도를 회수한다.",
    description: "별빛 장치가 작동해 달빛 기록문이 열린다.",
    required: true,
    sequence: 1,
    completionSignals: "달빛 기록문이 열렸다",
    requiredItems: "은빛 지도",
    requiredDialogue: "",
    requiredSpeakerId: "",
    recoveryAlternatives: "현재 장소의 창문에 투사된 별빛 좌표가 보조 기록문을 연다",
    preservePlayerChoice: true,
    endSceneAfterCompletion: true,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-LOCATION-CONTINUITY-TEST",
    title: "달빛 기록보관소",
    genre: "현대 미스터리",
    events: [event],
  };
  const teleportedTurn = {
    ...validLunaTurn,
    blocks: [
      { type: "narration", text: "북악산 정상 천문대의 원형 문이 별빛을 받았다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
      { type: "narration", text: "달빛 기록문이 열렸고 안쪽에서 은빛 지도가 발견됐다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "21:20",
      location: "북악산 정상 천문대",
      sceneSummary: "천문대에서 달빛 기록문이 열렸다.",
      inventoryAdd: ["은빛 지도"],
      memoryAdd: ["천문대의 달빛 기록문이 열렸다."],
    },
  };
  const reversedTurn = {
    ...validLunaTurn,
    blocks: [
      { type: "narration", text: "주인공은 북악산 천문대로 가려고 현관문을 열고 계단참까지 내려갔다. 그러나 폭우로 산길이 통제됐다는 긴급 알림이 휴대전화에 떠오르자 발길을 멈췄다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
      { type: "narration", text: "그는 젖은 난간을 짚었다가 다시 집으로 돌아왔다. 거실 창문으로 번진 별빛 좌표를 일지의 마지막 장에 맞추자 달빛 기록문이 열렸고, 접힌 은빛 지도가 책등 사이에서 미끄러져 나왔다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "21:08",
      location: "주인공의 집 거실",
      sceneSummary: "천문대행을 시도했다가 산길 통제로 돌아와 집에서 달빛 기록문을 열었다.",
      inventoryAdd: ["은빛 지도"],
      memoryAdd: ["집의 창문에 비친 별빛 좌표로 달빛 기록문을 열었다."],
    },
    claudeSignals: {
      ...validLunaTurn.claudeSignals,
      sceneTime: "21:08",
      location: "주인공의 집 거실",
      beatAdvanced: true,
      eventResolved: true,
      resolutionSummary: "달빛 기록문이 열리고 은빛 지도를 회수했다.",
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(requestBodies.length === 1 ? teleportedTurn : reversedTurn),
      usage: { input_tokens: 900, output_tokens: 260, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    turn: 2,
    time: "21:00",
    location: "주인공의 집 거실",
    sceneSummary: "주인공이 집에서 오래된 천문 일지를 살펴보고 있다.",
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "집에서 일지의 마지막 장을 확인한다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string; inventoryAdd: string[] };
      code?: string;
      error?: string;
    };
    const publicText = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200);
    assert.equal(requestBodies.length, 1);
    assert.equal(body.statePatch.location, "북악산 정상 천문대");
    assert.match(publicText, /달빛 기록문이 열렸/u);
    assert.ok(body.statePatch.inventoryAdd.includes("은빛 지도"));
    assert.match(publicText, /^북악산 정상 천문대/u);
    assert.doesNotMatch(
      publicText,
      /사용자의 직접 행동|NPC의 독립 행동|다음 판단은 플레이어|새 대응 지점/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("필수 사건 우회가 재작성에도 성립하지 않으면 원본에 우회 문장을 붙이지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  const cancelledTurn = {
    ...validLunaTurn,
    blocks: [
      { type: "narration", text: "서촌의 가로등은 정상적으로 켜져 있었고 정전은 발생하지 않았다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
      { type: "narration", text: "종이가면 습격도 취소되어 아무 일도 일어나지 않았다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "22:48",
      location: "서울 서촌",
      sceneSummary: "정전과 습격이 모두 취소됐다.",
      memoryAdd: ["정전과 습격은 없던 일이 됐다."],
    },
  };
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      output_text: JSON.stringify(cancelledTurn),
      usage: { input_tokens: 900, output_tokens: 260, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    });
  }) as typeof fetch;

  const state = {
    ...createInitialState(reroutePack),
    turn: 6,
    time: "22:45",
    location: "서울 서촌 큰길",
    sceneSummary: "저녁 일정을 마치고 서촌 귀가 동선을 확인하고 있다.",
    memories: [
      "무인택배함을 열어 택배를 수령했다.",
      "나디아 알 하다드가 인사하고 떠나며 대화가 끝났다.",
      "저녁 식사를 마치고 과제를 정리한 뒤 귀가 준비를 했다.",
    ],
    variables: [{
      id: "RELAY_SERVER_STORY_ROUTE_PROGRESS",
      label: "서버 검증 이야기 진행도",
      detail: JSON.stringify({
        routeId: "ACT0_NADIA_SEPARATED_SEOCHON_CHURCH",
        phase: "separate_evening_daily_life",
        eventId: "EV_PROLOGUE_04_EVENING_RAIN",
        completedEventIds: ["EV_PROLOGUE_04_EVENING_RAIN"],
        adjudication: "semantic-v1",
      }),
      visibility: "hidden" as const,
      reason: "semantic completion",
      status: "active" as const,
      createdTurn: 6,
    }],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: reroutePack,
      state,
      userText: "서촌에는 정전이 일어나지 않았다. 종이가면 습격도 없던 일이다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      warning?: string;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const text = body.blocks.map((block) => block.text).join(" ");
    const correctionInput = requestBodies[1]?.input as Array<Record<string, unknown>>;
    const correctionText = correctionInput
      ? String((correctionInput[1].content as Array<Record<string, unknown>>)[0].text)
      : "";

    assert.equal(response.status, 200);
    assert.ok(requestBodies.length >= 2);
    assert.match(correctionText, /필수 사건 우회 복구 지시/);
    assert.match(text, /원래.*불빛은 꺼지지 않았다|가로등은 정상/);
    assert.match(text, /인접.*(?:정전|배전)|변압기|배전함/);
    assert.match(text, /종이가면|추적자|매복/);
    assert.match(body.warning ?? "", /선택은 유지.*다른 경로/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("성당행 거절 우회가 재작성에도 없으면 원본을 원격 설명으로 덧대지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const refusedTurn = {
    ...validLunaTurn,
    blocks: [
      { type: "dialogue", text: "성당행은 취소하겠다.", speakerId: "", speakerName: "소녀 검사", emotion: "차분함", mediaAssetId: "" },
      { type: "narration", text: "감독관의 안내도 없던 일이 되어 더는 연락이 오지 않았다.", speakerId: "", speakerName: "", emotion: "", mediaAssetId: "" },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "23:58",
      location: "서촌 임시 대피처",
      sceneSummary: "성당교회 방문과 감독관 설명이 취소됐다.",
      memoryAdd: ["성당과 신부의 안내는 없던 일이 됐다."],
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(refusedTurn),
      usage: { input_tokens: 900, output_tokens: 260, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    })) as typeof fetch;

  const state = {
    ...createInitialState(reroutePack),
    turn: 9,
    time: "23:55",
    location: "서촌 임시 대피처",
    sceneSummary: "소녀 검사가 첫 방어전에서 퇴로를 확보하고 성당교회행을 제안했다.",
    memories: [
      "무인택배함을 열어 택배를 수령했다.",
      "나디아 알 하다드가 인사하고 떠나며 대화가 끝났다.",
      "저녁 식사를 마치고 귀가 준비를 했다.",
      "서촌 22시 47분 정전 속 종이가면 추적자에게 습격당했다.",
      "추적 끝에 옛 민방위 방공호에 도착했다.",
      "우발 소환된 소녀 검사가 마법진에서 현현했다.",
      "종이가면과의 첫 방어전이 끝나고 추적자가 물러났다.",
    ],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: reroutePack,
      state,
      userText: "성당에는 가지 않겠다. 신부도 만나지 않는다.",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string };
      warning?: string;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const text = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200);
    assert.equal(body.statePatch.location, "서촌 임시 대피처");
    assert.match(text, /가지 않겠다는 결정|성당행은 취소/);
    assert.match(text, /(?:보안|안전|암호화).*(?:통화|회선)|원격/);
    assert.match(text, /오요한 신부/);
    assert.match(text, /성배전쟁/);
    assert.match(text, /마스터/);
    assert.match(text, /서번트/);
    assert.match(body.warning ?? "", /선택은 유지.*다른 경로/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("완료된 나디아 과거 장면이 재작성에도 남으면 성당 장면으로 둔갑시켜 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const priest = {
    ...importedPack.npcs[0],
    id: "NPC_PRIEST_O_YOHAN",
    name: "오요한 신부",
    role: "성당교회 감독관",
    publicInfo: "서울 성배전쟁의 중립 감독관",
  };
  const regressionPack = {
    ...reroutePack,
    projectId: "FATE-SEOUL-NO-REGRESSION-TEST",
    npcs: [classGuardSaberNpc, priest],
  };
  const wrongPastTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "나디아가 탄 셔틀이 캠퍼스 뒤로 사라진 뒤 오후 수업이 다시 시작됐다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "narration",
        text: "학생식당과 배달 대행 사무실의 저녁 배차표가 평범한 일상을 이어 갔다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "18:30",
      location: "한성도시대학교 후문",
      sceneSummary: "나디아가 떠난 뒤 평범한 저녁 일상으로 돌아왔다.",
      memoryAdd: ["나디아와 만난 뒤 저녁 배달 일정을 확인했다."],
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(wrongPastTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const state = {
    ...createInitialState(regressionPack),
    turn: 10,
    time: "23:55",
    location: "서촌 옛 민방위 방공호 입구",
    sceneSummary: "소녀 검사가 첫 방어전을 끝내고 성당교회 감독관에게 가자고 제안했다.",
    memories: [
      "마법진에서 소녀 검사가 현현해 치명타를 막고 마스터인지 물었다.",
      "종이가면 추적자가 물러나 첫 전투가 끝났고 감독관을 만나러 가기로 했다.",
    ],
    encounteredCharacterIds: [classGuardSaberNpc.id],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack: regressionPack,
      state,
      userText: "",
      advanceMode: "canonical",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: {
        location: string;
        variablesAdd: Array<{ id: string; detail: string }>;
      };
      warning?: string;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const text = body.blocks.map((block) => block.text).join(" ");
    const progress = body.statePatch.variablesAdd.find(
      (variable) => variable.id === "RELAY_SERVER_STORY_ROUTE_PROGRESS",
    );

    assert.equal(response.status, 200);
    assert.doesNotMatch(text, /나디아|학생식당|배달\s*대행/);
    assert.match(text, /명동성당|오요한|감독관/);
    assert.equal(body.statePatch.location, "명동성당 부속 별관 지하 고해실");
    assert.match(progress?.detail ?? "", /EV_PROLOGUE_09_CHURCH_ORIENTATION/);
    assert.match(body.warning ?? "", /사건 순서|메인 사건 연결|현재 사건 범위/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("다른 작품도 과거 사건 재작성이 반복되면 원본을 잘라 저장하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const firstEvent = {
    ...demoScenario.events[0],
    id: "EVENT_ARCHIVE_OPENING_PAST",
    name: "봉인 서고 개방",
    required: true,
    sequence: 1,
    priority: 100,
    completionSignals: "봉인문이 열렸다",
    requiredItems: "청동 인장",
    requiredDialogue: "문이 열렸습니다.",
    recoveryAlternatives: "관리 기록의 지연 전달",
    endSceneAfterCompletion: true,
  };
  const laterEvent = {
    ...demoScenario.events[0],
    id: "EVENT_CLOCK_JUDGMENT_CURRENT",
    name: "시계탑의 심판",
    required: true,
    sequence: 2,
    priority: 90,
    completionSignals: "심판이 시작됐다",
    requiredItems: "",
    requiredDialogue: "",
    recoveryAlternatives: "시계탑의 종이 울린다",
    endSceneAfterCompletion: true,
  };
  const pack = {
    ...demoScenario,
    projectId: "GENERIC-CLOSED-REQUIRED-EVENT-REGRESSION",
    title: "시계도서관의 마지막 열쇠",
    genre: "미스터리 어드벤처",
    events: [firstEvent, laterEvent],
  };
  const wrongPastTurn = {
    ...validLunaTurn,
    blocks: [
      {
        type: "narration",
        text: "아침의 폐쇄 서고로 장면이 돌아갔다. 봉인문이 열렸다.",
        speakerId: "",
        speakerName: "",
        emotion: "",
        mediaAssetId: "",
      },
      {
        type: "dialogue",
        text: "문이 열렸습니다.",
        speakerId: "",
        speakerName: "사서 미라",
        emotion: "차분함",
        mediaAssetId: "",
      },
    ],
    statePatch: {
      ...validLunaTurn.statePatch,
      time: "09:05",
      location: "폐쇄 서고",
      sceneSummary: "과거의 봉인 서고 개방 장면으로 돌아갔다.",
      inventoryAdd: ["청동 인장"],
      memoryAdd: ["봉인문이 열렸다."],
    },
  };
  globalThis.fetch = (async () =>
    Response.json({
      output_text: JSON.stringify(wrongPastTurn),
      usage: {
        input_tokens: 900,
        output_tokens: 260,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    })) as typeof fetch;

  const state = {
    ...createInitialState(pack),
    turn: 8,
    time: "16:40",
    location: "시계탑 상층 심판실",
    sceneSummary: "시계탑의 심판이 시작됐고 현재 증언 차례를 기다리고 있다.",
    memories: ["심판이 시작됐다."],
  };
  const request = new Request("http://localhost/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack,
      state,
      userText: "",
      advanceMode: "canonical",
      recentTurns: [],
      apiKey: "sk-test-do-not-store",
    }),
  });

  try {
    const response = await POST(request);
    const body = (await response.json()) as {
      blocks: Array<{ text: string }>;
      statePatch: { location: string; inventoryAdd: string[] };
      warning?: string;
      code?: string;
      error?: string;
    };
    assertNexusRewriteRejected(response, body);
    if (response.status === 422) return;
    return;
    const text = body.blocks.map((block) => block.text).join(" ");

    assert.equal(response.status, 200);
    assert.doesNotMatch(text, /봉인문이 열렸다|문이 열렸습니다|폐쇄 서고/);
    assert.equal(body.statePatch.location, state.location);
    assert.ok(!body.statePatch.inventoryAdd.includes("청동 인장"));
    assert.match(body.warning ?? "", /사건 순서|현재 사건 범위|메인 사건 연결/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
