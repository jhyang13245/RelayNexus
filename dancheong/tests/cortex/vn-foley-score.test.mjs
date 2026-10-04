import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { foleyScore, FOLEY_KINDS } from "../../public/cortex-vn-foley-score.mjs";

const EXPECTED_KINDS = ["footstep", "cloth", "door", "metal", "paper", "impact"];
const SEEDS = [1, 2, 7, 1234, "abc"];
const VALID_TYPES = new Set(["noise", "tone"]);
const VALID_FILTERS = new Set(["lowpass", "highpass", "bandpass"]);

function assertValidScore(events) {
  assert.ok(Array.isArray(events), "score must be an array");
  assert.ok(events.length <= 12, "at most 12 events");
  for (const event of events) {
    assert.deepEqual(
      Object.keys(event).sort(),
      [
        "at",
        "duration",
        "endFrequency",
        "filter",
        "frequency",
        "gain",
        "pan",
        "q",
        "type",
      ].sort(),
      "event shape",
    );
    assert.ok(VALID_TYPES.has(event.type), `type ${event.type}`);
    assert.ok(VALID_FILTERS.has(event.filter), `filter ${event.filter}`);
    for (const key of [
      "at",
      "duration",
      "gain",
      "frequency",
      "endFrequency",
      "q",
      "pan",
    ]) {
      assert.equal(typeof event[key], "number", `${key} is a number`);
      assert.ok(Number.isFinite(event[key]), `${key} is finite`);
    }
    assert.ok(event.at >= 0, "at >= 0");
    assert.ok(event.duration > 0, "duration > 0");
    assert.ok(
      event.at + event.duration <= 1.5 + 1e-9,
      `at+duration<=1.5 (got ${event.at + event.duration})`,
    );
    assert.ok(
      event.gain >= 0 && event.gain <= 0.18 + 1e-12,
      `gain<=0.18 (got ${event.gain})`,
    );
    assert.ok(
      event.frequency >= 40 && event.frequency <= 10000,
      `frequency range (got ${event.frequency})`,
    );
    assert.ok(
      event.endFrequency >= 40 && event.endFrequency <= 10000,
      `endFrequency range (got ${event.endFrequency})`,
    );
    assert.ok(event.q >= 0.1 && event.q <= 10, `q range (got ${event.q})`);
    assert.ok(
      event.pan >= -0.6 && event.pan <= 0.6,
      `pan range (got ${event.pan})`,
    );
  }
}

describe("FOLEY_KINDS", () => {
  it("exports all supported kinds", () => {
    assert.deepEqual([...FOLEY_KINDS], EXPECTED_KINDS);
  });
});

describe("supported events", () => {
  for (const kind of EXPECTED_KINDS) {
    it(`${kind} returns a non-empty score`, () => {
      const events = foleyScore(kind, 1);
      assert.ok(events.length >= 1, "non-empty");
      assertValidScore(events);
    });
  }

  it("designs are distinguishable per kind", () => {
    const footstep = foleyScore("footstep", 1);
    const cloth = foleyScore("cloth", 1);
    const door = foleyScore("door", 1);
    const metal = foleyScore("metal", 1);
    const paper = foleyScore("paper", 1);
    const impact = foleyScore("impact", 1);

    // Alternating soft footsteps: two low thuds with opposite pan sides.
    const footNoises = footstep.filter((e) => e.type === "noise");
    assert.equal(footNoises.length, 2);
    assert.ok(footNoises[0].pan < 0);
    assert.ok(footNoises[1].pan > 0);

    // Cloth rustle: only noise, short high-frequency bursts.
    assert.ok(cloth.every((e) => e.type === "noise"));
    assert.ok(cloth.every((e) => e.frequency >= 2000));

    // Door latch + wood thud: starts bright, ends with low tone.
    assert.ok(door.some((e) => e.filter === "highpass"));
    assert.ok(door.some((e) => e.type === "tone" && e.frequency < 200));

    // Metal resonant partials: several bandpass tones above 500 Hz.
    const partials = metal.filter((e) => e.type === "tone");
    assert.ok(partials.length >= 3);
    assert.ok(partials.every((e) => e.frequency > 500));

    // Paper crackle: many very short bursts.
    assert.ok(paper.length >= 5);
    assert.ok(paper.every((e) => e.duration <= 0.06));

    // Impact: low thump plus brief noise.
    assert.ok(impact.some((e) => e.type === "tone" && e.frequency < 100));
    assert.ok(impact.some((e) => e.type === "noise" && e.duration <= 0.12));
  });
});

describe("determinism", () => {
  for (const kind of EXPECTED_KINDS) {
    it(`${kind} is deterministic for the same seed`, () => {
      assert.deepEqual(foleyScore(kind, 42), foleyScore(kind, 42));
    });
  }

  it("defaults seed to 1", () => {
    assert.deepEqual(foleyScore("cloth"), foleyScore("cloth", 1));
  });

  it("varies subtly with seed", () => {
    for (const kind of EXPECTED_KINDS) {
      const a = JSON.stringify(foleyScore(kind, 1));
      const b = JSON.stringify(foleyScore(kind, 999));
      assert.notEqual(a, b, `${kind} differs across seeds`);
    }
  });
});

describe("unknown kinds", () => {
  it("returns [] for unsupported names", () => {
    assert.deepEqual(foleyScore("laser", 1), []);
    assert.deepEqual(foleyScore("", 1), []);
    assert.deepEqual(foleyScore("FOOTSTEP", 1), []);
    assert.deepEqual(foleyScore("toString", 1), []);
    assert.deepEqual(foleyScore("__proto__", 1), []);
  });

  it("returns [] for non-string kinds", () => {
    assert.deepEqual(foleyScore(undefined), []);
    assert.deepEqual(foleyScore(null), []);
    assert.deepEqual(foleyScore(123), []);
  });
});

describe("limits", () => {
  it("all kinds and seeds stay within documented limits", () => {
    for (const kind of EXPECTED_KINDS) {
      for (const seed of SEEDS) {
        assertValidScore(foleyScore(kind, seed));
      }
    }
  });
});
