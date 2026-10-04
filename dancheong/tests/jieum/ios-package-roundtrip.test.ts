import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { exportScenarioPack, extractStudioProjectFromPackage, PROJECT_SNAPSHOT_FORMAT } from "../../features/jieum/studio-export";
import { makeProject } from "../../features/jieum/studio-model";

test("iOS-safe V2 snapshot stores image bytes once and restores Blob previews", async () => {
  const project = makeProject(true);
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const sourceBlob = new Blob([bytes], { type: "image/png" });
  project.player.images = [{
    id: "IMG_IOS",
    fileName: "ios-safe.png",
    mimeType: "image/png",
    dataUrl: URL.createObjectURL(sourceBlob),
    sourceBlob,
    label: "대표 기준 이미지",
    isPrimary: true,
    addedAt: new Date(0).toISOString(),
  }];

  const summary = await exportScenarioPack(project, false);
  const archive = await JSZip.loadAsync(await summary.blob.arrayBuffer());
  const snapshotText = await archive.file("studio/project-snapshot.json")!.async("string");
  const snapshot = JSON.parse(snapshotText);
  assert.equal(snapshot.format, PROJECT_SNAPSHOT_FORMAT);
  assert.equal(snapshot.imageStorage, "zip_asset_ref");
  assert.equal(snapshot.project.player.images[0].dataUrl, undefined);
  assert.equal(snapshot.project.player.images[0].sourceBlob, undefined);
  assert.equal(archive.file(snapshot.project.player.images[0].assetPath) !== null, true);

  const restored = await extractStudioProjectFromPackage(summary.blob);
  const restoredImage = (restored.project.player as { images: Array<{ sourceBlob?: Blob; dataUrl: string }> }).images[0];
  assert.equal(restored.fullFidelity, true);
  assert.equal(restored.source, "embedded_snapshot");
  assert.equal(restoredImage.sourceBlob instanceof Blob, true);
  assert.match(restoredImage.dataUrl, /^blob:/);
  assert.deepEqual(new Uint8Array(await restoredImage.sourceBlob!.arrayBuffer()), bytes);
});
