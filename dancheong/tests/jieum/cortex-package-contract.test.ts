import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  blankStoryEvent,
  blankStoryBeat,
  blankCharacter,
  characterInvariantsForRuntime,
  defaultProtagonistInvariants,
  makeProjectForPackageTarget,
  normalizeProject,
  normalizeProtagonistInvariants,
  validateProject,
} from "../../features/jieum/studio-model";
import {
  buildImportObject,
  buildMarkdown,
  CORTEX_MIN_VERSION,
  CORTEX_PACKAGE_FEATURE_ID,
  CORTEX_PACKAGE_FORMAT,
  exportScenarioPack,
} from "../../features/jieum/studio-export";

test("Cortex projects start with the four editable protagonist invariant templates", () => {
  const cortex = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
  assert.equal(cortex.packageTarget, "cortex");
  assert.deepEqual(cortex.protagonistInvariants, defaultProtagonistInvariants());
  assert.deepEqual(cortex.protagonistInvariants.map((item) => item.severity), ["HARD", "SOFT", "SOFT", "SOFT"]);

  const legacy = makeProjectForPackageTarget("legacy", "intelligent_canon", false);
  assert.equal(legacy.packageTarget, "legacy");
  assert.deepEqual(legacy.protagonistInvariants, []);
});

test("invariant normalization matches the Cortex fallback contract", () => {
  const normalized = normalizeProtagonistInvariants([
    "보행 능력",
    { description: "기억의 연속성", severity: "typo" },
    { label: "생존", severity: "hard" },
    { label: "", description: "" },
  ]);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].severity, "SOFT");
  assert.equal(normalized[1].label, "기억의 연속성");
  assert.equal(normalized[1].severity, "SOFT");
  assert.equal(normalized[2].severity, "HARD");
  assert.match(normalized[0].ref, /^invariant:/u);

  const oldProject = normalizeProject({ title: "기존 레거시", protagonistInvariants: normalized });
  assert.equal(oldProject.packageTarget, "legacy");
  assert.deepEqual(oldProject.protagonistInvariants, []);
});

test("Cortex validation warns above five items and rejects duplicate stable refs", () => {
  const project = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
  project.protagonistInvariants = [...defaultProtagonistInvariants(), ...defaultProtagonistInvariants().slice(0, 2)];
  const issues = validateProject(project).filter((issue) => issue.area === "캐릭터 불변식");
  assert.equal(issues.some((issue) => issue.severity === "warning" && /5개/u.test(issue.message)), true);
  assert.equal(issues.some((issue) => issue.severity === "error" && /중복/u.test(issue.message)), true);
});

test("character invariants retain their selected target in the runtime contract", () => {
  const project = makeProjectForPackageTarget("cortex", "instant_story", false);
  const npc = { ...blankCharacter(false), id: "NPC_GUARD", name: "문지기" };
  project.npcs = [npc];
  project.protagonistInvariants.push({ ref: "invariant:guard-duty", characterId: npc.id, label: "임무 지속", severity: "SOFT", description: "문이 열린 뒤에도 경계 임무를 이어 갈 수 있다." });
  const runtime = characterInvariantsForRuntime(project);
  const targeted = runtime.find((item) => item.ref === "invariant:guard-duty");
  assert.equal(targeted?.characterId, npc.id);
  assert.equal(targeted?.characterName, npc.name);
  assert.match(targeted?.description ?? "", /NPC_GUARD/u);
  assert.equal(validateProject(project).some((issue) => issue.severity === "error" && /삭제되었거나/u.test(issue.message)), false);
});

test("CortexPack exports its target contract without changing the legacy runtime payload", async () => {
  const cortex = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
  const cortexSummary = await exportScenarioPack(cortex, false);
  const cortexArchive = await JSZip.loadAsync(await cortexSummary.blob.arrayBuffer());
  const cortexManifest = JSON.parse(await cortexArchive.file("manifest.json")!.async("string"));
  const cortexProject = JSON.parse(await cortexArchive.file("project.json")!.async("string"));
  const dedicated = JSON.parse(await cortexArchive.file("cortex/protagonist_invariants.json")!.async("string"));
  const runtimeInvariants = characterInvariantsForRuntime(cortex);

  assert.equal(cortexManifest.packageTarget, "cortex");
  assert.equal(cortexManifest.format, CORTEX_PACKAGE_FORMAT);
  assert.equal(cortexManifest.minimumTargetVersion, CORTEX_MIN_VERSION);
  assert.equal(cortexManifest.features.includes(CORTEX_PACKAGE_FEATURE_ID), true);
  assert.equal(cortexManifest.requiredFeatures.includes(CORTEX_PACKAGE_FEATURE_ID), true);
  assert.deepEqual(cortexProject.protagonistInvariants, runtimeInvariants);
  assert.deepEqual(dedicated, runtimeInvariants);
  assert.match(buildMarkdown(cortex), /"protagonistInvariants"/u);
  assert.deepEqual(buildImportObject(cortex).protagonistInvariants, runtimeInvariants);

  const legacy = makeProjectForPackageTarget("legacy", "intelligent_canon", false);
  const legacySummary = await exportScenarioPack(legacy, false);
  const legacyArchive = await JSZip.loadAsync(await legacySummary.blob.arrayBuffer());
  const legacyManifest = JSON.parse(await legacyArchive.file("manifest.json")!.async("string"));
  const legacyProject = JSON.parse(await legacyArchive.file("project.json")!.async("string"));
  assert.equal("packageTarget" in legacyManifest, false);
  assert.equal("packageTarget" in legacyProject, false);
  assert.equal("protagonistInvariants" in legacyProject, false);
  assert.equal(legacyArchive.file("cortex/protagonist_invariants.json"), null);
  assert.doesNotMatch(buildMarkdown(legacy), /PROTAGONIST_INVARIANTS/u);
});

test("Cortex v1.42.0 package exports the complete runtime contract and preserves editor roundtrip", async () => {
  const project = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
  project.locationGraph = {
    schema: "CORTEX_LOCATION_GRAPH_V1",
    nodes: [
      { locationRef: "location:home", label: "집", aliases: ["서촌 집"] },
      { locationRef: "location:alley", label: "골목", aliases: ["서촌 골목"] },
    ],
    links: [{ from: "location:home", to: "location:alley", relation: "ADJACENT_TO", minimumTravelSec: 120 }],
  };
  project.world.locationEntityRef = "location:home";
  project.disclosure = { protectedTerms: ["거짓 왕관"] };
  project.events = [{
    ...blankStoryEvent(1),
    id: "EV_ACT1_01_CROWN",
    name: "왕관의 흔적",
    act: "ACT1",
    required: true,
    canonLocation: "집",
    canonLocationRef: "location:home",
    transitionLocationRefs: ["location:alley"],
    observationLocationRefs: [],
    storyDay: 0,
    startTime: "08:00:00",
    endTime: "09:00:00",
    beats: [blankStoryBeat(1), blankStoryBeat(2), blankStoryBeat(3)],
    requiredFunctions: [{ id: "goal-crown", type: "PHYSICAL_FACT", description: "탁자 위에 봉인된 상자가 놓인다", alternatives: ["상자를 직접 확인한다"], required: true }],
    revealTerms: ["거짓 왕관"],
    recoveryAlternatives: "구형 필드는 출력하지 않는다",
  }];
  const summary = await exportScenarioPack(project, false);
  const archive = await JSZip.loadAsync(await summary.blob.arrayBuffer());
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  const events = JSON.parse(await archive.file("events/events.json")!.async("string"));
  const lint = JSON.parse(await archive.file("reports/cortex-package-lint.json")!.async("string"));
  assert.equal(manifest.minimumTargetVersion, "1.42.0");
  assert.equal(manifest.packageContract.schema, "CORTEX_STUDIO_PACKAGE_CONTRACT_V2");
  for (const path of manifest.packageContract.requiredFiles) assert.notEqual(archive.file(path), null, path);
  assert.equal(events[0].beats.length, 3);
  assert.equal(events[0].beats.every((beat: { goal?: string }) => Boolean(beat.goal)), true);
  assert.equal(events[0].requiredFunctions[0].type, "READER_UNDERSTANDING");
  assert.deepEqual(events[0].revealTerms, ["거짓 왕관"]);
  assert.equal("recoveryAlternatives" in events[0], false);
  assert.equal(lint.errors, 0);
  const snapshot = JSON.parse(await archive.file("studio/project-snapshot.json")!.async("string"));
  assert.equal(snapshot.project.events[0].recoveryAlternatives, "구형 필드는 출력하지 않는다");
});

test("Cortex Instant remains a complete Instant runtime while adding Cortex invariants", async () => {
  const project = makeProjectForPackageTarget("cortex", "instant_story", false);
  const summary = await exportScenarioPack(project, false);
  const archive = await JSZip.loadAsync(await summary.blob.arrayBuffer());
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  const readme = await archive.file("README.md")!.async("string");

  assert.equal(archive.file("rules/instant_story_runtime.json") !== null, true);
  assert.equal(archive.file("INSTANT_RUNTIME_IMPORT.json") !== null, true);
  assert.equal(archive.file("cortex/protagonist_invariants.json") !== null, true);
  assert.equal(manifest.requiredFeatures.includes(CORTEX_PACKAGE_FEATURE_ID), true);
  assert.equal(manifest.requiredFeatures.includes("instant_story_runtime_v2"), true);
  assert.match(readme, /CortexPack/u);
  assert.match(readme, /Instant Story Runtime v2/u);
});
