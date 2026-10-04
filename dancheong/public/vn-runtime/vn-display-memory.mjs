// Cache eviction must never revoke a frame that is still displayed/animated.
const urls = new Map(), owners = new Map();
let timer = 0, observer;
function collect() {
  timer = 0;
  for (const [node, releases] of owners) if (!node.isConnected) { releases.forEach(release => release()); owners.delete(node); }
  for (const [url, row] of urls) if (row.retired && !row.refs && Date.now() - row.retired > 5000) { URL.revokeObjectURL(url); urls.delete(url); }
  if ([...urls.values()].some(row => row.retired)) { timer = setTimeout(collect, 6000); timer.unref?.(); }
}
export function displayUrl(blob) { const url = URL.createObjectURL(blob); urls.set(url, { refs: 0, retired: 0 }); return url; }
export function retireDisplay(url) { const row = urls.get(url); if (row) { row.retired = Date.now(); if (!timer) timer = setTimeout(collect, 6000); } }
export function retainDisplay(url) {
  const row = urls.get(url); if (!row) return () => {};
  row.refs++; let released = false;
  return () => { if (!released) { released = true; row.refs--; } };
}
export function holdDisplay(node, values) {
  const previous = owners.get(node), releases = [...new Set(values)].filter(Boolean).map(retainDisplay);
  owners.set(node, releases); previous?.forEach(release => release());
  if (!observer && typeof MutationObserver !== 'undefined') { observer = new MutationObserver(() => { if (!timer) timer = setTimeout(collect, 100); }); observer.observe(document.documentElement, { childList: true, subtree: true }); }
}
export function setDisplayImage(image, url) { holdDisplay(image, [url]); image.src = url; }
export const displayMemoryStatus = () => ({ urls: urls.size, pinned: [...urls.values()].filter(row => row.refs > 0).length });
