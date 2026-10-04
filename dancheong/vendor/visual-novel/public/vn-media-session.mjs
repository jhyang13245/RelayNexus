// WebKit defaults Web Audio to the ringer/ambient route. Request the media
// playback route, without changing device volume, site mute or user settings.
// https://bugs.webkit.org/show_bug.cgi?id=237322#c6
export function useMediaPlayback(navigatorObject = globalThis.navigator) {
  try {
    const session = navigatorObject?.audioSession;
    if (!session) return false;
    if (session.type !== 'playback') session.type = 'playback';
    return session.type === 'playback';
  } catch { return false; } // Unsupported/readonly implementations keep their normal route.
}
export function createPlaybackContext() {
  useMediaPlayback();
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return new Context();
}
export function resumePlayback(context) {
  useMediaPlayback();
  // iOS also exposes 'interrupted' after a call or route change.
  try {
    return context && context.state !== 'running' && context.state !== 'closed' && context.resume
      ? Promise.resolve(context.resume()) : Promise.resolve();
  } catch (error) { return Promise.reject(error); }
}
