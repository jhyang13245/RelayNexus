import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const html = await readFile(resolve(root, "public/dancheong-cortex-v1.6.4.html"), "utf8");
const script = /<script>([\s\S]*?)<\/script>/u.exec(html)?.[1];
if (!script) throw new Error("Cortex inline runtime script not found");

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      value: id === "styleGuide" ? "절제된 한국 장르소설 문체" : "",
      textContent: "",
      innerHTML: "",
      style: {},
      disabled: false,
      files: [],
      classList: { add() {}, remove() {}, toggle() { return true; }, contains() { return false; } },
      addEventListener() {},
      setAttribute() {},
      showModal() {},
      closest() { return null; },
      lastElementChild: null,
    });
  }
  return elements.get(id);
};
const document = {
  getElementById: element,
  createElement: () => element("created"),
  addEventListener() {},
  body: { classList: { toggle() {} } },
};
const window = { scrollY: 0, innerHeight: 800, addEventListener() {} };
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
new Function("document", "window", "localStorage", script)(document, window, localStorage);
const api = window.__DANCHEONG_CORTEX_TEST__;
if (!api || api.VERSION !== "1.6.4") throw new Error("Cortex 1.6.4 test API unavailable");

const CASES = [
  {
    id: "baseline_absorption",
    label: "일반 이탈·정사 흡수",
    input: "사건을 무시하고 피시방으로 가서 저녁까지 논다.",
  },
  {
    id: "tag_leak",
    label: "STORY/N/D/CANON 태그 누출",
    input: "휴대전화 전원을 끄고 책을 펴서 공부에 몰두한다.",
  },
  {
    id: "incomplete_tail",
    label: "로그 기반 미완성 꼬리 문장",
    input: "곁의 사서에게 지금 상황을 직접 질문한다.",
  },
  {
    id: "violence_softening",
    label: "확정 타격의 스침 약화",
    input: "해머를 휘두르다 실수로 사서의 얼굴을 정통으로 강타해버린다.",
  },
  {
    id: "escape_reversal",
    label: "도주 뒤 같은 턴 정사 복귀",
    input: "아무도 모르는 곳으로 도망친다.",
  },
  {
    id: "destruction_completion",
    label: "확정 파괴의 모호화",
    input: "받은 봉투를 해머로 내려쳐 조사버린다.",
  },
  {
    id: "throw_not_destruction",
    label: "투척의 파괴 오분류",
    input: "열쇠를 야구 보살하듯 창밖의 먼 곳을 향해 풀파워로 던져버린다.",
  },
  {
    id: "ambiguous_canon",
    label: "모호한 파괴 증거 정사 저장",
    input: "주변 흔적과 물건의 표면을 자세히 조사한다.",
  },
  {
    id: "polluted_target",
    label: "오염된 정사 대상명",
    input: "발견한 해머를 챙겨 가방 안쪽에 넣는다.",
  },
  {
    id: "composite_log_regression",
    label: "1.6.1 실사용 로그 복합 결함",
    input: "사서를 쫓으려고 해머를 휘두르다 실수로 사서의 얼굴을 해머로 강타해버린다. 당황한 그는 받은 봉투까지 해머로 내려쳐 조사버린다. 그리고 아무도 모르는 곳으로 도망친다",
  },
];

const LOG_SEEDS = {
  softenedViolence: "해머 끝은 간발의 차로 그의 뺨을 스쳤다. 안경이 바닥에 떨어져 빙글 돌았다.",
  ambiguousDestruction: "열쇠가 부서진 건지, 택배함이 얻어맞은 건지 판단하기 어려웠다.",
  incompleteTail: "사서가 조심스럽게 다가오자 그는",
  escapeReversal: "시우는 숨을 삼키며 방향을 틀었다. 도망치는 발끝이 무인택배함 쪽을 향했다.",
  internalPatch: "한시우는 말로만 위협하지 않았다. 결과가 정해지기 전 주변의 시선과 움직임이 즉시 그 시도에 반응했다.",
  pollutedTarget: "안에서 해머의 손잡이",
  pollutedEvidence: "시우의 손이 주머니 안에서 해머의 손잡이를 움켜쥐었다.",
};

const base = api.profileDefault("cortex_164");
const events = api.eventSequence(base.event);
if (events.length !== 10) throw new Error(`Expected 10 Cortex events, got ${events.length}`);

const pct = (n, d) => d ? Math.round((n / d) * 1000) / 10 : 0;
const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const visibleOf = (blocks) => blocks.map((block) => block.text).join("\n\n");
const addCheck = (checks, name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });
const hasEscapeReversal = (text) => /(?:도망치는|달아나는)[^.!?]{0,40}(?:발|걸음)[^.!?]{0,40}(?:택배함|사건|원래\s*장소)|방향을\s*틀[^.!?]{0,50}(?:택배함|사건|도서관)/u.test(text);

function parseStreamedStory(raw) {
  const blocks = new Map();
  const envelope = api.storyEnvelope((event) => {
    const id = event.block.id;
    if (!blocks.has(id)) blocks.set(id, { ...event.block, text: "" });
    if (event.type === "delta") blocks.get(id).text += event.text;
  });
  for (const chunk of raw.match(/[\s\S]{1,11}/gu) || []) envelope.push(chunk);
  envelope.finish();
  return [...blocks.values()].map((block) => block.text).join("\n");
}

function literaryCandidate(scenario, txn) {
  return {
    characters: (scenario.characters || []).map((character) => ({
      name: character.name,
      surfaceEmotion: "표면은 침착하지만 경계가 남아 있다",
      hiddenEmotion: "확신하지 못한 불안을 숨긴다",
      currentAttitude: "상대를 관찰하며 다음 행동을 고른다",
      voiceKey: character.voice || "짧고 구체적인 문장",
      diction: "현재 장면의 사물과 행동을 우선한다",
      dialogueSubtext: "상대를 시험하면서도 선택권을 남긴다",
      forbiddenShortcut: "즉시 화해하거나 정답을 설명하지 않는다",
    })),
    relationships: [],
    styleBlueprint: {
      perspectiveDistance: "주인공의 감각에 가까운 제한적 시점",
      sentenceRhythm: "행동은 짧게, 감정의 여파는 한 호흡 길게",
      sensoryPalette: ["마찰음", "빛의 온도", "손끝의 저항"],
      metaphorDiscipline: "장면당 핵심 비유 하나만 유지",
      endingImage: "이미 존재하는 사물의 작은 변화",
    },
    sceneArc: {
      emotionalTrajectory: ["즉각 반응", "저항", "망설임", "자기 선택"],
      tensionCurve: ["상승", "유지", "작은 전환"],
      sceneDelta: "행동의 결과로 관계와 사건의 압력이 한 단계 변한다",
      atmosphere: ["가까운 소리", "멈춘 공기"],
      closingImage: "손에서 놓이지 않은 물건",
    },
    longArc: {
      openThreads: [txn.writerContext?.event?.nextBeat || "현재 사건의 미해결 기능"],
      foreshadowDebts: ["현재 선택의 대가를 다음 사건에서 회수"],
      promises: ["보류된 욕구를 삭제하지 않음"],
      relationshipDirections: ["말보다 행동으로 신뢰 변화를 축적"],
      futureCandidates: ["조사", "대화", "이동"],
    },
    styleAvoid: ["감정 즉시 해소", "같은 비유 반복", "미래 정답 설명"],
  };
}

const rows = [];
const startedAt = performance.now();
let peakRss = process.memoryUsage().rss;

for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
  for (let caseIndex = 0; caseIndex < CASES.length; caseIndex += 1) {
    const testCase = CASES[caseIndex];
    api._setScenario({
      ...structuredClone(base),
      event: structuredClone(events[eventIndex]),
      world: {
        ...structuredClone(base.world),
        time: events[eventIndex].startTime,
        location: events[eventIndex].canonLocation || base.world.location,
      },
    });
    const scenario = api._scenario();
    const runStarted = performance.now();
    const txn = api.applyOutcomeEnvelope(
      api.applyEventStartGate(
        api.applyBeatContract(api.buildTxn(testCase.input, scenario, rows.length), scenario),
        scenario,
      ),
    );
    const blocks = api.demoBlocks(testCase.input, txn).map((block, index) => ({
      ...block,
      elapsedSec: api.inferredBlockSeconds(block, index, txn),
    }));
    let visible = visibleOf(blocks);
    const checks = [];

    const preRepairIssues = api.qualityAudit(visible, txn, blocks);
    const fallbackIssues = preRepairIssues.filter((issue) => issue.startsWith("INPUT_ACTION_MISSING:") || issue.startsWith("INPUT_RESULT_MISSING:"));
    if (fallbackIssues.length) {
      const patchText = api.actionRealizationPatch(txn, fallbackIssues);
      if (patchText) {
        blocks.push({ id: `fallback-${rows.length + 1}`, kind: "narration", beatId: "L1", text: patchText, elapsedSec: 5 });
        api.dropRepeatedBlocks({ blocks, input: testCase.input, txn, repairAudit: [] });
        visible = visibleOf(blocks);
      }
    }
    const actionIssues = api.actionRealizationIssues(testCase.input, txn, visible);
    const guardIssues = api.scanGuard(visible, txn);
    const qualityIssues = api.qualityAudit(visible, txn, blocks);
    const hardIssues = api.hardQualityIssues(qualityIssues);
    addCheck(checks, "BASE_ACTION_REALIZED", actionIssues.length === 0, `${actionIssues.join(", ")}${actionIssues.length ? ` / results: ${api.explicitOutcomeIssues(txn, visible).join(", ")}` : ""}`);
    addCheck(checks, "BASE_GUARD_CLEAN", guardIssues.length === 0, guardIssues.join(", "));
    addCheck(checks, "BASE_HARD_QUALITY", hardIssues.length === 0, hardIssues.join(", "));
    addCheck(checks, "TIME_MONOTONIC", api.parseClock(txn.endStatePatch.worldTime) >= api.parseClock(txn.start.time));

    if (txn.absorptionPlan?.required && txn.absorptionPlan.mode !== "BRANCH_REQUIRED") {
      const wrongIds = ["B4", "B1", "B5", "B2", "B3"];
      const mislabeled = blocks.map((block, index) => ({
        ...block,
        beatId: wrongIds[index] || `X${index + 1}`,
        causalRole: null,
        causalRoles: [],
      }));
      const roles = api.normalizeAbsorptionRoles(mislabeled, txn);
      addCheck(checks, "SEMANTIC_B1_B5_CORRECTION", ["A1", "A2", "A3", "A4", "A5"].every((role) => roles.has(role)), [...roles].join(", "));
    }

    const turn = { blocks: structuredClone(blocks), input: testCase.input, txn, metrics: {}, repairAudit: [] };
    scenario.world.time = txn.endStatePatch.worldTime;
    scenario.world.location = txn.endStatePatch.location;
    api.updateSceneContinuity(scenario, turn, txn, visible);
    const v1 = api.prepareNextTurnNarrativeCapsule(scenario, turn, "", visible);
    const v2 = api.createLiteraryCapsuleV2(scenario, turn, literaryCandidate(scenario, txn), visible, "simulation_enrichment");
    scenario.runtime.nextTurnLiteraryCapsule = v2;
    const selected = api.narrativeCapsuleForTurn(scenario);
    addCheck(checks, "CAPSULE_V1_CURRENT", api.capsuleIsCurrent(scenario, v1));
    addCheck(checks, "CAPSULE_V2_CURRENT", api.literaryCapsuleIsCurrent(scenario, v2));
    addCheck(checks, "CAPSULE_V2_SELECTED", selected?.schema === api.LITERARY_CAPSULE_SCHEMA, selected?.schema || "none");
    const capsuleSchema = api.literaryCapsuleJsonSchema();
    addCheck(checks, "CAPSULE_STRICT_SCHEMA", capsuleSchema?.additionalProperties === false && capsuleSchema?.properties?.longArc?.additionalProperties === false);

    if (testCase.id === "tag_leak") {
      const injected = `<STORY><N beat="L1" sec="12">정상적으로 완결된 장면이다.</N><CANON>{"deltas":[]}</CANON></STORY>`;
      const parsed = parseStreamedStory(injected);
      const detected = api.scanGuard(`<N>내부 구조</N><CANON>{"deltas":[]}</CANON>`, txn);
      addCheck(checks, "TAG_LEAK_DETECTED", detected.includes("OUTPUT_CONTRACT"), detected.join(", "));
      addCheck(checks, "STREAM_TAGS_STRIPPED", parsed.includes("정상적으로 완결된 장면이다.") && !/<\/?(?:STORY|PROSE|N|D|CANON)\b/i.test(parsed), parsed);
    }

    if (testCase.id === "incomplete_tail") {
      const polluted = `${visible}\n\n${LOG_SEEDS.incompleteTail}`;
      const detected = api.qualityAudit(polluted, txn, blocks);
      addCheck(checks, "INCOMPLETE_TAIL_DETECTED", api.danglingIncompleteTail(LOG_SEEDS.incompleteTail) && detected.includes("INCOMPLETE_TAIL"), detected.join(", "));
      addCheck(checks, "INCOMPLETE_TAIL_IS_HARD", api.hardQualityIssues(detected).includes("INCOMPLETE_TAIL"));
    }

    if (testCase.id === "violence_softening") {
      const repairTurn = { blocks: [{ id: "bad-hit", kind: "narration", beatId: "L1", text: LOG_SEEDS.softenedViolence }], input: testCase.input, txn, repairAudit: [] };
      addCheck(checks, "VIOLENCE_CLAIM_EXPLICIT", txn.outcomeClaims?.violenceImpact === true);
      addCheck(checks, "SOFTENED_HIT_DETECTED", api.explicitOutcomeIssues(txn, visibleOf(repairTurn.blocks)).includes("INPUT_RESULT_MISSING:VIOLENCE_IMPACT"));
      api.dropRepeatedBlocks(repairTurn);
      const repaired = visibleOf(repairTurn.blocks);
      addCheck(checks, "SOFTENED_HIT_REPAIRED", !api.explicitOutcomeIssues(txn, repaired).includes("INPUT_RESULT_MISSING:VIOLENCE_IMPACT") && !/간발의\s*차|스쳤/u.test(repaired), repaired);
      addCheck(checks, "VIOLENCE_REPAIR_AUDITED", repairTurn.repairAudit.includes("EXPLICIT_VIOLENCE_IMPACT"), repairTurn.repairAudit.join(", "));
    }

    if (testCase.id === "escape_reversal") {
      const repairTurn = { blocks: [{ id: "bad-escape", kind: "narration", beatId: "L1", text: `시우는 도서관 출입구를 지나 현장을 완전히 벗어났다. ${LOG_SEEDS.escapeReversal}` }], input: testCase.input, txn, repairAudit: [] };
      addCheck(checks, "ESCAPE_CLAIM_EXPLICIT", txn.outcomeClaims?.escapeComplete === true);
      addCheck(checks, "ESCAPE_DEFERRED_NOT_REDIRECTED", txn.absorptionPlan?.mode === "DEFERRED_ESCAPE" && txn.absorptionPlan?.required === false && txn.endStatePatch.location !== txn.start.location, `${txn.absorptionPlan?.mode} / ${txn.start.location} -> ${txn.endStatePatch.location}`);
      addCheck(checks, "ESCAPE_REVERSAL_DETECTED", api.explicitOutcomeIssues(txn, visibleOf(repairTurn.blocks)).includes("INPUT_RESULT_MISSING:ESCAPE_COMPLETE"));
      api.dropRepeatedBlocks(repairTurn);
      const repaired = visibleOf(repairTurn.blocks);
      addCheck(checks, "ESCAPE_REVERSAL_REPAIRED", !hasEscapeReversal(repaired) && !api.explicitOutcomeIssues(txn, repaired).includes("INPUT_RESULT_MISSING:ESCAPE_COMPLETE"), repaired);
      addCheck(checks, "ESCAPE_REPAIR_AUDITED", repairTurn.repairAudit.includes("ESCAPE_REVERSAL_REMOVED"), repairTurn.repairAudit.join(", "));
    }

    if (testCase.id === "destruction_completion") {
      const patch = api.actionRealizationPatch(txn, ["INPUT_ACTION_MISSING:DESTRUCTION"]);
      addCheck(checks, "DESTRUCTION_CLAIM_EXPLICIT", txn.outcomeClaims?.destructionComplete === true);
      addCheck(checks, "DESTRUCTION_RESULT_REALIZED", !api.explicitOutcomeIssues(txn, patch).includes("INPUT_RESULT_MISSING:DESTRUCTION_COMPLETE"), patch);
      addCheck(checks, "DESTRUCTION_NOT_AMBIGUOUS", !api.ambiguousCanonEvidence("destruction", patch), patch);
    }

    if (testCase.id === "throw_not_destruction") {
      const claims = api.explicitOutcomeClaims(testCase.input);
      addCheck(checks, "THROW_NOT_DESTRUCTION_CLAIM", claims.destructionComplete === false, JSON.stringify(claims));
      addCheck(checks, "THROW_NOT_DESTRUCTION_FAILURE", !api.actionRealizationIssues(testCase.input, txn, visible).includes("INPUT_ACTION_MISSING:DESTRUCTION"), api.actionRealizationIssues(testCase.input, txn, visible).join(", "));
    }

    if (testCase.id === "ambiguous_canon") {
      const candidate = { kind: "destruction", statement: LOG_SEEDS.ambiguousDestruction, evidence: LOG_SEEDS.ambiguousDestruction, targetName: "열쇠" };
      const sanitized = api.sanitizeCanonDelta(scenario, candidate, { txn, publicText: LOG_SEEDS.ambiguousDestruction });
      addCheck(checks, "AMBIGUOUS_CANON_DETECTED", api.ambiguousCanonEvidence("destruction", LOG_SEEDS.ambiguousDestruction));
      addCheck(checks, "AMBIGUOUS_CANON_REJECTED", sanitized === null, JSON.stringify(sanitized));
    }

    if (testCase.id === "polluted_target") {
      const grounded = api.groundedObjectFromEvidence("inventory_add", LOG_SEEDS.pollutedEvidence, LOG_SEEDS.pollutedTarget);
      addCheck(checks, "POLLUTED_TARGET_NORMALIZED", grounded === "해머", grounded);
      addCheck(checks, "POLLUTED_PREFIX_REMOVED", !/안에서|손잡이/u.test(grounded), grounded);
    }

    if (testCase.id === "composite_log_regression") {
      const claims = api.explicitOutcomeClaims(testCase.input);
      const badText = [LOG_SEEDS.softenedViolence, LOG_SEEDS.ambiguousDestruction, LOG_SEEDS.escapeReversal, LOG_SEEDS.internalPatch].join(" ");
      const detected = api.qualityAudit(badText, txn, [{ id: "bad", kind: "narration", beatId: "L1", text: badText }]);
      const finalPatch = api.actionRealizationPatch(txn, ["INPUT_ACTION_MISSING:VIOLENCE", "INPUT_ACTION_MISSING:DESTRUCTION", "INPUT_ACTION_MISSING:ESCAPE"]);
      addCheck(checks, "COMPOSITE_ALL_CLAIMS", claims.violenceImpact && claims.destructionComplete && claims.escapeComplete, JSON.stringify(claims));
      addCheck(checks, "COMPOSITE_DEFECTS_DETECTED", detected.includes("INPUT_RESULT_MISSING:VIOLENCE_IMPACT") && detected.includes("INPUT_RESULT_MISSING:DESTRUCTION_COMPLETE") && detected.includes("INPUT_RESULT_MISSING:ESCAPE_COMPLETE") && detected.includes("INTERNAL_PATCH_LEAK"), detected.join(", "));
      addCheck(checks, "COMPOSITE_DEFECTS_HARD_FAIL", ["INPUT_RESULT_MISSING:VIOLENCE_IMPACT", "INPUT_RESULT_MISSING:DESTRUCTION_COMPLETE", "INPUT_RESULT_MISSING:ESCAPE_COMPLETE", "INTERNAL_PATCH_LEAK"].every((issue) => api.hardQualityIssues(detected).includes(issue)), api.hardQualityIssues(detected).join(", "));
      addCheck(checks, "COMPOSITE_FINAL_PATCH_CLEAN", api.explicitOutcomeIssues(txn, finalPatch).length === 0 && api.scanGuard(finalPatch, txn).length === 0 && !hasEscapeReversal(finalPatch), finalPatch);
      addCheck(checks, "COMPOSITE_ESCAPE_DEFERRED", txn.absorptionPlan?.mode === "DEFERRED_ESCAPE" && txn.endStatePatch.location !== txn.start.location, `${txn.absorptionPlan?.mode} / ${txn.start.location} -> ${txn.endStatePatch.location}`);
    }

    const failures = checks.filter((check) => !check.pass);
    rows.push({
      run: rows.length + 1,
      eventIndex: eventIndex + 1,
      eventTitle: events[eventIndex].title,
      caseId: testCase.id,
      caseLabel: testCase.label,
      input: testCase.input,
      pass: failures.length === 0,
      checks,
      failureCount: failures.length,
      outputHash: hash(visible),
      outputPreview: visible,
      elapsedMs: Math.round((performance.now() - runStarted) * 1000) / 1000,
    });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }
}

const totalMs = performance.now() - startedAt;
const passed = rows.filter((row) => row.pass).length;
const failed = rows.length - passed;
const caseSummary = CASES.map((testCase) => {
  const items = rows.filter((row) => row.caseId === testCase.id);
  const pass = items.filter((row) => row.pass).length;
  return { id: testCase.id, label: testCase.label, pass, total: items.length, passRate: pct(pass, items.length) };
});
const checkCounts = new Map();
for (const row of rows) {
  for (const check of row.checks) {
    const current = checkCounts.get(check.name) || { pass: 0, total: 0 };
    current.total += 1;
    if (check.pass) current.pass += 1;
    checkCounts.set(check.name, current);
  }
}
const summary = {
  engine: "Cortex 1.6.4",
  scope: "local deterministic engine-path simulation seeded from the Cortex 1.6.1 user log; no live Luna API calls",
  sourceLog: "dancheong-cortex-v1.6.1-log-1787628459044.json",
  matrix: { events: events.length, defectCases: CASES.length, runs: rows.length },
  result: { passed, failed, passRate: pct(passed, rows.length) },
  load: {
    totalMs: Math.round(totalMs * 100) / 100,
    turnsPerSecond: Math.round((rows.length / (totalMs / 1000)) * 10) / 10,
    averageRunMs: Math.round((totalMs / rows.length) * 1000) / 1000,
    maxRunMs: Math.max(...rows.map((row) => row.elapsedMs)),
    peakRssMiB: Math.round((peakRss / 1024 / 1024) * 10) / 10,
  },
  caseSummary,
  checkSummary: Object.fromEntries([...checkCounts].map(([name, value]) => [name, { ...value, passRate: pct(value.pass, value.total) }])),
  failures: rows.filter((row) => !row.pass),
  rows,
};

const reportLines = [
  "# Cortex 1.6.4 · 개선 회귀 시뮬레이션 100회 보고서",
  "",
  `- 실행 매트릭스: 사건 ${events.length}개 × 결함 유형 ${CASES.length}개 = ${rows.length}회`,
  "- 시드: 사용자가 제공한 Cortex 1.6.1 실사용 로그의 실제 실패 문구",
  "- 범위: 플레이어 결과 보존, 최종 본문 의미, 태그/미완성 문장, 도주 복귀, 정사 증거·대상명, B1–B5, Capsule v2",
  "- 비용: 라이브 Luna API 호출 없이 로컬 결정론적 엔진 경로로 실행",
  "",
  "## 종합 결과",
  "",
  `- 통과: ${passed}/${rows.length} (${pct(passed, rows.length)}%)`,
  `- 실패: ${failed}/${rows.length}`,
  `- 총 ${summary.load.totalMs}ms · 평균 ${summary.load.averageRunMs}ms/턴 · 최대 ${summary.load.maxRunMs}ms · 최대 RSS ${summary.load.peakRssMiB}MiB`,
  "",
  "## 결함 유형별 결과",
  "",
  "| 결함 유형 | 통과 |",
  "| --- | ---: |",
  ...caseSummary.map((item) => `| ${item.label} | ${item.pass}/${item.total} (${item.passRate}%) |`),
  "",
  "## 판정",
  "",
  failed === 0
    ? "1.6.1 로그에서 확인된 실패 유형은 Cortex 1.6.4의 실제 fallback 보정 경로를 포함한 이번 100회 매트릭스에서 모두 탐지·차단·교정됐다."
    : `총 ${failed}개 회차에서 회귀가 발견됐다. 아래 실패 목록을 수정 전 배포 차단 조건으로 사용해야 한다.`,
  "- 확정 타격·파괴·도주는 입력 결과를 시도로 약화하지 않는지 독립 판정했다.",
  "- 완료 도주는 같은 턴의 정사 장소 복귀를 금지하고 미완료 사건을 다음 턴 이후로 이연하는지 검사했다.",
  "- 구조 태그, 내부 보정문, 미완성 꼬리 문장은 최종 품질 하드 실패로 판정되는지 검사했다.",
  "- 모호한 파괴 문장은 정사 저장에서 거부되고, 오염된 대상명은 실제 물체명으로 정규화되는지 검사했다.",
  "- 주의: 이 결과는 서버 엔진 회귀 검증이며, 라이브 모델의 문체·대사·장기서사 품질 평가는 아니다.",
  "",
  "## 1.6.4 교정 확인",
  "",
  "1. 결정론적 demo/fallback 경로가 `INPUT_RESULT_MISSING:*`를 행동 보정기로 전달하고, 명시된 완료 결과에 맞는 보정문을 생성한다.",
  "2. 직접 타격·완료 도주·완료 파괴가 시도형 초안으로 생성되어도 최종 판정 전에 실제 완료 결과로 보완된다.",
  "3. 복합 입력에서도 폭력·파괴·도주의 누락 결과를 한 번에 수집해 함께 보완한다.",
  "4. 보정 후 최종 본문을 다시 품질·가드 검사하여 결과 누락이 남으면 배포 실패로 처리한다.",
  "",
  "## 실패 목록",
  "",
  ...(failed ? rows.filter((row) => !row.pass).map((row) => `- #${row.run} ${row.eventTitle} / ${row.caseLabel}: ${row.checks.filter((check) => !check.pass).map((check) => `${check.name}${check.detail ? ` (${check.detail})` : ""}`).join("; ")}`) : ["- 없음"]),
  "",
  "## 재현",
  "",
  "`node scripts/cortex-164-100-simulation.mjs`",
  "",
];

const outputDir = resolve(root, "benchmark-results");
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "Cortex_v1.6.4_100_Improved_Simulation_Report.md"), reportLines.join("\n"), "utf8");
await writeFile(resolve(outputDir, "Cortex_v1.6.4_100_Improved_Simulation_Raw.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ engine: summary.engine, matrix: summary.matrix, result: summary.result, load: summary.load, caseSummary: summary.caseSummary, failures: summary.failures.map((row) => ({ run: row.run, eventTitle: row.eventTitle, caseLabel: row.caseLabel, failedChecks: row.checks.filter((check) => !check.pass) })) }, null, 2));
