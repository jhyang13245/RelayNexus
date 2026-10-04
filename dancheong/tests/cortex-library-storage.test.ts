import assert from "node:assert/strict";
import test from "node:test";

import { indexedDB } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import { hubRevisionProjectId } from "../lib/hub-revision";
import { installHubRevisionPackage, resolveInstalledHubRevision } from "../app/hub-revision-package";

import {
  CORTEX_CATALOG as LEGACY_CATALOG,
  isDeviceOnlyCortexProject,
  readCortexCatalog,
  readCortexProjectPackage,
  rememberCortexProjectPackage,
  removeCortexProject,
  setCortexProjectThumbnail,
  visibleCortexSessions,
  syncCortexCloudCatalog,
} from "../app/hooks/use-runtime-engine";

import {accountStorageKey,accountSessionPrefix,setCortexAccountOwner} from '../lib/cortex-account-scope';
const CORTEX_CATALOG=accountStorageKey(LEGACY_CATALOG,'account:test')!;
const installBrowserStorage = () => {
  const dom = new JSDOM("", { url: "https://nexus.test" });
  Object.assign(globalThis, {
    window: dom.window,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    CustomEvent: dom.window.CustomEvent,
  });
  Object.defineProperty(dom.window, "indexedDB", { value: indexedDB });
  setCortexAccountOwner('account:test');
  return dom;
};

test('a stalled cloud catalog request times out and does not poison later refreshes',async(t)=>{
 const dom=installBrowserStorage(),nativeTimer=globalThis.setTimeout;let calls=0;
 t.mock.method(globalThis,'setTimeout',((fn,ms,...args)=>nativeTimer(fn,ms===15000?10:ms,...args)) as typeof setTimeout);
 t.mock.method(globalThis,'fetch',async(_url,init)=>{
  calls++;if(calls>1)return Response.json({ownerKey:'account:test',sessions:[{id:'recovered-list',projectId:'p',name:'recovered'}]});
  return new Promise<Response>((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));
 });
 try{assert.deepEqual(await syncCortexCloudCatalog(),[]);assert.equal((await syncCortexCloudCatalog())[0].id,'recovered-list');assert.equal(calls,2);}finally{dom.window.close()}
});

test('failed server deletion retains local recovery bytes and stale lists cannot resurrect the card',async(t)=>{
 const dom=installBrowserStorage();let failed=true;
 t.mock.method(globalThis,'fetch',async(_url,init)=>init?.method==='DELETE'?(failed?Response.json({}, {status:503}):Response.json({deleted:true})):Response.json({ownerKey:'account:test',sessions:[{id:'pending-delete',projectId:'p',name:'old'}]}));
 try{
  localStorage.setItem(CORTEX_CATALOG,JSON.stringify([{id:'pending-delete',projectId:'p',name:'old'}]));
  localStorage.setItem(accountSessionPrefix('pending-delete')+'saved','original');
  await assert.rejects(()=>removeCortexProject('p'),/삭제 대기/);
  assert.equal(localStorage.getItem(accountSessionPrefix('pending-delete')+'saved'),'original');
  await syncCortexCloudCatalog();assert.equal(readCortexCatalog().length,0);
  failed=false;await syncCortexCloudCatalog();await new Promise(r=>setTimeout(r,20));
  assert.equal(readCortexCatalog().length,0);assert.equal(localStorage.getItem(accountSessionPrefix('pending-delete')+'saved'),null);
 }finally{dom.window.close()}
});

test("새 덧칠을 설치·삭제해도 구 덧칠 ZIP과 세션은 변경되지 않는다", async (t) => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({deleted:true}));
  const dom = installBrowserStorage();
  const work = { slug: "revision-test", title: "덧칠 테스트", packageVersion: "1.5" };
  const first = hubRevisionProjectId({ ...work, currentRevision: 1 });
  const second = hubRevisionProjectId({ ...work, currentRevision: 2 });
  const file = (value: string) => new File([value], "book.zip");
  localStorage.setItem(CORTEX_CATALOG, JSON.stringify([
    { id: "old-revision-session", projectId: first, name: work.title },
    { id: "new-revision-session", projectId: second, name: work.title },
  ]));
  await rememberCortexProjectPackage(first, file("original"));
  await rememberCortexProjectPackage(second, file("new revision"));
  await rememberCortexProjectPackage(first, file("must not overwrite"));
  assert.equal(await (await readCortexProjectPackage(first))?.text(), "original");
  assert.equal(await (await readCortexProjectPackage(second))?.text(), "new revision");
  assert.deepEqual(readCortexCatalog().filter(row => row.projectId === first).map(row => row.id), ["old-revision-session"]);
  await removeCortexProject(second);
  assert.equal(await (await readCortexProjectPackage(first))?.text(), "original");
  assert.deepEqual(readCortexCatalog().map(row => row.id), ["old-revision-session"]);
  await removeCortexProject(first);
  dom.window.close();
});

test("덧칠 다운로드는 고정 버전과 지문을 검증하고 손상 응답을 저장하지 않는다", async () => {
  const dom = installBrowserStorage(), originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([80, 75, 3, 4, 1]);
  const packageSha256 = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
  const work = { slug: "download-test", title: "다운로드", packageVersion: "1.5", currentRevision: 2, packageBytes: 5, packageSha256 };
  try {
    globalThis.fetch = async input => {
      assert.equal(input, "/api/neoreum/works/download-test/revisions/2/download");
      return new Response(bytes);
    };
    const installed = await installHubRevisionPackage(work);
    assert.deepEqual(new Uint8Array(await installed.file.arrayBuffer()), bytes);
    globalThis.fetch = async () => new Response(new Uint8Array([80,75,3,4,9]));
    await assert.rejects(() => installHubRevisionPackage({ ...work, currentRevision: 3 }), /무결성/);
    assert.equal(await readCortexProjectPackage(hubRevisionProjectId({ ...work, currentRevision: 3 })), null);
    assert.deepEqual(new Uint8Array(await (await readCortexProjectPackage(installed.projectId))!.arrayBuffer()), bytes);
    await removeCortexProject(installed.projectId);
  } finally { globalThis.fetch = originalFetch; dom.window.close(); }
});

test("기존 ZIP은 해시로 실제 덧칠을 확인하며 계정 복원도 덧칠 세션을 합치지 않는다", async () => {
  const dom = installBrowserStorage(), originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([80,75,3,4,7]);
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
  const work = { slug: "legacy-test", title: "기존 설치본", packageVersion: "1.5", currentRevision: 3, packageSha256: "0".repeat(64) };
  try {
    await rememberCortexProjectPackage("cortex-import-legacy-test", new File([bytes], "old.zip"));
    globalThis.fetch = async () => Response.json({ revisions: [{ revision: 1, packageSha256: digest }] });
    assert.equal(await resolveInstalledHubRevision("cortex-import-legacy-test", work), 1);
    assert.equal(await resolveInstalledHubRevision("cortex-import-no-file", work), null);
    globalThis.fetch = async () => Response.json({ ownerKey:'account:test',sessions: [1,2].map(revision => ({ id: `cloud-r${revision}`, projectId: hubRevisionProjectId({ ...work, currentRevision: revision }), name: work.title, updatedAt: "2026-09-11T00:00:00Z" })) });
    const cloud = await syncCortexCloudCatalog();
    assert.equal(new Set(cloud.map(row => row.projectId)).size, 2);
    assert.equal(cloud.length, 2);
    await removeCortexProject("cortex-import-legacy-test");
  } finally { globalThis.fetch = originalFetch; dom.window.close(); }
});

test("같은 작품의 서로 다른 기기 세션을 클라우드 목록에서 모두 합친다", async () => {
  const dom = installBrowserStorage(), originalFetch = globalThis.fetch;
  const projectId = "cortex-import-neoreum:fate-seoul:r1";
  localStorage.setItem(CORTEX_CATALOG, JSON.stringify([
    { id: "pc-session", projectId, name: "Fate/Seoul · PC", turn: 11, lastPlayedAt: "2026-09-12T01:00:00Z" },
  ]));
  try {
    globalThis.fetch = async () => Response.json({ ownerKey:'account:test',sessions: [
      { id: "phone-session", projectId, name: "Fate/Seoul · iPhone", turn: 10, updatedAt: "2026-09-12T02:00:00Z" },
      { id: "pc-session", projectId, name: "Fate/Seoul · PC", turn: 11, updatedAt: "2026-09-12T03:00:00Z" },
    ] });
    const merged = await syncCortexCloudCatalog();
    assert.deepEqual(
      merged.filter(row => row.projectId === projectId).map(row => [row.id, row.turn]).sort(),
      [["pc-session", 11], ["phone-session", 10]],
    );
  } finally { globalThis.fetch = originalFetch; dom.window.close(); }
});

test("Cortex 작품 삭제는 카탈로그와 세션별 저장 키를 함께 정리한다", async (t) => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({deleted:true}));
  const dom = installBrowserStorage();
  const projectId = "3ae2e65e-5918-40ac-9a3a-499648f02c71";
  const sessionId = "session-1";
  localStorage.setItem(CORTEX_CATALOG, JSON.stringify([
    { id: sessionId, projectId, name: "삭제할 작품" },
    { id: "session-2", projectId: "cortex-import-local", name: "남길 작품" },
  ]));
  const prefix = accountSessionPrefix(sessionId);
  localStorage.setItem(`${prefix}dancheong-cortex-lab`, "saved");
  sessionStorage.setItem(`${prefix}pending`, "saved");

  const removed = await removeCortexProject(projectId);

  assert.equal(removed, 1);
  assert.deepEqual(readCortexCatalog().map((row) => row.id), ["session-2"]);
  assert.equal(localStorage.getItem(`${prefix}dancheong-cortex-lab`), null);
  assert.equal(sessionStorage.getItem(`${prefix}pending`), null);
  dom.window.close();
});

test("계정 작품과 기기 전용 Cortex 작품을 구분한다", () => {
  assert.equal(isDeviceOnlyCortexProject("cortex-import-CHRONOS_CORE_MASTER_V180"), true);
  assert.equal(isDeviceOnlyCortexProject("cortex-builtin"), false);
  assert.equal(isDeviceOnlyCortexProject("3ae2e65e-5918-40ac-9a3a-499648f02c71"), false);
});

test("폐기된 Cortex 기본 작품과 기본 세션은 카탈로그에서 제거한다", () => {
  const dom = installBrowserStorage();
  localStorage.setItem(CORTEX_CATALOG, JSON.stringify([
    { id: "cortex-default", projectId: "cortex-builtin", name: "기본 내장 작품" },
    { id: "kept", projectId: "cortex-import-user", name: "사용자 작품" },
  ]));

  assert.deepEqual(readCortexCatalog().map((row) => row.id), ["kept"]);
  assert.doesNotMatch(localStorage.getItem(CORTEX_CATALOG) || "", /cortex-builtin/u);
  dom.window.close();
});

test("삭제된 계정 작품의 고아 세션은 Cortex 서재 작품으로 복원하지 않는다", () => {
  const installedProjectId = "223198ac-4707-4ce2-a2f2-d47b8203d855";
  const deletedProjectId = "3ae2e65e-5918-40ac-9a3a-499648f02c71";
  const rows = [
    { id: "installed", projectId: installedProjectId, name: "설치 작품" },
    { id: "orphan", projectId: deletedProjectId, name: "삭제 작품" },
    { id: "local", projectId: "cortex-import-CHRONOS", name: "기기 작품" },
  ];

  assert.deepEqual(
    visibleCortexSessions(rows, new Set([installedProjectId])).map((row) => row.id),
    ["installed", "local"],
  );
});

test("Story Hub에서 설치한 Cortex 작품 표지는 기기 카탈로그의 모든 세션에 보존된다", () => {
  const dom = installBrowserStorage();
  const projectId = "cortex-import-CHRONOS_CORE_MASTER_V180";
  localStorage.setItem(CORTEX_CATALOG, JSON.stringify([
    { id: "session-1", projectId, name: "크로노스 코어" },
    { id: "session-2", projectId, name: "크로노스 코어 2" },
  ]));

  setCortexProjectThumbnail(projectId, "/api/hub/works/chronos-core/cover?v=published");

  assert.deepEqual(
    readCortexCatalog().map((row) => row.thumbnailUrl),
    [
      "/api/hub/works/chronos-core/cover?v=published",
      "/api/hub/works/chronos-core/cover?v=published",
    ],
  );
  dom.window.close();
});

test("Cortex 작품 ZIP은 프로젝트별로 보존되어 새 세션과 재접속에서 다시 사용된다", async () => {
  const dom = installBrowserStorage();
  const projectId = "cortex-import-reconnect";
  const source = new File([new Uint8Array([80, 75, 3, 4])], "ScenarioPack.zip", {
    type: "application/zip",
  });

  await rememberCortexProjectPackage(projectId, source);
  const restored = await readCortexProjectPackage(projectId);

  assert.equal(restored?.name, "ScenarioPack.zip");
  assert.deepEqual([...new Uint8Array(await restored!.arrayBuffer())], [80, 75, 3, 4]);
  await removeCortexProject(projectId);
  assert.equal(await readCortexProjectPackage(projectId), null);
  dom.window.close();
});
