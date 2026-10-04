import { deviceTextProvider, type TextProvider } from './text-provider';
const VAULT_DB_NAME = "relay-novel-simulator-secrets";
const VAULT_DB_VERSION = 1;
const VAULT_STORE_NAME = "device-keys";
const DEVICE_KEY_ID = "openai-api-key-aes-gcm";
const ENCRYPTED_API_KEY_STORAGE = "relay-novel-simulator:openai-key:v1";
const storageFor = (provider: TextProvider) => provider === 'openai' ? ENCRYPTED_API_KEY_STORAGE : 'dancheong:opencode-go-key:v1';

type EncryptedApiKeyRecord = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};

const getBrowserCrypto = () => {
  if (
    typeof window === "undefined" ||
    !window.crypto?.subtle ||
    !window.indexedDB
  ) {
    throw new Error("이 브라우저에서는 암호화된 기기 저장을 사용할 수 없습니다.");
  }
  return window.crypto;
};

const openVaultDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    getBrowserCrypto();
    const request = window.indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(VAULT_STORE_NAME)) {
        request.result.createObjectStore(VAULT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("기기 보안 저장소를 열지 못했습니다."));
  });

const readDeviceKey = async () => {
  const database = await openVaultDatabase();
  try {
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const transaction = database.transaction(VAULT_STORE_NAME, "readonly");
      const request = transaction.objectStore(VAULT_STORE_NAME).get(DEVICE_KEY_ID);
      request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("기기 암호화 키를 읽지 못했습니다."));
    });
  } finally {
    database.close();
  }
};

// Read and create in ONE transaction: two tabs must never replace each other's
// wrapping key and strand the already encrypted provider credentials.
const installDeviceKey = async (candidate: CryptoKey) => {
  const database = await openVaultDatabase();
  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      const transaction = database.transaction(VAULT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(VAULT_STORE_NAME);
      const request = store.get(DEVICE_KEY_ID);
      let key = candidate;
      request.onsuccess = () => {
        if (request.result) key = request.result;
        else store.put(candidate, DEVICE_KEY_ID);
      };
      transaction.oncomplete = () => resolve(key);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("기기 암호화 키를 저장하지 못했습니다."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("기기 암호화 키 저장이 중단되었습니다."));
    });
  } finally {
    database.close();
  }
};

const getOrCreateDeviceKey = async () => {
  const cryptoApi = getBrowserCrypto();
  const storedKey = await readDeviceKey();
  if (storedKey) return storedKey;

  const generatedKey = await cryptoApi.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return installDeviceKey(generatedKey);
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const rememberApiKeyOnDevice = async (apiKey: string, provider = deviceTextProvider()) => {
  const cryptoApi = getBrowserCrypto();
  const deviceKey = await getOrCreateDeviceKey();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(apiKey);
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv },
    deviceKey,
    plaintext,
  );
  const record: EncryptedApiKeyRecord = {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
  window.localStorage.setItem(storageFor(provider), JSON.stringify(record));
  // Best effort. A denied persistence request must not turn a successful save
  // into a failure, or delay use of the credential.
  try { void window.navigator.storage?.persist?.().catch(() => false); } catch { /* Unsupported browser. */ }
};

export const restoreRememberedApiKey = async (provider = deviceTextProvider()) => {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(storageFor(provider));
    if (!saved) return null;
    const record = JSON.parse(saved) as Partial<EncryptedApiKeyRecord>;
    if (
      record.version !== 1 ||
      record.algorithm !== "AES-GCM" ||
      !record.iv ||
      !record.ciphertext
    ) {
      throw new Error("저장된 키 형식이 올바르지 않습니다.");
    }

    const cryptoApi = getBrowserCrypto();
    const deviceKey = await readDeviceKey();
    if (!deviceKey) throw new Error("기기 암호화 키가 없습니다.");
    const plaintext = await cryptoApi.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.iv) },
      deviceKey,
      base64ToBytes(record.ciphertext),
    );
    const apiKey = new TextDecoder().decode(plaintext).trim();
    if (!apiKey) throw new Error("저장된 API 키가 비어 있습니다.");
    return apiKey;
  } catch {
    // A locked/unavailable browser database is not a request to forget a key.
    // Preserve the original ciphertext for the next reload or manual retry.
    return null;
  }
};

export const forgetRememberedApiKey = async (provider = deviceTextProvider()) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageFor(provider));
  // Keep the non-exportable wrapping key; removing it can race a save in
  // another tab. It contains no provider credential after the payload is gone.
};
