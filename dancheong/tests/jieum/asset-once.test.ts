import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import JSZip from "jszip";
import { buildPackageAssetIndex, buildPackageProject, EMBEDDED_PROJECT_SNAPSHOT_PATH, exportScenarioPack, extractStudioProjectFromPackage, mediaAssetManifest } from "../../features/jieum/studio-export";
import { blankCharacter, makeProject } from "../../features/jieum/studio-model";

const bytes = Buffer.from([0, 1, 2, 3, 254, 255]);
const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
const image = (id: string) => ({
  id,
  fileName: "same.png",
  mimeType: "image/png",
  dataUrl,
  label: "원본",
  isPrimary: true,
  addedAt: "2026-08-22T00:00:00.000Z",
});

test("legacy packages rehydrate Studio images from Asset-Once files", async () => {
  const project = makeProject(false);
  project.title = "구형 패키지 복원";
  project.player.images = [image("PLAYER_IMAGE")];
  const exported = await exportScenarioPack(project, false);
  const archive = await JSZip.loadAsync(await exported.blob.arrayBuffer());
  archive.remove(EMBEDDED_PROJECT_SNAPSHOT_PATH);
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  delete manifest.editorSource;
  manifest.features = manifest.features.filter((feature: string) => feature !== "embedded_studio_project_v1");
  archive.file("manifest.json", JSON.stringify(manifest));
  const legacyBytes = await archive.generateAsync({ type: "uint8array" });
  const restored = await extractStudioProjectFromPackage(legacyBytes);
  assert.equal(restored.fullFidelity, false);
  assert.equal(restored.source, "legacy_package_project");
  assert.equal((restored.project.player as typeof project.player).images[0].dataUrl, dataUrl);
});

test("Asset-Once stores identical originals once without mutating the working project", async () => {
  const project = makeProject(false);
  project.player.images = [image("PLAYER_IMAGE")];
  const npc = blankCharacter(false);
  npc.id = "NPC_TEST";
  npc.name = "테스트 NPC";
  npc.images = [image("NPC_IMAGE")];
  project.npcs = [npc];

  const index = await buildPackageAssetIndex(project);
  const packaged = buildPackageProject(project, index);
  const manifest = mediaAssetManifest(project, index);
  const expectedSha = createHash("sha256").update(bytes).digest("hex");

  assert.equal(index.logicalAssetCount, 2);
  assert.equal(index.uniqueAssets.length, 1);
  assert.equal(index.originalAssetBytes, bytes.length * 2);
  assert.equal(index.uniqueAssets[0].byteLength, bytes.length);
  assert.deepEqual(Buffer.from(index.uniqueAssets[0].bytes), bytes);
  assert.equal(index.uniqueAssets[0].sha256, expectedSha);

  assert.equal(project.player.images[0].dataUrl, dataUrl);
  assert.equal(project.npcs[0].images[0].dataUrl, dataUrl);
  assert.equal("dataUrl" in packaged.player.images[0], false);
  assert.equal("dataUrl" in packaged.npcs[0].images[0], false);
  assert.equal(packaged.player.images[0].assetPath, packaged.npcs[0].images[0].assetPath);
  assert.equal(packaged.player.images[0].assetRef, `sha256:${expectedSha}`);
  assert.equal(JSON.stringify(packaged).includes(dataUrl), false);

  assert.equal(manifest.storage?.format, "RELAY_NOVEL_ASSET_ONCE_V1");
  assert.equal(manifest.storage?.logicalAssetCount, 2);
  assert.equal(manifest.storage?.storedAssetCount, 1);
  assert.equal(manifest.assets.length, 2);
  assert.ok(manifest.assets.every((asset) => asset.sha256 === expectedSha));
});
