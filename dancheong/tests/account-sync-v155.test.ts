import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("v1.5.6 세션 저장은 리비전 일치 때만 갱신한다", async () => {
  const source = await read("app/api/sessions/[sessionId]/route.ts");
  assert.match(source, /expectedRevision/);
  assert.match(source, /AND revision = \?/);
  assert.match(source, /SESSION_CONFLICT/);
  assert.match(source, /kind: "CONFLICT"/);
});

test("대용량 작품·세션·체크포인트 JSON은 무결성 포인터로 R2에 저장한다", async () => {
  const schema = await read("db/schema.ts");
  const runtimeStore = await read("lib/runtime-json-store.ts");
  const sessionRoute = await read("app/api/sessions/[sessionId]/route.ts");
  assert.match(schema, /packR2Key/);
  assert.match(schema, /snapshotR2Key/);
  assert.match(runtimeStore, /RELAY_NEXUS_R2_JSON_POINTER_V1/);
  assert.match(runtimeStore, /SHA-256 검증에 실패/);
  assert.match(sessionRoute, /readSessionSnapshotText/);
  assert.match(sessionRoute, /runtimeJsonDigest/);
  assert.match(sessionRoute, /unchanged: true/);
});

test("리비전과 서버 스냅샷 기준선은 세션별로 분리되고 충돌 중 입력은 잠긴다", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /sessionRevisionsRef = useRef/);
  assert.match(page, /lastServerSnapshotJsonRef = useRef/);
  assert.doesNotMatch(page, /sessionRevisionRef/);
  assert.match(page, /lastServerSnapshotJsonRef\.current\.get\(originSessionId\) === snapshotJson/);
  assert.match(page, /sync-conflict-panel/);
  assert.match(page, /sessionRefreshing \|\| syncConflict/);
});

test("본문 커밋 뒤 비용·체크포인트 부가 작업 실패는 성공 저장을 뒤집지 않는다", async () => {
  const source = await read("app/api/sessions/[sessionId]/route.ts");
  assert.match(source, /const sidecarWarnings: string\[\] = \[\]/);
  assert.match(source, /비용 장부 반영 지연/);
  assert.match(source, /자동 복구 지점 생성 지연/);
  assert.match(source, /sidecarWarnings,/);
});

test("복구는 누적 비용을 되감지 않고 비용 저장은 최근 변경분만 처리한다", async () => {
  const restore = await read(
    "app/api/sessions/[sessionId]/checkpoints/[checkpointId]/restore/route.ts",
  );
  const costStore = await read("lib/cost-meter-store.ts");
  assert.match(restore, /Math\.max\(/);
  assert.match(costStore, /turns\.slice\(-4\)/);
  assert.match(costStore, /cost_meter_backfill_state/);
  assert.match(costStore, /ownerKey}:call:/);
});

test("충돌 초안과 자동·수동·복구 백업은 계정 체크포인트 장부에 남는다", async () => {
  const schema = await read("db/schema.ts");
  const store = await read("lib/session-checkpoint-store.ts");
  assert.match(schema, /session_checkpoints/);
  assert.match(store, /"INITIAL"/);
  assert.match(store, /"AUTO"/);
  assert.match(store, /"MANUAL"/);
  assert.match(store, /"CONFLICT"/);
  assert.match(store, /"RESTORE_BACKUP"/);
});

test("세션 복구는 현재 상태를 먼저 백업하고 낙관적 잠금으로 적용한다", async () => {
  const source = await read(
    "app/api/sessions/[sessionId]/checkpoints/[checkpointId]/restore/route.ts",
  );
  assert.match(source, /kind: "RESTORE_BACKUP"/);
  assert.match(source, /revision = revision \+ 1/);
  assert.match(source, /AND revision = \?/);
});

test("작품을 불러올 때 패키지 지문과 세션 고정 버전을 함께 기록한다", async () => {
  const source = await read("app/api/projects/route.ts");
  const store = await read("lib/simulation-store.ts");
  assert.match(source, /packageFingerprint = `sha256:/);
  assert.match(source, /project_revision, package_fingerprint/);
  assert.match(store, /packageFingerprint/);
});

test("계정 동기화 UI는 즉시 새로고침과 복구 기록을 페이지 재로딩 없이 제공한다", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /handleRefreshCurrentSession/);
  assert.match(page, /handleOpenCheckpoints/);
  assert.match(page, /세션 체크포인트/);
  assert.match(page, /작품 버전 고정됨/);
  // Switching authenticated accounts is a separate privacy boundary; ordinary
  // same-account refresh and checkpoint recovery must still avoid page reloads.
  const regularFlow=page.replace(/useEffect\(\(\)=>\{\s*const changed=\(event:Event\)=>\{[\s\S]*?\},\[setAccount,setProjects,setSessions\]\);/,'');
  assert.doesNotMatch(regularFlow, /window\.location\.reload/);
});

test("동시 편집 충돌 초안은 최신본을 덮지 않고 새 세션으로 분기할 수 있다", async () => {
  const source = await read(
    "app/api/sessions/[sessionId]/checkpoints/[checkpointId]/fork/route.ts",
  );
  const page = await read("app/page.tsx");
  assert.match(source, /충돌 보존본/);
  assert.match(source, /package_fingerprint/);
  assert.match(page, /새 세션으로 복사/);
});
