import assert from "node:assert/strict";
import test from "node:test";

import { deriveEventTimeRecovery } from "../lib/event-time-recovery";

test("an expired event window becomes a forward-only recovery contract", () => {
  const recovery = deriveEventTimeRecovery({
    timeWindow: "입학식 종료 직후 12:18~12:30",
    currentDay: 0,
    currentTime: "12:42",
  });
  assert.equal(recovery?.overdueMinutes, 12);
  assert.equal(recovery?.mode, "overdue");
  assert.match(recovery?.instruction ?? "", /가장 빠르면서 물리적으로 가능한 경로/u);
});

test("the next event's first beat can recover a missed day without backdating", () => {
  const recovery = deriveEventTimeRecovery({
    timeWindow: "입학 둘째 날 10:00~11:30",
    currentDay: 1,
    currentTime: "12:05",
  });
  assert.equal(recovery?.deadline, "D+1 11:30");
  assert.equal(recovery?.overdueMinutes, 35);
});

test("recurring or still-open windows do not receive a false overdue recovery", () => {
  assert.equal(deriveEventTimeRecovery({
    timeWindow: "매일 저녁 18:00",
    currentDay: 3,
    currentTime: "19:00",
  }), null);
  assert.equal(deriveEventTimeRecovery({
    timeWindow: "15:00~16:00",
    currentDay: 0,
    currentTime: "15:40",
    currentBeat: 2,
  }), null);
});

test("a next event first beat entered late uses its remaining window immediately", () => {
  const recovery = deriveEventTimeRecovery({
    timeWindow: "18:00~20:00",
    currentDay: 0,
    currentTime: "18:30",
    currentBeat: 1,
  });
  assert.equal(recovery?.mode, "late_window_entry");
  assert.equal(recovery?.overdueMinutes, 0);
  assert.equal(recovery?.remainingMinutes, 90);
  assert.match(recovery?.instruction ?? "", /우회·대기/u);
});
