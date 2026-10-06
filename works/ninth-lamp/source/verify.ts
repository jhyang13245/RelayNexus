// 모의 플레이 검증: 작업 JSON을 지음과 같은 경로로 CortexPack으로 내보낸 뒤,
// 단청의 헤드리스 하네스(실제 Cortex 1.42.0 + 지음 확장)를 모의 모델로 구동해 두 루트를 끝까지 진행한다.
// 모델 응답은 고정 문장이므로 산문 품질이 아니라 사건 연결·분기·엔딩·루트 해금만 검증한다.
//
//   esbuild verify.ts --bundle --platform=node --format=esm --loader:.json=json \
//     --alias:@jieum=<단청 소스>/features/jieum --alias:@harness=<단청 소스>/tests/cortex/harness.mjs \
//     --external:jsdom --external:fake-indexeddb --outfile=verify.mjs
//   node assemble-cortex.mjs <단청 소스>/vendor/cortex cortex-test.html --test-timeout
//   node --max-old-space-size=8192 verify.mjs <작업 JSON> cortex-test.html
import fs from "node:fs";
import vm from "node:vm";
import JSZip from "jszip";
import { normalizeProject } from "@jieum/studio-model";
import { exportScenarioPack } from "@jieum/studio-export";
import { HeadlessCortex, makeModel } from "@harness";

const [jsonPath, cortexHtml] = process.argv.slice(2);
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

function mockModel(satisfied: boolean) {
  return makeModel({
    writer: () => "나는 숨을 고르고 주변을 살폈다. 해야 할 일은 분명했다.\n\n장면은 그렇게 매듭지어졌고, 다음 이야기가 기다리고 있었다.",
    eventVerdict: (p: any) => ({
      requirements: p.requirements.map((r: any) => ({ requirementRef: r.ref, status: "MET", reason: "모의 판정" })),
      choices: Object.fromEntries((p.choices || []).map((r: any) => [r.key, satisfied ? "SATISFIED" : "NOT_SATISFIED"])),
      resources: { r0: { status: "KNOWN", delta: 0, evidence: "" } },
      earlyClosure: { goalsMet: "YES", sceneActionSettled: "YES", sceneSettled: "YES", handoffReady: "YES", reason: "모의 종결" },
    }),
  });
}

// 한 창에서 수십 턴을 저장하면 jsdom·fake-indexeddb가 느려져 저장 시간 초과나 메모리 부족이 난다.
// 그래서 루트마다 새 창을 열고, 첫 번째 루트 엔딩 뒤 '다음 이야기 시작'으로 만든 상태를 두 번째 창에 넘긴다.
async function playRoute(label: string, satisfied: boolean, initialScenario: unknown, nextRoute: boolean) {
  const app = await new HeadlessCortex({ initialScenario, standalonePath: cortexHtml, model: mockModel(satisfied) }).open();
  const visited: string[] = [];
  const note = () => { const id = app.scenario.event?.id; if (id && visited.at(-1) !== id) visited.push(id); };
  try {
    app.api._setSettings({ apiKey: "fixture-only", typingSpeed: "instant" });
    note();
    // 저장·판정 보완은 비동기로 끝난다. 턴이 늘지 않으면 잠시 기다렸다가 다시 보낸다.
    for (let i = 0, idle = 0; i < 200 && idle < 40 && !app.scenario.runtime.branchEndingState?.ending; i++) {
      const before = app.turns.length, status = app.turns.at(-1)?.status;
      await app.turn("주변을 살피고 할 일을 한다.");
      note();
      if (app.turns.length === before && app.turns.at(-1)?.status === status) { idle++; await app.settle(250); } else idle = 0;
    }
    const ending = app.scenario.runtime.branchEndingState?.ending?.terminalEventId;
    const values = JSON.stringify(ctx.CortexJieum.values(app.scenario));
    const turns = app.turns.length;
    if (!ending) {
      const last: any = app.turns.at(-1);
      console.log(`[${label}] 멈춘 사건 ${app.scenario.event?.id} · 마지막 턴 ${last?.status} · ${JSON.stringify(last?.metrics?.persistence ?? {})}`);
    }
    let next: unknown = null;
    if (nextRoute && ending) { await app.api._nextJieumRoute(); next = JSON.parse(JSON.stringify(app.scenario)); }
    const size = Math.round(JSON.stringify({ scenario: app.scenario, turns: app.turns }).length / 1024);
    console.log(`[${label}] 엔딩 ${ending} · 턴 ${turns} · 수치 ${values} · 저장 상태 약 ${size}KB`);
    console.log(`[${label}] 거친 사건: ${visited.join(" → ")}`);
    return { ending, visited, next };
  } finally {
    app.close();
  }
}

async function play(label: string, satisfied: boolean) {
  const first = await playRoute(`${label} · 첫 번째 이야기`, satisfied, scenario, true);
  if (!first.next) return { ending1: first.ending, ending2: undefined, visited: first.visited };
  const second = await playRoute(`${label} · 두 번째 이야기`, satisfied, first.next, false);
  return { ending1: first.ending, ending2: second.ending, visited: [...first.visited, ...second.visited] };
}

const a = await play("선택 조건 충족", true);
const b = await play("선택 조건 미충족", false);
const ok = a.ending1 === "e11_gate" && a.ending2 === "r2e09_1004" && b.ending1 === "e11_gate" && b.ending2 === "r2e09_1004"
  && a.visited.includes("e10a_vigil") && !a.visited.includes("e10b_cell") && a.visited.includes("r2e07a_call") && !a.visited.includes("r2e07b_lullaby")
  && b.visited.includes("e10b_cell") && !b.visited.includes("e10a_vigil") && b.visited.includes("r2e07b_lullaby") && !b.visited.includes("r2e07a_call");
console.log(ok ? "\n검증 통과: 두 루트의 엔딩, 루트 해금, 두 분기의 양쪽 경로" : "\n검증 실패");
process.exit(ok ? 0 : 1);
