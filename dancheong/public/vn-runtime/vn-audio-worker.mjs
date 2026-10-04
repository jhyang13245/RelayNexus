import { analyzeMusicData } from './vn-audio-analysis.mjs?v=a63fa2266034';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: analyzeMusicData(data.channels, data.sampleRate, data.bpmHint) }); }
  catch { self.postMessage({ id: data.id, result: null }); }
};
