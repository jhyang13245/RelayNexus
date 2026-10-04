import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const packagePath = process.argv[2];
const htmlPath = process.argv[3] ?? "public/dancheong-cortex-v1.8.5.html";

if (!packagePath) {
  throw new Error("Usage: node scripts/validate-cortex-package.mjs <package.zip> [runtime.html]");
}

const html = await readFile(htmlPath, "utf8");
const script = /<script>([\s\S]*?)<\/script>/u.exec(html)?.[1];
assert.ok(script, "inline Cortex runtime script is missing");

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      value: id === "styleGuide" ? "라이트노벨 문체" : "",
      textContent: "",
      innerHTML: "",
      style: {},
      disabled: false,
      files: [],
      classList: { add() {}, remove() {}, toggle() { return true; } },
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
      appendChild(child) { this.options ??= []; this.options.push(child); },
      showModal() {},
      close() {},
      lastElementChild: null,
      querySelector() { return null; },
    });
  }
  return elements.get(id);
};

const document = { getElementById: element, createElement: () => element("created") };
const window = { fflate: { unzipSync } };
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
new Function("document", "window", "localStorage", script)(document, window, localStorage);

const api = window.__DANCHEONG_CORTEX_TEST__;
assert.ok(api, "Cortex test API is missing");
const bytes = new Uint8Array(await readFile(packagePath));
const record = api.parseLegacyPackageEntriesV177(api.unzipPackageForRuntime(bytes), { fileName: packagePath.split(/[\\/]/u).at(-1) });
const attestation = api.assertPackageActivationV182(record);
assert.equal(attestation.semanticCompatible, true, attestation.semanticIssues?.join(", "));

const activeEvents = api.eventSequence(record.scenario.event);
const context = api.publicWriterContext(record.scenario);
assert.ok(context.packageContract?.opening?.immediateProblem, "opening.immediateProblem was not compiled");
assert.ok(context.packageContract?.opening?.firstGoal, "opening.firstGoal was not compiled");
assert.ok(attestation.moduleCounts.relations >= 0, "relationship definition count is invalid");
assert.ok(attestation.moduleCounts.relationshipMemories >= 0, "relationship memory count is invalid");
assert.ok(attestation.moduleCounts.autonomyActors >= 0, "autonomy actor count is invalid");
assert.ok(activeEvents.every((event) => event.requiredFunctions?.length > 0), "an active event lost its completion signals");
for (const event of activeEvents) {
  const raw = record.master.events.find((item) => item.id === event.id);
  assert.ok(raw, `${event.id}: source event is missing`);
  const expected = api.packageEventSourceProjectionV183(raw).completionSignals;
  assert.deepEqual(event.completionSignals, expected, `${event.id}: completion signals changed after compilation`);
  assert.equal(event.requiredFunctions.length, expected.length, `${event.id}: completion requirement count changed`);
}
const normalized = api.normalizeScenario(record.scenario);
const normalizedAttestation = api.packageSemanticAttestationV184({ ...record, scenario: normalized });
assert.equal(normalizedAttestation.semanticCompatible, true, normalizedAttestation.semanticIssues?.join(", "));
assert.doesNotMatch(normalized.world.location, /\d{4}-\d{2}-\d{2}/u, "a date suffix leaked into the scene location");
const safeCast = api.safeScenarioForExport(normalized).characters.map((character) => character.name);
const rawCast = normalized.characters.map((character) => character.name);
assert.ok(safeCast.every((name) => name && name !== "미공개 인물"), `public cast names were over-redacted: raw=${rawCast.join(", ")} safe=${safeCast.join(", ")}`);
const schoolIntent = api.parseIntent("학교에 등교한다");
assert.equal(schoolIntent.destination, "학교");
assert.ok(schoolIntent.estimatedDurationSec >= 1800);
api._setScenario(normalized);
const schoolTxn = api.applyOutcomeEnvelope(api.applyEventStartGate(api.applyBeatContract(api.buildTxn("학교에 등교한다", normalized, 0), normalized), normalized));
assert.equal(schoolTxn.temporalContract.mode, "PACKAGE_ACTION_SLICE_V4");
assert.equal(schoolTxn.eventPatch.advanceAtCommit, false);
assert.ok(schoolTxn.temporalContract.targetTick - schoolTxn.temporalContract.startTick <= schoolIntent.estimatedDurationSec, "ordinary school travel was expanded beyond its realistic duration");
const contextText = JSON.stringify(context);
for (const futureEvent of activeEvents.slice(1)) {
  const nextRawEvent = record.master.events.find((event) => event.id === futureEvent.id);
  if (nextRawEvent?.name) assert.equal(contextText.includes(nextRawEvent.name), false, `${nextRawEvent.id}: future event title leaked into writer context`);
}

const routeResults = [];
for (const route of record.routeOptions ?? []) {
  const routed = api.selectPackageRouteV180(record, route.id);
  const routedAttestation = api.assertPackageActivationV182(routed);
  assert.equal(routedAttestation.semanticCompatible, true, `${route.id}: ${routedAttestation.semanticIssues?.join(", ")}`);
  const routedIds = new Set(api.eventSequence(routed.scenario.event).map((event) => event.id));
  const routedContext = JSON.stringify(api.publicWriterContext(routed.scenario));
  for (const rawEvent of record.master.events) {
    if (!routedIds.has(rawEvent.id) && rawEvent.name) assert.equal(routedContext.includes(rawEvent.name), false, `${route.id}: off-route event title leaked: ${rawEvent.id}`);
  }
  routeResults.push({
    routeId: route.id,
    selectedEventCount: routedAttestation.selectedEventCount,
    semanticDigest: routedAttestation.semanticDigest,
  });
}

console.log(JSON.stringify({
  engineVersion: api.VERSION,
  schema: api.PACKAGE_V15_SCHEMA,
  storyId: record.storyId,
  routeId: attestation.routeId,
  selectedEventCount: attestation.selectedEventCount,
  totalEventCount: attestation.totalEventCount,
  selectedImageCount: record.summary?.imageCount ?? 0,
  semanticDigest: attestation.semanticDigest,
  semanticCompatible: attestation.semanticCompatible,
  topology: attestation.topology,
  projectionCoverage: attestation.projectionCoverage,
  normalizedSemanticCompatible: normalizedAttestation.semanticCompatible,
  safeCast,
  moduleCounts: attestation.moduleCounts,
  routes: routeResults,
  activeEventRequirements: activeEvents.map((event) => ({ id: event.id, requirements: event.requiredFunctions.length })),
}, null, 2));
