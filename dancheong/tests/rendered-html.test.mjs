import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unzipSync } from "fflate";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders 단청 production metadata and primary controls", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /<title>단청 — Canon-Safe Story Engine<\/title>/);
  assert.match(html, /property="og:image"[^>]+relay-novel-nexus[^>]+og\.png/);
  assert.match(html, /단청 메인 메뉴/);
  assert.match(html, /선택한 세션 입장/);
  assert.match(html, /CHAT SESSIONS/);
  assert.match(html, /내 서재/);
  assert.match(html, /너름/);
  assert.match(html, /멀티플레이/);
  const versionSource = await readFile(
    new URL("../lib/app-version.ts", import.meta.url),
    "utf8",
  );
  const version = /APP_VERSION = "([^"]+)"/u.exec(versionSource)?.[1];
  assert.ok(version);
  assert.match(html, new RegExp(`v${version.replaceAll(".", "\\.")}`, "u"));
});

test("Dancheong Cortex v1.8.5 applies one narrative kernel to linear and multi-route packages", async (t) => {
  const html = await readFile(
    new URL("../public/dancheong-cortex-v1.8.5.html", import.meta.url),
    "utf8",
  );
  const stableRedirect = await readFile(new URL("../public/cortex.html", import.meta.url), "utf8");
  const legacyRedirect = await readFile(new URL("../public/dancheong-new-engine-v1.2.0.html", import.meta.url), "utf8");
  assert.match(stableRedirect, /src="\/cortex-host\.js"/u);
  assert.match(legacyRedirect, /dancheong-cortex-v1\.8\.5\.html/u);
  assert.match(html, /LATEST ENGINE · v1\.8\.5/iu);
  assert.match(html, /VERSION='1\.8\.5'/u);
  assert.match(html, /STORE='dancheong-cortex-lab-v185', LEGACY_STORE='', DEVICE_API_KEY_STORE='dancheong-cortex-device-api-key-v1'/u);
  assert.match(html, /PACKAGE_V15_SCHEMA='CORTEX_SCENARIOPACK_V15_RUNTIME_V5'/u);
  assert.match(html, /CORTEX_UNIVERSAL_NARRATIVE_KERNEL_V1/u);
  assert.match(html, /function packageTopology/u);
  assert.match(html, /function eventProjectionCoverage/u);
  assert.match(html, /function reconcileCarryover/u);
  assert.match(html, /function unzipPackageForRuntime/u);
  assert.match(html, /NEXT_TURN_NARRATIVE_CAPSULE_V1/u);
  assert.match(html, /NEXT_TURN_LITERARY_CAPSULE_V2/u);
  assert.match(html, /NEXT_TURN_CONTINUITY_CAPSULE_V3/u);
  assert.doesNotMatch(html, /id="runMode"|settings\.mode\b|LOCAL DEMO|로컬 모의 스트리밍/u);
  assert.match(html, /if\(!settings\.apiKey\.trim\(\)\)\{toast\('Cortex 1\.8\.5는 모의 생성 없이 실제 API Key로만 실행됩니다/u);
  assert.match(html, /scheduleLiteraryCapsuleV2\(scenario,turn,visible\)/u);
  assert.match(html, /cancelLiteraryCapsuleJob\('next_turn_started'\)/u);
  assert.match(html, /setTimeout\(async\(\)=>/u);
  assert.doesNotMatch(html, /바로 뒤에 <NEXT_TURN_NARRATIVE_CAPSULE>/u);
  assert.match(html, /Relay · 무인택배함 10사건/u);
  assert.match(html, /크로노스 코어 · 원작 연속 10사건/u);
  assert.match(html, /집필 엔진은 항상 최신 Cortex 1\.8\.5/u);
  assert.match(html, /dialog>form\{display:flex;flex-direction:column;max-height:inherit;min-height:0\}/u);
  assert.match(html, /height:calc\(var\(--visual-height\) - var\(--safe-top\) - 12px\)/u);
  assert.match(html, /패키지 저장은 뒤에서 계속합니다/u);
  assert.match(html, /IMAGE_CAPSULE_SCHEMA='CORTEX_TURN_IMAGE_CAPSULE_V1'/u);
  assert.match(html, /IMAGE_MODEL='gpt-image-2\.5-flare', IMAGE_SIZE='1088x608'/u);
  assert.match(html, /form\.append\('input_fidelity','high'\)/u);
  assert.match(html, /data-turn-image/u);
  assert.match(html, /\/images\/generations/u);
  assert.match(html, /\/images\/edits/u);
  assert.match(html, /prepareTurnImageCapsuleV179\(scenario,turn,visible\)/u);
  assert.match(html, /id="legacyPackageFile"[^>]+accept="application\/zip,\.zip"/u);
  assert.match(html, /ScenarioPack \/ InstantStoryPack ZIP/u);
  assert.match(html, /data:text\/javascript;base64,/u);
  assert.doesNotMatch(html, /id="engineProfile"|chronos_10_beta|nexus_legacy|Chronos Core Beta|CHRONOS CORE β/u);
  assert.match(html, /CANON EVENTS/u);
  assert.match(html, /종결에 필요한 것/u);
  assert.match(html, /임시 종결 비트/u);
  assert.match(html, /href="\/cortex\.webmanifest"/u);
  assert.match(html, /apple-mobile-web-app-status-bar-style/u);
  assert.match(html, /safe-area-inset-(?:top|right|bottom|left)/u);
  assert.match(html, /function syncMobileViewport/u);
  assert.match(html, /function viewportMetricsV175/u);
  assert.match(html, /function recoverDialogViewportV175/u);
  assert.match(html, /body\.modal-open \.composer,body\.viewport-recovering \.composer\{visibility:hidden;pointer-events:none\}/u);
  assert.match(html, /queueViewportRecoveryV175\(modalReadingAnchorV175,true\)/u);
  assert.match(html, /\[0,80,180,360\]\.forEach\(syncAt\)/u);
  assert.match(html, /function restoreReadingAnchor/u);
  assert.match(html, /drawer-scrim/u);
  assert.match(html, /@media\(max-width:900px\)[^{]*\{[^}]*[\s\S]*?main\{display:block;width:100%;min-width:0\}/u);
  assert.match(html, /\.event-title\{width:100%;max-width:100%;[^}]*word-break:keep-all/u);
  assert.doesNotMatch(html, /lastElementChild\?\.scrollIntoView/u);
  assert.match(html, /ACKNOWLEDGE → COUNTERFORCE → HESITATION → CHOICE → CANON_PAYOFF/u);
  assert.doesNotMatch(html, /apiKey:settings\.apiKey/u);
  assert.match(html, /이 기기의 현재 브라우저에만 저장됩니다/u);

  const script = /<script>([\s\S]*?)<\/script>/u.exec(html)?.[1];
  assert.ok(script, "inline runtime script must exist");
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: id === "styleGuide" ? "라이트노벨 문체" : "",
        textContent: "",
        innerHTML: "",
        style: {},
        disabled: false,
        files: [],
        classList: { add() {}, remove() {}, toggle() { return true; } },
        addEventListener() {},
        setAttribute() {},
        removeAttribute() {},
        appendChild(child) { this.options ??= []; this.options.push(child); },
        showModal() {},
        close() { this.closed = true; },
        lastElementChild: null,
      });
    }
    return elements.get(id);
  };
  const document = { getElementById: element, createElement: () => element("created") };
  const window = { fflate: { unzipSync } };
  const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  new Function("document", "window", "localStorage", script)(document, window, localStorage);
  const api = window.__DANCHEONG_CORTEX_TEST__;
  assert.ok(api);
  assert.equal(api.ENGINE_ID, "cortex");
  assert.equal(window.__DANCHEONG_NEW_ENGINE_TEST__, api);

  assert.equal(api.parseClock("15:29:30"), 55770);
  assert.equal(api.formatClock(55770), "15:29:30");
  assert.equal(api.asText({ description: "객체 요약" }), "객체 요약");

  await t.test("legacy ScenarioPack ZIPs compile into isolated Cortex stories and first-appearance package images", async () => {
    const legacyZip = new Uint8Array(await readFile(new URL("../samples/기성학원_첫_번째_공명_ScenarioPack.zip", import.meta.url)));
    const legacy = api.parseLegacyPackageEntriesV177(unzipSync(legacyZip), { fileName: "기성학원.zip" });
    assert.equal(legacy.scenario.title, "기성학원: 첫 번째 공명");
    assert.ok(legacy.summary.eventCount >= 2);
    assert.ok(legacy.summary.characterCount >= 2);
    assert.match(legacy.storyId, /^legacy_[0-9a-f]{8}$/u);
    assert.equal(JSON.stringify(legacy.scenario).includes("10년 전 이중 공명 학생의 폭주 사고"), false, "hiddenInfo must not enter Cortex writer state");

    const instantZip = new Uint8Array(await readFile(new URL("../samples/기성학원_Instant_Story_Runtime_ScenarioPack_v1.5.zip", import.meta.url)));
    const instant = api.parseLegacyPackageEntriesV177(unzipSync(instantZip), { fileName: "instant-story.zip" });
    assert.ok(instant.summary.eventCount >= 1, "an InstantStoryPack without a fixed event list receives a bounded opening event");
    assert.ok(instant.summary.characterCount >= 2);
    assert.equal(instant.scenario.runtime.packageCompatibility, "CORTEX_LEGACY_ZIP_V1");

    const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
    const overnight = api.parseLegacyPackageEntriesV177({
      "manifest.json": encode({ packageVersion: "1.5", projectId: "OVERNIGHT-001", title: "자정 경계 검증" }),
      "project.json": encode({
        player: { id: "PLAYER", name: "도윤" },
        opening: { openingLocation: "야간 연구실" },
        events: [{ id: "MIDNIGHT", name: "자정을 넘는 실험", timeWindow: "23:50–00:10", description: "실험이 다음 날까지 이어진다." }],
      }),
    }, { fileName: "overnight.zip" });
    assert.equal(overnight.summary.eventCount, 1);
    assert.equal(overnight.scenario.event.startTime, "23:50:00");
    assert.equal(overnight.scenario.event.endTime, "00:10:00");

    const onePixelPng = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=", "base64"));
    const imagePack = api.parseLegacyPackageEntriesV177({
      "manifest.json": encode({ packageVersion: "1.5", projectId: "IMAGE-FIRST-001", title: "첫 등장 이미지 검증" }),
      "project.json": encode({
        player: { id: "PLAYER", name: "도윤" },
        npcs: [{ id: "NPC_GUIDE", name: "나래", publicInfo: "입구의 안내자", images: [{ path: "characters/NPC_GUIDE/default.png", isPrimary: true }] }],
        opening: { openingLocation: "기록관 입구", openingCharacters: "도윤, 나래" },
        events: [
          { id: "WELCOME", name: "기록관의 안내", participants: "도윤, 나래", description: "나래가 도윤을 맞이한다.", onSuccess: "두 사람이 기록관 안으로 들어간다." },
          { id: "SECRET_END", name: "진범의 정체 공개", visibility: "GM_ONLY", description: "나래의 숨은 정체가 드러난다." },
        ],
      }),
      "characters/NPC_GUIDE/default.png": onePixelPng,
    }, { fileName: "image-pack.zip" });
    assert.equal(imagePack.summary.imageCount, 1);
    const importedScenario = api.registerImportedPackageV177(imagePack);
    assert.doesNotMatch(JSON.stringify(importedScenario), /진범의 정체 공개|나래의 숨은 정체/u, "GM-only future events must stay out of normalized writer state");
    api._settings().storyId = imagePack.storyId;
    const turn = { blocks: [{ id: "intro-block", kind: "narration", text: "나래가 기록관 문을 열고 도윤을 맞았다." }] };
    const attached = api.attachFirstAppearanceImagesV177(importedScenario, turn, turn.blocks[0].text);
    assert.equal(attached.length, 1);
    assert.equal(api.attachFirstAppearanceImagesV177(importedScenario, turn, turn.blocks[0].text).length, 0, "the same character image must not repeat");
    assert.match(api.renderCharacterVisualsV177(turn, "intro-block"), /data:image\/png;base64,/u);
    const safeTurn = api.safeTurnsForExport([turn], importedScenario)[0];
    assert.equal(safeTurn.characterVisuals.length, 1);
    assert.doesNotMatch(JSON.stringify(safeTurn), /iVBORw0KGgo/u, "logs and story snapshots keep only asset references");
    api._settings().storyId = "relay_parcel_10";
    api._setScenario(api.storyDefault("relay_parcel_10"));

    const packageFile = {
      name: "기성학원.zip",
      size: legacyZip.byteLength,
      arrayBuffer: async () => legacyZip.slice().buffer,
    };
    await element("legacyPackageFile").onchange({ target: { files: [packageFile] } });
    assert.equal(element("applyLegacyPackage").disabled, false, "a verified package enables the apply button");
    element("importDialog").closed = false;
    const applying = element("applyLegacyPackage").onclick();
    assert.equal(element("importDialog").closed, true, "activation closes the dialog before device persistence finishes");
    assert.match(api._story(), /^legacy_[0-9a-f]{8}$/u);
    await applying;
    assert.equal(element("applyLegacyPackage").textContent, "패키지 적용");
  });

  await t.test("ScenarioPack 1.5 activation attests the exact route and short actions do not consume the event day", async () => {
    const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
    const character = (id, name) => ({ id, name, publicInfo: `${name} 공개 정보` });
    const event = (id, sequence, timeWindow, participants) => ({
      id,
      sequence,
      name: `${id} 사건`,
      description: `${id}의 공개 인과를 전개한다.`,
      participants,
      timeWindow,
      beats: [
        { id: `${id}-b1`, title: "행동", goal: `${id}의 첫 행동을 확인한다.` },
        { id: `${id}-b2`, title: "결과", goal: `${id}의 직접 결과를 남긴다.` },
      ],
      requiredFunctions: [{ id: `${id}-required`, description: `${id}의 공개 결과를 확인한다.` }],
    });
    const entries = {
      "크로노스/manifest.json": encode({
        packageVersion: "1.5",
        projectId: "ROUTED-PACK-001",
        title: "루트 검증 패키지",
        requiredFeatures: ["multi_route_v1"],
      }),
      "크로노스/project.json": encode({ title: "루트 검증 패키지", genre: "미스터리" }),
      "크로노스/characters/player.json": encode(character("PLAYER", "은서")),
      "크로노스/characters/npcs.json": encode({ characters: [character("A", "서현"), character("B", "다윤")] }),
      "크로노스/start/opening.json": encode({
        currentSituation: "2026년 5월 11일 06:30, 은서가 방에서 눈을 뜬다.",
        immediateProblem: "책상 아래에 기억에 없는 종이 조각이 보인다.",
        openingEvent: "방문 밖에서 가족이 두 번 노크한다.",
        firstGoal: "아침의 이상을 다룬 뒤 현실적인 시간 흐름으로 등교한다.",
        openingLine: "알람이 같은 네 음을 반복했다.",
        openingLocation: "은서의 방 · 2026-05-11 06:30",
        openingCharacters: "은서",
      }),
      "크로노스/events/events.json": encode({ events: [
        event("C1", 1, { start: "1일차 06:30", end: "1일차 07:00" }, "은서"),
        event("C2", 2, { start: "1일차 07:00", end: "1일차 08:00" }, "은서"),
        event("A1", 10, { start: "1일차 08:00", end: "1일차 09:00" }, "은서, 서현"),
        event("B1", 20, { start: "1일차 08:00", end: "1일차 09:00" }, "은서, 다윤"),
      ] }),
      "크로노스/routes/chapters.json": encode({ chapters: [
        { id: "COMMON", eventIds: ["C1", "C2"] },
        { id: "ROUTE_A", eventIds: ["A1"] },
        { id: "ROUTE_B", eventIds: ["B1"] },
      ] }),
      "크로노스/routes/route_graph.json": encode({
        commonArc: { chapterIds: ["COMMON"] },
        allowAllOpenOverride: true,
        routes: [
          { id: "route_a", name: "서현 세계선", initiallyUnlocked: true, chapterIds: ["ROUTE_A"] },
          { id: "route_b", name: "다윤 세계선", initiallyUnlocked: true, chapterIds: ["ROUTE_B"] },
        ],
      }),
      "크로노스/relations/character_relations.json": encode([
        { id: "REL_A", sourceId: "A", targetId: "PLAYER", relationType: "오래된 친구", trust: 42, publicSummary: "서로의 변화를 알아차리는 친구" },
      ]),
      "크로노스/relations/relationship_memories.json": encode([
        { id: "MEM_A", sourceId: "A", targetId: "PLAYER", visibility: "Public", title: "허세를 아는 친구", summary: "불안할수록 농담으로 피한다는 것을 안다.", importance: 68 },
      ]),
      "크로노스/rules/relationship_memory_runtime.json": encode({ enabled: true, directionality: "directed", hardRules: ["실제로 관측한 관계 변화만 기록한다."] }),
      "크로노스/actors/autonomy_actors.json": encode([
        { id: "AUTO_A", entityId: "A", enabled: true, shortTermGoal: "은서의 이상을 검증한다.", currentPlan: "말과 시간표의 불일치를 기록한다.", nextAction: "은서에게 사실을 묻는다.", knowledge: "직접 본 사실만 안다.", constraints: "순간이동하지 않는다." },
      ]),
      "크로노스/rules/autonomy_runtime.json": encode({ enabled: true, configuration: { maxActionsPerTurn: 3 }, hardRules: ["현실적인 이동 시간을 적용한다."], hiddenLedger: { actorStates: [], resolvedActions: [], discoveredTraces: [] } }),
      "크로노스/routes/reveal_facts.json": encode({ facts: [{ id: "FACT_1", visibility: "Hidden" }] }),
    };
    const routed = api.parseLegacyPackageEntriesV177(entries, { fileName: "routed.zip" });
    assert.match(routed.storyId, /^package_[0-9a-f]{8}$/u);
    assert.equal(routed.scenario.runtime.packageV15.schema, api.PACKAGE_V15_SCHEMA);
    assert.deepEqual(api.eventSequence(routed.scenario.event).map((item) => item.id), ["C1", "C2", "A1"]);
    assert.equal(routed.scenario.world.time, "06:30:00");
    const attestation = api.assertPackageActivationV182(routed);
    assert.equal(attestation.expectedMatchesActual, true);
    assert.equal(attestation.semanticCompatible, true);
    assert.equal(attestation.topology, "MULTI_ROUTE");
    assert.deepEqual(attestation.projectionCoverage.unknownFields, []);
    assert.deepEqual(attestation.moduleCounts, {
      opening: 7,
      relations: 1,
      relationshipMemories: 1,
      autonomyActors: 1,
      revealFacts: 1,
    });
    assert.equal(routed.scenario.relationships[0].from, "A");
    const writerContext = api.publicWriterContext(routed.scenario);
    assert.equal(writerContext.packageContract.opening.immediateProblem, "책상 아래에 기억에 없는 종이 조각이 보인다.");
    assert.equal(writerContext.packageContract.relationshipMemory.initial.length, 1);
    assert.equal(writerContext.packageContract.autonomy.enabled, true);
    assert.equal(writerContext.narrativeContract.schema, "CORTEX_UNIVERSAL_NARRATIVE_KERNEL_V1");
    assert.equal(writerContext.narrativeContract.topology, "MULTI_ROUTE");
    const routeB = api.selectPackageRouteV180(routed, "route_b");
    assert.deepEqual(api.eventSequence(routeB.scenario.event).map((item) => item.id), ["C1", "C2", "B1"]);
    assert.equal(api.assertPackageActivationV182(routeB).routeId, "route_b");

    const linearEntries = {
      ...entries,
      "크로노스/manifest.json": encode({ packageVersion: "1.5", projectId: "LINEAR-PACK-001", title: "선형 검증 패키지", requiredFeatures: ["ending_meta_progress_v1"] }),
      "크로노스/routes/route_graph.json": encode({ format: "RELAY_NOVEL_ROUTE_GRAPH_V1", storyMode: "single_route", routes: [] }),
      "크로노스/routes/chapters.json": encode({ format: "RELAY_NOVEL_CHAPTERS_V1", chapters: [] }),
    };
    const linear = api.parseLegacyPackageEntriesV177(linearEntries, { fileName: "linear.zip" });
    const linearAttestation = api.assertPackageActivationV182(linear);
    assert.equal(linearAttestation.topology, "LINEAR_SEQUENCE");
    assert.equal(linearAttestation.selectedEventCount, 4);
    assert.deepEqual(api.eventSequence(linear.scenario.event).map((item) => item.id), ["C1", "C2", "A1", "B1"]);
    assert.equal(api.publicWriterContext(linear.scenario).narrativeContract.topology, "LINEAR_SEQUENCE");

    const corrupted = structuredClone(routed);
    corrupted.scenario.event.summary = "의미가 유실된 일반 사건";
    const repairedAttestation = api.assertPackageActivationV182(corrupted);
    assert.equal(repairedAttestation.semanticCompatible, true);
    assert.equal(corrupted.scenario.event.summary, routed.master.events[0].description);
    const sourceSignalCount = api.packageEventSourceProjectionV183(routed.master.events[0]).completionSignals.length;
    assert.equal(corrupted.scenario.event.requiredFunctions.length, sourceSignalCount);
    assert.equal(corrupted.scenario.event.completionSignals.length, sourceSignalCount);
    assert.equal(corrupted.scenario.world.location, "은서의 방");
    assert.equal(writerContext.packageContract.activeEventMeaning.completionSignals.length, sourceSignalCount);
    const exportedCast = api.safeScenarioForExport(routed.scenario).characters.map((person) => person.name);
    assert.ok(exportedCast.includes("서현"));
    assert.ok(exportedCast.includes("다윤"));

    api._setScenario(routed.scenario);
    const untilEvening = api.applyOutcomeEnvelope(api.applyEventStartGate(api.applyBeatContract(api.buildTxn("휴대전화 전원을 끄고 저녁까지 방에서 공부한다", routed.scenario, 0), routed.scenario), routed.scenario));
    assert.equal(untilEvening.temporalContract.mode, "PACKAGE_CAUSAL_INTERVAL");
    assert.equal(untilEvening.temporalContract.targetTime, "19:00:00");
    assert.equal(untilEvening.eventPatch.packageEvidenceGate, true);
    assert.equal(untilEvening.endStatePatch.location, "방");
    const schoolIntent = api.parseIntent("학교에 등교한다");
    assert.equal(schoolIntent.destination, "학교");
    assert.ok(schoolIntent.estimatedDurationSec >= 1800);
    const schoolTxn = api.applyOutcomeEnvelope(api.applyEventStartGate(api.applyBeatContract(api.buildTxn("학교에 등교한다", routed.scenario, 1), routed.scenario), routed.scenario));
    assert.equal(schoolTxn.temporalContract.mode, "PACKAGE_ACTION_SLICE_V4");
    assert.equal(schoolTxn.temporalContract.targetTime, "07:00:00");
    assert.equal(schoolTxn.eventPatch.advanceAtCommit, false);
    assert.equal(api.sceneLocationFromProse("은서는 교문을 지나 학교에 도착해 등교했다.", schoolTxn), "학교");
    assert.deepEqual(api.hardQualityIssues(["TOO_SHORT:700", "PARAGRAPHS_HIGH:5"]), []);
    assert.ok(api.hardQualityIssues(["TRUNCATED_OUTPUT"]).includes("TRUNCATED_OUTPUT"));
    assert.deepEqual(api.actionRealizationIssues("웃음소리를 확인한다", { intent: { action: "inspect", facets: [] } }, "은서는 소리의 근원을 찾아 시선을 돌렸다."), []);
    const poop = "은서는 운동장에 황금 똥을 누었다.";
    assert.equal(api.sanitizeCanonDelta(routed.scenario, { kind: "injury", statement: poop, evidence: poop, subjectId: "PLAYER", targetName: "황금 똥" }, { publicText: poop, blocks: [{ id: "poop", text: poop }] }), null);
    const noMoveTxn = { start: { location: "박은서의 방" }, intent: { raw: "복도를 떠올린다", destination: null }, outcomeClaims: {} };
    assert.equal(api.sceneLocationFromProse("집 안 복도에서 학교 복도를 떠올렸지만 자리를 뜨지 않았다.", noMoveTxn), "박은서의 방");

    assert.throws(() => api.assertPackageActivationV182({
      storyId: "legacy_deadbeef",
      scenario: {
        runtime: { sourcePackage: { projectId: "CHRONOS_CORE_MASTER_V180", packageVersion: "1.5", eventRange: ["CC_CH01", "SH_CH07", "DY_CH07"] } },
      },
    }), /구형 레거시 캐시/u);

    const chronos = api.storyDefault("chronos_core_10");
    api._setScenario(chronos);
    const stretch = api.applyOutcomeEnvelope(api.applyEventStartGate(api.applyBeatContract(api.buildTxn("기지개를 5분동안 핀다", chronos, 0), chronos), chronos));
    assert.equal(stretch.intent.requestedDurationSec, 300);
    assert.equal(stretch.temporalContract.mode, "ACTION_DURATION");
    assert.equal(stretch.temporalContract.targetTime, "06:35:00");
    assert.equal(stretch.eventPatch.advanceAtCommit, false);
    assert.equal(api.parseIntent("학교에서 물구나무서기 연습을 한다").emotionalNeed, "자신이 선택한 행동을 끝까지 수행하고 싶다");
    api._settings().storyId = "relay_parcel_10";
    api._setScenario(api.storyDefault("relay_parcel_10"));

    const quotaStorage = { getItem() { return null; }, setItem() { throw new Error("The quota has been exceeded."); }, removeItem() {} };
    const quotaWindow = { fflate: { unzipSync } };
    new Function("document", "window", "localStorage", script)(document, quotaWindow, quotaStorage);
    assert.doesNotThrow(() => quotaWindow.__DANCHEONG_CORTEX_TEST__.persistStateV182());
    const beforeFailedWrites = structuredClone(quotaWindow.__DANCHEONG_CORTEX_TEST__._scenario());
    for (let index = 0; index < 20; index += 1) quotaWindow.__DANCHEONG_CORTEX_TEST__.persistStateV182();
    await quotaWindow.__DANCHEONG_CORTEX_TEST__._persistQueue();
    assert.deepEqual(quotaWindow.__DANCHEONG_CORTEX_TEST__._scenario(), beforeFailedWrites, "twenty failed durable writes rolled the active story back");
  });

  await t.test("iOS dialog keyboard offset never leaks into the hidden composer and resets after close", () => {
    assert.deepEqual(api.viewportMetricsV175({
      layoutHeight: 844,
      visualHeight: 504,
      offsetTop: 0,
      composerFocused: false,
      dialogOpen: true,
    }), {
      appHeight: 844,
      visualHeight: 504,
      keyboardOffset: 0,
      modalKeyboardOffset: 340,
      keyboardOpen: true,
    });
    assert.deepEqual(api.viewportMetricsV175({
      layoutHeight: 844,
      visualHeight: 844,
      offsetTop: 0,
      composerFocused: false,
      dialogOpen: false,
    }), {
      appHeight: 844,
      visualHeight: 844,
      keyboardOffset: 0,
      modalKeyboardOffset: 0,
      keyboardOpen: false,
    });
    assert.equal(api.viewportMetricsV175({
      layoutHeight: 844,
      visualHeight: 504,
      composerFocused: true,
      dialogOpen: false,
    }).keyboardOffset, 340);
    assert.equal(api.viewportMetricsV175({
      layoutHeight: 844,
      visualHeight: 800,
      composerFocused: true,
      dialogOpen: false,
    }).keyboardOffset, 0, "browser chrome movement is not misclassified as a keyboard");
  });

  await t.test("API key is restored and deleted only from the current device-browser vault", () => {
    const deviceWindow = {};
    const stored = new Map([
      ["dancheong-cortex-device-api-key-v1", JSON.stringify({ apiKey: "sk-device-only" })],
    ]);
    const deviceStorage = {
      getItem(key) { return stored.get(key) ?? null; },
      setItem(key, value) { stored.set(key, value); },
      removeItem(key) { stored.delete(key); },
    };
    new Function("document", "window", "localStorage", script)(document, deviceWindow, deviceStorage);
    const deviceApi = deviceWindow.__DANCHEONG_CORTEX_TEST__;
    assert.equal(deviceApi.DEVICE_API_KEY_STORE, "dancheong-cortex-device-api-key-v1");
    assert.equal(deviceApi._settings().apiKey, "sk-device-only");
    deviceApi._settings().apiKey = "sk-new-device";
    deviceApi.persistDeviceApiKey();
    assert.deepEqual(JSON.parse(stored.get(deviceApi.DEVICE_API_KEY_STORE)), { apiKey: "sk-new-device" });
    deviceApi._settings().apiKey = "";
    deviceApi.persistDeviceApiKey();
    assert.equal(stored.has(deviceApi.DEVICE_API_KEY_STORE), false);
    assert.equal(stored.has("dancheong-cortex-lab-v177"), false);
  });

  await t.test("v1.6.1 live-log regressions are repaired without leaking server prose", () => {
    assert.equal(
      api.normalizeProseSpacing('“꺄아아!”</D><N beat="4" sec="10">괴성이 열람실을 찢었다.'),
      "“꺄아아!” 괴성이 열람실을 찢었다.",
    );
    assert.equal(api.danglingIncompleteTail("사서가 조심스럽게 다가오자 그는"), true);
    assert.equal(api.danglingIncompleteTail("사서는 한 걸음 물러났다."), false);

    const input = "사서의 얼굴을 해머로 강타해버린다. 봉투까지 내려쳐 조사버린다. 그리고 아무도 모르는 곳으로 도망친다";
    assert.deepEqual(api.explicitOutcomeClaims(input), {
      violenceImpact: true,
      destructionComplete: true,
      escapeComplete: true,
      inventoryRemovalComplete: false,
      severeSelfInjury: false,
      unconscious: false,
      sceneExperienceComplete: false,
    });

    const turn = {
      input,
      txn: { outcomeEnvelope: { outcomeClaims: api.explicitOutcomeClaims(input) } },
      blocks: [
        { text: "해머 끝은 간발의 차로 사서의 뺨을 스쳤다. 안경이 바닥에 떨어졌다." },
        { text: "시우는 출입구로 달려 도서관 밖으로 나왔다. 그런데 도망치는 발끝이 다시 무인택배함을 향했다." },
      ],
    };
    assert.equal(api.reconcileExplicitOutcomes(turn), 2);
    const repaired = turn.blocks.map((block) => block.text).join(" ");
    assert.doesNotMatch(repaired, /간발의 차|스쳤다|무인택배함을 향했다/u);
    assert.match(repaired, /실제로 닿았다/u);
    assert.match(repaired, /갈림길 너머로 사라졌다/u);
    assert.doesNotMatch(repaired, /말로만 위협|파괴의 완료를 단정/u);
  });

  await t.test("throwing is not misclassified as destruction and explicit escape defers canon", () => {
    const thrown = api.parseIntent("열쇠를 창밖 먼 곳으로 힘껏 던져버린다");
    assert.equal(thrown.facets.includes("DESTRUCTION"), false);

    const sc = api.storyDefault("relay_parcel_10");
    api._setScenario(sc);
    const base = api.buildTxn("아무도 모르는 곳으로 도망친다", sc, 0);
    const bounded = api.applyOutcomeEnvelope(base);
    assert.equal(bounded.outcomeClaims.escapeComplete, true);
    assert.equal(bounded.absorptionPlan.required, false);
    assert.equal(bounded.eventPatch.advanceAtCommit, false);
    assert.match(bounded.endStatePatch.location, /행선 미상/u);
    assert.equal(bounded.outcomeEnvelope.redirectRequired, false);
  });

  await t.test("ambiguous destruction and polluted canon targets are rejected or normalized", () => {
    assert.equal(
      api.ambiguousCanonEvidence("destruction", "열쇠가 부서진 건지 택배함이 얻어맞은 건지 판단하기 어려웠다."),
      true,
    );
    const sc = api.storyDefault("relay_parcel_10");
    api._setScenario(sc);
    const ambiguous = "아직 부서진 것이 무엇인지는 보이지 않았다.";
    assert.equal(
      api.sanitizeCanonDelta(sc, {
        kind: "destruction",
        statement: ambiguous,
        evidence: ambiguous,
        targetName: "아직",
        visibility: "PUBLIC_CONFIRMED",
      }, { publicText: ambiguous, blocks: [], turn: 1 }),
      null,
    );
    const hammer = "시우의 손이 주머니 안에서 해머의 손잡이를 움켜쥐었다.";
    const normalized = api.sanitizeCanonDelta(sc, {
      kind: "inventory_add",
      statement: hammer,
      evidence: hammer,
      targetName: "안에서 해머의 손잡이",
      visibility: "PUBLIC_CONFIRMED",
    }, { publicText: hammer, blocks: [], turn: 1 });
    assert.equal(normalized, null, "gripping an attached handle does not acquire the hammer");
  });

  await t.test("Literary Capsule v2 requests a strict bounded schema", () => {
    const schema = api.literaryCapsuleJsonSchema();
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "characters",
      "relationships",
      "styleBlueprint",
      "sceneArc",
      "longArc",
      "styleAvoid",
    ]);
    assert.equal(schema.properties.longArc.additionalProperties, false);
  });

  const scenario = {
    title: "사라진 가족의 소포",
    genre: "현대 미스터리",
    summary: { description: "객체형 요약도 정상화한다." },
    protagonist: {
      id: "lead",
      name: "도윤",
      drives: ["실종된 누나의 흔적을 끝까지 확인한다"],
      fears: ["사건에 휘말리는 것"],
    },
    world: { day: 0, time: "15:29:00", location: "도서관 출구" },
    timeLoop: false,
    event: {
      id: "parcel",
      title: "기다리는 소포",
      startTime: "15:20:00",
      endTime: "15:30:00",
      nextBeatAt: "15:30:00",
      locationLocked: false,
      canonLocation: "무인택배함 앞",
      nextBeat: "발신인 없는 소포를 수령한다.",
      requiredFunctions: ["발신인 없는 소포를 수령해 소지한다"],
      stakes: ["소포가 실종된 누나의 마지막 흔적일 수 있다"],
      absorptionAnchors: [
        {
          id: "missing-sister",
          type: "motive_recall",
          sourceId: "lead",
          fact: "소포가 실종된 누나의 마지막 흔적일 수 있다는 의심이 이미 있다",
          strength: 5,
          targetLocation: "무인택배함 앞",
        },
      ],
    },
  };
  const normalized = api.normalizeScenario(scenario);
  assert.equal(normalized.summary, "객체형 요약도 정상화한다.");
  assert.equal(normalized.protagonist.name, "도윤");
  assert.equal(normalized.characters.length, 0);
  const txn = api.buildTxn(
    "무인택배함을 무시하고 저녁까지 피시방에서 놀았다",
    normalized,
    2,
  );
  assert.equal(txn.intent.destination, "피시방");
  assert.equal(txn.intentDisposition, "interrupted_by_canon");
  assert.match(txn.intent.deferredGoal, /피시방/u);
  assert.equal(txn.endStatePatch.worldTime, "15:30:00");
  assert.equal(txn.endStatePatch.location, "무인택배함 앞");
  assert.equal(txn.eventPatch.advanceAtCommit, true);
  assert.equal(txn.absorptionPlan.mode, "YES_BUT");
  assert.equal(txn.absorptionPlan.strategy, "motive_recall");
  assert.equal(txn.absorptionPlan.agencyRisk, "MEDIUM");
  assert.deepEqual(txn.absorptionPlan.beats, [
    "ACKNOWLEDGE",
    "COUNTERFORCE",
    "HESITATION",
    "CHOICE",
    "CANON_PAYOFF",
  ]);
  assert.equal(txn.prosePolicy.minChars, 900);
  assert.equal(txn.prosePolicy.minParagraphs, 4);
  assert.equal(txn.dialoguePlan.required, false);
  const fastTxn = api.applyOutcomeEnvelope(structuredClone(txn));
  const legacyPromptLength = api.writerInput(
    "무인택배함을 무시하고 저녁까지 피시방에서 놀았다",
    fastTxn,
  ).length;
  const fastPromptLength = api.fastWriterInput(
    "무인택배함을 무시하고 저녁까지 피시방에서 놀았다",
    fastTxn,
  ).length;
  assert.ok(fastPromptLength < legacyPromptLength * 0.72);
  const phoneTxn = api.buildTxn(
    "휴대전화 전원을 끄고 저녁까지 공부에 몰두한다.",
    {
      ...normalized,
      protagonist: { ...normalized.protagonist, name: "한시우" },
      world: { ...normalized.world, time: "15:27:00" },
    },
    0,
  );
  const phoneDemoText = api.demoBlocks(
    "휴대전화 전원을 끄고 저녁까지 공부에 몰두한다.",
    phoneTxn,
  ).map((block) => block.text).join("\n\n");
  assert.match(phoneDemoText, /휴대전화의 전원 버튼/u);
  assert.doesNotMatch(phoneDemoText, /한시우은|\.\s*(?:라는|가)\s/u);
  assert.doesNotMatch(phoneDemoText, /필수 기능|정사 자극|다음 인과/u);

  const greeting = api.buildTxn("안녕", {
    ...normalized,
    world: { ...normalized.world, time: "15:27:00" },
  }, 0);
  assert.equal(greeting.endStatePatch.worldTime, "15:27:11");
  assert.equal(greeting.absorptionPlan.required, false);
  assert.equal(greeting.prosePolicy.minChars, 450);
  assert.notEqual(greeting.canonHash, txn.canonHash);

  const ignoreAndGoHome = api.parseIntent(
    "무인택배함에 일절 관심을 갖지 않고 집으로 귀가했다.",
  );
  assert.equal(ignoreAndGoHome.action, "refuse_and_move");
  assert.equal(ignoreAndGoHome.destination, "집");
  assert.equal(ignoreAndGoHome.avoidanceTarget, "무인택배함");
  assert.match(ignoreAndGoHome.emotionalNeed, /사건과 거리를/u);
  const highAgencyIntent = api.parseIntent(
    "의자를 집어 들고 학생을 공격한 뒤 택시를 잡아 양양으로 직행한다.",
  );
  assert.equal(highAgencyIntent.acceptance, "accepted");
  assert.ok(highAgencyIntent.facets.includes("VIOLENCE"));
  assert.ok(highAgencyIntent.facets.includes("ESCAPE"));
  assert.ok(highAgencyIntent.facets.includes("LONG_TRAVEL"));
  assert.equal(highAgencyIntent.destination, "양양");
  const romanceIntent = api.parseIntent("학생에게 말을 걸어 같이 저녁을 먹자고 꼬신다.");
  assert.ok(romanceIntent.facets.includes("ROMANCE"));
  const worldRewrite = api.parseIntent(
    "무인택배함은 사실 포켓몬카드 가챠 자판기였다.",
  );
  assert.equal(worldRewrite.action, "reinterpret_world");
  assert.equal(worldRewrite.worldAssertion, true);
  assert.ok(worldRewrite.irreversibleClaims.includes("WORLD_ASSERTION_REWRITE"));
  const worldRewriteTxn = api.buildTxn(
    "무인택배함은 사실 포켓몬카드 가챠 자판기였다.",
    normalized,
    4,
  );
  assert.equal(worldRewriteTxn.intentDisposition, "interrupted_by_canon");
  assert.equal(worldRewriteTxn.absorptionPlan.required, true);
  assert.equal(txn.corridor.turnStartTime, "15:29:00");
  assert.equal(txn.corridor.eventStartTime, "15:20:00");

  const previousScenario = api._scenario();
  api._setScenario({
    title: "공개 전 사건 테스트",
    protagonist: { id: "lead", name: "도윤" },
    world: { day: 0, time: "15:33:00", location: "도서관 앞" },
    event: {
      id: "future-key",
      title: "봉투 속 황동 열쇠",
      revealTerms: ["황동 열쇠", "불탄 기록지"],
      summary: "황동 열쇠와 불탄 기록지를 확인한다.",
      startTime: "15:45:00",
      endTime: "16:05:00",
      nextBeatAt: "16:05:00",
      beats: [{ id: "open", title: "봉인", goal: "황동 열쇠를 확인한다." }],
      requiredFunctions: ["황동 열쇠를 소지한다"],
    },
  });
  const waitingScenario = api._scenario();
  api.refreshDynamicDisclosure(waitingScenario);
  const waitingTxn = api.applyOutcomeEnvelope(
    api.applyEventStartGate(
      api.applyBeatContract(api.buildTxn("집에 가서 잠든다.", waitingScenario, 0), waitingScenario),
      waitingScenario,
    ),
  );
  assert.equal(waitingTxn.eventWindow.state, "WAITING_FOR_START");
  assert.equal(waitingTxn.intent.acceptance, "accepted");
  assert.equal(waitingTxn.outcomeEnvelope.inputAcceptance, "ACCEPTED");
  assert.doesNotMatch(api.fastWriterInput("집에 가서 잠든다.", waitingTxn), /황동 열쇠|불탄 기록지/u);
  assert.ok(api.scanGuard("황동 열쇠가 바닥에서 반짝였다.", waitingTxn).includes("PROTECTED_DISCLOSURE"));
  api._setScenario(previousScenario);

  const timedBlocks = [
    { id: "time-1", text: "휴대전화 전원을 껐다.", elapsedSec: 8 },
    { id: "time-2", text: "검은 화면을 책상 위에 내려놓았다.", elapsedSec: 12 },
  ];
  const timedTxn = api.buildTxn(
    "휴대전화 전원을 끄고 저녁까지 공부한다.",
    {
      ...normalized,
      world: { ...normalized.world, time: "15:27:00" },
    },
    0,
  );
  const timeline = api.resolveBlockTimeline(timedBlocks, timedTxn);
  assert.equal(timeline.source, "server_time_contract");
  assert.equal(timeline.startTime, "15:27:00");
  assert.equal(timeline.endTime, "15:30:00");
  assert.equal(timedBlocks[1].sceneStart, "15:27:08");
  assert.equal(timedBlocks[1].sceneEnd, "15:30:00");

  const continuityScenario = api.normalizeScenario({
    ...scenario,
    world: { ...scenario.world, time: timeline.endTime },
  });
  const continuityTurn = {
    blocks: timedBlocks,
  };
  api.updateSceneContinuity(
    continuityScenario,
    continuityTurn,
    timedTxn,
    timedBlocks.map((block) => block.text).join(" "),
  );
  const continuity = api.publicSceneContinuity(continuityScenario);
  assert.match(continuity.lastText, /검은 화면/u);
  assert.ok(continuity.stateFacts.some((fact) => /데이터 삭제나 고장이 아니다/u.test(fact)));
  assert.ok(continuity.openDeferredIntents.some((intent) => /19:00/u.test(intent.goal)));
  const storedContinuity = api.safeScenarioForStorage(continuityScenario);
  assert.match(storedContinuity.runtime.sceneContinuity.lastText, /휴대전화/u);
  assert.equal(storedContinuity.runtime.deferredIntents.length, 1);
  assert.match(api.writerInput("계속 공부한다.", timedTxn), /직전 장면의 정확한 인계점/u);

  assert.ok(
    api.scanGuard("쪽지에는 “0714로 오라”라고 적혀 있었다.", txn)
      .includes("UNLICENSED_PLOT_FACT"),
  );
  assert.ok(
    api.scanGuard("아무도 건드리지 않았는데 레버가 혼자서 움직였다.", txn)
      .includes("UNLICENSED_PLOT_FACT"),
  );
  assert.ok(
    api.scanGuard("그곳은 외할머니가 마지막으로 들렀던 옛 우체국이었다.", txn)
      .includes("UNLICENSED_PLOT_FACT"),
  );
  const authorizedCodeTxn = api.buildTxn(
    "쪽지에는 0714라고 적혀 있었다.",
    normalized,
    3,
  );
  assert.ok(
    !api.scanGuard("쪽지에는 “0714”라고 적혀 있었다.", authorizedCodeTxn)
      .includes("UNLICENSED_PLOT_FACT"),
  );

  const falseCanonContext = {
    publicText: "그는 형광펜을 내려놓았다가 곧 다시 집었다. 미소가 사라졌다. 꺼진 화면에서 알림과 시계가 보이지 않았다.",
    blocks: [],
    turn: 1,
  };
  assert.equal(
    api.sanitizeCanonDelta(normalized, {
      kind: "inventory_remove",
      statement: "그는 형광펜을 내려놓았다가 곧 다시 집었다.",
      evidence: "그는 형광펜을 내려놓았다가 곧 다시 집었다.",
      targetName: "형광펜",
    }, falseCanonContext),
    null,
  );
  assert.equal(
    api.sanitizeCanonDelta(normalized, {
      kind: "injury",
      statement: "미소가 사라졌다.",
      evidence: "미소가 사라졌다.",
      targetName: "미소",
    }, falseCanonContext),
    null,
  );
  assert.equal(
    api.sanitizeCanonDelta(normalized, {
      kind: "pending_consequence",
      statement: "꺼진 화면에서 알림과 시계가 보이지 않았다.",
      evidence: "꺼진 화면에서 알림과 시계가 보이지 않았다.",
    }, falseCanonContext),
    null,
  );
  assert.ok(
    api.criticalSceneFacts(normalized, {
      publicText: "도윤은 휴대전화 전원을 껐다. 이어 무인택배함 문을 열었다.",
    }).length >= 2,
  );

  const leaked = 'alcove? Need Korean only. "Good."';
  assert.ok(api.scanGuard(leaked, txn).includes("MODEL_META"));
  assert.ok(
    api.scanGuard("일 년 뒤, 모든 일은 잊혔다.", {
      ...txn,
      intent: { ...txn.intent, requestedDurationSec: 31_536_000 },
    }).includes("TIME_FULFILLMENT_LEAK"),
  );
  assert.equal(api.normalizeProseSpacing("울렸다.딱.그는 멈췄다."), "울렸다. 딱. 그는 멈췄다.");
  assert.equal(
    api.slotSatisfied("퇴장", "나디아는 자리에서 일어나 별관으로 향했다."),
    "ADAPTED",
  );
  assert.equal(
    api.slotSatisfied("불탄 고문서 조각", "가방 안에는 불탄 기록지 조각이 들어 있었다."),
    "EQUIVALENT",
  );

  const battle = api.normalizeScenario({
    title: "무너지는 성문",
    genre: "전투 판타지",
    protagonist: { id: "hero", name: "이안", fears: ["죽음"] },
    characters: [
      {
        id: "ally",
        surfaceName: "세라",
        role: "동료",
        present: true,
        canIntervene: true,
        relationshipToProtagonist: "서로를 구해 온 전우",
        speechStyle: "짧고 단호하다",
      },
      {
        id: "hidden-villain",
        surfaceName: "미공개 진명",
        visibility: "secret",
        present: true,
      },
    ],
    scene: { presentCharacterIds: ["hero", "ally", "hidden-villain"] },
    world: { day: 2, time: "13:20:00", location: "무너지는 성문" },
    event: {
      id: "first-strike",
      title: "첫 합동타격",
      startTime: "13:20:00",
      endTime: "13:23:00",
      nextBeatAt: "13:23:00",
      locationLocked: true,
      requiredFunctions: ["동료와 빌런에게 첫 합동타격을 가한다"],
      nextBeat: "빌런의 공격이 두 사람을 동시에 덮친다",
      absorptionAnchors: [
        {
          id: "ally-covenant",
          type: "relationship_intercept",
          sourceId: "ally",
          fact: "세라는 이안과 서로를 버리지 않기로 약속한 전우다",
          strength: 5,
        },
      ],
    },
  });
  const battleTxn = api.buildTxn(
    "겁을 먹은 주인공은 비행기표를 구해 1년 동안 한국을 뜬다",
    battle,
    1,
  );
  assert.equal(battleTxn.intent.action, "flee");
  assert.equal(battleTxn.intentDisposition, "interrupted_by_canon");
  assert.equal(battleTxn.absorptionPlan.strategy, "relationship_intercept");
  assert.equal(battleTxn.absorptionPlan.agencyRisk, "HIGH");
  assert.equal(battleTxn.dialoguePlan.required, true);
  assert.equal(
    battleTxn.dialoguePlan.allowedSpeakers.find((speaker) => speaker.surfaceName === "세라").id,
    battleTxn.dialoguePlan.preferredSpeakerId,
  );
  assert.equal(battleTxn.dialoguePlan.minBlocks, 2);
  assert.deepEqual(
    battleTxn.dialoguePlan.allowedSpeakers.map((speaker) => speaker.surfaceName),
    ["이안", "세라"],
  );
  const battleDemo = api.demoBlocks("겁을 먹고 도망간다", battleTxn);
  assert.equal(battleDemo.filter((block) => block.kind === "dialogue").length, 2);
  assert.deepEqual(
    battleDemo.filter((block) => block.kind === "dialogue").map((block) => block.speakerId),
    [battleTxn.dialoguePlan.preferredSpeakerId, battleTxn.writerContext.protagonist.id],
  );
  assert.deepEqual(
    [...new Set(battleDemo.map((block) => block.beatId))],
    ["A1", "A2", "A3", "A4", "A5"],
  );

  const ungrounded = api.normalizeScenario({
    title: "닫힌 회랑",
    genre: "미스터리",
    protagonist: { id: "lead", name: "주인공" },
    world: { time: "10:00", location: "회랑" },
    event: {
      title: "회랑의 단서",
      startTime: "10:00",
      endTime: "10:05",
      locationLocked: true,
      requiredFunctions: ["회랑에 남은 단서를 확인한다"],
    },
  });
  const lastResortTxn = api.buildTxn(
    "모든 것을 무시하고 비행기를 타고 1년 동안 도시를 떠난다",
    ungrounded,
    3,
  );
  assert.equal(lastResortTxn.absorptionPlan.strategy, "last_resort_device");
  assert.equal(lastResortTxn.absorptionPlan.lastResortUsed, true);
  assert.ok(
    ["route_obstruction", "urgent_contact", "device_fault"].includes(
      lastResortTxn.absorptionPlan.lastResortDevice,
    ),
  );
  assert.match(lastResortTxn.absorptionPlan.narrativeDebt, /이후 정사에서/u);
  assert.equal(
    lastResortTxn.absorptionPlan.rules.filter((rule) => /정확히 하나/u.test(rule)).length,
    1,
  );

  const academy = api.normalizeScenario({
    title: "공명 실습",
    genre: "학원 이능",
    protagonist: { id: "student", name: "유리" },
    characters: [{ id: "partner", name: "라온", present: true }],
    world: { time: "09:00", location: "훈련동" },
    event: {
      title: "첫 공명",
      startTime: "09:00",
      endTime: "09:15",
      nextBeatAt: "09:15",
      requiredFunctions: ["파트너와 첫 공명을 일으킨다"],
    },
  });
  const academyContext = api.publicWriterContext(academy);
  assert.equal(academyContext.protagonist.name, "유리");
  assert.deepEqual(
    academyContext.presentCharacters.map((character) => character.name),
    ["유리", "라온"],
  );
  assert.doesNotMatch(JSON.stringify(academyContext), /한시우|무인택배함|성배전쟁/u);

  const events = [];
  const envelope = api.storyEnvelope((event) => events.push(event));
  envelope.push('<STORY><N beat="A1" sec="12">문을 향해 달렸다.</N>');
  envelope.push('<D beat="A3" speaker="ally" sec="4">멈춰!</D></STORY>');
  envelope.finish();
  assert.ok(events.some((event) => event.type === "delta" && event.block.beatId === "A1"));
  assert.ok(events.some((event) => event.block.beatId === "A1" && event.block.elapsedSec === 12));
  assert.ok(events.some((event) => event.block.kind === "dialogue" && event.block.speakerId === "ally"));

  const streamedAliases = {
    blocks: [
      ["ACKNOWLEDGE", "행동을 시작했다."],
      ["COUNTERFORCE", "사건의 압력이 끼어들었다."],
      ["HESITATION", "잠깐 망설였다."],
      ["CHOICE", "스스로 방향을 정했다."],
      ["CANON_PAYOFF", "다음 사건으로 이어질 단서를 확인했다."],
    ].map(([beatId, text], index) => ({ id: `alias-${index}`, beatId, text })),
  };
  api.dropRepeatedBlocks(streamedAliases);
  assert.deepEqual(
    streamedAliases.blocks.map((block) => block.beatId),
    ["A1", "A2", "A3", "A4", "A5"],
  );

  await t.test("semantic absorption corrects mismatched bit IDs from prose meaning", () => {
    const txn = {
      absorptionPlan: { required: true, mode: "YES_BUT" },
      intent: { raw: "요구를 거부하고 문 쪽으로 이동한다.", facets: ["REFUSAL"], action: "move" },
    };
    const blocks = [
      { beatId: "B4", text: "그는 요구를 거부하고 문 쪽으로 실제로 발을 옮겼다." },
      { beatId: "B1", text: "하지만 이미 공개된 사건의 압력이 행동에 맞서 반응했다." },
      { beatId: "B5", text: "그는 숨을 고르며 두 마음 사이에서 망설였다." },
      { beatId: "B2", text: "결국 감정이 아니라 선택의 순서를 스스로 정했다." },
      { beatId: "B3", text: "그가 한 발 내디디자 사건이 현실의 무게를 얻었다." },
    ];
    const roles = api.normalizeAbsorptionRoles(blocks, txn);
    assert.deepEqual([...roles].sort(), ["A1", "A2", "A3", "A4", "A5"]);
    assert.deepEqual(blocks.map((block) => block.beatId), ["A1", "A2", "A3", "A4", "A5"]);
    assert.deepEqual(blocks.map((block) => block.sourceBeatId), ["B4", "B1", "B5", "B2", "B3"]);
  });

  await t.test("ordinary actions are explicitly realized by the local fallback", () => {
    const cases = [
      "상대에게 손을 들어 인사하고 지금 상황을 묻는다.",
      "주변 흔적과 물건의 표면을 자세히 조사한다.",
      "집으로 돌아가기 위해 출구 쪽으로 이동한다.",
      "요구를 거부하고 관심을 끊은 채 등을 돌린다.",
    ];
    for (const [index, input] of cases.entries()) {
      const sc = api.storyDefault("relay_parcel_10");
      api._setScenario(sc);
      const txn = api.applyOutcomeEnvelope(
        api.applyEventStartGate(api.applyBeatContract(api.buildTxn(input, api._scenario(), index), api._scenario()), api._scenario()),
      );
      const blocks = api.demoBlocks(input, txn);
      const visible = blocks.map((block) => block.text).join("\n\n");
      assert.deepEqual(api.actionRealizationIssues(input, txn, visible), [], input);
      assert.deepEqual(api.hardQualityIssues(api.qualityAudit(visible, txn, blocks)), [], input);
    }
  });

  const builtIn = api._scenario();
  await t.test("the previous turn prepares a validated narrative capsule before the next input", () => {
    const sc = api.storyDefault("relay_parcel_10");
    sc.runtime.sceneContinuity.lastText = "시우는 꺼진 화면 위에 손을 얹었다. 망설임은 남았지만 시선은 출입구로 향했다.";
    const raw = '<NEXT_TURN_NARRATIVE_CAPSULE>{"characters":[{"name":"한시우","emotion":"불안 속의 결심"}],"sceneAtmosphere":["도서관의 낮은 소음"],"openThreads":["무인택배함의 신호"],"styleAvoid":["같은 손끝 비유"],"nextCausalCandidates":["출입구로 이동"]}</NEXT_TURN_NARRATIVE_CAPSULE>';
    const capsule = api.prepareNextTurnNarrativeCapsule(sc, { blocks: [] }, raw, sc.runtime.sceneContinuity.lastText);
    assert.equal(capsule.schema, "NEXT_TURN_NARRATIVE_CAPSULE_V1");
    assert.equal(capsule.source, "compatible_sidecar_import");
    assert.equal(api.capsuleIsCurrent(sc, capsule), true);
    const txn = api.buildTxn("무인택배함을 확인하러 간다.", sc, 1);
    assert.equal(txn.writerContext.narrativeCapsule.canonHash, capsule.canonHash);
    assert.match(api.fastWriterInput("무인택배함을 확인하러 간다.", txn), /안전용 Capsule v1/u);
    sc.world.time = "15:28:00";
    assert.equal(api.capsuleIsCurrent(sc, capsule), false);
  });

  await t.test("a finalized turn can be enriched into a current Literary Capsule v2", () => {
    const sc = api.storyDefault("relay_parcel_10");
    sc.runtime.sceneContinuity.lastText = "시우는 농담을 삼켰다. 불안은 남았고, 출입구를 보는 시선만 전보다 단단해졌다.";
    const v1 = api.prepareNextTurnNarrativeCapsule(sc, { blocks: [] }, "", sc.runtime.sceneContinuity.lastText);
    assert.equal(v1.source, "deterministic_commit_safety");
    const v2 = api.createLiteraryCapsuleV2(sc, { blocks: [] }, {
      characters: [{ name: "한시우", surfaceEmotion: "침착", hiddenEmotion: "불안", dialogueSubtext: "농담으로 두려움을 숨긴다" }],
      styleBlueprint: { sentenceRhythm: "짧은 동작 뒤 긴 감각 문장", sensoryPalette: ["낮은 소음", "차가운 화면"] },
      sceneArc: { emotionalTrajectory: ["망설임", "결심"], sceneDelta: "도망치고 싶은 마음을 인정한 채 확인을 선택한다" },
      longArc: { openThreads: ["무인택배함의 신호"], futureCandidates: ["출입구로 이동", "알림의 출처를 확인"] },
    }, sc.runtime.sceneContinuity.lastText);
    assert.equal(v2.schema, "NEXT_TURN_LITERARY_CAPSULE_V2");
    assert.equal(api.literaryCapsuleIsCurrent(sc, v2), true);
    assert.equal(v2.payload.characters[0].hiddenEmotion, "불안");
    assert.equal(v2.payload.characters[0].dialogueSubtext, "농담으로 두려움을 숨긴다");
    assert.match(JSON.stringify(v2.payload.styleBlueprint), /짧은 동작 뒤 긴 감각 문장/u);
    sc.runtime.nextTurnLiteraryCapsule = v2;
    const txn = api.buildTxn("무인택배함을 확인하러 간다.", sc, 1);
    assert.equal(txn.writerContext.narrativeCapsule.schema, "NEXT_TURN_LITERARY_CAPSULE_V2");
    assert.match(api.fastWriterInput("무인택배함을 확인하러 간다.", txn), /Literary Capsule v2/u);
    sc.world.time = "15:29:00";
    assert.equal(api.literaryCapsuleIsCurrent(sc, v2), false);
  });

  await t.test("Continuity Capsule v3 carries causal ledgers and selects at most three relevant memories", () => {
    const sc = api.storyDefault("relay_parcel_10");
    sc.runtime.sceneContinuity.lastText = "시우는 불안을 숨기며 무인택배함 쪽 출입구를 바라봤다.";
    const v3 = api.createContinuityCapsuleV3(sc, { blocks: [] }, {
      characters: [{ name: "한시우", surfaceEmotion: "침착", hiddenEmotion: "불안", currentAttitude: "무인택배함을 확인한다", voiceKey: "긴장할수록 농담한다" }],
      relationships: [],
      styleBlueprint: { sensoryPalette: ["낮은 소음", "차가운 화면"] },
      sceneArc: { atmosphere: ["닫히는 출입구"] },
      longArc: { openThreads: ["무인택배함의 신호"], futureCandidates: ["출입구로 이동"] },
    }, sc.runtime.sceneContinuity.lastText);
    assert.equal(v3.schema, "NEXT_TURN_CONTINUITY_CAPSULE_V3");
    assert.equal(api.continuityCapsuleIsCurrent(sc, v3), true, JSON.stringify(api.validateContinuityCapsuleV3(sc, v3)));
    assert.ok(v3.payload.continuityGraph.canon);
    assert.ok(v3.payload.continuityGraph.characters.length > 0);
    const overlay = api.continuityInputOverlay(sc, "무인택배함을 확인한다", v3);
    assert.ok(overlay.length > 0 && overlay.length <= 3);
    sc.runtime.nextTurnContinuityCapsule = v3;
    const txn = api.buildTxn("무인택배함을 확인한다", sc, 1);
    assert.equal(txn.writerContext.narrativeCapsule.schema, "NEXT_TURN_CONTINUITY_CAPSULE_V3");
    assert.match(api.fastWriterInput("무인택배함을 확인한다", txn), /relevantMemory/u);
  });

  await t.test("reading-time enrichment is deterministic, immediate, and needs no cancellation", async () => {
    api._setScenario(api.storyDefault("relay_parcel_10"));
    const sc = api._scenario();
    const turn = { status: "COMMITTED", blocks: [{ text: "시우는 출입구를 바라봤다." }], metrics: {} };
    sc.runtime.sceneContinuity.lastText = turn.blocks[0].text;
    const v1 = api.prepareNextTurnNarrativeCapsule(sc, turn, "", turn.blocks[0].text);
    const ready = api.scheduleLiteraryCapsuleV2(sc, turn, turn.blocks[0].text);
    assert.equal(ready.schema, "NEXT_TURN_CONTINUITY_CAPSULE_V3");
    assert.equal(api.cancelLiteraryCapsuleJob("next_turn_started"), false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sc.runtime.nextTurnContinuityCapsule.schema, "NEXT_TURN_CONTINUITY_CAPSULE_V3");
    assert.equal(sc.runtime.literaryCapsuleJob.source, "deterministic_no_extra_api");
    assert.equal(api.capsuleIsCurrent(sc, v1), true);
  });

  await t.test("Chronos Core package story is a distinct selectable ten-event chain", () => {
    const cortex = api.storyDefault("relay_parcel_10");
    const chronos = api.storyDefault("chronos_core_10");
    assert.equal(api.eventSequence(cortex.event).length, 10);
    assert.equal(api.eventSequence(chronos.event).length, 10);
    assert.equal(api.STORY_DEFS.chronos_core_10.label, "크로노스 코어 · 원작 연속 10사건");
    assert.equal(chronos.runtime.sourcePackage.title, "크로노스 코어");
    assert.equal(chronos.runtime.sourcePackage.packageVersion, "1.5");
    assert.equal(chronos.timeLoop, true);
    assert.deepEqual(
      api.eventSequence(chronos.event).map((event) => event.id),
      ["CC_CH01_NOTE_ONE", "CC_CH02_SILVER_KEY", "CC_CH03_FIRST_RESET", "CC_CH04_NOTE_THREE", "CC_CH05_DEJA_VU", "CC_CH06_LOOP_CONFIRMED", "SH_CH07_TELL_TRUTH", "SH_CH08_SCIENTIFIC_DISCOVERY", "SH_CH09_WAREHOUSE", "SH_CH10_CIPHER_ALLIANCE"],
    );
    assert.deepEqual(
      [api.eventSequence(chronos.event)[0].title, api.eventSequence(chronos.event).at(-1).title],
      ["정체불명의 쪽지", "암호로 되찾은 동맹"],
    );
    assert.notEqual(cortex.event.id, chronos.event.id);
  });

  await t.test("Chronos uses an absolute ten-day schedule and seals future cast before each opening", () => {
    const chronos = api.storyDefault("chronos_core_10");
    const events = api.eventSequence(chronos.event);
    assert.deepEqual(events.map((event) => event.storyDay), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(events.every((event) => event.startTick === event.storyDay * 86400 + api.parseClock(event.startTime)));

    chronos.event = events[1];
    chronos.world.day = 0;
    chronos.world.time = "22:30:00";
    api._settings().storyId = "chronos_core_10";
    api._setScenario(chronos);
    assert.equal(api.eventWaiting(api._scenario().event, api._scenario().world), true);
    assert.ok(!api.visibleCast(api._scenario()).some((character) => /다윤|설아/u.test(character.name)));
    assert.ok(chronos.characters.some((character) => character.name === "김다윤"));
    assert.ok(chronos.characters.some((character) => character.name === "윤설아"));
    chronos.world.day = 1;
    chronos.world.time = "07:30:00";
    chronos.world.location = "해온고등학교 · 교실";
    chronos.scene.presentCharacterIds = [...events[1].presentCharacterIds];
    api.refreshDynamicDisclosure(chronos);
    assert.ok(api.visibleCast(chronos).some((character) => character.name === "김다윤"));
    assert.ok(api.visibleCast(chronos).some((character) => character.name === "윤설아"));

    api._settings().storyId = "relay_parcel_10";
    api._setScenario(api.storyDefault("relay_parcel_10"));
  });

  await t.test("location parsing accepts explicit travel but rejects object and metaphor false positives", () => {
    const sc = api.storyDefault("chronos_core_10");
    api._settings().storyId = "chronos_core_10";
    api._setScenario(sc);
    const txn = api.buildTxn("주변을 살핀다", sc, 0);
    txn.start.location = "해온고등학교 · 계단참";
    txn.endStatePatch.location = txn.start.location;
    for (const prose of [
      "은서는 가방을 사물함 안으로 밀어 넣었다.",
      "서현은 자기 자리로 가방을 내려놓았다.",
      "사라진 건 종이뿐인데, 왜 방 안은 더 좁아진 것 같았다.",
      "교실 이야기를 하며 계단 창가 쪽으로 한 걸음 물러섰다.",
    ]) {
      assert.equal(api.sceneLocationFromProse(prose, txn), "해온고등학교 · 계단참", prose);
    }
    assert.equal(api.sceneLocationFromProse("두 사람은 계단을 내려와 교실에 들어갔다.", txn), "해온고등학교 · 교실");

    txn.start.location = "북부 성채 · 성문";
    txn.endStatePatch.location = txn.start.location;
    assert.equal(api.sceneLocationFromProse("기사는 성문을 지나 성 내부로 들어갔다.", txn), "성 내부");
    assert.equal(api.sceneLocationFromProse("그는 복도를 지나 회의실에 도착했다.", txn), "북부 성채 · 회의실");

    api._settings().storyId = "relay_parcel_10";
    api._setScenario(api.storyDefault("relay_parcel_10"));
  });

  await t.test("portable-item and action-frame rules preserve semantic roles across genres", () => {
    assert.equal(api.directPortableObject("손을 주머니 안에 넣었다."), "");
    assert.equal(api.directPortableObject("가방 끈을 움켜쥐었다."), "");
    assert.equal(api.validInventoryObject("책상"), "");
    assert.equal(api.directPortableObject("기사는 제단 위 봉인석을 주워 들었다."), "제단 위 봉인석");

    const frames = api.parseActionFramesV173("사물함에 가방에서 꺼낸 잡동사니들을 넣고 바로 닫는다.");
    assert.deepEqual(frames, [{
      lemma: "move_item",
      theme: "잡동사니",
      source: "가방",
      destination: "사물함",
      completion: "REQUESTED",
    }]);
    const turn = {
      input: "사물함에 가방에서 꺼낸 잡동사니들을 넣고 바로 닫는다.",
      blocks: [{ id: "wrong", text: "은서는 가방을 사물함 안으로 밀어 넣었다." }],
    };
    api._settings().storyId = "chronos_core_10";
    api._setScenario(api.storyDefault("chronos_core_10"));
    assert.equal(api.reconcileActionFramesV173(turn), 1);
    assert.match(turn.blocks[0].text, /가방에서 꺼낸 잡동사니를 사물함에 넣고/u);
    assert.doesNotMatch(turn.blocks[0].text, /가방을 사물함/u);

    api._settings().storyId = "relay_parcel_10";
    api._setScenario(api.storyDefault("relay_parcel_10"));
  });

  await t.test("the exact Cortex 1.7.2 ten-turn log replays into a validated portable Capsule v3", async () => {
    const replay = JSON.parse(await readFile(
      new URL("./fixtures/cortex-172-chronos-10turn.json", import.meta.url),
      "utf8",
    ));
    api._settings().storyId = "chronos_core_10";
    api._setScenario(api.storyDefault("chronos_core_10"));
    const snapshots = [];
    let lastTurn;
    let lastVisible = "";

    try {
      for (const [index, recorded] of replay.entries()) {
        const sc = api._scenario();
        api.refreshDynamicDisclosure(sc);
        const turn = {
          turn: index + 1,
          input: recorded.input,
          blocks: structuredClone(recorded.blocks),
          canonDeltas: [],
        };
        api.dropRepeatedBlocks(turn);
        const visible = turn.blocks.map((block) => block.text).join("\n\n");
        const txn = api.applyOutcomeEnvelope(
          api.applyEventStartGate(
            api.applyBeatContract(api.buildTxn(recorded.input, sc, index), sc),
            sc,
          ),
          sc,
        );
        turn.txn = txn;
        const timeline = api.resolveBlockTimeline(turn.blocks, txn);
        turn.timeline = timeline;
        txn.endStatePatch.worldTime = timeline.endTime;
        const ending = api.evaluateEnding(visible, txn);
        txn.endStatePatch.location = api.sceneLocationFromProse(visible, txn);
        const candidates = api.collectCanonCandidates(sc, "", {
          input: recorded.input,
          publicText: visible,
          blocks: turn.blocks,
          turn: index + 1,
          eventId: sc.event.id,
          worldTime: txn.endStatePatch.worldTime,
          location: txn.endStatePatch.location,
        }).filter((candidate) => api.canonCandidateGrounded(candidate, txn));
        const applied = api.applyCanonDelta(sc, candidates, {
          input: recorded.input,
          publicText: visible,
          blocks: turn.blocks,
          turn: index + 1,
          eventId: sc.event.id,
          worldTime: txn.endStatePatch.worldTime,
          location: txn.endStatePatch.location,
        });
        turn.canonDeltas = applied.accepted;
        sc.world.time = txn.endStatePatch.worldTime;
        sc.world.location = txn.endStatePatch.location;
        api.updateSceneContinuity(sc, turn, txn, visible);
        api.advanceEvent(txn, ending, visible);
        snapshots.push({
          location: sc.world.location,
          day: sc.world.day,
          cast: api.visibleCast(sc).map((character) => character.name),
          visible,
          blocks: structuredClone(turn.blocks),
        });
        lastTurn = turn;
        lastVisible = visible;
      }

      assert.equal(snapshots.length, 10);
      assert.ok(snapshots.every((snapshot) => api.trustedLocationV173(snapshot.location)));
      assert.ok(snapshots.every((snapshot) => !/(?:^| · )(?:가방|자리로 가방|왜 방)(?:$| · )/u.test(snapshot.location)));
      assert.match(snapshots[1].location, /계단$/u);
      for (const index of [2, 3, 4]) assert.match(snapshots[index].location, /계단참$/u);
      for (const index of [5, 6, 7, 8, 9]) assert.match(snapshots[index].location, /교실$/u);
      assert.match(snapshots[1].blocks[0].text, /가방에서 꺼낸 잡동사니를 사물함에 넣고/u);
      assert.doesNotMatch(snapshots[1].blocks[0].text, /가방을 사물함/u);
      assert.ok(snapshots.every((snapshot) => !/<q\b|<\/q>/iu.test(snapshot.visible)));
      assert.doesNotMatch(snapshots.at(-1).visible, /대상을 힘껏 내려쳤다|표면이 갈라지고 떨어져 나온 조각/u);
      if (snapshots.at(-1).cast.some((name) => /다윤|설아/u.test(name))) {
        assert.equal(api._scenario().event.id, "CC_CH02_SILVER_KEY");
        assert.ok(api.absoluteTickV176(api._scenario().world.day, api._scenario().world.time)
          >= api.eventStartTick(api._scenario().event, api._scenario().world));
      }
      assert.ok(!api._scenario().scene.presentCharacterIds.some((id) => /dayun|seola/u.test(id)));

      const finalScenario = api._scenario();
      const storyState = finalScenario.runtime.storyState;
      assert.ok(!storyState.inventory.some((entry) => /손|가방 끈|책상|단상/u.test(entry.targetName)));
      assert.ok(storyState.destroyed.some((entry) => entry.targetName === "쪽지"));
      assert.equal(storyState.pendingConsequences.length, 0);
      if (finalScenario.event.id === "CC_CH01_NOTE_ONE") {
        assert.ok(api.futureActorTermsV173(finalScenario).some((name) => /다윤|설아/u.test(name)));
      } else {
        assert.equal(finalScenario.event.id, "CC_CH02_SILVER_KEY");
        assert.ok(api.absoluteTickV176(finalScenario.world.day, finalScenario.world.time)
          >= api.eventStartTick(finalScenario.event, finalScenario.world));
      }

      const capsule = api.createContinuityCapsuleV3(finalScenario, lastTurn, {}, lastVisible);
      const check = api.validateContinuityCapsuleV3(finalScenario, capsule);
      assert.deepEqual(check, { valid: true, errors: [] });
      assert.equal(capsule.payload.immediateScene.at(-1).match(/[.!?。！？”"'’」』)\]]/u)?.[0] != null, true);
      assert.doesNotMatch(capsule.payload.immediateScene, /<q\b|<\/q>|대상을 힘껏 내려쳤다/u);
      if (finalScenario.event.id === "CC_CH01_NOTE_ONE") {
        assert.doesNotMatch(capsule.payload.immediateScene, /다윤|설아/u);
        assert.ok(!capsule.payload.characters.some((character) => /다윤|설아/u.test(character.name)));
      }
      const goals = capsule.payload.activeCharacterGoals.map((goal) => goal.goal).filter(Boolean);
      assert.equal(new Set(goals).size, goals.length);
      assert.ok(capsule.payload.nextScenePressure.length >= 1 && capsule.payload.nextScenePressure.length <= 3);
      assert.deepEqual(api.recursiveIntegrityV173(capsule), []);
      assert.equal(capsule.payload.continuityGraph.physical.inventory.length, 0);
      assert.equal(capsule.payload.continuityGraph.physical.destroyed[0].itemRef, api.publicEntityRef(finalScenario, "쪽지", "item"));

      const scheduled = api.scheduleLiteraryCapsuleV2(finalScenario, lastTurn, lastVisible);
      assert.equal(scheduled.schema, "NEXT_TURN_CONTINUITY_CAPSULE_V3");
      assert.equal(finalScenario.runtime.literaryCapsuleJob.source, "deterministic_no_extra_api");
      const diagnostic = api.safeDiagnosticValue(finalScenario, scheduled);
      assert.deepEqual(api.recursiveIntegrityV173(diagnostic), []);
      const exported = api.safeScenarioForExport(finalScenario);
      const restored = api.normalizeScenario(exported);
      assert.ok(restored.runtime.nextTurnContinuityCapsule, JSON.stringify({
        exportedWorld: exported.world,
        restoredWorld: restored.world,
        capsuleWorld: exported.runtime.nextTurnContinuityCapsule?.world,
        exportedCursor: exported.runtime.nextTurnContinuityCapsule?.eventCursor,
        restoredCursor: api.capsuleEventCursor(restored),
        exportedRevision: exported.runtime.nextTurnContinuityCapsule?.baseRevision,
        restoredRevision: restored.runtime.canonLedger?.revision,
      }));
      assert.equal(api.continuityCapsuleIsCurrent(restored, restored.runtime.nextTurnContinuityCapsule), true);
    } finally {
      api._settings().storyId = "relay_parcel_10";
      api._setScenario(api.storyDefault("relay_parcel_10"));
    }
  });

  await t.test("the exact Cortex 1.7.3 two-turn log preserves time, clue destruction, scene cast, and Capsule v3 truth", async () => {
    const replay = JSON.parse(await readFile(
      new URL("./fixtures/cortex-173-chronos-2turn.json", import.meta.url),
      "utf8",
    ));
    api._settings().storyId = "chronos_core_10";
    api._setScenario(api.storyDefault("chronos_core_10"));
    try {
      const sc = api._scenario();
      const first = replay.turns[0];
      const firstText = first.blocks.map((block) => block.text).join("\n\n");
      const firstTxn = api.buildTxn(first.input, sc, 0);
      assert.equal(firstTxn.intent.requestedUntilSec, api.parseClock("19:00:00"));
      assert.equal(firstTxn.endStatePatch.worldTime, "19:00:00");
      assert.equal(firstTxn.guards.forbidTimeAfter, "19:00:00");
      assert.equal(firstTxn.corridor.timeMonotonic, true);
      assert.equal(api.beatSatisfiedV174(sc.event, firstText), false, "등교하지 않은 복합 비트를 부분 단어 일치로 완료하면 안 된다");
      assert.equal(api.poweredOffDeviceIssueV174(first.input, firstText, firstTxn), "PHYSICAL_STATE_CONTRADICTION:POWERED_OFF_DEVICE");
      assert.ok(!api.visibleCast(sc).some((character) => character.name === "백서현"), "집에 도착 근거가 없는 친구를 현재 인물로 열면 안 된다");

      const firstCandidates = api.collectCanonCandidates(sc, "", {
        input: first.input,
        publicText: firstText,
        blocks: first.blocks,
        turn: 1,
        eventId: sc.event.id,
        worldTime: "19:00:00",
        location: "집",
      });
      assert.ok(firstCandidates.some((candidate) => candidate.kind === "inventory_add" && candidate.targetName === "쪽지"));
      const firstApplied = api.applyCanonDelta(sc, firstCandidates, {
        input: first.input,
        publicText: firstText,
        blocks: first.blocks,
        turn: 1,
        eventId: sc.event.id,
        worldTime: "19:00:00",
        location: "집",
      });
      assert.ok(firstApplied.storyState.inventory.some((entry) => entry.targetName === "쪽지"));
      sc.world.time = "19:00:00";
      sc.world.location = "집";
      api.updateSceneContinuity(sc, { input: first.input, blocks: first.blocks }, firstTxn, firstText);

      const second = replay.turns[1];
      const secondText = second.blocks.map((block) => block.text).join("\n\n");
      const secondTxn = api.buildTxn(second.input, sc, 1);
      assert.deepEqual(secondTxn.intent.actionFrames.filter((frame) => frame.lemma === "destroy").map((frame) => frame.theme), ["쪽지"]);
      assert.equal(secondTxn.absorptionPlan.required, true);
      assert.equal(secondTxn.absorptionPlan.strategy, "consequence_preserving");
      assert.equal(secondTxn.endStatePatch.worldTime, "19:30:00", "낮잠은 수십 초가 아니라 최소 장면 시간을 가져야 한다");
      assert.equal(api.completedDestructionV174("쪽지", secondText), true);
      assert.ok(!api.actionRealizationIssues(second.input, secondTxn, secondText).includes("INPUT_ACTION_MISSING:DESTRUCTION"));

      const secondCandidates = api.collectCanonCandidates(sc, "", {
        input: second.input,
        publicText: secondText,
        blocks: second.blocks,
        turn: 2,
        eventId: sc.event.id,
        worldTime: "19:30:00",
        location: "집",
      });
      const secondApplied = api.applyCanonDelta(sc, secondCandidates, {
        input: second.input,
        publicText: secondText,
        blocks: second.blocks,
        turn: 2,
        eventId: sc.event.id,
        worldTime: "19:30:00",
        location: "집",
      });
      assert.ok(secondApplied.storyState.destroyed.some((entry) => entry.targetName === "쪽지"));
      assert.ok(!secondApplied.storyState.inventory.some((entry) => entry.targetName === "쪽지"));
      sc.world.time = "19:30:00";
      sc.world.location = "집";
      const committedTurn = { turn: 2, input: second.input, blocks: structuredClone(second.blocks), canonDeltas: secondApplied.accepted };
      api.reconcileScenePresence(sc, committedTurn, secondText, "집");
      api.updateSceneContinuity(sc, committedTurn, secondTxn, secondText);
      const capsule = api.createContinuityCapsuleV3(sc, committedTurn, {}, secondText);
      assert.deepEqual(api.validateContinuityCapsuleV3(sc, capsule), { valid: true, errors: [] });
      assert.notEqual(capsule.payload.lastCriticalProseTail, capsule.payload.immediateScene);
      assert.ok(capsule.payload.lastCriticalProseTail.length < capsule.payload.immediateScene.length);
      assert.ok(!capsule.payload.characters.some((character) => character.name === "백서현"));
      assert.ok(!capsule.payload.continuityGraph.motifs.some((motif) => /^[”"'’」』)\]]/u.test(motif.statement)));
    } finally {
      api._settings().storyId = "relay_parcel_10";
      api._setScenario(api.storyDefault("relay_parcel_10"));
    }
  });

  await t.test("the two stories keep independent world state under one latest Cortex engine", () => {
    api._setScenario(api.storyDefault("relay_parcel_10"));
    api._scenario().world.location = "Relay 상태 표식";
    assert.equal(api.switchStory("chronos_core_10"), true);
    assert.equal(api._story(), "chronos_core_10");
    api._scenario().world.location = "Chronos 상태 표식";
    assert.equal(api.switchStory("relay_parcel_10"), true);
    assert.equal(api._scenario().world.location, "Relay 상태 표식");
    assert.equal(api.switchStory("chronos_core_10"), true);
    assert.equal(api._scenario().world.location, "Chronos 상태 표식");
  });

  await t.test("v1.7.3 ignores stores older than the immediately previous Cortex revision", () => {
    const staleWindow = {};
    const staleStorage = {
      getItem(key) {
        if (key === "dancheong-cortex-lab-v140") {
          return JSON.stringify({
            engine: { id: "cortex", version: "1.4.0" },
            scenario: {
              title: "도착하지 않은 택배",
              protagonist: { id: "lead", name: "도윤" },
              world: { time: "15:46", location: "도서관" },
              event: { id: "legacy-only", title: "남은 사건 하나", startTime: "15:30", endTime: "15:50" },
            },
          });
        }
        return null;
      },
      setItem() {},
      removeItem() {},
    };
    new Function("document", "window", "localStorage", script)(document, staleWindow, staleStorage);
    assert.equal(staleWindow.__DANCHEONG_CORTEX_TEST__.eventSequence(staleWindow.__DANCHEONG_CORTEX_TEST__._scenario().event).length, 10);
  });

  await t.test("ten Cortex canon events expose beats, requirements, and sealed history", () => {
    assert.equal(api.eventSequence(builtIn.event).length, 10);
    assert.deepEqual(
      api.eventSequence(builtIn.event).map((event) => event.title),
      ["도서관의 오후", "도착하지 않은 택배", "봉투 속 황동 열쇠", "지하 방공호의 문", "멈춘 벽시계", "목소리 없는 녹음", "옥상 안테나", "비어 있는 사진", "서촌의 정전", "돌아온 이름"],
    );
    assert.equal(builtIn.event.beats.length, 2);
    assert.equal(builtIn.event.nextEvent.beats.length, 3);
    assert.equal(builtIn.event.nextEvent.nextEvent.beats.length, 3);

    api._setScenario({
      title: "봉인 시험",
      protagonist: { id: "lead", name: "도윤" },
      world: { day: 0, time: "10:00", location: "도서관" },
      event: {
        id: "parcel",
        title: "소포 수령",
        startTime: "10:00",
        endTime: "10:10",
        beats: [
          { id: "notice", title: "알림", goal: "택배 알림을 확인한다", endLocation: "도서관" },
          { id: "obtain", title: "수령", goal: "소포를 수령해 소지한다", endLocation: "무인택배함 앞" },
        ],
        requiredFunctions: [{ description: "소포를 수령해 소지한다", aliases: ["소포를 가방에 넣는다"] }],
        nextEvent: {
          id: "note",
          title: "봉투 속 기록",
          startTime: "10:10",
          endTime: "10:20",
          beats: [{ id: "open", title: "개봉", goal: "봉투를 연다" }],
        },
      },
    });
    let sc = api._scenario();
    const first = api.applyBeatContract(api.buildTxn("택배 알림을 확인한다", sc, 0), sc);
    assert.equal(first.eventPatch.advanceBeatAtCommit, true);
    assert.doesNotMatch(first.expectedEffects.join(" "), /소포를 수령해 소지/u, "the first beat must not pre-write the final beat");
    api.advanceEvent(first, { status: "NOT_DUE", missing: [], evidence: [] }, "도윤은 택배 알림을 확인했다.");
    sc = api._scenario();
    sc.world.time = first.endStatePatch.worldTime;
    assert.equal(sc.event.activeBeatIndex, 1);

    const final = api.applyBeatContract(api.buildTxn("소포를 가방에 넣는다", sc, 1), sc);
    const ending = api.evaluateEnding("도윤은 소포를 꺼내 가방에 넣어 소지했다.", final);
    assert.match(ending.status, /^PASS_/u);
    api.advanceEvent(final, ending, "도윤은 소포를 꺼내 가방에 넣어 소지했다.");
    sc = api._scenario();
    assert.equal(sc.runtime.eventLedger.sealed[0].title, "소포 수령");
    assert.match(sc.runtime.eventLedger.sealed[0].sealReason, /소포를 수령해 소지/u);
    assert.equal(sc.event.title, "봉투 속 기록");
  });

  await t.test("natural recognition closes the event and only one temporary closure beat can exist", () => {
    assert.equal(
      api.slotSatisfied(
        { description: "무인택배함의 존재가 주인공에게 분명히 인식된다" },
        "한시우는 결국 무인택배함의 존재를 똑똑히 확인한 뒤 번호 패드 위에 손을 올렸다.",
      ),
      "ADAPTED",
    );

    api._setScenario({
      title: "임시 비트 상한",
      protagonist: { id: "lead", name: "도윤" },
      world: { day: 0, time: "11:00", location: "도서관 창가" },
      event: {
        id: "closure-cap",
        title: "확인되지 않은 상자",
        startTime: "11:00",
        endTime: "11:05",
        beats: [{ id: "last", title: "마지막", goal: "상자를 확인한다" }],
        requiredFunctions: ["황동 열쇠를 확보한다"],
      },
    });
    let sc = api._scenario();
    const firstAttempt = api.applyBeatContract(api.buildTxn("상자를 열어 내부를 확인한다", sc, 0), sc);
    api.advanceEvent(firstAttempt, { status: "EXTEND", missing: ["황동 열쇠를 확보한다"], evidence: [] }, "도윤은 상자를 열어 내부를 확인했다.");
    sc = api._scenario();
    assert.equal(sc.event.beats.filter((beat) => beat.temporary).length, 1);
    sc.world.time = firstAttempt.endStatePatch.worldTime;
    const retry = api.applyBeatContract(api.buildTxn("주변을 살핀다", sc, 1), sc);
    const retryEnding = { status: "EXTEND", missing: ["황동 열쇠를 확보한다"], evidence: [] };
    const endBeforeBlockedRetry = sc.event.endTime;
    api.advanceEvent(retry, retryEnding, "도윤은 주변을 살폈다.");
    assert.equal(api._scenario().event.beats.filter((beat) => beat.temporary).length, 1);
    assert.equal(retry.eventPatch.beatEvidenceRejected, true);
    assert.equal(retryEnding.retryRequired, undefined);
    assert.equal(retryEnding.status, "EXTEND");
    assert.ok(api.parseClock(api._scenario().event.endTime) >= api.parseClock(endBeforeBlockedRetry));
    assert.equal(api.closureRetryFailure({ status: "EXTEND", missing: ["황동 열쇠"] }), null);
  });

  await t.test("v1.7.1 Chronos log failures replay as genre-independent invariants", () => {
    const chronos = api.storyDefault("chronos_core_10");
    api._setScenario(chronos);

    const firstTurn = [
      { id: "r1", text: "휴대전화에는 6시 30분이 떠 있었다." },
      { id: "r2", text: "자전거를 세차게 밟아 교문 안으로 들어갔다. 시계탑의 분침은 7시 48분을 가리켰다." },
    ];
    const timeline = api.resolveBlockTimeline(firstTurn, {
      start: { time: "06:30:00", location: "박은서의 방" },
      intent: { requestedUntilSec: null },
      endStatePatch: { worldTime: "06:31:00", location: "박은서의 방" },
      guards: { forbidTimeAfter: "22:30:00" },
    });
    assert.equal(timeline.endTime, "07:48:00");
    assert.equal(timeline.source, "prose_explicit_clock");
    assert.match(
      api.sceneLocationFromProse(firstTurn.map((block) => block.text).join(" "), {
        start: { location: "박은서의 방" },
      }),
      /교문/u,
    );

    assert.ok(api.slotSatisfied(
      { description: "첫 쪽지를 발견한다" },
      "사물함 문을 열자 접힌 종이가 떨어졌다. 은서는 주워 들어 ‘넌 정말 아무것도 기억이 안 나? 그럼 기다려 봐.’라는 첫 줄을 읽었다.",
    ));

    const quantityTurn = {
      input: "자전거로 공중제비를 두 바퀴 돈다.",
      blocks: [{ text: "자전거와 몸이 한 바퀴, 그리고 반 바퀴 뒤집혔다." }],
    };
    assert.equal(api.reconcileActionQuantities(quantityTurn), 1);
    assert.match(quantityTurn.blocks[0].text, /두 바퀴/u);
    assert.doesNotMatch(quantityTurn.blocks[0].text, /반 바퀴/u);

    assert.equal(api.directPortableObject("책상 위 가방을 움켜쥐었다."), "");
    assert.equal(api.validInventoryObject("책상"), "");

    const synthetic = api.normalizeScenario({
      title: "장르 독립 현장",
      protagonist: { id: "lead", name: "도윤" },
      characters: [
        { id: "onsite", surfaceName: "세라", present: true },
        { id: "away", surfaceName: "한서", present: false },
      ],
      scene: { presentCharacterIds: ["lead", "onsite"] },
      world: { time: "09:00", location: "연구실" },
      event: { id: "generic", title: "현장 확인", startTime: "09:00", endTime: "10:00", requiredFunctions: [] },
    });
    api._setScenario(synthetic);
    const genericTxn = api.buildTxn("장치를 확인한다", synthetic, 0);
    assert.deepEqual(
      api.outOfSceneDialogueIssues(
        [{ kind: "narration", text: "한서가 뒤에서 말했다. “그 장치를 건드리지 마.”" }],
        genericTxn,
      ),
      ["OUT_OF_SCENE_NAMED_DIALOGUE:한서"],
    );

    synthetic.event.nextBeat = "남은 종결 기능을 정사 안에서 자연스럽게 충족한다: 장치를 확인한다";
    assert.doesNotMatch(api.publicWriterContext(synthetic).event.nextBeat, /남은 종결 기능|정사 안에서/u);
    assert.equal(api.narrativeCapsuleText(synthetic.event.nextBeat), "");

    const turn = { status: "COMMITTED", blocks: [{ text: "도윤은 장치의 푸른 빛을 확인했다." }], metrics: {} };
    synthetic.runtime.sceneContinuity.lastText = turn.blocks[0].text;
    const capsule = api.scheduleLiteraryCapsuleV2(synthetic, turn, turn.blocks[0].text);
    assert.equal(capsule.schema, "NEXT_TURN_CONTINUITY_CAPSULE_V3");
    assert.equal(synthetic.runtime.literaryCapsuleJob.source, "deterministic_no_extra_api");
  });

  await t.test("an explicit until-time crosses one waiting gap in a single server time contract", () => {
    api._setScenario({
      title: "사건 전 대기",
      protagonist: { id: "lead", name: "도윤" },
      world: { day: 0, time: "15:33:00", location: "도서관" },
      event: {
        id: "future-event",
        title: "공개 전 사건",
        startTime: "15:45:00",
        endTime: "16:05:00",
        beats: [
          { id: "one", goal: "첫 단서를 확인한다" },
          { id: "two", goal: "두 번째 단서를 확인한다" },
          { id: "three", goal: "사건을 마무리한다" },
        ],
      },
    });
    const waiting = api._scenario();
    const timed = api.applyOutcomeEnvelope(api.applyEventStartGate(api.applyBeatContract(api.buildTxn("15시 45분까지 자료를 읽으며 공부한다.", waiting, 0), waiting), waiting));
    assert.equal(timed.eventWindow.requestReachesStart, true);
    assert.equal(timed.endStatePatch.worldTime, "15:45:00");
    const blocks = [{ id: "wait", text: "도윤은 자료를 읽고 노트에 정리하며 공부했다.", elapsedSec: 30 }];
    const timeline = api.resolveBlockTimeline(blocks, timed);
    assert.equal(timeline.source, "server_event_start_bridge");
    assert.equal(timeline.endTime, "15:45:00");
  });

  await t.test("super-actions and natural equivalents satisfy semantic ending functions", () => {
    assert.equal(
      api.slotSatisfied(
        "무인택배함의 존재가 주인공에게 분명히 인식된다",
        "도윤은 보관함 번호를 누르고 문을 열어 안쪽 소포를 꺼냈다.",
      ),
      "ADAPTED",
    );
    assert.equal(
      api.slotSatisfied(
        "집 안의 바닥이 꺼져 방공호에 도착한다",
        "주차장 바닥이 무너지며 도윤은 오래된 지하공간 안으로 굴러 들어갔다.",
      ),
      "ADAPTED",
    );
    assert.equal(
      api.slotSatisfied("퇴장", "나디아는 빗속 골목 너머로 멀어졌다."),
      "ADAPTED",
    );
  });

  await t.test("violence, romance, destruction, and ordinary actions must be realized in prose", () => {
    const actionScenario = api.normalizeScenario({
      title: "행동 충실도",
      protagonist: { id: "lead", name: "도윤" },
      world: { day: 0, time: "12:00:00", location: "교실" },
      event: { id: "action", title: "선택", startTime: "12:00:00", endTime: "12:10:00", locationLocked: false },
    });
    const violent = api.buildTxn("의자를 집어 들고 상대를 공격한 뒤 출구로 도망간다.", actionScenario, 0);
    const missing = api.actionRealizationIssues(violent.intent.raw, violent, "도윤은 잠시 생각에 잠겼다.");
    assert.ok(missing.includes("INPUT_ACTION_MISSING:VIOLENCE"));
    assert.ok(missing.includes("INPUT_ACTION_MISSING:ESCAPE"));
    const realized = `${api.actionRealizationPatch(violent, missing)}`;
    assert.deepEqual(api.actionRealizationIssues(violent.intent.raw, violent, realized), []);
    const romance = api.buildTxn("학생에게 말을 걸고 같이 저녁을 먹자고 꼬신다.", actionScenario, 1);
    const romanceIssues = api.actionRealizationIssues(romance.intent.raw, romance, "도윤은 창밖을 보았다.");
    assert.ok(romanceIssues.includes("INPUT_ACTION_MISSING:ROMANCE"));
    assert.deepEqual(api.actionRealizationIssues(romance.intent.raw, romance, api.actionRealizationPatch(romance, romanceIssues)), []);
    assert.ok(api.parseIntent("기록지를 찢어 버린다.").facets.includes("DESTRUCTION"));

    const completed = api.applyOutcomeEnvelope(api.buildTxn(
      "사서의 얼굴을 해머로 강타해버린다. 봉투를 부숴버리고 현장에서 도망친다.",
      actionScenario,
      2,
    ));
    const resultIssues = api.explicitOutcomeIssues(completed, "도윤은 해머를 들어 올렸고 출구를 바라봤다.");
    assert.deepEqual(resultIssues.sort(), [
      "INPUT_RESULT_MISSING:DESTRUCTION_COMPLETE",
      "INPUT_RESULT_MISSING:ESCAPE_COMPLETE",
      "INPUT_RESULT_MISSING:VIOLENCE_IMPACT",
    ]);
    const resultPatch = api.actionRealizationPatch(completed, resultIssues);
    assert.deepEqual(api.explicitOutcomeIssues(completed, resultPatch), [], resultPatch);
  });

  await t.test("canon extraction rejects packaging parts and records the actual parcel", () => {
    const sc = api.normalizeScenario({
      title: "소포 원장",
      protagonist: { id: "lead", name: "도윤" },
      world: { time: "15:40:00", location: "보관함 앞" },
      event: { id: "parcel", title: "소포", startTime: "15:30:00", endTime: "15:45:00" },
    });
    const text = "도윤은 보관함을 열어 발신인 없는 소포를 꺼냈다. 포장 모서리를 확인한 뒤, 그 소포를 가방 안에 넣어 확실히 소지했다.";
    const facts = api.criticalSceneFacts(sc, { publicText: text });
    const targets = facts.filter((fact) => fact.kind === "inventory_add").map((fact) => fact.targetName);
    assert.ok(targets.includes("발신인 없는 소포") || targets.includes("소포"));
    assert.ok(!targets.some((target) => /포장 모서리/u.test(target)));
    assert.equal(api.validInventoryObject("포장 모서리"), "");
  });

  await t.test("only interrupted intentions enter the deferred ledger and fulfilled destinations resolve", () => {
    const sc = api.normalizeScenario({
      title: "보류 의도",
      protagonist: { id: "lead", name: "도윤" },
      world: { day: 0, time: "10:00:00", location: "도서관" },
      event: { id: "walk", title: "산책", startTime: "10:00:00", endTime: "10:20:00", locationLocked: false },
    });
    const accepted = api.buildTxn("카페로 간다.", sc, 0);
    assert.equal(accepted.intentDisposition, "accepted");
    assert.equal(accepted.intent.deferredGoal, null);
    sc.runtime.deferredIntents = [{ id: "old", goal: "카페에서 쉬기", action: "move", destination: "카페", createdAt: "09:50:00", status: "OPEN" }];
    sc.world.location = "카페";
    sc.world.time = accepted.endStatePatch.worldTime;
    api.updateSceneContinuity(sc, { blocks: [{ text: "도윤은 카페에 도착해 문을 열었다." }] }, accepted, "도윤은 카페에 도착해 문을 열었다.");
    assert.equal(api.publicSceneContinuity(sc).openDeferredIntents.length, 0);
  });

  await t.test("repair deduplication is followed by a clean repetition audit", () => {
    const sc = api.normalizeScenario({
      title: "반복 제거",
      protagonist: { id: "lead", name: "도윤" },
      world: { time: "10:00:00", location: "도서관" },
      event: { id: "repeat", title: "반복", startTime: "10:00:00", endTime: "10:10:00" },
    });
    const txn = api.buildTxn("자료를 확인한다.", sc, 0);
    txn.prosePolicy = { minChars: 0, maxChars: 2000, minParagraphs: 0, maxParagraphs: 8 };
    const turn = { blocks: [
      { id: "one", beatId: "L1", text: "도윤은 낡은 자료를 펼쳐 첫 문장을 천천히 확인했다." },
      { id: "two", beatId: "L2", text: "도윤은 낡은 자료를 펼쳐 첫 문장을 천천히 확인했다. 다음 장에는 다른 필체가 남아 있었다." },
    ] };
    assert.ok(api.dropRepeatedBlocks(turn) >= 1);
    const text = turn.blocks.map((block) => block.text).join(" ");
    assert.ok(!api.qualityAudit(text, txn, turn.blocks).includes("REPETITION"));
  });

  await t.test("live B1-B5 absorption blocks are semantically reclassified instead of discarding valid prose", () => {
    const sc = api.normalizeScenario({
      title: "도서관의 오후",
      protagonist: { id: "lead", name: "한시우", drives: ["외할머니의 흔적을 확인한다"] },
      world: { day: 0, time: "15:27:00", location: "도서관 창가" },
      event: {
        id: "library",
        title: "도서관의 오후",
        startTime: "15:20:00",
        endTime: "15:30:00",
        nextBeat: "무인택배함과 관련된 정사 자극을 자연스럽게 감지한다.",
        stakes: ["외할머니의 실종과 이어질 단서를 놓칠 수 있다"],
        absorptionAnchors: [{ type: "motive_recall", sourceId: "lead", fact: "무인택배함의 물품이 외할머니가 남긴 흔적일 수 있다", strength: 5 }],
        beats: [
          { id: "choice", goal: "입력 행동을 실행한다." },
          { id: "signal", goal: "무인택배함의 자극을 감지한다." },
        ],
      },
    });
    const input = "휴대전화 전원을 끄고 저녁까지 공부에 몰두한다.";
    const txn = api.applyOutcomeEnvelope(api.applyBeatContract(api.buildTxn(input, sc, 0), sc));
    txn.prosePolicy = { minChars: 0, maxChars: 4000, minParagraphs: 0, maxParagraphs: 8 };
    const blocks = [
      { id: "b1", beatId: "B1", kind: "narration", text: "한시우는 휴대전화 전원 버튼을 길게 눌러 종료하고 책을 펼쳤다." },
      { id: "b2", beatId: "B2", kind: "dialogue", text: "좋아. 오늘은 저녁까지 공부한다." },
      { id: "b3", beatId: "B3", kind: "narration", text: "하지만 복도에서 들려온 금속음과 외할머니의 흔적이 자꾸 의식에 걸렸다." },
      { id: "b4", beatId: "B4", kind: "narration", text: "그는 손을 움켜쥔 채 망설였지만 결국 행동의 순서를 바꾸기로 결정했다." },
      { id: "b5", beatId: "B5", kind: "narration", text: "책갈피를 끼우고 자리에서 일어나 무인택배함 쪽으로 걸음을 옮겼다." },
    ];
    const text = blocks.map((block) => block.text).join(" ");
    const issues = api.qualityAudit(text, txn, blocks);
    assert.deepEqual(issues.filter((issue) => issue.startsWith("ABSORPTION_BEAT_MISSING:")), []);
    assert.deepEqual([...new Set(blocks.flatMap((block) => block.causalRoles))].sort(), ["A1", "A2", "A3", "A4", "A5"]);

    const incomplete = [{ id: "only", beatId: "B1", kind: "narration", text: "한시우는 휴대전화 전원 버튼을 길게 눌러 종료했다." }];
    const incompleteIssues = api.qualityAudit(incomplete[0].text, txn, incomplete);
    assert.ok(incompleteIssues.includes("ABSORPTION_BEAT_MISSING:A2"));
    assert.ok(incompleteIssues.includes("ABSORPTION_BEAT_MISSING:A5"));
  });

  await t.test("an explicit move to the parcel locker updates the server-only scene location", () => {
    const sc = api._scenario();
    const txn = api.applyBeatContract(api.buildTxn("무인택배함으로 다가간다", sc, 2), sc);
    txn.start.location = "서울특별시 서촌 · 도서관 창가";
    txn.endStatePatch.location = txn.start.location;
    assert.equal(
      api.sceneLocationFromProse("도서관 밖으로 나온 도윤은 무인택배함 앞에 섰다.", txn),
      "서울특별시 서촌 · 도서관 앞 무인택배함",
    );
    api._setScenario(builtIn);
  });

  await t.test("story transport never streams CANON sidecars and rejects ungrounded entity memory", () => {
    const deltas = [];
    const guarded = api.storyEnvelope((event) => {
      if (event.type === "delta") deltas.push(event.text);
    });
    guarded.push('<STORY><N beat="L1">정상 본문이다.</N></STORY><CANON>{"deltas":[{"evidence":"누출"}]}</CANON>');
    guarded.finish();
    assert.equal(deltas.join(""), "정상 본문이다.");
    const txn = { intent: { unresolvedEntityMentions: ["히시리"] } };
    assert.equal(api.canonCandidateGrounded({
      kind: "pending_consequence",
      statement: "히시리의 주장은 나중에 확인해야 했다.",
      evidence: "히시리의 주장은 나중에 확인해야 했다.",
    }, txn), false);
    api._setScenario(builtIn);
  });

  const memoryScenario = api.normalizeScenario({
    title: "철문 뒤의 약속",
    genre: "현대 미스터리",
    protagonist: { id: "lead", name: "도윤" },
    characters: [{ id: "sera", surfaceName: "세라", present: true }],
    scene: { presentCharacterIds: ["lead", "sera"] },
    world: { time: "16:10", location: "도서관 지하 계단" },
    event: {
      id: "locked-door",
      title: "부서진 자물쇠",
      startTime: "16:00",
      endTime: "16:30",
      requiredFunctions: [],
    },
  });
  const publicSentences = [
    "도윤은 세라에게 내일 오후 다섯 시, 다시 여기서 만나자고 약속했다.",
    "세라는 고개를 끄덕였고, 도윤은 전보다 그녀를 믿어 보기로 했다.",
    "계단에서 미끄러진 도윤의 오른팔에는 길게 찰과상이 났다.",
    "도윤은 황동 열쇠를 가방에 넣었다.",
    "도윤은 낡은 우산을 경비원에게 건넸다.",
    "뒤에서 철문 자물쇠가 완전히 부서졌다.",
    "세라는 단서를 확인할 때까지 혼자 움직이지 않기로 결정했다.",
    "자물쇠가 망가진 탓에 누군가 안으로 들어오기 전에 관리실에 신고해야 했다.",
  ];
  const publicText = publicSentences.join(" ");
  const blocks = publicSentences.map((text, index) => ({ id: `memory-${index + 1}`, text }));
  const canonCandidates = [
    { kind: "promise", statement: publicSentences[0], evidence: publicSentences[0], subjectIds: ["lead", "sera"] },
    { kind: "relationship", statement: publicSentences[1], evidence: publicSentences[1], subjectIds: ["lead", "sera"], targetId: "sera" },
    { kind: "injury", statement: publicSentences[2], evidence: publicSentences[2], subjectId: "lead", targetName: "오른팔에는 길게 찰과상" },
    { kind: "inventory_add", statement: publicSentences[3], evidence: publicSentences[3], subjectId: "lead", targetName: "황동 열쇠" },
    { kind: "inventory_remove", statement: publicSentences[4], evidence: publicSentences[4], subjectId: "lead", targetName: "낡은 우산" },
    { kind: "destruction", statement: publicSentences[5], evidence: publicSentences[5], targetName: "철문 자물쇠" },
    { kind: "npc_decision", statement: publicSentences[6], evidence: publicSentences[6], subjectId: "sera" },
    { kind: "pending_consequence", statement: publicSentences[7], evidence: publicSentences[7] },
    { kind: "npc_decision", statement: "세라는 사실 범인이다.", evidence: "세라는 사실 범인이다.", subjectId: "sera" },
  ];
  const canonContext = {
    publicText,
    blocks,
    turn: 3,
    eventId: memoryScenario.event.id,
    worldTime: "16:12:00",
    location: memoryScenario.world.location,
  };
  const applied = api.applyCanonDelta(memoryScenario, canonCandidates, canonContext);
  assert.deepEqual(
    new Set(applied.accepted.map((entry) => entry.kind)),
    new Set(["promise", "relationship", "injury", "inventory_add", "inventory_remove", "destruction", "npc_decision", "pending_consequence"]),
  );
  assert.equal(applied.rejected.length, 1);
  assert.deepEqual(applied.storyState.inventory.map((item) => item.targetName), ["황동 열쇠"]);
  assert.equal(applied.storyState.conditions.length, 1);
  assert.equal(applied.storyState.promises[0].status, "OPEN");
  assert.equal(applied.storyState.destroyed.length, 1);
  assert.equal(applied.storyState.npcDecisions.length, 1);
  assert.equal(applied.storyState.pendingConsequences.length, 1);
  assert.ok(applied.accepted.every((entry) => entry.evidence.hash && entry.evidence.blockIds.length === 1));

  const ledgerSnapshot = structuredClone(memoryScenario.runtime.canonLedger);
  const reapplied = api.applyCanonDelta(memoryScenario, canonCandidates, canonContext);
  assert.equal(reapplied.accepted.length, 0);
  assert.deepEqual(memoryScenario.runtime.canonLedger, ledgerSnapshot);
  assert.equal(
    api.applyCanonDelta(memoryScenario, [{
      kind: "promise",
      statement: "세라는 도윤과 결혼하기로 했다.",
      evidence: "세라는 도윤과 결혼하기로 했다.",
      subjectIds: ["lead", "sera"],
    }], { ...canonContext, publicText: "세라는 아무 대답도 하지 않았다.", blocks: [] }).accepted.length,
    0,
  );

  const capsuleA = api.selectCanonCapsule(memoryScenario, "세라와 약속한 장소에서 황동 열쇠를 확인한다");
  const capsuleB = api.selectCanonCapsule(memoryScenario, "세라와 약속한 장소에서 황동 열쇠를 확인한다");
  assert.ok(!(capsuleA instanceof Promise));
  assert.deepEqual(capsuleA.entries, capsuleB.entries);
  assert.ok(capsuleA.entries.length >= 5);
  assert.ok(capsuleA.chars <= 3200);
  const memoryTxn = api.buildTxn("세라와 황동 열쇠를 확인한다", memoryScenario, 4);
  assert.ok(!(memoryTxn instanceof Promise));
  assert.deepEqual(memoryTxn.writerContext.canonCapsule, api.selectCanonCapsule(memoryScenario, "세라와 황동 열쇠를 확인한다").entries);
  assert.equal(memoryTxn.memory.selected, memoryTxn.writerContext.canonCapsule.length);
  assert.ok(memoryTxn.memory.chars <= 2600);
  assert.match(api.writerInput("열쇠를 확인한다", memoryTxn), /canonCapsule/u);
  assert.deepEqual(
    api.parseCanonSidecar(`<STORY><N beat="L1">${publicSentences[3]}</N></STORY><CANON>{"deltas":[{"kind":"inventory_add","statement":"${publicSentences[3]}","evidence":"${publicSentences[3]}"}]}</CANON>`).map((item) => item.kind),
    ["inventory_add"],
  );

  const genreFixtures = [
    {
      title: "룬 성문의 밤",
      genre: "정통 판타지",
      protagonist: { id: "arin", name: "아린" },
      characters: [{ id: "mira", surfaceName: "미라", present: true }],
      text: "아린은 부서진 룬 방패를 챙겨 가방에 넣었다. 왼팔에는 검상이 남아 있었다.",
      candidates: [
        { kind: "inventory_add", statement: "아린은 부서진 룬 방패를 챙겨 가방에 넣었다.", evidence: "아린은 부서진 룬 방패를 챙겨 가방에 넣었다.", subjectId: "arin", targetName: "부서진 룬 방패" },
        { kind: "injury", statement: "왼팔에는 검상이 남아 있었다.", evidence: "왼팔에는 검상이 남아 있었다.", subjectId: "arin", targetName: "왼팔에는 검상" },
      ],
      expected: /룬 방패|검상/u,
    },
    {
      title: "오로라-7 격리구역",
      genre: "SF 서바이벌",
      protagonist: { id: "rio", name: "리오" },
      characters: [{ id: "aurora", surfaceName: "오로라-7", present: true }],
      text: "리오는 산소 카트리지를 가방에 넣었다. 에어록 제어판이 완전히 망가졌다.",
      candidates: [
        { kind: "inventory_add", statement: "리오는 산소 카트리지를 가방에 넣었다.", evidence: "리오는 산소 카트리지를 가방에 넣었다.", subjectId: "rio", targetName: "산소 카트리지" },
        { kind: "destruction", statement: "에어록 제어판이 완전히 망가졌다.", evidence: "에어록 제어판이 완전히 망가졌다.", targetName: "에어록 제어판" },
      ],
      expected: /산소 카트리지|에어록/u,
    },
  ];
  for (const fixture of genreFixtures) {
    const genreScenario = api.normalizeScenario({
      title: fixture.title,
      genre: fixture.genre,
      protagonist: fixture.protagonist,
      characters: fixture.characters,
      scene: { presentCharacterIds: [fixture.protagonist.id, fixture.characters[0].id] },
      world: { time: "20:00", location: fixture.title },
      event: { id: "genre-event", title: fixture.title, startTime: "20:00", endTime: "20:20" },
    });
    const genreApply = api.applyCanonDelta(genreScenario, fixture.candidates, {
      publicText: fixture.text,
      blocks: fixture.text.split(" ").map((text, index) => ({ id: `g-${index}`, text })),
      turn: 1,
    });
    assert.equal(genreApply.accepted.length, fixture.candidates.length);
    const genreCapsule = JSON.stringify(api.selectCanonCapsule(genreScenario, fixture.text));
    assert.match(genreCapsule, fixture.expected);
    assert.doesNotMatch(genreCapsule, /한시우|무인택배함|외할머니|성배전쟁/u);
  }

  const spoilerScenario = api.normalizeScenario({
    title: "가면의 목격자",
    disclosure: { protectedTerms: ["윤설아", "미래 윤설아"], futureTerms: ["secretFuture"] },
    protagonist: { id: "lead", name: "민호" },
    characters: [{ id: "masked", name: "윤설아", surfaceName: "가면 쓴 여자", gm: { trueName: "윤설아" }, present: true }],
    scene: { presentCharacterIds: ["lead", "masked"] },
    world: { time: "12:00", location: "역 광장" },
    event: {
      id: "masked-meeting",
      title: "가면 쓴 목격자",
      startTime: "12:00",
      endTime: "12:10",
      nextEvent: { id: "secretFuture", title: "미래 윤설아의 귀환", visibility: "secret", startTime: "12:10", endTime: "12:20" },
    },
    runtime: {
      canonLedger: { entries: [{ kind: "scene_fact", statement: "가면 쓴 여자는 윤설아다.", visibility: "PUBLIC_CONFIRMED", subjectIds: ["masked"] }] },
    },
  });
  const spoilerTxn = api.buildTxn("가면 쓴 여자에게 인사한다", spoilerScenario, 0);
  const publicWriterPayload = JSON.stringify({ context: spoilerTxn.writerContext, txn: api.publicTxnForWriter(spoilerTxn) });
  assert.match(publicWriterPayload, /가면 쓴 여자/u);
  assert.doesNotMatch(publicWriterPayload, /윤설아|미래 윤설아|secretFuture|trueName|"gm"/u);
  assert.equal(spoilerScenario.runtime.canonLedger.entries.length, 0);
  assert.equal(
    api.applyCanonDelta(spoilerScenario, [{ kind: "scene_fact", statement: "그녀는 윤설아다.", evidence: "그녀는 윤설아다." }], {
      publicText: "그녀는 윤설아다.",
      blocks: [{ id: "leak", text: "그녀는 윤설아다." }],
      turn: 1,
    }).accepted.length,
    0,
  );
  assert.doesNotMatch(JSON.stringify(api.safeScenarioForExport(spoilerScenario)), /윤설아|미래 윤설아|secretFuture|trueName|"gm"/u);

  const memoryFixture = (overrides = {}) => api.normalizeScenario({
    title: "기억 회귀 테스트",
    genre: "현대 미스터리",
    protagonist: { id: "lead", name: "도윤" },
    characters: [{ id: "sera", name: "세라", surfaceName: "세라", present: true }],
    scene: { presentCharacterIds: ["lead", "sera"] },
    world: { day: 0, time: "14:00", location: "도서관 지하 계단" },
    event: {
      id: "memory-event",
      title: "철문 조사",
      startTime: "14:00",
      endTime: "14:30",
      nextBeat: "세라와 철문을 확인한다.",
    },
    ...overrides,
  });

  await t.test("accepts a witnessed canon delta after the first 1000 public characters", () => {
    const sc = memoryFixture();
    const evidence = "도윤은 황동 열쇠를 가방에 넣었다.";
    const publicText = `${"긴장감이 서서히 높아졌다. ".repeat(140)}${evidence}`;
    assert.ok(publicText.indexOf(evidence) > 1000, "fixture must put evidence beyond the old corpus clip");
    const result = api.applyCanonDelta(sc, [{
      kind: "inventory_add",
      statement: evidence,
      evidence,
      subjectId: "lead",
      targetName: "황동 열쇠",
    }], {
      publicText,
      blocks: [{ id: "late-memory", text: evidence }],
      turn: 1,
    });
    assert.equal(result.accepted.length, 1);
    assert.deepEqual(result.storyState.inventory.map((entry) => entry.targetName), ["황동 열쇠"]);
  });

  await t.test("fulfilling one of multiple promises leaves the other promise open", () => {
    const sc = memoryFixture();
    const meeting = "도윤은 세라와 내일 도서관에서 만나기로 약속했다.";
    const keyReturn = "도윤은 세라에게 내일까지 황동 열쇠를 돌려주기로 약속했다.";
    const opened = api.applyCanonDelta(sc, [
      { kind: "promise", statement: meeting, evidence: meeting, subjectIds: ["lead", "sera"], targetName: "도서관" },
      { kind: "promise", statement: keyReturn, evidence: keyReturn, subjectIds: ["lead", "sera"], targetName: "황동 열쇠" },
    ], {
      publicText: `${meeting} ${keyReturn}`,
      blocks: [{ id: "promise-meeting", text: meeting }, { id: "promise-key", text: keyReturn }],
      turn: 1,
    });
    assert.equal(opened.accepted.length, 2);

    const fulfilledText = "약속한 시각, 도윤과 세라는 도서관에서 다시 만났다.";
    const fulfilled = api.applyCanonDelta(sc, [{
      kind: "promise",
      statement: fulfilledText,
      evidence: fulfilledText,
      subjectIds: ["lead", "sera"],
      targetName: "도서관",
      status: "FULFILLED",
    }], {
      publicText: fulfilledText,
      blocks: [{ id: "promise-fulfilled", text: fulfilledText }],
      turn: 2,
    });
    assert.equal(fulfilled.accepted.length, 1);
    const meetingEntry = fulfilled.ledger.entries.find((entry) => entry.publicStatement === meeting);
    const keyEntry = fulfilled.ledger.entries.find((entry) => entry.publicStatement === keyReturn);
    assert.equal(meetingEntry?.active, false);
    assert.equal(meetingEntry?.status, "FULFILLED");
    assert.equal(keyEntry?.active, true);
    assert.equal(keyEntry?.status, "OPEN");
    assert.deepEqual(fulfilled.storyState.promises.map((entry) => entry.statement), [keyReturn]);
  });

  await t.test("healing one injury does not erase a different injury on the same limb", () => {
    const sc = memoryFixture();
    const fracture = "도윤은 오른팔 뼈가 골절되었다.";
    const burn = "도윤은 오른팔 피부에 화상을 입었다.";
    const injured = api.applyCanonDelta(sc, [
      { kind: "injury", statement: fracture, evidence: fracture, subjectId: "lead", targetName: "오른팔 뼈" },
      { kind: "injury", statement: burn, evidence: burn, subjectId: "lead", targetName: "오른팔 피부" },
    ], {
      publicText: `${fracture} ${burn}`,
      blocks: [{ id: "fracture", text: fracture }, { id: "burn", text: burn }],
      turn: 1,
    });
    assert.equal(injured.accepted.length, 2);

    const healedText = "도윤의 오른팔 피부 화상은 완전히 회복되었다.";
    const healed = api.applyCanonDelta(sc, [{
      kind: "injury",
      statement: healedText,
      evidence: healedText,
      subjectId: "lead",
      targetName: "오른팔 피부",
      status: "RESOLVED",
    }], {
      publicText: healedText,
      blocks: [{ id: "burn-healed", text: healedText }],
      turn: 2,
    });
    assert.equal(healed.accepted.length, 1);
    const fractureEntry = healed.ledger.entries.find((entry) => entry.publicStatement === fracture);
    const burnEntry = healed.ledger.entries.find((entry) => entry.publicStatement === burn);
    assert.equal(fractureEntry?.active, true);
    assert.equal(fractureEntry?.status, "ACTIVE");
    assert.equal(burnEntry?.active, false);
    assert.equal(burnEntry?.status, "RESOLVED");
    assert.deepEqual(healed.storyState.conditions.map((entry) => entry.statement), [fracture]);
  });

  await t.test("a witnessed deterioration is retained as a relationship change", () => {
    const sc = memoryFixture();
    const text = "도윤은 세라를 더는 믿지 않게 되었고 두 사람의 신뢰는 무너졌다.";
    const result = api.applyCanonDelta(sc, [{
      kind: "relationship",
      statement: text,
      evidence: text,
      subjectIds: ["lead", "sera"],
      targetId: "sera",
      value: "TRUST_DOWN",
    }], {
      publicText: text,
      blocks: [{ id: "relationship-down", text }],
      turn: 1,
    });
    assert.equal(result.accepted.length, 1);
    assert.equal(result.storyState.relationships.length, 1);
    assert.match(result.storyState.relationships[0].statement, /더는 믿지 않|신뢰는 무너/u);
    assert.equal(result.storyState.relationships[0].value, "TRUST_DOWN");
  });

  await t.test("heuristic promises attach every explicitly named participant", () => {
    const sc = memoryFixture();
    const text = "도윤은 세라와 내일 도서관에서 만나기로 약속했다.";
    const extracted = api.extractCanonDelta(sc, { publicText: text });
    const result = api.applyCanonDelta(sc, extracted, {
      publicText: text,
      blocks: [{ id: "heuristic-promise", text }],
      turn: 1,
    });
    const promise = result.accepted.find((entry) => entry.kind === "promise");
    assert.ok(promise);
    assert.equal(promise.subjectRefs.length, 2);
    const publicIds = new Set(api.publicWriterContext(sc).presentCharacters.map((character) => character.id));
    assert.ok(promise.subjectRefs.every((ref) => publicIds.has(ref)));
  });

  await t.test("capsule relevance keeps old scene-critical facts ahead of recent clutter", () => {
    const clutter = Array.from({ length: 25 }, (_, index) => ({
      id: `junk-${index}`,
      kind: "inventory_add",
      statement: `도윤은 무관한 영수증 ${index + 1}번을 가방에 넣었다.`,
      subjectIds: ["lead"],
      targetName: `무관한 영수증 ${index + 1}번`,
      status: "ACTIVE",
      active: true,
      unresolved: true,
      sourceTurn: 20 + index,
      updatedTurn: 20 + index,
      visibility: "PUBLIC_CONFIRMED",
    }));
    const relevant = [
      {
        id: "relevant-promise",
        kind: "promise",
        statement: "도윤은 세라와 오늘 도서관 지하 계단에서 만나기로 약속했다.",
        subjectIds: ["lead", "sera"],
        targetName: "도서관 지하 계단",
        status: "OPEN",
        active: true,
        unresolved: true,
        sourceTurn: 1,
        updatedTurn: 1,
        visibility: "PUBLIC_CONFIRMED",
      },
      {
        id: "relevant-door",
        kind: "destruction",
        statement: "도서관 지하 계단의 철문 자물쇠가 부서져 있다.",
        targetName: "철문 자물쇠",
        status: "ACTIVE",
        active: true,
        unresolved: true,
        sourceTurn: 2,
        updatedTurn: 2,
        location: "도서관 지하 계단",
        visibility: "PUBLIC_CONFIRMED",
      },
      {
        id: "relevant-npc",
        kind: "npc_decision",
        statement: "세라는 도윤과 함께 지하 계단의 철문을 조사하기로 했다.",
        subjectIds: ["sera", "lead"],
        targetName: "철문 조사",
        status: "ACTIVE",
        active: true,
        unresolved: true,
        sourceTurn: 3,
        updatedTurn: 3,
        visibility: "PUBLIC_CONFIRMED",
      },
    ];
    const sc = memoryFixture({ runtime: { canonLedger: { revision: 28, entries: [...relevant, ...clutter] } } });
    const capsule = api.selectCanonCapsule(sc, "세라와 약속한 도서관 지하 계단의 철문을 확인한다");
    const selectedStatements = new Set(capsule.entries.map((entry) => entry.statement));
    assert.ok(selectedStatements.has(relevant[0].statement));
    assert.ok(selectedStatements.has(relevant[1].statement));
    assert.ok(selectedStatements.has(relevant[2].statement));
    assert.ok(capsule.entries.length <= 16);
    assert.ok(capsule.chars <= 2600);
  });

  await t.test("a completed pending consequence closes its matching open obligation", () => {
    const sc = memoryFixture();
    const pendingText = "관리실 파손 신고가 아직 남아 있었다.";
    const pending = api.applyCanonDelta(sc, [{
      kind: "pending_consequence",
      statement: pendingText,
      evidence: pendingText,
      subjectId: "lead",
      targetName: "관리실 파손 신고",
    }], {
      publicText: pendingText,
      blocks: [{ id: "pending-open", text: pendingText }],
      turn: 1,
    });
    assert.equal(pending.accepted.length, 1);
    const pendingId = pending.accepted[0].id;

    const resolvedText = "도윤은 관리실 파손 신고를 마쳐 필요한 조치를 모두 끝냈다.";
    const resolved = api.applyCanonDelta(sc, [{
      kind: "pending_consequence",
      statement: resolvedText,
      evidence: resolvedText,
      subjectId: "lead",
      targetName: "관리실 파손 신고",
      status: "RESOLVED",
    }], {
      publicText: resolvedText,
      blocks: [{ id: "pending-resolved", text: resolvedText }],
      turn: 2,
    });
    assert.equal(resolved.accepted.length, 1);
    assert.equal(resolved.storyState.pendingConsequences.length, 0);
    const oldPending = resolved.ledger.entries.find((entry) => entry.id === pendingId);
    assert.equal(oldPending?.active, false);
    assert.equal(oldPending?.status, "RESOLVED");
  });

  await t.test("spoiler guard normalizes punctuation and invisible separators in protected names", () => {
    api._setScenario(spoilerScenario);
    const guardTxn = api.buildTxn("가면 쓴 여자에게 인사한다", api._scenario(), 0);
    for (const protectedVariant of ["윤 설아", "윤·설아", "윤-설아", "윤\u200b설아"]) {
      assert.ok(
        api.scanGuard(`${protectedVariant}가 광장에 나타났다.`, guardTxn).includes("PROTECTED_DISCLOSURE"),
        `protected spelling variant escaped the guard: ${JSON.stringify(protectedVariant)}`,
      );
    }
  });

  await t.test("legacy turn export recursively removes protected raw payloads", () => {
    api._setScenario(spoilerScenario);
    assert.equal(typeof api.safeTurnsForExport, "function", "safeTurnsForExport must be exposed to the rendered regression harness");
    const safeTurns = api.safeTurnsForExport([{
      input: "윤설아를 보았다.",
      startTime: "12:00",
      endTime: "12:01",
      status: "COMMITTED",
      paragraphs: ["윤·설아가 광장에 나타났다."],
      blocks: [{ id: "legacy-leak", type: "narration", text: "윤-설아가 광장에 나타났다." }],
      txn: { writerContext: { note: "윤\u200b설아의 정체" } },
      canonCapsuleUsed: [{ statement: "미래 윤설아의 귀환" }],
      canonDeltas: [{ publicStatement: "윤설아가 돌아왔다." }],
      canonSidecar: { warning: "윤·설아" },
      absorptionPlan: { grounding: [{ evidence: "윤-설아" }] },
      error: "윤설아 노출",
    }]);
    const serialized = JSON.stringify(safeTurns);
    assert.equal(safeTurns[0]?.status, "COMMITTED");
    assert.doesNotMatch(serialized, /윤[\s·\-\u200b]*설아/u);
  });

  await t.test("an unrelated completion does not close the only open promise or pending consequence", () => {
    const sc = memoryFixture();
    const keyPromise = "도윤은 세라에게 내일까지 황동 열쇠를 돌려주기로 약속했다.";
    const managerNotice = "관리실 파손 신고가 아직 남아 있었다.";
    const opened = api.applyCanonDelta(sc, [
      {
        kind: "promise",
        statement: keyPromise,
        evidence: keyPromise,
        subjectIds: ["lead", "sera"],
        targetName: "황동 열쇠",
      },
      {
        kind: "pending_consequence",
        statement: managerNotice,
        evidence: managerNotice,
        subjectId: "lead",
        targetName: "관리실 파손 신고",
      },
    ], {
      publicText: `${keyPromise} ${managerNotice}`,
      blocks: [{ id: "single-promise", text: keyPromise }, { id: "single-pending", text: managerNotice }],
      turn: 1,
    });
    assert.equal(opened.accepted.length, 2);

    const unrelatedMeeting = "약속한 시각, 도윤과 세라는 도서관에서 다시 만났다.";
    const unrelatedTask = "도윤은 도서 반납 과제를 모두 끝냈다.";
    const completed = api.applyCanonDelta(sc, [
      {
        kind: "promise",
        statement: unrelatedMeeting,
        evidence: unrelatedMeeting,
        subjectIds: ["lead", "sera"],
        targetName: "도서관",
        status: "FULFILLED",
      },
      {
        kind: "pending_consequence",
        statement: unrelatedTask,
        evidence: unrelatedTask,
        subjectId: "lead",
        targetName: "도서 반납 과제",
        status: "RESOLVED",
      },
    ], {
      publicText: `${unrelatedMeeting} ${unrelatedTask}`,
      blocks: [{ id: "unrelated-meeting", text: unrelatedMeeting }, { id: "unrelated-task", text: unrelatedTask }],
      turn: 2,
    });
    assert.equal(completed.accepted.length, 2);
    const promiseEntry = completed.ledger.entries.find((entry) => entry.publicStatement === keyPromise);
    const pendingEntry = completed.ledger.entries.find((entry) => entry.publicStatement === managerNotice);
    assert.equal(promiseEntry?.active, true);
    assert.equal(promiseEntry?.status, "OPEN");
    assert.equal(pendingEntry?.active, true);
    assert.equal(pendingEntry?.status, "OPEN");
    assert.deepEqual(completed.storyState.promises.map((entry) => entry.statement), [keyPromise]);
    assert.deepEqual(completed.storyState.pendingConsequences.map((entry) => entry.statement), [managerNotice]);
  });

  await t.test("same-kind sidecar deltas with the same sentence preserve distinct target IDs", () => {
    const sc = memoryFixture({
      characters: [
        { id: "sera", name: "세라", surfaceName: "세라", present: true },
        { id: "mira", name: "미라", surfaceName: "미라", present: true },
      ],
      scene: { presentCharacterIds: ["lead", "sera", "mira"] },
    });
    const text = "도윤은 세라와 미라를 전보다 더 신뢰하게 되었다.";
    const deltas = [
      { kind: "relationship", statement: text, evidence: text, subjectIds: ["lead", "sera"], targetId: "sera" },
      { kind: "relationship", statement: text, evidence: text, subjectIds: ["lead", "mira"], targetId: "mira" },
    ];
    const transport = `<CANON>${JSON.stringify({ deltas })}</CANON>`;
    const collected = api.collectCanonCandidates(sc, transport, { publicText: text });
    const preserved = collected.filter((candidate) => candidate.kind === "relationship" && ["sera", "mira"].includes(candidate.targetId));
    assert.equal(preserved.length, 2);
    assert.deepEqual(new Set(preserved.map((candidate) => candidate.targetId)), new Set(["sera", "mira"]));

    const appliedTargets = api.applyCanonDelta(sc, preserved, {
      publicText: text,
      blocks: [{ id: "two-relationships", text }],
      turn: 1,
    });
    assert.equal(appliedTargets.accepted.length, 2);
    assert.equal(new Set(appliedTargets.storyState.relationships.map((entry) => entry.targetRef)).size, 2);
  });

  await t.test("remove then add in one sentence leaves the item in final inventory", () => {
    const sc = memoryFixture();
    const initialText = "도윤은 황동 열쇠를 가방에 넣었다.";
    const initial = api.applyCanonDelta(sc, [{
      kind: "inventory_add",
      statement: initialText,
      evidence: initialText,
      subjectId: "lead",
      targetName: "황동 열쇠",
    }], {
      publicText: initialText,
      blocks: [{ id: "initial-inventory", text: initialText }],
      turn: 1,
    });
    assert.equal(initial.storyState.inventory.length, 1);

    const text = "도윤은 황동 열쇠를 탁자에 내려놓았다가 황동 열쇠를 가방에 넣었다.";
    const inventoryDeltas = api.extractCanonDelta(sc, { publicText: text }).filter((candidate) => /^inventory_/.test(candidate.kind));
    assert.deepEqual(inventoryDeltas.map((candidate) => candidate.kind), ["inventory_remove", "inventory_add"]);
    const appliedInventory = api.applyCanonDelta(sc, inventoryDeltas, {
      publicText: text,
      blocks: [{ id: "remove-then-add", text }],
      turn: 2,
    });
    assert.deepEqual(appliedInventory.accepted.map((entry) => entry.kind), ["inventory_remove", "inventory_add"]);
    assert.equal(appliedInventory.storyState.inventory.length, 1);
    assert.equal(appliedInventory.storyState.inventory[0].targetName, "황동 열쇠");
    assert.equal(appliedInventory.storyState.inventory[0].statement, text);
  });

  await t.test("ledger compaction never drops any of 161 active canon entries", () => {
    const activeEntries = Array.from({ length: 161 }, (_, index) => ({
      id: `active-${index + 1}`,
      kind: "scene_fact",
      statement: `공개된 단서 ${index + 1}번은 아직 유효하다.`,
      subjectIds: ["lead"],
      status: "ACTIVE",
      active: true,
      unresolved: true,
      sourceTurn: index + 1,
      updatedTurn: index + 1,
      visibility: "PUBLIC_CONFIRMED",
    }));
    const historyEntries = Array.from({ length: 8 }, (_, index) => ({
      id: `history-${index + 1}`,
      kind: "scene_fact",
      statement: `종료된 과거 단서 ${index + 1}번이다.`,
      subjectIds: ["lead"],
      status: "RESOLVED",
      active: false,
      unresolved: false,
      sourceTurn: index + 1,
      updatedTurn: index + 1,
      visibility: "PUBLIC_CONFIRMED",
    }));
    const sc = memoryFixture({ runtime: { canonLedger: { revision: 169, entries: [...activeEntries, ...historyEntries] } } });
    assert.equal(sc.runtime.canonLedger.entries.length, 161);
    assert.ok(sc.runtime.canonLedger.entries.every((entry) => entry.active));
    assert.equal(new Set(sc.runtime.canonLedger.entries.map((entry) => entry.publicStatement)).size, 161);
  });

  await t.test("relationship extraction excludes a witness and a later change supersedes the same pair", () => {
    const sc = memoryFixture({
      characters: [
        { id: "sera", name: "세라", surfaceName: "세라", present: true },
        { id: "mira", name: "미라", surfaceName: "미라", present: true },
      ],
      scene: { presentCharacterIds: ["lead", "sera", "mira"] },
    });
    const positiveText = "미라가 곁에서 지켜보는 동안, 도윤은 세라를 전보다 더 신뢰하게 되었다.";
    const positiveCandidates = api.extractCanonDelta(sc, { publicText: positiveText }).filter((candidate) => candidate.kind === "relationship");
    assert.equal(positiveCandidates.length, 1);
    const positive = api.applyCanonDelta(sc, positiveCandidates, {
      publicText: positiveText,
      blocks: [{ id: "relationship-witness-positive", text: positiveText }],
      turn: 1,
    });
    assert.equal(positive.accepted.length, 1);
    const publicCast = api.publicWriterContext(sc).presentCharacters;
    const witnessRef = publicCast.find((character) => character.name === "미라")?.id;
    const seraRef = publicCast.find((character) => character.name === "세라")?.id;
    assert.ok(seraRef);
    assert.ok(witnessRef);
    assert.ok(positive.accepted[0].subjectRefs.includes(seraRef));
    assert.ok(!positive.accepted[0].subjectRefs.includes(witnessRef));

    const negativeText = "미라가 둘을 지켜보는 동안, 도윤은 세라를 향한 의심이 커져 두 사람의 신뢰는 무너졌다.";
    const negativeCandidates = api.extractCanonDelta(sc, { publicText: negativeText }).filter((candidate) => candidate.kind === "relationship");
    const negative = api.applyCanonDelta(sc, negativeCandidates, {
      publicText: negativeText,
      blocks: [{ id: "relationship-witness-negative", text: negativeText }],
      turn: 2,
    });
    assert.equal(negative.accepted.length, 1);
    const oldRelationship = negative.ledger.entries.find((entry) => entry.publicStatement === positiveText);
    assert.equal(oldRelationship?.active, false);
    assert.equal(oldRelationship?.status, "SUPERSEDED");
    assert.equal(negative.storyState.relationships.length, 1);
    assert.equal(negative.storyState.relationships[0].statement, negativeText);
    assert.equal(negative.storyState.relationships[0].value, "NEGATIVE");
    assert.ok(!negative.storyState.relationships[0].subjectRefs.includes(witnessRef));
  });

  await t.test("a generic recovery resolves the unique open injury candidate", () => {
    const sc = memoryFixture();
    const injuryText = "도윤의 왼팔 검상이 아직 남아 있었다.";
    const opened = api.applyCanonDelta(sc, [{
      kind: "injury",
      statement: injuryText,
      evidence: injuryText,
      subjectId: "lead",
      targetName: "왼팔 검상",
    }], {
      publicText: injuryText,
      blocks: [{ id: "unique-injury", text: injuryText }],
      turn: 1,
    });
    assert.equal(opened.accepted.length, 1);
    const injuryId = opened.accepted[0].id;

    const recoveryText = "도윤의 부상은 완전히 회복되었다.";
    const recovered = api.applyCanonDelta(sc, [{
      kind: "injury",
      statement: recoveryText,
      evidence: recoveryText,
      subjectId: "lead",
      targetName: "부상",
      status: "RESOLVED",
    }], {
      publicText: recoveryText,
      blocks: [{ id: "generic-recovery", text: recoveryText }],
      turn: 2,
    });
    assert.equal(recovered.accepted.length, 1);
    assert.equal(recovered.storyState.conditions.length, 0);
    const oldInjury = recovered.ledger.entries.find((entry) => entry.id === injuryId);
    assert.equal(oldInjury?.active, false);
    assert.equal(oldInjury?.status, "RESOLVED");
  });

  await t.test("five inventory items explicitly named by the input bypass the per-kind capsule quota", () => {
    const itemNames = ["황동 열쇠", "은빛 나침반", "붉은 수첩", "청동 호루라기", "유리 구슬"];
    const inventoryEntries = itemNames.map((targetName, index) => ({
      id: `inventory-${index + 1}`,
      kind: "inventory_add",
      statement: `도윤은 ${targetName}을 가방에 넣어 소지하고 있다.`,
      subjectIds: ["lead"],
      targetName,
      status: "ACTIVE",
      active: true,
      unresolved: true,
      sourceTurn: index + 1,
      updatedTurn: index + 1,
      visibility: "PUBLIC_CONFIRMED",
    }));
    const sc = memoryFixture({ runtime: { canonLedger: { revision: 5, entries: inventoryEntries } } });
    const capsule = api.selectCanonCapsule(sc, `${itemNames.join(", ")} 다섯 개를 차례로 확인한다.`);
    const selectedInventory = capsule.entries.filter((entry) => entry.kind === "inventory_add");
    assert.equal(selectedInventory.length, 5);
    assert.deepEqual(new Set(selectedInventory.map((entry) => entry.targetName)), new Set(itemNames));
  });

  await t.test("scenario export allowlists runtime policy fields and drops unknown extensions", () => {
    const sc = memoryFixture({
      runtime: {
        prosePolicy: {
          normal: { minChars: 720, maxChars: 980, minParagraphs: 3, maxParagraphs: 5, hiddenInstruction: "LEAK_NORMAL_POLICY" },
        },
        dialoguePolicy: { whenPresent: "natural", maxLinesPerSpeaker: 4, systemPrompt: "LEAK_DIALOGUE_POLICY" },
        absorptionPolicy: { preserveAgency: true, maxPressures: 2, privateBridge: "LEAK_ABSORPTION_POLICY" },
        experimentalPlanner: { rawPrompt: "LEAK_EXPERIMENTAL_POLICY" },
      },
    });
    sc.runtime.prosePolicy.normal.privateRule = "LEAK_MUTATED_POLICY";
    sc.runtime.dialoguePolicy.shadowRule = "LEAK_SHADOW_POLICY";
    sc.runtime.unknownRuntimePolicy = { instruction: "LEAK_UNKNOWN_RUNTIME" };
    const exported = api.safeScenarioForExport(sc);
    const serialized = JSON.stringify(exported);
    assert.doesNotMatch(serialized, /LEAK_|hiddenInstruction|systemPrompt|privateBridge|experimentalPlanner|privateRule|shadowRule|unknownRuntimePolicy/u);
    assert.deepEqual(Object.keys(exported.runtime.prosePolicy.normal).sort(), ["maxChars", "maxParagraphs", "minChars", "minParagraphs"]);
    assert.deepEqual(Object.keys(exported.runtime.dialoguePolicy).sort(), ["maxLinesPerSpeaker", "whenPresent"]);
    assert.deepEqual(Object.keys(exported.runtime.absorptionPolicy).sort(), ["lastResortDevices", "maxLastResortDevicesPerTurn", "maxPressures", "preserveAgency"]);
  });

  await t.test("object-map characters and a protagonist alias protect every unrevealed canonical name", () => {
    const sc = api.normalizeScenario({
      title: "가면 아래의 이름",
      protagonist: {
        id: "lead",
        name: "백야진",
        preRevealAlias: "도윤",
        revealCondition: "왕관을 회수한 뒤",
        present: true,
      },
      characters: {
        masked: {
          name: "윤설아",
          preRevealAlias: "가면 쓴 여자",
          revealCondition: "봉인이 해제된 뒤",
          present: true,
        },
      },
      scene: { presentCharacterIds: ["lead", "masked"] },
      world: { day: 0, time: "12:00", location: "역 광장" },
      event: { id: "masked-event", title: "가면 쓴 목격자", startTime: "12:00", endTime: "12:10" },
    });
    const writerContext = api.publicWriterContext(sc);
    assert.equal(writerContext.protagonist.name, "도윤");
    assert.ok(writerContext.presentCharacters.some((character) => character.name === "가면 쓴 여자"));
    assert.doesNotMatch(JSON.stringify(writerContext), /백야진|윤설아/u);
    assert.doesNotMatch(JSON.stringify(api.safeScenarioForExport(sc)), /백야진|윤설아/u);

    api._setScenario(sc);
    const aliasTxn = api.buildTxn("가면 쓴 여자에게 인사한다", api._scenario(), 0);
    for (const canonicalName of ["백야진", "윤설아"]) {
      assert.ok(api.scanGuard(`${canonicalName}이 광장에 나타났다.`, aliasTxn).includes("PROTECTED_DISCLOSURE"));
    }
  });

  await t.test("conditional unrevealed next-event anchors never enter the current writer plan", () => {
    const sc = api.normalizeScenario({
      title: "봉인된 다음 장",
      protagonist: { id: "lead", name: "도윤" },
      world: { day: 0, time: "14:09:30", location: "도서관 지하" },
      event: {
        id: "current-event",
        title: "철문 앞",
        startTime: "14:00",
        endTime: "14:10",
        nextBeatAt: "14:10",
        nextEvent: {
          id: "conditional-next",
          title: "왕의 귀환",
          preRevealAlias: "봉인된 조짐",
          revealCondition: "철문의 봉인을 해제한 뒤",
          startTime: "14:10",
          endTime: "14:20",
          publicAbsorptionAnchors: [{
            id: "premature-bell",
            type: "event_interruption",
            fact: "멀리서 세 번 울린 은종이 도윤을 부른다.",
            strength: 5,
          }],
        },
      },
    });
    assert.equal(sc.event.nextEvent.absorptionAnchors.length, 1, "fixture keeps a public-surface anchor behind the reveal gate");
    assert.equal(sc.event.nextEvent.publicOpeningAuthorized, false);
    const intent = api.parseIntent("철문을 지나 밖으로 향한다");
    const anchors = api.anchorCandidates(sc, intent, true, { entries: [] });
    assert.ok(!anchors.some((anchor) => anchor.id === "premature-bell"));
    assert.doesNotMatch(JSON.stringify(anchors), /은종|도윤을 부른다/u);
    const plan = api.chooseAbsorptionPlan(sc, intent, true, true, null, true, { entries: [] });
    assert.doesNotMatch(JSON.stringify(plan), /은종|왕의 귀환|premature-bell/u);
  });

  await t.test("v1.7.5 Chronos failure log is repaired by absolute beat milestones and a one-turn next-day bridge", () => {
    api._settings().storyId = "chronos_core_10";
    api._setScenario(api.storyDefault("chronos_core_10"));
    const compile = (input, index) => {
      const sc = api._scenario();
      return api.applyOutcomeEnvelope(
        api.applyEventStartGate(
          api.applyBeatContract(api.buildTxn(input, sc, index), sc),
          sc,
        ),
      );
    };
    const commitBeat = (txn, visible) => {
      const sc = api._scenario();
      sc.world.day = txn.endStatePatch.worldDay;
      sc.world.time = txn.endStatePatch.worldTime;
      sc.world.location = txn.endStatePatch.location || sc.world.location;
      api.advanceEvent(txn, { status: "PASS_EXACT", missing: [], evidence: [] }, visible);
    };

    const morning = compile("일어나서 책상 아래의 종이를 살피고 등교한다.", 0);
    assert.equal(morning.temporalContract.mode, "BEAT_MILESTONE");
    assert.equal(morning.temporalContract.targetDay, 0);
    assert.equal(morning.temporalContract.targetTime, "11:50:00");
    assert.equal(morning.endStatePatch.worldTime, "11:50:00");
    assert.deepEqual(morning.leases.map((lease) => lease.dayRange), [[0, 0], [0, 0], [0, 0]]);
    const morningBlocks = [{ id: "morning", text: "은서는 종이 모서리를 확인한 뒤 학교에 도착해 오전 수업을 들었다.", elapsedSec: 90 }];
    const morningTimeline = api.resolveBlockTimeline(morningBlocks, morning);
    assert.equal(morningTimeline.source, "server_beat_milestone");
    assert.equal(morningTimeline.elapsedSec, 19_200);
    assert.equal(morningTimeline.endTime, "11:50:00");
    commitBeat(morning, api._scenario().event.beats[0].goal);
    assert.equal(api._scenario().event.activeBeatIndex, 1);

    const school = compile("평소처럼 수업을 듣고 서현과 점심을 먹는다.", 1);
    assert.equal(school.temporalContract.targetTime, "17:10:00");
    assert.equal(school.endStatePatch.worldTime, "17:10:00");
    commitBeat(school, api._scenario().event.beats[1].goal);
    assert.equal(api._scenario().event.activeBeatIndex, 2);

    const note = compile("방과 후 사물함을 열어 첫 번째 쪽지를 발견한다.", 2);
    assert.equal(note.temporalContract.targetTime, "22:30:00");
    assert.equal(note.endStatePatch.worldTime, "22:30:00");
    commitBeat(note, api._scenario().event.beats[2].goal);
    assert.equal(api._scenario().event.id, "CC_CH02_SILVER_KEY");
    assert.equal(api._scenario().world.day, 0);
    assert.equal(api._scenario().world.time, "22:30:00");

    const waitingLocation = api._scenario().world.location;
    const bridge = compile("에이 장난이겠지. 쪽지를 접고 평소 일상으로 돌아간다.", 3);
    assert.equal(bridge.temporalContract.mode, "EVENT_START_BRIDGE");
    assert.equal(bridge.temporalContract.targetDay, 1);
    assert.equal(bridge.temporalContract.targetTime, "07:30:00");
    assert.equal(bridge.endStatePatch.worldDay, 1);
    assert.equal(bridge.endStatePatch.worldTime, "07:30:00");
    assert.equal(bridge.endStatePatch.location, waitingLocation);
    const bridgeBlocks = [{ id: "bridge", text: "은서는 쪽지를 접고 계단을 내려가 귀가한 뒤 잠들었다. 다음 날 아침 알람에 눈을 떴다.", elapsedSec: 55 }];
    const bridgeTimeline = api.resolveBlockTimeline(bridgeBlocks, bridge);
    assert.equal(bridgeTimeline.source, "server_event_start_bridge");
    assert.equal(bridgeTimeline.elapsedSec, 32_400);
    assert.equal(bridgeTimeline.endDay, 1);
    assert.equal(bridgeTimeline.endTime, "07:30:00");
    assert.doesNotMatch(api.fastWriterInput(bridge.intent.raw, bridge), /은빛 시동키|동심원|김다윤/u);
    assert.equal(
      api.sceneLocationFromProse("은서는 사물함의 긁힌 자국을 다시 살폈다.", bridge),
      waitingLocation,
    );

    api._settings().storyId = "relay_parcel_10";
    api._setScenario(api.storyDefault("relay_parcel_10"));
  });

  await t.test("contact evidence prevents duplicate violence patches and prose length remains advisory", () => {
    const sc = api.normalizeScenario({
      title: "행동 접촉 검증",
      protagonist: { id: "lead", name: "박은서" },
      characters: [{ id: "hanseo", name: "박한서", present: true }],
      scene: { presentCharacterIds: ["lead", "hanseo"] },
      world: { day: 0, time: "06:31:00", location: "박은서의 방" },
      event: { id: "contact", title: "아침", startTime: "06:30:00", endTime: "07:00:00", locationLocked: false },
    });
    api._setScenario(sc);
    const txn = api.buildTxn("박한서의 뺨을 손바닥으로 때린다.", sc, 0);
    const prose = "은서의 손바닥이 박한서의 뺨에 닿았다. 마른 소리와 함께 한서의 얼굴이 돌아갔고 맞은 자리가 붉어졌다.";
    assert.deepEqual(api.actionRealizationIssues(txn.intent.raw, txn, prose), []);
    const patchText = api.actionRealizationPatch(txn, [
      "INPUT_ACTION_MISSING:VIOLENCE",
      "INPUT_RESULT_MISSING:VIOLENCE_IMPACT",
    ]);
    assert.match(patchText, /박한서의 뺨/u);
    assert.doesNotMatch(patchText, /손에 든 물건|물건를/u);
    assert.ok(!api.qualityAudit("은서는 짧게 숨을 골랐다.", txn, []).some((issue) => /^TOO_(?:SHORT|LONG):|LOW_SCENE_DENSITY/u.test(issue)));

    api._setScenario(api.storyDefault("relay_parcel_10"));
  });

  await t.test("variation selectors and combining marks cannot disguise a protected name", () => {
    api._setScenario(spoilerScenario);
    const guardTxn = api.buildTxn("가면 쓴 여자에게 인사한다", api._scenario(), 0);
    for (const protectedVariant of ["윤\uFE0F설아", "윤\u0301설아", "윤설\uFE0E아", "윤설\u20DD아"]) {
      assert.ok(
        api.scanGuard(`${protectedVariant}가 광장에 나타났다.`, guardTxn).includes("PROTECTED_DISCLOSURE"),
        `combining-mark variant escaped the guard: ${JSON.stringify(protectedVariant)}`,
      );
    }
  });
});
