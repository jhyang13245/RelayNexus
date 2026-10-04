// Stage layout and direction rules. Pure functions only; vn.js applies them.
import { lightFor } from './vn-scene.mjs';
export { heightScale } from './vn-stature.mjs';

// People keep their place on stage while they remain present. Newcomers join on
// the right; when someone leaves, the rest slide instead of jumping slots.
export function stageOrder(previous = [], ids = []) {
  const present = new Set(ids);
  const kept = previous.filter(id => present.has(id));
  return [...kept, ...ids.filter(id => !kept.includes(id))];
}

// Horizontal centres as a fraction of the stage width. NVL text sits on the
// left, so a lone person stands right of centre; ADV text sits at the bottom.
const centres = {
  nvl: [[0.68], [0.5, 0.78], [0.36, 0.6, 0.83]],
  adv: [[0.5], [0.33, 0.67], [0.2, 0.5, 0.8]],
  narrow: [[0.62], [0.32, 0.72], [0.2, 0.5, 0.8]],
};
export function stagePositions(count, { layout = 'nvl', narrow = false, compactLandscape = false } = {}) {
  if (count < 1) return [];
  if (compactLandscape && layout === 'nvl') return [[.79], [.67, .86], [.59, .76, .91]][Math.min(count, 3) - 1];
  const table = narrow ? centres.narrow : centres[layout] || centres.nvl;
  return table[Math.min(count, 3) - 1];
}
export function slotWidth(count, narrow = false) {
  return narrow ? [0.96, 0.66, 0.5][Math.min(Math.max(count, 1), 3) - 1] : [0.46, 0.4, 0.33][Math.min(Math.max(count, 1), 3) - 1];
}

// A stable accent per person for NVL speaker labels.
export function speakerHue(id = '') {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % 360;
}

export function weatherFor(world = {}) {
  const text = String(world?.weather || '');
  if (/비|소나기|장마|폭우|호우|빗|rain|storm|drizzle/iu.test(text)) return 'rain';
  if (/눈(?!물|빛|길|동자|앞)|폭설|진눈깨비|snow|sleet/iu.test(text)) return 'snow';
  if (/안개|연무|fog|mist|haze/iu.test(text)) return 'fog';
  return 'clear';
}

export { lightFor };

// Model direction wins when present; the conservative text rules remain the
// fallback for older cached decisions, streaming beats and failed requests.
export function mergeDirection(text, model) {
  if (!model) return { ...text, mood: text.memory ? 'memory' : 'normal', transition: 'none', fx: text.impact ? 'shake' : 'none', focusId: '' };
  const memory = model.mood === 'memory' || text.memory;
  return { ...text, ...(model.cutin ? { cutin: model.cutin } : {}), ...(model.emphasis ? { emphasis: model.emphasis } : {}), shot: model.shot || text.shot, memory, mood: memory ? 'memory' : model.mood || 'normal',
    transition: model.transition || 'none', fx: model.fx && model.fx !== 'none' ? model.fx : text.impact ? 'shake' : 'none', focusId: model.focusId || '' };
}

// "Met" means seen on stage while reading: only verified on-stage people of a
// shown beat, never candidates, prepared images or people ahead in the text.
export function recordMet(met = [], view) {
  if (!view || view.castStatus !== 'ready') return met;
  const people = [...(view.portraits || []), ...(view.pending || [])];
  const known = new Set(met.map(person => person.id));
  const added = people.filter(person => person?.id && !known.has(person.id)).map(person => ({ id: person.id, name: person.name, baseKey: person.baseKey || '' }));
  let changed = false;
  const updated = met.map(person => {
    const visible = people.find(row => row.id === person.id);
    if (!visible?.baseKey || (visible.baseKey === person.baseKey && visible.name === person.name)) return person;
    changed = true;
    return { ...person, name: visible.name, baseKey: visible.baseKey };
  });
  return changed || added.length ? [...updated, ...added] : met;
}
