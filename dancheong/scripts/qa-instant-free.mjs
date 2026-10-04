import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {makeModel} from '../tests/cortex/harness.mjs';
import {installInstantModel} from '../tests/cortex/instant-model.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bytes=[...fs.readFileSync('tests/fixtures/studio-2.2-instant.zip')];
const browser=await chromium.launch({headless:true,channel:'chrome'});
fs.mkdirSync('outputs/instant-free',{recursive:true});
try{
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const model=installInstantModel(makeModel(),{
      prose:()=> '검사실에 들어섰다.\n\n⟦N:서준⟧“검사를 받으러 왔습니다.”\n\n안내원이 의자를 내주었다.',
      audit:()=>{throw Error('fixture audit unavailable')},
      editor:p=>({decision:'EDIT',text:p.draft+'\n\n- 문을 연다.\n- 복도를 살펴본다.\n- 안내원에게 묻는다.',changesPremise:false,reason:'fixture injected choices'}),
      hud:()=>({statChanges:[],relationshipChanges:[],presentCharacterIds:['hero'],world:{day:null,time:null,location:'검사실',evidence:'검사실에 들어섰다.'}}),
    });
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/responses')){
        try{const response=await model.fetch(url.href,{body:route.request().postData()});return route.fulfill({status:response.status,contentType:route.request().postDataJSON()?.stream?'text/event-stream':'application/json',body:await response.text()});}
        catch{return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'fixture audit unavailable'}})});}
      }
      if(url.origin!=='http://127.0.0.1:5198')return route.abort();
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
      return route.continue();
    });
    await page.goto('http://127.0.0.1:5198/cortex.html?session=instant-free-local-qa');
    await page.waitForFunction(()=>window.__DANCHEONG_NEW_ENGINE_TEST__&&document.querySelector('.story-scroll'));
    await page.evaluate(async data=>{
      const api=window.__DANCHEONG_NEW_ENGINE_TEST__,bytes=new Uint8Array(data),pack=await api.inspectNexusPackage({name:'fixture.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer});
      api.applyImportedState({canonicalSession:pack.canonicalSession,turns:[]},{persistState:false});api._setSettings({apiKey:'fixture-only',typingSpeed:'instant'});api._setInput('검사실로 간다');await api.runTurnV1111();
    },bytes);
    await page.waitForTimeout(500);
    const result=await page.evaluate(()=>{
      const api=window.__DANCHEONG_NEW_ENGINE_TEST__,turn=api._turns().at(-1);
      return {status:turn.status,hud:turn.metrics.instantHud.status,prose:turn.text,removed:turn.metrics.instantChoiceLinesRemoved,wire:/⟦|CORTEX_ST_|statChanges/.test(document.getElementById('feed').innerText),overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    assert.equal(result.status,'COMMITTED');assert.equal(result.hud,'UPDATED');assert.ok(result.removed>=3,JSON.stringify(result));assert.doesNotMatch(result.prose,/^- /m);assert.equal(result.wire,false);assert.equal(result.overflow,false);assert.deepEqual(errors,[]);
    await page.screenshot({path:`outputs/instant-free/${width}.png`});
    console.log(JSON.stringify({width,...result}));await page.close();
  }
}finally{await browser.close();}
