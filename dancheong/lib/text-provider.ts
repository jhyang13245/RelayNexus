import {upgradeLunaModel} from '../public/cortex-luna-model.mjs';
export type TextProvider = 'openai' | 'opencode-go' | 'opencode-go-luna';
export type MuseReasoningEffort = 'low' | 'medium' | 'high';
export const TEXT_PROVIDERS = {
  openai: { label: 'GPT 6 Luna', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1' },
  'opencode-go': { label: 'Muse Spark 1.3 Contributor', model: 'muse-spark-1.3-contributor', baseUrl: 'https://opencode.ai/zen/go/v1' },
  'opencode-go-luna': { label: 'GPT 6 Luna · OpenCode Go', model: 'gpt-6-luna', baseUrl: 'https://opencode.ai/zen/go/v1' },
} as const;
export const normalizeTextProvider = (value: unknown): TextProvider => value === 'opencode-go' || value === 'opencode-go-luna' ? value : 'openai';
export const prepareGoResponsesRequest = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_GO_REQUEST');
  const body = value as Record<string, unknown>;
  if (body.model === TEXT_PROVIDERS['opencode-go'].model) return prepareMuseResponsesRequest(body);
  const model = upgradeLunaModel(body.model);
  if (model !== TEXT_PROVIDERS['opencode-go-luna'].model) throw new Error('UNSUPPORTED_GO_MODEL');
  // Old clients and restored settings use Luna 6 without changing their key,
  // provider, reasoning, schema or token budget.
  return { ...body, model, store: false };
};
export const prepareMuseResponsesRequest = (value: unknown) => {
  const body: Record<string, unknown> = value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  const requestedEffort = body.reasoning && typeof body.reasoning === 'object'
    ? String((body.reasoning as Record<string, unknown>).effort || '')
    : '';
  const structuredEffort = ['minimal', 'low', 'medium', 'high'].includes(requestedEffort) ? requestedEffort : 'low';
  return {
    ...body,
    model: TEXT_PROVIDERS['opencode-go'].model,
    store: false,
    // Preserve the device-selected Muse reasoning variant for both streaming
    // prose and structured Cortex calls.
    reasoning: { effort: structuredEffort },
    // Muse may use several thousand response tokens before its first visible
    // prose token. A tiny cap produces a valid HTTP 200 response.incomplete.
    max_output_tokens: Math.max(16_384, Number(body.max_output_tokens) || 0),
  };
};
// Another tab may change the saved preference, but must never reroute this tab's live key.
let activeProvider: TextProvider | undefined;
export function deviceTextProvider(): TextProvider {
  if(typeof window==='undefined')return 'openai';
  if(activeProvider)return activeProvider;
  try { return activeProvider=normalizeTextProvider(window.localStorage.getItem('dancheong:text-provider')); } catch { return activeProvider='openai'; }
}
export function selectTextProvider(provider: TextProvider) {
  window.localStorage.setItem('dancheong:text-provider', provider);
  activeProvider=provider;
  window.dispatchEvent(new Event('dancheong-provider-change'));
}
export function deviceMuseReasoningEffort(): MuseReasoningEffort {
  if(typeof window==='undefined')return 'low';
  try { const value=window.localStorage.getItem('dancheong:muse-reasoning-effort');return value==='medium'||value==='high'?value:'low'; } catch { return 'low'; }
}
export function selectMuseReasoningEffort(effort: MuseReasoningEffort) {
  window.localStorage.setItem('dancheong:muse-reasoning-effort',effort);
  window.dispatchEvent(new Event('dancheong-muse-reasoning-change'));
}
