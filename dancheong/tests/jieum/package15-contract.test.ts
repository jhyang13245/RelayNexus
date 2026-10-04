import assert from "node:assert/strict";
import test from "node:test";
import { buildImportObject, narrativeRuntimeContract, package15Documents, packageVersionFor } from "../../features/jieum/studio-export";
import { blankCharacter, blankStoryEvent, makeProject, normalizeProject } from "../../features/jieum/studio-model";

test("Package 1.4 optional narrative fields survive a project roundtrip", () => {
  const project = makeProject(false);
  const character = blankCharacter(false);
  character.id = "NPC_SECRET";
  character.preRevealAlias = "회색 코트의 여자";
  character.revealCondition = { kind: "event_completed", eventId: "EVT_REVEAL" };
  const event = blankStoryEvent(1);
  event.id = "EVT_REVEAL";
  event.alternateBeats = [{ id: "ALT_TRACE", priority: 80, narrativeGoal: "다른 흔적으로 진실에 도달", requiredSignals: ["TRACE_FOUND"], preservePlayerChoice: true }];
  event.sceneMarkers = [{ id: "MARK_REVEAL", label: "정체 공개", phase: "complete", when: { kind: "event_completed", eventId: "EVT_REVEAL" } }];
  project.npcs = [character];
  project.events = [event];

  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(packageVersionFor(restored), "1.4");
  assert.deepEqual(restored.npcs[0].revealCondition, character.revealCondition);
  assert.deepEqual(restored.events[0].alternateBeats, event.alternateBeats);
  assert.deepEqual(restored.events[0].sceneMarkers, event.sceneMarkers);
  assert.equal(narrativeRuntimeContract(restored).packageCompatibility.join(","), "1.4,1.5");
});

test("Package 1.5 v2.1 documents preserve routes, structured reveal and AI scopes", () => {
  const project = makeProject(false);
  project.package15.enabled = true;
  project.package15.storyMode = "multi_route_time_loop";
  project.package15.requiredFeatures = ["multi_route_v1", "time_loop_v1", "reveal_policy_v1", "ending_meta_progress_v1"];
  project.package15.routes = [{ id: "ROUTE_A", name: "A 루트", description: "", order: 1, initiallyUnlocked: true, recommendedPrerequisiteRouteIds: [], entryEventId: "", lockEventId: "", chapterIds: ["CH_A1"], endingIds: ["END_A"], revealPolicyIds: ["POLICY_A"] }];
  project.package15.chapters = [{ id: "CH_A1", scope: "route", routeId: "ROUTE_A", ordinal: 1, name: "첫 장", eventIds: [] }];
  project.package15.revealFacts = [{ id: "FACT_NAME", label: "진명", description: "", protectedTerms: ["진명"] }];
  project.package15.revealPolicies = [{ id: "POLICY_A", scope: "route", routeId: "ROUTE_A", rules: [{ factId: "FACT_NAME", beforeMode: "forbidden", afterMode: "full", transitionWhen: { kind: "flag_equals", flagId: "FLAG_REVEAL", value: true } }] }];
  project.package15.endings = [{ id: "END_A", routeId: "ROUTE_A", name: "A 엔딩", type: "good", priority: 50, condition: {}, effects: [{ kind: "record_ending", targetId: "END_A" }], returnPolicy: "new_worldline" }];
  project.package15.loopPolicy.enabled = true;
  project.package15.loopPolicy.trigger = { allOf: [{ kind: "flag_equals", flagId: "FLAG_LOOP", value: true }] };
  project.aiWorldContext.routeContexts = { ROUTE_A: { revealPolicyIds: ["POLICY_A"], routeCanon: "A 루트 정사" } };

  const docs = package15Documents(project);
  const imported = buildImportObject(project);
  assert.equal(packageVersionFor(project), "1.5");
  assert.equal(docs.routeGraph.format, "RELAY_NOVEL_ROUTE_GRAPH_V1");
  assert.deepEqual(docs.revealPolicies.mergePrecedence, ["forbidden", "hint_only", "partial", "full"]);
  assert.equal(docs.loopPolicy.resetPrecedence[0], "event_reset_behavior");
  assert.deepEqual(imported.aiWorldContextRuntime.routeContexts.ROUTE_A.revealPolicyIds, ["POLICY_A"]);
  assert.match(imported.aiWorldContextRuntime.knowledgeScopes.protagonist, /현재 세계선/);

  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.package15.revealPolicies, project.package15.revealPolicies);
  assert.deepEqual(restored.aiWorldContext.routeContexts, project.aiWorldContext.routeContexts);
});
