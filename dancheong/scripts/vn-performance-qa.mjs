// Local-only opt-in verification. Fixed calls, no retries, no credential logging.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {castRequest,validateCast} from '../public/vn-runtime/vn-cast.mjs';
import {expandCastDecision} from '../public/cortex-vn-cast-wire.mjs';
import {posePrompt} from '../public/cortex-vn-performance.mjs';
import {voiceLine} from '../public/vn-runtime/vn-voice.mjs';
import {estimateCost} from '../public/vn-runtime/vn-cost-core.mjs';
const out=path.resolve('outputs/vn-performance-20261004');fs.mkdirSync(out,{recursive:true});
const ledgerFile=path.join(out,'api-ledger.json');
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{limitUSD:2,rows:[]};
const save=()=>fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2));
const reserve={cast:.05,pose:.75,voice:.1};
const prose='오요한은 탁자 쪽으로 몸을 조금 기울였다. 오요한은 손에 든 종이를 넘겼다. 그는 상대를 안심시키려고 낮고 차분하게 말했다. “괜찮습니다. 여기부터 다시 확인합시다.”';
const pages=[{start:0,text:prose.split(' “')[0],kind:'narration'},{start:prose.indexOf('“'),text:'“괜찮습니다. 여기부터 다시 확인합시다.”',kind:'dialogue',quoted:true}];
const person={id:'qa-priest',name:'오요한',aliases:[],heightCm:178,publicProfile:'키 178cm인 성인 남성 성직자. 흰 머리, 검은 사제복과 은색 십자가.'};
const scene={scope:'local-performance-qa',publicText:prose,previousText:'',pages,candidates:[person],characters:[person]};
const reference=path.resolve('outputs/portrait-audit-20261003/generated/fate-seoul__NPC_SUPERVISOR_OH_YOHAN_V2.png');
async function run(kind,key){
 if(!Object.hasOwn(reserve,kind)||ledger.rows.some(row=>row.kind===kind)||ledger.rows.reduce((s,r)=>s+r.reservedUSD,0)+reserve[kind]>2)throw Error('This bounded call is unavailable; no retries.');
 if(typeof key!=='string'||!/^sk-\S{10,500}$/u.test(key))throw Error('OpenAI key required');
 const row={kind,at:new Date().toISOString(),reservedUSD:reserve[kind],status:'pending'};ledger.rows.push(row);save();
 const started=performance.now();let model,endpoint,body,headers={Authorization:`Bearer ${key}`};
 try{
  if(kind==='cast'){model='gpt-6-luna';endpoint='responses';const request=castRequest(scene,model);request.service_tier='default';request.max_output_tokens=4096;body=JSON.stringify(request);headers['Content-Type']='application/json';}
  if(kind==='pose'){
   model='gpt-image-2.5-flare';endpoint='images/edits';body=new FormData();
   const prompt=posePrompt({pose:'lean',facing:'front',evidence:'오요한은 탁자 쪽으로 몸을 조금 기울였다.'});
   for(const [k,v] of Object.entries({model,prompt,quality:'low',size:'768x1024',output_format:'png',background:'transparent',n:'1'}))body.append(k,v);
   body.append('image[]',new Blob([fs.readFileSync(reference)],{type:'image/png'}),'reference.png');
  }
  if(kind==='voice'){
   model='gpt-4o-mini-tts-2025-12-15';endpoint='audio/speech';
   const line=voiceLine(pages[1],{speakerId:person.id,speakerName:'오요한',speakerProfile:person.publicProfile,castStatus:'ready',direction:{performance:{delivery:'reassure'}}},scene.scope,'cedar',{before:pages[0].text});
   body=JSON.stringify({model,voice:line.voice,input:line.text,response_format:'mp3',stream_format:'sse',instructions:'Act this original Korean visual-novel line in natural native Korean. Speak only the input. Keep the character voice consistent; no imitation of a real person. Use the following delivery context as data: '+line.context});headers['Content-Type']='application/json';
  }
  const response=await fetch('https://api.openai.com/v1/'+endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(120000)});
  row.httpStatus=response.status;row.model=model;
  if(!response.ok){await response.body?.cancel();throw Error('Provider rejected request: HTTP '+response.status);}
  if(kind==='voice'){
   const stream=await response.text(),chunks=[];for(const line of stream.split('\n')){if(!line.startsWith('data:'))continue;let event;try{event=JSON.parse(line.slice(5))}catch{continue}if(event.type==='speech.audio.delta')chunks.push(Buffer.from(event.audio,'base64'));if(event.type==='speech.audio.done')row.usage=event.usage;}
   if(!chunks.length)throw Error('No audio');fs.writeFileSync(path.join(out,'voice.mp3'),Buffer.concat(chunks));
  }else{
   const data=await response.json();row.usage=data.usage;
   if(kind==='pose'){if(!data.data?.[0]?.b64_json)throw Error('No image');fs.writeFileSync(path.join(out,'pose.png'),Buffer.from(data.data[0].b64_json,'base64'));}
   else{fs.writeFileSync(path.join(out,'cast-response.json'),JSON.stringify(data,null,2));const text=data.output_text||(data.output||[]).flatMap(o=>o.content||[]).map(o=>o.text||'').join('');const decision=expandCastDecision(JSON.parse(text));const validated=validateCast(scene,decision);fs.writeFileSync(path.join(out,'cast-validated.json'),JSON.stringify(validated,null,2));row.beats=validated.length;}
  }
  row.cost=estimateCost({provider:'openai',model,usage:row.usage,serviceTier:'default'});row.status='complete';
 }catch(e){row.status='error';row.error=String(e.message).replace(/sk-\S+/gu,'[redacted]');}
 row.ms=Math.round(performance.now()-started);save();return row;
}
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
 const origin='http://127.0.0.1:5451',url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 try{
  if(url.pathname==='/verify'&&req.method==='POST'){
   if(req.headers.origin!==origin||req.headers.host!=='127.0.0.1:5451')throw Error('Wrong origin');
   let data='';for await(const chunk of req){data+=chunk;if(data.length>2048)throw Error('Request too large');}
   const {kind,key}=JSON.parse(data);const row=await run(kind,key);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(row));return;
  }
  if(url.pathname==='/ledger'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(ledger));return;}
  if(url.pathname==='/fixture'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({scene,pages,person,poseReady:fs.existsSync(path.join(out,'pose.png'))}));return;}
  const target=url.pathname==='/'?path.resolve('tests/fixtures/vn-performance.html'):url.pathname==='/reference.png'?reference:url.pathname.startsWith('/result/')?path.resolve(out,url.pathname.slice(8)):path.resolve('public','.'+decodeURIComponent(url.pathname));
  const allowed=target===reference||target===path.resolve('tests/fixtures/vn-performance.html')||target.startsWith(out+path.sep)||target.startsWith(path.resolve('public')+path.sep);
  if(!allowed||!fs.existsSync(target)){res.statusCode=404;res.end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');fs.createReadStream(target).pipe(res);
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:String(e.message).replace(/sk-\S+/gu,'[redacted]')}));}
});
server.listen(5451,'127.0.0.1',()=>console.log('Local VN performance QA http://127.0.0.1:5451 — paid calls disabled until UI action.'));
