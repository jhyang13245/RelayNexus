import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {makeModel} from '../tests/cortex/harness.mjs';
import {installInstantModel} from '../tests/cortex/instant-model.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bytes=[...fs.readFileSync('tests/fixtures/studio-2.2-instant.zip')];
const browser=await chromium.launch({headless:true,channel:'chrome'});fs.mkdirSync('outputs/speaker-media',{recursive:true});
try{for(const mode of ['ready','delayed','timeout','missing']){
 const page=await browser.newPage({viewport:{width:mode==='ready'?1440:390,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const model=installInstantModel(makeModel(),{prose:()=> '문이 열렸다.\n\n⟦N:서민⟧“안녕하세요.”\n\n⟦N:서준⟧“반갑습니다.”\n\n⟦N:서민⟧“또 만났네요.”\n\n복도는 조용했다.',hud:()=>({statChanges:[],relationshipChanges:[],world:null,presentCharacterIds:['hero','sibling']})});
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/responses')){const r=await model.fetch(url.href,{body:route.request().postData()});return route.fulfill({status:200,contentType:route.request().postDataJSON()?.stream?'text/event-stream':'application/json',body:await r.text()})}if(url.origin!=='http://127.0.0.1:5198')return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});return route.continue()});
 await page.goto('http://127.0.0.1:5198/cortex.html?session=speaker-media-'+mode);await page.waitForFunction(()=>window.NexusCortexSpeakerMedia);
 await page.evaluate(async({bytes,mode})=>{const a=window.__DANCHEONG_NEW_ENGINE_TEST__,data=new Uint8Array(bytes),p=await a.inspectNexusPackage({name:'fixture.zip',size:data.length,arrayBuffer:async()=>data.buffer});a.applyImportedState({canonicalSession:p.canonicalSession,turns:[]},{persistState:false});
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#2e6455';c.fillRect(0,0,320,180);c.fillStyle='#faf4da';c.font='28px sans-serif';c.fillText('Embedded portrait',35,95);const url=canvas.toDataURL();
 window.NexusCortexPrimaryMedia=new Map(mode==='missing'?[]:['hero','sibling'].map(id=>[id,{characterId:id,dataUrl:url,ref:id+'.png'}]));window.NexusCortexPackageMediaReady=async()=>[];
 if(mode==='delayed'||mode==='timeout'){const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return new Promise(resolve=>setTimeout(resolve,mode==='delayed'?1300:9000)).then(()=>decode.call(this))};}
 window.dispatchEvent(new Event('nexus-cortex-primary-media'));a._setSettings({apiKey:'fixture',typingSpeed:'instant'});
 },{bytes,mode});
 if(mode==='ready'){await page.waitForFunction(()=>document.querySelector('.opening-scene [data-speaker-portrait="hero"] img'));assert.equal(await page.locator('.opening-scene [data-speaker-portrait="hero"]').count(),1);await page.screenshot({path:'outputs/speaker-media/prologue.png'});}
 await page.evaluate(()=>{const a=window.__DANCHEONG_NEW_ENGINE_TEST__;window.qaStarted=performance.now();a._setInput('인사한다');window.qaTurn=a.runTurnV1111()});
 if(['delayed','timeout'].includes(mode)){await page.waitForTimeout(450);const early=await page.evaluate(()=>({text:document.querySelector('.turn:not(.opening-scene) .prose')?.textContent||'',requests:window.__DANCHEONG_NEW_ENGINE_TEST__._turns().at(-1)?.text||''}));assert.doesNotMatch(early.text,/안녕하세요|복도는 조용/);assert.match(early.requests,/안녕하세요/);}
await page.evaluate(()=>window.qaTurn);await page.waitForFunction(()=>window.__DANCHEONG_NEW_ENGINE_TEST__._turns().at(-1)?.displayTyping===false,{},{timeout:10000});const result=await page.evaluate(()=>({elapsed:performance.now()-window.qaStarted,text:document.querySelector('.turn:not(.opening-scene) .prose')?.textContent||'',pictures:[...document.querySelectorAll('.turn:not(.opening-scene) [data-speaker-portrait]')].map(n=>({id:n.dataset.speakerPortrait,status:n.dataset.state,next:n.nextElementSibling?.className})),overflow:document.documentElement.scrollWidth>innerWidth+1}));
 assert.match(result.text,/복도는 조용/,JSON.stringify({result,errors,turn:await page.evaluate(()=>window.__DANCHEONG_NEW_ENGINE_TEST__._turns().at(-1))}));assert.equal(result.overflow,false);assert.deepEqual(errors,[]);
 if(['ready','delayed'].includes(mode)){assert.equal(result.pictures.length,1);assert.equal(result.pictures[0].id,'sibling');assert.equal(result.pictures[0].status,'READY');assert.equal(result.pictures[0].next,'nexus-dialogue-row');}
 if(mode==='timeout'){assert.ok(result.elapsed>=5800&&result.elapsed<8200,JSON.stringify(result));assert.equal(result.pictures.length,1);assert.ok(result.pictures.every(x=>['TIMED_OUT','FAILED'].includes(x.status)),JSON.stringify(result));}
 if(mode==='missing')assert.equal(result.pictures.length,0);
 if(mode==='ready'){await page.evaluate(async()=>{const a=window.__DANCHEONG_NEW_ENGINE_TEST__;a._setInput('다시 인사한다');await a.runTurnV1111()});await page.waitForFunction(()=>window.__DANCHEONG_NEW_ENGINE_TEST__._turns().at(-1)?.displayTyping===false);assert.equal(await page.locator('[data-speaker-portrait="sibling"] img').count(),2);assert.equal(await page.locator('.turn:not(.opening-scene) [data-speaker-portrait="hero"]').count(),0);}
 await page.screenshot({path:'outputs/speaker-media/'+mode+'.png'});console.log(JSON.stringify({mode,...result}));await page.close();
}}finally{await browser.close()}
