import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{for(const file of process.argv.slice(2)){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:5198')return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});return route.continue()});
 await page.addInitScript(()=>{const Original=MutationObserver;window.qaObserverCalls=0;window.qaObserverStopped=[];window.MutationObserver=class extends Original{constructor(callback){super((changes,self)=>{if(++window.qaObserverCalls>800){window.qaObserverStopped.push(callback.toString().slice(0,180));self.disconnect();return;}callback(changes,self)})}}});
 await page.goto('http://127.0.0.1:5198/cortex.html?session=entry-qa');await page.waitForFunction(()=>window.NexusCortexSpeakerMedia);
 await page.evaluate(async bytes=>{const a=window.__DANCHEONG_NEW_ENGINE_TEST__,b=await window.CortexBackupArchive.unpack(new Uint8Array(bytes));if(b.settings)b.settings.apiKey='';window.qaExpected=b.turns.length;await a._importFull(b);a._setSettings({apiKey:''});},[...fs.readFileSync(file)]);
 await page.waitForTimeout(2000);
 const expected=await page.evaluate(()=>window.qaExpected);
 const reloadStarted=Date.now();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.NexusCortexSpeakerMedia&&document.documentElement.classList.contains('nexus-view-ready'));
 const readyMs=Date.now()-reloadStarted;
 await page.evaluate(value=>{window.qaExpected=value},expected);
 const result=await page.evaluate(()=>({turns:window.__DANCHEONG_NEW_ENGINE_TEST__._turns().length,expected:window.qaExpected,calls:window.qaObserverCalls,stopped:window.qaObserverStopped,portraits:document.querySelectorAll('[data-speaker-portrait]').length,ready:document.documentElement.classList.contains('nexus-view-ready'),visibility:getComputedStyle(document.body).visibility}));
 console.log(JSON.stringify({file:file.split(/[\\/]/).at(-1),readyMs,...result,errors}));assert.deepEqual(result.stopped,[],'render observer loop');assert.deepEqual(errors,[]);assert.equal(result.turns,result.expected);assert.equal(result.ready,true);await page.close();
}}finally{await browser.close()}
