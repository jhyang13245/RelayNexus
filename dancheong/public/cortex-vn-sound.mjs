import {leitmotif} from './cortex-vn-stagecraft.mjs';
// Stage sound: short synthesized stingers and character motifs on the music
// bus, music ducking for direction moments, and recorded CC0 foley samples
// (public/vn-sfx, listed in its manifest) with the procedural foley as the
// fallback. No paid generation, remote audio or credentials.
const midiHz = midi => 440 * Math.pow(2, (midi - 69) / 12);

export function createDuck({ now = () => performance.now() } = {}) {
  let until = 0, depth = 1, releaseMs = 700;
  return {
    duck(level = .35, ms = 1200, release = 700) { const t = now(); depth = t >= until ? level : Math.min(depth, level); until = Math.max(until, t + ms); releaseMs = release; },
    // Multiplier for music volume getters (polled by both music engines).
    level() {
      const t = now();
      if (t < until) return depth;
      const fade = (t - until) / releaseMs;
      if (fade >= 1) { depth = 1; return 1; }
      return depth + (1 - depth) * fade;
    },
    reset() { until = 0; depth = 1; },
  };
}

export function createStageSound({ createContext, musicEnabled = () => false, sfxEnabled = () => false, volume = () => .5, speaking = () => false, duck = createDuck() } = {}) {
  let context, noise;
  const live = new Set();
  function ready() {
    try { context ||= createContext(); } catch { return null; }
    return context.state === 'running' ? context : null;
  }
  function noiseBuffer(ctx) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate); let s = 911;
    const data = noise.getChannelData(0); for (let i = 0; i < data.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; data[i] = s / 4294967296 * 2 - 1; }
    return noise;
  }
  function voice(ctx, out, { type = 'sine', freq, to = freq, at, attack = .01, hold = 0, decay = .6, peak = .2, detune = 0 }) {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), end = at + attack + hold + decay;
    osc.type = type; osc.detune.value = detune; osc.frequency.setValueAtTime(freq, at); if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), end);
    gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(peak, at + attack); gain.gain.setValueAtTime(peak, at + attack + hold); gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain); gain.connect(out); live.add(osc); osc.onended = () => { live.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(at); osc.stop(end + .02);
  }
  function hiss(ctx, out, { at, from = 4000, to = 300, q = 1.2, decay = .8, peak = .2, type = 'bandpass' }) {
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), end = at + decay;
    src.buffer = noiseBuffer(ctx); filter.type = type; filter.Q.value = q; filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), end);
    gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(peak, at + .015); gain.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(filter); filter.connect(gain); gain.connect(out); live.add(src); src.onended = () => { live.delete(src); src.disconnect(); filter.disconnect(); gain.disconnect(); };
    src.start(at); src.stop(end + .02);
  }
  function bus(ctx, level) {
    const gain = ctx.createGain(); gain.gain.value = level; gain.connect(ctx.destination);
    setTimeout(() => { try { gain.disconnect(); } catch { /* detached */ } }, 6000);
    return gain;
  }
  const musicLevel = () => Math.max(0, Math.min(1, volume())) * (speaking() ? .45 : 1);
  return {
    duck,
    resume() { if (!musicEnabled() && !sfxEnabled()) return; try { context ||= createContext(); void context.resume().catch(() => {}); } catch { /* unavailable */ } },
    stinger(kind) {
      if (!musicEnabled()) return false;
      const ctx = ready(); if (!ctx) return false;
      const out = bus(ctx, .55 * musicLevel()), t = ctx.currentTime + .01;
      duck.duck(.3, kind === 'shock' ? 1400 : 2000, 900);
      if (kind === 'shock') {
        for (const m of [36, 37, 43]) voice(ctx, out, { type:'sawtooth', freq:midiHz(m), at:t, attack:.006, decay:1.3, peak:.12 });
        hiss(ctx, out, { at:t, from:2600, to:120, decay:.9, peak:.28 });
        for (const d of [-14, 0, 13]) voice(ctx, out, { type:'sawtooth', freq:1760, to:1660, at:t + .02, attack:.02, hold:.25, decay:.5, peak:.03, detune:d });
      } else if (kind === 'reveal') {
        [0, 4, 7, 11, 14, 19].forEach((step, i) => voice(ctx, out, { freq:midiHz(64 + step), at:t + i * .07, attack:.01, decay:1.6, peak:.07 }));
        for (const m of [52, 59, 64, 68]) voice(ctx, out, { type:'triangle', freq:midiHz(m), at:t, attack:.5, hold:.4, decay:1.2, peak:.05 });
      } else if (kind === 'sorrow') {
        for (const m of [45, 57, 60, 64]) voice(ctx, out, { type:'triangle', freq:midiHz(m), at:t, attack:.012, decay:2.6, peak:.09 });
        voice(ctx, out, { freq:midiHz(72), at:t + .45, attack:.02, decay:1.8, peak:.05 });
      } else if (kind === 'resolve') {
        for (const m of [48, 55, 60, 64, 67]) voice(ctx, out, { type:'triangle', freq:midiHz(m), at:t, attack:.35, hold:.5, decay:1.4, peak:.06 });
        voice(ctx, out, { freq:midiHz(84), at:t + .3, attack:.005, decay:1.6, peak:.05 });
      } else return false;
      return true;
    },
    motif(id, scope = '') {
      if (!musicEnabled()) return false;
      const ctx = ready(); if (!ctx) return false;
      const theme = leitmotif(id, scope), beat = 60 / theme.bpm, out = bus(ctx, .5 * musicLevel()), t = ctx.currentTime + .02;
      const total = theme.notes.reduce((end, note) => Math.max(end, note.at + note.length), 0) * beat;
      duck.duck(.4, total * 1000 + 300, 1200);
      voice(ctx, out, { type:'triangle', freq:midiHz(theme.root), at:t, attack:.4, hold:Math.max(0, total - .6), decay:1, peak:.04 });
      for (const note of theme.notes) {
        voice(ctx, out, { freq:midiHz(note.midi), at:t + note.at * beat, attack:.015, decay:Math.max(.4, note.length * beat * 1.4), peak:.09 });
        voice(ctx, out, { freq:midiHz(note.midi + 12), at:t + note.at * beat, attack:.01, decay:.5, peak:.025 });
      }
      return true;
    },
    // Action layer for speed lines / cuts (sound effects bus, not music).
    whoosh(strength = 1) {
      if (!sfxEnabled()) return false;
      const ctx = ready(); if (!ctx) return false;
      hiss(ctx, bus(ctx, (speaking() ? .35 : .65)), { at:ctx.currentTime + .005, from:600, to:5200, q:.9, decay:.32 + .1 * strength, peak:.18 * strength });
      return true;
    },
    stop() { for (const node of live) { try { node.stop(); } catch { /* ended */ } } live.clear(); duck.reset(); },
  };
}

// Recorded foley. Buffers decode after the first unlock gesture; until then
// (or when a browser cannot decode Ogg) the procedural foley plays instead.
export function createSampleFoley({ createContext, enabled = () => false, speaking = () => false, mode = () => 'recorded', fallback, base = '/vn-sfx/', fetchImpl = (...args) => fetch(...args) } = {}) {
  let context, manifest = null, loading = null;
  const buffers = new Map(), live = new Set();
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        context ||= createContext();
        const response = await fetchImpl(base + 'manifest.json', { credentials:'same-origin' });
        if (!response.ok) return;
        manifest = await response.json();
        for (const [kind, files] of Object.entries(manifest?.kinds || {})) {
          const decoded = [];
          for (const file of Array.isArray(files) ? files.slice(0, 8) : []) {
            if (typeof file?.path !== 'string' || !/^[a-z0-9_.-]+\.(?:ogg|mp3|wav|m4a)$/iu.test(file.path)) continue;
            try {
              const bytes = await (await fetchImpl(base + file.path, { credentials:'same-origin' })).arrayBuffer();
              const buffer = await context.decodeAudioData(bytes);
              decoded.push({ buffer, gain:normalizeGain(buffer, Number(file.gain) || 1) });
            } catch { /* Undecodable here (e.g. Ogg on an older Safari): synthesized fallback. */ }
          }
          if (decoded.length) buffers.set(kind, decoded);
        }
      } catch { /* Offline or blocked: synthesized fallback. */ }
    })();
    return loading;
  }
  return {
    get loaded() { return buffers.size; },
    stop() { for (const source of live) { try { source.stop(); } catch { /* ended */ } } live.clear(); fallback?.stop(); },
    resume() { fallback?.resume(); if (enabled() && mode() === 'recorded') void load(); },
    play(kind, seed = 1, { weather = '' } = {}) {
      if (!enabled()) return false;
      const name = kind === 'footstep' && weather === 'snow' && buffers.has('snow') ? 'snow' : kind;
      const options = mode() === 'recorded' ? buffers.get(name) : null;
      if (!options?.length || !context || context.state !== 'running' || live.size > 12) return fallback ? fallback.play(kind === 'heavy' ? 'impact' : kind, seed) : false;
      let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
      const pick = options[h % options.length], source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner?.();
      source.buffer = pick.buffer; source.playbackRate.value = .95 + (h % 11) / 100;
      gain.gain.value = pick.gain * (speaking() ? .4 : .75);
      source.connect(gain);
      if (pan) { pan.pan.value = ((h >>> 8) % 61 - 30) / 100; gain.connect(pan); pan.connect(context.destination); } else gain.connect(context.destination);
      live.add(source); source.onended = () => { live.delete(source); source.disconnect(); gain.disconnect(); pan?.disconnect(); };
      source.start(context.currentTime + .005);
      return true;
    },
    dispose() { for (const source of live) { try { source.stop(); } catch { /* ended */ } } live.clear(); buffers.clear(); fallback?.dispose?.(); },
  };
}
// Peak-safe loudness levelling so samples from different packs sit together.
export function normalizeGain(buffer, trim = 1) {
  let peak = 0, sum = 0, count = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < data.length; i += 4) { const v = Math.abs(data[i]); peak = Math.max(peak, v); sum += v * v; count++; } }
  const rms = Math.sqrt(sum / Math.max(1, count));
  if (!peak || !rms) return 0;
  return Math.min(.9 / peak, .12 / rms) * Math.max(.2, Math.min(2, trim));
}
