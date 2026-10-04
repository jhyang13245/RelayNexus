import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('floating chat previews retain popup, sequence, safe text and ten-second fade behavior',()=>{
 const dom=new JSDOM('<div class="nexus-reading-paper-frame"></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,events=[],timers=new Map();let now=0,id=0;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id};w.clearTimeout=id=>timers.delete(id);
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}};
 try{
  w.eval(fs.readFileSync('public/cortex-nexus-view.js','utf8').split('// Multiplayer transports')[0]);
  const tools=w.createNexusMultiplayerTools(type=>events.push(type));
  tools.update({label:'한시우의 차례',canWrite:false,unread:3});
  assert.equal(w.document.querySelector('.nexus-turn-label').textContent,'한시우의 차례');
  assert.equal(tools.chat.parentElement.parentElement.parentElement.className,'nexus-reading-paper-frame');
  assert.match(tools.chat.getAttribute('aria-label'),/3개/);
  tools.preview([{seq:1,name:'친구',body:'<img src=x onerror=alert(1)>'}]);
  assert.equal(w.document.querySelectorAll('.nexus-chat-bubble img').length,0);
  advance(9999);assert.equal(w.document.querySelectorAll('.is-leaving').length,0);
  tools.preview([{seq:1,name:'중복',body:'중복'},{seq:2,name:'새 친구',body:'두 번째'}]);
  assert.equal(w.document.querySelectorAll('.nexus-chat-bubble').length,2);
  assert.equal(w.document.querySelector('.nexus-chat-bubble:last-child strong').textContent,'새 친구');
  advance(1);assert.equal(w.document.querySelectorAll('.is-leaving').length,1);
  advance(700);assert.equal(w.document.querySelectorAll('.nexus-chat-bubble').length,1);
  w.document.querySelector('.nexus-chat-bubble').click();assert.deepEqual(events,['MP_CHAT']);assert.equal(timers.size,0);
  tools.chat.click();assert.deepEqual(events,['MP_CHAT','MP_CHAT']);
  tools.setOpen(true);tools.preview([{seq:3,name:'친구',body:'팝업 안에서'}]);
  assert.equal(tools.chat.getAttribute('aria-expanded'),'true');assert.equal(timers.size,0);
  tools.setOpen(false);tools.preview([{seq:4,isSelf:true,body:'내 메시지'},{seq:5,body:'새 알림'}]);
  assert.equal(w.document.querySelectorAll('.nexus-chat-bubble').length,1);
  tools.preview(Array.from({length:8},(_,i)=>({seq:6+i,body:'알림'})));
  assert.equal(w.document.querySelectorAll('.nexus-chat-bubble').length,4);assert.equal(timers.size,4);
  w.dispatchEvent(new w.Event('pagehide'));assert.equal(timers.size,0);
 }finally{dom.window.close()}
});
