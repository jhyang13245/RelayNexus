"use client";

import { useEffect, useRef, useState } from "react";
import { hubRevisionIdentity } from "../../lib/hub-revision";
import {accountStorageKey,accountSessionPrefix,accountFetch,cortexAccountOwner,cortexAccountEpoch,setCortexAccountOwner,bindVerifiedLegacySession,CORTEX_ACCOUNT_CHANGED} from '../../lib/cortex-account-scope';

export type CortexSession = {
  id: string;
  projectId: string;
  name: string;
  sourceProjectId?: string;
  thumbnailUrl?: string;
  turn?: number;
  location?: string;
  preview?: string;
  lastPlayedAt?: string;
};

export const CORTEX_CATALOG = "nexus-cortex-catalog-v1";
export const CORTEX_CATALOG_CHANGED = "nexus-cortex-catalog-changed";
const CORTEX_PROJECT_PACKAGE_DB = "dancheong-nexus-cortex-project-packages-v1";
const CORTEX_PROJECT_PACKAGE_STORE = "packages";
const LEGACY_CORTEX_PROJECT_IDS = new Set(["cortex-builtin"]);
const LEGACY_CORTEX_SESSION_IDS = new Set(["cortex-default"]);
const CORTEX_CLOUD_CATALOG_REFRESH_MS = 20_000;
let cloudCatalogSyncPromise: Promise<CortexSession[]> | null = null;
const CORTEX_DELETIONS='nexus-cortex-deletions-v1';
const scopedKey=(key:string)=>accountStorageKey(key);
const deletions=():Record<string,boolean>=>{try{const key=scopedKey(CORTEX_DELETIONS);return key?JSON.parse(localStorage.getItem(key)||'{}'):{}}catch{return {}}};
async function retryCloudDeletions(){
  const owner=cortexAccountOwner(),key=accountStorageKey(CORTEX_DELETIONS,owner);if(!key)return;
  const pending=Object.entries(deletions()).filter(([,done])=>!done).slice(0,8);
  await Promise.all(pending.map(async([id])=>{
    try{const response=await accountFetch(owner,`/api/cortex/sessions/${encodeURIComponent(id)}`,{method:'DELETE',signal:AbortSignal.timeout(12000)});
      if(!response.ok&&response.status!==404)return;
      if(cortexAccountOwner()!==owner)return;
      const marks=deletions();marks[id]=true;localStorage.setItem(key,JSON.stringify(marks));
      await eraseLocalCortexSession(id);
    }catch{/* Keep the deletion intent and local recovery bytes until acknowledged. */}
  }));
}

const CORTEX_DATABASES = [
  "dancheong-cortex-state-v1250-alpha",
  "dancheong-cortex-state-v1243-alpha",
  "dancheong-cortex-media-v1230",
  "dancheong-cortex-packages-v1",
  "dancheong-cortex-images-v1",
];

const cortexScopePrefix = (sessionId: string) => accountSessionPrefix(sessionId);

const writeCortexCatalog = (rows: CortexSession[]) => {
  const key=scopedKey(CORTEX_CATALOG);if(!key)return;
  localStorage.setItem(key, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(CORTEX_CATALOG_CHANGED, { detail: rows }));
};

export function readCortexCatalog(): CortexSession[] {
  try {
    const key=scopedKey(CORTEX_CATALOG);if(!key)return [];
    const rows = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    const valid = Array.isArray(rows)
      ? rows.filter((row): row is CortexSession => Boolean(
          row && typeof row === "object" &&
          typeof (row as CortexSession).id === "string" &&
          typeof (row as CortexSession).projectId === "string" &&
          !LEGACY_CORTEX_SESSION_IDS.has((row as CortexSession).id) &&
          !LEGACY_CORTEX_PROJECT_IDS.has((row as CortexSession).projectId),
        ))
      : [];
    if (Array.isArray(rows) && valid.length !== rows.length) {
      localStorage.setItem(key, JSON.stringify(valid));
    }
    const hidden=deletions();
    return valid.filter(row=>!(row.id in hidden));
  } catch {
    return [];
  }
}

export function saveCortexSession(row: CortexSession,owner=cortexAccountOwner()) {
  if(!owner||owner!==cortexAccountOwner())return;
  const rows = readCortexCatalog();
  const old = rows.find((item) => item.id === row.id);
  writeCortexCatalog([
    ...rows.filter((item) => item.id !== row.id),
    { ...old, ...row },
  ]);
}

export async function syncCortexCloudCatalog() {
  if (cloudCatalogSyncPromise) return cloudCatalogSyncPromise;
  const request = (async () => {
    const epoch=cortexAccountEpoch();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {
      const response = await fetch(`/api/cortex/sessions?sync=${Date.now()}`, { cache: "no-store",signal:controller.signal });
      if (!response.ok) {if(response.status===401&&epoch===cortexAccountEpoch())setCortexAccountOwner('');return readCortexCatalog();}
      const result = await response.json() as { ownerKey?:string;sessions?: Array<CortexSession & { updatedAt?: string }> };
      if(epoch!==cortexAccountEpoch()&&result.ownerKey!==cortexAccountOwner())return readCortexCatalog();
      setCortexAccountOwner(result.ownerKey);
      if(!cortexAccountOwner())return [];
      void retryCloudDeletions();
      const merged = readCortexCatalog();
      for (const cloud of result.sessions ?? []) {
        if (!cloud?.id || !cloud.projectId || cloud.id in deletions()) continue;
        bindVerifiedLegacySession(cloud.id,cloud.projectId,cortexAccountOwner());
        const index = merged.findIndex((row) => row.id === cloud.id);
        const normalized: CortexSession = {
          ...cloud,
          lastPlayedAt: cloud.updatedAt || cloud.lastPlayedAt || new Date().toISOString(),
        };
        if (index < 0) merged.push(normalized);
        else if (String(normalized.lastPlayedAt) >= String(merged[index].lastPlayedAt || "")) merged[index] = { ...merged[index], ...normalized };
      }
      writeCortexCatalog(merged);
      return merged;
    } catch {
      return readCortexCatalog();
    } finally {
      clearTimeout(timer);
    }
  })();
  cloudCatalogSyncPromise = request;
  try {
    return await request;
  } finally {
    if (cloudCatalogSyncPromise === request) cloudCatalogSyncPromise = null;
  }
}

export function setCortexProjectThumbnail(projectId: string, thumbnailUrl: string) {
  writeCortexCatalog(readCortexCatalog().map((row) => row.projectId === projectId
    ? { ...row, thumbnailUrl }
    : row));
}

const deleteCortexDatabase = (name: string) => new Promise<void>((resolve) => {
  if (!window.indexedDB) return resolve();
  const request = window.indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => resolve();
  request.onblocked = () => resolve();
});

const openProjectPackageDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const name=scopedKey(CORTEX_PROJECT_PACKAGE_DB);if(!name){reject(Error('계정 확인 후 작품을 다시 열어 주세요.'));return;}
  const request = window.indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(CORTEX_PROJECT_PACKAGE_STORE)) {
      request.result.createObjectStore(CORTEX_PROJECT_PACKAGE_STORE, { keyPath: "projectId" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function rememberCortexProjectPackage(projectId: string, file: File,owner=cortexAccountOwner()) {
  if (!projectId || !file || !window.indexedDB || !owner || owner!==cortexAccountOwner()) return;
  const database = await openProjectPackageDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CORTEX_PROJECT_PACKAGE_STORE, "readwrite");
      const store = transaction.objectStore(CORTEX_PROJECT_PACKAGE_STORE);
      const record = {
        projectId,
        name: file.name,
        type: file.type || "application/zip",
        blob: file,
        updatedAt: Date.now(),
      };
      if (hubRevisionIdentity(projectId)) {
        const existing = store.get(projectId);
        existing.onsuccess = () => { if (!existing.result) store.add(record); };
      } else store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function readCortexProjectPackage(projectId: string,owner=cortexAccountOwner()): Promise<File | null> {
  if (!projectId || !window.indexedDB || !owner || owner!==cortexAccountOwner()) return null;
  const database = await openProjectPackageDatabase();
  try {
    const row = await new Promise<{ name?: string; type?: string; blob?: Blob } | null>((resolve, reject) => {
      const request = database.transaction(CORTEX_PROJECT_PACKAGE_STORE, "readonly")
        .objectStore(CORTEX_PROJECT_PACKAGE_STORE)
        .get(projectId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    return owner===cortexAccountOwner()&&row?.blob
      ? new File([row.blob], row.name || "ScenarioPack.zip", { type: row.type || "application/zip" })
      : null;
  } finally {
    database.close();
  }
}

async function forgetCortexProjectPackage(projectId: string) {
  if (!projectId || !window.indexedDB || !cortexAccountOwner()) return;
  const database = await openProjectPackageDatabase();
  try {
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(CORTEX_PROJECT_PACKAGE_STORE, "readwrite");
      transaction.objectStore(CORTEX_PROJECT_PACKAGE_STORE).delete(projectId);
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    });
  } finally {
    database.close();
  }
}

export async function removeCortexSessions(sessionIds: string[]) {
  const key=scopedKey(CORTEX_DELETIONS);if(!key)throw Error('계정 확인 후 다시 시도해 주세요.');
  const ids = new Set(sessionIds.filter(Boolean));
  if (!ids.size) return;
  const marks=deletions();for(const id of ids)marks[id]=false;
  localStorage.setItem(key,JSON.stringify(marks));
  writeCortexCatalog(readCortexCatalog().filter((row) => !ids.has(row.id)));
  await retryCloudDeletions();
  if([...ids].some(id=>!deletions()[id]))throw Error('클라우드 삭제 대기 중입니다. 연결되면 다시 시도하며, 확인 전까지 기기 저장본은 보존합니다.');
}

async function eraseLocalCortexSession(sessionId:string){
    const prefix = cortexScopePrefix(sessionId);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
    const base=accountStorageKey('nexus-cloud-base:'+sessionId);if(base)localStorage.removeItem(base);
    await Promise.all(CORTEX_DATABASES.map((databaseName) => deleteCortexDatabase(`${prefix}${databaseName}`)));
}

export async function removeCortexProject(projectId: string) {
  const owner=cortexAccountOwner();
  const sessionIds = readCortexCatalog()
    .filter((row) => row.projectId === projectId)
    .map((row) => row.id);
  await removeCortexSessions(sessionIds);
  if(owner!==cortexAccountOwner())throw Error('계정이 변경되었습니다. 서재를 다시 열어 주세요.');
  await forgetCortexProjectPackage(projectId);
  return sessionIds.length;
}

export const isDeviceOnlyCortexProject = (projectId: string) =>
  projectId.startsWith("cortex-import-");

export const visibleCortexSessions = (
  rows: CortexSession[],
  accountProjectIds: ReadonlySet<string>,
) => rows.filter((row) =>
  accountProjectIds.has(row.projectId) || isDeviceOnlyCortexProject(row.projectId));

export function useCortexCatalog() {
  const [rows, setRows] = useState<CortexSession[]>([]);
  useEffect(() => {
    let disposed = false;
    const refresh = () => setRows(readCortexCatalog());
    const refreshFromCloud = () => {
      if (document.visibilityState === "hidden") return;
      void syncCortexCloudCatalog().then((nextRows) => {
        if (!disposed) setRows(nextRows);
      });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshFromCloud();
    };
    refresh();
    window.addEventListener(CORTEX_CATALOG_CHANGED, refresh);
    window.addEventListener(CORTEX_ACCOUNT_CHANGED, refresh);
    window.addEventListener("focus", refreshFromCloud);
    window.addEventListener("online", refreshFromCloud);
    window.addEventListener("pageshow", refreshFromCloud);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const retry = window.setTimeout(refreshFromCloud, 1_200);
    const interval = window.setInterval(refreshFromCloud, CORTEX_CLOUD_CATALOG_REFRESH_MS);
    refreshFromCloud();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      window.clearInterval(interval);
      window.removeEventListener(CORTEX_CATALOG_CHANGED, refresh);
      window.removeEventListener(CORTEX_ACCOUNT_CHANGED, refresh);
      window.removeEventListener("focus", refreshFromCloud);
      window.removeEventListener("online", refreshFromCloud);
      window.removeEventListener("pageshow", refreshFromCloud);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  return rows;
}

export function useRuntimeEngine() {
  const [runtimeEngine, setRuntimeEngine] = useState<"cortex" | "lotus">("cortex");
  const [cortexFile, setCortexFile] = useState<File | null>(null);
  const [cortexSession, setCortexSession] = useState<CortexSession | null>(null);
  const cortexBusy = useRef(false);

  useEffect(() => {
    const accountChanged=(event:Event)=>{if((event as CustomEvent).detail.previous){setCortexSession(null);setCortexFile(null);}};
    window.addEventListener(CORTEX_ACCOUNT_CHANGED,accountChanged);
    const legacySessionIds = new Set(LEGACY_CORTEX_SESSION_IDS);
    try {
      const stored = JSON.parse(localStorage.getItem(CORTEX_CATALOG) || "[]") as CortexSession[];
      for (const row of Array.isArray(stored) ? stored : []) {
        if (LEGACY_CORTEX_PROJECT_IDS.has(row.projectId)) legacySessionIds.add(row.id);
      }
    } catch {
      // readCortexCatalog removes an invalid catalog below.
    }
    for (const sessionId of legacySessionIds) {
      const prefix = cortexScopePrefix(sessionId);
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
      for (const databaseName of CORTEX_DATABASES) {
        void deleteCortexDatabase(`${prefix}${databaseName}`);
      }
    }
    for (const projectId of LEGACY_CORTEX_PROJECT_IDS) {
      void forgetCortexProjectPackage(projectId);
    }
    readCortexCatalog();
    void syncCortexCloudCatalog();
    if (localStorage.getItem("nexus-runtime-engine") === "lotus") {
      setRuntimeEngine("lotus");
    }
    const busy = (event: Event) => {
      cortexBusy.current = Boolean((event as CustomEvent).detail);
    };
    const change = (event: Event) => {
      if (cortexBusy.current) {
        alert("현재 Cortex 비트의 저장이 끝난 뒤 엔진을 전환해 주세요.");
        return;
      }
      const engine = (event as CustomEvent).detail === "lotus" ? "lotus" : "cortex";
      localStorage.setItem("nexus-runtime-engine", engine);
      setRuntimeEngine(engine);
    };
    const summary = (event: Event) => {
      const row = (event as CustomEvent).detail;
      if (typeof row.id !== "string" || row.ownerKey!==cortexAccountOwner()) return;
      saveCortexSession({
        id: row.id,
        projectId: row.projectId,
        name: row.title || "Cortex 이야기",
        turn: row.turn,
        location: row.location,
        preview: row.preview,
        lastPlayedAt: new Date().toISOString(),
      },row.ownerKey);
    };
    window.addEventListener("nexus-engine-change", change);
    window.addEventListener("nexus-cortex-busy", busy);
    window.addEventListener("nexus-cortex-summary", summary);
    return () => {
      window.removeEventListener(CORTEX_ACCOUNT_CHANGED,accountChanged);
      window.removeEventListener("nexus-engine-change", change);
      window.removeEventListener("nexus-cortex-busy", busy);
      window.removeEventListener("nexus-cortex-summary", summary);
    };
  }, []);

  return {
    runtimeEngine,
    cortexFile,
    setCortexFile,
    cortexBusy,
    cortexSession,
    openCortex: (row: CortexSession) => {
      saveCortexSession(row);
      setCortexSession(row);
    },
  };
}
