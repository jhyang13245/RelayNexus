const DB_NAME = 'dancheong-ln-key-vault-v1';
const LEGACY_KEY = 'dancheong-cortex-device-api-key-v1';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('키 저장소 오류'));
  });
}

async function openVault() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('keys');
      db.createObjectStore('secrets');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function encryptionKey(db) {
  const read = db.transaction('keys');
  const existing = await requestValue(read.objectStore('keys').get('device'));
  if (existing) return existing;
  const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const write = db.transaction('keys', 'readwrite');
  write.objectStore('keys').put(generated, 'device');
  await transactionDone(write);
  return generated;
}

async function readSecret(db, key, name) {
  const tx = db.transaction('secrets');
  const record = await requestValue(tx.objectStore('secrets').get(name));
  if (!record) return '';
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext);
  return new TextDecoder().decode(plaintext);
}

export async function loadDeviceKeys() {
  const db = await openVault();
  try {
    const key = await encryptionKey(db);
    let openai = await readSecret(db, key, 'openai');
    const go = await readSecret(db, key, 'go');
    const gemini = await readSecret(db, key, 'gemini');
    const legacy = localStorage.getItem(LEGACY_KEY) || '';
    if (legacy && !openai) {
      await storeDeviceKeys({ openai: legacy, go, gemini });
      openai = legacy;
    }
    if (legacy) localStorage.removeItem(LEGACY_KEY);
    return { openai, go, gemini };
  } finally { db.close(); }
}

export async function storeDeviceKeys(values) {
  const db = await openVault();
  try {
    const key = await encryptionKey(db);
    // A partial update never erases another provider's existing key.
    const records = await Promise.all(['openai', 'go', 'gemini'].filter(name => Object.hasOwn(values, name)).map(async name => {
      const value = values[name];
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
      return { name, iv, ciphertext };
    }));
    const tx = db.transaction('secrets', 'readwrite');
    for (const { name, iv, ciphertext } of records) tx.objectStore('secrets').put({ iv, ciphertext }, name);
    await transactionDone(tx);
  } finally { db.close(); }
}
