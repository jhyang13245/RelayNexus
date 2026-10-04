import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountStore = readFileSync(new URL("../lib/account-store.ts", import.meta.url), "utf8");
const simulationStore = readFileSync(new URL("../lib/simulation-store.ts", import.meta.url), "utf8");
const accountRoute = readFileSync(new URL("../app/api/account/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("v1.5.4 derives every online owner key from an authenticated account UUID", () => {
  assert.match(simulationStore, /requireAccountContext/u);
  assert.match(accountStore, /ACCOUNT_OWNER_PREFIX = "account:"/u);
  assert.match(accountStore, /getChatGPTUser/u);
  assert.doesNotMatch(simulationStore, /return resolveLibraryOwnerKey\(\)/u);
});

test("legacy shared records are claimed once by the configured MASTER account", () => {
  assert.match(accountStore, /RELAY_MASTER_EMAILS/u);
  assert.match(accountStore, /v1\.5\.4-master-legacy-library-claim/u);
  assert.match(accountStore, /relay_account_migrations/u);
  assert.match(accountStore, /storage\.legacy_claimed/u);
  assert.doesNotMatch(simulationStore, /UPDATE scenario_projects SET owner_key = \? WHERE owner_key <> \?/u);
});

test("account surface provides role, UUID, logout, and MASTER audit history", () => {
  assert.match(accountRoute, /accountPayload/u);
  assert.match(page, /사용자 UUID/u);
  assert.match(page, /관리자 감사 로그/u);
  assert.match(page, /signOutPath/u);
  assert.match(page, /ChatGPT로 로그인/u);
  assert.match(css, /\.account-dialog/u);
  assert.match(css, /\.theme-dark \.account-dialog/u);
});
