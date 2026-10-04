import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const lines = (source: string) => source.split(/\r?\n/u).length;

test("v1.7.19 keeps the simulation route and live pipeline below their debt ceilings", async () => {
  const [route, pipeline] = await Promise.all([
    read("../app/api/simulate/route.ts"),
    read("../lib/live-stream-pipeline.ts"),
  ]);
  assert.ok(lines(route) <= 8_200, `simulate route grew to ${lines(route)} lines`);
  assert.ok(lines(pipeline) <= 950, `live pipeline grew to ${lines(pipeline)} lines`);
  assert.match(route, /from "\.\.\/\.\.\/\.\.\/lib\/narrative-output-safety"/u);
  assert.match(pipeline, /from "\.\/live-stream-telemetry"/u);
});

test("page shell state is owned by hooks instead of another useState cluster", async () => {
  const page = await read("../app/page.tsx");
  const stateCount = page.match(/\buseState\b/gu)?.length ?? 0;
  assert.ok(stateCount <= 30, `page.tsx still owns ${stateCount} useState references`);
  assert.match(page, /useNexusSettingsState/u);
  assert.match(page, /useNexusLibraryState/u);
});

test("generic session integrity contains no Fate-Seoul character-name heuristics", async () => {
  const [genericIntegrity, fateRules] = await Promise.all([
    read("../lib/session-integrity.ts"),
    read("../lib/work-adapters/fate-seoul-session-integrity.ts"),
  ]);
  assert.doesNotMatch(genericIntegrity, /나디아|홍재|정조|이산/u);
  assert.match(fateRules, /나디아/u);
  assert.match(fateRules, /홍재/u);
});
