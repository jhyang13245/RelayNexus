import { createSHA256 } from "hash-wasm";
import { readCortexProjectPackage, rememberCortexProjectPackage } from "./hooks/use-runtime-engine";
import { hubRevisionIdentity, hubRevisionProjectId, type RevisionWork } from "../lib/hub-revision";
import { validateHubPackageBytes } from "../lib/hub-package";

export async function installHubRevisionPackage(work: RevisionWork): Promise<{ projectId: string; file: File }> {
  const projectId = hubRevisionProjectId(work);
  if (!/^[a-f0-9]{64}$/i.test(work.packageSha256 ?? "")) throw new Error("덧칠의 원본 지문을 확인하지 못했습니다. 목록을 새로고침해 주세요.");
  const response = await fetch(`/api/neoreum/works/${encodeURIComponent(work.slug)}/revisions/${work.currentRevision}/download`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error("패키지 다운로드 실패");
  const bytes = await response.arrayBuffer();
  await validateHubPackageBytes(bytes, work);
  const existing = await readCortexProjectPackage(projectId);
  if (existing) {
    await validateHubPackageBytes(await existing.arrayBuffer(), work);
    return { projectId, file: existing };
  }
  const file = new File([bytes], `${work.title}.zip`, { type: "application/zip" });
  await rememberCortexProjectPackage(projectId, file);
  return { projectId, file };
}

// Legacy installations have no revision in their key. Compare the actual ZIP,
// not the current catalog label, and never rename or mutate an old installation.
export async function resolveInstalledHubRevision(projectId: string, work: RevisionWork): Promise<number | null> {
  const identity = hubRevisionIdentity(projectId);
  if (identity) return identity.slug === work.slug ? identity.revision : null;
  const file = await readCortexProjectPackage(projectId);
  if (!file) return null;
  const hash = await createSHA256();
  hash.init();
  for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
    hash.update(new Uint8Array(await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer()));
  }
  const digest = hash.digest("hex");
  if (digest === work.packageSha256 && work.currentRevision) return work.currentRevision;
  const response = await fetch(`/api/neoreum/works/${encodeURIComponent(work.slug)}/revisions`, { cache: "no-store" });
  if (!response.ok) throw new Error("이전 덧칠 목록을 확인하지 못했습니다.");
  const payload = await response.json() as { revisions?: { revision: number; packageSha256: string }[] };
  return payload.revisions?.find(row => row.packageSha256 === digest)?.revision ?? null;
}
