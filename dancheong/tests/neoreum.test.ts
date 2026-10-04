import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { proxyNeoreumRequest } from "../lib/neoreum-service";

test("너름 화면은 문서 스크롤 잠금 안에서도 모바일 세로 스크롤을 소유한다", async () => {
  const css = await readFile(new URL("../app/neoreum/neoreum.css", import.meta.url), "utf8");
  assert.match(css, /\.neoreum-site\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/u);
});

test("너름 기본 화면은 공개 허브가 아니라 로그인한 사용자의 출간작 관리 화면이다", async () => {
  const [page, chrome, manager] = await Promise.all([
    readFile(new URL("../app/neoreum/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/neoreum/neoreum-chrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/neoreum/manage-client.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /requireChatGPTUser\("\/neoreum"\)/u);
  assert.match(page, /<NeoreumCatalogClient\s*\/>/u);
  const home = await readFile(new URL("../app/neoreum/catalog-client.tsx", import.meta.url), "utf8");
  assert.match(home, /\/api\/neoreum\/manage\/works/u);
  assert.doesNotMatch(home, /fetch\(`\/api\/neoreum\/works/u);
  assert.match(chrome, />내 출간작</u);
  assert.doesNotMatch(chrome, />작품 탐색</u);
  assert.match(manager, /현재 계정으로 출간한 작품만 표시됩니다/u);
  assert.doesNotMatch(manager, /MASTER · ALL ACCESS|마스터 계정은 모든 작품/u);
});

test("너름 관리 UI는 모바일 세로 화면에서 열 너비와 작품 선택을 뷰포트 안에 가둔다", async () => {
  const css = await readFile(new URL("../app/neoreum/neoreum.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 720px\)\s*\{[\s\S]*?\.neoreum-subnav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 720px\)\s*\{[\s\S]*?\.neoreum-site \.work-picker-list\s*\{[\s\S]*?display:\s*flex;[\s\S]*?overflow-x:\s*auto/u);
  assert.match(css, /\.neoreum-site \.work-info-grid\s*\{[\s\S]*?minmax\(0, 1fr\)/u);
});

test("상단 탭은 전체 페이지 재접속 없이 목적지를 미리 불러와 전환한다", async () => {
  const [siteNav, neoreumChrome, jieumShell, css] = await Promise.all([
    readFile(new URL("../app/components/nexus-site-nav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/neoreum/neoreum-chrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/jieum/jieum-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(siteNav, /import Link from "next\/link"/u);
  assert.match(siteNav, /prefetch=\{true\}/u);
  assert.match(siteNav, /WARM_ROUTES\.forEach\(\(route\) => router\.prefetch\(route\)\)/u);
  assert.doesNotMatch(siteNav, /window\.location\.assign/u);
  assert.match(neoreumChrome, /router\.push\(href\)/u);
  assert.doesNotMatch(neoreumChrome, /window\.location\.assign/u);
  assert.match(jieumShell, /await flush\(\);router\.push\(href\)/u);
  assert.doesNotMatch(jieumShell, /window\.location\.assign/u);
  assert.match(css, /\.library-route-progress\s*\{/u);
});

test("너름 공개 API는 원본 카탈로그를 같은 출처 URL로 안전하게 중계한다", async () => {
  const originalFetch = globalThis.fetch;
  let upstream: Request | null = null;
  globalThis.fetch = async (input, init) => {
    upstream = new Request(input, init);
    return Response.json({
      schema: "relay_hub_catalog_v2",
      works: [{
        slug: "chronos-core",
        coverUrl: "https://relay-core.juno12345.chatgpt.site/api/hub/assets/chronos-core/cover",
        downloadUrl: "https://relay-core.juno12345.chatgpt.site/api/hub/works/chronos-core/download",
      }],
    }, { headers: { "Cache-Control": "public, max-age=60" } });
  };
  try {
    const response = await proxyNeoreumRequest(
      new Request("https://nexus.example/api/neoreum/works?fresh=1"),
      ["works"],
    );
    const payload = await response.json() as { works: Array<{ coverUrl: string; downloadUrl: string }> };
    assert.equal(response.status, 200);
    assert.equal(upstream?.url, "https://relay-core.juno12345.chatgpt.site/api/hub/works?fresh=1");
    assert.equal(payload.works[0]?.coverUrl, "https://nexus.example/api/neoreum/assets/chronos-core/cover");
    assert.equal(payload.works[0]?.downloadUrl, "https://nexus.example/api/neoreum/works/chronos-core/download");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("너름 BFF는 허용하지 않은 임의 원본 경로를 열지 않는다", async () => {
  const response = await proxyNeoreumRequest(
    new Request("https://nexus.example/api/neoreum/admin/secrets"),
    ["admin", "secrets"],
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "neoreum_route_not_allowed" });
});
