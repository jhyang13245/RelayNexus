// Music spans a dramatic passage; visual colour may change every sentence.
export const musicCues = ['keep', 'silence', 'normal', 'warm', 'sad', 'tense', 'eerie', 'memory'];
export function validatedMusic(value, text) {
  const evidence = typeof value?.evidence === 'string' ? value.evidence.trim() : '';
  return value?.cue !== 'keep' && musicCues.includes(value?.cue) && evidence.length >= 6 && String(text || '').includes(evidence)
    ? { cue: value.cue, evidence } : { cue: 'keep', evidence: '' };
}
const moodName = mood => mood === 'dread' ? 'eerie' : musicCues.slice(2).includes(mood) ? mood : 'normal';

// The music that the pages before `index` left playing: the latest explicit
// cue, or a sustained legacy mood. `cueAt(i)` returns { music, mood } or null.
export function musicSeed(index, cueAt, { limit = 120 } = {}) {
  let legacy = '', run = 0, legacyEnded = false;
  for (let i = index - 1, seen = 0; i >= 0 && seen < limit; i--, seen++) {
    const row = cueAt(i);
    if (!row) continue;
    if (row.music && musicCues.includes(row.music.cue)) { if (row.music.cue !== 'keep') return row.music.cue; continue; }
    const mood = row.mood ? moodName(row.mood) : '';
    if (!mood) continue;
    if (legacyEnded) continue;
    if (mood === legacy) run++; else if (!legacy) { legacy = mood; run = 1; } else legacyEnded = true;
  }
  return run >= 2 ? legacy : '';
}
export function createMusicDirection({ now = () => performance.now() } = {}) {
  // `unset`: nothing has chosen music yet (a new story or a loaded save whose
  // first beat only says keep). The first real cue then enters at once.
  let scope = '', scene = '', current = 'silence', changedAt = 0, initialized = false, pending = null, silentScene = '', furthest = -1, unset = false;
  function reset() { scope = ''; scene = ''; current = 'silence'; initialized = false; pending = null; silentScene = ''; furthest = -1; unset = false; }
  function choose(cue, at, explicit) {
    current = cue; changedAt = at; pending = null; unset = false;
    silentScene = explicit && cue === 'silence' ? scene : '';
    return current;
  }
  function update(input) {
    const at = now();
    if (input.scope !== scope) { reset(); scope = input.scope; }
    if (input.provisional || !input.pageKey) return current;
    // Repaints, image arrivals and rereading old lines are not fresh evidence.
    if (Number.isFinite(input.index) && input.index < furthest) { pending = null; return current; }
    furthest = Math.max(furthest, input.index ?? 0);
    if (scene !== input.scene) { scene = input.scene; pending = null; }
    const explicit = Boolean(input.music), cue = explicit ? musicCues.includes(input.music.cue) ? input.music.cue : 'keep' : moodName(input.mood);
    if (!initialized) {
      initialized = true;
      if (cue !== 'keep') return choose(cue, at, explicit);
      // keep = "whatever was playing". After a load that is the last cue of the
      // pages before this one (the caller's seed), otherwise nothing yet.
      const given = typeof input.seed === 'function' ? input.seed() : input.seed;
      const seed = musicCues.includes(given) && given !== 'keep' ? given : '';
      if (seed) return choose(seed, at, seed === 'silence');
      choose('silence', at, false); unset = true; return current;
    }
    if (cue === current) { pending = null; return current; }
    if (unset && cue !== 'keep') return choose(cue, at, explicit);
    if (cue === 'keep') {
      if (!pending?.explicit) { pending = null; return current; }
    } else {
      // Missing/default mood must not restart a deliberately silent scene.
      if (!explicit && current === 'silence' && silentScene === scene) return current;
      if (pending?.cue !== cue) pending = { cue, since: at, pages: new Set(), explicit, dramatic: Boolean(input.dramatic) };
    }
    if (!pending) return current;
    pending.pages.add(input.pageKey);
    const decisive = pending.explicit && (pending.cue === 'silence' || (pending.dramatic && ['tense', 'eerie'].includes(pending.cue)));
    const hold = decisive ? 8000 : pending.explicit ? 24000 : 30000;
    const dwell = decisive ? 0 : pending.explicit ? 6000 : 8000;
    const pages = decisive ? 1 : pending.explicit ? 2 : 3;
    if (at - changedAt >= hold && at - pending.since >= dwell && pending.pages.size >= pages) return choose(pending.cue, at, pending.explicit);
    return current;
  }
  return { update, reset };
}
