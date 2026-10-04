// Account-scoped content-addressed pieces. No media bytes live in the slot
// manifest, so different slots and later saves share the same immutable files.
import { BACKUP_SCHEMA, scrubBackup, validateBackup } from './vn-backup.mjs?v=88af24489d44';
export const CLOUD_BUNDLE = 'DANCHEONG_VN_CLOUD_V2';
export const CLOUD_CHUNK_BYTES = 8 * 1024 * 1024;
export const CLOUD_TOTAL_BYTES = 1024 * 1024 * 1024;
const mediaPattern = /^data:((?:image\/(?:png|jpeg|webp)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|opus|webm|aac|mp4)));base64,([A-Za-z0-9+/=\r\n]+)$/u;
export const blobHash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
const dataBlob = (mime, base64) => { const raw = atob(base64.replace(/[\r\n]/gu, '')), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return new Blob([bytes], { type: mime }); };
async function dataUrl(blob, mime) {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${mime};base64,${btoa(binary)}`;
}
export async function createCloudBundle(record, { assets = [], costs = [] } = {}) {
  const objects = new Map(); let totalBytes = 0;
  async function split(blob) {
    const parts = [];
    for (let offset = 0; offset < blob.size; offset += CLOUD_CHUNK_BYTES) {
      const part = blob.slice(offset, offset + CLOUD_CHUNK_BYTES), hash = await blobHash(part);
      if (!objects.has(hash)) { totalBytes += part.size; if (totalBytes > CLOUD_TOTAL_BYTES) throw new Error('이 작품의 클라우드 미디어가 1 GB를 넘습니다. 파일 백업을 보관해 주세요.'); objects.set(hash, part); }
      parts.push(hash);
    }
    return { parts, bytes: blob.size };
  }
  async function packet(value) {
    const media = [];
    async function visit(node, path = []) {
      const match = typeof node === 'string' && node.match(mediaPattern);
      if (match) { media.push({ path, mime: match[1], ...await split(dataBlob(match[1], match[2])) }); return null; }
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) { const out = []; for (let i = 0; i < node.length; i++) out.push(await visit(node[i], [...path, i])); return out; }
      const out = {}; for (const [key, item] of Object.entries(node)) out[key] = await visit(item, [...path, key]); return out;
    }
    const tree = await visit(value);
    const blob = new Blob([JSON.stringify({ tree, media })]);
    if (blob.size > 64 * 1024 * 1024) throw new Error('진행 정보가 너무 큽니다. 기존 저장은 유지됩니다.');
    return split(blob);
  }
  // Validate/scrub once before externalizing. Private API settings never enter
  // any object, including media supplied by older imported slots.
  const source = validateBackup(scrubBackup({ schema: BACKUP_SCHEMA, record: { ...record, cacheBackup: [], costBackup: [] },
    assets: [...new Map([...(record.cacheBackup || []), ...assets].map(row => [row.key, row])).values()],
    costs: [...new Map([...(record.costBackup || []), ...costs].map(row => [row.id, row])).values()] }));
  const root = { schema: CLOUD_BUNDLE, record: await packet(source.record), assets: [], costs: await packet(source.costs), objects: [] };
  for (const asset of source.assets) root.assets.push(await packet(asset));
  root.objects = [...objects].map(([hash, blob]) => ({ hash, bytes: blob.size }));
  if (root.objects.length > 10000) throw new Error('클라우드 파일 수 한도를 넘었습니다. 파일 백업을 사용해 주세요.');
  return { blob: new Blob([JSON.stringify(root)], { type: 'application/json' }), objects, totalBytes };
}
export async function readCloudBundle(blob, readObject) {
  if (blob.size > 4 * 1024 * 1024) throw new Error('클라우드 목차가 너무 큽니다.');
  const root = JSON.parse(await blob.text());
  if (root.schema !== CLOUD_BUNDLE || !Array.isArray(root.objects) || root.objects.length > 10000 || !Array.isArray(root.assets) || root.assets.length > 20000) throw new Error('클라우드 목차가 올바르지 않습니다.');
  const sizes = new Map(); let total = 0, hydrated = 0;
  for (const row of root.objects) {
    if (!/^[a-f0-9]{64}$/u.test(row?.hash) || !Number.isInteger(row.bytes) || row.bytes <= 0 || row.bytes > CLOUD_CHUNK_BYTES || sizes.has(row.hash)) throw new Error('클라우드 파일 목록이 손상되었습니다.');
    sizes.set(row.hash, row.bytes); total += row.bytes;
  }
  if (total > CLOUD_TOTAL_BYTES) throw new Error('클라우드 파일 용량 한도를 넘었습니다.');
  const cache = new Map(); let cacheBytes = 0;
  async function join(ref, max = 128 * 1024 * 1024) {
    if (!ref || !Array.isArray(ref.parts) || ref.parts.length > 128 || !Number.isInteger(ref.bytes) || ref.bytes < 0 || ref.bytes > max) throw new Error('클라우드 조각 정보가 손상되었습니다.');
    if (ref.parts.reduce((sum, key) => sum + (sizes.get(key) ?? Infinity), 0) !== ref.bytes) throw new Error('클라우드 조각 크기가 맞지 않습니다.');
    const parts = [];
    for (const key of ref.parts) {
      let part = cache.get(key);
      if (!part) {
        part = await readObject(key);
        if (part.size !== sizes.get(key) || await blobHash(part) !== key) throw new Error('클라우드 미디어가 손상되었습니다. 기존 진행은 유지됩니다.');
        while (cacheBytes + part.size > 32 * 1024 * 1024 && cache.size) { const first = cache.keys().next().value; cacheBytes -= cache.get(first).size; cache.delete(first); }
        cache.set(key, part); cacheBytes += part.size;
      } else { cache.delete(key); cache.set(key, part); }
      parts.push(part);
    }
    return new Blob(parts);
  }
  async function packet(ref) {
    const packed = JSON.parse(await (await join(ref, 64 * 1024 * 1024)).text());
    if (!Array.isArray(packed.media) || packed.media.length > 20000) throw new Error('클라우드 미디어 연결이 손상되었습니다.');
    let tree = packed.tree;
    for (const row of packed.media) {
      if (!Array.isArray(row.path) || row.path.length > 100 || row.path.some(key => !['string','number'].includes(typeof key) || ['__proto__','constructor','prototype'].includes(key)) || !mediaPattern.test(`data:${row.mime};base64,YQ==`)) throw new Error('클라우드 미디어 경로가 잘못되었습니다.');
      hydrated += row.bytes; if (hydrated > CLOUD_TOTAL_BYTES * 2) throw new Error('복원 미디어 용량 한도를 넘었습니다.');
      const value = await dataUrl(await join(row), row.mime);
      if (!row.path.length) { if (tree !== null) throw new Error('미디어 위치가 맞지 않습니다.'); tree = value; }
      else { let parent = tree; for (const key of row.path.slice(0,-1)) { if (!parent || !Object.hasOwn(parent,key)) throw new Error('미디어 위치가 없습니다.'); parent = parent[key]; } const key = row.path.at(-1); if (!parent || !Object.hasOwn(parent,key) || parent[key] !== null) throw new Error('미디어 위치가 맞지 않습니다.'); parent[key] = value; }
    }
    return tree;
  }
  const record = await packet(root.record), assets = [];
  for (const ref of root.assets) assets.push(await packet(ref));
  return validateBackup(scrubBackup({ schema: BACKUP_SCHEMA, record, assets, costs: await packet(root.costs) }));
}
