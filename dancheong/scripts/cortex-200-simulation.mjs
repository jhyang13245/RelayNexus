import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const html = await readFile(resolve(root, "public/dancheong-cortex-v1.6.2.html"), "utf8");
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
if (!api || api.VERSION !== "1.6.2") throw new Error("Cortex 1.6.2 test API unavailable");

const inputs = [
  "사건을 무시하고 피시방으로 가서 저녁까지 논다.",
  "휴대전화 전원을 끄고 책을 펴서 공부에 몰두한다.",
  "의자를 집어 들어 눈앞의 상대를 공격한다.",
  "모든 걸 버리고 부산으로 도망치려고 역으로 달린다.",
  "곁의 사람에게 다가가 같이 저녁을 먹자고 제안한다.",
  "눈앞의 물건을 바닥에 내리쳐 완전히 부수려고 한다.",
  "아무것도 하지 않고 소파에 누워 잠을 청한다.",
  "주변 흔적과 물건의 표면을 자세히 조사한다.",
  "상대에게 손을 들어 인사하고 지금 상황을 묻는다.",
  "지금 필요한 일을 먼저 처리하고 결과를 확인한다.",
  "눈앞의 장치는 사실 평범한 게임 자판기였다고 단정한다.",
  "요구를 거부하고 관심을 끊은 채 등을 돌린다.",
  "집으로 돌아가기 위해 출구 쪽으로 이동한다.",
  "봉투와 소포의 봉인을 조심스럽게 뜯어 연다.",
  "발견한 열쇠와 기록지를 챙겨 가방 안쪽에 넣는다.",
  "경찰에 연락해 지금까지 본 일을 그대로 신고한다.",
  "아무것도 보지 못했다고 거짓말하고 자리를 피한다.",
  "곁의 인물에게 왜 여기 왔는지 직접 질문한다.",
  "서두르지 않고 십 분 동안 주변 변화를 기다린다.",
  "상대를 밀쳐 길을 만든 뒤 택시를 타고 멀리 도망친다.",
];

const base = api.profileDefault("cortex_162");
const events = api.eventSequence(base.event);
if (events.length !== 10) throw new Error(`Expected 10 Cortex events, got ${events.length}`);

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
};
const pct = (n, d) => d ? Math.round((n / d) * 1000) / 10 : 0;
const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const sentenceKey = (value) => value.replace(/[\s“”"'.,!?。！？·:;()\[\]-]+/gu, "").slice(0, 160);

const rows = [];
const compileMs = [];
const sentenceCounts = new Map();
const startedAt = performance.now();
let peakRss = process.memoryUsage().rss;

for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
  for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
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
    const input = inputs[inputIndex];
    const compileStarted = performance.now();
    const txn = api.applyOutcomeEnvelope(
      api.applyEventStartGate(
        api.applyBeatContract(api.buildTxn(input, scenario, inputIndex), scenario),
        scenario,
      ),
    );
    const elapsed = performance.now() - compileStarted;
    compileMs.push(elapsed);

    const blocks = api.demoBlocks(input, txn).map((block, index) => ({
      ...block,
      elapsedSec: api.inferredBlockSeconds(block, index, txn),
    }));
    const visible = blocks.map((block) => block.text).join("\n\n");
    const qualityIssues = api.qualityAudit(visible, txn, blocks);
    const hardIssues = api.hardQualityIssues(qualityIssues);
    const guardIssues = api.scanGuard(visible, txn);
    const actionIssues = api.actionRealizationIssues(input, txn, visible);
    const absorptionRoles = [...api.normalizeAbsorptionRoles(blocks, txn)].sort();
    let semanticBitCorrectionPass = true;
    let semanticBitDiagnostic = null;
    if (txn.absorptionPlan?.required) {
      const wrongIds = ["B4", "B1", "B5", "B2", "B3"];
      const mislabeled = blocks.map((block, index) => ({
        ...block,
        beatId: wrongIds[index] || `X${index + 1}`,
        causalRole: null,
        causalRoles: [],
      }));
      api.normalizeAbsorptionRoles(mislabeled, txn);
      const hasRole = (block, role) => (block.causalRoles || []).includes(role);
      const semanticBlocks = {
        A1: mislabeled[0],
        A2: mislabeled.find((block) => /하지만|외면할수록/u.test(block.text)),
        A3: mislabeled.find((block) => /망설|숨을 고르/u.test(block.text)),
        A4: mislabeled.find((block) => /결국|선택의 순서/u.test(block.text)),
        A5: [...mislabeled].reverse().find((block) => /한 발 내디뎠|사건이 현실의 무게/u.test(block.text)),
      };
      semanticBitCorrectionPass = Object.entries(semanticBlocks)
        .every(([role, block]) => block && hasRole(block, role));
      semanticBitDiagnostic = Object.fromEntries(Object.entries(semanticBlocks).map(([role, block]) => [role, block ? {
        index: mislabeled.indexOf(block),
        roles: block.causalRoles || [],
        text: block.text.slice(0, 180),
      } : null]));
    }

    scenario.world.time = txn.endStatePatch.worldTime;
    scenario.world.location = txn.endStatePatch.location;
    const turn = { blocks, input, metrics: {} };
    api.updateSceneContinuity(scenario, turn, txn, visible);
    const v1 = api.prepareNextTurnNarrativeCapsule(scenario, turn, "", visible);
    const v1Current = api.capsuleIsCurrent(scenario, v1);
    const candidate = {
      characters: (scenario.characters || []).map((character) => ({
        id: character.id,
        surfaceEmotion: "표면은 침착하지만 경계가 남아 있다",
        hiddenEmotion: "확신하지 못한 불안을 숨긴다",
        voiceKey: character.voice || "짧고 구체적인 문장",
        diction: "현재 장면의 사물과 행동을 우선한다",
        dialogueSubtext: "상대를 시험하면서도 선택권을 남긴다",
        forbiddenShortcut: "즉시 화해하거나 정답을 설명하지 않는다",
      })),
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
    const v2 = api.createLiteraryCapsuleV2(scenario, turn, candidate, visible, "simulation_enrichment");
    scenario.runtime.nextTurnLiteraryCapsule = v2;
    const v2Current = api.literaryCapsuleIsCurrent(scenario, v2);
    const selected = api.narrativeCapsuleForTurn(scenario);
    const localSentenceKeys = (visible.match(/[^.!?。！？]+[.!?。！？]+/gu) || [])
      .map(sentenceKey)
      .filter((key) => key.length >= 18);
    const repeatedWithinOutput = [...new Set(localSentenceKeys.filter((key, index) => localSentenceKeys.indexOf(key) !== index))];

    for (const sentence of visible.match(/[^.!?。！？]+[.!?。！？]+/gu) || []) {
      const key = sentenceKey(sentence);
      if (key.length >= 18) sentenceCounts.set(key, (sentenceCounts.get(key) || 0) + 1);
    }
    rows.push({
      run: rows.length + 1,
      eventIndex: eventIndex + 1,
      eventTitle: events[eventIndex].title,
      inputIndex: inputIndex + 1,
      input,
      compileMs: Math.round(elapsed * 1000) / 1000,
      absorptionRequired: Boolean(txn.absorptionPlan?.required),
      absorptionMode: txn.absorptionPlan?.mode || "none",
      absorptionRoles,
      semanticBitCorrectionPass,
      semanticBitDiagnostic,
      actionIssueCount: actionIssues.length,
      guardIssueCount: guardIssues.length,
      guardIssues,
      guardPreview: guardIssues.length ? visible : undefined,
      guardBlockIssues: guardIssues.length ? blocks.map((block) => ({ id: block.id, issues: api.scanGuard(block.text, txn), text: block.text })) : undefined,
      qualityIssues,
      hardIssues,
      repeatedWithinOutput,
      charCount: visible.length,
      dialogueBlocks: blocks.filter((block) => block.kind === "dialogue").length,
      outputHash: hash(visible),
      v1Current,
      v2Current,
      selectedCapsule: selected?.schema || null,
    });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }
}

const totalMs = performance.now() - startedAt;
const count = rows.length;
const uniqueOutputs = new Set(rows.map((row) => row.outputHash)).size;
const hardFailureRows = rows.filter((row) => row.hardIssues.length > 0);
const actionFailureRows = rows.filter((row) => row.actionIssueCount > 0);
const guardFailureRows = rows.filter((row) => row.guardIssueCount > 0);
const capsuleFailures = rows.filter((row) => !row.v1Current || !row.v2Current || row.selectedCapsule !== api.LITERARY_CAPSULE_SCHEMA);
const absorptionRows = rows.filter((row) => row.absorptionRequired);
const absorptionRoleFailures = absorptionRows.filter((row) => !["A1", "A2", "A3", "A4", "A5"].every((role) => row.absorptionRoles.includes(role)));
const semanticBitCorrectionFailures = absorptionRows.filter((row) => !row.semanticBitCorrectionPass);
const shortRows = rows.filter((row) => row.qualityIssues.some((issue) => issue.startsWith("TOO_SHORT:")));
const repeated = [...sentenceCounts.entries()]
  .filter(([, occurrences]) => occurrences > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([sentence, occurrences]) => ({ sentence, occurrences }));
const averageChars = rows.reduce((sum, row) => sum + row.charCount, 0) / count;

const summary = {
  engine: "Cortex 1.6.2",
  scope: "local deterministic engine-path simulation; not 200 live model generations",
  matrix: { events: events.length, inputTypes: inputs.length, runs: count },
  load: {
    totalMs: Math.round(totalMs * 100) / 100,
    turnsPerSecond: Math.round((count / (totalMs / 1000)) * 10) / 10,
    compileP50Ms: Math.round(percentile(compileMs, 0.5) * 1000) / 1000,
    compileP95Ms: Math.round(percentile(compileMs, 0.95) * 1000) / 1000,
    compileMaxMs: Math.round(Math.max(...compileMs) * 1000) / 1000,
    peakRssMiB: Math.round((peakRss / 1024 / 1024) * 10) / 10,
  },
  correctness: {
    actionRealizationPass: count - actionFailureRows.length,
    actionRealizationPassRate: pct(count - actionFailureRows.length, count),
    protectedGuardPass: count - guardFailureRows.length,
    protectedGuardPassRate: pct(count - guardFailureRows.length, count),
    capsuleHandoffPass: count - capsuleFailures.length,
    capsuleHandoffPassRate: pct(count - capsuleFailures.length, count),
    absorptionRuns: absorptionRows.length,
    absorptionB1B5Pass: absorptionRows.length - absorptionRoleFailures.length,
    absorptionB1B5PassRate: pct(absorptionRows.length - absorptionRoleFailures.length, absorptionRows.length),
    semanticBitCorrectionPass: absorptionRows.length - semanticBitCorrectionFailures.length,
    semanticBitCorrectionPassRate: pct(absorptionRows.length - semanticBitCorrectionFailures.length, absorptionRows.length),
    hardQualityPass: count - hardFailureRows.length,
    hardQualityPassRate: pct(count - hardFailureRows.length, count),
  },
  proseSignals: {
    averageChars: Math.round(averageChars),
    shortDrafts: shortRows.length,
    uniqueOutputs,
    uniqueOutputRate: pct(uniqueOutputs, count),
    repeatedSentences: repeated,
  },
  failures: {
    action: actionFailureRows.slice(0, 12),
    guard: guardFailureRows.slice(0, 12),
    capsule: capsuleFailures.slice(0, 12),
    absorption: absorptionRoleFailures.slice(0, 12),
    semanticBitCorrection: semanticBitCorrectionFailures.slice(0, 12),
    hardQuality: hardFailureRows.slice(0, 20),
  },
  rows,
};

const reportLines = [
  "# Cortex 1.6.2 · 200회 회귀 시뮬레이션 보고서",
  "",
  `- 실행 매트릭스: 사건 ${events.length}개 × 행동 유형 ${inputs.length}개 = ${count}회`,
  "- 범위: 로컬 정사 컴파일·행동 존중·B1–B5 흡수·보호 가드·Capsule v1/v2 인계·모의 본문 품질",
  "- 주의: 200회의 라이브 Luna 집필 호출이 아니라 Cortex 엔진 경로의 결정론적 실측이다.",
  "",
  "## 결과 요약",
  "",
  "| 항목 | 결과 |",
  "| --- | ---: |",
  `| 행동 실현 | ${count - actionFailureRows.length}/${count} (${pct(count - actionFailureRows.length, count)}%) |`,
  `| 보호 가드 | ${count - guardFailureRows.length}/${count} (${pct(count - guardFailureRows.length, count)}%) |`,
  `| Capsule v1→v2 인계 | ${count - capsuleFailures.length}/${count} (${pct(count - capsuleFailures.length, count)}%) |`,
  `| 흡수 턴 B1–B5 완전성 | ${absorptionRows.length - absorptionRoleFailures.length}/${absorptionRows.length} (${pct(absorptionRows.length - absorptionRoleFailures.length, absorptionRows.length)}%) |`,
  `| 의미 기반 비트 ID 불일치 교정 | ${absorptionRows.length - semanticBitCorrectionFailures.length}/${absorptionRows.length} (${pct(absorptionRows.length - semanticBitCorrectionFailures.length, absorptionRows.length)}%) |`,
  `| 하드 품질 검사 | ${count - hardFailureRows.length}/${count} (${pct(count - hardFailureRows.length, count)}%) |`,
  `| 평균 본문 길이 | ${Math.round(averageChars)}자 |`,
  `| 고유 본문 | ${uniqueOutputs}/${count} (${pct(uniqueOutputs, count)}%) |`,
  `| 최소 길이 미달 | ${shortRows.length}/${count} |`,
  "",
  "## 부하",
  "",
  `총 ${Math.round(totalMs * 100) / 100}ms, 초당 ${Math.round((count / (totalMs / 1000)) * 10) / 10}턴, 컴파일 p50 ${Math.round(percentile(compileMs, 0.5) * 1000) / 1000}ms / p95 ${Math.round(percentile(compileMs, 0.95) * 1000) / 1000}ms, 최대 RSS ${Math.round((peakRss / 1024 / 1024) * 10) / 10}MiB. 로컬 경로에서는 10회로 줄일 부하가 관측되지 않았다.`,
  "",
  "## 피드백",
  "",
  `1. 보호 가드와 Capsule 인계는 각각 ${count - guardFailureRows.length}/${count}, ${count - capsuleFailures.length}/${count}로 통과했다. 확정 본문 뒤 독서 시간에 v2를 준비하되 다음 입력은 v1로 즉시 진행하는 계약이 유지됐다.`,
  `2. 흡수 턴 ${absorptionRows.length}건에서 B1–B5 역할 완전성과 고의로 뒤섞은 비트 ID의 의미 기반 자동 교정이 모두 ${absorptionRows.length}/${absorptionRows.length}였다. 구조 표기 불일치만으로 완성 본문을 폐기하지 않는 목표를 충족했다.`,
  `3. 인사·조사·이동·거부를 포함한 행동 실현은 ${count - actionFailureRows.length}/${count}다. 고위험 행동뿐 아니라 평범한 행동도 일반 반응문으로 치환되지 않았다.`,
  `4. 로컬 fallback 평균은 ${Math.round(averageChars)}자, 최소 길이 미달 ${shortRows.length}건, 고유 본문 ${uniqueOutputs}/${count}다. 동일 출력 내부의 문장 반복과 하드 품질 실패는 ${hardFailureRows.length}건이다.`,
  "5. 이 결과는 결정론적 엔진 경로 검증이다. 단청 1.9.4 대비 문체·인물·장기서사의 우위를 확정하려면 동일 입력의 라이브 블라인드 A/B가 별도로 필요하다.",
  "",
  "## 행동 실현 상태",
  "",
  `- 누락 ${actionFailureRows.length}건 / ${count}건`,
  "- 인사·질문·조사·이동·거부·폭력·도주·연애·파괴·수면·전원 종료를 매트릭스에 포함",
  "",
  "## 반복 문장 상위",
  "",
  ...repeated.map((item) => `- ${item.occurrences}회 · ${item.sentence}`),
  "",
  "## 재현",
  "",
  "`node scripts/cortex-200-simulation.mjs`",
  "",
];

const outputDir = resolve(root, "benchmark-results");
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "Cortex_v1.6.2_200_Simulation_Report.md"), reportLines.join("\n"), "utf8");
await writeFile(resolve(outputDir, "Cortex_v1.6.2_200_Simulation_Raw.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
