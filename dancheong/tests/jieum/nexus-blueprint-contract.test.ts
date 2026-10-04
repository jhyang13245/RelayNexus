import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { nexusBlueprint } from "./fixtures/nexus-blueprint";
import { projectFromNexusBlueprint } from "../../features/jieum/nexus-blueprint";
import { exportScenarioPack, statusWindowRuntime, extractStudioProjectFromPackage } from "../../features/jieum/studio-export";
import { CORTEX_TARGET_VERSION } from "../../features/jieum/cortex-target";
import { normalizeProject } from "../../features/jieum/studio-model";

for (const mode of ["intelligent_canon", "instant_story"] as const) {
  test("Nexus " + mode + " preserves Cortex contracts through export and editor roundtrip", async () => {
    const project = projectFromNexusBlueprint(nexusBlueprint(mode));
    assert.equal(project.packageTarget, "cortex");
    assert.equal(project.player.id, "PC_REPORTER");
    assert.equal(project.npcs[0].id, "NPC_SHAMAN");
    assert.equal(project.npcs[0].preRevealAlias, "무녀");
    assert.equal(project.statusWindow.relationshipDisplays[0].entityId, "NPC_SHAMAN");
    assert.equal(statusWindowRuntime(project).relationshipDisplay.entries[0].stat?.current, 5);
    assert.deepEqual(project.disclosure.protectedTerms, ["흑월인"]);
    assert.equal(project.protagonistInvariants.length, 1);
    if (mode === "intelligent_canon") {
      assert.equal(project.events[0].nextEventId, "EVT_ARCHIVE");
      assert.equal(project.events[1].required, false);
      assert.equal(project.events[0].cortexDesign?.closureConditions[0].id, "EVT_SEAL_SEAL");
    } else {
      assert.equal(project.events.length, 0);
      assert.equal(project.instantStory.startProfiles[0].prologue, "멈춘 시계 앞");
    }
    const output = await exportScenarioPack(project, false);
    const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    assert.equal(manifest.minimumTargetVersion, CORTEX_TARGET_VERSION);
    assert.equal(manifest.packageTarget, "cortex");
    const restored = await extractStudioProjectFromPackage(new File([output.blob], "cortex.zip"));
    const restoredProject = normalizeProject(restored.project);
    assert.deepEqual(restoredProject.statusWindow.relationshipDisplays, project.statusWindow.relationshipDisplays);
    assert.deepEqual(restoredProject.protagonistInvariants, project.protagonistInvariants);
  });
}

test("invalid or newer target and broken stable references fail visibly", () => {
  const newer = nexusBlueprint(); newer.target.minimumTargetVersion = "9.0.0";
  assert.throws(() => projectFromNexusBlueprint(newer), /지원하지 않는/);
  const duplicate = nexusBlueprint(); duplicate.project.npcs[0].id = "PC_REPORTER";
  assert.throws(() => projectFromNexusBlueprint(duplicate), /중복/);
  const broken = nexusBlueprint(); broken.project.events[0].nextEventId = "MISSING";
  assert.throws(() => projectFromNexusBlueprint(broken), /후속 사건/);
  const hud = nexusBlueprint(); hud.project.statusWindow.relationshipDisplay.entries[0].entityId = "MISSING";
  assert.throws(() => projectFromNexusBlueprint(hud), /관계 HUD/);
  const legacy = nexusBlueprint(); delete (legacy as { target?: unknown }).target;
  assert.equal(projectFromNexusBlueprint(legacy).packageTarget, "cortex");
});

test("modern Instant blueprint keeps the compact setting book and three opening waves", () => {
  const blueprint: any = nexusBlueprint("instant_story");
  blueprint.project.gmData = { worldTruthLedger: "시계는 봉인을 유지하는 장치다." };
  blueprint.project.instantStory = {
    corePrompt: "멈춘 시간을 자유롭게 조사한다.",
    startProfiles: [{
      id: "START_CLOCK",
      name: "멈춘 시계",
      prologue: "역전 시계가 아홉 시에 멈췄다.",
      startSituation: "서윤은 젖은 봉투를 들고 시계 앞에 서 있다.",
      recommendedReplies: ["봉투를 살핀다", "무녀에게 시계를 묻는다", "시계탑 안으로 들어간다"],
    }],
    exampleScenes: [{ id: "EX_CLOCK", userInput: "시곗바늘을 만진다.", narration: "차가운 진동이 손끝에 번졌다.", recommendations: [] }],
    keywordNotes: [{ id: "NOTE_CLOCK", title: "멈춘 시계", keywords: ["시계"], priority: 90, content: "아홉 시를 가리킨다." }],
  };
  const project = projectFromNexusBlueprint(blueprint);
  assert.equal(project.gmData.worldTruthLedger, "시계는 봉인을 유지하는 장치다.");
  assert.deepEqual(project.instantStory.startProfiles[0].recommendedReplies, ["봉투를 살핀다", "무녀에게 시계를 묻는다", "시계탑 안으로 들어간다"]);
  assert.equal(project.instantStory.exampleScenes[0].narration, "차가운 진동이 손끝에 번졌다.");
  assert.deepEqual(project.instantStory.keywordNotes[0].keywords, ["시계"]);
});
