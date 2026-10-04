import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import JSZip from "jszip";
import { isOptimizableImage, prepareProjectImages, screenImageSize, type ScreenImageEncoder } from "../../features/jieum/image-optimization";
import { blankImageTrigger, makeNewStudioProject, makeProjectForPackageTarget, normalizeProject, type CharacterImage } from "../../features/jieum/studio-model";
import { exportScenarioPack, extractStudioProjectFromPackage } from "../../features/jieum/studio-export";

const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGOUTLmzgIECwESJ5lEDRg0YNWAwGQAAQyMCGeJeB/wAAAAASUVORK5CYII=", "base64");
const webpBytes = Buffer.from("UklGRmAAAABXRUJQVlA4WAoAAAAQAAAADwAADwAAQUxQSAoAAAABB1DQiAhERP8DVlA4IDAAAADQAQCdASoQABAAAUAmJaACdLoB+AADsAD+8Bvf/20P60P60P+o7/8/Mvlv3xmAAAA=", "base64");
const image = (id = "IMG"): CharacterImage => ({ id, fileName: "portrait.png", mimeType: "image/png", dataUrl: "", sourceBlob: new Blob([pngBytes, new Uint8Array(1000)], { type: "image/png" }), label: "대표 이미지", isPrimary: true, addedAt: "2026-09-07" });
const encoder: ScreenImageEncoder = async () => ({ blob: new Blob([webpBytes], { type: "image/webp" }), width: 16, height: 16 });

test("screen dimensions preserve aspect ratio and never enlarge small artwork", () => {
  assert.deepEqual(screenImageSize(3200, 1800), { width: 1600, height: 900 });
  assert.deepEqual(screenImageSize(320, 480), { width: 320, height: 480 });
});

test("animation containers and unsupported formats stay original", async () => {
  const animationChunk = Buffer.alloc(12);
  animationChunk.write("acTL", 4);
  assert.equal(await isOptimizableImage(new Blob([pngBytes.subarray(0, 8), animationChunk], { type: "image/png" })), false);
  const webp = Buffer.alloc(20);
  webp.write("ANIM", 12);
  assert.equal(await isOptimizableImage(new Blob([webp], { type: "image/webp" })), false);
  assert.equal(await isOptimizableImage(new Blob(["GIF89a"], { type: "image/gif" })), false);
  assert.equal(await isOptimizableImage(new Blob([pngBytes], { type: "image/png" })), true);
});

test("conversion shares duplicate sources and leaves all draft data unchanged", async () => {
  const project = makeNewStudioProject();
  const original = image();
  project.player.images = [original];
  const trigger = blankImageTrigger();
  trigger.attachedImages = [{ ...original, id: "TRIGGER_IMAGE", label: "별도 장면" }];
  project.imageTriggers = [trigger];
  let calls = 0;
  const progress: number[] = [];
  const result = await prepareProjectImages(project, "screen", (p) => progress.push(p.completed), async (blob) => { calls++; return encoder(blob); });
  assert.equal(calls, 1);
  assert.deepEqual(progress, [0, 1, 2]);
  assert.equal(project.player.images[0], original);
  assert.equal(project.player.images[0].mimeType, "image/png");
  assert.equal(result.project.player.images[0].mimeType, "image/webp");
  assert.equal(result.project.player.images[0].sourceBlob, result.project.imageTriggers[0].attachedImages[0].sourceBlob);
  assert.equal(result.project.imageTriggers[0].attachedImages[0].label, "별도 장면");
  assert.equal(result.project.events, project.events);
  assert.equal(result.project.world, project.world);
  const repeated = await prepareProjectImages(result.project, "screen", undefined, async () => { throw new Error("must not recompress"); });
  assert.equal(repeated.report.converted, 0);
  assert.equal(repeated.project.player.images[0], result.project.player.images[0]);
});

test("encoder failure and size growth retain original bytes", async () => {
  const project = makeNewStudioProject();
  project.player.images = [image()];
  for (const encode of [async () => { throw new Error("no codec"); }, async (blob: Blob) => ({ blob, width: 16, height: 16 })]) {
    const result = await prepareProjectImages(project, "screen", undefined, encode);
    assert.equal(result.report.converted, 0);
    assert.equal(result.project.player.images[0], project.player.images[0]);
  }
  const original = await prepareProjectImages(project, "original", undefined, async () => { throw new Error("must not encode backup"); });
  assert.equal(original.project, project);
});

for (const target of ["cortex", "legacy"] as const) for (const runtime of ["intelligent_canon", "instant_story"] as const) {
  test(`${target}/${runtime}: optimized assets round trip with matching path, MIME, digest and editor references`, async () => {
    const project = makeProjectForPackageTarget(target, runtime, true);
    project.player.images = [image()];
    const prepared = await prepareProjectImages(project, "screen", undefined, encoder);
    const exported = await exportScenarioPack(prepared.project, false);
    const archive = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    const snapshot = JSON.parse(await archive.file("studio/project-snapshot.json")!.async("string"));
    const packaged = snapshot.project.player.images[0];
    assert.match(packaged.assetPath, /\.webp$/);
    assert.equal(packaged.mimeType, "image/webp");
    assert.equal(packaged.dataUrlHeader, "data:image/webp;base64");
    assert.equal(packaged.sha256, createHash("sha256").update(webpBytes).digest("hex"));
    assert.deepEqual(Buffer.from(await archive.file(packaged.assetPath)!.async("uint8array")), webpBytes);
    const restored = await extractStudioProjectFromPackage(new Uint8Array(await exported.blob.arrayBuffer()));
    assert.equal(restored.fullFidelity, true);
    const normalized = normalizeProject(restored.project);
    assert.equal(normalized.player.images[0].imageOptimization?.profile, "screen_v1");
    assert.equal(normalized.player.images[0].dataUrl, `data:image/webp;base64,${webpBytes.toString("base64")}`);
    assert.equal(normalized.packageTarget, target);
    assert.equal(normalized.runtimeMode, runtime);
    assert.equal(project.player.images[0].mimeType, "image/png");
    const mobile = normalizeProject((await extractStudioProjectFromPackage(exported.blob)).project);
    assert.equal(mobile.player.images[0].mimeType, "image/webp");
    assert.deepEqual(Buffer.from(await mobile.player.images[0].sourceBlob!.arrayBuffer()), webpBytes);
    URL.revokeObjectURL(mobile.player.images[0].dataUrl);
  });
}
