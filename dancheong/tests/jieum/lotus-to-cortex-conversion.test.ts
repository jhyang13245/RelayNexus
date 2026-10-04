import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  blankImageTrigger,
  blankCharacter,
  blankStoryEvent,
  convertLotusProjectToCortex,
  makeProjectForPackageTarget,
} from "../../features/jieum/studio-model";
import { buildImportObject, exportScenarioPack } from "../../features/jieum/studio-export";

const tinyImage = () => ({
  id: "IMG_KEEP",
  fileName: "keep.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  label: "보존 기준 이미지",
  isPrimary: true,
  addedAt: new Date(0).toISOString(),
});

test("Lotus canon conversion preserves authored data and produces a Cortex v1.42.0 package", async () => {
  const lotus = makeProjectForPackageTarget("legacy", "intelligent_canon", false);
  lotus.title = "Lotus 변환 회귀 시험";
  lotus.startDate = "2026-09-07";
  lotus.startLocation = "서촌 집";
  lotus.world.location = "서촌 집";
  lotus.player.images = [tinyImage()];
  lotus.npcs = [{ ...blankCharacter(false), id: "NPC_KEEP", name: "보존 인물" }];
  lotus.npcs[0].hiddenInfo = "절대 유실되면 안 되는 비공개 정보";
  lotus.gmData.secrets = "GM 전용 원문";
  lotus.events = [
    {
      ...blankStoryEvent(1),
      id: "old opening",
      name: "첫 사건",
      required: true,
      visibility: "Public",
      timeWindow: "2026-09-07 08:00~09:00",
      canonLocation: "서촌 집",
      completionSignals: "봉인 상자를 확인한다; 목격 사실을 기록한다",
      description: "기존 Lotus 사건 원문",
      nextEventId: "old ending",
    },
    {
      ...blankStoryEvent(2),
      id: "old ending",
      name: "둘째 사건",
      visibility: "Hidden",
      timeWindow: "2026-09-07 09:30~10:30",
      canonLocation: "서촌 집",
      description: "숨은 사건 원문",
    },
  ];
  lotus.eventClocks = [{
    id: "CLOCK_TEST", name: "시험 시계", visibility: "Hidden", status: "Active", current: 0, maximum: 4,
    relatedEventId: "old ending", advanceRules: "진행", regressRules: "", triggerResult: "결과", publicHint: "", hiddenNotes: "비밀",
  }];
  const trigger = blankImageTrigger();
  trigger.sourceId = "old opening";
  trigger.triggerType = "event_start";
  lotus.imageTriggers = [trigger];

  const beforeImage = lotus.player.images[0];
  const { project: cortex, report } = convertLotusProjectToCortex(lotus);

  assert.equal(cortex.packageTarget, "cortex");
  assert.equal(cortex.runtimeMode, "intelligent_canon");
  assert.equal(cortex.player.images[0].dataUrl, beforeImage.dataUrl);
  assert.equal(cortex.npcs[0].hiddenInfo, lotus.npcs[0].hiddenInfo);
  assert.equal(cortex.gmData.secrets, lotus.gmData.secrets);
  assert.deepEqual(cortex.events.map((event) => event.description), ["기존 Lotus 사건 원문", "숨은 사건 원문"]);
  assert.deepEqual(cortex.events.map((event) => event.beats), lotus.events.map((event) => event.beats));
  assert.equal("storyDay" in cortex.events[0], false);
  assert.equal("startTime" in cortex.events[0], false);
  assert.equal(cortex.events[0].studioLegacySchedule?.timeWindow, lotus.events[0].timeWindow);
  assert.equal(cortex.events[0].cortexDesign?.closureConditions.length! > 0, true);
  assert.equal(cortex.events[0].nextEventId, lotus.events[0].nextEventId);
  assert.equal(cortex.eventClocks[0].relatedEventId, cortex.events[1].id);
  assert.equal(cortex.imageTriggers[0].sourceId, cortex.events[0].id);
  assert.deepEqual(cortex.events.map((event) => event.id), lotus.events.map((event) => event.id));
  assert.deepEqual(cortex.events.map((event) => event.canonLocationRef), lotus.events.map((event) => event.canonLocationRef));
  assert.equal(cortex.protagonistInvariants.length, 4);
  assert.equal(report.preservedImages, 1);
  assert.equal(report.unresolvedEventLocations, 0);

  const summary = await exportScenarioPack(cortex, false);
  const archive = await JSZip.loadAsync(await summary.blob.arrayBuffer());
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  const events = JSON.parse(await archive.file("events/events.json")!.async("string"));
  assert.equal(manifest.minimumTargetVersion, "1.42.0");
  assert.equal(events[0].beats.length, lotus.events[0].beats.length);
  assert.equal(events[0].beats.every((beat: { goal?: string }) => Boolean(beat.goal)), true);
  assert.equal(events[0].requiredFunctions[0].type, "READER_UNDERSTANDING");
});

test("Lotus canon conversion preserves narrative location text without requiring registration", () => {
  const lotus = makeProjectForPackageTarget("legacy", "intelligent_canon", false);
  lotus.events = [{ ...blankStoryEvent(1), id: "old event", name: "옥상의 시선", description: "철로 귀환로에서 옥상을 바라본다" }];
  const { project, report } = convertLotusProjectToCortex(lotus);
  assert.equal(report.unresolvedEventLocations, 0);
  assert.equal(project.events[0].canonLocationRef, "");
});

test("Lotus Instant Story conversion changes only the engine contract", async () => {
  const lotus = makeProjectForPackageTarget("legacy", "instant_story", false);
  lotus.title = "Instant 보존 시험";
  lotus.instantStory.corePrompt = "원문 코어 프롬프트";
  lotus.instantStory.startProfiles = [{ id: "START_KEEP", name: "시작", prologue: "시작 원문", startSituation: "집", recommendedReplies: ["문을 연다"] }];
  lotus.instantStory.keywordNotes = [{ id: "NOTE_KEEP", title: "비밀", keywords: ["열쇠"], priority: 80, content: "키워드 비공개 설계" }];
  lotus.player.images = [tinyImage()];
  const instantBefore = structuredClone(lotus.instantStory);

  const { project: cortex, report } = convertLotusProjectToCortex(lotus);
  assert.equal(cortex.packageTarget, "cortex");
  assert.equal(cortex.runtimeMode, "instant_story");
  assert.deepEqual(cortex.instantStory, instantBefore);
  assert.equal(cortex.player.images[0].dataUrl, lotus.player.images[0].dataUrl);
  assert.equal(cortex.protagonistInvariants.length, 4);
  assert.equal(report.preservedImages, 1);
  assert.equal(report.eventIdsRemapped, 0);

  const summary = await exportScenarioPack(cortex, false);
  const archive = await JSZip.loadAsync(await summary.blob.arrayBuffer());
  assert.notEqual(archive.file("INSTANT_RUNTIME_IMPORT.json"), null);
  assert.notEqual(archive.file("cortex/protagonist_invariants.json"), null);
  assert.equal(archive.file("events/events.json"), null);
});

test("CHATGPT_IMPORT serializes every event with the selected engine contract", () => {
  const lotus = makeProjectForPackageTarget("legacy", "intelligent_canon", false);
  lotus.events = [1, 2, 3].map((sequence) => ({
    ...blankStoryEvent(sequence),
    id: `EV_ACT1_0${sequence}_TEST`,
    name: `사건 ${sequence}`,
    visibility: "Public" as const,
    recoveryAlternatives: `Lotus 복구 ${sequence}`,
  }));
  const lotusEvents = buildImportObject(lotus).publicEvents;
  assert.equal(lotusEvents.every((event) => !("title" in event)), true);
  assert.deepEqual(lotusEvents.map((event) => event.recoveryAlternatives), ["Lotus 복구 1", "Lotus 복구 2", "Lotus 복구 3"]);

  const { project: cortex } = convertLotusProjectToCortex(lotus);
  const cortexEvents = buildImportObject(cortex).publicEvents;
  assert.equal(cortexEvents.every((event) => event.title && event.recoveryAlternatives === undefined), true);
  assert.equal(cortexEvents.every((event) => event.beats.every((beat: { goal?: string }) => Boolean(beat.goal))), true);
});
