export type ApiCostCategory =
  | "story"
  | "planning"
  | "validation"
  | "research"
  | "scene_image"
  | "character_image";

export type ImageTokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    text_tokens?: number;
    image_tokens?: number;
    cached_tokens?: number;
    cached_text_tokens?: number;
    cached_image_tokens?: number;
  };
  output_tokens_details?: {
    text_tokens?: number;
    image_tokens?: number;
  };
};

export type ImageCostBreakdown = {
  schema: "dancheong-api-cost-v2";
  category: "scene_image" | "character_image";
  model: string;
  measured: boolean;
  referenceCount: number;
  inputFidelity: "high" | "default" | "none";
  textInputTokens: number;
  imageInputTokens: number;
  cachedTextInputTokens: number;
  cachedImageInputTokens: number;
  imageOutputTokens: number;
  textInputCostUsd: number;
  imageInputCostUsd: number;
  imageOutputCostUsd: number;
  totalCostUsd: number;
};

export type TextCostInput = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  toolCallCostUsd?: number;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const flareOutputFallback = (quality: "low" | "medium") =>
  quality === "low" ? 96 : 208;

export const textCostUsd = ({
  model,
  inputTokens,
  cachedInputTokens,
  cacheWriteTokens,
  outputTokens,
  toolCallCostUsd = 0,
}: TextCostInput) => {
  const rates = model === "gpt-6-luna" || model.startsWith("gpt-6-luna-")
    ? { input: 0.1, cached: 0.01, output: 0.5 }
    : model === "gpt-6-astra"
    ? { input: 10, cached: 1, output: 50 }
    : model === "gpt-5.6-sol"
      ? { input: 4, cached: 0.4, output: 20 }
      : model === "gpt-5.6-terra"
        ? { input: 2, cached: 0.2, output: 12 }
        : { input: 0.2, cached: 0.02, output: 1.2 };
  const longContext = inputTokens > 272_000;
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens);
  return ((uncachedInputTokens * rates.input + cachedInputTokens * rates.cached + cacheWriteTokens * rates.input * 1.25) * (longContext ? 2 : 1) + outputTokens * rates.output * (longContext ? 1.5 : 1)) / 1_000_000 + toolCallCostUsd;
};

export const imageCostBreakdown = ({
  model,
  usage,
  prompt,
  quality,
  referenceCount,
  inputFidelity,
  category,
}: {
  model: string;
  usage?: ImageTokenUsage;
  prompt: string;
  quality: "low" | "medium";
  referenceCount: number;
  inputFidelity?: "high" | "default" | "none";
  category: "scene_image" | "character_image";
}): ImageCostBreakdown => {
  const details = usage?.input_tokens_details ?? {};
  const outputDetails = usage?.output_tokens_details ?? {};
  const measured = number(usage?.input_tokens) > 0 || number(usage?.output_tokens) > 0;
  const rawTextInput = number(details.text_tokens);
  const rawImageInput = number(details.image_tokens);
  const totalInput = number(usage?.input_tokens);
  const textInputTokens = rawTextInput || (rawImageInput ? Math.max(0, totalInput - rawImageInput) : Math.ceil(prompt.length / 4));
  const imageInputTokens = rawImageInput || (measured ? Math.max(0, totalInput - textInputTokens) : referenceCount * 900);
  const cachedTextInputTokens = Math.min(textInputTokens, number(details.cached_text_tokens));
  const cachedImageInputTokens = Math.min(imageInputTokens, number(details.cached_image_tokens));
  const imageOutputTokens = number(outputDetails.image_tokens) || number(usage?.output_tokens) || flareOutputFallback(quality);
  const isFlare = model === "gpt-image-2.5-flare" || model === "gpt-image-2.5-sunburst";
  const textInputRate = isFlare ? 5 : 2.5;
  const cachedTextInputRate = isFlare ? 1.25 : 0.625;
  const imageInputRate = isFlare ? 8 : 4;
  const cachedImageInputRate = isFlare ? 2 : 1;
  const imageOutputRate = isFlare ? 30 : 15;
  const textInputCostUsd = ((textInputTokens - cachedTextInputTokens) * textInputRate + cachedTextInputTokens * cachedTextInputRate) / 1_000_000;
  const imageInputCostUsd = ((imageInputTokens - cachedImageInputTokens) * imageInputRate + cachedImageInputTokens * cachedImageInputRate) / 1_000_000;
  const imageOutputCostUsd = imageOutputTokens * imageOutputRate / 1_000_000;
  return {
    schema: "dancheong-api-cost-v2",
    category,
    model,
    measured,
    referenceCount,
    inputFidelity: inputFidelity ?? (referenceCount ? "high" : "none"),
    textInputTokens,
    imageInputTokens,
    cachedTextInputTokens,
    cachedImageInputTokens,
    imageOutputTokens,
    textInputCostUsd,
    imageInputCostUsd,
    imageOutputCostUsd,
    totalCostUsd: textInputCostUsd + imageInputCostUsd + imageOutputCostUsd,
  };
};
