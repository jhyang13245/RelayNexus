import { relayCoreRequestHeaders, relayCoreUrl } from "../../../../../../lib/core-hub";

const FALLBACK_SLUG = "giseong-academy-first-resonance";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
    return Response.json({ error: "invalid_work_slug" }, { status: 400 });
  }

  try {
    const requestedUrl = new URL(request.url);
    const version = requestedUrl.searchParams.get("v")?.trim().slice(0, 160) ?? "";
    const coreCoverUrl = new URL(relayCoreUrl(`/api/hub/assets/${slug}/cover`));
    if (version) coreCoverUrl.searchParams.set("v", version);
    const response = await fetch(coreCoverUrl, {
      // Cloudflare Workers rejects the browser-only `force-cache` mode before
      // the request reaches Relay Core. The versioned public response below is
      // the cache authority; the server-to-server hop must always be usable.
      cache: "no-store",
      headers: relayCoreRequestHeaders({ revalidate: false }),
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/")) throw new Error("core_cover_unavailable");
    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": version
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300, stale-while-revalidate=86400",
        ...(response.headers.get("etag") ? { ETag: response.headers.get("etag")! } : {}),
        ...(response.headers.get("last-modified")
          ? { "Last-Modified": response.headers.get("last-modified")! }
          : {}),
      },
    });
  } catch {
    if (slug !== FALLBACK_SLUG) return Response.json({ error: "cover_not_found" }, { status: 404 });
    const fallback = await fetch(new URL("/hub/giseong-academy-cover.webp", request.url), {
      cache: "no-store",
    });
    if (!fallback.ok) return Response.json({ error: "cover_not_found" }, { status: 404 });
    return new Response(fallback.body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }
}
