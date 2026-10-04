export type NeoreumPackageContract = {
  projectId?: string;
  packageTarget?: string;
  engineScope?: string;
  format?: string;
  targetEngine?: string;
  minimumTargetVersion?: string;
  contractRevision?: string;
  requiredFeatures?: string[];
  compatibilityStatus?: string;
  compatibilitySchema?: string;
};

export type NeoreumWork = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  genre: string;
  tags: string[];
  packageVersion: string;
  runtime: string;
  packageSha256: string;
  packageBytes: number;
  featured: boolean;
  publishedAt: string;
  updatedAt: string;
  downloadCount: number;
  currentRevision: number;
  revisionCount: number;
  coverUrl: string;
  minNexusVersion: string;
  packageContract: NeoreumPackageContract;
  downloadUrl: string;
};

export type NeoreumRevision = {
  revision: number;
  packageVersion: string;
  runtime: string;
  minNexusVersion: string;
  packageSha256: string;
  packageBytes: number;
  createdAt: string;
  current: boolean;
  packageContract: NeoreumPackageContract;
  downloadUrl: string;
};

export const neoreumEngineLabel = (work: Pick<NeoreumWork, "runtime" | "packageContract">) => {
  const target = `${work.packageContract.packageTarget ?? ""} ${work.packageContract.targetEngine ?? ""} ${work.packageContract.engineScope ?? ""} ${work.runtime}`.toLowerCase();
  if (target.includes("cortex") || target.includes("instant")) return "CORTEX";
  return "SCENARIO";
};

export const formatNeoreumBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "크기 정보 없음";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
