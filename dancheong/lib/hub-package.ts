export type HubPackageDescriptor = {
  slug: string;
  title: string;
  packageVersion: string;
  packageBytes?: number;
  packageSha256?: string;
  sourceProjectId?: string;
  minNexusVersion?: string;
};

export type InstalledHubProject = {
  sourceProjectId?: string;
  title: string;
};

const HUB_SOURCE_PROJECT_IDS: Record<string, string> = {
  "giseong-academy-first-resonance": "RN-DEMO-GISEONG-INSTANT-001",
  "chronos-core": "CHRONOS_CORE_MASTER_V180",
};

const normalizedTitle = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "");

export const hubSourceProjectId = (work: Pick<HubPackageDescriptor, "slug" | "sourceProjectId">): string =>
  String(work.sourceProjectId || HUB_SOURCE_PROJECT_IDS[work.slug] || "").trim();

export const installedHubProject = <T extends InstalledHubProject>(
  projects: T[],
  work: HubPackageDescriptor,
): T | undefined => {
  const sourceProjectId = hubSourceProjectId(work);
  if (sourceProjectId) {
    const bySourceId = projects.find((project) => project.sourceProjectId === sourceProjectId);
    if (bySourceId) return bySourceId;
  }
  const workTitle = normalizedTitle(work.title);
  return projects.find((project) => {
    const projectTitle = normalizedTitle(project.title);
    return Boolean(workTitle && projectTitle) && (
      projectTitle === workTitle || projectTitle.includes(workTitle) || workTitle.includes(projectTitle)
    );
  });
};

const hexDigest = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const validateHubPackageBytes = async (
  bytes: ArrayBuffer,
  work: HubPackageDescriptor,
): Promise<void> => {
  const view = new Uint8Array(bytes);
  const zipSignature = view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && (
    (view[2] === 0x03 && view[3] === 0x04) ||
    (view[2] === 0x05 && view[3] === 0x06) ||
    (view[2] === 0x07 && view[3] === 0x08)
  );
  if (!zipSignature) throw new Error("너름이 ZIP 패키지 대신 손상된 응답을 반환했습니다.");
  if (work.packageBytes && view.byteLength !== work.packageBytes) {
    throw new Error(
      `패키지 크기가 너름 작품 정보와 다릅니다. (${view.byteLength}/${work.packageBytes} bytes)`,
    );
  }
  const expectedSha256 = String(work.packageSha256 ?? "").trim().toLowerCase();
  if (expectedSha256) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actualSha256 = hexDigest(new Uint8Array(digest));
    if (actualSha256 !== expectedSha256) {
      throw new Error("패키지 무결성 검증에 실패했습니다. 최신 원본으로 다시 동기화해 주세요.");
    }
  }
};
