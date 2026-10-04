import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path:string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Cortex cloud snapshots are account-scoped, revision-locked, and stored with an R2 digest", async () => {
  const [route,store,migration] = await Promise.all([
    read("app/api/cortex/sessions/[sessionId]/route.ts"),
    read("lib/cortex-cloud-store.ts"),
    read("drizzle/0009_useful_kree.sql"),
  ]);
  assert.match(route, /requireOwnerKey/u);
  assert.match(route, /expectedRevision/u);
  assert.match(route, /CORTEX_SYNC_CONFLICT/u);
  assert.match(route, /storeSharedSnapshot/u);
  assert.match(route, /runtimeJsonDigest/u);
  assert.match(store, /owner_key = \?/u);
  assert.match(migration, /CREATE TABLE `cortex_cloud_sessions`/u);
});

test("Cortex waits for account restore before package offer and syncs the complete backup", async () => {
  const [player,host] = await Promise.all([
    read("app/cortex-player.tsx"),
    read("public/cortex-host.js"),
  ]);
  assert.match(player, /cloudReady/u);
  assert.match(player, /CLOUD_RESTORE/u);
  assert.match(player, /CLOUD_EXPORT/u);
  assert.match(player, /expectedRevision:cloudRevision\.current/u);
  assert.match(player, /name:effectiveSessionName/u);
  assert.match(host, /_fullExport\(\)/u);
  assert.match(host, /_importFull\(e\.data\.snapshot,\{reuseMedia:e\.data\.reuseMedia===true\}\)/u);
});

test("Cortex cross-device leases are atomic and support save-before-takeover", async () => {
  const [route,player,host,initialMigration,takeoverMigration] = await Promise.all([
    read("app/api/cortex/sessions/[sessionId]/lease/route.ts"),
    read("app/cortex-player.tsx"),
    read("public/cortex-host.js"),
    read("drizzle/0010_slippery_wraith.sql"),
    read("drizzle/0011_open_archangel.sql"),
  ]);
  assert.match(route, /ON CONFLICT\(id\) DO UPDATE/u);
  assert.match(route, /CORTEX_TAKEOVER_REQUESTED/u);
  assert.match(route, /cortex_session_leases\.device_id = excluded\.device_id/u);
  assert.match(route, /device_id <> \?/u);
  assert.match(route, /WHERE id = \? AND owner_key = \? AND device_id = \? AND takeover_client_id = ''/u);
  assert.match(route, /takeover_client_id/u);
  assert.match(player, /leaseDeviceId/u);
  assert.doesNotMatch(player, /다른 기기 또는 탭에서 사용 중/u);
  assert.match(player, /다른 기기 종료 후 이어서/u);
  assert.match(player, /takeoverPending/u);
  assert.match(host, /LEASE_LOCK/u);
  assert.match(initialMigration, /CREATE TABLE `cortex_session_leases`/u);
  assert.match(takeoverMigration, /ADD `takeover_client_id`/u);
});
