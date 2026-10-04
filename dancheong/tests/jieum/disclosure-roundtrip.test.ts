import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { makeNewStudioProject, normalizeProject, convertLotusProjectToCortex } from "../../features/jieum/studio-model";
import { buildImportObject, exportScenarioPack, extractStudioProjectFromPackage, PROJECT_SNAPSHOT_FORMAT } from "../../features/jieum/studio-export";
import { assertCortexExportReviewed } from "../../features/jieum/cortex-export-review";

const terms = ["은빛 봉인의 진명", "제칠관측소의 비밀"];
async function inputs(zip: JSZip) {
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return [bytes, new Blob([new Uint8Array(bytes)])];
}
for (const version of ["none", "1.9.0", "2.0.1"]) test(`separate disclosure survives ${version} import on streaming and buffer paths`, async () => {
  const p: any = makeNewStudioProject(); delete p.disclosure;
  const zip = new JSZip().file("project.json", JSON.stringify(p)).file("disclosure.json", JSON.stringify({ protectedTerms: terms }));
  if (version !== "none") zip.file("studio/project-snapshot.json", JSON.stringify({ format: PROJECT_SNAPSHOT_FORMAT, studioVersion: version, project: p }));
  for (const input of await inputs(zip)) {
    const restored = normalizeProject((await extractStudioProjectFromPackage(input)).project);
    assert.deepEqual(restored.disclosure.protectedTerms, terms);
  }
});

test("legacy top-level declarations migrate without promoting event or GM text", () => {
  const p: any = makeNewStudioProject(); delete p.disclosure;
  p.packageTarget = "legacy"; p.protectedTerms = terms;
  p.gmData.forbiddenDisclosures = "추측해서 등록하면 안 되는 비밀";
  const normalized = normalizeProject(p);
  assert.deepEqual(normalized.disclosure.protectedTerms, terms);
  assert.deepEqual(convertLotusProjectToCortex(normalized).project.disclosure.protectedTerms, terms);
});

test("conflicting modern protection declarations and malformed dedicated files fail visibly", async () => {
  const p = makeNewStudioProject();
  const zip = new JSZip().file("project.json", JSON.stringify(p)).file("disclosure.json", JSON.stringify({ protectedTerms: terms })).file("studio/project-snapshot.json", JSON.stringify({ format: PROJECT_SNAPSHOT_FORMAT, studioVersion: "2.0.1", project: p }));
  for (const input of await inputs(zip)) await assert.rejects(extractStudioProjectFromPackage(input), /보호어 목록이 다릅니다/);
  zip.remove("studio/project-snapshot.json"); zip.file("disclosure.json", '{"protectedTerms":"broken"}');
  for (const input of await inputs(zip)) await assert.rejects(extractStudioProjectFromPackage(input), /보호어.*형식/);
});

test("explicit modern empty list remains empty rather than guessed from private material", async () => {
  const p = makeNewStudioProject(); p.gmData.forbiddenDisclosures = "감춰야 할 진명";
  const output = await exportScenarioPack(p, false);
  for (const input of [output.blob, new Uint8Array(await output.blob.arrayBuffer())]) assert.deepEqual(normalizeProject((await extractStudioProjectFromPackage(input)).project).disclosure.protectedTerms, []);
});

for (const mode of ["intelligent_canon", "instant_story"] as const) test(`${mode}: original/screen exports and import JSON keep explicit protection`, async () => {
  const p = makeNewStudioProject(); p.runtimeMode = mode; p.disclosure.protectedTerms = terms;
  assert.deepEqual(buildImportObject(p).disclosure?.protectedTerms, terms);
  for (const imageMode of ["original", "screen"] as const) {
    const output = await exportScenarioPack(p, false, { imageMode });
    const archive = await JSZip.loadAsync(await output.blob.arrayBuffer());
    assert.deepEqual(JSON.parse(await archive.file("disclosure.json")!.async("string")).protectedTerms, terms);
    assert.deepEqual(normalizeProject((await extractStudioProjectFromPackage(output.blob)).project).disclosure.protectedTerms, terms);
    if (mode === "intelligent_canon") {
      const policy = JSON.parse(await archive.file("cortex/event_policy.json")!.async("string"));
      assert.equal(policy.engineAdapterRequired, false);
      assert.equal(policy.baseEngineConsumesThisFile, false);
    }
  }
});

test("download review requires empty-protection acknowledgement only for Canon runtime", () => {
  const p = makeNewStudioProject();
  assert.throws(() => assertCortexExportReviewed(p, {}), /보호어가 0개/);
  assert.doesNotThrow(() => assertCortexExportReviewed(p, { acknowledgeEmptyProtection: true }));
  assert.doesNotThrow(() => assertCortexExportReviewed(p, { acknowledgeEmptyProtection: true, acknowledgeUnsupportedPolicy: true }));
  p.runtimeMode = "instant_story";
  assert.doesNotThrow(() => assertCortexExportReviewed(p, {}));
  p.disclosure.protectedTerms = terms;
  assert.doesNotThrow(() => assertCortexExportReviewed(p, {}));
  assert.doesNotThrow(() => assertCortexExportReviewed(p, { acknowledgeUnsupportedPolicy: true }));
});
