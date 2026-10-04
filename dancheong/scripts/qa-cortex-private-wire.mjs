import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {unzipSync,strFromU8} from 'fflate';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
if(!process.argv[2])throw Error('Pass a local backup ZIP; private content stays local.');
const backup=JSON.parse(strFromU8(unzipSync(fs.readFileSync(process.argv[2]))['backup.json']));
const source={scenario:backup.scenario,turns:backup.turns};
const browser=await chromium.launch({headless:true,channel:'chrome'});
fs.mkdirSync('outputs/cortex-private-wire',{recursive:true});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://127.0.0.1:5198')return route.abort();
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5198/cortex.html?session=private-wire-local-qa');
  await page.waitForFunction(()=>window.__DANCHEONG_NEW_ENGINE_TEST__&&document.querySelector('.story-scroll'));
  await page.evaluate(source=>{const api=window.__DANCHEONG_NEW_ENGINE_TEST__;api._setSettings({apiKey:''});api.applyImportedState(source,{persistState:false});},source);
  await page.waitForTimeout(600);
  const result=await page.evaluate(()=>{
   const t=window.__DANCHEONG_NEW_ENGINE_TEST__._turns()[0],feed=document.getElementById('feed');
   return {body:t.text,annotations:t.dialogueAnnotations.length,visibleWire:/CORTEX_ST_V1|paragraphIndex|endLocationRef/.test(feed.innerText),archived:!!t.repairLog?.entries?.some(r=>r.before.includes('CORTEX_ST_V1')&&r.dialogueAnnotationsBefore?.length>0)};
  });
  assert.equal(result.visibleWire,false);assert.equal(result.archived,true);
  assert.doesNotMatch(result.body,/CORTEX_ST_V1|paragraphIndex|endLocationRef/);
  assert.ok(result.annotations<source.turns[0].dialogueAnnotations.length);
  await page.locator('.story-scroll').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:`outputs/cortex-private-wire/${width}.png`});
  console.log(JSON.stringify({width,visibleWire:result.visibleWire,annotations:result.annotations,archived:result.archived}));
  await page.close();
 }
}finally{await browser.close();}
