import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeTextProvider,prepareMuseResponsesRequest,prepareGoResponsesRequest,TEXT_PROVIDERS} from '../lib/text-provider';
import {validateNewSharedStory} from '../lib/multiplayer-new-story';
test('provider choice is allowlisted and Go uses the Responses endpoint/model',()=>{
  assert.equal(normalizeTextProvider('https://attacker.example'),'openai');
  assert.equal(TEXT_PROVIDERS.openai.model,'gpt-6-luna');
  assert.equal(TEXT_PROVIDERS['opencode-go-luna'].model,'gpt-6-luna');
  assert.equal(TEXT_PROVIDERS['opencode-go'].baseUrl,'https://opencode.ai/zen/go/v1');
  assert.equal(TEXT_PROVIDERS['opencode-go'].model,'muse-spark-1.3-contributor');
});
test('Muse receives enough response headroom and bounded reasoning effort',()=>{
  const request=prepareMuseResponsesRequest({model:'wrong',max_output_tokens:420,reasoning:{effort:'high'},stream:true,input:'story'});
  assert.equal(request.model,'muse-spark-1.3-contributor');
  assert.equal(request.max_output_tokens,16_384);
  assert.equal(request.store,false);
  assert.equal(request.stream,true);
  assert.deepEqual(request.reasoning,{effort:'high'});
  assert.deepEqual(prepareMuseResponsesRequest({stream:false,reasoning:{effort:'medium'}}).reasoning,{effort:'medium'});
  assert.equal(prepareMuseResponsesRequest({max_output_tokens:32_000}).max_output_tokens,32_000);
});
test('new shared stories cannot include progressed turns or a credential',()=>{
  const fresh={schema:'CORTEX_APP_STATE_V1390',scenario:{title:'test'},turns:[],settings:{}};
  assert.equal(validateNewSharedStory(fresh),fresh);
  assert.throws(()=>validateNewSharedStory({...fresh,turns:[{text:'old turn'}]}));
  assert.throws(()=>validateNewSharedStory({...fresh,settings:{apiKey:'private'}}));
});
test('Go transport leaves image keys separate and preserves legacy OpenAI transport',()=>{
  const source=fs.readFileSync('vendor/cortex/parts/09.part','utf8');
  assert.match(source,/body\.model=textModel;/);
  assert.doesNotMatch(source,/delete body\.reasoning/);
  assert.match(source,/NexusCortexTextApiKey\|\|settings\.apiKey/);
  assert.match(source,/NexusCortexTextModel\|\|settings\.model/);
  assert.match(source,/body.apiKey=globalThis.NexusCortexImageApiKey/);
  const proxy=fs.readFileSync('app/api/text/responses/route.ts','utf8');
  assert.match(proxy,/await requireAccountContext\(\)/);
  assert.match(proxy,/prepareGoResponsesRequest\(await request\.json\(\)\)/);
  assert.doesNotMatch(proxy,/process.env.OPENAI_API_KEY/);
});

for(const model of ['gpt-6-luna','gpt-5.6-luna','gpt-5.6-luna-2026-06-01'])test(`Go ${model} uses Luna 6 and preserves Responses schema, reasoning and budget without Muse coercion`,()=>{
  assert.equal(normalizeTextProvider('opencode-go-luna'),'opencode-go-luna');
  const body={model,stream:true,input:'approved prose',max_output_tokens:4096,reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'recommendations',schema:{type:'object'}}}};
  assert.deepEqual(prepareGoResponsesRequest(body),{...body,model:'gpt-6-luna',store:false});
  assert.equal(prepareGoResponsesRequest({model:'muse-spark-1.3-contributor'}).model,'muse-spark-1.3-contributor');
  assert.throws(()=>prepareGoResponsesRequest({model:'gpt-6-astra'}),/UNSUPPORTED_GO_MODEL/);
  assert.throws(()=>prepareGoResponsesRequest({}),/UNSUPPORTED_GO_MODEL/);
  assert.equal(TEXT_PROVIDERS['opencode-go-luna'].baseUrl,'https://opencode.ai/zen/go/v1');
});
test('settings provides compact official and workspace-specific Go actions',()=>{
  const selector=fs.readFileSync('app/text-provider-selector.tsx','utf8');
  const css=fs.readFileSync('app/globals.css','utf8');
  assert.match(selector,/href="https:\/\/opencode\.ai\/go"/);
  assert.match(selector,/href="https:\/\/opencode\.ai\/workspace\/wrk_01M238PB85R2MWXNEH4SCK42E1\/go"/);
  assert.match(selector,/내 Go 구독·결제/u);
  assert.match(selector,/Muse 추론 강도/u);
  assert.match(selector,/\['low','낮음'\],\['medium','보통'\],\['high','높음'\]/u);
  assert.match(css,/\.opencode-go-guide\{/u);
  assert.match(css,/\.muse-reasoning-selector\{/u);
  assert.match(css,/\.theme-light \.settings-dialog :is\(/u);
  assert.ok(selector.includes("['openai','opencode-go-luna','opencode-go']"));
  assert.doesNotMatch(selector,/className="luna-provider-selector"/u);
  assert.match(css,/\.theme-dark \.text-provider-selector\{/u);
  assert.match(css,/--api-surface:#222c30/u);
});
