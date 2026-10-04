import { relayCoreRequestHeaders, relayCoreUrl } from "../../../../../../lib/core-hub";

const FALLBACK_SLUG = "giseong-academy-first-resonance";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
    return Response.json({ error: "invalid_work_slug" }, { status: 400 });
  }

  try {
    const response = await fetch(relayCoreUrl(`/api/hub/works/${slug}/download`), {
      cache: "no-store",
      headers: relayCoreRequestHeaders(),
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || (!contentType.includes("zip") && !contentType.includes("octet-stream"))) {
      throw new Error("core_package_unavailable");
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    if (slug !== FALLBACK_SLUG) return Response.json({ error: "work_not_found" }, { status: 404 });
    return Response.redirect(new URL("/hub/giseong-academy-first-resonance-v1.5.zip", request.url), 302);
  }
}
