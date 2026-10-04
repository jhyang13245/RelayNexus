import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { blankStoryEvent, makeNewStudioProject, normalizeProject } from "../../features/jieum/studio-model";
import { eventDesign, compileCortexEvent } from "../../features/jieum/cortex-event-design";
import { exportScenarioPack, extractStudioProjectFromPackage, aiGeneratorPromptFor } from "../../features/jieum/studio-export";
import { closureDecision, selectNextEvent } from "./integration/cortex-studio-event-policy-v2.mjs";

function engine() {
  const context = vm.createContext({ console, TextEncoder, TextDecoder, URL, setTimeout });
  for (const file of ["systemic-contract.js", "quality-runtime.js", "prose-memory.js", "nexus-bridge.js"]) vm.runInContext(readFileSync(new URL(`./fixtures/cortex-v1.41.6/${file}`, import.meta.url), "utf8"), context);
  return context;
}

for (const setting of ["우주 탐사", "시골 도서관"]) test(`${setting}: each authored condition reaches Cortex's actual source contract and judge input`, async () => {
  const p = makeNewStudioProject(); p.title = setting;
  const e = { ...blankStoryEvent(1), id: "EVENT_START", name: "첫 만남", description: "현재 장면에서 서로의 목적을 확인한다.", required: true, startTime: "08:00:00", endTime: "09:00:00" };
  e.cortexDesign = { ...eventDesign(e), occurrenceEnabled: false, closureConditions: [{ id: "goal-one", text: "두 인물의 과거 인연을 독자가 알아볼 수 있다." }, { id: "goal-two", text: "상자를 실제로 확보한다. 개봉은 하지 않아도 된다." }], selectionScope: "이 사건 전체에서 지정 후보 중 서로 다른 1~2종류만 묘사한다.", constraints: "초자연 현상은 발생하지 않는다.", unmet: "상자를 거절했다면 그 결과를 받아들이고 다음 만남으로 이어간다.", otherViewpoint: true, viewpoint: "동료" };
  p.events = [e];
  const output = await exportScenarioPack(p, false);
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const files: Record<string, unknown> = {};
  for (const [path, entry] of Object.entries(zip.files)) if (path.endsWith(".json")) files[path] = JSON.parse(await entry.async("string"));
  const ctx = engine();
  const session = ctx.CortexNexusBridge.adaptPackage(files);
  const scenario = ctx.CortexNexusBridge.toCortexScenario(session);
  const active = scenario.event;
  ctx.CortexQuality.ensureEventContract(active);
  const sourceContract = ctx.CortexQuality.eventContract(active);
  const contractText = JSON.stringify(sourceContract);
  for (const row of e.cortexDesign.closureConditions) assert.ok(contractText.includes(row.text), row.id);
  assert.ok(contractText.includes(e.cortexDesign.constraints));
  assert.ok(contractText.includes(e.cortexDesign.selectionScope));
  assert.ok(contractText.includes(e.cortexDesign.unmet));
  assert.equal(active.eventPolicy.otherViewpoint, true);
  assert.equal(active.requiredFunctions.some((row: { id: string }) => row.id === "goal-one"), true);
  assert.equal(active.requiredFunctions.some((row: { id: string }) => row.id === "goal-two"), true);
  const messages = ctx.CortexProseMemory.writerMessages("instruction", JSON.stringify({ schema: "CORTEX_PROSE_WRITER_V1", sourceContract, rawUserInput: "대화한다" }));
  assert.ok(JSON.stringify(messages).includes(e.cortexDesign.closureConditions[1].text));
  assert.match(ctx.CortexProseMemory.judgeInstruction, /공개 원문/);
  let requestBody: any;
  Object.assign(ctx, { performance, AbortController, clearTimeout, turns: [], scenario,
    settings: { baseUrl: "https://fixture.invalid", apiKey: "fixture-only" }, asText: String,
    judgeWindowV1411: () => ({ eventIds:[active.id], initialPublicProse:"", rawEvents:[] }),
    apiFetchV1390: async (_url: string, options: {body:string}) => { requestBody = JSON.parse(options.body); return { ok:false, status:503 }; },
  });
  vm.runInContext(readFileSync(new URL('./fixtures/cortex-v1.41.6/event-judge-request.js', import.meta.url), 'utf8'), ctx);
  await ctx.requestUnifiedAdjudicationV1360('', { commitGraphCatalog: { requirements: active.requiredFunctions.map((r: any) => ({ref:r.id,description:r.description})) } }, '이미 공개된 장면');
  const judgeInput = JSON.parse(requestBody.input[1].content[0].text);
  assert.equal(judgeInput.fullText, '이미 공개된 장면');
  for (const row of e.cortexDesign.closureConditions) assert.ok(JSON.stringify(judgeInput).includes(row.text));
  assert.ok(JSON.stringify(judgeInput.sourceContract).includes(e.cortexDesign.unmet));

  assert.deepEqual(normalizeProject((await extractStudioProjectFromPackage(output.blob)).project).events[0].cortexDesign, eventDesign(e));
});

test("editor snapshot is authoritative over compiled runtime events and keeps review decisions", async () => {
  const p = makeNewStudioProject(); const e = { ...blankStoryEvent(1), id: "EVENT_REVIEW", name: "검토", description: "원문" };
  e.cortexDesign = { ...eventDesign(e), closureConditions: [{ id: "condition-a", text: "문이 잠기기 전에 탈출한다.", review: { original: "문이 잠기기 전에 탈출한다.", proposal: "탈출한다.", decision: "keep" } }] };
  p.events = [e];
  const output = await exportScenarioPack(p, false);
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  zip.file("events/events.json", JSON.stringify([{ id: "WRONG", name: "실행용" }]));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  for (const input of [bytes, new Blob([new Uint8Array(bytes)])]) {
    const restored = normalizeProject((await extractStudioProjectFromPackage(input)).project);
    assert.equal(restored.events[0].id, e.id);
    assert.equal(restored.events[0].cortexDesign?.closureConditions[0].review?.decision, "keep");
  }
});

test("conditional toggle clears runtime gating without deleting the author's text", () => {
  const e = { ...blankStoryEvent(1), conditions: "거절했을 때", priority: 100 };
  e.cortexDesign = { ...eventDesign(e), occurrenceEnabled: false };
  const out = compileCortexEvent(e);
  assert.equal(out.conditions, ""); assert.equal(e.cortexDesign.occurrence, "거절했을 때");
  assert.equal("priority" in out, false);
  assert.equal("playerCanIntervene" in out, false);
});

test("conditions are evaluated in array order without grouping equal time windows", () => {
  const a = { id: "A", startTime: "08:00:00", endTime: "09:00:00", eventPolicy: { occurrenceEnabled: true }, conditions: "A 조건" };
  const b = { ...a, id: "B" };
  const c = { ...a, id: "C", startTime: "09:00:00", endTime: "10:00:00", eventPolicy: { occurrenceEnabled: false } };
  assert.equal(selectNextEvent({ events: [a,b,c], eligibility: { A: false, B: true } }).eventId, "B");
  const choice = selectNextEvent({ events: [a,b,c], eligibility: { A: true, B: true }, seed: 4 });
  assert.equal(choice.eventId, "A");
  assert.equal(choice.skippedIds.length, 0);
  assert.equal(selectNextEvent({ events: [a,b,c], finishedId: choice.eventId!, consumedIds: choice.skippedIds, eligibility: { B: true } }).eventId, "B");
  assert.equal(selectNextEvent({ events: [a,b,c], eligibility: { A: false, B: false } }).eventId, "C");
  assert.equal(selectNextEvent({ events: [a,b,c] }).status, "NEEDS_CONDITION_REVIEW");
  assert.equal(selectNextEvent({ events: [{ ...a, eventPolicy: { occurrenceEnabled: false } }, { ...b, eventPolicy: { occurrenceEnabled: false } }], finishedId: "A" }).eventId, "B");
});

test("authored recovery seals as transition and does not resurrect abandoned goals", () => {
  assert.equal(closureDecision({ completedBeats: 1, closureMet: true }).status, "CONTINUE");
  assert.equal(closureDecision({ completedBeats: 2, closureMet: true }).status, "SEALED_SUCCESS");
  const recovered = closureDecision({ completedBeats: 5, extensionRound: 2, recoveryResolved: true, unresolvedRefs: ["abandoned"] });
  assert.equal(recovered.status, "SEALED_TRANSITION"); assert.deepEqual(recovered.carryover, []);
  const unresolved = closureDecision({ completedBeats: 5, extensionRound: 2, unresolvedRefs: ["remaining"] });
  assert.equal(unresolved.status, "SEALED_FORCED_INCOMPLETE"); assert.deepEqual(unresolved.carryover, ["remaining"]);
});

test("Cortex creation prompt uses condition rows and omits the old mandatory UI/ledger directions", () => {
  const prompt = aiGeneratorPromptFor(makeNewStudioProject());
  assert.match(prompt, /closureConditions/);
  assert.doesNotMatch(prompt, /추천 답변 3개와 장면 이미지가 기본 활성화|정확히 출력할|priority는 0~100/);
});

test("Cortex import directions never retain Lotus forced-success or mandatory recommendation prompts", async () => {
  const { buildImportObject } = await import('../../features/jieum/studio-export');
  const value = buildImportObject(makeNewStudioProject());
  const rules = value.importInstruction.rules.join('\n');
  assert.doesNotMatch(rules, /SUCCESS로 봉인|추천 행동을 제시|공개 초기 상태표|EventLedgerRecord/);
  assert.match(rules, /최종 공개된 산문/);
});

test("legacy time fields never reorder authoring arrays", async () => {
  const { orderedEvents } = await import('../../features/jieum/cortex-event-design');
  const p = makeNewStudioProject();
  p.events = [{...blankStoryEvent(1),id:'LATE',startTime:'10:00'}, {...blankStoryEvent(2),id:'EARLY',startTime:'09:00:00'}];
  assert.deepEqual(orderedEvents(p).map(e => e.id), ['LATE','EARLY']);
  const a = {id:'A',startTime:'08:00',endTime:'10:00',eventPolicy:{occurrenceEnabled:true}};
  const b = {...a,id:'B',startTime:'08:30:00',eventPolicy:{occurrenceEnabled:false}};
  const c = {...a,id:'C',startTime:'09:00:00'};
  const out = selectNextEvent({events:[a,b,c],eligibility:{A:false,C:true}});
  assert.equal(out.eventId,'B'); assert.deepEqual(out.skippedIds,['A']);
});


test("exported global protection reaches the real Cortex v1.41.6 package bridge", async () => {
  const p = makeNewStudioProject(); p.disclosure.protectedTerms = ["검증용 비밀 진명", "검증용 봉인 기록"];
  p.events = [{ ...blankStoryEvent(1), id: "EVENT_PROTECTION", name: "첫 장면", description: "비밀을 언급하지 않고 만난다.", startTime: "08:00:00", endTime: "09:00:00" }];
  const output = await exportScenarioPack(p, false);
  const archive = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const files: Record<string, unknown> = {};
  for (const [path, entry] of Object.entries(archive.files)) if (path.endsWith(".json")) files[path] = JSON.parse(await entry.async("string"));
  const ctx = engine();
  const scenario = ctx.CortexNexusBridge.toCortexScenario(ctx.CortexNexusBridge.adaptPackage(files));
  // The base bridge also collects an unrelated empty protected* field; only
  // non-empty protected surfaces participate in its publication filter.
  assert.deepEqual([...new Set(Array.from(scenario.disclosure.protectedTerms).filter(Boolean))].sort(), [...p.disclosure.protectedTerms].sort());
});
