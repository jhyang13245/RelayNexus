const CORE_ORIGIN = "https://relay-core.juno12345.chatgpt.site";
const HIDDEN_SLUGS = new Set(["giseong-academy-first-resonance"]);

export async function GET(request: Request, context: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await context.params;
  if (!/^[a-z0-9-]{3,80}$/u.test(slug) || HIDDEN_SLUGS.has(slug) || !["cover", "download", "revisions"].includes(kind)) {
    return new Response("Not found", { status: 404 });
  }
  const revision = new URL(request.url).searchParams.get("revision");
  if (revision !== null && (kind !== "download" || !/^[1-9]\d{0,8}$/u.test(revision))) return new Response("Invalid revision", { status: 400 });
  const path = kind === "cover" ? `/api/hub/assets/${slug}/cover` : kind === "revisions" ? `/api/hub/works/${slug}/revisions` : `/api/hub/works/${slug}/${revision ? `revisions/${revision}/` : ""}download`;
  try {
    const upstream = await fetch(new URL(path, CORE_ORIGIN), {
      headers: { Accept: kind === "cover" ? "image/*" : kind === "revisions" ? "application/json" : "application/zip" },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": kind === "cover" ? "public, max-age=300" : "no-store",
    });
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "너름 작품 파일을 불러오지 못했습니다." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
