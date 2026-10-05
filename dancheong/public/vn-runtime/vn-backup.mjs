import { makeSlot, validateSlot } from './vn-saves.mjs?v=ef485ae04925';
import { snapshotScope } from './vn-edition-key.mjs?v=ef485ae04925';
import { assetScope, workAssets, workCosts, mergeRecords } from './vn-storage.mjs?v=ef485ae04925';

export const BACKUP_SCHEMA = 'DANCHEONG_VN_FILE_V1';
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const secret = /^(?:__proto__|prototype|constructor|api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|password|secret|credentials)$/iu;
export function scrubBackup(value) {
  return JSON.parse(JSON.stringify(value), (key, item) => secret.test(key) ? undefined : item);
}
const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
const copySlot = (record, extra = {}) => makeSlot({ ...record, now: record.savedAt, ...extra });
function safeCost(row, slug) {
  if (!row || row.slug !== slug || typeof row.id !== 'string' || !row.id || !Number.isFinite(row.at)) throw new Error('비용 기록의 작품 정보가 손상되었습니다.');
  if (row.cost && (typeof row.cost !== 'object' || !['unknown', 'subscription', 'credits', 'estimate', 'upper-bound', 'exact'].includes(row.cost.kind) || (row.cost.usd !== null && (!Number.isFinite(row.cost.usd) || row.cost.usd < 0)))) throw new Error('백업의 비용 기록이 손상되었습니다.');
  const allowed = ['id', 'at', 'slug', 'title', 'provider', 'category', 'model', 'state', 'usage', 'cost', 'priceDate', 'serviceTier'];
  return Object.fromEntries(allowed.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
}
export function validateBackup(payload) {
  if (payload?.schema !== BACKUP_SCHEMA || !Array.isArray(payload.assets) || !Array.isArray(payload.costs)) throw new Error('단청 저장 슬롯 백업 파일이 아닙니다.');
  validateSlot(payload.record);
  if (typeof payload.record.savedAt !== 'string' || !Number.isFinite(Date.parse(payload.record.savedAt))) throw new Error('백업의 저장 날짜가 손상되었습니다.');
  const record = copySlot(payload.record), scope = snapshotScope(record.slug, record.snapshot);
  if (record.presentation.openingArt && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/u.test(record.presentation.openingArt)) throw new Error('백업 도입 이미지가 지원되는 파일 형식이 아닙니다.');
  // Never allow an imported file to carry a different work's media or remote URLs.
  const keys = new Set();
  for (const row of payload.assets) {
    if (assetScope(row?.key) !== scope || keys.has(row.key)) throw new Error('백업 이미지·음성의 작품 정보가 손상되었습니다.');
    keys.add(row.key);
    for (const key of ['url', 'rejectedImageUrl']) if (row[key] && !/^data:(?:image\/(?:png|jpeg|webp)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|opus|webm|aac|mp4));base64,[A-Za-z0-9+/=\r\n]+$/u.test(row[key])) throw new Error('백업에 지원하지 않는 미디어가 있습니다.');
  }
  return { record, assets: payload.assets, costs: payload.costs.map(row => safeCost(row, record.slug)) };
}
export async function makeBackup(record, { assets = [], costs = [] } = {}) {
  const allAssets = new Map([...(record.cacheBackup || []), ...assets].map(row => [row.key, row]));
  const allCosts = new Map([...(record.costBackup || []), ...costs].map(row => [row.id, row]));
  const clean = validateBackup(scrubBackup({ schema: BACKUP_SCHEMA, record: copySlot(record), assets: [...allAssets.values()], costs: [...allCosts.values()] }));
  const payload = { schema: BACKUP_SCHEMA, ...clean };
  const text = JSON.stringify(payload);
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('백업 크기가 지원 한도인 256 MB를 넘어 파일을 만들지 못했습니다. 기존 데이터는 유지됩니다.');
  return new Blob([JSON.stringify({ checksum: await digest(text), payload })], { type: 'application/json' });
}
async function boundedText(stream) {
  const reader = stream.getReader(), parts = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BACKUP_BYTES + 1024) { await reader.cancel(); throw new Error('백업의 압축 해제 크기가 256 MB를 넘습니다.'); } parts.push(value); }
    return await new Blob(parts).text();
  } finally { reader.releaseLock(); }
}
export async function readBackup(file) {
  if (!file?.size || file.size > MAX_BACKUP_BYTES + 1024) throw new Error('비어 있거나 너무 큰 백업 파일입니다 (최대 256 MB).');
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const zipped = header[0] === 31 && header[1] === 139;
  if (zipped && typeof DecompressionStream === 'undefined') throw new Error('압축 백업을 읽을 수 없는 브라우저입니다. 최신 브라우저를 사용해 주세요.');
  let envelope;
  try { envelope = JSON.parse(await boundedText(zipped ? file.stream().pipeThrough(new DecompressionStream('gzip')) : file.stream())); }
  catch (error) { throw new Error(`백업 파일을 읽지 못했습니다: ${error.message}`); }
  if (typeof envelope.checksum !== 'string' || envelope.checksum !== await digest(JSON.stringify(envelope.payload))) throw new Error('백업 파일이 손상되었거나 내용이 바뀌었습니다. 원본 파일을 선택해 주세요.');
  return validateBackup(scrubBackup(envelope.payload));
}
export async function exportSlotFile(record) {
  const assets = await workAssets(snapshotScope(record.slug, record.snapshot)), costs = await workCosts(record.slug);
  let blob = await makeBackup(record, { assets, costs }), extension = '.json';
  if (typeof CompressionStream !== 'undefined') { blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); extension += '.gz'; }
  const filename = `단청-${record.title.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 60)}-${record.slot}번-${new Date().toISOString().slice(0, 10)}${extension}`;
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { bytes: blob.size, filename };
}
export async function storeImportedSlot({ backup, slot, revision, store }) {
  const { record, assets, costs } = backup;
  // One atomic slot write retains every byte even if a later cache restore fails.
  // Import does not activate the story, restore settings, or change the cost ledger.
  return store.put({ ...copySlot(record, { slot }), cacheBackup: assets, costBackup: costs }, revision);
}
export async function restoreSlotMedia(record) {
  const assets = record.cacheBackup || [], costs = record.costBackup || [];
  if (!assets.length && !costs.length) return;
  validateBackup({ schema: BACKUP_SCHEMA, record, assets, costs });
  await mergeRecords('assets', assets); await mergeRecords('costs', costs);
}
