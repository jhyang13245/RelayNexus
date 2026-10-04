import assert from "node:assert/strict";
import test from "node:test";

import { hiddenFutureEventLeaks } from "../lib/narrative-output-safety";
import type { EngineTurnResponse } from "../lib/engine";
import type { ScenarioEvent, ScenarioPack } from "../lib/scenario";
import type { StoryDrive } from "../lib/story-director";
import { demoScenario } from "./fixtures/legacy-demo-scenario";

const event = (id: string, sequence: number, extras: Partial<ScenarioEvent> = {}): ScenarioEvent => ({
  id,
  name: `${id} 사건`,
  type: "Story",
  visibility: "Hidden",
  status: sequence === 1 ? "Active" : "Pending",
  priority: 50,
  conditions: "",
  description: "",
  sequence,
  ...extras,
});

const turnWith = (text: string, resolved: boolean) => ({
  blocks: [{ id: "n1", type: "narration", text }],
  statePatch: {
    time: "15:30",
    location: "중앙관",
    sceneSummary: text,
    statusAdd: [], statusRemove: [], inventoryAdd: [], inventoryRemove: [],
    relationChanges: [], clockChanges: [], memoryAdd: [], variablesAdd: [],
    variablesResolve: [], characterVisualsAdd: [], encounteredCharactersAdd: [],
    statusLedgerChanges: [], autonomyActions: [], relationshipMemoriesAdd: [],
    relationshipMemoryResolveIds: [],
  },
  recommendations: [],
  image: { recommended: false, reason: "", prompt: "", characterIds: [] },
  characterVisuals: [],
  agencyAudit: { playerActionInvented: false, note: "" },
  claudeSignals: { eventResolved: resolved },
}) as unknown as Omit<EngineTurnResponse, "mode" | "usage">;

test("resolved final scene may open the nearest canon event but cannot complete it", () => {
  const current = event("CURRENT", 1);
  const next = event("NEXT", 2, {
    name: "오후의 도착 알림",
    completionSignals: "봉인 문서를 실제로 획득",
  });
  const pack = { ...demoScenario, events: [current, next] } satisfies ScenarioPack;
  const drive = {
    routeLock: {
      currentEventId: current.id,
      forbiddenProgression: [next.name, "봉인 문서를 실제로 획득"],
    },
  } as unknown as StoryDrive;

  assert.deepEqual(hiddenFutureEventLeaks(
    turnWith("수업을 마친 뒤 중앙관으로 이동하자 오후의 도착 알림이 떴다.", true),
    drive,
    pack,
    { allowNextEventOpening: true },
  ), []);
  assert.deepEqual(hiddenFutureEventLeaks(
    turnWith("오후의 도착 알림을 확인하고 봉인 문서를 실제로 획득했다.", true),
    drive,
    pack,
    { allowNextEventOpening: true },
  ), ["봉인 문서를 실제로 획득"]);
  assert.deepEqual(hiddenFutureEventLeaks(
    turnWith("현재 사건이 끝나기 전에 오후의 도착 알림이 떴다.", false),
    drive,
    pack,
    { allowNextEventOpening: true },
  ), [next.name]);
});
