// Integrated loudness after ITU-R BS.1770 (K-weighting, 400 ms blocks with
// 75% overlap, absolute -70 LUFS and relative -10 LU gates). Pure functions on
// Float32Array channels so music and voice can be levelled the same way.

function biquad(input, { b0, b1, b2, a0, a1, a2 }) {
  const out = new Float32Array(input.length);
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i], y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}
// Stage 1: high shelf (+4 dB above ~1.5 kHz). Stage 2: RLB high-pass (~38 Hz).
// Coefficients are derived for the actual sample rate, not the 48 kHz table.
export function kWeightingFilters(sampleRate) {
  const shelf = (() => {
    const gain = 4, q = 1 / Math.SQRT2, fc = 1500, A = 10 ** (gain / 40), w0 = 2 * Math.PI * fc / sampleRate;
    const alpha = Math.sin(w0) / (2 * q), cos = Math.cos(w0), sqrtA = Math.sqrt(A);
    return { b0: A * ((A + 1) + (A - 1) * cos + 2 * sqrtA * alpha), b1: -2 * A * ((A - 1) + (A + 1) * cos), b2: A * ((A + 1) + (A - 1) * cos - 2 * sqrtA * alpha),
      a0: (A + 1) - (A - 1) * cos + 2 * sqrtA * alpha, a1: 2 * ((A - 1) - (A + 1) * cos), a2: (A + 1) - (A - 1) * cos - 2 * sqrtA * alpha };
  })();
  const highpass = (() => {
    const q = 0.5, fc = 38, w0 = 2 * Math.PI * fc / sampleRate, alpha = Math.sin(w0) / (2 * q), cos = Math.cos(w0);
    return { b0: (1 + cos) / 2, b1: -(1 + cos), b2: (1 + cos) / 2, a0: 1 + alpha, a1: -2 * cos, a2: 1 - alpha };
  })();
  return [shelf, highpass];
}

export function integratedLoudness(channels, sampleRate) {
  const list = (Array.isArray(channels) ? channels : [channels]).filter(channel => channel?.length);
  if (!list.length || !(sampleRate > 0)) return -Infinity;
  const [shelf, highpass] = kWeightingFilters(sampleRate);
  const weighted = list.map(channel => biquad(biquad(channel, shelf), highpass));
  const block = Math.round(0.4 * sampleRate), hop = Math.round(0.1 * sampleRate), length = weighted[0].length;
  const powers = [];
  if (length < block) {
    // Short clips (a single word) are measured as one block.
    let sum = 0; for (const channel of weighted) { let s = 0; for (const v of channel) s += v * v; sum += s / Math.max(1, channel.length); }
    powers.push(sum);
  } else {
    for (let start = 0; start + block <= length; start += hop) {
      let sum = 0;
      for (const channel of weighted) { let s = 0; for (let i = start; i < start + block; i++) s += channel[i] * channel[i]; sum += s / block; }
      powers.push(sum);
    }
  }
  const lufs = power => -0.691 + 10 * Math.log10(power);
  const absolute = powers.filter(power => power > 0 && lufs(power) > -70);
  if (!absolute.length) return -Infinity;
  const relativeGate = lufs(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
  const gated = absolute.filter(power => lufs(power) > relativeGate);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// Gain (linear) that moves a measured loudness to the target, limited so a
// quiet or silent file is never boosted into noise, and peaks stay below 0 dBFS.
export function normalizationGain(loudness, target, { maxBoostDb = 12, maxCutDb = 24, peak = 0 } = {}) {
  if (!Number.isFinite(loudness)) return 1;
  const db = Math.max(-maxCutDb, Math.min(maxBoostDb, target - loudness));
  const gain = 10 ** (db / 20);
  return peak > 0 ? Math.min(gain, 0.97 / peak) : gain;
}
export function peakOf(channels) {
  let peak = 0;
  for (const channel of channels) for (let i = 0; i < channel.length; i++) { const v = Math.abs(channel[i]); if (v > peak) peak = v; }
  return peak;
}

// Leading/trailing silence for spoken lines: first/last 10 ms window above the
// threshold, with a small pad so consonants and breaths are not clipped.
export function speechBounds(channels, sampleRate, { thresholdDb = -45, padMs = 60, minMs = 150 } = {}) {
  const length = channels[0]?.length || 0, win = Math.max(1, Math.round(sampleRate * 0.01));
  const threshold = 10 ** (thresholdDb / 20);
  const loud = start => { for (const channel of channels) for (let i = start; i < Math.min(length, start + win); i++) if (Math.abs(channel[i]) > threshold) return true; return false; };
  let first = -1, last = -1;
  for (let start = 0; start < length; start += win) if (loud(start)) { first = start; break; }
  for (let start = Math.floor((length - 1) / win) * win; start >= 0; start -= win) if (loud(start)) { last = Math.min(length, start + win); break; }
  if (first < 0) return { start: 0, end: length / sampleRate };
  const pad = Math.round(sampleRate * padMs / 1000);
  let a = Math.max(0, first - pad), b = Math.min(length, last + pad);
  const min = Math.round(sampleRate * minMs / 1000);
  if (b - a < min) b = Math.min(length, a + min);
  return { start: a / sampleRate, end: b / sampleRate };
}
