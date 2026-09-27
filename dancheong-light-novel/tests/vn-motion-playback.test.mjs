import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { motionFrameFor } from "../public/vn-motion-playback.mjs";

const SOURCE = "portrait-a.png";
const BASE = "a-base.png";
const BLINK = "a-blink.png";
const TALK = "a-talk.png";
const BOTH = "a-both.png";

function fullFrames(overrides = {}) {
  return {
    source: SOURCE,
    base: BASE,
    blink: BLINK,
    talk: TALK,
    both: BOTH,
    ...overrides,
  };
}

function args(overrides = {}) {
  return {
    source: SOURCE,
    readySource: SOURCE,
    frames: fullFrames(),
    enabled: true,
    blink: false,
    mouth: false,
    ...overrides,
  };
}

describe("motionFrameFor guards (stale source prevention)", () => {
  it("returns empty string when source is empty", () => {
    assert.equal(motionFrameFor(args({ source: "" })), "");
  });

  it("returns empty string when source is missing or not a string", () => {
    assert.equal(motionFrameFor(args({ source: undefined })), "");
    assert.equal(motionFrameFor(args({ source: null })), "");
    assert.equal(motionFrameFor(args({ source: 42 })), "");
  });

  it("returns empty string when readySource differs from source", () => {
    assert.equal(
      motionFrameFor(args({ source: "b.png", readySource: "a.png" })),
      "",
    );
  });

  it("returns empty string when readySource is missing", () => {
    assert.equal(motionFrameFor(args({ readySource: undefined })), "");
  });

  it("returns empty string when frames.source differs (stale bundle after switch)", () => {
    const frames = fullFrames({ source: "old-portrait.png" });
    assert.equal(motionFrameFor(args({ source: SOURCE, frames })), "");
  });

  it("returns empty string on source switch: new source with old frames", () => {
    // User switched from A to B; old A frames must not paint over B.
    assert.equal(
      motionFrameFor({
        source: "b.png",
        readySource: "b.png",
        frames: {
          source: "a.png",
          base: "a-base.png",
          blink: "a-blink.png",
          talk: "a-talk.png",
          both: "a-both.png",
        },
        enabled: true,
        blink: true,
        mouth: true,
      }),
      "",
    );
  });

  it("returns empty string on source switch: ready image still loading old portrait", () => {
    assert.equal(
      motionFrameFor({
        source: "b.png",
        readySource: "a.png",
        frames: {
          source: "b.png",
          base: "b-base.png",
        },
        enabled: false,
        blink: false,
        mouth: false,
      }),
      "",
    );
  });

  it("returns empty string when frames is missing safely (no throw)", () => {
    assert.equal(motionFrameFor(args({ frames: undefined })), "");
    assert.equal(motionFrameFor(args({ frames: null })), "");
    assert.equal(motionFrameFor(args({ frames: "nope" })), "");
    assert.equal(motionFrameFor({}), "");
    assert.equal(motionFrameFor(), "");
  });

  it("returns empty string when frames.base is missing, empty, or not a string", () => {
    assert.equal(motionFrameFor(args({ frames: fullFrames({ base: undefined }) })), "");
    assert.equal(motionFrameFor(args({ frames: fullFrames({ base: "" }) })), "");
    assert.equal(motionFrameFor(args({ frames: fullFrames({ base: 123 }) })), "");
    assert.equal(motionFrameFor(args({ frames: fullFrames({ base: null }) })), "");
    assert.equal(
      motionFrameFor(args({ frames: fullFrames({ base: { url: BASE } }) })),
      "",
    );
    assert.equal(
      motionFrameFor(args({ frames: { source: SOURCE } })),
      "",
    );
  });
});

describe("motionFrameFor frame selection", () => {
  it("returns base when disabled, even during blink/talk phases", () => {
    assert.equal(
      motionFrameFor(args({ enabled: false, blink: true, mouth: true })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ enabled: false, blink: true, mouth: false })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ enabled: false, blink: false, mouth: true })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ enabled: false, blink: false, mouth: false })),
      BASE,
    );
  });

  it("returns base when enabled but neither blink nor mouth", () => {
    assert.equal(
      motionFrameFor(args({ enabled: true, blink: false, mouth: false })),
      BASE,
    );
  });

  it("blink only uses frames.blink or falls back to base", () => {
    assert.equal(
      motionFrameFor(args({ blink: true, mouth: false })),
      BLINK,
    );
    assert.equal(
      motionFrameFor(
        args({ frames: fullFrames({ blink: undefined }), blink: true, mouth: false }),
      ),
      BASE,
    );
    assert.equal(
      motionFrameFor(
        args({ frames: fullFrames({ blink: "" }), blink: true, mouth: false }),
      ),
      BASE,
    );
  });

  it("mouth only uses frames.talk or falls back to base", () => {
    assert.equal(
      motionFrameFor(args({ blink: false, mouth: true })),
      TALK,
    );
    assert.equal(
      motionFrameFor(
        args({ frames: fullFrames({ talk: undefined }), blink: false, mouth: true }),
      ),
      BASE,
    );
    assert.equal(
      motionFrameFor(
        args({ frames: fullFrames({ talk: "" }), blink: false, mouth: true }),
      ),
      BASE,
    );
  });

  it("simultaneous blink+talk prefers both, then blink, then talk, then base", () => {
    assert.equal(
      motionFrameFor(args({ blink: true, mouth: true })),
      BOTH,
    );
    assert.equal(
      motionFrameFor(
        args({
          frames: fullFrames({ both: undefined }),
          blink: true,
          mouth: true,
        }),
      ),
      BLINK,
    );
    assert.equal(
      motionFrameFor(
        args({
          frames: fullFrames({ both: "", blink: BLINK }),
          blink: true,
          mouth: true,
        }),
      ),
      BLINK,
    );
    assert.equal(
      motionFrameFor(
        args({
          frames: fullFrames({ both: undefined, blink: undefined }),
          blink: true,
          mouth: true,
        }),
      ),
      TALK,
    );
    assert.equal(
      motionFrameFor(
        args({
          frames: fullFrames({ both: undefined, blink: "", talk: TALK }),
          blink: true,
          mouth: true,
        }),
      ),
      TALK,
    );
    assert.equal(
      motionFrameFor(
        args({
          frames: fullFrames({ both: undefined, blink: undefined, talk: undefined }),
          blink: true,
          mouth: true,
        }),
      ),
      BASE,
    );
  });

  it("only returns nonempty string URLs, never arbitrary value types", () => {
    const frames = fullFrames({ both: 42, blink: { url: BLINK }, talk: ["x"] });
    assert.equal(
      motionFrameFor(args({ frames, blink: true, mouth: true })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ frames, blink: true, mouth: false })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ frames, blink: false, mouth: true })),
      BASE,
    );
    const numericBase = fullFrames({ base: 7 });
    assert.equal(motionFrameFor(args({ frames: numericBase })), "");
  });

  it("treats truthy/falsy blink/mouth flags normally", () => {
    assert.equal(
      motionFrameFor(args({ blink: 1, mouth: 0 })),
      BLINK,
    );
    assert.equal(
      motionFrameFor(args({ blink: 0, mouth: 1 })),
      TALK,
    );
    assert.equal(
      motionFrameFor(args({ blink: 1, mouth: 1 })),
      BOTH,
    );
  });

  it("minimal valid bundle with only source+base returns base", () => {
    const frames = { source: SOURCE, base: BASE };
    assert.equal(motionFrameFor(args({ frames })), BASE);
    assert.equal(
      motionFrameFor(args({ frames, blink: true, mouth: false })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ frames, blink: false, mouth: true })),
      BASE,
    );
    assert.equal(
      motionFrameFor(args({ frames, blink: true, mouth: true })),
      BASE,
    );
  });
});
