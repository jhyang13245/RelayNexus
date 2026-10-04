import assert from "node:assert/strict";
import test from "node:test";

import {
  hydrateProjectImportSnapshot,
  PROJECT_IMPORT_INLINE_BODY_BUDGET_BYTES,
  serializeProjectImport,
} from "../lib/project-import-transfer";

test("작품 불러오기 전송본은 스냅샷의 중복 pack을 제거한다", () => {
  const pack = {
    projectId: "CHRONOS_CORE_MASTER_V180",
    title: "크로노스 코어",
    events: [{ id: "event-1", body: "x".repeat(390_000) }],
  };
  const snapshot = {
    pack,
    state: { turn: 0, day: 1, location: "박은서의 방" },
    turns: [],
    longTermMemories: [],
    totalCostUsd: 0,
    lastMode: "mock" as const,
  };

  const transfer = serializeProjectImport(256_613, pack, snapshot);

  assert.equal(JSON.parse(transfer.snapshotJson).pack, undefined);
  assert.equal(JSON.parse(transfer.packJson).projectId, "CHRONOS_CORE_MASTER_V180");
  assert.ok(transfer.estimatedInlineBodyBytes > PROJECT_IMPORT_INLINE_BODY_BUDGET_BYTES);
  assert.equal(transfer.usesMultipartUpload, true);
  assert.ok(
    transfer.packJson.length + transfer.snapshotJson.length
      < transfer.packJson.length * 2,
  );
});

test("서버는 전송에서 뺀 pack을 권위 있는 작품 설정으로 재조립한다", () => {
  const pack = { projectId: "canonical", title: "정본" };
  const hydrated = hydrateProjectImportSnapshot(pack, {
    pack: { projectId: "stale" },
    state: { turn: 0 },
  });

  assert.deepEqual(hydrated.pack, pack);
  assert.deepEqual(hydrated.state, { turn: 0 });
});

test("Hub 표지까지 포함한 실제 요청 크기로 분할 업로드를 결정한다", () => {
  const pack = { projectId: "moonlight", title: "달빛 아래 연청" };
  const snapshot = { pack, state: { turn: 0 }, turns: [] };
  const withoutCover = serializeProjectImport(120_000, pack, snapshot);
  const withCover = serializeProjectImport(120_000, pack, snapshot, 560_000);

  assert.equal(withoutCover.usesMultipartUpload, false);
  assert.equal(withCover.usesMultipartUpload, true);
  assert.equal(
    withCover.estimatedInlineBodyBytes - withoutCover.estimatedInlineBodyBytes,
    560_000,
  );
});
