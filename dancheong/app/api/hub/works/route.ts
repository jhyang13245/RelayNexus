import { relayCoreRequestHeaders, relayCoreUrl } from "../../../../lib/core-hub";

// Keep the bundled demo available to existing installs and direct package recovery,
// but never advertise it in the public Neoreum catalog.
const HIDDEN_CATALOG_SLUGS = new Set(["giseong-academy-first-resonance"]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const response = await fetch(relayCoreUrl("/api/hub/works", true), {
      cache: "no-store",
      headers: relayCoreRequestHeaders(),
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error("core_unavailable");
    const payload = await response.json() as { works?: Array<Record<string, unknown>> };
    if (!Array.isArray(payload.works)) throw new Error("invalid_catalog");
    const origin = new URL(request.url).origin;
    const works = payload.works.flatMap((work) => {
      const slug = String(work.slug ?? "").trim();
      if (!/^[a-z0-9-]{3,80}$/u.test(slug) || HIDDEN_CATALOG_SLUGS.has(slug)) return [];
      const knownSourceProjectId = slug === "chronos-core"
        ? "CHRONOS_CORE_MASTER_V180"
        : "";
      const packageContract = work.packageContract && typeof work.packageContract === "object"
        ? work.packageContract as Record<string, unknown>
        : {};
      const sourceProjectId = String(
        work.sourceProjectId || packageContract.projectId || knownSourceProjectId,
      ).trim();
      const coverVersion = String(
        work.coverVersion ?? work.coverUpdatedAt ?? work.updatedAt ?? work.publishedAt ?? "",
      ).trim();
      const coverUrl = new URL(`/api/hub/works/${slug}/cover`, origin);
      if (coverVersion) coverUrl.searchParams.set("v", coverVersion);
      return [{
        ...work,
        slug,
        title: String(work.title ?? "이름 없는 작품"),
        subtitle: String(work.subtitle ?? ""),
        description: String(work.description ?? ""),
        genre: String(work.genre ?? ""),
        tags: Array.isArray(work.tags) ? work.tags.map(String).filter(Boolean) : [],
        packageVersion: String(work.packageVersion ?? "unknown"),
        runtime: String(work.runtime ?? ""),
        packageBytes: Math.max(0, Number(work.packageBytes ?? 0)),
        downloadCount: Math.max(0, Number(work.downloadCount ?? 0)),
        sourceProjectId,
        coverUrl: coverUrl.toString(),
        downloadUrl: `${origin}/api/hub/works/${slug}/download`,
      }];
    });
    return Response.json(
      { schema: "relay_hub_catalog_v1", source: "relay-core", works },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return Response.json(
      { schema: "relay_hub_catalog_v1", source: "bundled-cache", works: [] },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
