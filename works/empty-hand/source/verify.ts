// 모의 플레이 검증: 작업 JSON을 지음과 같은 경로로 CortexPack으로 내보낸 뒤,
// 단청의 헤드리스 하네스(실제 Cortex 1.42.0 + 지음 확장)를 모의 모델로 구동해 엔딩까지 진행한다.
// 모델 응답은 고정 문장이므로 산문 품질이 아니라 사건 연결·분기·엔딩·수치 누적만 검증한다.
//
//   esbuild verify.ts --bundle --platform=node --format=esm --loader:.json=json \
//     --alias:@jieum=<단청 소스>/features/jieum --alias:@harness=<단청 소스>/tests/cortex/harness.mjs \
//     --external:jsdom --external:fake-indexeddb --outfile=verify.mjs
//   node assemble-cortex.mjs <단청 소스>/vendor/cortex cortex-test.html --test-timeout
//   node --max-old-space-size=6144 verify.mjs <작업 JSON> cortex-test.html [A|B|C|D|E ...]
// 경로마다 69개 사건을 한 창에서 진행한다. 경로를 지정하지 않으면 다섯 경로를 차례로 돈다.
import fs from "node:fs";
import vm from "node:vm";
import JSZip from "jszip";
import { normalizeProject } from "@jieum/studio-model";
import { exportScenarioPack } from "@jieum/studio-export";
import { HeadlessCortex, makeModel } from "@harness";
import { events } from "./story.mjs";

const [jsonPath, cortexHtml, ...only] = process.argv.slice(2);
const project = normalizeProject(JSON.parse(fs.readFileSync(jsonPath, "utf8")).project);
const output = await exportScenarioPack(project, false);
const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
const files: Record<string, unknown> = {};
for (const [path, f] of Object.entries(zip.files)) if (path.endsWith(".json") && !path.startsWith("studio/")) files[path] = JSON.parse(await f.async("string"));
const canon = files["runtime/jieum_canon.json"] as { routes: Array<{ id: string; eventIds: string[]; endingEventId: string }> };
console.log(`CortexPack ${output.blobBytes} bytes · 루트 ${canon.routes.map((r) => `${r.id}(${r.eventIds.length}사건→${r.endingEventId})`).join(", ")}`);

const ctx: any = vm.createContext({ console, TextEncoder, TextDecoder, URL, crypto, structuredClone, setTimeout, clearTimeout, performance, AbortController });
const scripts = [...fs.readFileSync(cortexHtml, "utf8").matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for (const i of [0, 1, 3]) vm.runInContext(scripts[i][1], ctx);
const scenario = ctx.CortexNexusBridge.toCortexScenario(ctx.CortexNexusBridge.adaptPackage(files));
ctx.CortexJieum.initialize(scenario);

// 이야기 분기 조건 문장. 판정 요청에는 사건 점수 조건과 분기 조건이 같은 형식(key·criterion)으로 들어온다.
const storyBranches = new Set((events as any[]).flatMap((e) => (e.branches ?? []).filter((b: any) => b.kind === "story").map((b: any) => b.criterion)));
const ending = (events as any[]).at(-1).id;

async function play(label: string, satisfied: (criterion: string) => boolean) {
  const model = makeModel({
    writer: () => "나는 숨을 고르고 주변을 살폈다. 해야 할 일은 분명했다.\n\n장면은 그렇게 매듭지어졌고, 다음 이야기가 기다리고 있었다.",
    eventVerdict: (p: any) => ({
      requirements: p.requirements.map((r: any) => ({ requirementRef: r.ref, status: "MET", reason: "모의 판정" })),
      choices: Object.fromEntries((p.choices || []).map((r: any) => [r.key, satisfied(r.criterion) ? "SATISFIED" : "NOT_SATISFIED"])),
      resources: { r0: { status: "KNOWN", delta: 0, evidence: "" } },
      earlyClosure: { goalsMet: "YES", sceneActionSettled: "YES", sceneSettled: "YES", handoffReady: "YES", reason: "모의 종결" },
    }),
  });
  const app = await new HeadlessCortex({ initialScenario: scenario, standalonePath: cortexHtml, model }).open();
  const visited: string[] = [];
  const note = () => { const id = app.scenario.event?.id; if (id && visited.at(-1) !== id) visited.push(id); };
  const started = Date.now();
  try {
    app.api._setSettings({ apiKey: "fixture-only", typingSpeed: "instant" });
    note();
    // 저장·판정 보완은 비동기로 끝난다. 턴이 늘지 않으면 잠시 기다렸다가 다시 보낸다.
    for (let i = 0, idle = 0; i < 1200 && idle < 40 && !app.scenario.runtime.branchEndingState?.ending; i++) {
      const before = app.turns.length, status = app.turns.at(-1)?.status;
      await app.turn("주변을 살피고 할 일을 한다.");
      model.calls.length = 0; // 하네스 모의 모델은 요청 본문(프롬프트 전체)을 모두 쌓아 두므로 턴마다 비운다.
      // fake-indexeddb 6.x는 끝난 트랜잭션을 지우지 않아, 저장할 때마다 이전 상태 사본이 롤백 기록에 남는다. 끝난 것만 걷어 낸다.
      for (const db of (app.indexedDB as any)._databases.values()) db.transactions = db.transactions.filter((t: any) => t._state !== "finished");
      note();
      if (app.turns.length === before && app.turns.at(-1)?.status === status) { idle++; await app.settle(250); } else idle = 0;
    }
    const reached = app.scenario.runtime.branchEndingState?.ending?.terminalEventId;
    if (!reached) console.log(`[${label}] 멈춘 사건 ${app.scenario.event?.id} · 마지막 턴 ${app.turns.at(-1)?.status}`);
    console.log(`[${label}] 엔딩 ${reached} · 사건 ${visited.length}개 · 턴 ${app.turns.length} · ${Math.round((Date.now() - started) / 1000)}초 · 수치 ${JSON.stringify(ctx.CortexJieum.values(app.scenario))}`);
    console.log(`[${label}] 거친 사건: ${visited.join(" → ")}`);
    return { reached, visited };
  } finally {
    app.close();
  }
}

const branchEvents = ["e35a_brokk_return", "e35b_brokk_grudge", "e49a_sister", "e49b_returned", "e59a_lanterns", "e59b_sold", "e62a_eve_rine", "e62b_eve_isolde", "e62c_eve_selene", "e62d_eve_estelle"];
const runs = [
  { key: "A", label: "모든 조건 충족", satisfied: () => true, expect: ["e35a_brokk_return", "e49a_sister", "e59a_lanterns", "e62d_eve_estelle"] },
  { key: "B", label: "점수만 충족·분기 조건 미충족", satisfied: (c: string) => !storyBranches.has(c), expect: ["e35b_brokk_grudge", "e49b_returned", "e59b_sold", "e62a_eve_rine"] },
  { key: "C", label: "아무 조건도 미충족", satisfied: () => false, expect: ["e35b_brokk_grudge", "e49b_returned", "e59a_lanterns", "e62a_eve_rine"] },
  { key: "D", label: "셀레네 전야만 충족", satisfied: (c: string) => c.includes("셀레네를 찾아가"), expect: ["e35b_brokk_grudge", "e49b_returned", "e59a_lanterns", "e62c_eve_selene"] },
  { key: "E", label: "이졸데 전야만 충족", satisfied: (c: string) => c.includes("이졸데를 찾아가"), expect: ["e35b_brokk_grudge", "e49b_returned", "e59a_lanterns", "e62b_eve_isolde"] },
].filter((r) => !only.length || only.includes(r.key));

let ok = true;
for (const run of runs) {
  const r = await play(run.label, run.satisfied);
  const skip = branchEvents.filter((id) => !run.expect.includes(id));
  const pass = r.reached === ending && run.expect.every((id) => r.visited.includes(id)) && skip.every((id) => !r.visited.includes(id));
  console.log(`[${run.label}] ${pass ? "통과" : "실패"}\n`);
  ok &&= pass;
}
console.log(ok ? `검증 통과: ${runs.map((r) => r.key).join("·")} 경로 모두 엔딩 ${ending} 도달, 분기 4곳의 갈래가 기대대로 갈림` : "검증 실패");
process.exit(ok ? 0 : 1);
