import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { demoScenario } from "../lib/demo-scenario";
import {
  parseInstantStoryRuntime,
  selectInstantKeywordNotes,
} from "../lib/instant-story-runtime";
import runtimeDocument from "../lib/default-demo-package/rules/instant_story_runtime.json";
import projectDocument from "../lib/default-demo-package/project.json";
import contextIndex from "../lib/default-demo-package/runtime/context_index.json";
import keywordIndex from "../lib/default-demo-package/runtime/keyword_index.json";
import mediaLookup from "../lib/default-demo-package/runtime/media_lookup.json";
import endingSchedule from "../lib/default-demo-package/runtime/ending_schedule.json";
import {
  createInitialState,
  createOpeningTurn,
  parseScenarioPackFile,
} from "../lib/scenario";

const derivedDocuments = {
  contextIndex,
  keywordIndex,
  mediaLookup,
  endingSchedule,
};

test("새 기본 데모는 첨부된 기성학원 입학 검사 패키지를 사용한다", () => {
  assert.equal(demoScenario.projectId, "RN-DEMO-GISEONG-INSTANT-001");
  assert.equal(demoScenario.packageVersion, "1.5");
  assert.equal(demoScenario.player.name, "윤지훈");
  assert.match(demoScenario.player.skills, /원소조작/u);
  assert.equal(demoScenario.startDate, "2026-03-02");
  assert.equal(demoScenario.startTime, "08:35");
  assert.equal(
    demoScenario.startLocation,
    "기성학원 신입생 종합검사센터 · 능력판정 4번실",
  );
  assert.deepEqual(demoScenario.npcs.map((npc) => npc.name), [
    "레나",
    "릴리아 발렌하르트",
  ]);
  assert.equal(demoScenario.events.length, 0);
  assert.equal(demoScenario.constraints.length, 0);
  assert.equal(demoScenario.autonomyActors.length, 0);
  assert.equal(demoScenario.instantStoryRuntime?.enabled, true);
  assert.equal(demoScenario.instantStoryRuntime?.exclusiveRuntime, true);
  assert.equal(demoScenario.compatibility?.instantStoryRuntimeV2, true);
  assert.equal(
    demoScenario.package15Runtime?.negotiatedFeatures.includes(
      "instant_story_runtime_v2",
    ),
    true,
  );
  assert.equal(
    demoScenario.package15Runtime?.negotiatedFeatures.includes(
      "status_relationship_display_v1",
    ),
    true,
  );
  assert.deepEqual(
    demoScenario.statusWindow.relationshipDisplay?.entries.map((entry) => ({
      id: entry.id,
      parts: entry.displayParts,
    })),
    [
      { id: "HUD_REL_LENA", parts: ["sentence", "stat", "symbol"] },
      { id: "HUD_REL_LILIA", parts: ["sentence", "stat"] },
      { id: "HUD_FACTION_GISEONG", parts: ["sentence", "symbol"] },
    ],
  );
});

test("Studio 원본 ZIP도 Instant Story Runtime과 파생 인덱스를 협상한다", async () => {
  const packagePath = new URL(
    "../samples/기성학원_Instant_Story_Runtime_ScenarioPack_v1.5.zip",
    import.meta.url,
  );
  const bytes = await readFile(packagePath);
  const pack = await parseScenarioPackFile(
    new NodeFile([bytes], "giseong-instant.zip") as unknown as globalThis.File,
  );

  assert.equal(pack.projectId, demoScenario.projectId);
  assert.equal(pack.player.name, "윤지훈");
  assert.equal(pack.instantStoryRuntime?.enabled, true);
  assert.equal(pack.compatibility?.instantStoryRuntimeV2, true);
  assert.equal(pack.events.length, 0);
  assert.equal(pack.autonomyActors.length, 0);
  assert.equal(
    pack.package15Runtime?.negotiatedFeatures.includes("instant_story_runtime_v2"),
    true,
  );
});

test("내장 데모 오프닝은 Instant 시작 프로필 전문과 추천 행동을 표시한다", () => {
  const opening = createOpeningTurn(demoScenario);
  const text = opening.blocks.map((block) => block.text).join("\n");
  const recommendations = opening.recommendations.map((item) => item.label).join("\n");

  assert.match(text, /입학 첫날 오전 8시 35분/u);
  assert.match(text, /신입생 종합검사 · 능력판정 4번실/u);
  assert.match(text, /윤지훈 학생/u);
  assert.doesNotMatch(text, /205호|레나|릴리아 발렌하르트/u);
  assert.match(recommendations, /학생증/u);
  assert.match(recommendations, /검사 전에 어떤 순서/u);
  assert.match(recommendations, /네 종류의 샘플/u);
});

test("기성학원 입학 검사 오프닝은 미등장 NPC의 이미지 큐를 앞당기지 않는다", () => {
  const opening = createOpeningTurn(demoScenario);
  const state = createInitialState(demoScenario);

  assert.deepEqual(opening.characterVisuals, []);
  assert.deepEqual(state.characterVisuals, []);
});

test("첫 등장 AI 기준 이미지 큐는 Instant 전용이 아니라 모든 작품 오프닝에 적용된다", () => {
  const genericPack = {
    ...demoScenario,
    projectId: "GENERIC-OPENING-VISUALS",
    title: "두 사람이 도착한 오후",
    instantStoryRuntime: undefined,
    mediaAssets: [],
    opening: {
      ...demoScenario.opening,
      openingCharacters: "NPC_LENA, NPC_LILIA",
      openingLine:
        "레나는 창가에 서 있었고, 릴리아 발렌하르트는 열린 문 옆에서 기다리고 있었다.",
    },
  };
  const opening = createOpeningTurn(genericPack);

  assert.deepEqual(
    opening.characterVisuals?.map((cue) => [cue.characterId, cue.source]),
    [
      ["NPC_LENA", "pending"],
      ["NPC_LILIA", "pending"],
    ],
  );
});

test("Instant Runtime은 동일 원본 해시의 파생 인덱스만 활성화한다", () => {
  const valid = parseInstantStoryRuntime(runtimeDocument, derivedDocuments);
  assert.equal(valid?.compilerVersion, "studio-1.8.0");
  assert.equal(valid?.contextBudget.maxDynamicPromptChars, 10_000);
  assert.equal(valid?.generation.ordinaryTurnMaxOutputTokens, 2_200);

  const staleKeywordIndex = {
    ...keywordIndex,
    sourcePackageSha256: "0".repeat(64),
  };
  const rebuilt = parseInstantStoryRuntime(runtimeDocument, {
      ...derivedDocuments,
      keywordIndex: staleKeywordIndex,
    }, projectDocument);
  assert.equal(rebuilt?.featureId, "instant_story_runtime_v2");
  assert.equal(rebuilt?.keywordNotes.length, 11);
});

test("키워드 인덱스는 현재 장면과 맞는 노트만 패키지 상한까지 고른다", () => {
  const notes = selectInstantKeywordNotes(
    demoScenario.instantStoryRuntime,
    "A205호 문짝의 물을 움직이고 레나에게 파편을 묻는다.",
  );

  assert.equal(notes.length, 3);
  assert.ok(notes.some((note) => note.id === "NOTE_A205_OPTIONAL"));
  assert.ok(notes.some((note) => note.id === "NOTE_PLAYER_POWER"));
  assert.ok(notes.some((note) => note.id === "NOTE_LENA"));
});
