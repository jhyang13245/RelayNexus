import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bytes=[...fs.readFileSync('tests/fixtures/studio-2.2-instant.zip')];
const prologue='복도에  두 사람이 서 있었다.\n창밖에는 비가 내렸다.\n\n\n“검사실로 들어오세요.”\n\n\t안내원이 문을 열었다.\n<메모>  첫 장면은 그대로.';
const browser=await chromium.launch({headless:true,channel:'chrome'});
fs.mkdirSync('outputs/instant-opening',{recursive:true});
try{
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='http://127.0.0.1:5198')return route.abort();
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
      return route.continue();
    });
    await page.goto('http://127.0.0.1:5198/cortex.html?session=instant-opening-qa');
    await page.waitForFunction(()=>window.__DANCHEONG_NEW_ENGINE_TEST__&&document.querySelector('.story-scroll'));
    await page.evaluate(async({bytes,prologue})=>{
      const api=window.__DANCHEONG_NEW_ENGINE_TEST__,data=new Uint8Array(bytes),pack=await api.inspectNexusPackage({name:'fixture.zip',size:data.length,arrayBuffer:async()=>data.buffer});
      pack.canonicalSession.package.openingContract.openingLine=prologue;
      api.applyImportedState({canonicalSession:pack.canonicalSession,turns:[]},{persistState:false});
    },{bytes,prologue});
    await page.waitForTimeout(200);
    const result=await page.locator('.opening-scene > .prose').evaluate(node=>{
      const style=getComputedStyle(node),text=node.firstChild;
      const rect=at=>{const range=document.createRange();range.setStart(text,at);range.setEnd(text,at+1);return range.getBoundingClientRect().y;};
      return {text:node.textContent,whiteSpace:style.whiteSpace,lineHeight:parseFloat(style.lineHeight),lineGap:rect(node.textContent.indexOf('창밖'))-rect(0),blankGap:rect(node.textContent.indexOf('“'))-rect(node.textContent.indexOf('창밖')),escaped:node.children.length===0,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    assert.equal(result.text,prologue);assert.equal(result.whiteSpace,'pre-wrap');assert.equal(result.escaped,true);assert.equal(result.overflow,false);
    assert.ok(result.lineGap>=result.lineHeight*.9);assert.ok(result.blankGap>=result.lineHeight*2.9);assert.deepEqual(errors,[]);
    await page.screenshot({path:`outputs/instant-opening/${width}.png`});console.log(JSON.stringify({width,...result}));await page.close();
  }
}finally{await browser.close()}
