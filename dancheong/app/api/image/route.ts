import { NextResponse } from "next/server";

import { resolveRequestApiKey } from "../../../lib/server-api-key-policy";
import { normalizeModelProvider, providerEndpoint } from "../../../lib/model-provider";
import { imageCostBreakdown, type ImageTokenUsage } from "../../../lib/api-cost";

export const runtime = "nodejs";

type ImageResponse = {
  data?: Array<{ b64_json?: string }>;
  usage?: ImageTokenUsage;
  error?: {
    code?: string;
    message?: string;
    param?: string;
    type?: string;
  };
};

type ImageRequest = {
  model?: string;
  allowFallback?: boolean;
  prompt?: string;
  apiKey?: string;
  purpose?: "scene" | "character";
  quality?: "low" | "medium";
  aspect?: "landscape" | "portrait" | "square";
  referenceImages?: string[];
  provider?: {
    imageModel?: string;
    baseUrl?: string;
  };
};

const SUPPORTED_REFERENCE =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
// Image edits support up to 16 inputs. Never silently discard a cast member.
const MAX_REFERENCE_IMAGES = 16;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_TOTAL_BYTES = 24 * 1024 * 1024;
const PRIMARY_IMAGE_MODEL = "gpt-image-2.5-flare";
const FALLBACK_IMAGE_MODEL = "gpt-image-2";
const IMAGE_SIZES = {
  landscape: { source: "1088x608", playback: "854x480" },
  portrait: { source: "768x1024", playback: "480x640" },
  square: { source: "1024x1024", playback: "480x480" },
} as const;

const referenceBlob = (dataUrl: string, index: number) => {
  const match = dataUrl.match(SUPPORTED_REFERENCE);
  if (!match) {
    throw new Error(`참조 이미지 ${index + 1}의 형식이 올바르지 않습니다.`);
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new Error(`참조 이미지 ${index + 1}은 8MB 이하여야 합니다.`);
  }
  const extension = match[1] === "image/jpeg"
    ? "jpg"
    : match[1].split("/")[1];
  return {
    blob: new Blob([bytes], { type: match[1] }),
    bytes: bytes.byteLength,
    fileName: `character-reference-${index + 1}.${extension}`,
  };
};

const isModelAccessFailure = (status: number, result: ImageResponse) => {
  const code = result.error?.code?.toLowerCase() ?? "";
  const message = result.error?.message?.toLowerCase() ?? "";
  return ["model_not_allowed", "model_not_found", "organization_verification_required", "unsupported_model"]
    .includes(code) ||
    ([400, 403, 404].includes(status) &&
      /(?:organization must be verified|verify(?: your)? organization|not (?:allowed|authorized) to use|does not have access to|model .* (?:unavailable|not found))/u.test(message));
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ImageRequest;
    // Text-provider settings must never route the OpenAI image key to Muse or
    // another host. This endpoint supports OpenAI image models exclusively.
    const provider = normalizeModelProvider();
    const apiKey = resolveRequestApiKey({
      suppliedKey: body.apiKey,
      serverKey: process.env.OPENAI_API_KEY,
      runtimeEnvironment: process.env.NODE_ENV,
    });
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API 키가 없어 장면 이미지를 생성하지 않았습니다." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (apiKey.length > 512) {
      return NextResponse.json(
        { error: "API 키 형식이 너무 깁니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const prompt = body.prompt?.trim().slice(0, 16000);
    if (!prompt || prompt.length < 10) {
      return NextResponse.json(
        { error: "장면 이미지 프롬프트가 필요합니다." },
        { status: 400 },
      );
    }

    if (
      body.quality !== undefined &&
      body.quality !== "low" &&
      body.quality !== "medium"
    ) {
      return NextResponse.json(
        { error: "이미지 품질은 low 또는 medium만 선택할 수 있습니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const quality = body.quality === "low" ? "low" : "medium";
    if (
      body.aspect !== undefined &&
      body.aspect !== "landscape" &&
      body.aspect !== "portrait" &&
      body.aspect !== "square"
    ) {
      return NextResponse.json(
        { error: "이미지 비율은 landscape, portrait, square 중에서 선택해야 합니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const aspect = body.aspect ?? "landscape";
    const imageSize = IMAGE_SIZES[aspect];

    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages
      : [];
    if (referenceImages.length > MAX_REFERENCE_IMAGES) {
      return NextResponse.json(
        { error: `참조 이미지는 최대 ${MAX_REFERENCE_IMAGES}개까지 사용할 수 있습니다.` },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const referenceCount = referenceImages.length;
    const requestImage = async (model: string) => {
      if (referenceImages.length > 0) {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", prompt);
        form.append("size", imageSize.source);
        form.append("quality", quality);
        form.append("output_format", "jpeg");
        form.append("output_compression", "82");
        form.append("background", "opaque");
        form.append("moderation", "auto");
        form.append("n", "1");
        // Flare rejects this option with invalid_input_fidelity_model (verified
        // against the live API). Both Flare and GPT-Image-2 use native fidelity.
        let totalBytes = 0;
        referenceImages.forEach((dataUrl, index) => {
          const reference = referenceBlob(dataUrl, index);
          totalBytes += reference.bytes;
          if (totalBytes > MAX_REFERENCE_TOTAL_BYTES) {
            throw new Error("참조 이미지 전체 용량은 24MB 이하여야 합니다.");
          }
          form.append("image[]", reference.blob, reference.fileName);
        });
        return fetch(providerEndpoint(provider, "images/edits"), {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
      }
      return fetch(providerEndpoint(provider, "images/generations"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size: imageSize.source,
          quality,
          output_format: "jpeg",
          output_compression: 82,
          background: "opaque",
          moderation: "auto",
          n: 1,
        }),
      });
    };
    const readProviderResponse = async (response: Response) => {
      const responseText = await response.text();
      try {
        return JSON.parse(responseText) as ImageResponse;
      } catch {
        return null;
      }
    };

    let imageModel = PRIMARY_IMAGE_MODEL;
    let response = await requestImage(imageModel);
    let result = await readProviderResponse(response);
    if (body.allowFallback !== false && result && !response.ok && isModelAccessFailure(response.status, result)) {
      imageModel = FALLBACK_IMAGE_MODEL;
      response = await requestImage(imageModel);
      result = await readProviderResponse(response);
    }
    if (!result) {
      if (!response.ok) {
        return NextResponse.json(
          { error: `이미지 API가 ${response.status} 상태를 반환했습니다.` },
          { status: response.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { error: "이미지 API 응답을 읽지 못했습니다." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!response.ok) {
      const accessRequired = isModelAccessFailure(response.status, result) || response.status === 401 || response.status === 403;
      const message =
        ["moderation_blocked", "content_policy_violation", "safety_violation"].includes(result.error?.code ?? "")
          ? "안전 기준으로 인해 이 장면 이미지를 만들 수 없습니다. 장면 내용 또는 참조 이미지를 조정해 주세요. 같은 요청의 자동 재시도는 하지 않습니다."
          : accessRequired
            ? "현재 API 연결에 이미지 생성 권한이 없습니다. 설정에서 API 키의 조직 인증과 모델 사용 권한을 확인해 주세요. 텍스트 플레이는 계속할 수 있습니다."
            : response.status === 429
              ? "이미지 API의 사용 한도에 도달했습니다. 잠시 후 다시 시도하거나 API 사용 한도를 확인해 주세요."
              : response.status === 400
                ? "이미지 요청의 내용·참조 이미지 또는 옵션이 거절됐습니다. 아래 진단 코드를 확인해 주세요. 본문은 그대로 보존됩니다."
                : "이미지 제공자가 요청을 완료하지 못했습니다. 플레이 기록은 유지됩니다. 잠시 후 다시 시도해 주세요.";
      const diagnostic = { status: response.status, code: String(result.error?.code ?? "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0,100), parameter: String(result.error?.param ?? "").replace(/[^a-zA-Z0-9_.\[\]-]/g, "").slice(0,100), requestId: (response.headers.get("x-request-id") ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0,150) };
      return NextResponse.json(
        { error: message, diagnostic, code: diagnostic.code || null, reason: accessRequired ? "IMAGE_ACCESS_REQUIRED" : "IMAGE_PROVIDER_ERROR", requestedModel: PRIMARY_IMAGE_MODEL, attemptedModel: imageModel, retryable: !accessRequired && response.status >= 500 },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const base64 = result.data?.[0]?.b64_json;
    if (!base64) {
      return NextResponse.json(
        { error: "생성된 이미지 데이터를 찾지 못했습니다." },
        { status: 502 },
      );
    }

    const inputFidelity = referenceCount
      ? "default"
      : "none";
    const cost = imageCostBreakdown({
      model: imageModel,
      usage: result.usage,
      prompt,
      quality,
      referenceCount,
      inputFidelity,
      category: body.purpose === "character" ? "character_image" : "scene_image",
    });

    return NextResponse.json({
      imageUrl: `data:image/jpeg;base64,${base64}`,
      quality,
      size: imageSize.playback,
      sourceSize: imageSize.source,
      aspect,
      purpose: body.purpose === "character" ? "character" : "scene",
      model: imageModel,
      requestedModel: PRIMARY_IMAGE_MODEL,
      modelFallback: imageModel !== PRIMARY_IMAGE_MODEL,
      referenceCount,
      inputFidelity,
      usage: result.usage ?? null,
      cost,
      estimatedCostUsd: cost.totalCostUsd,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "장면 이미지 요청을 처리하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
