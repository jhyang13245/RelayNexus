import { hubRevisionIdentity } from '../../lib/hub-revision';
import { validateHubPackageBytes, type HubPackageDescriptor } from '../../lib/hub-package';

export type StorySource =
  | { kind: 'device'; file: File }
  | { kind: 'server' }
  | { kind: 'revision'; revision: number; descriptor: HubPackageDescriptor }
  | { kind: 'missing'; message: string };

// Resolve only the selected installation. A matching title/source ID does not
// prove a revision; never substitute the current catalog download for an old ZIP.
export async function findStorySource(projectId: string, serverPackage: boolean, readLocal: (id: string) => Promise<File | null>, signal?: AbortSignal): Promise<StorySource> {
  signal?.throwIfAborted();
  // An IndexedDB open can be blocked by another tab; don't leave the picker
  // checking forever, and never let a late result replace a new selection.
  let cancel: (() => void) | undefined;
  const file = await Promise.race([
    readLocal(projectId).catch(() => null),
    new Promise<never>((_,reject)=>{cancel=()=>reject(signal?.reason);signal?.addEventListener('abort',cancel,{once:true})}),
  ]).finally(()=>{if(cancel)signal?.removeEventListener('abort',cancel)});
  signal?.throwIfAborted();
  if (file) return { kind: 'device', file };
  const identity = hubRevisionIdentity(projectId);
  if (identity) {
    const response = await fetch(`/api/neoreum/works/${encodeURIComponent(identity.slug)}/revisions`, { signal, cache: 'no-store' });
    if (!response.ok) throw Error('너름의 덧칠 원본을 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
    const payload = await response.json() as { revisions?: Array<{ revision: number; packageVersion: string; packageBytes?: number; packageSha256?: string }> };
    const revision = payload.revisions?.find(row => row.revision === identity.revision);
    if (!revision || !/^[a-f0-9]{64}$/i.test(revision.packageSha256 || '')) return { kind: 'missing', message: `덧칠 v${identity.revision}의 원본을 확인할 수 없습니다. 같은 덧칠 ZIP을 서재에 다시 설치해 주세요. 기존 세션은 ZIP 없이 이어갈 수 있습니다.` };
    return { kind: 'revision', revision: identity.revision, descriptor: { ...revision, slug: identity.slug, title: identity.slug } };
  }
  if (serverPackage) return { kind: 'server' };
  return { kind: 'missing', message: '선택한 작품의 원본 ZIP이 이 기기와 보관함에 없습니다. 새 이야기는 사용하던 원본 ZIP을 서재에 다시 설치한 뒤 시작해 주세요. 기존 세션은 ZIP 없이 이어갈 수 있습니다.' };
}

export async function loadStorySource(source: Exclude<StorySource, { kind: 'missing' }>, signal?: AbortSignal): Promise<File | null> {
  if (source.kind === 'device') return source.file;
  if (source.kind === 'server') return null;
  const response = await fetch(`/api/neoreum/works/${encodeURIComponent(source.descriptor.slug)}/revisions/${source.revision}/download`, { signal, cache: 'no-store' });
  if (!response.ok) throw Error(`덧칠 v${source.revision} 원본을 내려받지 못했습니다. 다시 시도해 주세요.`);
  const bytes = await response.arrayBuffer();
  await validateHubPackageBytes(bytes, source.descriptor);
  signal?.throwIfAborted();
  return new File([bytes], `ScenarioPack-r${source.revision}.zip`, { type: 'application/zip' });
}
