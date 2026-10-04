import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUserCanonIntent,
  mergeSessionCanonLedger,
  sanitizeSessionCanonUpdates,
  userCanonIntentHandled,
} from "../lib/session-canon";
import { deriveNarrativeSceneContract } from "../lib/narrative-kernel";
import type { SessionCanonEntry } from "../lib/scenario";

const characters = [
  { id: "NPC_SEOYEON", name: "박서연" },
  { id: "NPC_HONGJAE", name: "홍재" },
];

test("모든 작품에서 이름을 지목한 NPC 행동은 실행 또는 가시적 실패가 있어야 한다", () => {
  const intent = deriveUserCanonIntent(
    '"아르카!" 박서연이 주문을 외우더니 마법을 시전해 추격자를 공격한다.',
    characters,
  );

  assert.equal(intent.targetId, "NPC_SEOYEON");
  assert.equal(intent.namedNpcAction, true);
  assert.equal(userCanonIntentHandled(intent, "문이 더 밀려 들어왔다.", []), false);
  assert.equal(
    userCanonIntentHandled(
      intent,
      "박서연이 주문을 끝맺자 푸른 마법이 추격자의 어깨를 후려쳤다.",
      [],
    ),
    true,
  );
});

test("이름을 지목한 질문은 무관한 대사가 아니라 해당 주제의 답이나 회피를 요구한다", () => {
  const intent = deriveUserCanonIntent(
    "서연 씨, 방금 마법을 사용하신 건가요?",
    characters,
  );

  assert.equal(intent.question, true);
  assert.equal(
    userCanonIntentHandled(intent, "", [
      { speakerId: "NPC_SEOYEON", speakerName: "박서연", text: "문을 놓으면 위험해요." },
    ]),
    false,
  );
  assert.equal(
    userCanonIntentHandled(intent, "", [
      { speakerId: "NPC_SEOYEON", speakerName: "박서연", text: "그 마법에 대해서는 지금 설명할 수 없어요." },
    ]),
    true,
  );
});

test("고정 정체와 충돌하는 사용자 주장은 삭제하지 않고 인물의 부정으로 받아친다", () => {
  const intent = deriveUserCanonIntent(
    "홍재는 사실 정약용이었다.",
    characters,
  );

  assert.equal(intent.identityClaim, true);
  assert.equal(userCanonIntentHandled(intent, "홍재는 칼자루를 고쳐 잡았다.", []), false);
  assert.equal(
    userCanonIntentHandled(intent, "", [
      {
        speakerId: "NPC_HONGJAE",
        speakerName: "홍재",
        text: "정약용이라는 추측은 틀렸습니다. 제 정체는 때가 되면 밝히겠습니다.",
      },
    ]),
    true,
  );
});

test("정체에 관한 조건·부정·전언은 실행 정사 선언으로 오판하지 않는다", () => {
  const samples = [
    "만약 홍재의 정체가 정약용이라면 어떻게 하지?",
    "홍재의 정체는 정약용이 아니었다.",
    "홍재의 정체가 정약용이었다고 들었다.",
  ];
  for (const input of samples) {
    const contract = deriveNarrativeSceneContract(input);
    const intent = deriveUserCanonIntent(
      input,
      characters,
      contract.clauses
        .filter((clause) => clause.mode === "execution")
        .map((clause) => clause.text),
    );
    assert.equal(intent.identityClaim, false, input);
  }
});

test("분기 정사와 장면 사실은 공개 본문 근거가 있을 때만 서버 장부에 들어간다", () => {
  const publicText = "박서연이 숨겨 두었던 마법을 사용해 추격자의 팔을 밀어냈다.";
  const additions = sanitizeSessionCanonUpdates({
    updates: [
      {
        kind: "branch_canon",
        statement: "박서연은 추격전에서 마법을 처음 공개했다.",
        subjectIds: ["NPC_SEOYEON"],
        evidence: publicText,
        consequence: "향후 최초 마법 공개 사건은 재연하지 않고 후속 반응으로 바꾼다.",
        relatedEventIds: ["EV_REVEAL"],
      },
      {
        kind: "scene_fact",
        statement: "본문에 없는 보석을 박서연이 획득했다.",
        subjectIds: ["NPC_SEOYEON"],
        evidence: "박서연이 보석을 주웠다.",
        consequence: "보석을 소지한다.",
        relatedEventIds: [],
      },
    ],
    existing: [],
    userInput: "박서연이 마법을 사용한다.",
    publicText,
    characterIds: new Set(["NPC_SEOYEON"]),
    eventIds: new Set(["EV_REVEAL"]),
    turn: 7,
  });

  assert.equal(additions.length, 1);
  assert.equal(additions[0]?.kind, "branch_canon");
  assert.equal(additions[0]?.truth, "confirmed");
  assert.deepEqual(additions[0]?.subjectIds, ["NPC_SEOYEON"]);
});

test("확인·부정된 명제는 이전의 미확인 추측을 비활성화한다", () => {
  const hypothesis: SessionCanonEntry = {
    id: "H1",
    kind: "player_hypothesis",
    statement: "홍재의 정체는 정약용이다.",
    truth: "unconfirmed",
    origin: "player",
    subjectIds: ["NPC_HONGJAE"],
    evidence: "플레이어가 그렇게 추측했다.",
    consequence: "확인되기 전에는 사실로 취급하지 않는다.",
    relatedEventIds: [],
    createdTurn: 2,
    updatedTurn: 2,
    active: true,
  };
  const refutation: SessionCanonEntry = {
    ...hypothesis,
    id: "R1",
    kind: "refuted_hypothesis",
    truth: "refuted",
    statement: "홍재는 자신이 정약용이라는 추측을 부정했다.",
    evidence: "그 이름은 제 것이 아닙니다.",
    createdTurn: 3,
    updatedTurn: 3,
  };

  const merged = mergeSessionCanonLedger([hypothesis], [refutation]);
  assert.equal(merged[0]?.active, false);
  assert.equal(merged[1]?.active, true);
});

test("공통 세션 정사 모듈에는 특정 작품 고유명사가 없다", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../lib/session-canon.ts", import.meta.url), "utf8")
  );
  assert.doesNotMatch(source, /Fate|나디아|정조|이산/u);
});
