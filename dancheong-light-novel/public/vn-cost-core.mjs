// Standard API rates, USD / 1M tokens, checked 2026-09-25.
// https://developers.openai.com/api/docs/pricing
// https://developers.openai.com/api/docs/models/gpt-5.6-luna
// https://developers.openai.com/api/docs/models/gpt-6-luna
export const pricingDate = '2026-09-25';
const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
// Gemini 3.8 TTS, USD / 1M tokens (text input, audio output). Google announced
// the introductory rates until 2026-12-31; they double from 2027-01-01.
const GEMINI_TTS = { 'gemini-3.8-flash-tts': [0.5, 9], 'gemini-3.8-flash-lite-tts': [0.5, 6] };
export function estimateCost({ provider, model = '', usage, serviceTier, state, at }) {
  if (provider === 'go') return { usd: null, kind: 'subscription' };
  // Typecast bills plan credits per character, not a published per-call USD rate.
  if (provider === 'typecast') return { usd: null, kind: 'credits' };
  // Lyria is billed per generated song (Gemini API pricing: clip $0.04, full song $0.08).
  if (provider === 'gemini' && /^lyria-/u.test(model)) return state === 'complete' ? { usd: model === 'lyria-3-clip-preview' ? 0.04 : 0.08, kind: 'estimate' } : { usd: null, kind: 'unknown' };
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return { usd: null, kind: 'unknown' };
  if (serviceTier && !['auto', 'default', 'standard'].includes(serviceTier)) return { usd: null, kind: 'unknown' };
  const input = count(usage.input_tokens), output = count(usage.output_tokens), details = usage.input_tokens_details || {};
  if (provider === 'gemini' && GEMINI_TTS[model]) {
    const [inRate, outRate] = GEMINI_TTS[model], later = Number(at) >= Date.UTC(2027, 0, 1) ? 2 : 1;
    return { usd: (input * inRate + output * outRate) * later / 1e6, kind: 'estimate' };
  }
  if (provider === 'openai' && /^gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?$/u.test(model)) return { usd: (input * 0.6 + output * 12) / 1e6, kind: 'estimate' };
  if (provider === 'gemini' && /^gemini-3\.1-flash-image(?:-\d+)?$/u.test(model)) {
    const image = usage.output_tokens_details?.image_tokens;
    if (!Number.isFinite(image) || image < 0 || image > output) return { usd: null, kind: 'unknown' };
    // https://ai.google.dev/gemini-api/docs/pricing — text/thinking and image outputs differ.
    return { usd: (input * 0.5 + image * 60 + (output - image) * 3) / 1e6, kind: 'estimate' };
  }
  if (/^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/u.test(model)) {
    const cached = Math.min(input, count(details.cached_tokens));
    const written = Math.min(input - cached, count(details.cache_write_tokens));
    const long = input > 272000;
    return { usd: (((input - cached - written) * 0.1 + cached * 0.01 + written * 0.125) * (long ? 2 : 1) + output * 0.5 * (long ? 1.5 : 1)) / 1e6, kind: 'estimate' };
  }
  if (/^gpt-5\.6-luna(?:-\d{4}-\d{2}-\d{2})?$/u.test(model)) {
    const cached = Math.min(input, count(details.cached_tokens));
    const long = input > 272000;
    return { usd: ((input - cached) * 0.2 * (long ? 2 : 1) + cached * 0.02 * (long ? 2 : 1) + output * 1.2 * (long ? 1.5 : 1)) / 1e6, kind: 'estimate' };
  }
  const imageRate = /^gpt-image-2\.5-flare(?:-\d{4}-\d{2}-\d{2})?$/u.test(model) ? 2 : /^gpt-image-2(?:-\d{4}-\d{2}-\d{2})?$/u.test(model) ? 1 : 0;
  if (!imageRate || !Number.isFinite(details.text_tokens) || !Number.isFinite(details.image_tokens)) return { usd: null, kind: 'unknown' };
  const text = count(details.text_tokens), image = count(details.image_tokens);
  const cachedDetails = details.cached_tokens_details || usage.cached_tokens_details;
  const cachedText = Math.min(text, count(cachedDetails?.text_tokens ?? details.cached_text_tokens));
  const cachedImage = Math.min(image, count(cachedDetails?.image_tokens ?? details.cached_image_tokens));
  const ambiguousCache = count(details.cached_tokens) > cachedText + cachedImage;
  const imageOutput = Number.isFinite(usage.output_tokens_details?.image_tokens) ? count(usage.output_tokens_details.image_tokens) : output;
  const usd = ((text - cachedText) * 2.5 + cachedText * 0.625 + (image - cachedImage) * 4 + cachedImage * 1 + imageOutput * 15) * imageRate / 1e6;
  return { usd, kind: ambiguousCache ? 'upper-bound' : 'estimate' };
}
export function sumCosts(rows) {
  return rows.reduce((sum, row) => {
    const price = row.cost || estimateCost(row);
    if (typeof price.usd === 'number') sum.usd += price.usd;
    if (price.kind === 'unknown') sum.unknown++;
    if (price.kind === 'subscription') sum.subscription++;
    if (price.kind === 'credits') sum.credits++;
    sum.input += count(row.usage?.input_tokens); sum.output += count(row.usage?.output_tokens);
    sum.calls++;
    return sum;
  }, { usd: 0, unknown: 0, subscription: 0, credits: 0, input: 0, output: 0, calls: 0 });
}
export function usageReceipt(payload) {
  const response = payload?.response || payload;
  return response?.usage ? { usage: response.usage, model: response.model, serviceTier: response.service_tier } : null;
}
