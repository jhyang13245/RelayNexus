import { hostServices } from './vn-host.mjs?v=88af24489d44';
import { readBackup } from './vn-backup.mjs?v=88af24489d44';
import { createCloudBundle, readCloudBundle } from './vn-cloud-bundle.mjs?v=88af24489d44';
import { snapshotScope } from './vn-edition-key.mjs?v=88af24489d44';
import { workAssets, workCosts } from './vn-storage.mjs?v=88af24489d44';

export const cloudSlot = number => `slot-${number}`;
export const continueSlot = slug => `continue-${slug}`;
const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
export async function cloudPayload(record, includeMedia = false) {
  const assets = includeMedia ? await workAssets(snapshotScope(record.slug, record.snapshot)) : [];
  const costs = includeMedia ? await workCosts(record.slug) : [];
  // Cloud progress always carries its exact work package for edition-safe load.
  // Generated media is optional and never uploads API keys/device settings.
  const clean = { ...record, cacheBackup: includeMedia ? record.cacheBackup : [], costBackup: includeMedia ? record.costBackup : [] };
  const bundle = await createCloudBundle(clean, { assets, costs });
  return { ...bundle, checksum: await hash(bundle.blob), summary: { slug: record.slug, title: record.title, savedAt: record.savedAt,
    scene: record.scene, excerpt: record.excerpt, page: record.page, pageCount: record.pageCount, mediaIncluded: includeMedia, format: 'manifest-v2', mediaBytes: bundle.totalBytes } };
}
export function createCloudClient({ fetchImpl = (...args) => fetch(...args), endpoint = hostServices().cloudBase } = {}) {
  let account = '', displayName = '', generation = 0;
  async function result(response) {
    let body;
    try { body = await response.json(); }
    catch { const error = new Error('클라우드 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'); error.status = response.status; throw error; }
    if (!response.ok) { const error = new Error(body.error || '클라우드 요청 실패'); error.code = body.code; error.status = response.status; throw error; }
    return body;
  }
  async function list() {
    const data = await result(await fetchImpl(endpoint, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) }));
    if (!/^[a-f0-9]{64}$/u.test(data.account) || !Array.isArray(data.slots)) throw new Error('클라우드 응답을 확인하지 못했습니다.');
    if (account !== data.account) generation++;
    account = data.account; displayName = data.displayName;
    return data;
  }
  function headers(extra = {}) { if (!account) throw new Error('클라우드 목록에서 계정을 먼저 확인해 주세요.'); return { 'X-VN-Account': account, ...extra }; }
  async function send(url, options) {
    // One bounded retry; content hashes and mutation IDs make both writes safe
    // when a successful response is lost. Auth/conflict errors never retry.
    for (let attempt = 0; ; attempt++) {
      try { return await result(await fetchImpl(url, { ...options, signal: AbortSignal.timeout(180000) })); }
      catch (error) { if (attempt || error.status && error.status < 500) throw error; await new Promise(resolve => setTimeout(resolve, 800)); }
    }
  }
  return {
    list, get account() { return account; }, get displayName() { return displayName; },
    clear() { account = ''; displayName = ''; generation++; },
    async put(slot, payload, revision = '0', mutation = crypto.randomUUID(), onProgress = () => {}) {
      const epoch = generation, owner = account;
      const assertAccount = () => { if (epoch !== generation || owner !== account) throw new Error('작업 중 계정이 바뀌었습니다.'); };
      if (payload.objects) {
        const objects = [...payload.objects], needed = new Set();
        for (let i = 0; i < objects.length; i += 128) {
          assertAccount();
          const inventory = await send(`${endpoint}/objects`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: headers({ 'Content-Type': 'application/json', 'X-VN-Cloud': '1' }), body: JSON.stringify(objects.slice(i, i + 128).map(([hash, blob]) => ({ hash, bytes: blob.size }))) });
          if (inventory.account !== owner || !Array.isArray(inventory.missing) || inventory.missing.some(key => !payload.objects.has(key))) throw new Error('클라우드 파일 목록을 확인하지 못했습니다.');
          inventory.missing.forEach(key => needed.add(key));
        }
        const total = objects.reduce((sum, [key, blob]) => sum + (needed.has(key) ? blob.size : 0), 0); let sent = 0;
        onProgress({ phase: 'media', sent, total, reused: objects.length - needed.size });
        for (const [key, blob] of objects) if (needed.has(key)) {
          assertAccount();
          const stored = await send(`${endpoint}/objects/${key}`, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: headers({ 'Content-Type': 'application/octet-stream', 'X-VN-Cloud': '1' }), body: blob });
          if (stored.account !== owner) throw new Error('전송 중 계정이 바뀌었습니다.');
          sent += blob.size; onProgress({ phase: 'media', sent, total, reused: objects.length - needed.size });
        }
      }
      assertAccount(); onProgress({ phase: 'commit' });
      const response = await send(`${endpoint}/${encodeURIComponent(slot)}`, {
        method: 'PUT', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(180000),
        headers: headers({ 'Content-Type': 'application/octet-stream', 'X-VN-Cloud': '1', 'If-Match': revision,
          'Idempotency-Key': mutation, 'X-VN-Checksum': payload.checksum, 'X-VN-Summary': encodeURIComponent(JSON.stringify(payload.summary)) }), body: payload.blob,
      });
      if (epoch !== generation || response.account !== owner) throw new Error('작업 중 계정이 바뀌었습니다. 클라우드 목록을 다시 확인해 주세요.');
      return response.slot;
    },
    async get(row) {
      const epoch = generation;
      const response = await fetchImpl(`${endpoint}/${encodeURIComponent(row.slot)}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(180000), headers: headers({ 'If-Match': row.revision }) });
      if (!response.ok) await result(response);
      const blob = await response.blob();
      if (epoch !== generation || !account) throw new Error('작업 중 계정이 바뀌었습니다. 다시 확인해 주세요.');
      if (blob.size > 64 * 1024 * 1024 || await hash(blob) !== row.checksum) throw new Error('다운로드한 클라우드 파일이 손상되었습니다. 기존 진행은 유지됩니다.');
      const backup = row.format === 'manifest-v2' ? await readCloudBundle(blob, async key => {
        if (epoch !== generation || !account) throw new Error('작업 중 계정이 바뀌었습니다.');
        const response = await fetchImpl(`${endpoint}/objects/${key}`, { credentials: 'same-origin', cache: 'no-store', headers: headers(), signal: AbortSignal.timeout(180000) });
        if (!response.ok) await result(response);
        const object = await response.blob();
        if (epoch !== generation) throw new Error('작업 중 계정이 바뀌었습니다.');
        return object;
      }) : await readBackup(blob);
      return { ...backup.record, cacheBackup: backup.assets, costBackup: backup.costs };
    },
  };
}
