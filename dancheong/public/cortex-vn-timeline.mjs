// One room clock and one replaceable frame. No per-glyph network messages.
export const VN_SYNC_LEAD = 1200;
export function glyphSchedule(text) {
  const glyphs = Array.from(String(text || '')), at = []; let elapsed = 0;
  for (const glyph of glyphs) {
    at.push(elapsed);
    elapsed += 36 * (/[。.!?！？]/u.test(glyph) ? 8 : /[…—]/u.test(glyph) ? 5 : /[,，、:;]/u.test(glyph) ? 3 : 1);
  }
  return {glyphs, at, duration: at.at(-1) || 0};
}
export function revealCount(schedule, elapsed, complete = false) {
  if (elapsed < 0) return 0;
  if (complete) return schedule.glyphs.length;
  let low = 0, high = schedule.at.length;
  while (low < high) { const mid = (low + high) >>> 1; if (schedule.at[mid] <= elapsed) low = mid + 1; else high = mid; }
  return low;
}
export function paragraphHold(text) { return Math.min(14000, Math.max(1400, 850 + Array.from(String(text || '')).length * 58)); }
// Ignore reordered poll/POST receipts. A device wall-clock change cannot shift
// an established frame; the parent samples the server's monotonic clock.
export function createRoomTimeline(mono = () => performance.now()) {
  let frame = null, anchor = null, lastNow = 0;
  return {
    receive(packet) {
      if (!packet || !Number.isFinite(packet.serverNow)) return false;
      anchor = {server: packet.serverNow, mono: mono()};
      const next = packet.playback;
      if (!next || !Number.isSafeInteger(next.seq) || next.seq <= (frame?.seq || 0)) return false;
      frame = next; return true;
    },
    get frame() { return frame; },
    now() { lastNow = Math.max(lastNow,anchor ? anchor.server + mono() - anchor.mono : 0); return lastNow; },
  };
}
