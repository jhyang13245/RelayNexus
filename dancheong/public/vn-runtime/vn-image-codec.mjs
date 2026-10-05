import { rasterTask } from './vn-raster.mjs?v=4a6fe5d540c6';

export const WEBP_STORAGE_VERSION = 1;
export function imageEncodingProfile(record) {
  // These experimental animation frames promise exact pixels outside the
  // eye/mouth mask. A lossy second encoding would violate that promise.
  if (record?.motionPolicy || String(record?.key || '').includes('vn-motion-mask-')) return null;
  if (!/^data:image\/(?:png|jpeg);base64,/u.test(record?.url || '')) return null;
  const detailed = record.stageFrame || record.purpose !== 'background';
  return { quality: detailed ? .94 : .88 };
}
export async function optimizeImageRecord(record, { encode = rasterTask } = {}) {
  const profile = imageEncodingProfile(record);
  if (!profile) return record;
  try {
    const url = await encode({ kind: 'storage-webp', url: record.url, ...profile });
    // Canvas implementations can silently return PNG when WebP encoding is
    // unavailable. Validate the actual MIME and require a useful size saving.
    if (!/^data:image\/webp;base64,/u.test(url || '') || url.length >= record.url.length * .97) return record;
    return { ...record, url, storageEncoding: { version: WEBP_STORAGE_VERSION, format: 'webp', quality: profile.quality,
      originalBytes: dataImageBytes(record.url), storedBytes: dataImageBytes(url) } };
  } catch { return record; }
}
export function dataImageBytes(url) {
  const encoded = String(url).split(',')[1] || '';
  return Math.max(0, Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
}
