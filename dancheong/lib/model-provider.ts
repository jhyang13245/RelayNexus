import {upgradeLunaModel} from '../public/cortex-luna-model.mjs';
export type ModelProviderConfig = {
  textModel: string;
  imageModel: string;
  baseUrl: string;
  outputContract: string;
};

export const DEFAULT_MODEL_PROVIDER: ModelProviderConfig = {
  textModel: "gpt-6-luna",
  imageModel: "gpt-image-2.5-flare",
  baseUrl: "https://api.openai.com/v1",
  outputContract: "relay-nexus-live-v31",
};

const safeBaseUrl = (candidate: unknown) => {
  try {
    const url = new URL(String(candidate || DEFAULT_MODEL_PROVIDER.baseUrl));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" ||
        host.endsWith(".local") || /^10\.|^192\.168\.|^169\.254\.|^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)) throw new Error();
    return url.toString().replace(/\/$/u, "");
  } catch {
    return DEFAULT_MODEL_PROVIDER.baseUrl;
  }
};

export const normalizeModelProvider = (value?: Partial<ModelProviderConfig>): ModelProviderConfig => ({
  textModel: upgradeLunaModel(String(value?.textModel || DEFAULT_MODEL_PROVIDER.textModel).trim().slice(0, 120)),
  imageModel: String(value?.imageModel || DEFAULT_MODEL_PROVIDER.imageModel).trim().slice(0, 120),
  baseUrl: safeBaseUrl(value?.baseUrl),
  outputContract: String(value?.outputContract || DEFAULT_MODEL_PROVIDER.outputContract).trim().slice(0, 160),
});

export const providerEndpoint = (provider: ModelProviderConfig, path: string) =>
  `${provider.baseUrl}/${path.replace(/^\//u, "")}`;
