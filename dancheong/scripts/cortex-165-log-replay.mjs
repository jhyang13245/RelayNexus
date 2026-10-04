import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, log] = await Promise.all([
  readFile(new URL("public/dancheong-cortex-v1.6.5.html", root), "utf8"),
  readFile(new URL("tests/fixtures/cortex-164-log-20-turns.json", root), "utf8").then(JSON.parse),
]);
const script = /<script>([\s\S]*?)<\/script>/u.exec(html)?.[1];
assert.ok(script, "Cortex inline runtime is missing");

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, {
    id, value: id === "styleGuide" ? "라이트노벨 문체" : "", textContent: "", innerHTML: "",
    style: {}, disabled: false, files: [], classList: { add() {}, remove() {}, toggle() { return true; } },
    addEventListener() {}, showModal() {}, lastElementChild: null,
  });
  return elements.get(id);
};
const document = { getElementById: element, createElement: () => element("created") };
const window = {};
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
new Function("document", "window", "localStorage", script)(document, window, localStorage);
const api = window.__DANCHEONG_CORTEX_TEST__;
assert.ok(api);

assert.equal(log.turns.length, 20, "attached log must contain the exact 20 turns");
const scenario = api.profileDefault("cortex_165");
const replay = [];
let priorEnd = api.parseClock(log.turns[0].startTime);

for (const [index, source] of log.turns.entries()) {
  assert.equal(source.status, "COMMITTED", `turn ${index + 1} was not committed in the source log`);
  assert.ok(source.input, `turn ${index + 1} input missing`);
  const turn = {
    input: source.input,
    txn: structuredClone(source.txn || {}),
    blocks: structuredClone(source.blocks || []),
    repairAudit: [],
  };
  api.reconcileExplicitOutcomes(turn);
  const visible = turn.blocks.map((block) => block.text).join("\n\n");
  const endTime = source.endTime || source.timeline?.endTime || scenario.world.time;
  const endSeconds = api.parseClock(endTime);
  assert.ok(endSeconds >= priorEnd, `turn ${index + 1} moved time backward`);
  priorEnd = endSeconds;
  const context = {
    input: source.input,
    publicText: visible,
    blocks: turn.blocks,
    turn: index + 1,
    eventId: source.txn?.event?.id || scenario.event.id,
    worldTime: endTime,
    location: source.txn?.endStatePatch?.location || scenario.world.location,
  };
  const candidates = api.collectCanonCandidates(scenario, "", context);
  const applied = api.applyCanonDelta(scenario, candidates, context);
  scenario.world.time = endTime;
  scenario.world.location = context.location;
  replay.push({
    turn: index + 1,
    input: source.input,
    blocksBefore: source.blocks.length,
    blocksAfter: turn.blocks.length,
    repairs: turn.repairAudit,
    acceptedCanon: applied.accepted.map(({ kind, targetName, publicStatement }) => ({ kind, targetName, publicStatement })),
    incompleteTail: api.danglingIncompleteTail(visible),
  });
}

const refs = ["조개", "소포", "휴대전화"].map((name) => api.publicEntityRef(scenario, name, "item"));
assert.equal(new Set(refs).size, 3, "Korean object names still collide");
const state = api.deriveStoryState(scenario.runtime.canonLedger);
assert.equal(state.inventory.some((entry) => /소포|택배|배송물/u.test(entry.targetName)), false, "disposed parcel resurrected in active inventory");
assert.equal(state.destroyed.some((entry) => /농담/u.test(entry.statement) || /바닥/u.test(entry.targetName)), false, "figurative joke was stored as physical destruction");
assert.ok(state.conditions.some((entry) => /다리|의식/u.test(entry.targetName)), "severe player condition was not persisted");
assert.ok(state.conditions.some((entry) => /의식/u.test(entry.targetName)), "unconscious state was not persisted");
assert.ok(state.relationships.length > 0, "mutual relationship was not persisted");
assert.equal(replay.some((turn) => turn.incompleteTail), false, "a truncated block survived replay repair");
assert.equal(replay.some((turn) => turn.acceptedCanon.some((entry) => /물건는/u.test(entry.publicStatement))), false, "malformed violence patch survived");

const report = {
  engine: "Cortex 1.6.5",
  sourceLogVersion: log.version,
  replayMode: "exact-input-and-finalized-body deterministic state replay (no API calls)",
  turns: replay.length,
  assertions: {
    exactTurnCount: true,
    monotonicTime: true,
    unicodeObjectRefsUnique: true,
    disposedParcelInactive: true,
    figurativeDestructionRejected: true,
    severeConditionPersisted: true,
    unconsciousStatePersisted: true,
    relationshipPersisted: true,
    incompleteTailRemoved: true,
    malformedViolencePatchRemoved: true,
  },
  finalState: state,
  replay,
};
await writeFile(new URL("benchmark-results/Cortex_v1.6.5_20_Turn_Log_Replay.json", root), `${JSON.stringify(report, null, 2)}\n`);
const lines = [
  "# Cortex 1.6.5 — 첨부 로그 20턴 정밀 재생 검증",
  "",
  `- 원본 로그 버전: ${log.version}`,
  "- 방식: 첨부 로그의 20개 입력과 확정 본문을 순서·내용 그대로 재생하고, 1.6.5의 결과 교정 및 정사 원장을 재계산함 (API 호출 없음)",
  `- 재생 턴: ${replay.length}/20`,
  "- 결과: 모든 회귀 단언 통과",
  "",
  "## 통과 항목",
  "",
  "- 한글 개체 ID: 조개·소포·휴대전화가 서로 다른 안정 ID를 가짐",
  "- 소포 폐기: 트럭으로 사라진 뒤 활성 인벤토리에서 제거됨",
  "- 은유 필터: ‘농담이 바닥에서 부서졌다’를 물리 파괴로 저장하지 않음",
  "- 강제 결과: 불구·의식 상실을 본문과 지속 조건에 보존함",
  "- 관계 기억: 여학생과의 상호 관계 변화를 정사 원장에 저장함",
  "- 국소 패치: 미완성 꼬리와 ‘물건는’ 문법 손상을 제거함",
  "- 시간: 20턴 전체 단조 증가 유지",
  "",
  "## 주의",
  "",
  "이 검증은 원본 본문을 새로 생성하지 않는 결정론적 회귀 재생이다. 따라서 기존 20턴의 문체를 평가하는 것이 아니라, 같은 입력·본문을 1.6.5 상태 처리기가 안전하게 확정하는지를 검증한다.",
  "",
];
await writeFile(new URL("benchmark-results/Cortex_v1.6.5_20_Turn_Log_Replay_Report.md", root), lines.join("\n"));
console.log(JSON.stringify({ turns: replay.length, assertions: report.assertions, inventory: state.inventory.map((v) => v.targetName), conditions: state.conditions.map((v) => v.targetName), relationships: state.relationships.length }, null, 2));
