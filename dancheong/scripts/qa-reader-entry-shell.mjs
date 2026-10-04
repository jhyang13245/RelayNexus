import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {build}=createRequire(require.resolve('tsx'))('esbuild');
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CortexPlayer} from './app/cortex-player';window.React=React;createRoot(document.getElementById('root')).render(React.createElement(CortexPlayer,{sessionId:'entry-shell-qa',projectId:'qa',apiKey:'',theme:'light',readingWidth:'normal',fontSize:'small',typingSpeed:'natural',imageQuality:'low',imageEvery:0,file:null,onFileConsumed:()=>{},onHome:()=>{window.qaHome=true},onSettings:()=>{}}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,channel:'chrome'});fs.mkdirSync('outputs/reader-entry',{recursive:true});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:5198')return route.abort();if(u.pathname==='/qa-entry')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/qa-entry.css"><div id="root"></div><script src="/qa-entry.js"></script>'});if(u.pathname==='/qa-entry.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});if(u.pathname==='/qa-entry.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('app/globals.css','utf8')});if(u.pathname==='/cortex.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Unresponsive fixture</title>'});return route.fulfill({status:404,body:''})});
 await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===20000?500:ms,...args)});
 await page.goto('http://127.0.0.1:5198/qa-entry');await page.getByRole('button',{name:'다시 시도'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`outputs/reader-entry/retry-${width}.png`});
 await page.getByRole('button',{name:'다시 시도'}).click();await page.getByRole('button',{name:'서재로 돌아가기'}).click();assert.equal(await page.evaluate(()=>window.qaHome),true);
 console.log(JSON.stringify({width,overflow:false,retry:true,home:true}));await page.close();
}}finally{await browser.close()}
