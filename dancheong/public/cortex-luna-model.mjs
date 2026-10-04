// Upgrade only future requests/settings. Historical logs retain their model
// and prices. Provider selection, credentials and every other model are intact.
export function upgradeLunaModel(model) {
  return typeof model === 'string' && /^gpt-5\.6-luna(?:-\d{4}-\d{2}-\d{2})?$/u.test(model.trim()) ? 'gpt-6-luna' : model;
}
