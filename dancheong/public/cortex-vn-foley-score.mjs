// foley-score.mjs
// Pure deterministic foley synthesis-event score helper. No dependencies,
// no network, no audio APIs. Returns plain data only.

export const FOLEY_KINDS = Object.freeze([
  "footstep",
  "cloth",
  "door",
  "metal",
  "paper",
  "impact",
]);

const MIN_FREQ = 40;
const MAX_FREQ = 10000;
const MAX_GAIN = 0.18;
const MAX_TIME = 1.5;

function toUint32(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.floor(seed) >>> 0;
  }
  if (typeof seed === "string") {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  if (typeof seed === "bigint") {
    return Number(seed & 0xffffffffn) >>> 0;
  }
  return 1 >>> 0;
}

// Small deterministic PRNG (mulberry32).
function mulberry32(state) {
  let a = state >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function sanitizeEvent(event) {
  const type = event.type === "tone" ? "tone" : "noise";
  const filter =
    event.filter === "highpass" || event.filter === "bandpass"
      ? event.filter
      : "lowpass";
  const at = round4(clamp(event.at, 0, MAX_TIME));
  const maxDuration = Math.max(0.005, MAX_TIME - at);
  const duration = round4(clamp(event.duration, 0.005, maxDuration));
  return {
    type,
    at,
    duration,
    gain: round4(clamp(event.gain, 0, MAX_GAIN)),
    frequency: round4(clamp(event.frequency, MIN_FREQ, MAX_FREQ)),
    endFrequency: round4(clamp(event.endFrequency, MIN_FREQ, MAX_FREQ)),
    filter,
    q: round4(clamp(event.q, 0.1, 10)),
    pan: round4(clamp(event.pan, -0.6, 0.6)),
  };
}

function applyVariation(baseEvents, rand) {
  return baseEvents.map((event) => {
    const spread = () => rand() * 2 - 1;
    return sanitizeEvent({
      ...event,
      at: event.at + spread() * 0.008,
      duration: event.duration + spread() * 0.008,
      gain: event.gain + spread() * 0.012,
      frequency: event.frequency + spread() * 18,
      endFrequency: event.endFrequency + spread() * 14,
      q: event.q + spread() * 0.12,
      pan: event.pan + spread() * 0.05,
    });
  });
}

function footstepBase() {
  return [
    {
      type: "noise",
      at: 0,
      duration: 0.11,
      gain: 0.14,
      frequency: 320,
      endFrequency: 140,
      filter: "lowpass",
      q: 0.8,
      pan: -0.15,
    },
    {
      type: "tone",
      at: 0.005,
      duration: 0.09,
      gain: 0.1,
      frequency: 95,
      endFrequency: 55,
      filter: "lowpass",
      q: 1.2,
      pan: -0.15,
    },
    {
      type: "noise",
      at: 0.34,
      duration: 0.11,
      gain: 0.13,
      frequency: 280,
      endFrequency: 130,
      filter: "lowpass",
      q: 0.8,
      pan: 0.15,
    },
    {
      type: "tone",
      at: 0.345,
      duration: 0.09,
      gain: 0.09,
      frequency: 82,
      endFrequency: 48,
      filter: "lowpass",
      q: 1.2,
      pan: 0.15,
    },
  ];
}

function clothBase() {
  return [
    {
      type: "noise",
      at: 0,
      duration: 0.09,
      gain: 0.07,
      frequency: 3200,
      endFrequency: 2200,
      filter: "bandpass",
      q: 1.5,
      pan: -0.2,
    },
    {
      type: "noise",
      at: 0.09,
      duration: 0.07,
      gain: 0.09,
      frequency: 4100,
      endFrequency: 5200,
      filter: "highpass",
      q: 0.9,
      pan: 0.1,
    },
    {
      type: "noise",
      at: 0.19,
      duration: 0.1,
      gain: 0.06,
      frequency: 2700,
      endFrequency: 3600,
      filter: "bandpass",
      q: 2.2,
      pan: -0.05,
    },
    {
      type: "noise",
      at: 0.31,
      duration: 0.08,
      gain: 0.08,
      frequency: 5200,
      endFrequency: 3800,
      filter: "highpass",
      q: 1.1,
      pan: 0.25,
    },
  ];
}

function doorBase() {
  return [
    {
      type: "noise",
      at: 0,
      duration: 0.035,
      gain: 0.1,
      frequency: 2400,
      endFrequency: 1600,
      filter: "highpass",
      q: 1.0,
      pan: -0.1,
    },
    {
      type: "noise",
      at: 0.06,
      duration: 0.07,
      gain: 0.12,
      frequency: 950,
      endFrequency: 600,
      filter: "bandpass",
      q: 2.5,
      pan: -0.05,
    },
    {
      type: "noise",
      at: 0.16,
      duration: 0.22,
      gain: 0.16,
      frequency: 260,
      endFrequency: 120,
      filter: "lowpass",
      q: 0.7,
      pan: 0.05,
    },
    {
      type: "tone",
      at: 0.16,
      duration: 0.26,
      gain: 0.13,
      frequency: 115,
      endFrequency: 62,
      filter: "lowpass",
      q: 1.4,
      pan: 0,
    },
  ];
}

function metalBase() {
  return [
    {
      type: "noise",
      at: 0,
      duration: 0.05,
      gain: 0.11,
      frequency: 3800,
      endFrequency: 2000,
      filter: "highpass",
      q: 0.8,
      pan: 0,
    },
    {
      type: "tone",
      at: 0.005,
      duration: 0.9,
      gain: 0.1,
      frequency: 622,
      endFrequency: 608,
      filter: "bandpass",
      q: 6,
      pan: -0.25,
    },
    {
      type: "tone",
      at: 0.005,
      duration: 0.75,
      gain: 0.08,
      frequency: 941,
      endFrequency: 918,
      filter: "bandpass",
      q: 7,
      pan: 0.2,
    },
    {
      type: "tone",
      at: 0.005,
      duration: 0.6,
      gain: 0.06,
      frequency: 1447,
      endFrequency: 1410,
      filter: "bandpass",
      q: 8,
      pan: -0.1,
    },
    {
      type: "tone",
      at: 0.005,
      duration: 0.45,
      gain: 0.05,
      frequency: 2133,
      endFrequency: 2075,
      filter: "bandpass",
      q: 5,
      pan: 0.3,
    },
  ];
}

function paperBase() {
  return [
    {
      type: "noise",
      at: 0,
      duration: 0.03,
      gain: 0.09,
      frequency: 4200,
      endFrequency: 5200,
      filter: "highpass",
      q: 1.2,
      pan: -0.2,
    },
    {
      type: "noise",
      at: 0.05,
      duration: 0.025,
      gain: 0.07,
      frequency: 5800,
      endFrequency: 4400,
      filter: "bandpass",
      q: 1.8,
      pan: 0.15,
    },
    {
      type: "noise",
      at: 0.11,
      duration: 0.04,
      gain: 0.11,
      frequency: 3600,
      endFrequency: 4800,
      filter: "highpass",
      q: 1.0,
      pan: -0.1,
    },
    {
      type: "noise",
      at: 0.18,
      duration: 0.028,
      gain: 0.06,
      frequency: 6700,
      endFrequency: 5600,
      filter: "bandpass",
      q: 2.0,
      pan: 0.2,
    },
    {
      type: "noise",
      at: 0.26,
      duration: 0.035,
      gain: 0.1,
      frequency: 5100,
      endFrequency: 6200,
      filter: "highpass",
      q: 1.4,
      pan: 0,
    },
    {
      type: "noise",
      at: 0.33,
      duration: 0.03,
      gain: 0.08,
      frequency: 4400,
      endFrequency: 3800,
      filter: "bandpass",
      q: 1.6,
      pan: -0.25,
    },
  ];
}

function impactBase() {
  return [
    {
      type: "tone",
      at: 0,
      duration: 0.45,
      gain: 0.18,
      frequency: 78,
      endFrequency: 44,
      filter: "lowpass",
      q: 0.9,
      pan: 0,
    },
    {
      type: "noise",
      at: 0,
      duration: 0.09,
      gain: 0.14,
      frequency: 900,
      endFrequency: 250,
      filter: "lowpass",
      q: 0.7,
      pan: 0.05,
    },
    {
      type: "noise",
      at: 0.12,
      duration: 0.25,
      gain: 0.06,
      frequency: 300,
      endFrequency: 120,
      filter: "lowpass",
      q: 0.6,
      pan: -0.05,
    },
  ];
}

const BASE_BUILDERS = {
  footstep: footstepBase,
  cloth: clothBase,
  door: doorBase,
  metal: metalBase,
  paper: paperBase,
  impact: impactBase,
};

export function foleyScore(kind, seed = 1) {
  const builder = BASE_BUILDERS[kind];
  if (typeof kind !== "string" || !Object.hasOwn(BASE_BUILDERS, kind)) return [];
  const rand = mulberry32(toUint32(seed));
  return applyVariation(builder(), rand).slice(0, 12);
}
