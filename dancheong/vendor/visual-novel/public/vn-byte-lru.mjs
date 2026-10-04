/**
 * vn-byte-lru.mjs
 * Small dependency-free byte-budget LRU utility.
 *
 * API: createByteLru({ maxBytes, maxEntries = 48, onEvict = () => {} })
 * - Map-like has/get/set/delete/clear plus size/bytes getters.
 * - set(key, value, bytes): charges explicit byte size.
 * - get() touches recency; has() does not.
 * - Evicts least-recently-used until both budgets fit.
 * - Oversized entry is not cached; set() returns false.
 * - Successful set() returns true.
 */

function assertValidBudget(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0`);
  }
}

export function createByteLru({ maxBytes, maxEntries = 48, onEvict = () => {} } = {}) {
  assertValidBudget(maxBytes, "maxBytes");
  if (typeof maxEntries !== "number" || !Number.isInteger(maxEntries) || maxEntries < 0) {
    throw new RangeError("maxEntries must be an integer >= 0");
  }
  if (typeof onEvict !== "function") {
    throw new TypeError("onEvict must be a function");
  }

  // Insertion order = recency order: front (first) = LRU, back (last) = MRU.
  // Each entry: { value, bytes }
  const map = new Map();
  let totalBytes = 0;

  function touch(key, entry) {
    // Move to MRU position.
    map.delete(key);
    map.set(key, entry);
  }

  function evictIfNeeded() {
    while ((totalBytes > maxBytes || map.size > maxEntries) && map.size > 0) {
      // Least recent = first key.
      const lruKey = map.keys().next().value;
      const entry = map.get(lruKey);
      map.delete(lruKey);
      totalBytes -= entry.bytes;
      onEvict(entry.value, lruKey);
    }
  }

  const lru = {
    get size() {
      return map.size;
    },

    get bytes() {
      return totalBytes;
    },

    has(key) {
      return map.has(key);
    },

    get(key) {
      const entry = map.get(key);
      if (entry === undefined && !map.has(key)) return undefined;
      touch(key, entry);
      return entry.value;
    },

    set(key, value, bytes) {
      assertValidBudget(bytes, "bytes");

      // Oversized on its own: can never fit. Do not cache.
      // If replacing an existing key, dispose the old entry once.
      if (bytes > maxBytes || maxEntries < 1) {
        if (map.has(key)) {
          const old = map.get(key);
          map.delete(key);
          totalBytes -= old.bytes;
          onEvict(old.value, key);
        }
        return false;
      }

      if (map.has(key)) {
        const old = map.get(key);
        map.delete(key);
        totalBytes -= old.bytes;
        // Replacement disposes old value exactly once.
        onEvict(old.value, key);
      }

      const entry = { value, bytes };
      // Insert as most-recent.
      map.set(key, entry);
      totalBytes += bytes;

      evictIfNeeded();
      return true;
    },

    delete(key) {
      if (!map.has(key)) return false;
      const entry = map.get(key);
      map.delete(key);
      totalBytes -= entry.bytes;
      onEvict(entry.value, key);
      return true;
    },

    clear() {
      if (map.size === 0) return;
      // Oldest-first disposal order.
      const entries = [...map.entries()];
      map.clear();
      totalBytes = 0;
      for (const [key, entry] of entries) {
        onEvict(entry.value, key);
      }
    },
  };

  return lru;
}
