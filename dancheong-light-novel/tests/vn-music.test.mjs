import test from "node:test";
import assert from "node:assert/strict";
import { musicPattern, createScore } from "../public/vn-music.mjs";

const MOODS = ["normal", "warm", "sad", "tense", "eerie", "memory"];

// --- Minimal fake Web Audio context ---------------------------------------

function makeFakeOsc(ctx) {
  return {
    type: "",
    frequency: {
      value: 0,
      calls: [],
      setValueAtTime(v, t) {
        this.value = v;
        this.calls.push([v, t]);
      },
    },
    startedAt: null,
    stoppedAt: null,
    onended: null,
    connect() {},
    disconnect() {},
    start(t) {
      this.startedAt = t;
      ctx.starts.push(t);
    },
    stop(t) {
      this.stoppedAt = t;
    },
  };
}

function makeFakeGain() {
  return {
    gain: {
      value: 0.5,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
    },
    connect() {},
    disconnect() {},
  };
}

function makeFakeContext() {
  const ctx = {
    currentTime: 100,
    state: "running",
    destination: {},
    starts: [],
    oscs: [],
    resumed: 0,
    closed: 0,
    createOscillator() {
      const o = makeFakeOsc(ctx);
      ctx.oscs.push(o);
      return o;
    },
    createGain() {
      return makeFakeGain();
    },
    resume() {
      ctx.resumed++;
      ctx.state = "running";
      return Promise.resolve();
    },
    close() {
      ctx.closed++;
      return Promise.resolve();
    },
  };
  return ctx;
}

// Fake timer harness: capture the single interval callback.
function withFakeTimers(fn) {
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  let nextId = 1;
  const live = new Map();
  globalThis.setInterval = (cb) => {
    const id = nextId++;
    live.set(id, cb);
    return id;
  };
  globalThis.clearInterval = (id) => {
    live.delete(id);
  };
  try {
    return fn(live);
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
}

// --- Pure pattern tests ----------------------------------------------------

test("patterns: 8 bars with bpm, chords, melody and bass for every mood", () => {
  for (const mood of MOODS) {
    const p = musicPattern(mood);
    assert.equal(p.mood, mood);
    assert.ok(p.bpm >= 40 && p.bpm <= 160, `${mood} bpm ${p.bpm}`);
    assert.equal(p.bars.length, 8);
    let melodyNotes = 0;
    const pitches = new Set();
    for (const bar of p.bars) {
      assert.ok(bar.chord.length >= 3, "chord triad");
      assert.ok(bar.bass.length >= 1, "bass rhythm");
      assert.ok(bar.melody.length >= 2, "melody never a drone");
      for (const n of bar.melody) {
        melodyNotes++;
        pitches.add(n.midi);
        assert.ok(n.midi >= 21 && n.midi <= 108);
      }
    }
    assert.ok(melodyNotes >= 16, "gentle melody across 8 bars");
    assert.ok(pitches.size >= 4, "melody moves, not a constant drone");
  }
});

test("patterns: deterministic and distinct per mood; unknown falls back", () => {
  const a = musicPattern("warm");
  const b = musicPattern("warm");
  assert.deepEqual(a, b);
  assert.notDeepEqual(musicPattern("sad"), musicPattern("tense"));
  const fallback = musicPattern("nope");
  assert.equal(fallback.mood, "normal");
  assert.equal(fallback.bars.length, 8);
});

// --- Scheduler tests --------------------------------------------------------

test('silent direction stops the score scheduler, keeps SFX available and cannot resume by a tap', () => {
  withFakeTimers(live => {
    const ctx = makeFakeContext(), score = createScore(() => true, { contextFactory: () => ctx });
    score.update('normal'); assert.equal(live.size, 1);
    score.update('silence'); assert.equal(live.size, 0);
    void score.resume(); assert.equal(live.size, 0);
    const before = ctx.starts.length;
    assert.equal(score.effect('impact'), true); assert.ok(ctx.starts.length > before);
    score.update('warm'); assert.equal(live.size, 1); score.dispose();
  });
});

test("disabled: no context, no timers, no effects", () => {
  withFakeTimers((live) => {
    let created = 0;
    const score = createScore(() => false, {
      getVolume: () => 0.2,
      contextFactory: () => {
        created++;
        return makeFakeContext();
      },
    });
    score.update("warm");
    assert.equal(created, 0);
    assert.equal(live.size, 0);
    assert.equal(score.effect("impact"), false);
    assert.equal(created, 0);
    score.stop();
    score.dispose();
  });
});

test("scheduler uses one timer, no duplicates, schedules <=0.3s ahead", () => {
  withFakeTimers((live) => {
    const ctx = makeFakeContext();
    const score = createScore(() => true, {
      getVolume: () => 0.2,
      contextFactory: () => ctx,
    });
    score.update("normal");
    assert.equal(live.size, 1);
    const [cb] = [...live.values()];
    score.update("normal");
    assert.equal(live.size, 1, "repeated update must not loop twice");
    score.update("sad");
    assert.equal(live.size, 1, "mood switch keeps a single timer");

    ctx.starts.length = 0;
    ctx.currentTime = 200;
    cb(); // run one scheduler tick
    assert.ok(ctx.starts.length > 0, "tick schedules notes");
    for (const t of ctx.starts) {
      assert.ok(t - 200 <= 0.31, `scheduled ${t} within 0.3s lookahead`);
    }

    score.stop();
    assert.equal(live.size, 0);
    score.stop(); // idempotent
    assert.equal(live.size, 0);
    score.dispose();
  });
});

test("stop/dispose idempotent; effects respect enabled/volume", () => {
  withFakeTimers((live) => {
    let enabled = true;
    let created = 0;
    const ctx = makeFakeContext();
    const score = createScore(() => enabled, {
      getVolume: () => 0.25,
      contextFactory: () => {
        created++;
        return ctx;
      },
    });
    score.update("memory");
    assert.equal(created, 1);
    assert.equal(score.effect("swish"), true);
    assert.equal(score.effect("door"), true);
    assert.equal(score.effect("bogus"), false);
    enabled = false;
    const before = ctx.oscs.length;
    assert.equal(score.effect("impact"), false, "disabled effect stays silent");
    assert.equal(ctx.oscs.length, before, "disabled effect creates nothing");
    score.dispose();
    assert.equal(ctx.closed, 1);
    score.dispose(); // idempotent
    assert.equal(ctx.closed, 1);
    assert.equal(live.size, 0);
  });
});
