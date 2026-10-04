import { hubSourceProjectId, type HubPackageDescriptor } from "./hub-package";

export type RevisionWork = HubPackageDescriptor & { currentRevision?: number };
export type RevisionProject = { id: string; sourceProjectId?: string };
const PREFIX = "cortex-import-neoreum:";

export function hubRevisionIdentity(projectId: string): { slug: string; revision: number } | null {
  if (!projectId.startsWith(PREFIX)) return null;
  const match = projectId.slice(PREFIX.length).match(/^(.+):r([1-9]\d*)$/);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  try { return { slug: decodeURIComponent(match[1]), revision: Number(match[2]) }; } catch { return null; }
}

export function hubRevisionProjectId(work: RevisionWork): string {
  if (!Number.isSafeInteger(work.currentRevision) || Number(work.currentRevision) < 1) {
    throw new Error("덧칠 번호를 확인하지 못했습니다. 작품 목록을 새로고침해 주세요.");
  }
  return `${PREFIX}${encodeURIComponent(work.slug)}:r${work.currentRevision}`;
}

// Never bind revisions by a similar title: unrelated books can share a title.
export function isSameHubWork(project: RevisionProject, work: RevisionWork): boolean {
  const identity = hubRevisionIdentity(project.id);
  if (identity) return identity.slug === work.slug;
  const source = hubSourceProjectId(work) || work.slug;
  return project.sourceProjectId === source || project.id === `cortex-import-${source.replace(/[^a-zA-Z0-9._:-]/g, "-")}`;
}

export function latestInstalledHubRevision<T extends RevisionProject>(projects: T[], work: RevisionWork): T | undefined {
  return projects.find(project => {
    const identity = hubRevisionIdentity(project.id);
    return identity?.slug === work.slug && identity.revision === work.currentRevision;
  });
}

// Pick the newest revision that is already on this device. The optional resolver covers
// legacy installation keys after their package hash has been matched to a revision.
// Never infer a revision from a display label such as "v2" or "v3".
export function newestInstalledRevisionProject<T extends RevisionProject>(
  projects: T[],
  resolvedRevision: (project: T) => number | null | undefined = () => undefined,
): T | undefined {
  let newest: T | undefined;
  let newestRevision = 0;
  for (const project of projects) {
    const revision = hubRevisionIdentity(project.id)?.revision ?? resolvedRevision(project) ?? 0;
    if (!newest || revision > newestRevision) {
      newest = project;
      newestRevision = revision;
    }
  }
  return newest;
}

export function uniqueHubRevisionWork<T extends RevisionWork>(project: RevisionProject, works: T[]): T | undefined {
  const matches = works.filter(work => isSameHubWork(project, work));
  return matches.length === 1 ? matches[0] : undefined;
}

// Presentation grouping only: package and session keys are never merged.
export function groupHubRevisionProjects<T extends RevisionProject, W extends RevisionWork>(projects: T[], works: W[]) {
  const groups = new Map<string, { key: string; projects: T[]; work?: W }>();
  for (const project of projects) {
    const work = uniqueHubRevisionWork(project, works);
    const slug = hubRevisionIdentity(project.id)?.slug ?? work?.slug;
    const key = slug ? `hub:${slug}` : `project:${project.id}`;
    const group = groups.get(key) ?? { key, projects: [], work };
    group.projects.push(project);
    if (work) group.work = work;
    groups.set(key, group);
  }
  return [...groups.values()];
}
