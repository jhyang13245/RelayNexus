const CORE_ORIGIN = "https://relay-core.juno12345.chatgpt.site";
const HIDDEN_SLUGS = new Set(["giseong-academy-first-resonance"]);

export async function GET(_request: Request, context: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await context.params;
  if (!/^[a-z0-9-]{3,80}$/u.test(slug) || HIDDEN_SLUGS.has(slug) || !["cover", "download"].includes(kind)) {
    return new Response("Not found", { status: 404 });
  }
  const path = kind === "cover" ? `/api/hub/assets/${slug}/cover` : `/api/hub/works/${slug}/download`;
  try {
    const upstream = await fetch(new URL(path, CORE_ORIGIN), {
      headers: { Accept: kind === "cover" ? "image/*" : "application/zip" },
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
