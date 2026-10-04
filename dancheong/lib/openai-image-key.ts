import { restoreRememberedApiKey } from './api-key-vault';

export const OPENAI_IMAGE_KEY_CHANGED = 'dancheong-openai-image-key-change';
// Tab-only fallback; durable storage remains the existing encrypted OpenAI vault.
// Never place keys in events, snapshots, URLs or shared multiplayer state.
let tabKey: string | null = null;
let revision = 0;
export function applyOpenAIImageKey(key: string) {
  if (typeof window === 'undefined') return;
  tabKey = key.trim(); revision++;
  window.dispatchEvent(new Event(OPENAI_IMAGE_KEY_CHANGED));
}
export async function resolveOpenAIImageKey() {
  if (typeof window === 'undefined') return '';
  if (tabKey !== null) return tabKey;
  const before = revision;
  const stored = await restoreRememberedApiKey('openai').catch(() => null);
  return before === revision ? stored || '' : tabKey || '';
}
