import { NextResponse } from "next/server";
import { normalizeTextProvider, TEXT_PROVIDERS } from '../../../../lib/text-provider';

import { resolveRequestApiKey } from "../../../../lib/server-api-key-policy";

export const runtime = "nodejs";

type ModelResponse = {
  id?: string;
  model?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

const museErrorMessageFor = (status: number, result: ModelResponse): string => {
  const upstream = `${result.error?.code || ""} ${result.error?.message || ""}`.toLowerCase();
  const consentRejected = /(consent|training|data[ _-]?(?:sharing|policy)|meta|contributor)/u.test(upstream);
  if (consentRejected || status === 403) {
    return "Muse Spark 1.3 Contributor 연결이 허용되지 않았습니다. OpenCode Go 워크스페이스에서 Meta 데이터 전송·학습 사용 동의를 켠 뒤 다시 연결해 주세요. 지역 또는 구독 제한으로도 거절될 수 있습니다.";
  }
  if (status === 401) return "OpenCode Go API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.";
  if (status === 404) return "이 OpenCode Go 워크스페이스에서 Muse Spark 1.3 Contributor를 사용할 수 없습니다.";
  if (status === 429) return "OpenCode Go 요청 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.";
  return `Muse Spark 1.3 Contributor 연결을 확인하지 못했습니다. Go 구독·API 키·Meta 데이터 전송 동의·모델 제공 지역을 확인해 주세요. (${status})`;
};

const errorMessageFor = (status: number): string => {
  if (status === 401) return "API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.";
  if (status === 403) {
    return "이 API 키에서 GPT-6 Luna를 사용할 권한이 없습니다.";
  }
  if (status === 404) {
    return "이 OpenAI 프로젝트에서 GPT-6 Luna 모델을 찾을 수 없습니다.";
  }
  if (status === 429) {
    return "OpenAI 요청 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.";
  }
  return `OpenAI 연결 확인에 실패했습니다. (${status})`;
};

const goLunaErrorMessageFor = (status: number): string => {
  if (status === 401) return 'OpenCode Go API 키를 다시 확인해 주세요. OpenAI 키와는 별개입니다.';
  if (status === 403 || status === 404) return '이 워크스페이스에서 GPT 6 Luna를 사용할 수 없습니다. Go 구독·모델 접근 권한을 확인해 주세요.';
  if (status === 429) return 'OpenCode Go 이용 한도에 도달했습니다. Go 콘솔에서 한도와 갱신 시점을 확인해 주세요.';
  return `OpenCode Go의 Luna 연결을 확인하지 못했습니다. (${status})`;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { apiKey?: string; provider?: string };
    const provider = normalizeTextProvider(body.provider), config = TEXT_PROVIDERS[provider];
    const apiKey = resolveRequestApiKey({
      suppliedKey: body.apiKey,
      serverKey: provider === 'openai' ? process.env.OPENAI_API_KEY : undefined,
      runtimeEnvironment: process.env.NODE_ENV,
    });

    if (!apiKey) {
      return NextResponse.json(
        { connected: false, error: provider === 'openai' ? 'OpenAI API 키를 입력해 주세요.' : 'OpenCode Go API 키를 입력해 주세요.' },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (apiKey.length > 512) {
      return NextResponse.json(
        { connected: false, error: "API 키 형식이 너무 깁니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = await fetch(
      provider === 'openai' ? `${config.baseUrl}/models/${encodeURIComponent(config.model)}` : `${config.baseUrl}/responses`,
      {
        method: provider === 'openai' ? 'GET' : 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': 'dancheong/1.21', 'x-opencode-session': 'dancheong-connection-test' },
        ...(provider !== 'openai' ? {body: JSON.stringify({model:config.model,input:'Reply OK.',max_output_tokens:256,reasoning:{effort:provider==='opencode-go-luna'?'none':'low'},stream:false,store:false})} : {}),
        cache: "no-store",
      },
    );
    const result = (await response.json()) as ModelResponse;

    if (!response.ok || (provider === 'openai' ? result.id !== config.model : Boolean(result.error) || !result.model?.startsWith(config.model))) {
      return NextResponse.json(
        { connected: false, error: provider === 'openai' ? errorMessageFor(response.status) : provider === 'opencode-go-luna' ? goLunaErrorMessageFor(response.status) : museErrorMessageFor(response.status, result) },
        { status: response.ok ? 502 : response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { connected: true, model: config.model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { connected: false, error: "연결 확인 요청을 처리하지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
