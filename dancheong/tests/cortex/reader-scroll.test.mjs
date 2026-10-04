import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

function fixture() {
  const dom = new JSDOM('<div id="story"><div id="feed"></div></div><button id="jump"></button>', {runScripts:'outside-only'});
  const w = dom.window, story = w.document.getElementById('story'), feed = w.document.getElementById('feed');
  let height = 2000, turn = {id:'old',text:'Old prose',status:'COMMITTED'}, callback;
  Object.defineProperties(story,{scrollHeight:{get:()=>height},clientHeight:{get:()=>500}});
  w.requestAnimationFrame = fn => {callback=fn;return 1}; w.cancelAnimationFrame = () => {callback=null};
  const source=fs.readFileSync('public/cortex-nexus-view.js','utf8');
  w.eval(source.slice(source.indexOf('window.createNexusReaderScroll ='),source.indexOf('// Prime only the first three')));
  const controller=w.createNexusReaderScroll(story,feed,w.document.getElementById('jump'),()=>turn);
  return {w,story,controller,set(heightValue,turnValue=turn){height=heightValue;turn=turnValue},flush(){controller.schedule();const run=callback;callback=null;run()},close(){dom.window.close()}};
}

test('submit follows the delayed input card and empty writer layout, not just growing prose',()=>{
  const f=fixture();try {
    f.story.scrollTop=200;f.controller.pause();f.controller.followEnd({submitted:true});assert.equal(f.story.scrollTop,1500);
    f.set(2100);f.flush();assert.equal(f.story.scrollTop,1600);
    f.set(2400,{id:'new',text:'',status:'STREAMING'});f.flush();assert.equal(f.story.scrollTop,1900);
    f.set(2500,{id:'new',text:'',status:'STREAMING'});f.flush();assert.equal(f.story.scrollTop,2000);
    f.set(2700,{id:'new',text:'First paragraph',status:'STREAMING'});f.flush();assert.equal(f.story.scrollTop,2200);
    f.set(2900,{id:'new',text:'First paragraph',status:'COMMITTED'});f.flush();assert.equal(f.story.scrollTop,2200,'commit/image layout must preserve the reading position');
  } finally {f.close()}
});

test('manual upward scroll cancels even a pending submit and bottom scrolling resumes follow',()=>{
  const f=fixture();try {
    f.controller.followEnd({submitted:true});
    f.story.dispatchEvent(new f.w.WheelEvent('wheel',{deltaY:-120}));
    f.story.scrollTop=1100;f.story.dispatchEvent(new f.w.Event('scroll'));
    f.set(2400,{id:'new',text:'',status:'STREAMING'});f.flush();assert.equal(f.story.scrollTop,1100);assert.equal(f.controller.following,false);
    f.set(2600,{id:'new',text:'New paragraph',status:'STREAMING'});f.flush();assert.equal(f.story.scrollTop,1100);
    f.story.dispatchEvent(new f.w.WheelEvent('wheel',{deltaY:120}));f.story.scrollTop=2100;f.story.dispatchEvent(new f.w.Event('scroll'));assert.equal(f.controller.following,true);
    f.set(2800,{id:'new',text:'New paragraph grows',status:'STREAMING'});f.flush();assert.equal(f.story.scrollTop,2300);
  } finally {f.close()}
});

test('spectator tail frames skip whole-feed glyph scans, but manual reading and final handoff retain anchors',()=>{
 const f=fixture();try{
  const feed=f.w.document.getElementById('feed'),original=feed.querySelectorAll.bind(feed);let scans=0;
  feed.querySelectorAll=(selector)=>{if(selector==='[data-reader-start]')scans++;return original(selector)};
  f.controller.followEnd();scans=0;
  for(let i=0;i<60;i++){f.controller.stream(()=>f.set(2100+i*10,{id:'live',displayText:'가'.repeat(i+1),status:'STREAMING'}));f.flush()}
  assert.equal(scans,0,'no per-frame glyph search while following the tail');assert.equal(f.story.scrollTop,2190);
  f.controller.pause();const before=scans;f.controller.stream(()=>f.set(2800,{id:'live',displayText:'가'.repeat(70),status:'STREAMING'}));f.flush();assert.ok(scans>before);assert.equal(f.story.scrollTop,2190);
 }finally{f.close()}
});
