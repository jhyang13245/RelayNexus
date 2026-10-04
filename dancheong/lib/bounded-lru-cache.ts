export class BoundedLruCache<Key, Value> {
  private readonly entries = new Map<Key, Value>();

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("LRU cache limit must be a positive integer.");
    }
  }

  get(key: Key): Value | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  peek(key: Key): Value | undefined {
    return this.entries.get(key);
  }

  set(key: Key, value: Value): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  delete(key: Key): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
