export const imageRoutingKey = 'dancheong-ln-image-routing-v2';
const provider = value => value === 'gemini' ? 'gemini' : 'openai';
export function readImageRouting(storage) {
  let legacy = 'openai', saved;
  try { legacy = provider(storage.getItem('dancheong-ln-image-provider-v1')); saved = JSON.parse(storage.getItem(imageRoutingKey) || 'null'); } catch { /* Keep legacy choice when the new preference is absent/invalid. */ }
  return { background: ['openai', 'gemini'].includes(saved?.background) ? saved.background : legacy,
    character: ['openai', 'gemini'].includes(saved?.character) ? saved.character : legacy };
}
export function imageProviderFor(routing, purpose = 'background') {
  return provider(purpose === 'background' ? routing?.background : routing?.character);
}
