import { AccountAuthenticationError, requireAccountContext } from "./account-store";
import { RELAY_CORE_ORIGIN, relayCoreRequestHeaders } from "./core-hub";

type ServiceTokenPayload = {
  v: 1;
  sub: string;
  email: string;
  method: string;
  path: string;
  bodySha256: string;
  iat: number;
  exp: number;
  nonce: string;
};

const SLUG = "[a-z0-9][a-z0-9-]{2,79}";
const UPLOAD_ID = "[a-f0-9-]{16,80}";
const PUBLIC_GET = [
  new RegExp("^works$"),
  new RegExp(`^works/${SLUG}$`),
  new RegExp(`^works/${SLUG}/download$`),
  new RegExp(`^works/${SLUG}/revisions$`),
  new RegExp(`^works/${SLUG}/revisions/[1-9][0-9]*/download$`),
  new RegExp(`^assets/${SLUG}/cover$`),
];

const SIGNED_ROUTES: Array<[string, RegExp]> = [
  ["GET", /^manage\/works$/],
  ["GET", new RegExp(`^manage/works/${SLUG}$`)],
  ["PATCH", new RegExp(`^manage/works/${SLUG}$`)],
  ["DELETE", new RegExp(`^manage/works/${SLUG}$`)],
  ["GET", new RegExp(`^manage/works/${SLUG}/editor-source$`)],
  ["GET", new RegExp(`^manage/works/${SLUG}/editor-source/download$`)],
  ["GET", new RegExp(`^manage/works/${SLUG}/package/download$`)],
  ["POST", /^uploads$/],
  ["POST", /^uploads\/revision$/],
  ["PUT", new RegExp(`^uploads/${UPLOAD_ID}/cover$`)],
  ["PUT", new RegExp(`^uploads/${UPLOAD_ID}/parts/[1-9][0-9]*$`)],
  ["POST", new RegExp(`^uploads/${UPLOAD_ID}/complete$`)],
  ["PUT", new RegExp(`^works/${SLUG}/cover$`)],
  ["DELETE", new RegExp(`^works/${SLUG}/cover$`)],
];

const hexDigest = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
};

const signRequest = async (
  request: Request,
  upstream: URL,
  bodySha256: string,
) => {
  const secret = process.env.NEOREUM_NEXUS_SHARED_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("neoreum_service_secret_unavailable");
  const account = await requireAccountContext();
  const now = Math.floor(Date.now() / 1000);
  const payload: ServiceTokenPayload = {
    v: 1,
    sub: account.id,
    email: account.email.trim().toLowerCase(),
    method: request.method.toUpperCase(),
    path: `${upstream.pathname}${upstream.search}`,
    bodySha256,
    iat: now,
    exp: now + 60,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  ));
  return `HMAC ${encodedPayload}.${base64Url(signature)}`;
};

const jsonError = (error: string, status: number) => Response.json(
  { error },
  { status, headers: { "Cache-Control": "no-store" } },
);

const rewriteNeoreumUrls = (value: unknown, nexusOrigin: string): unknown => {
  if (typeof value === "string") {
    return value.replace(`${RELAY_CORE_ORIGIN}/api/hub/`, `${nexusOrigin}/api/neoreum/`);
  }
  if (Array.isArray(value)) return value.map((item) => rewriteNeoreumUrls(item, nexusOrigin));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteNeoreumUrls(item, nexusOrigin)]));
  }
  return value;
};

const responseHeaders = (source: Headers) => {
  const headers = new Headers();
  for (const name of [
    "cache-control",
    "content-disposition",
    "content-length",
    "content-type",
    "etag",
    "last-modified",
    "x-package-sha256",
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
};

export async function proxyNeoreumRequest(request: Request, rawPath: string[]) {
  const path = rawPath.map((segment) => segment.trim()).filter(Boolean).join("/");
  if (!path || rawPath.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return jsonError("invalid_neoreum_path", 400);
  }
  const method = request.method.toUpperCase();
  const isPublic = method === "GET" && PUBLIC_GET.some((pattern) => pattern.test(path));
  const isSigned = SIGNED_ROUTES.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
  if (!isPublic && !isSigned) return jsonError("neoreum_route_not_allowed", 404);

  const incoming = new URL(request.url);
  const upstream = new URL(`/api/hub/${path}${incoming.search}`, RELAY_CORE_ORIGIN);
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const bodySha256 = hexDigest(await crypto.subtle.digest("SHA-256", body ?? new ArrayBuffer(0)));
  const headers = new Headers(relayCoreRequestHeaders({ revalidate: isPublic }));
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-neoreum-request-id", crypto.randomUUID());

  try {
    if (isSigned) headers.set("x-neoreum-nexus-authorization", await signRequest(request, upstream, bodySha256));
    const upstreamResponse = await fetch(upstream, {
      method,
      headers,
      body,
      cache: "no-store",
    });
    const outgoingHeaders = responseHeaders(upstreamResponse.headers);
    const upstreamContentType = upstreamResponse.headers.get("content-type") ?? "";
    if (upstreamContentType.includes("application/json")) {
      const payload = await upstreamResponse.json().catch(() => ({ error: `neoreum_request_failed_${upstreamResponse.status}` }));
      outgoingHeaders.set("content-type", "application/json; charset=utf-8");
      outgoingHeaders.delete("content-length");
      return Response.json(rewriteNeoreumUrls(payload, incoming.origin), {
        status: upstreamResponse.status,
        headers: outgoingHeaders,
      });
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: outgoingHeaders,
    });
  } catch (error) {
    if (error instanceof AccountAuthenticationError) return jsonError("authentication_required", 401);
    if (error instanceof Error && error.message === "neoreum_service_secret_unavailable") {
      return jsonError("neoreum_service_unavailable", 503);
    }
    return jsonError("neoreum_upstream_unavailable", 502);
  }
}
