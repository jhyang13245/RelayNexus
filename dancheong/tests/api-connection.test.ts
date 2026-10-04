import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/openai/test/route";

const makeRequest = (apiKey: string, provider = "openai") =>
  new Request("http://localhost/api/openai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, provider }),
  });

test('Go Luna connection calls its Responses model and never requests Meta consent',async()=>{
 const previous=globalThis.fetch;let requested='';
 globalThis.fetch=(async(url,init)=>{requested=String(url);const body=JSON.parse(String(init?.body));assert.equal(body.model,'gpt-6-luna');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer go-luna-test');assert.equal(body.reasoning.effort,'none');return Response.json({model:'gpt-6-luna',status:'completed'})}) as typeof fetch;
 try{const response=await POST(makeRequest('go-luna-test','opencode-go-luna'));assert.equal(response.status,200);assert.equal(requested,'https://opencode.ai/zen/go/v1/responses');assert.equal((await response.json()).model,'gpt-6-luna');
  globalThis.fetch=(async()=>Response.json({error:{message:'Subscription required'}},{status:403})) as typeof fetch;
  const denied=await POST(makeRequest('go-luna-test','opencode-go-luna'));assert.equal(denied.status,403);const data=await denied.json();assert.match(data.error,/Go 구독/);assert.doesNotMatch(data.error,/Meta|Contributor/);
 }finally{globalThis.fetch=previous}
});

test("Luna 모델 접근을 확인하고 키를 응답에 노출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const suppliedKey = "sk-test-never-persist-this-value";
  let authorization = "";

  globalThis.fetch = (async (_input, init) => {
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return Response.json({ id: "gpt-6-luna" });
  }) as typeof fetch;

  try {
    const response = await POST(makeRequest(suppliedKey));
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.connected, true);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(authorization, `Bearer ${suppliedKey}`);
    assert.equal(JSON.stringify(body).includes(suppliedKey), false);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Muse Contributor의 Meta 데이터 동의 거절을 정확히 안내한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      { error: { code: "data_policy_consent_required", message: "Meta training consent required" } },
      { status: 403 },
    )) as typeof fetch;

  try {
    const response = await POST(makeRequest("go-test", "opencode-go"));
    const body = (await response.json()) as { error?: string };
    assert.equal(response.status, 403);
    assert.match(body.error ?? "", /Muse Spark 1\.3 Contributor/u);
    assert.match(body.error ?? "", /Meta 데이터 전송·학습 사용 동의/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("잘못된 API 키에는 이해하기 쉬운 오류를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      { error: { code: "invalid_api_key", message: "invalid" } },
      { status: 401 },
    )) as typeof fetch;

  try {
    const response = await POST(makeRequest("sk-invalid"));
    const body = (await response.json()) as { error?: string };

    assert.equal(response.status, 401);
    assert.match(body.error ?? "", /올바르지 않습니다/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
