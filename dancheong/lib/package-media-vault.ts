import type { ScenarioMediaAsset } from "./scenario";
import { BlobMemoryCache } from "./blob-memory-cache";

const MEDIA_DB_NAME = "relay-novel-simulator-media";
const MEDIA_DB_VERSION = 3;
const MEDIA_STORE_NAME = "package-assets";
const PHYSICAL_STORE_NAME = "package-physical-assets";
const ARCHIVE_STORE_NAME = "package-archives";
const PROJECT_INDEX = "projectId";
const memoryArchiveCache = new BlobMemoryCache<string>(32 * 1024 * 1024);
// Failed/pending disk writes are not disposable cache entries: preserve recovery.
const pendingArchives = new Map<string, Blob>();

export const requestPersistentPackageStorage = async (): Promise<boolean> => {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

type StoredMediaRecord = {
  key: string;
  projectId: string;
  assetId: string;
  assetRef?: string;
  dataUrl?: string;
};

type StoredPhysicalMediaRecord = {
  key: string;
  projectId: string;
  assetRef: string;
  dataUrl: string;
};

type StoredArchiveRecord = {
  projectId: string;
  fileName: string;
  blob: Blob;
  savedAt: string;
};

const openMediaDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("이 브라우저에서는 패키지 이미지 저장소를 사용할 수 없습니다."));
      return;
    }
    const request = window.indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(MEDIA_STORE_NAME)
        ? request.transaction?.objectStore(MEDIA_STORE_NAME)
        : database.createObjectStore(MEDIA_STORE_NAME, { keyPath: "key" });
      if (store && !store.indexNames.contains(PROJECT_INDEX)) {
        store.createIndex(PROJECT_INDEX, PROJECT_INDEX, { unique: false });
      }
      if (!database.objectStoreNames.contains(ARCHIVE_STORE_NAME)) {
        database.createObjectStore(ARCHIVE_STORE_NAME, { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains(PHYSICAL_STORE_NAME)) {
        const physical = database.createObjectStore(PHYSICAL_STORE_NAME, { keyPath: "key" });
        physical.createIndex(PROJECT_INDEX, PROJECT_INDEX, { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("패키지 이미지 저장소를 열지 못했습니다."));
  });

const getProjectRecords = async (
  database: IDBDatabase,
  projectId: string,
): Promise<StoredMediaRecord[]> =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, "readonly");
    const request = transaction
      .objectStore(MEDIA_STORE_NAME)
      .index(PROJECT_INDEX)
      .getAll(projectId);
    request.onsuccess = () =>
      resolve((request.result as StoredMediaRecord[] | undefined) ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error("패키지 이미지를 읽지 못했습니다."));
  });

export const rememberPackageMedia = async (
  projectId: string,
  mediaUrls: Record<string, string>,
  assets: ScenarioMediaAsset[] = [],
) => {
  const database = await openMediaDatabase();
  try {
    const previous = await getProjectRecords(database, projectId);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [MEDIA_STORE_NAME, PHYSICAL_STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(MEDIA_STORE_NAME);
      const physicalStore = transaction.objectStore(PHYSICAL_STORE_NAME);
      const assetById = new Map(assets.map((asset) => [asset.id, asset] as const));
      previous.forEach((record) => store.delete(record.key));
      Object.entries(mediaUrls).forEach(([assetId, dataUrl]) => {
        const assetRef = assetById.get(assetId)?.assetRef;
        const record: StoredMediaRecord = {
          key: `${projectId}:${assetId}`,
          projectId,
          assetId,
          assetRef,
          dataUrl: assetRef ? undefined : dataUrl,
        };
        store.put(record);
        if (assetRef) {
          const physical: StoredPhysicalMediaRecord = {
            key: `${projectId}:${assetRef}`,
            projectId,
            assetRef,
            dataUrl,
          };
          physicalStore.put(physical);
        }
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("패키지 이미지를 저장하지 못했습니다."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("패키지 이미지 저장이 중단되었습니다."));
    });
  } finally {
    database.close();
  }
};

export const rememberPackageMediaAsset = async (
  projectId: string,
  assetId: string,
  dataUrl: string,
  assetRef?: string,
) => {
  const database = await openMediaDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [MEDIA_STORE_NAME, PHYSICAL_STORE_NAME],
        "readwrite",
      );
      const record: StoredMediaRecord = {
        key: `${projectId}:${assetId}`,
        projectId,
        assetId,
        assetRef,
        dataUrl: assetRef ? undefined : dataUrl,
      };
      transaction.objectStore(MEDIA_STORE_NAME).put(record);
      if (assetRef) {
        transaction.objectStore(PHYSICAL_STORE_NAME).put({
          key: `${projectId}:${assetRef}`,
          projectId,
          assetRef,
          dataUrl,
        } satisfies StoredPhysicalMediaRecord);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("캐릭터 기준 이미지를 저장하지 못했습니다."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("캐릭터 기준 이미지 저장이 중단되었습니다."));
    });
  } finally {
    database.close();
  }
};

export const rememberPackageArchive = async (
  projectId: string,
  archive: Blob,
  fileName: string,
) => {
  pendingArchives.set(projectId, archive);
  const database = await openMediaDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ARCHIVE_STORE_NAME, "readwrite");
      const record: StoredArchiveRecord = {
        projectId,
        fileName,
        blob: archive,
        savedAt: new Date().toISOString(),
      };
      transaction.objectStore(ARCHIVE_STORE_NAME).put(record);
      transaction.oncomplete = () => {
        memoryArchiveCache.set(projectId, archive);
        if (pendingArchives.get(projectId) === archive) pendingArchives.delete(projectId);
        resolve();
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("대용량 패키지를 저장하지 못했습니다."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("대용량 패키지 저장이 중단되었습니다."));
    });
  } finally {
    database.close();
  }
};

export const restorePackageArchive = async (
  projectId: string,
): Promise<Blob | undefined> => {
  const cached = pendingArchives.get(projectId) ?? memoryArchiveCache.get(projectId);
  if (cached) return cached;
  const database = await openMediaDatabase();
  try {
    const record = await new Promise<StoredArchiveRecord | undefined>(
      (resolve, reject) => {
        const transaction = database.transaction(ARCHIVE_STORE_NAME, "readonly");
        const request = transaction.objectStore(ARCHIVE_STORE_NAME).get(projectId);
        request.onsuccess = () =>
          resolve(request.result as StoredArchiveRecord | undefined);
        request.onerror = () =>
          reject(request.error ?? new Error("대용량 패키지를 읽지 못했습니다."));
      },
    );
    if (record?.blob) memoryArchiveCache.set(projectId, record.blob);
    return record?.blob;
  } finally {
    database.close();
  }
};

export const restorePackageMedia = async (
  projectId: string,
): Promise<Record<string, string>> => {
  const database = await openMediaDatabase();
  try {
    const records = await getProjectRecords(database, projectId);
    const refs = [...new Set(records.map((record) => record.assetRef).filter(Boolean))] as string[];
    const physical = await new Promise<StoredPhysicalMediaRecord[]>((resolve, reject) => {
      const transaction = database.transaction(PHYSICAL_STORE_NAME, "readonly");
      const store = transaction.objectStore(PHYSICAL_STORE_NAME);
      const values: StoredPhysicalMediaRecord[] = [];
      let pending = refs.length;
      if (!pending) return resolve(values);
      refs.forEach((assetRef) => {
        const request = store.get(`${projectId}:${assetRef}`);
        request.onsuccess = () => {
          if (request.result) values.push(request.result as StoredPhysicalMediaRecord);
          pending -= 1;
          if (!pending) resolve(values);
        };
        request.onerror = () => reject(request.error ?? new Error("물리 이미지 원본을 읽지 못했습니다."));
      });
    });
    const physicalByRef = new Map(physical.map((record) => [record.assetRef, record.dataUrl]));
    return Object.fromEntries(records.flatMap((record) => {
      const dataUrl = record.dataUrl || (record.assetRef ? physicalByRef.get(record.assetRef) : "");
      return dataUrl ? [[record.assetId, dataUrl]] : [];
    }));
  } finally {
    database.close();
  }
};

export const forgetPackageData = async (projectId: string): Promise<void> => {
  memoryArchiveCache.delete(projectId);
  pendingArchives.delete(projectId);
  const database = await openMediaDatabase();
  try {
    const records = await getProjectRecords(database, projectId);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [MEDIA_STORE_NAME, PHYSICAL_STORE_NAME, ARCHIVE_STORE_NAME],
        "readwrite",
      );
      const mediaStore = transaction.objectStore(MEDIA_STORE_NAME);
      records.forEach((record) => mediaStore.delete(record.key));
      const physicalStore = transaction.objectStore(PHYSICAL_STORE_NAME);
      const physicalIndex = physicalStore.index(PROJECT_INDEX);
      const physicalRequest = physicalIndex.openKeyCursor(IDBKeyRange.only(projectId));
      physicalRequest.onsuccess = () => {
        const cursor = physicalRequest.result;
        if (!cursor) return;
        physicalStore.delete(cursor.primaryKey);
        cursor.continue();
      };
      transaction.objectStore(ARCHIVE_STORE_NAME).delete(projectId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("기기에 저장된 작품 자료를 삭제하지 못했습니다."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("기기 작품 자료 삭제가 중단되었습니다."),
        );
    });
  } finally {
    database.close();
  }
};
