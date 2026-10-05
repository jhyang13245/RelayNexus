import { optimizeImageRecord, imageEncodingProfile } from './vn-image-codec.mjs?v=620ff060ab90';
import { assetWork, visitRecords } from './vn-storage.mjs?v=620ff060ab90';
import { readAsset, replaceAssetEncoding } from './vn-assets.mjs?v=620ff060ab90';

export async function optimizeWorkImages(slug, { visit = visitRecords, read = readAsset, replace = replaceAssetEncoding, optimize = optimizeImageRecord, progress = () => {} } = {}) {
  const keys = [];
  await visit('assets', row => { if (assetWork(row) === slug && imageEncodingProfile(row)) keys.push(row.key); });
  let changed = 0, savedBytes = 0, failed = 0;
  for (let i = 0; i < keys.length; i++) {
    try {
      // Hold only one decoded image at a time on mobile; keep keys and counters.
      const original = await read(keys[i]);
      if (original && assetWork(original) === slug) {
        const result = await optimize(original);
        if (result !== original && await replace(original, result)) {
          changed++; savedBytes += Math.max(0, original.url.length - result.url.length);
        }
      }
    } catch { failed++; } // Atomic writes leave each original usable on failure.
    progress({ done: i + 1, total: keys.length, changed });
  }
  return { changed, savedBytes, failed, total: keys.length };
}
