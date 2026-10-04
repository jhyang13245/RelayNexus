import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const pacing=fs.readFileSync('vendor/cortex/parts/08.part','utf8').split('  function createTypewriterV180')[1].split('  /* v1.19.0')[0];
const transport=fs.readFileSync('vendor/cortex/parts/09.part','utf8').split('  async function apiFetchV1390')[1].split('  /* v1.42.1')[0];

test('Go Luna routes every Responses call to Go and uses only the OpenAI key for images',async()=>{
 const requests=[];const context=vm.createContext({settings:{model:'gpt-6-luna',apiKey:'go-key'},NexusCortexTextProvider:'opencode-go-luna',NexusCortexTextModel:'gpt-6-luna',NexusCortexTextApiKey:'go-key',NexusCortexTextEndpoint:'/api/text/responses',NexusCortexImageEndpoint:'/api/image',NexusCortexImageApiKey:'openai-key',asText:v=>String(v??''),AbortController,Headers,Error,JSON,
 apiDiagnosticV1391:()=>({header(){},end(){},json(){}}),setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body),auth:new Headers(options.headers).get('authorization')});return Response.json({status:'completed'})}});
 vm.runInContext('async function apiFetchV1390'+transport,context);
 for(const format of ['prose','verdict','recommendations'])await(await context.apiFetchV1390('https://api.openai.com/v1/responses',{headers:{Authorization:'Bearer stale'},body:JSON.stringify({model:format==='verdict'?'gpt-5.6-luna':'gpt-6-luna',reasoning:{effort:format==='verdict'?'medium':'low'},input:format,stream:format==='prose'})})).json();
 for(const request of requests){assert.equal(request.url,'/api/text/responses');assert.equal(request.auth,'Bearer go-key');assert.equal(request.body.model,request.body.input==='verdict'?'gpt-5.6-luna':'gpt-6-luna');assert.equal(request.body.reasoning.effort,request.body.input==='verdict'?'medium':'low')}
 await(await context.apiFetchV1390('/api/image',{body:JSON.stringify({model:'gpt-image-2.5-flare',apiKey:'go-key',provider:{baseUrl:'https://opencode.ai/zen/go/v1'}})})).json();assert.equal(requests.at(-1).auth,'Bearer openai-key');assert.equal(requests.at(-1).body.apiKey,'openai-key');assert.equal(requests.at(-1).body.provider.baseUrl,'https://api.openai.com/v1');
 context.NexusCortexImageApiKey='';await assert.rejects(()=>context.apiFetchV1390('/api/image',{body:'{}'}),/OpenAI API 키/);
 context.NexusCortexTextProvider='openai';context.NexusCortexTextApiKey='openai-key';await context.apiFetchV1390('https://api.openai.com/v1/responses',{headers:{Authorization:'Bearer openai-key'},body:'{"model":"gpt-5.6-luna"}'});assert.equal(requests.at(-1).url,'https://api.openai.com/v1/responses');assert.equal(requests.at(-1).auth,'Bearer openai-key');
});

test('Muse and Luna natural pacing stays readable before and after approval without an opening multiplier',()=>{
 for(const model of ['muse-spark-1.3-contributor','gpt-5.6-luna','gpt-6-luna'])for(const speed of ['natural','slow','fast'])for(const approved of [false,true]){
  let time=0,sequence=0;const tasks=[];
  const context=vm.createContext({settings:{model,typingSpeed:speed},asText:v=>String(v??''),window:{},renderTurns(){},performance:{now:()=>time},requestAnimationFrame:fn=>fn(),setTimeout:(fn,ms)=>{tasks.push({fn,ms});return ++sequence}});
  vm.runInContext('function createTypewriterV180'+pacing,context);
  const turn={metrics:{}},writer=context.createTypewriterV180(turn),text='가나다라마바사\n\n아자차카타파하'.repeat(2);
  writer.push(text);if(approved)writer.approveAll(text);
  const opening=[],later=[];
  for(let i=0;i<60&&tasks.length;i++){
   const task=tasks.shift();time+=task.ms;const before=writer.displayed().length;task.fn();
   if(tasks.length&&before<7)opening.push(tasks.at(-1).ms);
   if(tasks.length&&before>=9&&writer.displayed().length<text.length)later.push(tasks.at(-1).ms);
   if(writer.displayed()===text)break;
  }
  const expected=approved?(speed==='natural'?32:speed==='slow'?24:16):speed==='natural'?46:speed==='slow'?72:20;
  assert.equal(opening[0],expected);
  assert.ok(later.includes(expected),'later paragraphs retain their normal pace');
  assert.equal(writer.displayed(),text);
 }
});

test('Muse reasoning gets bounded longer idle and total deadlines; Luna stays unchanged',async()=>{
 for(const [model,effort,idle,total] of [['muse-spark-1.3-contributor','low',90000,270000],['muse-spark-1.3-contributor','medium',120000,360000],['muse-spark-1.3-contributor','high',180000,540000],['gpt-5.6-luna','high',45000,180000],['gpt-6-luna','low',45000,180000]]){
  const delays=[];
  const context=vm.createContext({settings:{model,apiKey:'fake'},asText:v=>String(v??''),AbortController,Headers,Error,JSON,
   apiDiagnosticV1391:()=>({header(){},end(){},json(){}}),setTimeout:(fn,ms)=>{delays.push(ms);return delays.length},clearTimeout(){},
   fetch:async()=>Response.json({status:'completed'})});
  vm.runInContext('async function apiFetchV1390'+transport,context);
  const response=await context.apiFetchV1390('https://api.openai.com/v1/responses',{body:JSON.stringify({model,reasoning:{effort}})});
  await response.json();assert.deepEqual(delays,[total,idle,idle]);
 }
});

test('Muse recommendation auth is a single Bearer header for every casing and Headers input',async()=>{
 for(const headers of [{Authorization:'Bearer stale'},{authorization:'Bearer stale'},new Headers({Authorization:'Bearer stale'})]){
  let auth;
  const context=vm.createContext({settings:{model:'muse-spark-1.3-contributor',apiKey:'current-key'},asText:v=>String(v??''),AbortController,Headers,Error,JSON,
   apiDiagnosticV1391:()=>({header(){},end(){},json(){}}),setTimeout:()=>1,clearTimeout(){},
   fetch:async(url,options)=>{auth=new Headers(options.headers).get('authorization');return Response.json({status:'completed'})}});
  vm.runInContext('async function apiFetchV1390'+transport,context);
  await (await context.apiFetchV1390('https://opencode.ai/zen/go/v1/responses',{headers,body:'{}'})).json();
  assert.equal(auth,'Bearer current-key');assert.match(auth,/^Bearer \S{1,512}$/);
 }
});
