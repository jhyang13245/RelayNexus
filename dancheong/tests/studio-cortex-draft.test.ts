import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/studio/draft/route";
import { STUDIO_CORTEX_TARGET } from "../lib/studio-cortex-target";
import {draftFixture} from "./jieum/generated-fixture";
import engine from "../vendor/cortex/manifest.json";

test("Studio generation declares the bundled Cortex target and complete strict authoring schema", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: any[] = [];
  try {
    globalThis.fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return Response.json({ status: "completed", output_text: JSON.stringify(draftFixture(requestBodies.length === 1 ? "intelligent_canon" : "instant_story")) });
    };
    for (const runtime of ["intelligent_canon", "instant_story"]) {
      const response = await POST(new Request("https://nexus.test/api/studio/draft", {
        method: "POST", body: JSON.stringify({ apiKey: "sk-test-not-real", prompt: "기억을 잃은 기자가 경성의 미제 사건을 조사한다.", runtime }),
      }));
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.target, STUDIO_CORTEX_TARGET);
      assert.equal(payload.target.minimumTargetVersion, engine.version);
      assert.equal(payload.project.packageTarget, "cortex");
      assert.equal(payload.runtimeMode, runtime);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
    const body = requestBodies[0], schema = body.text.format.schema;
    assert.ok(schema.properties.routes);
    assert.equal(schema.properties.statusWindow,undefined);
    assert.equal(schema.properties.world.type,"string");
    assert.equal(schema.properties.opening.properties.replies.minItems,3);
    assert.ok(schema.properties.routes.items.properties.events.items.properties.closureConditions);
    const checkStrict = (node: any) => {
      assert.equal(node.uniqueItems, undefined, 'OpenAI strict schemas must not contain uniqueItems');
      if (node.type === "object") {
        assert.equal(node.additionalProperties, false);
        assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
        Object.values(node.properties).forEach(checkStrict);
      } else if (node.type === "array") checkStrict(node.items);
    };
    checkStrict(schema);
    globalThis.fetch = async () => Response.json({ status: "incomplete", output_text: "{}" });
    const incomplete = await POST(new Request("https://nexus.test/api/studio/draft", {
      method: "POST", body: JSON.stringify({ apiKey: "sk-test-not-real", prompt: "미완성 초안은 Studio로 전달하지 않는다." }),
    }));
    assert.equal(incomplete.status, 502);
  } finally { globalThis.fetch = originalFetch; }
});
