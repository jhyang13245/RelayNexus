const CATALOG_URL = "https://relay-core.juno12345.chatgpt.site/api/hub/works";
const HIDDEN_SLUGS = new Set(["giseong-academy-first-resonance"]);

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const upstream = await fetch(CATALOG_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) throw new Error(`catalog_http_${upstream.status}`);
    const payload = await upstream.json() as { works?: Array<Record<string, unknown>> };
    if (!Array.isArray(payload.works)) throw new Error("catalog_shape");
    const works = payload.works.flatMap((work) => {
      const slug = String(work.slug ?? "").trim();
      if (!/^[a-z0-9-]{3,80}$/u.test(slug) || HIDDEN_SLUGS.has(slug)) return [];
      return [{
        slug,
        title: String(work.title ?? "이름 없는 작품"),
        subtitle: String(work.subtitle ?? ""),
        genre: String(work.genre ?? ""),
        runtime: String(work.runtime ?? "Cortex Engine"),
        currentRevision: Number.isSafeInteger(work.currentRevision) ? work.currentRevision : null,
        packageSha256: /^[a-f0-9]{64}$/iu.test(String(work.packageSha256 || "")) ? String(work.packageSha256).toLowerCase() : "",
        packageBytes: Number(work.packageBytes) || 0,
        updatedAt: String(work.updatedAt || ""),
      }];
    });
    return Response.json({ works }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "너름의 작품 목록을 불러오지 못했습니다." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
