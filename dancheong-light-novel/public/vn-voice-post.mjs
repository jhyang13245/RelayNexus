// Voice post-processing on the device: trim silence, level every line to one
// loudness, a gentle voice EQ and a small room matched to the scene. Exposes
// the subset of HTMLAudioElement that vn-voice.mjs uses, with a plain <audio>
// fallback when Web Audio or decoding is unavailable.
import { integratedLoudness, normalizationGain, peakOf, speechBounds } from './vn-loudness.mjs';

export const VOICE_TARGET_LUFS = -16;
// Room by environment bed (vn-audio ambienceFor) and mood.
export function roomFor({ bed = '', mood = '' } = {}) {
  if (mood === 'memory') return { seconds: 1.1, wet: 0.2, damp: 3500 };
  if (bed === 'room') return { seconds: 0.35, wet: 0.1, damp: 6000 };
  if (['rain', 'snow', 'night', 'day'].includes(bed)) return { seconds: 0.18, wet: 0.04, damp: 8000 };
  return { seconds: 0.25, wet: 0.06, damp: 7000 };
}

const analysisCache = new Map();
export function analyzeVoice(channels, sampleRate) {
  const bounds = speechBounds(channels, sampleRate);
  const from = Math.floor(bounds.start * sampleRate), to = Math.ceil(bounds.end * sampleRate);
  const trimmed = channels.map(channel => channel.subarray(from, to));
  const loudness = integratedLoudness(trimmed, sampleRate);
  return { ...bounds, loudness, gain: normalizationGain(loudness, VOICE_TARGET_LUFS, { peak: peakOf(trimmed) }) };
}

function impulse(context, { seconds, damp }) {
  const length = Math.max(1, Math.round(context.sampleRate * seconds)), buffer = context.createBuffer(2, length, context.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c); let low = 0;
    const k = Math.exp(-2 * Math.PI * damp / context.sampleRate);
    for (let i = 0; i < length; i++) { const white = Math.random() * 2 - 1; low = low * k + white * (1 - k); data[i] = low * (1 - i / length) ** 2.2; }
  }
  return buffer;
}

// getVolume(speakerId): 0..1 per-character and master voice volume.
// makeAudio.level() is the playing line's short-term level (0..1, null when
// unknown, e.g. the <audio> fallback); it drives mouth movement on the stage.
export function createVoicePlayer({ getRoom = () => ({}), getVolume = () => 1, createContext = () => new AudioContext(), fallback = url => new Audio(url) } = {}) {
  let context, meter = null;
  const decoded = new Map();
  const ensure = () => { context ||= createContext(); if (context.state === 'suspended') void context.resume().catch(() => {}); return context; };
  async function load(url) {
    if (decoded.has(url)) return decoded.get(url);
    const task = (async () => {
      const bytes = await (await fetch(url)).arrayBuffer();
      const buffer = await ensure().decodeAudioData(bytes);
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const key = url;
      if (!analysisCache.has(key)) analysisCache.set(key, analyzeVoice(channels, buffer.sampleRate));
      while (analysisCache.size > 64) analysisCache.delete(analysisCache.keys().next().value);
      return { buffer, analysis: analysisCache.get(key) };
    })();
    decoded.set(url, task);
    while (decoded.size > 8) decoded.delete(decoded.keys().next().value);
    task.catch(() => decoded.delete(url));
    return task;
  }
  function makeAudio(url, { speakerId = '' } = {}) {
    let source = null, nodes = [], stopped = false, html = null;
    const volume = () => Math.max(0, Math.min(1, Number(getVolume(speakerId)) || 0));
    const instance = {
      onended: null, onerror: null,
      async play() {
        stopped = false;
        let item;
        try { item = await load(url); } catch { item = null; }
        if (stopped) return;
        if (!item) {
          // Undecodable in this browser: play the original file as before.
          html = fallback(url); html.volume = volume(); html.onended = () => { meter = null; instance.onended?.(); }; html.onerror = () => instance.onerror?.();
          meter = { speakerId, analyser: null };
          return html.play();
        }
        const ctx = ensure(), room = roomFor(getRoom());
        if (ctx.state === 'suspended') await ctx.resume();
        if (stopped) return;
        if (ctx.state === 'suspended') throw new Error('voice-playback-blocked');
        source = ctx.createBufferSource(); source.buffer = item.buffer;
        const highpass = ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 85;
        const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9; presence.gain.value = 2;
        const level = ctx.createGain(); level.gain.value = item.analysis.gain;
        const dry = ctx.createGain(); dry.gain.value = 1;
        const out = ctx.createGain(); out.gain.value = volume();
        const analyser = typeof ctx.createAnalyser === 'function' ? ctx.createAnalyser() : null;
        if (analyser) { analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.35; }
        const wet = ctx.createGain(); wet.gain.value = room.wet;
        const reverb = ctx.createConvolver(); reverb.buffer = impulse(ctx, room);
        source.connect(highpass); highpass.connect(presence); presence.connect(level);
        if (analyser) level.connect(analyser);
        level.connect(dry); dry.connect(out);
        level.connect(reverb); reverb.connect(wet); wet.connect(out); out.connect(ctx.destination);
        nodes = [source, highpass, presence, level, dry, wet, reverb, out, analyser].filter(Boolean);
        meter = { speakerId, analyser, data: analyser ? new Float32Array(analyser.fftSize) : null };
        source.onended = () => { const done = !stopped; cleanup(); if (done) instance.onended?.(); };
        const duration = Math.max(0.05, item.analysis.end - item.analysis.start);
        source.start(0, item.analysis.start, duration);
      },
      pause() { stopped = true; if (html) { html.pause(); if (meter?.speakerId === speakerId) meter = null; return; } try { source?.stop(); } catch { /* not started */ } cleanup(); },
      set currentTime(value) { if (html) html.currentTime = value; },
      get currentTime() { return html ? html.currentTime : 0; },
    };
    function cleanup() { if (meter && (meter.analyser ? nodes.includes(meter.analyser) : meter.speakerId === speakerId && !html)) meter = null; for (const node of nodes) { try { node.disconnect(); } catch { /* detached */ } } nodes = []; source = null; }
    return instance;
  }
  // Called synchronously from the reader's gesture, before the paid fetch.
  makeAudio.resume = () => { try { ensure(); } catch { /* HTML audio fallback remains available. */ } };
  makeAudio.speaker = () => meter?.speakerId || '';
  makeAudio.level = () => {
    if (!meter) return 0;
    if (!meter.analyser) return null;
    meter.analyser.getFloatTimeDomainData(meter.data);
    let sum = 0; for (const v of meter.data) sum += v * v;
    // Levelled speech sits near -16 LUFS; map ~-40..-12 dBFS RMS to 0..1.
    const db = 10 * Math.log10(sum / meter.data.length + 1e-12);
    return Math.max(0, Math.min(1, (db + 40) / 28));
  };
  return makeAudio;
}
