import { NextResponse } from "next/server";
import { resolveRequestApiKey } from "../../../../lib/server-api-key-policy";
import { STUDIO_CORTEX_TARGET } from "../../../../lib/studio-cortex-target";
import { jieumDraftSchema, jieumDraftInstruction, projectFromGeneratedDraft } from "../../../../features/jieum/generated-draft";
export const runtime = "nodejs";
const MODEL = "gpt-6-luna";
const STUDIO_BLUEPRINT_FORMAT = "RELAY_NEXUS_STUDIO_BLUEPRINT_V1";
const responseText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return "";
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { apiKey?: string; prompt?: string; runtime?: string };
    const prompt = String(body.prompt ?? "").trim().slice(0, 6000);
    const runtimeMode = body.runtime === "instant_story" ? "instant_story" : "intelligent_canon";
    if (prompt.length < 10) return NextResponse.json({ error: "만들고 싶은 이야기를 조금 더 구체적으로 적어 주세요." }, { status: 400 });
    const apiKey = resolveRequestApiKey({ suppliedKey: body.apiKey, serverKey: process.env.OPENAI_API_KEY, runtimeEnvironment: process.env.NODE_ENV });
    if (!apiKey) return NextResponse.json({ error: "설정에서 OpenAI API 키를 연결한 뒤 다시 시도해 주세요." }, { status: 400 });

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180000)]),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: "medium" },
        max_output_tokens: 20000,
        input: [
          { role: "system", content: jieumDraftInstruction(runtimeMode) },
          { role: "user", content: `다음 구상을 지음 작품 초안으로 작성하라.\n\n${prompt}` },
        ],
        text: { format: { type: "json_schema", name: "relay_studio_blueprint", strict: true, schema: jieumDraftSchema(runtimeMode) } },
      }),
    });
    const payload = await upstream.json() as Record<string, unknown>;
    if (!upstream.ok) {
      const detail = payload.error && typeof payload.error === "object" ? String((payload.error as { message?: unknown }).message ?? "") : "";
      return NextResponse.json({ error: detail || `지음 초안 생성 요청에 실패했습니다. (${upstream.status})` }, { status: upstream.status });
    }
    if (payload.status === "incomplete") return NextResponse.json({ error: "지음 초안 생성이 끝나지 않았습니다. 설정 범위를 줄여 다시 시도해 주세요." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    const text = responseText(payload);
    if (!text) return NextResponse.json({ error: "생성된 지음 초안을 읽지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
    const project = projectFromGeneratedDraft(JSON.parse(text), runtimeMode);
    return NextResponse.json({ format: STUDIO_BLUEPRINT_FORMAT, target: STUDIO_CORTEX_TARGET, runtimeMode, sourcePrompt: prompt, generatedAt: new Date().toISOString(), project: { ...project, packageTarget: "cortex" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "지음 초안을 만들지 못했습니다." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
