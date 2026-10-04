import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { blankStoryEvent, makeNewStudioProject, normalizeProject } from "../../features/jieum/studio-model";
import { eventDesign, orderedEvents } from "../../features/jieum/cortex-event-design";
import { buildImportObject, exportScenarioPack, extractStudioProjectFromPackage } from "../../features/jieum/studio-export";
import { lintCortexPackage } from "../../features/jieum/cortex-package-lint";
import { selectNextEvent } from "./integration/cortex-studio-event-policy-v2.mjs";

test("explicit links win; array order survives reversed dates, loop resets and sequence numbers", async () => {
  const p = makeNewStudioProject();
  p.events = [
    { ...blankStoryEvent(99), id: "A", storyDay: 9, startTime: "23:00", nextEventId: "C" },
    { ...blankStoryEvent(1), id: "B", storyDay: 0, startTime: "00:00" },
    { ...blankStoryEvent(2), id: "C", storyDay: 0, startTime: "bad", nextEventId: "B", multiroute: { expectedLoopOrdinal: 2, loopDay: 1 } },
    { ...blankStoryEvent(3), id: "END" },
  ];
  assert.deepEqual(orderedEvents(p).map((e) => e.id), ["A", "B", "C", "END"]);
  assert.equal(lintCortexPackage(p).findings.some((f) => /TIME|DAY/.test(f.code)), false);
  const output = await exportScenarioPack(p, false);
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  for (const path of ["project.json", "events/events.json", "cortex/event_policy.json"]) {
    const file = JSON.parse(await zip.file(path)!.async("string")), events = Array.isArray(file) ? file : file.events;
    assert.deepEqual(events.map((e: any) => e.id), ["A", "B", "C", "END"]);
    assert.deepEqual(events.map((e: any) => e.nextEventId || null), ["C", "C", "B", null]);
  }
  assert.equal(selectNextEvent({ events: p.events, finishedId: "A" }).eventId, "C");
  assert.equal(selectNextEvent({ events: p.events, finishedId: "C" }).eventId, "B");
  assert.equal(selectNextEvent({ events: p.events, finishedId: "END" }).status, "END");
});

test("old schedules remain editor metadata only; authored large jumps and initial time survive", async () => {
  const p = makeNewStudioProject(); p.startDate = "2026-05-11"; p.world.time = "06:30";
  const sentence = "전투 이후 10년 동안 혼수상태였다. 17년 뒤 17:00에 다시 만난다.";
  const e = { ...blankStoryEvent(1), id: "JUMP", visibility: "Public" as const, description: sentence, required: false, storyDay: 3, startTime: "17:00:00", endTime: "18:00:00", timeWindow: "DAY 3 17:00~18:00", multiroute: { loopDay: 4, expectedLoopOrdinal: 2 } };
  e.cortexDesign = { ...eventDesign(e), closureConditions: [{ id: "REUNION", text: "두 사람이 실제로 재회한다." }] };
  p.events = [e];
  const restored = normalizeProject(p);
  assert.equal(restored.events[0].description, sentence);
  assert.equal(restored.events[0].studioLegacySchedule?.timeWindow, e.timeWindow);
  const output = await exportScenarioPack(restored, false), zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const run = JSON.parse(await zip.file("events/events.json")!.async("string"))[0];
  for (const key of ["storyDay", "startTime", "endTime", "timeWindow", "studioLegacySchedule"]) assert.equal(key in run, false, key);
  assert.equal("loopDay" in run.multiroute, false);
  assert.equal(run.multiroute.expectedLoopOrdinal, 2);
  assert.equal(run.description, sentence);
  assert.equal(run.requiredFunctions[0].description, "두 사람이 실제로 재회한다.");
  assert.equal(buildImportObject(restored).publicEvents[0].description, sentence);
  for (const input of [output.blob, new Uint8Array(await output.blob.arrayBuffer())]) {
    const roundtrip = normalizeProject((await extractStudioProjectFromPackage(input)).project);
    assert.equal(roundtrip.startDate, p.startDate); assert.equal(roundtrip.world.time, p.world.time);
    assert.equal(roundtrip.events[0].studioLegacySchedule?.timeWindow, e.timeWindow);
    assert.equal("timeWindow" in roundtrip.events[0], false);
    assert.equal(roundtrip.events[0].cortexDesign?.closureConditions[0].text, "두 사람이 실제로 재회한다.");
  }
});
