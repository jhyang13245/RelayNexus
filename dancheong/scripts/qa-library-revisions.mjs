import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='http://127.0.0.1:5198',catalogKey='nexus-cortex-catalog-v1';
const title='기성학원 : 첫 번째 공명';
const works=['qa-academy','qa-second','qa-third'].map((slug,i)=>({id:slug,slug,title:i?`검수 작품 ${i+1}`:title,subtitle:'',description:'',genre:'Cortex 작품',tags:[],packageVersion:'1.5',runtime:'instant_story',packageBytes:1024,packageSha256:'0'.repeat(64),downloadCount:0,coverUrl:'/qa-cover.svg',downloadUrl:'/unused',sourceProjectId:slug,currentRevision:3}));
const rows=works.flatMap(work=>[1,2].map(revision=>({id:`${work.slug}-session-${revision}`,projectId:`cortex-import-neoreum:${work.slug}:r${revision}`,sourceProjectId:work.slug,name:work.title,turn:revision,thumbnailUrl:work.coverUrl,lastPlayedAt:'2026-09-11T00:00:00Z'})));
const browser=await chromium.launch({headless:true,channel:'chrome'});
fs.mkdirSync('outputs/library-revisions',{recursive:true});
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),downloads=[],errors=[];
  await context.route('**/api/**',route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path==='/api/device-owner'||path==='/api/account')return route.fulfill({json:{authenticated:true,id:'qa-account',email:'library-qa@example.test',displayName:'검수',role:'USER',storageMode:'account'}});
   if(path==='/api/hub/works')return route.fulfill({json:{works}});
   if(path.endsWith('/download')){downloads.push(path);return route.fulfill({status:503,json:{error:'QA_DOWNLOAD_FAILED'}});}
   return route.fulfill({json:{projects:[],sessions:[]}});
  });
  await context.route('**/qa-cover.svg*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#214b41"/><text x="150" y="210" text-anchor="middle" font-size="25" fill="#dfce99">첫 번째 공명</text></svg>'}));
  await context.addInitScript(({rows,catalogKey})=>{localStorage.setItem('nexus-runtime-engine','cortex');localStorage.setItem(catalogKey,JSON.stringify(rows));},{rows,catalogKey});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.locator('.book-revision-seal').first().waitFor();
  assert.equal(await page.locator('.library-book').count(),3);
  await page.locator('#bookshelf').scrollIntoViewIfNeeded();
  const badge=await page.locator('.book-revision-seal').first().evaluate(el=>({height:el.getBoundingClientRect().height,nowrap:getComputedStyle(el).whiteSpace,display:getComputedStyle(el).display}));
  assert.equal(badge.nowrap,'nowrap');assert.equal(badge.display,'flex');assert.ok(badge.height<29);
  for(const index of [0,2]){
   const book=page.locator('.library-book').nth(index);await book.locator('.book-options-trigger').click();
   const menu=page.locator('.book-revision-menu');await menu.waitFor();
   const bounds=await menu.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
   assert.equal(await menu.locator('.book-revision-options button').count(),2);
   if(index===0)await page.screenshot({path:`outputs/library-revisions/menu-${width}.png`});
   await page.keyboard.press('Escape');assert.equal(await menu.count(),0);
  }
  const book=page.locator('.library-book').first();
  for(const revision of [2,1]){
   await book.locator('.book-options-trigger').click();
   await page.locator('.book-revision-options button').filter({hasText:`덧칠 v${revision}`}).click();
   await page.locator('.continue-genre').filter({hasText:`덧칠 v${revision} 전용 세션`}).waitFor();
   assert.equal(await page.locator('.continue-session-choice').count(),1);
   assert.match(await page.locator('.continue-session-choice').innerText(),new RegExp(`${revision}턴`));
  }
  await book.locator('.book-options-trigger').click();await page.locator('.book-revision-download').click();
  await page.locator('.hub-install-error[role="alert"]').waitFor();assert.deepEqual(downloads,['/api/neoreum/works/qa-academy/revisions/3/download']);
  assert.equal(await page.locator('.library-book').count(),3);
  // Simulate the existing installer publishing its new immutable catalog entry.
  await page.evaluate(({catalogKey,row})=>{const saved=JSON.parse(localStorage.getItem(catalogKey));saved.push(row);localStorage.setItem(catalogKey,JSON.stringify(saved));window.dispatchEvent(new CustomEvent('nexus-cortex-catalog-changed'));},{catalogKey,row:{...rows[0],id:'qa-academy-session-3',projectId:'cortex-import-neoreum:qa-academy:r3',turn:3}});
  await book.locator('.book-options-trigger').click();
  await page.locator('.book-revision-options button').filter({hasText:'덧칠 v3'}).waitFor();
  assert.equal(await page.locator('.book-revision-download').count(),0);
  assert.equal(await page.locator('.library-book').count(),3);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),catalogKey);
  for(const old of rows)assert.deepEqual(saved.find(row=>row.id===old.id),old);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,oneCoverPerWork:true,revisionSessionsSeparate:true,menuFits:true,oldSessionsPreserved:true}));
  await context.close();
 }
}finally{await browser.close();}
