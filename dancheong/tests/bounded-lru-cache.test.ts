import assert from "node:assert/strict";
import test from "node:test";

import { BoundedLruCache } from "../lib/bounded-lru-cache";

test("bounded LRU evicts the least recently used entry", () => {
  const cache = new BoundedLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.peek("b"), undefined);
  assert.equal(cache.peek("a"), 1);
  assert.equal(cache.peek("c"), 3);
});

test("bounded LRU replaces values without growing", () => {
  const cache = new BoundedLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("a", 2);
  assert.equal(cache.size, 1);
  assert.equal(cache.get("a"), 2);
});
