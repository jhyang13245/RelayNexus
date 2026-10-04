import assert from "node:assert/strict";
import test from "node:test";

import {
  CORTEX_NATIVE_PACK_FORMAT,
  CORTEX_RUNTIME_MODEL_FORMAT,
  createCortexRuntimeModelEnvelope,
  detectCortexPackageKind,
  negotiateCortexPackage,
  validateCortexNativeDocumentPaths,
} from "../lib/cortex-pack-contract";

const nativeManifest = {
  packageFormat: CORTEX_NATIVE_PACK_FORMAT,
  packageVersion: "1.0",
  projectId: "RN-CORTEX-001",
  title: "Cortex 골든 작품",
  runtimeProfile: "canonical_story",
  runtimeEngine: { id: "cortex", minimumVersion: "1.4.0" },
  requiredFeatures: [
    "cortex_native_runtime_v1",
    "cortex_canon_memory_v1",
    "cortex_chronology_v1",
    "cortex_disclosure_guard_v1",
    "asset_once_storage",
  ],
  optionalFeatures: ["status_relationship_display_v1"],
  unsupportedBehavior: "reject_package",
};

test("Cortex Native Pack V1을 Legacy와 구분하고 기능을 협상한다", () => {
  assert.equal(detectCortexPackageKind(nativeManifest), "native_v1");
  const result = negotiateCortexPackage(nativeManifest);
  assert.equal(result.native, true);
  assert.equal(result.runtimeProfile, "canonical_story");
  assert.equal(result.lossless, true);
  assert.ok(result.mappedFeatures.includes("cortex_canon_memory_v1"));
});

test("Native Pack의 미지원 필수 기능은 축소 실행하지 않고 거부한다", () => {
  assert.throws(() => negotiateCortexPackage({
    ...nativeManifest,
    requiredFeatures: [...nativeManifest.requiredFeatures, "future_required_v9"],
  }), /지원하지 않는 Native Pack 필수 기능/u);
});

test("Native Pack은 Cortex 핵심 기능을 선택 기능으로 낮출 수 없다", () => {
  assert.throws(() => negotiateCortexPackage({
    ...nativeManifest,
    requiredFeatures: ["cortex_native_runtime_v1"],
  }), /핵심 필수 기능 선언이 없습니다/u);
});

test("현재 Cortex보다 새로운 엔진이 필요한 Native Pack은 실행하지 않는다", () => {
  assert.throws(() => negotiateCortexPackage({
    ...nativeManifest,
    runtimeEngine: { id: "cortex", minimumVersion: "9.0.0" },
  }), /Cortex 9\.0\.0 이상이 필요/u);
});

test("Instant Story Runtime v2 Legacy Pack은 instant profile과 독립 실행 의미를 보존한다", () => {
  const result = negotiateCortexPackage({
    packageVersion: "1.5",
    runtimeMode: "instant_story",
    exclusiveRuntime: true,
    requiredFeatures: ["instant_story_runtime_v2"],
    unsupportedBehavior: "reject_package",
  });
  assert.equal(result.packageKind, "legacy_scenario_1_5");
  assert.equal(result.runtimeProfile, "instant_story");
  assert.equal(result.native, false);
  assert.equal(result.lossless, true);
});

test("Instant Story Runtime v2 독립 실행 계약이 손상되면 Adapter가 거부한다", () => {
  assert.throws(() => negotiateCortexPackage({
    packageVersion: "1.5",
    runtimeMode: "instant_story",
    exclusiveRuntime: false,
    requiredFeatures: ["instant_story_runtime_v2"],
    unsupportedBehavior: "fallback",
  }), /독립 실행·거부 정책/u);
});

test("Native 필수 문서 누락을 결정적으로 보고한다", () => {
  const missing = validateCortexNativeDocumentPaths([
    "manifest.json",
    "project.json",
  ]);
  assert.ok(missing.includes("cortex/runtime.json"));
  assert.ok(missing.includes("assets/manifest.json"));
  assert.ok(!missing.includes("manifest.json"));
});

test("Native 문서를 공통 Cortex Runtime Model envelope로 컴파일한다", () => {
  const model = createCortexRuntimeModelEnvelope({
    manifest: nativeManifest,
    documents: {
      "project.json": { projectId: "RN-CORTEX-001", title: "Cortex 골든 작품" },
      "world/world.json": { location: "도서관" },
      "characters/player.json": { id: "PLAYER", name: "한시우" },
      "characters/npcs.json": [{ id: "NPC-1", name: "나디아" }],
      "cortex/canon_graph.json": { events: [{ id: "EVENT-1" }] },
      "cortex/chronology.json": { startTime: "15:27" },
      "cortex/disclosure.json": { entities: [] },
      "cortex/memory_contract.json": { kinds: ["promise"] },
      "cortex/absorption_anchors.json": { anchors: [{ id: "ABSORB-1" }] },
      "rules/status_window.json": { enabled: true },
      "assets/manifest.json": { format: "RELAY_NOVEL_ASSET_ONCE_V1" },
    },
  });
  assert.equal(model.format, CORTEX_RUNTIME_MODEL_FORMAT);
  assert.equal(model.identity.projectId, "RN-CORTEX-001");
  assert.equal(model.runtimeProfile, "canonical_story");
  assert.equal(model.characters.length, 2);
  assert.equal(model.absorptionAnchors.length, 1);
});
