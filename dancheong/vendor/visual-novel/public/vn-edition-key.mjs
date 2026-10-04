export function checkedEdition(value, slug) {
  if (!value) return null;
  if (value.schema !== 'DANCHEONG_VN_EDITION_V1' || value.slug !== slug || !Number.isSafeInteger(value.revision) || value.revision < 1 || !/^[a-f0-9]{64}$/u.test(value.sha256 || '')) throw new Error('덧칠 식별 정보가 올바르지 않습니다.');
  return value;
}
export function editionId(value, slug) {
  const row = checkedEdition(value, slug);
  return row ? `r${row.revision}-${row.sha256}` : 'legacy';
}
export function editionScope(slug, storyId, value) {
  const row = checkedEdition(value, slug);
  return `${slug}:${storyId}${row ? `~vn-r${row.revision}-${row.sha256}` : ''}`;
}
export const snapshotEdition = snapshot => snapshot?.scenario?.runtime?.vnEdition || null;
export const snapshotScope = (slug, snapshot) => editionScope(slug, snapshot?.scenario?.runtime?.storyId, snapshotEdition(snapshot));
// Allow old same-work art reuse, but never cross a published revision boundary.
export function sameArtEdition(a, b) {
  const edition = scope => String(scope || '').match(/~vn-r\d+-[a-f0-9]{64}$/u)?.[0] || '';
  return edition(a) === edition(b);
}
