/** Disposable acceleration only: callers must persist blobs before adding them. */
export class BlobMemoryCache<Key> {
  private entries = new Map<Key, Blob>();
  private bytes = 0;
  constructor(private readonly maximumBytes: number) {}
  get(key: Key) {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  delete(key: Key) {
    const value = this.entries.get(key);
    if (value) this.bytes -= value.size;
    this.entries.delete(key);
  }
  set(key: Key, value: Blob) {
    this.delete(key);
    if (value.size > this.maximumBytes) return;
    this.entries.set(key, value); this.bytes += value.size;
    while (this.bytes > this.maximumBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
  }
  get byteLength() { return this.bytes; }
}
