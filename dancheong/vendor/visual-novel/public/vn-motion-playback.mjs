/**
 * Pick the portrait frame URL to display for the current motion tick.
 *
 * Guards against stale animation frames replacing a newly switched portrait:
 * the caller passes the currently wanted `source`, the image element's
 * `readySource` (the portrait that has actually finished loading), and a
 * `frames` bundle describing one portrait's URLs. Any mismatch yields "".
 *
 * @param {object} [args]
 * @param {string} [args.source] Currently requested portrait source.
 * @param {string} [args.readySource] Portrait source that is loaded and ready.
 * @param {object} [args.frames] Frame bundle { source, base, blink, talk, both }.
 * @param {boolean} [args.enabled] Motion playback enabled.
 * @param {boolean} [args.blink] Blink phase active.
 * @param {boolean} [args.mouth] Talk/mouth phase active.
 * @returns {string} URL to display, or "" when nothing may be shown.
 */
export function motionFrameFor({ source, readySource, frames, enabled, blink, mouth } = {}) {
  if (typeof source !== "string" || source === "") {
    return "";
  }
  if (readySource !== source) {
    return "";
  }
  if (frames == null || typeof frames !== "object") {
    return "";
  }
  if (frames.source !== source) {
    return "";
  }
  const base = toFrameUrl(frames.base);
  if (base === "") {
    return "";
  }
  if (!enabled) {
    return base;
  }
  const wantBlink = Boolean(blink);
  const wantMouth = Boolean(mouth);
  if (wantBlink && wantMouth) {
    return (
      toFrameUrl(frames.both) ||
      toFrameUrl(frames.blink) ||
      toFrameUrl(frames.talk) ||
      base
    );
  }
  if (wantBlink) {
    return toFrameUrl(frames.blink) || base;
  }
  if (wantMouth) {
    return toFrameUrl(frames.talk) || base;
  }
  return base;
}

function toFrameUrl(value) {
  return typeof value === "string" && value !== "" ? value : "";
}
