import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { GET as getCatalog } from "../app/api/hub/works/route";
import { GET as getCover } from "../app/api/hub/works/[slug]/cover/route";
import { GET as getPackage } from "../app/api/hub/works/[slug]/download/route";

test("내장 Hub 표지 폴백은 모바일 전송량을 줄인 WebP다", () => {
  const webp = fs.readFileSync("public/hub/giseong-academy-cover.webp");
  const pngBytes = fs.statSync("public/hub/giseong-academy-cover.png").size;
  assert.equal(webp.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("ascii"), "WEBP");
  assert.ok(webp.length < pngBytes / 4);
});

test("너름은 비공개 Core에 서버 인증하고 최신 카탈로그와 표지 프록시를 제공한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalBearer = process.env.RELAY_CORE_SITE_BEARER;
  process.env.RELAY_CORE_SITE_BEARER = "core-test-token";
  let catalogRequest: Request | undefined;
  globalThis.fetch = async (input, init) => {
    catalogRequest = new Request(input, init);
    return Response.json({
      works: [
        {
          id: "work-giseong-demo",
          slug: "giseong-academy-first-resonance",
          title: "기성학원",
          subtitle: "첫 번째 공명",
        },
        {
          id: "work-chronos",
          slug: "chronos-core",
          title: "Chronos Core",
          subtitle: "시간의 균열",
          updatedAt: "2026-08-23T13:00:00.000Z",
        },
      ],
    });
  };
  try {
    const response = await getCatalog(new Request("https://nexus.example/api/hub/works"));
    const payload = await response.json() as { source: string; works: Array<{ coverUrl: string }> };
    assert.equal(payload.source, "relay-core");
    assert.match(catalogRequest?.url ?? "", /nexusFresh=/u);
    assert.equal(catalogRequest?.headers.get("OAI-Sites-Authorization"), "Bearer core-test-token");
    assert.equal(catalogRequest?.cache, "no-store");
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(payload.works.length, 1);
    assert.equal(
      payload.works[0]?.coverUrl,
      "https://nexus.example/api/hub/works/chronos-core/cover?v=2026-08-23T13%3A00%3A00.000Z",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBearer === undefined) delete process.env.RELAY_CORE_SITE_BEARER;
    else process.env.RELAY_CORE_SITE_BEARER = originalBearer;
  }
});

test("Story Hub 표지는 Core의 비공개 이미지 바이트를 Nexus 경유로 전달한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalBearer = process.env.RELAY_CORE_SITE_BEARER;
  process.env.RELAY_CORE_SITE_BEARER = "core-cover-token";
  let coverRequest: Request | undefined;
  globalThis.fetch = async (input, init) => {
    coverRequest = new Request(input, init);
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "Content-Type": "image/png", ETag: "cover-v2" },
    });
  };
  try {
    const response = await getCover(
      new Request("https://nexus.example/api/hub/works/chronos-core/cover?v=2026-08-23T13%3A00%3A00.000Z"),
      { params: Promise.resolve({ slug: "chronos-core" }) },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("etag"), "cover-v2");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(coverRequest?.headers.get("OAI-Sites-Authorization"), "Bearer core-cover-token");
    assert.equal(coverRequest?.headers.get("cache-control"), null);
    assert.equal(coverRequest?.cache, "no-store");
    assert.match(coverRequest?.url ?? "", /\/api\/hub\/assets\/chronos-core\/cover\?v=2026-08-23T13%3A00%3A00\.000Z/u);
    assert.doesNotMatch(coverRequest?.url ?? "", /nexusFresh=/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBearer === undefined) delete process.env.RELAY_CORE_SITE_BEARER;
    else process.env.RELAY_CORE_SITE_BEARER = originalBearer;
  }
});

test("내장 Hub 표지 폴백은 정확한 WebP MIME과 장기 캐시로 전달한다", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) return new Response(null, { status: 503 });
    return new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]), {
      headers: { "Content-Type": "application/octet-stream" },
    });
  };
  try {
    const response = await getCover(
      new Request(
        "https://nexus.example/api/hub/works/giseong-academy-first-resonance/cover?v=bundled-2026-09-09-webp",
      ),
      { params: Promise.resolve({ slug: "giseong-academy-first-resonance" }) },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("너름은 Core 장애 때 기성학원 데모를 공개 카탈로그에 되살리지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const response = await getCatalog(new Request("https://nexus.example/api/hub/works"));
    const payload = await response.json() as {
      source: string;
      works: Array<{ slug: string; coverUrl: string; downloadUrl: string }>;
    };
    assert.equal(response.status, 200);
    assert.equal(payload.source, "bundled-cache");
    assert.deepEqual(payload.works, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Story Hub 패키지는 Core 장애 때 검증된 번들 ZIP으로 복구한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const response = await getPackage(
      new Request("https://nexus.example/api/hub/works/giseong-academy-first-resonance/download"),
      { params: Promise.resolve({ slug: "giseong-academy-first-resonance" }) },
    );
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://nexus.example/hub/giseong-academy-first-resonance-v1.5.zip",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
