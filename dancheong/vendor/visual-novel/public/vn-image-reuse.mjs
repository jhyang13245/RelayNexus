import { placeIdentity, weatherIdentity } from './vn-environment.mjs';
import { garmentIdentity } from './vn-wardrobe.mjs';

// Match only known equivalent descriptions. Preserve every identity, edition,
// style, framing, expression and reference field in the rest of the key.
export function reusableImageKey(key) {
  let relevant = false;
  function normalize(value, depth = 0) {
    if (depth > 12 || typeof value !== 'string') return value;
    let row; try { row = JSON.parse(value); } catch { return value; }
    if (!Array.isArray(row)) return value;
    if (row[0] === 'vn-environment-1' && row.length === 5) {
      relevant = true; row[2] = placeIdentity(row[2]); row[4] = weatherIdentity(row[4]);
    } else if (row[0] === 'vn-place-anchor-1' && row.length === 3) {
      relevant = true; row[2] = placeIdentity(row[2]);
    } else if (row[0] === 'vn-wardrobe-1' && row.length === 3) {
      let outfit; try { outfit = JSON.parse(row[2]); } catch { return value; }
      if (!Array.isArray(outfit) || outfit.length !== 2) return value;
      relevant = true; row[2] = JSON.stringify([outfit[0], garmentIdentity(outfit[1])]); row[1] = normalize(row[1], depth + 1);
    } else if (/^vn-(?:style|stage-frame|character-finish|face-redraw|story-expression|portrait-redraw|identity-revision)-/u.test(row[0])) {
      row[1] = normalize(row[1], depth + 1);
    }
    return JSON.stringify(row);
  }
  const result = normalize(key);
  return relevant ? result : null;
}
export function createImageReuseIndex(listKeys) {
  const groups = new Map(); let ready;
  function add(key) {
    const identity = reusableImageKey(key); if (!identity) return;
    const keys = groups.get(identity) || new Set(); keys.add(key); groups.set(identity, keys);
  }
  return {
    add,
    async candidates(key) {
      const identity = reusableImageKey(key); if (!identity) return [];
      ready ||= Promise.resolve().then(listKeys).then(keys => { for (const saved of keys) add(saved); }).catch(() => {});
      await ready;
      return [...(groups.get(identity) || [])].filter(saved => saved !== key);
    },
    clear() { groups.clear(); ready = null; },
  };
}
