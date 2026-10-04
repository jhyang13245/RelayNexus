import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let held;
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:5198')return route.abort();if(u.pathname==='/qa-pending-image.png'){held=route;return;}if(u.pathname==='/cortex.html'){const response=await route.fetch();return route.fulfill({response,body:(await response.text()).replace('</body>','<img hidden src="/qa-pending-image.png"></body>')})}if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});return route.continue()});
 await page.goto('http://127.0.0.1:5198/cortex.html?session=blocked-image-qa',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1200);
 const result=await page.evaluate(()=>({documentState:document.readyState,mounted:!!window.NexusCortexSpeakerMedia,body:!!document.querySelector('.story-scroll'),ready:document.documentElement.classList.contains('nexus-view-ready')}));
 console.log(JSON.stringify(result));await held?.abort();assert.equal(result.mounted,true,'a pending image must not gate the reader bootstrap');assert.equal(result.ready,true);await page.close();
}finally{await browser.close()}
