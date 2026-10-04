import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import "../../vendor/cortex/instant-runtime.js";
import { instantContextIndex, instantKeywordIndex, instantStoryRuntime, instantStoryRuntimeSchema, instantStoryTestVectors, INSTANT_STORY_COMPILER_VERSION, normalizeInstantStoryDesign, validateInstantStory } from "../../features/jieum/instant-story-contract";
import { makeProject, normalizeProject } from "../../features/jieum/studio-model";
import { createDemoPreset, DEMO_PRESETS } from "../../features/jieum/demo-presets";
import { privateWorldProse } from "../../features/jieum/world-prose";
import { CORTEX_PACKAGE_FEATURE_ID, EMBEDDED_PROJECT_FEATURE_ID, EMBEDDED_PROJECT_SNAPSHOT_PATH, exportScenarioPack, extractStudioProjectFromPackage, PROJECT_SNAPSHOT_FORMAT, STATUS_RELATIONSHIP_FEATURE_ID, statusWindowRuntime } from "../../features/jieum/studio-export";

test("Instant Story project data survives old and new project roundtrips", () => {
  const project = makeProject(false);
  project.runtimeMode = "instant_story";
  project.instantStory.enabled = true;
  project.instantStory.keywordNotes = [{ id: "NOTE_SEOUL", title: "서울 밤", keywords: ["서촌", "정전"], priority: 80, content: "정전과 시민 반응을 현재 장소에 맞게 반영한다." }];
  project.instantStory.exampleScenes = [{ id: "EXAMPLE_1", userInput: "골목으로 이동한다.", narration: "시우는 골목으로 들어섰다.", recommendations: ["주변을 살핀다", "불빛을 끈다", "달려간다"] }];
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.instantStory.enabled, true);
  assert.equal(restored.instantStory.keywordNotes[0].id, "NOTE_SEOUL");
  assert.equal(restored.instantStory.exampleScenes.length, 1);
  const legacy = normalizeProject({ title: "구버전" });
  assert.equal(legacy.instantStory.enabled, false);
  assert.equal(legacy.instantStory.contextBudget.activeKeywordNotes, 3);
});

test("Instant Story runtime exposes only safe public SSE events", () => {
  const project = makeProject(false);
  project.runtimeMode = "instant_story";
  project.instantStory.enabled = true;
  const runtime = instantStoryRuntime(project, "a".repeat(64), "2026-08-22T00:00:00.000Z");
  assert.equal(runtime.streamContract.endpoint, "/api/simulate/stream");
  assert.equal(runtime.streamContract.publicEvents.some((event) => String(event) === "narration_delta"), false);
  assert.equal(runtime.streamContract.publicEvents.includes("narration_commit"), true);
  assert.equal(runtime.streamContract.publicEvents.includes("turn_abort"), true);
  assert.equal(runtime.streamContract.doneSemantics, "validated_and_memory_applied");
});

test("derived indices are bounded and vectors cover stale, legacy, leak and corruption", () => {
  const project = makeProject(false);
  project.instantStory = normalizeInstantStoryDesign({ enabled: true, contextBudget: { activeKeywordNotes: 99 }, keywordNotes: Array.from({ length: 24 }, (_, index) => ({ id: `N${index}`, title: `노트 ${index}`, keywords: [`K${index}`], priority: index, content: "내용" })) });
  assert.equal(project.instantStory.contextBudget.activeKeywordNotes, 3);
  assert.equal(project.instantStory.keywordNotes.length, 20);
  assert.equal(instantKeywordIndex(project).maximumActiveNotesPerTurn, 3);
  assert.equal(instantContextIndex(project).format, "RELAY_NOVEL_INSTANT_CONTEXT_INDEX_V1");
  const vectors = instantStoryTestVectors(project, "b".repeat(64), "2026-08-22T00:00:00.000Z");
  assert.equal(vectors.staleCache.expectedResult, "ignore_derived_cache_and_recompile_instant_only");
  assert.equal(vectors.legacyPackage.expectedResult, "reject_if_instant_runtime_unsupported");
  assert.equal(vectors.disclosureAbort.publicEvents.at(-1), "turn_abort");
  assert.equal(vectors.malformedStream.expectedClientResult, "do_not_commit_turn");
  assert.equal(instantStoryRuntimeSchema.properties.sourcePackageSha256.pattern, "^[a-f0-9]{64}$");
});

test("Instant runtime and derived caches share the 1.8.3 compiler identifier", () => {
  const project = makeProject(false);
  project.runtimeMode = "instant_story";
  project.instantStory.enabled = true;
  assert.equal(INSTANT_STORY_COMPILER_VERSION, "studio-1.8.3");
  assert.equal(instantStoryRuntime(project, "c".repeat(64), "2026-09-01T00:00:00.000Z").compilerVersion, INSTANT_STORY_COMPILER_VERSION);
});

test("validation enforces an exclusive Instant runtime", () => {
  const project = makeProject(false);
  project.instantStory.enabled = true;
  assert.equal(validateInstantStory(project).some((issue) => issue.severity === "error"), true);
  project.runtimeMode = "instant_story";
  project.events = [];
  assert.equal(validateInstantStory(project).some((issue) => issue.severity === "error"), false);
});

test("built-in complete demos keep full-fit and Instant Story sources separate", () => {
  assert.deepEqual(DEMO_PRESETS.map((preset) => preset.id), ["giseong_full_fit", "giseong_instant_story"]);
  const fullFit = createDemoPreset("giseong_full_fit");
  const instant = createDemoPreset("giseong_instant_story");
  assert.equal(fullFit.instantStory.enabled, false);
  assert.equal(fullFit.player.name, "윤지훈");
  assert.equal(instant.projectId, "RN-DEMO-GISEONG-INSTANT-001");
  assert.equal(instant.player.name, "윤지훈");
  assert.equal(instant.player.skills, "원소조작: 주변의 물·불·바람·땅 중 하나를 제한적으로 다룬다. 원소 전환에는 시간이 필요하다.\n특이 케이스로 한가지의 능력을 더 다룰 수 있게 되는 잠재력이 보인다.");
  assert.equal(instant.instantStory.enabled, true);
  assert.equal(instant.runtimeMode, "instant_story");
  assert.equal(instant.package15.enabled, false);
  assert.equal(instant.aiWorldContext.enabled, false);
  assert.equal(instant.protagonistInvariants.length, 4);
  assert.equal(instant.instantStory.exampleScenes.length, 3);
  assert.equal(instant.instantStory.keywordNotes.length, 11);
  assert.equal(instant.instantStory.keywordNotes.every((note) => new Set(note.keywords).size === note.keywords.length), true);
  assert.equal(instant.events.length, 0);
  assert.equal(instant.autonomyActors.length, 0);
  assert.equal(instant.relationshipMemories.length, 0);
  assert.equal(instant.statusWindow.relationshipDisplays.length, 3);
  assert.equal(instant.statusWindow.relationshipDisplays.some((item) => item.entityType === "faction"), true);
  assert.equal(instant.statusWindow.relationshipDisplays.some((item) => item.showSentence && item.showStat && item.showSymbol), true);
  assert.equal(instant.instantStory.deepPathTriggers.every((trigger) => ["identity_reveal", "ending"].includes(trigger)), true);
  assert.match(instant.instantStory.startProfiles[0].prologue, /능력 측정을 위한 다음 차례/u);
  assert.equal(instant.instantStory.startProfiles[0].recommendedReplies[0], "능력 측정을 위해 검사실로 향한다.");
  assert.notEqual(fullFit.projectId, instant.projectId);
});

test("relationship HUD combines sentence, stat and symbol without Canon runtime", () => {
  const project = createDemoPreset("giseong_instant_story");
  const runtime = statusWindowRuntime(project);
  assert.equal(runtime.format, "RELAY_NOVEL_STATUS_WINDOW_RUNTIME_V3");
  assert.equal(runtime.relationshipDisplay.allowCombinedParts, true);
  assert.deepEqual(runtime.relationshipDisplay.supportedParts, ["sentence", "stat", "symbol"]);
  assert.equal(runtime.relationshipDisplay.entries.some((item) => item.displayParts.length === 3), true);
  assert.equal(runtime.turnOrder.includes("autonomous_actor_selection_and_resolution"), false);
  assert.equal(runtime.turnOrder.includes("relationship_memory_append_and_score_recalculation"), false);
});

test("InstantStoryPack physically omits every intelligent-canon runtime path", async () => {
  const project = createDemoPreset("giseong_instant_story");
  project.gmData.worldTruthLedger = "교장은 봉인을 유지하기 위해 입학식을 이용한다.";
  project.player.hiddenInfo = "두 번째 능력은 아직 본인도 모른다.";
  const summary = await exportScenarioPack(project, false);
  const archive = await JSZip.loadAsync(await summary.blob.arrayBuffer());
  const files = Object.keys(archive.files);
  const forbiddenPrefixes = ["events/", "actors/", "relations/", "factions/", "gm/", "routes/", "loops/", "state/"];
  assert.equal(files.some((path) => forbiddenPrefixes.some((prefix) => path.startsWith(prefix))), false);
  assert.equal(files.includes("rules/narrative_runtime.json"), false);
  assert.equal(files.includes("rules/autonomy_runtime.json"), false);
  assert.equal(files.includes("CHATGPT_IMPORT.json"), false);
  assert.equal(files.includes("rules/instant_story_runtime.json"), true);
  assert.equal(files.includes("schemas/instant_story_runtime_v2.schema.json"), true);
  assert.equal(files.includes(EMBEDDED_PROJECT_SNAPSHOT_PATH), true);
  const runtimeDocument = JSON.parse(await archive.file("rules/instant_story_runtime.json")!.async("string"));
  const packageProject = JSON.parse(await archive.file("project.json")!.async("string"));
  const contextIndex = JSON.parse(await archive.file("runtime/context_index.json")!.async("string"));
  assert.equal(runtimeDocument.compilerVersion, INSTANT_STORY_COMPILER_VERSION);
  assert.equal(contextIndex.compilerVersion, INSTANT_STORY_COMPILER_VERSION);
  assert.equal(packageProject.turnPresentation.recommendedReplies.enabled, true);
  assert.equal(packageProject.turnPresentation.recommendedReplies.count, 3);
  assert.equal(packageProject.gmData.worldTruthLedger, privateWorldProse(project.gmData));
  const runtimeFiles: Record<string, unknown> = {};
  for (const path of files.filter((value) => value.endsWith(".json") && !value.startsWith("studio/"))) runtimeFiles[path] = JSON.parse(await archive.file(path)!.async("string"));
  const config = (globalThis as any).CortexInstant.fromFiles(runtimeFiles);
  assert.equal(config.privateContext.world, privateWorldProse(project.gmData));
  assert.equal(config.privateContext.characters.find((item: any) => item.id === project.player.id)?.hiddenInfo, project.player.hiddenInfo);
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  assert.equal(manifest.runtimeMode, "instant_story");
  assert.equal(manifest.exclusiveRuntime, true);
  assert.deepEqual(manifest.requiredFeatures, [CORTEX_PACKAGE_FEATURE_ID, "instant_story_runtime_v2", STATUS_RELATIONSHIP_FEATURE_ID]);
  assert.equal(manifest.features.includes(EMBEDDED_PROJECT_FEATURE_ID), true);
  assert.equal(manifest.editorSource.path, EMBEDDED_PROJECT_SNAPSHOT_PATH);
  assert.equal(manifest.editorSource.format, PROJECT_SNAPSHOT_FORMAT);
  assert.equal(manifest.editorSource.runtimeIgnored, true);
  const restored = await extractStudioProjectFromPackage(summary.blob);
  assert.equal(restored.fullFidelity, true);
  assert.equal(restored.project.projectId, project.projectId);
  assert.equal((restored.project.instantStory as typeof project.instantStory).keywordNotes.length, project.instantStory.keywordNotes.length);
  assert.deepEqual(normalizeProject(restored.project), normalizeProject(project));
  archive.file(EMBEDDED_PROJECT_SNAPSHOT_PATH, JSON.stringify({ format: PROJECT_SNAPSHOT_FORMAT, project: { title: "변조됨" } }));
  const tampered = await archive.generateAsync({ type: "uint8array" });
  await assert.rejects(() => extractStudioProjectFromPackage(tampered), /바이트 길이|SHA-256/);
  assert.equal(manifest.unsupportedBehavior, "reject_package");
});
