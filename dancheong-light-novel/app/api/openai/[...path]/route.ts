const OPENAI_ORIGIN = "https://api.openai.com";
const ALLOWED_PATHS = new Set(["responses", "images/generations", "images/edits"]);
const MAX_REQUEST_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!ALLOWED_PATHS.has(endpoint)) return Response.json({ error: { message: "지원하지 않는 API 경로입니다." } }, { status: 404 });

  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S{1,512}$/u.test(authorization)) {
    return Response.json({ error: { message: "OpenAI API 키를 설정해 주세요." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const contentType = request.headers.get("content-type") || "";
  if (endpoint === "images/edits" ? !contentType.startsWith("multipart/form-data;") : !contentType.startsWith("application/json")) {
    return Response.json({ error: { message: "요청 형식이 올바르지 않습니다." } }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return Response.json({ error: { message: "요청 크기가 너무 큽니다." } }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BYTES) return Response.json({ error: { message: "요청 크기가 너무 큽니다." } }, { status: 413 });
    const upstream = await fetch(`${OPENAI_ORIGIN}/v1/${endpoint}`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": contentType },
      body,
      signal: request.signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    } });
  } catch {
    return Response.json({ error: { message: "OpenAI 연결에 실패했습니다." } }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
