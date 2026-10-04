import { editionId, snapshotEdition } from './vn-edition-key.mjs?v=a63fa2266034';
import { validateSlot, slotSummary } from './vn-saves.mjs?v=a63fa2266034';

export function revisionDescriptor(row) {
  const revision = row?.revision ?? row?.currentRevision, sha256 = String(row?.packageSha256 || '').toLowerCase();
  if (!Number.isSafeInteger(revision) || revision < 1 || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error('덧칠 번호와 파일 지문을 확인하지 못했습니다. 목록을 다시 확인해 주세요.');
  return { revision, sha256, bytes: Number(row.packageBytes) || 0, createdAt: String(row.createdAt || row.updatedAt || ''), notes: String(row.notes || row.changeLog || '').slice(0, 2000) };
}
// A catalog row without a complete published revision (older works, or a hub
// that has not reported one) still opens, unversioned, like before editions.
export function catalogRevision(row) {
  try { return row?.currentRevision != null && row?.packageSha256 ? revisionDescriptor(row) : null; } catch { return null; }
}
export async function verifiedPackage(slug, revision, fetchPackage = fetch) {
  if (!/^[a-z0-9-]{3,80}$/u.test(slug)) throw new Error('작품 주소가 올바르지 않습니다.');
  const response = await fetchPackage(`/api/work/${encodeURIComponent(slug)}/download${revision ? `?revision=${revision.revision}` : ''}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`작품을 내려받지 못했습니다 (${response.status}). 현재 진행은 유지됩니다.`);
  const bytes = await response.arrayBuffer();
  if (revision) {
    // Compare the requested immutable revision, never the catalog's latest label.
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (sha256 !== revision.sha256 || (revision.bytes && bytes.byteLength !== revision.bytes)) throw new Error('덧칠 파일이 공개된 원본과 일치하지 않습니다. 기존 진행을 유지했습니다.');
  }
  return new File([bytes], `${slug}.zip`, { type: 'application/zip' });
}
export function stampEdition(candidate, slug, revision) {
  if (!revision) return candidate;
  const next = structuredClone(candidate);
  const edition = { schema: 'DANCHEONG_VN_EDITION_V1', slug, revision: revision.revision, sha256: revision.sha256 };
  editionId(edition, slug);
  next.scenario.runtime.vnEdition = edition;
  if (next.canonicalSession) {
    next.canonicalSession.state ||= {};
    next.canonicalSession.state.cortexRuntimeExtra ||= {};
    next.canonicalSession.state.cortexRuntimeExtra.vnEdition = edition;
  }
  return next;
}

// Separate automatic archives; none of the ten numbered slots are overwritten.
export function createEditionStore(indexedDB = globalThis.indexedDB) {
  async function transaction(names, mode, action) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dancheong-vn-editions-v1', 1);
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; reject(new Error('덧칠 저장소 연결 시간이 초과되었습니다.')); }, 6000);
      request.onupgradeneeded = () => { for (const name of ['records', 'summaries']) request.result.createObjectStore(name); };
      request.onsuccess = () => { clearTimeout(timer); if (timedOut) request.result.close(); else resolve(request.result); };
      request.onerror = request.onblocked = () => { clearTimeout(timer); timedOut = true; reject(request.error || new Error('덧칠 저장소를 사용할 수 없습니다.')); };
    });
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode); let value;
      const timer = setTimeout(() => tx.abort(), 15000);
      tx.oncomplete = () => { clearTimeout(timer); resolve(value); };
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(tx.error || new Error('덧칠 보관에 실패했습니다. 기존 진행을 유지합니다.')); };
      try { action(tx, v => { value = v; }); } catch (error) { tx.abort(); reject(error); }
    }); } finally { db.close(); }
  }
  const key = (slug, id) => JSON.stringify([slug, id]);
  return {
    put(record) {
      validateSlot(record);
      const edition = snapshotEdition(record.snapshot), id = editionId(edition, record.slug);
      return transaction(['records', 'summaries'], 'readwrite', tx => {
        tx.objectStore('records').put(record, key(record.slug, id));
        tx.objectStore('summaries').put({ ...slotSummary(record), id, edition }, key(record.slug, id));
      });
    },
    get: (slug, id) => transaction(['records'], 'readonly', (tx, done) => { tx.objectStore('records').get(key(slug, id)).onsuccess = event => done(event.target.result || null); }),
    list: slug => transaction(['summaries'], 'readonly', (tx, done) => { tx.objectStore('summaries').getAll().onsuccess = event => done(event.target.result.filter(row => row.slug === slug)); }),
  };
}
