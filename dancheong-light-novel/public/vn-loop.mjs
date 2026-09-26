// Loop and bar analysis for background music. Generated or uploaded tracks
// usually have an intro and a fade-out; looping the whole file leaves a gap.
// These pure functions find the tempo, a bar grid and a bar-aligned loop
// region whose end sounds like its start, so playback can crossfade seamlessly.

const HOP = 256;

// Mono mixdown decimated to ~11 kHz: enough for energy/onset analysis.
export function analysisSignal(channels, sampleRate) {
  const factor = Math.max(1, Math.floor(sampleRate / 11025)), length = Math.floor((channels[0]?.length || 0) / factor);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) for (let k = 0; k < factor; k++) sum += channel[i * factor + k] || 0;
    out[i] = sum / (channels.length * factor);
  }
  return { signal: out, rate: sampleRate / factor };
}

// Frame RMS and half-wave rectified log-energy differences (onset strength).
export function envelopes(signal, rate) {
  const frames = Math.max(0, Math.floor(signal.length / HOP)), rms = new Float32Array(frames), onset = new Float32Array(frames);
  let previous = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) sum += signal[i] * signal[i];
    rms[f] = Math.sqrt(sum / HOP);
    const log = Math.log10(1e-6 + rms[f]);
    onset[f] = Math.max(0, log - previous); previous = log;
  }
  return { rms, onset, frameRate: rate / HOP };
}

function autocorr(values, lag) { let sum = 0; for (let i = lag; i < values.length; i++) sum += values[i] * values[i - lag]; return sum / Math.max(1, values.length - lag); }

// Tempo from the onset autocorrelation, weighted toward typical BGM tempi or
// toward the BPM that was requested when a track was generated.
export function estimateTempo(onset, frameRate, { hint = 0, min = 50, max = 190 } = {}) {
  const mean = onset.reduce((a, b) => a + b, 0) / Math.max(1, onset.length);
  const centred = onset.map(v => v - mean);
  let best = { bpm: 0, score: -Infinity }, total = 0, count = 0;
  for (let bpm = min; bpm <= max; bpm += 0.5) {
    const lag = frameRate * 60 / bpm, lo = Math.floor(lag), t = lag - lo;
    const r = (1 - t) * autocorr(centred, lo) + t * autocorr(centred, lo + 1);
    total += Math.max(0, r); count++;
    const centre = hint > 0 ? hint : 100, spread = hint > 0 ? 0.12 : 0.9;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / centre) / spread) ** 2);
    const score = r * (hint > 0 ? 0.35 + prior : 0.6 + 0.4 * prior);
    if (score > best.score) best = { bpm, score, r };
  }
  const confidence = count && total > 0 ? best.r / (total / count) : 0;
  return { bpm: best.bpm, confidence };
}

const at = (values, t) => { const i = Math.floor(t), f = t - i; return (values[i] || 0) * (1 - f) + (values[i + 1] || 0) * f; };
function combScore(onset, beat, phase) { let s = 0, n = 0; for (let t = phase; t < onset.length - 1; t += beat) { s += at(onset, t); n++; } return n ? s / n : 0; }
function bestPhase(onset, beat) {
  let phase = 0, best = -Infinity;
  for (let p = 0; p < beat; p += 0.25) { const s = combScore(onset, beat, p); if (s > best) { best = s; phase = p; } }
  return { phase, score: best };
}
// The autocorrelation peak is only accurate to a couple of percent, which
// drifts by a beat over a long loop. Refine tempo and phase jointly so the
// beat comb lines up with onsets across the whole track.
export function refineTempo(onset, frameRate, bpm, final = false) {
  let best = { bpm, score: -Infinity };
  for (let candidate = bpm * 0.96; candidate <= bpm * 1.04; candidate += 0.05) {
    const { score } = bestPhase(onset, frameRate * 60 / candidate);
    if (score > best.score) best = { bpm: candidate, score };
  }
  // Octave check: if doubling the tempo still lands on onsets, the half
  // tempo was only picking the accented beats.
  const double = best.bpm * 2;
  if (final) return best.bpm;
  if (double <= 190 && bestPhase(onset, frameRate * 60 / double).score >= 0.6 * best.score) best = { bpm: refineTempo(onset, frameRate, double, true) };
  return Math.round(best.bpm * 100) / 100;
}

// Beat phase maximising onsets on the beat, then the downbeat among the four
// beat phases (strongest bar-periodic onsets). Returns seconds.
export function barGrid(onset, frameRate, bpm) {
  const beat = frameRate * 60 / bpm;
  const { phase } = bestPhase(onset, beat);
  let downbeat = phase, strongest = -Infinity;
  for (let i = 0; i < 4; i++) {
    let s = 0; for (let t = phase + i * beat; t < onset.length - 1; t += beat * 4) s += at(onset, t);
    if (s > strongest) { strongest = s; downbeat = phase + i * beat; }
  }
  return { origin: downbeat / frameRate, beat: 60 / bpm, bar: 240 / bpm };
}

function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 0; }
function window(values, start, length) { const out = []; for (let i = 0; i < length; i++) out.push(values[start + i] || 0); return out; }
function cosine(a, b) { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? ab / Math.sqrt(aa * bb) : 0; }

// Loop region: skip a quiet intro, stop before the fade-out tail, and when the
// tempo is trustworthy choose a whole number of bars whose end best matches
// the start (energy + onset pattern over one bar).
export function findLoop({ rms, onset, frameRate }, duration, tempo, grid, { crossfade = 1.5 } = {}) {
  // One-second smoothed level: beats and rests do not look like an intro or a
  // fade. The loop must end before the fade-out starts to dip (75% of body).
  const span = Math.max(1, Math.round(frameRate)), smooth = new Float32Array(rms.length);
  let running = 0;
  for (let f = 0; f < rms.length; f++) { running += rms[f]; if (f >= span) running -= rms[f - span]; smooth[f] = running / Math.min(f + 1, span); }
  const level = median(Array.from(smooth).filter(v => v > 1e-4)) || 0;
  let introEnd = 0; for (let f = 0; f < smooth.length; f++) if (smooth[f] >= level * 0.6) { introEnd = Math.max(0, f - span) / frameRate; break; }
  let tail = duration; for (let f = smooth.length - 1; f >= 0; f--) if (smooth[f] >= level * 0.75) { tail = Math.max(0, f - span / 2) / frameRate; break; }
  const fallback = { start: Math.min(introEnd, duration * 0.25), end: Math.max(Math.min(tail, duration), Math.min(duration, introEnd + 4)), barAligned: false, crossfade: 3 };
  if (!grid || !(tempo?.confidence >= 1.3) || tail - introEnd < grid.bar * 4) return fallback;
  const bar = grid.bar, firstBar = Math.ceil((Math.max(introEnd, grid.origin) - grid.origin) / bar - 1e-6);
  const start = grid.origin + firstBar * bar;
  const barFrames = Math.max(1, Math.round(bar * frameRate)), startFrame = Math.round(start * frameRate);
  const reference = [...window(rms, startFrame, barFrames), ...window(onset, startFrame, barFrames)];
  const maxBars = Math.floor((tail - crossfade - start) / bar);
  let best = null;
  for (let k = Math.max(2, Math.ceil(maxBars / 2)); k <= maxBars; k++) {
    const endFrame = Math.round((start + k * bar) * frameRate);
    if (endFrame + barFrames > rms.length) break;
    const similarity = cosine(reference, [...window(rms, endFrame, barFrames), ...window(onset, endFrame, barFrames)]);
    const score = similarity + 0.08 * (k / maxBars);
    if (!best || score > best.score) best = { k, score, similarity };
  }
  if (!best) return fallback;
  return { start, end: start + best.k * bar, bars: best.k, barAligned: true, similarity: best.similarity, crossfade: best.similarity > 0.85 ? Math.min(crossfade, bar / 2) : Math.min(3, bar) };
}

export function analyzeTrack(channels, sampleRate, { bpmHint = 0 } = {}) {
  const duration = (channels[0]?.length || 0) / sampleRate;
  const { signal, rate } = analysisSignal(channels, sampleRate);
  const env = envelopes(signal, rate);
  const coarse = estimateTempo(env.onset, env.frameRate, { hint: bpmHint });
  const tempo = coarse.bpm ? { ...coarse, bpm: refineTempo(env.onset, env.frameRate, coarse.bpm) } : coarse;
  const grid = tempo.bpm ? barGrid(env.onset, env.frameRate, tempo.bpm) : null;
  const loop = findLoop(env, duration, tempo, grid);
  return { version: 1, duration, bpm: tempo.bpm, tempoConfidence: tempo.confidence, grid: tempo.confidence >= 1.3 ? grid : null, loop };
}

// Seconds from `position` (track time) to the next bar line, or to the next
// beat when a bar is too long to wait for. Without a grid, switch promptly.
export function waitForBoundary(position, grid, { maxWait = 2.5 } = {}) {
  if (!grid) return 0.25;
  const next = unit => { const n = Math.ceil((position - grid.origin) / unit - 1e-6); return grid.origin + Math.max(0, n) * unit - position; };
  const toBar = next(grid.bar);
  if (toBar >= 0 && toBar <= maxWait) return Math.max(0.05, toBar);
  return Math.max(0.05, Math.min(maxWait, next(grid.beat)));
}
