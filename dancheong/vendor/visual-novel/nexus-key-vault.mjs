// Main-site adapter. Preserve the original account-scoped database and record
// format across renderer releases; these records never belong to a save slot.
const DB_NAME = 'dancheong-ln-key-vault-v1';
const LEGACY_KEY = 'dancheong-cortex-device-api-key-v1';
const providers = ['openai', 'go', 'gemini', 'typecast'];
const requestValue = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const transactionDone = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = tx.onabort = () => reject(tx.error || new Error('키 저장소 오류'));
});
async function openVault(open = () => indexedDB.open(DB_NAME, 1)) {
  const request = open();
  request.onupgradeneeded = () => {
    for (const name of ['keys', 'secrets']) request.result.createObjectStore(name);
  };
  return requestValue(request);
}
async function readDeviceKey(db) {
  return requestValue(db.transaction('keys').objectStore('keys').get('device'));
}
async function encryptionKey(db) {
  const existing = await readDeviceKey(db);
  if (existing) return existing;
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // Concurrent tabs serialize this read/write. Never overwrite a wrapping key.
  const tx = db.transaction('keys', 'readwrite'), done = transactionDone(tx);
  const store = tx.objectStore('keys'), request = store.get('device');
  let key = candidate;
  request.onsuccess = () => {
    if (request.result) key = request.result;
    else store.put(candidate, 'device');
  };
  await done;
  return key;
}
async function readSecret(db, key, name) {
  const record = await requestValue(db.transaction('secrets').objectStore('secrets').get(name));
  if (!record) return '';
  if (!key) throw new Error('기기 암호화 키를 읽지 못했습니다.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext));
}
export async function loadDeviceKeys({ onError = () => {} } = {}) {
  const values = Object.fromEntries(providers.map(name => [name, '']));
  let db, failed = false;
  try {
    db = await openVault();
    // Reading does not generate/replace keys or mutate encrypted records.
    const key = await readDeviceKey(db);
    for (const name of providers) {
      try { values[name] = await readSecret(db, key, name); }
      catch { failed = true; }
    }
    // The old multiplayer host used the raw ID as a second account namespace.
    // Recover only absent provider records; an explicit blank is a deletion,
    // and a current saved key always wins. No account-wide database scanning.
    if (typeof globalThis.NexusVNLegacyKeyVault === 'function') {
      let legacyDb;
      try {
        legacyDb = await openVault(globalThis.NexusVNLegacyKeyVault);
        const oldKey = await readDeviceKey(legacyDb), recovered = {};
        for (const name of providers) {
          const existing = await requestValue(db.transaction('secrets').objectStore('secrets').get(name));
          if (!existing) { const value = await readSecret(legacyDb, oldKey, name); if (value) recovered[name] = value; }
        }
        if (Object.keys(recovered).length) {
          await storeDeviceKeys(recovered, { onlyMissing: true });
          const currentKey = await readDeviceKey(db);
          for (const name of Object.keys(recovered)) values[name] = await readSecret(db, currentKey, name);
        }
      } catch { failed = true; } finally { legacyDb?.close(); }
    }
    const legacy = localStorage.getItem(LEGACY_KEY) || '';
    if (legacy && !values.openai && !failed) {
      await storeDeviceKeys({ openai: legacy });
      values.openai = legacy;
    }
    if (legacy && values.openai) localStorage.removeItem(LEGACY_KEY);
  } catch { failed = true; }
  finally { db?.close(); }
  if (failed) onError(); // Never include a secret or raw provider error.
  return values;
}
export function changedDeviceKeys(values, previous) {
  return Object.fromEntries(providers.filter(name => Object.hasOwn(values, name) && values[name] !== (previous[name] || '')).map(name => [name, values[name]]));
}
export async function storeDeviceKeys(values, { onlyMissing = false } = {}) {
  const names = providers.filter(name => Object.hasOwn(values, name));
  if (!names.length) return;
  const db = await openVault();
  try {
    const key = await encryptionKey(db);
    const records = await Promise.all(names.map(async name => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(values[name]));
      return { name, iv, ciphertext };
    }));
    const tx = db.transaction('secrets', 'readwrite'), done = transactionDone(tx);
    for (const { name, iv, ciphertext } of records) {
      const store = tx.objectStore('secrets');
      if (!onlyMissing) store.put({ iv, ciphertext }, name);
      else {
        // Serialize migration with other tabs' saves, including explicit blanks.
        const request = store.get(name);
        request.onsuccess = () => { if (!request.result) store.put({ iv, ciphertext }, name); };
      }
    }
    await done;
    try { void globalThis.navigator?.storage?.persist?.().catch(() => false); } catch { /* Optional. */ }
  } finally { db.close(); }
}
