import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveRequestApiKey } from "../lib/server-api-key-policy";

const routeFiles = [
  "app/api/openai/test/route.ts",
  "app/api/image/route.ts",
  "app/api/simulate/route.ts",
];

test("공개 배포의 AI API 경로는 서버 공용 OpenAI 키로 우회하지 않는다", async () => {
  assert.equal(resolveRequestApiKey({
    suppliedKey: "",
    serverKey: "sk-owner-must-not-be-shared",
    runtimeEnvironment: "production",
  }), "");
  assert.equal(resolveRequestApiKey({
    suppliedKey: "sk-visitor",
    serverKey: "sk-owner-must-not-be-shared",
    runtimeEnvironment: "production",
  }), "sk-visitor");

  for (const file of routeFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("|| process.env.OPENAI_API_KEY"), false, file);
    assert.match(source, /resolveRequestApiKey/);
  }
});

test("로컬 서버 실행만 .env.local의 서버 키를 사용할 수 있다", () => {
  assert.equal(resolveRequestApiKey({
    suppliedKey: "",
    serverKey: "sk-local-only",
    runtimeEnvironment: "development",
  }), "sk-local-only");
  assert.equal(resolveRequestApiKey({
    suppliedKey: "",
    serverKey: "sk-never-use-when-runtime-is-unknown",
    runtimeEnvironment: undefined,
  }), "");
});

test("기기 저장 API 키는 작품 및 세션 스냅샷 저장 구조와 분리된다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const savedSessionType = page.match(/type SavedSession = \{[\s\S]*?\n\};/)?.[0] ?? "";
  assert.ok(savedSessionType);
  assert.equal(/apiKey/i.test(savedSessionType), false);
  assert.match(page, /rememberApiKeyOnDevice\(candidate, provider\)/);
});
