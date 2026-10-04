import { integratedLoudness, normalizationGain, peakOf } from './vn-loudness.mjs?v=e0d140d50b0f';
import { analyzeTrack } from './vn-loop.mjs?v=e0d140d50b0f';

export function analyzeMusicData(channels, sampleRate, bpmHint = 0) {
  const loudness = integratedLoudness(channels, sampleRate);
  return { ...analyzeTrack(channels, sampleRate, { bpmHint }), loudness,
    gain: normalizationGain(loudness, -20, { peak: peakOf(channels) }), version: 1 };
}

// Worker startup failure keeps music playable without doing expensive DSP in the UI.
export function basicMusicAnalysis(buffer) {
  const duration = buffer.duration || buffer.getChannelData(0).length / buffer.sampleRate;
  return { version: 0, duration, gain: 1, grid: null, loop: { start: 0, end: duration, crossfade: 0 } };
}
