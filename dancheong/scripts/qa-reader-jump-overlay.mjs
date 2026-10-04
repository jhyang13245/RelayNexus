import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Isolated local rendering fixture: no model requests or user storage.
const scenario=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
const browser=await chromium.launch({headless:true,channel:'chrome'});
fs.mkdirSync('outputs/reader-jump-overlay',{recursive:true});
try {
  for(const width of [390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.goto('http://127.0.0.1:5198/cortex.html?session=qa-jump-overlay');
    await page.waitForFunction(()=>window.__DANCHEONG_NEW_ENGINE_TEST__&&document.querySelector('.nexus-jump-dock'));
    await page.evaluate(scenario=>{
      window.__DANCHEONG_NEW_ENGINE_TEST__.applyImportedState({scenario,turns:[{
        id:'overlay-fixture',status:'COMMITTED',text:Array.from({length:30},(_,i)=>`${i+1}. 창밖으로 부드러운 햇살이 들어왔다. 그는 책장을 넘기며 어제 남겨 둔 문장을 다시 읽었다. 서가 사이로 바람이 지나갔다.`).join('\n\n'),
        metrics:{authorRecommendations:{status:'ACCEPTED'}},
        recommendations:['서가에 남겨진 책을 펼쳐 단서를 확인한다.','창가로 다가가 밖의 모습을 살핀다.','문을 열고 복도에 있는 사람을 찾아간다.'].map((label,i)=>({label,risk:['LOW','MEDIUM','HIGH'][i],source:'SAME_TURN_PROSE_WRITER'}))
      }]},{persistState:false});
    },scenario);
    await page.locator('.cortex-recommendation-strip').waitFor({state:'visible'});
    await page.waitForTimeout(500);
    const measure=()=>page.evaluate(()=>{
      const story=document.querySelector('.story-scroll'),frame=story.parentElement,dock=document.querySelector('.nexus-jump-dock'),button=dock.firstElementChild,rail=document.querySelector('.cortex-recommendation-strip');
      return {storyHeight:story.clientHeight,railTop:rail.getBoundingClientRect().top,frameBottom:frame.getBoundingClientRect().bottom,buttonBottom:button.getBoundingClientRect().bottom,hidden:button.hidden,dockParent: dock.parentElement===frame,position:getComputedStyle(dock).position,background:getComputedStyle(dock).backgroundColor,scrollTop:story.scrollTop,max:story.scrollHeight-story.clientHeight};
    });
    await page.locator('.story-scroll').evaluate(el=>{el.scrollTop=200;el.dispatchEvent(new Event('scroll'));});
    await page.waitForTimeout(100);
    const visible=await measure();
    assert.equal(visible.hidden,false);assert.equal(visible.dockParent,true);assert.equal(visible.position,'absolute');assert.equal(visible.background,'rgba(0, 0, 0, 0)');
    assert.ok(visible.buttonBottom<visible.frameBottom&&visible.buttonBottom<visible.railTop);
    await page.screenshot({path:`outputs/reader-jump-overlay/${width}.png`});
    await page.locator('.story-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
    await page.waitForTimeout(100);
    const bottom=await measure();
    assert.equal(bottom.hidden,true);assert.equal(bottom.storyHeight,visible.storyHeight);assert.equal(bottom.railTop,visible.railTop);
    await page.locator('.story-scroll').evaluate(el=>{el.scrollTop=200;el.dispatchEvent(new Event('scroll'));});
    await page.locator('.nexus-jump-bottom').click();await page.waitForTimeout(400);
    const clicked=await measure();assert.equal(clicked.hidden,true);assert.ok(Math.abs(clicked.scrollTop-clicked.max)<=2);
    console.log(JSON.stringify({width,visible,bottom,clickPassed:true}));
    await page.close();
  }
} finally {await browser.close();}
