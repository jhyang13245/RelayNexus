// Conservative direction from visible narration only. Quoted speech is not a cue.
import { createPlaybackContext, resumePlayback } from './vn-media-session.mjs?v=a63fa2266034';
function narration(text) { return String(text || '').replace(/[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu, ''); }
export function directionFor(page, scene) {
  const text = page?.kind === 'dialogue' ? '' : narration(page?.text);
  const past = /(?:기억|회상)(?:이|을|에| 속)|떠올랐다|떠올렸|그날의 기억/u.test(text);
  const close = /(?:얼굴|눈동자|시선)(?:이|가|을|를)?[^.!?\n]{0,18}(?:가까|눈앞|마주)|한 걸음 다가|바짝 다가/u.test(text);
  const wide = /(?:주위|주변|풍경|하늘)(?:를|을)?[^.!?\n]{0,12}(?:둘러|올려|바라)|멀리서|시야가 트/u.test(text);
  const impact = /(?:폭발|충돌)(?:음|이|과)?[^.!?\n]{0,10}(?:울렸|일어났|터졌)|(?:문|바닥|벽)(?:이|을|에)[^.!?\n]{0,12}(?:쾅|부딪쳤|내리쳤)|총성이 울렸/u.test(text);
  return { shot: close ? 'close' : wide ? 'wide' : 'medium', memory: past, impact,
    tone: /밤|night/iu.test(scene?.world?.time || '') ? 'night' : 'normal' };
}
export function transitionFor(previous, next) {
  if (!previous || !next || previous.environmentKey === next.environmentKey) return 'none';
  return previous.world?.location !== next.world?.location ? 'location' : 'time';
}
// Reconstruct framing from the read portion of this turn, including history jumps.
// Transient effects belong only to the current paragraph; future prose is never read.
export function directionAt(pages, cursor, scene) {
  const current = pages[cursor];
  let start = cursor, shot = 'medium', memory = false;
  while (start > 0 && pages[start - 1].turnId === current?.turnId) start--;
  for (let i = start; i <= cursor; i++) {
    const cue = directionFor(pages[i], scene);
    if (cue.shot !== 'medium') shot = cue.shot;
    if (cue.memory) memory = true;
    if (pages[i]?.kind !== 'dialogue' && /현실로 돌아|회상에서 벗어|기억에서 벗어/u.test(narration(pages[i]?.text))) memory = false;
  }
  return { ...directionFor(current, scene), shot, memory };
}
export function createSound(getEnabled) {
  let context;
  return { play(kind = 'page') {
    if (!getEnabled() || typeof AudioContext === 'undefined') return;
    try {
      context ||= createPlaybackContext();
      void resumePlayback(context).catch(() => {});
      const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
      const duration = kind === 'choice' ? 0.18 : 0.065;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(kind === 'choice' ? 660 : 440, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'choice' ? 990 : 320, now + duration);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.025, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + duration + 0.01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Browsers without audio support keep silent playback. */ }
  } };
}
