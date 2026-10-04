import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/image/route";

test('Muse text settings cannot redirect the image key or reference images', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const references of [[], ['data:image/png;base64,cGljdHVyZQ==']]) {
    let endpoint = '';
    globalThis.fetch = async (input, init) => {
      endpoint = String(input);
      assert.equal((init?.headers as Record<string,string>).Authorization, 'Bearer sk-image-only');
      return new Response(generatedPayload, {status:200,headers:{'Content-Type':'application/json'}});
    };
    const response = await POST(new Request('https://local/api/image', {method:'POST',body:JSON.stringify({
      apiKey:'sk-image-only',prompt:'A fully clothed person reading in a sunny library.',
      provider:{baseUrl:'https://opencode.ai/zen/go/v1'},referenceImages:references,
    })}));
    assert.equal(response.status,200);
    assert.equal(endpoint, 'https://api.openai.com/v1/images/'+(references.length?'edits':'generations'));
  }
});

test("sixteen reference images are accepted without truncation", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedBody: BodyInit | null | undefined;
  globalThis.fetch = async (_input, init) => {
    requestedBody = init?.body;
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const references = Array.from(
    { length: 16 },
    (_, index) => `data:image/png;base64,${Buffer.from(`tiny-16-${index}`).toString("base64")}`
  );
  const prompt = "Sixteen tiny references are forwarded without truncation for this sufficiently long scene prompt";
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt,
      quality: "low",
      referenceImages: references,
    }),
  }));
  const result = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.ok(requestedBody instanceof FormData);
  const form = requestedBody as FormData;
  assert.equal(form.getAll("image[]").length, 16);
  assert.equal(result.referenceCount, 16);
});

test("seventeen reference images are rejected before provider calls", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const references = Array.from(
    { length: 17 },
    (_, index) => `data:image/png;base64,${Buffer.from(`tiny-17-${index}`).toString("base64")}`
  );
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "Seventeen tiny references must be rejected before any provider call for this sufficiently long prompt",
      quality: "low",
      referenceImages: references,
    }),
  }));

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("three distinct references are forwarded unchanged and in order", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedBody: BodyInit | null | undefined;
  globalThis.fetch = async (_input, init) => {
    requestedBody = init?.body;
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const tiny = ["tiny-alpha", "tiny-beta", "tiny-gamma"];
  const references = tiny.map((value) => `data:image/png;base64,${Buffer.from(value).toString("base64")}`);
  const prompt = "Three distinct tiny references are forwarded unchanged in order for this sufficiently long scene prompt";
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt,
      quality: "low",
      referenceImages: references,
    }),
  }));
  const result = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.ok(requestedBody instanceof FormData);
  const form = requestedBody as FormData;
  assert.equal(form.get("model"), "gpt-image-2.5-flare");
  assert.equal(form.get("prompt"), prompt);
  const sent = form.getAll("image[]");
  assert.equal(sent.length, 3);
  assert.equal(result.referenceCount, 3);
  for (let index = 0; index < references.length; index++) {
    const entry = sent[index];
    assert.ok(entry instanceof Blob);
    assert.equal(await (entry as Blob).text(), tiny[index]);
  }
});

const generatedPayload = JSON.stringify({
  data: [{ b64_json: Buffer.from("generated-image").toString("base64") }],
  usage: {
    input_tokens: 1_100,
    input_tokens_details: { text_tokens: 200, image_tokens: 900 },
    output_tokens: 208,
    output_tokens_details: { image_tokens: 208 },
    total_tokens: 1_308,
  },
});

test('Flare reference edits omit the option rejected by the live API', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const forms: FormData[] = [];
  globalThis.fetch = async (_url, init) => { forms.push(init!.body as FormData); const invalid=forms.at(-1)!.has('input_fidelity');return new Response(invalid ? JSON.stringify({error:{code:'invalid_input_fidelity_model',param:'input_fidelity'}}) : generatedPayload,{status:invalid ? 400 : 200}); };
  const response = await POST(new Request('https://local/api/image',{method:'POST',body:JSON.stringify({apiKey:'fake',prompt:'A fully clothed character standing in a sunny courtyard.',referenceImages:['data:image/png;base64,cGljdHVyZQ==']})}));
  assert.equal(response.status,200); assert.equal(forms.length,1);
  assert.equal(forms[0].get('model'),'gpt-image-2.5-flare'); assert.equal(forms[0].has('input_fidelity'),false); assert.equal(forms[0].getAll('image[]').length,1);
  assert.equal((await response.json()).inputFidelity,'default');
});

test('moderation and ordinary 400 errors are not retried and preserve safe diagnostics', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  for(const code of ['content_policy_violation','invalid_value']) {
    let calls=0; globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code,param:'image',message:'PRIVATE PROVIDER DETAIL'}}),{status:400,headers:{'x-request-id':'req_test'}})};
    const response=await POST(new Request('https://local/api/image',{method:'POST',body:JSON.stringify({apiKey:'fake',prompt:'A character standing in a sunny courtyard.'})}));
    const result=await response.json(); assert.equal(calls,1); assert.equal(response.status,400);assert.equal(result.diagnostic.code,code);assert.equal(result.diagnostic.requestId,'req_test');assert.equal(result.retryable,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE PROVIDER/);
    if(code==='content_policy_violation')assert.match(result.error,/안전 기준/);
  }
});

test("기준 이미지가 없으면 GPT Image 생성 엔드포인트를 사용한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = init?.body;
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "character",
      prompt: "애니메이션 본편 속 신규 주요 캐릭터의 첫 등장 장면",
      quality: "low",
      referenceImages: [],
    }),
  }));
  const result = await response.json() as Record<string, unknown>;

  assert.match(requestedUrl, /\/v1\/images\/generations$/);
  assert.equal(typeof requestedBody, "string");
  const generationRequest = JSON.parse(String(requestedBody));
  assert.equal(generationRequest.quality, "low");
  assert.equal(generationRequest.size, "1088x608");
  assert.equal(generationRequest.output_format, "jpeg");
  assert.equal(generationRequest.model, "gpt-image-2.5-flare");
  assert.equal(result.quality, "low");
  assert.equal(result.size, "854x480");
  assert.equal(result.sourceSize, "1088x608");
  assert.equal(result.referenceCount, 0);
  assert.equal(result.purpose, "character");
});

test("캐릭터 기준 이미지가 있으면 image[] 참조 편집 엔드포인트를 사용한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = init?.body;
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const reference = `data:image/webp;base64,${Buffer.from("reference-image").toString("base64")}`;
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "참조 캐릭터가 복도에서 대화하는 TV 애니메이션 정지 장면",
      quality: "medium",
      referenceImages: [reference],
    }),
  }));
  const result = await response.json() as Record<string, unknown>;

  assert.match(requestedUrl, /\/v1\/images\/edits$/);
  assert.ok(requestedBody instanceof FormData);
  assert.equal(requestedBody.getAll("image[]").length, 1);
  assert.equal(requestedBody.get("quality"), "medium");
  assert.equal(requestedBody.get("size"), "1088x608");
  assert.equal(requestedBody.get("output_format"), "jpeg");
  assert.equal(requestedBody.get("model"), "gpt-image-2.5-flare");
  assert.equal(requestedBody.has("input_fidelity"), false);
  assert.equal(result.referenceCount, 1);
  assert.equal(result.inputFidelity, "default");
  const cost = result.cost as Record<string, unknown>;
  assert.equal(cost.measured, true);
  assert.ok(Math.abs(Number(cost.totalCostUsd) - 0.01444) < 1e-12);
});

test("캐릭터 대표 사진 참조는 최대 열여섯 장으로 제한한다", async () => {
  const reference = `data:image/png;base64,${Buffer.from("reference-image").toString("base64")}`;
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "세 명의 참조 캐릭터가 등장하는 애니메이션 장면을 요청한다",
      quality: "low",
      referenceImages: Array(17).fill(reference),
    }),
  }));
  assert.equal(response.status, 400);
  assert.match(String((await response.json() as { error?: string }).error), /최대 16개/);
});

test("지원하지 않는 이미지 품질은 API 호출 전에 거부한다", async () => {
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "애니메이션 본편 속 장면을 생성하기 위한 충분히 긴 프롬프트",
      quality: "high",
      referenceImages: [],
    }),
  }));
  const result = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.match(String(result.error), /low 또는 medium/);
});

test("세로 비율은 캐릭터 일러스트에 맞는 3:4 원본과 재생 크기로 전환한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedBody: BodyInit | null | undefined;
  globalThis.fetch = async (_input, init) => {
    requestedBody = init?.body;
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "세로형 모바일 화면에 맞춘 애니메이션 본편 장면을 생성한다",
      quality: "medium",
      aspect: "portrait",
      referenceImages: [],
    }),
  }));
  const result = await response.json() as Record<string, unknown>;
  const generationRequest = JSON.parse(String(requestedBody));

  assert.equal(generationRequest.size, "768x1024");
  assert.equal(result.sourceSize, "768x1024");
  assert.equal(result.size, "480x640");
  assert.equal(result.aspect, "portrait");
});

test("지원하지 않는 이미지 비율은 API 호출 전에 거부한다", async () => {
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "애니메이션 본편 속 장면을 생성하기 위한 충분히 긴 프롬프트",
      quality: "low",
      aspect: "panorama",
      referenceImages: [],
    }),
  }));
  const result = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.match(String(result.error), /landscape, portrait, square/);
});

test("모든 이미지 모델의 권한 오류를 한국어 안내로 분류하고 제공자 원문은 노출하지 않는다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: "model_not_allowed",
      message: "This API project is not allowed to use gpt-image-2.5-flare.",
    },
  }), { status: 403, headers: { "Content-Type": "application/json" } });

  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      prompt: "충분히 긴 장면 이미지 프롬프트를 사용해 오류 전달을 확인한다",
      quality: "low",
    }),
  }));
  const result = await response.json() as { error?: string; code?: string };

  assert.equal(response.status, 403);
  assert.equal(result.code, "model_not_allowed");
  assert.match(result.error ?? "", /조직 인증과 모델 사용 권한/u);
  assert.doesNotMatch(result.error ?? "", /This API project|not allowed/u);
});

test("Flare 조직 검증이 없으면 GPT-Image-2로 자동 전환하고 실제 모델 비용을 기록한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requestedModels: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model?: string };
    requestedModels.push(String(body.model));
    if (body.model === "gpt-image-2.5-flare") {
      return new Response(JSON.stringify({
        error: {
          code: "organization_verification_required",
          message: "Your organization must be verified to use the model `gpt-image-2.5-flare`.",
        },
      }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      prompt: "조직 검증 여부와 무관하게 완성되어야 하는 충분히 긴 장면 이미지 프롬프트",
      quality: "medium",
    }),
  }));
  const result = await response.json() as {
    model?: string;
    requestedModel?: string;
    modelFallback?: boolean;
    cost?: { model?: string; totalCostUsd?: number };
  };

  assert.equal(response.status, 200);
  assert.deepEqual(requestedModels, ["gpt-image-2.5-flare", "gpt-image-2"]);
  assert.equal(result.requestedModel, "gpt-image-2.5-flare");
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.modelFallback, true);
  assert.equal(result.cost?.model, "gpt-image-2");
  assert.ok(Number(result.cost?.totalCostUsd) > 0);
});

test("기준 이미지가 있는 Flare 요청도 GPT-Image-2 복구 시 전용 fidelity 옵션을 제거한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requestedBodies: FormData[] = [];
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.body instanceof FormData);
    requestedBodies.push(init.body);
    if (init.body.get("model") === "gpt-image-2.5-flare") {
      return new Response(JSON.stringify({
        error: {
          code: "organization_verification_required",
          message: "Your organization must be verified to use the model `gpt-image-2.5-flare`.",
        },
      }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    return new Response(generatedPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const reference = `data:image/webp;base64,${Buffer.from("reference-image").toString("base64")}`;
  const response = await POST(new Request("http://local/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "sk-test",
      purpose: "scene",
      prompt: "기준 인물 사진을 유지하면서 장면 이미지를 완성하는 충분히 긴 프롬프트",
      quality: "medium",
      referenceImages: [reference],
    }),
  }));
  const result = await response.json() as {
    model?: string;
    modelFallback?: boolean;
    inputFidelity?: string;
    cost?: { inputFidelity?: string };
  };

  assert.equal(response.status, 200);
  assert.equal(requestedBodies.length, 2);
  assert.equal(requestedBodies[0].get("model"), "gpt-image-2.5-flare");
  assert.equal(requestedBodies[0].has("input_fidelity"), false);
  assert.equal(requestedBodies[0].getAll("image[]").length, 1);
  assert.equal(requestedBodies[1].get("model"), "gpt-image-2");
  assert.equal(requestedBodies[1].has("input_fidelity"), false);
  assert.equal(requestedBodies[1].getAll("image[]").length, 1);
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.modelFallback, true);
  assert.equal(result.inputFidelity, "default");
  assert.equal(result.cost?.inputFidelity, "default");
});
