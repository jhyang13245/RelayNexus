import assert from "node:assert/strict";
import test from "node:test";

import { demoScenario } from "./fixtures/legacy-demo-scenario";
import {
  createInitialState,
  createOpeningTurn,
  type TurnRecord,
} from "../lib/scenario";
import {
  attachRuntimeCheckpoints,
  cloneRuntimeCheckpoint,
  runtimeCheckpointForTurn,
} from "../lib/session-timeline";
import { buildPublicStatusSnapshot } from "../lib/status-window";

const exchangeTurn = (id: string, turn: number, state = createInitialState(demoScenario)): TurnRecord => ({
  id,
  turn,
  role: "exchange",
  userText: "시험 입력",
  blocks: [{ id: `${id}-block`, type: "narration", text: `턴 ${turn} 본문` }],
  recommendations: [],
  createdAt: new Date(2026, 7, 21, 0, turn).toISOString(),
  statusSnapshot: buildPublicStatusSnapshot(demoScenario, state),
});

test("an exact turn checkpoint restores hidden events, relations, NPC state, and one world clock", () => {
  const first = createInitialState(demoScenario);
  first.turn = 1;
  first.day = 2;
  first.date = "2042-03-04";
  first.weekday = "수요일";
  first.time = "23:17";
  first.location = "지하 관측실";
  first.inventory = ["공명석"];
  first.variables = [{
    id: "RELAY_SERVER_STORY_ROUTE_PROGRESS",
    label: "필수 사건 원장",
    detail: JSON.stringify({ completedEventIds: ["EVT_01"] }),
    visibility: "hidden",
    reason: "검증",
    status: "active",
    createdTurn: 1,
  }];
  first.relations = first.relations.map((relation) => ({ ...relation, trust: 31 }));
  first.autonomyActors = first.autonomyActors.map((actor) => ({
    ...actor,
    currentLocation: "별관",
    lastActionTurn: 1,
  }));

  const openingState = createInitialState(demoScenario);
  const opening: TurnRecord = {
    ...createOpeningTurn(demoScenario),
    statusSnapshot: buildPublicStatusSnapshot(demoScenario, openingState),
    runtimeSnapshot: cloneRuntimeCheckpoint(openingState),
  };
  const firstTurn = {
    ...exchangeTurn("turn-1", 1, first),
    runtimeSnapshot: cloneRuntimeCheckpoint(first),
  };
  const current = cloneRuntimeCheckpoint(first);
  current.turn = 2;
  current.day = 3;
  current.date = "2042-03-05";
  current.time = "08:40";
  current.location = "다른 장소";
  current.inventory.push("미래 물품");

  const restored = runtimeCheckpointForTurn(
    demoScenario,
    current,
    firstTurn,
    [opening, firstTurn],
  );
  assert.equal(restored.turn, 1);
  assert.equal(restored.day, 2);
  assert.equal(restored.date, "2042-03-04");
  assert.equal(restored.time, "23:17");
  assert.equal(restored.location, "지하 관측실");
  assert.deepEqual(restored.inventory, ["공명석"]);
  assert.equal(restored.variables[0]?.id, "RELAY_SERVER_STORY_ROUTE_PROGRESS");
  assert.equal(restored.relations[0]?.trust, 31);
  assert.equal(restored.autonomyActors[0]?.currentLocation, "별관");
});

test("legacy sessions receive a checkpoint for every visible turn", () => {
  const openingState = createInitialState(demoScenario);
  const opening: TurnRecord = {
    ...createOpeningTurn(demoScenario),
    statusSnapshot: buildPublicStatusSnapshot(demoScenario, openingState),
  };
  const current = cloneRuntimeCheckpoint(openingState);
  current.turn = 2;
  current.time = "10:20";
  const turns = [opening, exchangeTurn("turn-1", 1), exchangeTurn("turn-2", 2, current)];
  const migrated = attachRuntimeCheckpoints(demoScenario, current, turns);
  assert.equal(migrated.length, 3);
  assert.ok(migrated.every((turn) => turn.runtimeSnapshot));
  assert.equal(migrated[0]?.runtimeSnapshot?.turn, 0);
  assert.equal(migrated[2]?.runtimeSnapshot?.time, "10:20");
});
