import { analyzeMusicData } from './vn-audio-analysis.mjs?v=620ff060ab90';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: analyzeMusicData(data.channels, data.sampleRate, data.bpmHint) }); }
  catch { self.postMessage({ id: data.id, result: null }); }
};
