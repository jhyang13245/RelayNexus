import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("단청 iOS 홈 화면 브랜딩과 PWA 아이콘 계약을 유지한다", async () => {
  const [layout, manifest, favicon] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);
  const parsed = JSON.parse(manifest) as {
    name: string;
    short_name: string;
    display: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  assert.match(layout, /appleWebApp:\s*\{/u);
  assert.match(layout, /title:\s*"단청"/u);
  assert.match(layout, /apple-touch-icon\.png/u);
  assert.equal(parsed.name, "단청");
  assert.equal(parsed.short_name, "단청");
  assert.equal(parsed.display, "standalone");
  assert.deepEqual(parsed.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  assert.ok(parsed.icons.every((icon) => icon.purpose.includes("maskable")));
  assert.match(favicon, /단청 앱 아이콘/u);
});
