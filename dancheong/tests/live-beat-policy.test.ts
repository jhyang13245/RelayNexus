import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveLiveBeatPolicy,
  liveFinalDisclosureBlocked,
  livePhaseWriterInstruction,
} from "../lib/live-beat-policy";
import { liveDiscardReason } from "../lib/live-stream-pipeline";

test("live beat policy publishes beat 1 directly, corrects middle beats once, and preserves final failure", () => {
  assert.deepEqual(
    deriveLiveBeatPolicy({ currentBeat: 1, totalBeats: 4, finalBeat: false }),
    {
      phase: "first_draft",
      beat: 1,
      totalBeats: 4,
      correctionLimit: 0,
      preserveFailedDraft: false,
    },
  );
  assert.deepEqual(
    deriveLiveBeatPolicy({ currentBeat: 3, totalBeats: 4, finalBeat: false }),
    {
      phase: "closure_build_up",
      beat: 3,
      totalBeats: 4,
      correctionLimit: 1,
      preserveFailedDraft: false,
    },
  );
  assert.deepEqual(
    deriveLiveBeatPolicy({ currentBeat: 4, totalBeats: 4, finalBeat: true }),
    {
      phase: "final_closure",
      beat: 4,
      totalBeats: 4,
      correctionLimit: 0,
      preserveFailedDraft: true,
    },
  );
});

test("identity and future-event disclosure are blocked on every beat while beat 1 tolerates soft checks", () => {
  assert.equal(liveFinalDisclosureBlocked({
    policy: deriveLiveBeatPolicy({ currentBeat: 1, totalBeats: 4, finalBeat: false }),
    identityLeakCount: 1,
    disclosureLeakCount: 0,
    futureEventLeakCount: 0,
    controlLeakCount: 0,
  }), true);
  assert.equal(liveFinalDisclosureBlocked({
    policy: deriveLiveBeatPolicy({ currentBeat: 1, totalBeats: 4, finalBeat: false }),
    identityLeakCount: 0,
    disclosureLeakCount: 1,
    futureEventLeakCount: 0,
    controlLeakCount: 1,
  }), false);
  assert.equal(liveFinalDisclosureBlocked({
    policy: deriveLiveBeatPolicy({ currentBeat: 1, totalBeats: 4, finalBeat: false }),
    identityLeakCount: 0,
    disclosureLeakCount: 0,
    futureEventLeakCount: 1,
    controlLeakCount: 0,
  }), true);
  assert.equal(liveFinalDisclosureBlocked({
    policy: deriveLiveBeatPolicy({ currentBeat: 2, totalBeats: 4, finalBeat: false }),
    identityLeakCount: 0,
    disclosureLeakCount: 1,
    futureEventLeakCount: 0,
    controlLeakCount: 0,
  }), true);
});

test("discard telemetry distinguishes malformed JSON from rejected validation", () => {
  assert.equal(liveDiscardReason({ message: "응답 JSON 파싱 실패" }), "json");
  assert.equal(liveDiscardReason({
    code: "LUNA_RESPONSE_REJECTED",
    message: "장면 계약 검증을 통과하지 못했습니다.",
  }), "validation");
  assert.equal(liveDiscardReason({
    code: "NARRATIVE_REWRITE_FAILED",
    message: "보호 명칭이 남았습니다.",
  }), "protected_term");
});

test("추가 종결 비트는 심한 이탈 입력도 인물 동기로 정사에 강제 흡수한다", () => {
  const policy = deriveLiveBeatPolicy({
    currentBeat: 3,
    totalBeats: 3,
    finalBeat: true,
    closureExtension: true,
  });
  assert.equal(policy.closureExtension, true);
  const instruction = livePhaseWriterInstruction(policy);
  assert.match(instruction, /정사 강제 흡수/u);
  assert.match(instruction, /밤샘·장거리 이탈/u);
  assert.match(instruction, /양심·책임·관계/u);
  assert.match(instruction, /eventResolved=true/u);
});

test("두 번째 연장 턴은 최종 강제 종결 전용 지시를 사용한다", () => {
  const policy = deriveLiveBeatPolicy({
    currentBeat: 5,
    totalBeats: 5,
    finalBeat: true,
    closureExtension: true,
    closureExtensionStage: 2,
  });
  assert.equal(policy.closureExtensionStage, 2);
  const instruction = livePhaseWriterInstruction(policy);
  assert.match(instruction, /최종 강제 종결 턴/u);
  assert.match(instruction, /책임·양심·관계/u);
  assert.match(instruction, /eventResolved=true/u);
});
