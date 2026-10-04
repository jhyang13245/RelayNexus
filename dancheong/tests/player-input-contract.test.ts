import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { MAX_PLAYER_INPUT_CHARS } from "../lib/player-input";
import { MAX_PLAYER_INPUT_CHARS as COMPILER_MAX } from "../lib/scene-context-compiler";

const root = path.resolve(import.meta.dirname, "..");

test("browser and compiler share the complete 12k player input contract", () => {
  const page = readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const route = readFileSync(
    path.join(root, "app", "api", "simulate", "route.ts"),
    "utf8",
  );

  assert.equal(MAX_PLAYER_INPUT_CHARS, 12_000);
  assert.equal(COMPILER_MAX, MAX_PLAYER_INPUT_CHARS);
  assert.match(page, /maxLength=\{MAX_PLAYER_INPUT_CHARS\}/u);
  assert.doesNotMatch(route, /request\.userText\.slice\(0,\s*(?:1200|3000)\)/u);
});
