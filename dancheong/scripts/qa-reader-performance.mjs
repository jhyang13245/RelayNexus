import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
const beatCount=Number(process.argv[2]||300);assert.ok(Number.isSafeInteger(beatCount)&&beatCount>=30&&beatCount<=10000);
const scenario=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
fs.mkdirSync('outputs/performance-v1220',{recursive:true});
try{
 // A local pre-change inspector copy enables optional A/B measurements.
 for(const variant of fs.existsSync('work/inspector-before-v1220.js')?['before','after']:['after'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:5198')return route.abort();
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   if(variant==='before'&&url.pathname==='/cortex-nexus-view.js'&&fs.existsSync('work/view-before-v1220.js'))return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync('work/view-before-v1220.js','utf8')});
   if(url.pathname==='/cortex-nexus-inspector.js'){
    const code=fs.readFileSync(variant==='before'?'work/inspector-before-v1220.js':'public/cortex-nexus-inspector.js','utf8').replace('const update=()=>{','const update=window.__perfUpdate=()=>{window.__perfUpdates=(window.__perfUpdates||0)+1;');
    return route.fulfill({status:200,contentType:'application/javascript',body:code});
   }return route.continue();
  });
  await page.goto('http://127.0.0.1:5198/cortex.html?session=isolated-perf-'+variant+'-'+width);await page.waitForFunction(()=>window.__perfUpdate);
  await page.evaluate(({scenario,beatCount})=>{
   scenario.title='긴 세션 성능 검수';const text='햇살이 서가 사이로 번졌다. 두 사람은 창가에 앉아 다음 여행을 의논했다. '.repeat(20);
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const paint=canvas.getContext('2d');paint.fillStyle='#184c3b';paint.fillRect(0,0,640,360);paint.fillStyle='white';paint.font='32px serif';paint.fillText('장면 이미지 검수',100,180);const image=canvas.toDataURL('image/png');
   const turns=Array.from({length:beatCount},(_,i)=>({id:'perf-'+i,input:'입력 '+(i+1)+'\n  다음 줄',status:'COMMITTED',text,imageUrl:i%3===0?image:'',apiLog:Array.from({length:4},(_,j)=>({id:i+'-'+j,role:'writer',status:'SUCCESS',model:'fixture',usage:{inputTokens:1000,cachedTokens:500,outputTokens:500},cost:{totalUsd:0.001,category:'story',measured:true},totalMs:100})),metrics:{authorRecommendations:{status:'ACCEPTED'}},recommendations:['책을 살핀다','길을 나선다','잠시 기다린다'].map((label,j)=>({label,risk:['LOW','MEDIUM','HIGH'][j],source:'SAME_TURN_PROSE_WRITER'}))}));
   window.__DANCHEONG_NEW_ENGINE_TEST__.applyImportedState({scenario,turns},{persistState:false});
  },{scenario,beatCount});await page.waitForTimeout(500);
  const baseline=await page.evaluate(()=>({updates:window.__perfUpdates,nodes:document.querySelector('.nexus-inspector').querySelectorAll('*').length,hiddenGallery:document.querySelectorAll('#nexus-pane-images img').length,turns:window.__DANCHEONG_NEW_ENGINE_TEST__._turns().length}));
  const measures=await page.evaluate(()=>{const timings=[];for(let i=0;i<7;i++){const start=performance.now();window.__perfUpdate();timings.push(performance.now()-start)}return timings.sort((a,b)=>a-b)});
  await page.waitForTimeout(1800);const idleStart=await page.evaluate(()=>window.__perfUpdates);await page.waitForTimeout(4600);const idleUpdates=(await page.evaluate(()=>window.__perfUpdates))-idleStart;
  if(variant==='after'){
   assert.equal(baseline.hiddenGallery,0);assert.equal(idleUpdates,0);
   if(width<800)await page.getByRole('button',{name:'이야기 정보 패널 열기',exact:true}).click();
   // Direct tab click also covers the hidden mobile drawer without touching user data.
   for(const id of ['status','events','cast','images','records','cost']){await page.evaluate(id=>document.querySelector('[data-nexus-tab="'+id+'"]').click(),id);assert.ok(await page.locator('#nexus-pane-'+id).textContent());}
   await page.evaluate(()=>document.querySelector('[data-nexus-tab="images"]').click());assert.equal(await page.locator('#nexus-pane-images img').count(),Math.ceil(beatCount/3));
   await page.evaluate(()=>document.querySelector('#nexus-pane-images button[data-image-index]').click());assert.equal(await page.locator('.nexus-image-preview').evaluate(el=>el.open),true);await page.evaluate(()=>document.querySelector('.nexus-image-preview').close());
   await page.evaluate(()=>document.querySelector('[data-nexus-tab="status"]').click());
   assert.equal(await page.locator('#nexus-pane-status').isVisible(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
   const worker=await page.evaluate(async()=>{const content=window.__DANCHEONG_NEW_ENGINE_TEST__._export(),start=performance.now();const result=await new Promise((resolve,reject)=>{const worker=new Worker('/cortex-cloud-worker.js');worker.onmessage=({data})=>{worker.terminate();resolve(data)};worker.onerror=reject;worker.postMessage({id:1,content})});const workerMs=performance.now()-start;const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;const bytes=new TextEncoder().encode(JSON.stringify(sorted(content))),hash=await crypto.subtle.digest('SHA-256',bytes);return{...result,workerMs,bytes:bytes.length,expected:'v1:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}});assert.equal(worker.key,worker.expected);baseline.workerMs=worker.workerMs;baseline.savedBytes=worker.bytes;
   await page.screenshot({path:`outputs/performance-v1220/${beatCount}-${width}.png`});
   await page.evaluate(async()=>{await window.__DANCHEONG_NEW_ENGINE_TEST__.persist()});
   const entryStart=Date.now();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.classList.contains('nexus-view-ready'));baseline.entryMs=Date.now()-entryStart;
   assert.equal(await page.evaluate(()=>window.__DANCHEONG_NEW_ENGINE_TEST__._turns().length),beatCount);
   assert.equal(await page.locator('#feed > article.turn:not(.opening-scene)').count(),5);
   // Load earlier content while preserving the original reading anchor.
   await page.waitForTimeout(350);const anchor=await page.evaluate(()=>{const story=document.querySelector('.story-scroll');story.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));story.scrollTop=0;const first=document.querySelector('#feed > article.turn:not(.opening-scene)');window.__qaAnchor=first;const top=first.getBoundingClientRect().top;story.dispatchEvent(new Event('scroll'));return top});
   await page.waitForFunction(()=>document.querySelectorAll('#feed > article.turn:not(.opening-scene)').length===15);await page.waitForTimeout(250);baseline.anchorShift=await page.evaluate(top=>window.__qaAnchor.getBoundingClientRect().top-top,anchor);assert.ok(Math.abs(baseline.anchorShift)<4);
  }
  assert.equal(baseline.turns,beatCount);assert.deepEqual(errors,[]);results.push({variant,width,...baseline,medianInspectorMs:measures[3],idleUpdates});await context.close();
 }
 fs.writeFileSync(`outputs/performance-v1220/results-${beatCount}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
