// Procedural ambience: environment beds and mood pads synthesised with Web
// Audio, so no third-party recordings or music files ship with the site.
import { createPlaybackContext, resumePlayback } from './vn-media-session.mjs?v=620ff060ab90';
const indoor = /실내|방|교실|복도|집|거실|부엌|카페|사무실|도서관|병원|병실|강당|체육관|식당|호텔|지하|열차|기차|차 안|엘리베이터|상점|가게|교회|성당|회의실|연구실|기숙사|room|hall|office|cafe|house|library|indoor|inside/iu;

export function ambienceFor(world = {}, { mood = 'normal', memory = false, light = 'day', weather = 'clear' } = {}) {
  const inside = indoor.test(String(world?.location || ''));
  const bed = weather === 'rain' ? 'rain' : inside ? 'room' : weather === 'snow' ? 'snow' : light === 'night' ? 'night' : 'day';
  const pad = memory ? 'memory' : ['tense', 'sad', 'warm', 'eerie'].includes(mood) ? mood : null;
  return { bed, pad };
}

const chords = {
  warm: [[220, 'triangle'], [277.18, 'sine'], [329.63, 'sine']],
  sad: [[110, 'triangle'], [130.81, 'sine'], [164.81, 'sine']],
  tense: [[55, 'sine'], [58.27, 'sine'], [82.41, 'triangle']],
  eerie: [[146.83, 'sine'], [207.65, 'sine'], [311.13, 'sine']],
  memory: [[261.63, 'sine'], [329.63, 'sine'], [392, 'sine']],
};
const beds = { rain: 0.055, room: 0.03, snow: 0.02, night: 0.018, day: 0.02 };

export function createAmbience(getEnabled) {
  let context, master, noise, current = { bed: '', pad: '' };
  const layers = { bed: null, pad: null };
  function ensure() {
    if (context || typeof AudioContext === 'undefined') return Boolean(context);
    context = createPlaybackContext();
    master = context.createGain(); master.gain.value = 0.9; master.connect(context.destination);
    // Four seconds of pink-ish noise, looped by every noise layer.
    noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const data = noise.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; data[i] = (b0 + b1 + b2 + w * 0.02) * 0.9; }
    return true;
  }
  function source() { const node = context.createBufferSource(); node.buffer = noise; node.loop = true; node.start(context.currentTime, Math.random() * 3); return node; }
  function lfo(rate, depth, target) { const osc = context.createOscillator(), gain = context.createGain(); osc.frequency.value = rate; gain.gain.value = depth; osc.connect(gain); gain.connect(target); osc.start(); return osc; }
  function buildBed(name) {
    const out = context.createGain(), nodes = [], timers = [];
    const chain = (filters, level) => {
      const src = source(); let node = src;
      for (const [type, frequency, q = 0.7] of filters) { const f = context.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; node.connect(f); node = f; nodes.push(f); }
      const g = context.createGain(); g.gain.value = level; node.connect(g); g.connect(out); nodes.push(src, g);
      return { g, filter: node };
    };
    if (name === 'rain') { chain([['highpass', 700], ['lowpass', 6500]], 1); chain([['bandpass', 2600, 1.4]], 0.35); }
    if (name === 'room') chain([['lowpass', 240]], 1.4);
    if (['day', 'snow', 'night'].includes(name)) { const wind = chain([['bandpass', 480, 0.6]], 1); nodes.push(lfo(0.07, 220, wind.filter.frequency), lfo(0.11, 0.35, wind.g.gain)); }
    if (name === 'night') {
      // Crickets: short amplitude-modulated chirps on an irregular clock.
      const tone = context.createOscillator(), am = context.createGain(), env = context.createGain();
      tone.frequency.value = 4300; am.gain.value = 0.5; env.gain.value = 0; tone.connect(am); am.connect(env); env.connect(out);
      nodes.push(lfo(32, 0.5, am.gain), tone); tone.start();
      const chirp = () => { const t = context.currentTime; env.gain.cancelScheduledValues(t); for (let i = 0; i < 3; i++) { env.gain.setValueAtTime(0, t + i * 0.12); env.gain.linearRampToValueAtTime(0.35, t + i * 0.12 + 0.02); env.gain.linearRampToValueAtTime(0, t + i * 0.12 + 0.08); } };
      timers.push(setInterval(chirp, 900 + Math.random() * 500)); nodes.push(env, am);
    }
    return { out, nodes, timers, level: beds[name] || 0.02 };
  }
  function buildPad(name) {
    const out = context.createGain(), nodes = [], filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = name === 'tense' ? 420 : 950; filter.connect(out); nodes.push(filter);
    for (const [frequency, type] of chords[name] || []) {
      const osc = context.createOscillator(), g = context.createGain();
      osc.type = type; osc.frequency.value = frequency; osc.detune.value = (Math.random() - 0.5) * 8; g.gain.value = 0.33;
      osc.connect(g); g.connect(filter); osc.start(); nodes.push(osc, g, lfo(0.05 + Math.random() * 0.08, 0.12, g.gain));
    }
    return { out, nodes, timers: [], level: name === 'tense' ? 0.05 : 0.028 };
  }
  function swap(kind, name, build) {
    const t = context.currentTime, old = layers[kind];
    if (old) { old.out.gain.cancelScheduledValues(t); old.out.gain.setValueAtTime(old.out.gain.value, t); old.out.gain.linearRampToValueAtTime(0, t + 1.8); setTimeout(() => dispose(old), 2000); }
    layers[kind] = null;
    if (!name) return;
    const layer = build(name); layer.out.gain.value = 0; layer.out.connect(master);
    layer.out.gain.linearRampToValueAtTime(layer.level, t + 2.2); layers[kind] = layer;
  }
  function dispose(layer) {
    for (const timer of layer.timers) clearInterval(timer);
    for (const node of layer.nodes) { try { node.stop?.(); } catch { /* already stopped */ } try { node.disconnect(); } catch { /* detached */ } }
    try { layer.out.disconnect(); } catch { /* detached */ }
  }
  return {
    update(target) {
      const wanted = getEnabled() && target ? target : { bed: '', pad: '' };
      if (wanted.bed === current.bed && (wanted.pad || '') === current.pad) return;
      if (!wanted.bed && !current.bed && !wanted.pad) return;
      try {
        if (!ensure()) return;
        void resumePlayback(context).catch(() => {});
        if (wanted.bed !== current.bed) swap('bed', wanted.bed, buildBed);
        if ((wanted.pad || '') !== current.pad) swap('pad', wanted.pad, buildPad);
        current = { bed: wanted.bed, pad: wanted.pad || '' };
      } catch { /* Browsers without Web Audio stay silent. */ }
    },
    resume() { if (context && getEnabled()) void resumePlayback(context).catch(() => {}); },
    stop() { this.update(null); },
  };
}
