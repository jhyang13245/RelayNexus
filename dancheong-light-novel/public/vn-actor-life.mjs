// Small signs of life for standing sprites, without any image generation:
// irregular blinks (sometimes a double blink), a mouth that follows the
// actual voice level, and a per-person breathing phase so a line-up never
// breathes in unison. Pure timing; the shell swaps the prepared frames.

function seeded(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
export const BLINK_MS = 130;

// Blink schedule per person: gaps of 2.4–6.4 s, 16% of blinks are doubles.
export function createBlinker(id, { now = 0 } = {}) {
  const random = seeded(id);
  let next = now + 900 + random() * 2600, second = 0;
  return {
    closed(time) {
      if (second && time >= second && time < second + BLINK_MS) return true;
      if (time < next) return false;
      if (time < next + BLINK_MS) return true;
      // After a pause (hidden tab) resume from now instead of catching up.
      const base = Math.max(next + BLINK_MS, time);
      second = random() < 0.16 ? base + 110 : 0;
      next = (second || base) + 2400 + random() * 4000;
      return second ? time >= second && time < second + BLINK_MS : false;
    },
  };
}

// Mouth from the playing voice: open above 0.32, shut below 0.18 (hysteresis),
// each state held at least 70 ms so it reads as syllables, not flicker. With
// no level (plain <audio> fallback) or while text is typed without a voice,
// fall back to a steady 160 ms flap.
export function createMouth() {
  let open = false, since = -Infinity;
  return {
    update(time, { level = 0, speaking = false } = {}) {
      if (!speaking) { open = false; since = time; return false; }
      if (level === null) return Math.floor(time / 160) % 2 === 1;
      const want = open ? level > 0.18 : level > 0.32;
      if (want !== open && time - since >= 70) { open = want; since = time; }
      return open;
    },
  };
}

// A stable breathing phase (seconds, negative = already in progress).
export function breathDelay(id, period = 4.6) {
  return -(seeded(`breath:${id}`)() * period);
}
