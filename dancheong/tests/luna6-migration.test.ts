import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { textCostUsd } from '../lib/api-cost';
import { openAIUsageFromResponse } from '../lib/live-story-runtime';
import ts from 'typescript';
import {upgradeLunaModel} from '../public/cortex-luna-model.mjs';
import {normalizeModelProvider} from '../lib/model-provider';

const source=fs.readFileSync('vendor/cortex/parts/09.part','utf8');
const costSource=source.slice(source.indexOf('  function apiCostV1430'),source.indexOf('  function apiDiagnosticV1391'));
const pricing=vm.createContext({asText:(value:unknown)=>String(value??'')});
vm.runInContext(costSource,pricing);

for(const [model,short,long] of [['gpt-6-luna',0.00119,0.0445],['gpt-5.6-luna',0.00258,0.0896]] as const)test(`${model} short/cache-write and long-context prices agree across server and reader`,()=>{
 for(const [input,cached,write,output,expected] of [[10000,4000,2000,1000,short],[300000,100000,20000,2000,long]]){
  const usage={input_tokens:input,input_tokens_details:{cached_tokens:cached,cache_write_tokens:write},output_tokens:output};
  const server=textCostUsd({model,inputTokens:input,cachedInputTokens:cached,cacheWriteTokens:write,outputTokens:output});
  const reader=pricing.apiCostV1430({model,role:'AUTHOR_PROSE'},usage).totalUsd;
  const live=openAIUsageFromResponse({model,usage},'live_writer',1,'low',100).estimatedCostUsd;
  for(const total of [server,reader,live])assert.ok(Math.abs(total-expected)<1e-12,`${total} != ${expected}`);
 }
});

test('restored provider settings upgrade without mutating the source, changing providers or other model families',()=>{
 for(const baseUrl of ['https://api.openai.com/v1','https://opencode.ai/zen/go/v1']){
  const source={textModel:'gpt-5.6-luna',baseUrl,imageModel:'gpt-image-2.5-flare'};
  assert.equal(normalizeModelProvider(source).textModel,'gpt-6-luna');assert.equal(normalizeModelProvider(source).baseUrl,baseUrl);assert.equal(source.textModel,'gpt-5.6-luna');
 }
 for(const model of ['muse-spark-1.3-contributor','gpt-5.6-sol','gpt-image-2.5-flare',undefined])assert.equal(upgradeLunaModel(model),model);
});

for(const provider of ['openai','go'])test(`VN ${provider} upgrades old requests but forwards the exact credential and output contract`,async()=>{
 const file=provider==='openai'?'app/api/vn/openai/[...path]/route.ts':'app/api/vn/go/responses/route.ts';
 const requests:any[]=[],exports:any={};let denied=false;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Response,TextDecoder,require:(name:string)=>name.includes('access')?{vnAccess:async()=>denied?Response.json({error:'denied'},{status:401}):null}:{upgradeLunaModel},fetch:async(url:string,options:any)=>{requests.push({url,...options});return Response.json({status:'completed',model:'gpt-6-luna'})}});
 const body={model:'gpt-5.6-luna',input:'Keep literal gpt-5.6-luna in this story.',reasoning:{effort:'medium'},max_output_tokens:4200,stream:true,text:{format:{type:'json_schema',name:'cast',schema:{type:'object'}}}};
 const request=(value=body)=>new Request(`https://test/api/vn/${provider}/responses`,{method:'POST',headers:{authorization:'Bearer fixture-existing-key','content-type':'application/json'},body:JSON.stringify(value)});
 const response=await exports.POST(request(),{params:Promise.resolve({path:['responses']})});assert.equal(response.status,200);
 const actual=requests[0];assert.equal(new Headers(actual.headers).get('authorization'),'Bearer fixture-existing-key');assert.deepEqual(JSON.parse(actual.body),{...body,model:'gpt-6-luna',...(provider==='go'?{store:false}:{})});
 assert.equal(actual.url,provider==='go'?'https://opencode.ai/zen/go/v1/responses':'https://api.openai.com/v1/responses');
 denied=true;assert.equal((await exports.POST(request(),{params:Promise.resolve({path:['responses']})})).status,401);assert.equal(requests.length,1);
});

test('Luna 6 emits the explicitly selected writer effort',()=>{
 const start=source.indexOf('  function writerReasoningParamsV268'),end=source.indexOf('  function engineReasoningParamsV253');
 const runtime=vm.createContext({settings:{writerReasoningEffort:'low'},asText:(v:unknown,f='')=>String(v??f)});
 vm.runInContext(source.slice(start,end),runtime);
 assert.equal(runtime.writerReasoningParamsV268('gpt-6-luna').reasoning.effort,'low');
 runtime.settings.writerReasoningEffort='medium';
 assert.equal(runtime.writerReasoningParamsV268('gpt-6-luna').reasoning.effort,'medium');
 assert.equal(runtime.writerReasoningParamsV268('gpt-5.6-luna').reasoning.effort,'medium');
});
