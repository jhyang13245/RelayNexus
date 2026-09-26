// Music spans a dramatic passage; visual colour may change every sentence.
export const musicCues = ['keep', 'silence', 'normal', 'warm', 'sad', 'tense', 'eerie', 'memory'];
export function validatedMusic(value, text) {
  const evidence = typeof value?.evidence === 'string' ? value.evidence.trim() : '';
  return value?.cue !== 'keep' && musicCues.includes(value?.cue) && evidence.length >= 6 && String(text || '').includes(evidence)
    ? { cue: value.cue, evidence } : { cue: 'keep', evidence: '' };
}
const moodName = mood => mood === 'dread' ? 'eerie' : musicCues.slice(2).includes(mood) ? mood : 'normal';

export function createMusicDirection({ now = () => performance.now() } = {}) {
  let scope = '', scene = '', current = 'silence', changedAt = 0, initialized = false, pending = null, silentScene = '', furthest = -1;
  function reset() { scope = ''; scene = ''; current = 'silence'; initialized = false; pending = null; silentScene = ''; furthest = -1; }
  function choose(cue, at, explicit) {
    current = cue; changedAt = at; pending = null;
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
    if (!initialized) { initialized = true; return choose(cue === 'keep' ? 'silence' : cue, at, explicit); }
    if (cue === current) { pending = null; return current; }
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
