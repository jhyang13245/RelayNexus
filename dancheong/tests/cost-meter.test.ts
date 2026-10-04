import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { APP_VERSION, LEGACY_COST_VERSION } from "../lib/app-version";
import {
  costMeterEntryFromTurn,
  mergeCostMeterEntries,
} from "../lib/cost-meter";
import type { EngineUsage } from "../lib/engine";
import type { TurnRecord } from "../lib/scenario";

const usage: EngineUsage = {
  model: "gpt-5.6-luna",
  callCount: 1,
  billedCallCount: 1,
  rewriteCount: 0,
  rewriteReasons: [],
  inputTokens: 900,
  uncachedInputTokens: 900,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 260,
  estimatedCostUsd: 0.001,
  calls: [],
};

const measuredTurn = (overrides: Partial<TurnRecord> = {}): TurnRecord => ({
  id: "turn-1",
  turn: 1,
  role: "exchange",
  blocks: [],
  recommendations: [],
  createdAt: "2026-08-22T04:00:00+09:00",
  usage,
  ...overrides,
});

test("현재 버전의 턴은 앱 버전과 호출 식별자를 포함한 누적 비용 항목이 된다", () => {
  const entry = costMeterEntryFromTurn(
    "project-1",
    "session-1",
    measuredTurn({ appVersion: APP_VERSION, imageCostUsd: 0.05 }),
  );
  assert.equal(entry?.id, "call:turn-1");
  assert.equal(entry?.appVersion, APP_VERSION);
  assert.equal(entry?.imageCostUsd, 0.05);
});

test("이전 버전의 저장 턴도 legacy 표식으로 100턴 누적 장부에 편입한다", () => {
  const entry = costMeterEntryFromTurn(
    "project-old",
    "session-old",
    measuredTurn(),
  );
  assert.equal(entry?.appVersion, LEGACY_COST_VERSION);
});

test("같은 생성 호출은 세션이 분기돼도 중복 증가하지 않고 최신 이미지 비용으로 갱신한다", () => {
  const first = costMeterEntryFromTurn(
    "project-1",
    "session-1",
    measuredTurn({ appVersion: APP_VERSION, imageCostUsd: 0 }),
  )!;
  const forked = costMeterEntryFromTurn(
    "project-1",
    "session-fork",
    measuredTurn({ appVersion: APP_VERSION, imageCostUsd: 0.05 }),
  )!;
  assert.equal(first.id, forked.id);
  const updated = { ...forked, imageCostUsd: 0.05 };
  const merged = mergeCostMeterEntries([first], [updated]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.imageCostUsd, 0.05);
});

test("비용 장부는 D1에 독립 저장되고 기존 세션에서 자동 백필한다", () => {
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const store = readFileSync(
    new URL("../lib/cost-meter-store.ts", import.meta.url),
    "utf8",
  );
  assert.match(schema, /cost_meter_turns/u);
  assert.match(store, /FROM simulation_sessions/u);
  assert.match(store, /ON CONFLICT\(id\)/u);
});
