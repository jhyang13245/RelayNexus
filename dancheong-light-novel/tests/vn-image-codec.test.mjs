import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeImageRecord, imageEncodingProfile } from '../public/vn-image-codec.mjs';
import { optimizeWorkImages } from '../public/vn-image-storage.mjs';
const png = 'data:image/png;base64,' + 'AAAA'.repeat(100);
const webp = 'data:image/webp;base64,' + 'AAAA'.repeat(10);
const image = (scope = 'book:story') => ({ key: JSON.stringify(['vn-portrait-1', scope, 'person']), url: png, provider: 'gemini', stageFrame: 'vn-stage-frame-2', matteColor: 'green', frameReview: { status: 'valid' } });

test('WebP storage keeps semantic cache keys, alpha processing metadata and high detail profile', async () => {
  const row = image(); let request;
  const result = await optimizeImageRecord(row, { encode: async data => { request = data; return webp; } });
  assert.equal(request.kind, 'storage-webp'); assert.equal(request.quality, .94);
  assert.equal(result.key, row.key); assert.equal(result.matteColor, 'green'); assert.deepEqual(result.frameReview, row.frameReview);
  assert.equal(result.url, webp); assert.equal(row.url, png); assert.ok(result.storageEncoding.storedBytes < result.storageEncoding.originalBytes);
  assert.equal(imageEncodingProfile({ url: png, purpose: 'background' }).quality, .88);
});
test('unsupported, failed, larger or already compressed images keep the original; animation pixels stay lossless', async () => {
  const row = image();
  for (const url of [null, png, 'data:image/webp;base64,' + 'AAAA'.repeat(105)]) assert.equal(await optimizeImageRecord(row, { encode: async () => url }), row);
  assert.equal(await optimizeImageRecord(row, { encode: async () => { throw Error('decode'); } }), row);
  for (const item of [{ ...row, url: webp }, { ...row, motionPolicy: 'masked-pixels-1' }, { ...row, url: 'data:audio/mpeg;base64,AAAA' }]) {
    assert.equal(await optimizeImageRecord(item, { encode: () => assert.fail('must not encode') }), item);
  }
});
test('work optimization is sequential, skips other works and preserves originals on failure or concurrent replacement', async () => {
  const rows = [image(), image('other:story'), { ...image(), key: JSON.stringify(['vn-portrait-1', 'book:story', 'second']) }];
  let active = 0, maximum = 0, attempts = 0;
  const result = await optimizeWorkImages('book', {
    visit: async (_kind, visit) => rows.forEach(visit), read: async key => rows.find(row => row.key === key),
    optimize: async row => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return { ...row, url: webp }; },
    replace: async () => { if (++attempts === 1) throw Error('quota'); return false; },
  });
  assert.deepEqual(result, { changed: 0, savedBytes: 0, failed: 1, total: 2 }); assert.equal(maximum, 1);
  assert.ok(rows.every(row => row.url === png));
});
