/**
 * vn-music.mjs — tiny procedural background music + event SFX for a browser visual novel.
 *
 * Web Audio only. No packages, network, files, or third-party melodies.
 * All patterns are original and generated deterministically per mood.
 */

import { createPlaybackContext, useMediaPlayback, resumePlayback } from './vn-media-session.mjs?v=889f2cc97573';
const MOODS = ["normal", "warm", "sad", "tense", "battle", "eerie", "memory"];

// Per-mood generative config: tempo, centre pitch, scale, and 8-bar root progression.
// Scales are semitone offsets; progressions are semitone offsets from the root.
const MOOD_CONFIG = {
  normal: { bpm: 92, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 7, 9, 5, 0, 7, 5, 4] },
  warm: { bpm: 76, root: 62, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 9, 7, 0, 5, 4, 7] },
  sad: { bpm: 66, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 8, 5, 7, 3, 8, 5, 7] },
  battle: { bpm: 152, root: 52, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 8, 10, 0, 0, 5, 7] },
  tense: { bpm: 112, root: 56, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 1, 0, 8, 0, 1, 10, 8] },
  eerie: { bpm: 60, root: 64, scale: [0, 1, 3, 5, 6, 8, 10], prog: [0, 6, 1, 8, 0, 6, 10, 1] },
  memory: { bpm: 72, root: 67, scale: [0, 2, 4, 7, 9, 12, 14], prog: [0, 9, 5, 4, 0, 9, 7, 5] },
};

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic PRNG (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestScaleTone(scale, semitone) {
  const oct = Math.floor(semitone / 12);
  const pc = ((semitone % 12) + 12) % 12;
  let best = scale[0];
  for (const s of scale) {
    if (Math.abs(s - pc) < Math.abs(best - pc)) best = s;
  }
  return oct * 12 + best;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clampVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.22;
  return Math.min(1, Math.max(0, n));
}

/**
 * Build an original deterministic 8-bar pattern for a mood.
 * Unknown moods fall back to "normal".
 * @param {string} mood
 * @returns {{mood:string,bpm:number,beatsPerBar:number,bars:Array}}
 */
export function musicPattern(mood) {
  const name = MOODS.includes(mood) ? mood : "normal";
  const cfg = MOOD_CONFIG[name];
  const rand = mulberry32(hashString(`vn-music:${name}`));
  const bars = [];

  // Melody walker state (semitone offset from root, upper octave).
  let walk = 12;

  for (let bar = 0; bar < 8; bar++) {
    const chordRoot = cfg.root + cfg.prog[bar % cfg.prog.length];
    // Triad from scale tones above the chord root: root, +2 scale steps, +4 scale steps.
    const chord = [0, 2, 4].map((step) => {
      const approx = chordRoot + step * 2;
      const rel = approx - cfg.root;
      return cfg.root + nearestScaleTone(cfg.scale, rel);
    });

    // Bass rhythm: downbeat root + syncopated fifth; sad/memory sparser.
    const bass = [{ beat: 0, midi: chordRoot - 12, dur: 0.9 }];
    if (name === "tense" || name === "battle" || name === "normal" || name === "warm") {
      bass.push({ beat: 2, midi: chordRoot - 12 + 7, dur: 0.6 });
      if (rand() < 0.5) bass.push({ beat: 3.5, midi: chordRoot - 12, dur: 0.4 });
    } else if (rand() < 0.6) {
      bass.push({ beat: 2.5, midi: chordRoot - 12 + 7, dur: 0.7 });
    }

    // Melody/arpeggio: 8 eighth-note slots with rests and chord-tone bias.
    const melody = [];
    const density = name === "battle" ? 0.92 : name === "tense" ? 0.85 : name === "eerie" ? 0.5 : 0.7;
    for (let slot = 0; slot < 8; slot++) {
      const beat = slot * 0.5;
      if (rand() > density) continue; // rest keeps phrasing breathing
      const chordTone = chord[slot % chord.length] + 12;
      let midi;
      const roll = rand();
      if (roll < 0.55) {
        midi = chordTone; // arpeggiate the chord
      } else if (roll < 0.85) {
        // stepwise walk snapped to scale
        walk += Math.floor(rand() * 5) - 2;
        walk = Math.max(7, Math.min(19, walk));
        midi = cfg.root + nearestScaleTone(cfg.scale, walk);
      } else {
        midi = chord[(slot + 1) % chord.length] + 12; // passing chord tone
      }
      melody.push({ beat, midi, dur: rand() < 0.25 ? 0.9 : 0.45 });
    }
    // Guarantee at least two melody notes per bar so it never becomes a drone.
    if (melody.length < 2) {
      melody.push(
        { beat: 0, midi: chord[0] + 12, dur: 0.45 },
        { beat: 2, midi: chord[1] + 12, dur: 0.45 },
      );
    }

    bars.push({ chord: [...chord], melody, bass });
  }

  return { mood: name, bpm: cfg.bpm, beatsPerBar: 4, bars };
}

const TICK_MS = 90;
const LOOKAHEAD = 0.25; // seconds; must stay <= 0.3

/**
 * Create a scheduler/score controller.
 * @param {() => boolean} getEnabled
 * @param {{getVolume?:()=>number, contextFactory?:()=>AudioContext}} [options]
 */
export function createScore(getEnabled, { getVolume = () => 0.22, contextFactory = createPlaybackContext } = {}) {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let timer = null;
  let currentMood = null;
  let pattern = null;
  let stepDur = 0;
  let stepIndex = 0;
  let nextNoteTime = 0;
  let disposed = false;
  const activeNodes = new Set();

  function ensureContext() {
    useMediaPlayback();
    if (ctx || disposed) return ctx;
    try { ctx = contextFactory(); } catch { return null; }
    try {
      masterGain = ctx.createGain();
      musicGain = ctx.createGain();
      const v = clampVolume(getVolume());
      if (masterGain.gain) masterGain.gain.value = v;
      if (musicGain.gain) musicGain.gain.value = 0.8;
      if (masterGain.connect && ctx.destination) masterGain.connect(ctx.destination);
      if (musicGain.connect && masterGain) musicGain.connect(masterGain);
    } catch {
      // Fake/minimal contexts in tests may not support full graph; keep going.
    }
    return ctx;
  }

  function track(node) {
    activeNodes.add(node);
    return node;
  }

  function untrack(node) {
    activeNodes.delete(node);
  }

  function stopAllNodes() {
    for (const n of [...activeNodes]) {
      try {
        if (n.stop) n.stop((ctx?.currentTime || 0) + 0.1);
      } catch {
        /* already stopped */
      }
      try {
        // Oscillator onended disconnects its gain after the short fade.
      } catch {
        /* ignore */
      }
      activeNodes.delete(n);
    }
  }

  function playTone({ freq, time, dur, type = "triangle", peak = 0.2, dest = null }) {
    if (!ctx) return;
    try {
      const osc = track(ctx.createOscillator());
      const g = track(ctx.createGain());
      osc.type = type;
      if (osc.frequency && osc.frequency.setValueAtTime) osc.frequency.setValueAtTime(freq, time);
      else if (osc.frequency) osc.frequency.value = freq;
      const out = dest || musicGain;
      if (g.gain && g.gain.setValueAtTime) {
        const p = Math.max(0.0001, peak);
        g.gain.setValueAtTime(0.0001, time);
        if (g.gain.linearRampToValueAtTime) g.gain.linearRampToValueAtTime(p, time + 0.02);
        else g.gain.value = p;
        if (g.gain.exponentialRampToValueAtTime) g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      } else if (g.gain) {
        g.gain.value = peak;
      }
      if (osc.connect) osc.connect(g);
      if (g.connect && out) g.connect(out);
      else if (g.connect && ctx.destination) g.connect(ctx.destination);
      osc.onended = () => {
        osc.disconnect(); g.disconnect();
        untrack(osc);
        untrack(g);
      };
      osc.start(time);
      osc.stop(time + dur + 0.05);
    } catch {
      /* best effort on minimal contexts */
    }
  }

  // Flatten pattern into 8th-note step slots: 8 bars * 4 beats * 2 = 64 steps.
  function buildSteps(pat) {
    const steps = Array.from({ length: 64 }, () => ({ melody: [], bass: [], chord: [] }));
    pat.bars.forEach((bar, b) => {
      for (const n of bar.melody) {
        const idx = b * 8 + Math.round(n.beat * 2);
        if (steps[idx]) steps[idx].melody.push(n);
      }
      for (const n of bar.bass) {
        const idx = b * 8 + Math.round(n.beat * 2);
        if (steps[idx]) steps[idx].bass.push(n);
      }
      // Chord stab on the downbeat of each bar.
      steps[b * 8].chord.push(...bar.chord);
    });
    return steps;
  }

  let steps = [];

  function scheduleStep(idx, time) {
    const slot = steps[idx % steps.length];
    if (!slot) return;
    const vol = clampVolume(getVolume());
    const beatSec = 60 / pattern.bpm;
    for (const m of slot.chord) {
      playTone({ freq: midiToFreq(m), time, dur: beatSec * 1.8, type: "sine", peak: 0.05 * (0.4 + vol) });
    }
    if (pattern.mood === "battle" && idx % 2 === 0) playTone({ freq: 62, time, dur: 0.11, type: "sine", peak: 0.26 * (0.4 + vol) });
    for (const b of slot.bass) {
      playTone({ freq: midiToFreq(b.midi), time, dur: beatSec * 0.9, type: "sine", peak: 0.22 * (0.4 + vol) });
    }
    for (const m of slot.melody) {
      playTone({ freq: midiToFreq(m.midi), time, dur: beatSec * 0.45, type: "triangle", peak: 0.16 * (0.4 + vol) });
    }
  }

  function tick() {
    if (!ctx || !pattern || timer === null) return;
    if (!getEnabled()) { stop(); return; }
    try {
      // A suspended/background tab must not play every missed note at once.
      if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.02;
      masterGain.gain.setTargetAtTime(clampVolume(getVolume()), ctx.currentTime, 0.08);
      if (musicGain && musicGain.gain) {
        const v = clampVolume(getVolume());
        if (musicGain.gain.setTargetAtTime) musicGain.gain.setTargetAtTime(0.8 * (0.3 + v), ctx.currentTime, 0.1);
        else musicGain.gain.value = 0.8;
      }
      while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(stepIndex, nextNoteTime);
        nextNoteTime += stepDur;
        stepIndex = (stepIndex + 1) % steps.length;
      }
    } catch {
      /* keep timer alive on transient errors */
    }
  }

  function startTimer() {
    if (timer !== null) return;
    timer = globalThis.setInterval(tick, TICK_MS);
  }

  function clearTimer() {
    if (timer !== null) {
      globalThis.clearInterval(timer);
      timer = null;
    }
  }

  function silence(fadeTime = 0.08) {
    try {
      if (musicGain && musicGain.gain && ctx) {
        if (musicGain.gain.setTargetAtTime) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, fadeTime);
        else musicGain.gain.value = 0.0001;
      }
      if (masterGain && masterGain.gain && ctx) {
        if (masterGain.gain.setTargetAtTime) masterGain.gain.setTargetAtTime(0.0001, ctx.currentTime, fadeTime);
      }
    } catch {
      /* ignore */
    }
    stopAllNodes();
  }

  function update(mood) {
    if (disposed) return;
    if (!getEnabled()) {
      // Disabled: never create a context or timers.
      clearTimer();
      if (ctx) silence();
      currentMood = null;
      return;
    }
    if (mood === 'silence') {
      clearTimer(); pattern = null;
      // Fade the music bus only. Environmental sound, voice and event SFX remain independent.
      if (currentMood !== 'silence' && musicGain?.gain && ctx) {
        if (musicGain.gain.setTargetAtTime) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, .6);
        else musicGain.gain.value = 0.0001;
      }
      currentMood = 'silence'; return;
    }
    const name = MOODS.includes(mood) ? mood : "normal";
    if (name === currentMood && timer !== null) return; // no duplicate looping
    currentMood = name;
    pattern = musicPattern(name);
    steps = buildSteps(pattern);
    stepDur = 60 / pattern.bpm / 2; // 8th notes
    ensureContext();
    if (!ctx) return;
    try {
      const v = clampVolume(getVolume());
      if (masterGain && masterGain.gain) {
        if (masterGain.gain.setTargetAtTime) masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
        else if (masterGain.gain.setValueAtTime) masterGain.gain.setValueAtTime(v, ctx.currentTime);
        else masterGain.gain.value = v;
      }
    } catch {
      /* ignore */
    }
    stepIndex = 0;
    nextNoteTime = ctx.currentTime + 0.06;
    startTimer();
  }

  function resume() {
    if (disposed) return Promise.resolve();
    if (!getEnabled()) return Promise.resolve();
    if (currentMood && pattern) {
      ensureContext();
      if (!ctx) return Promise.resolve();
      if (timer === null) {
        stepIndex = 0;
        nextNoteTime = ctx.currentTime + 0.06;
        startTimer();
      }
    } else {
      ensureContext();
    }
    try {
      return resumePlayback(ctx).catch(() => {});
    } catch {
      /* ignore */
    }
    return Promise.resolve();
  }

  function stop() {
    clearTimer();
    if (ctx) silence();
    currentMood = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimer();
    if (ctx) silence(0.03);
    stopAllNodes();
    const c = ctx;
    ctx = null;
    masterGain = null;
    musicGain = null;
    currentMood = null;
    pattern = null;
    try {
      if (c && c.close) c.close();
    } catch {
      /* ignore */
    }
  }

  function effect(kind) {
    if (disposed) return false;
    if (!getEnabled()) return false; // disabled: no context, no sound
    if (kind !== "impact" && kind !== "swish" && kind !== "door") return false;
    ensureContext();
    if (!ctx) return false;
    try {
      void resumePlayback(ctx).catch(() => {});
    } catch {
      /* ignore */
    }
    const vol = clampVolume(getVolume());
    const t = ctx.currentTime || 0;
    try {
      if (kind === "impact") {
        playTone({ freq: 120, time: t, dur: 0.35, type: "sine", peak: 0.5 * (0.3 + vol), dest: masterGain });
        playTone({ freq: 55, time: t, dur: 0.4, type: "triangle", peak: 0.4 * (0.3 + vol), dest: masterGain });
      } else if (kind === "swish") {
        // Rising whistle made of two quick oscillators (no noise buffer needed).
        playTone({ freq: 900, time: t, dur: 0.12, type: "sine", peak: 0.18 * (0.3 + vol), dest: masterGain });
        playTone({ freq: 1600, time: t + 0.09, dur: 0.16, type: "sine", peak: 0.15 * (0.3 + vol), dest: masterGain });
      } else {
        // door: wooden two-tone knock
        playTone({ freq: 220, time: t, dur: 0.12, type: "square", peak: 0.2 * (0.3 + vol), dest: masterGain });
        playTone({ freq: 174, time: t + 0.14, dur: 0.18, type: "square", peak: 0.2 * (0.3 + vol), dest: masterGain });
      }
      return true;
    } catch {
      return false;
    }
  }

  return { update, resume, stop, dispose, effect };
}
