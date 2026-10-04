import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function setup(waitMs=60){
 const dom=new JSDOM('<div class="opening-scene"><p class="prose">프롤로그</p></div>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(fs.readFileSync('public/cortex-nexus-view.js','utf8'));
 let calls=0,resolveImage;w.Image=class{naturalWidth=320;naturalHeight=180;set src(v){calls++;resolveImage=()=>this.onload?.()} decode(){return Promise.resolve()}};
 const rows=['hero','a','b'].map(id=>({person:{id},visible:{id,name:id,referenceMode:'PRIMARY'},names:[id]})),sc={protagonist:{id:'hero'},runtime:{storyId:'test'}};
 w.CortexTurnExperience={refreshPublicAppearances(){}};w.NexusCortexPrimaryMedia=new Map(rows.map(r=>[r.person.id,{dataUrl:'data:'+r.person.id}]));w.NexusCortexPackageMediaReady=async()=>[];
 const api={_scenario:()=>sc,_turns:()=>[]},media=w.createNexusSpeakerMedia(api,()=>rows,{waitMs});
 // Separate the presentation clock from CI event-loop scheduling. The real timer
 // timeout is still exercised, while a loaded image's 20ms paint gap is deterministic.
 let clock=0;Object.defineProperty(w.performance,'now',{value:()=>clock});
 const tick=async ms=>{await new Promise(r=>setTimeout(r,ms));clock+=ms;},turn=(name='a')=>({status:'STREAMING',displayTyping:true,dialogueAnnotations:[{offset:0,quoteText:'“첫말”',bindingVersion:2,characterId:name,speakerName:name}]});
 return {w,dom,media,rows,sc,tick,turn,resolve:()=>resolveImage?.(),calls:()=>calls};
}
test('speaker image holds display only; decoded asset is reused in each beat and hero is excluded',async()=>{
 const x=setup(200);try{const t=x.turn(),s='“첫말”\n\n뒤 문단';assert.equal(x.media.gate(t,s,0,s.length),0);x.resolve();await x.tick(30);assert.equal(x.media.gate(t,s,0,s.length),s.length);
 const next=x.turn();x.media.gate(next,s,0,s.length);await x.tick(30);assert.equal(x.media.gate(next,s,0,s.length),s.length);assert.equal(x.calls(),1);
 assert.equal(x.media.gate(x.turn('hero'),s,0,s.length),s.length);
 }finally{x.dom.window.close()}
});
test('timeout releases the entire continuation and never mounts a late arriving image',async()=>{
 const x=setup();try{const t=x.turn(),s='“첫말”\n\n뒷문단';assert.equal(x.media.gate(t,s,0,s.length),0);const p=x.w.document.createElement('div');x.media.decorate(p,t,'');assert.equal(p.querySelector('figure').dataset.state,'PENDING');await x.tick(80);assert.equal(x.media.gate(t,s,0,s.length),s.length);x.resolve();await x.tick(10);x.media.decorate(p,t,s);assert.equal(p.querySelector('img'),null);}finally{x.dom.window.close()}
});
test('missing images, non-speech and conflicting writer name/reference never use another portrait',async()=>{
 const x=setup();try{const t=x.turn(),s='“첫말”';x.w.NexusCortexPrimaryMedia.clear();x.media.gate(t,s,0,s.length);await x.tick(5);assert.equal(x.media.gate(t,s,0,s.length),s.length);
 const bad=x.turn();bad.dialogueAnnotations[0].speakerName='b';assert.equal(x.media.gate(bad,s,0,s.length),s.length);
 const note=x.turn();note.dialogueAnnotations[0].quoteKind='NON_SPEECH';assert.equal(x.media.gate(note,s,0,s.length),s.length);assert.equal(x.calls(),0);
 }finally{x.dom.window.close()}
});
test('two utterances by one speaker reserve one image immediately before the first card',async()=>{
 const x=setup(200);try{const s='“첫말”\n\n“두번째”',t=x.turn();t.dialogueAnnotations.push({...t.dialogueAnnotations[0],offset:7,quoteText:'“두번째”'});x.media.gate(t,s,0,s.length);x.resolve();await x.tick(30);
 const p=x.w.document.createElement('div');p.innerHTML='<div class="nexus-dialogue-row"><p data-reader-start="0">첫말</p></div><div class="nexus-dialogue-row"><p data-reader-start="7">두번째</p></div>';x.media.decorate(p,t,s);assert.equal(p.querySelectorAll('figure').length,1);assert.equal(p.firstElementChild.tagName,'FIGURE');const f=p.firstElementChild;x.media.decorate(p,t,s);assert.equal(p.firstElementChild,f);
 }finally{x.dom.window.close()}
});

test('hero portrait mounts once at the beginning of the prologue, never in a beat',async()=>{
 const x=setup(200);try{x.media.refresh();x.resolve();await x.tick(30);x.media.refresh();const opening=x.w.document.querySelector('.opening-scene'),image=opening.firstElementChild;assert.equal(image.dataset.speakerPortrait,'hero');assert.equal(image.nextElementSibling.className,'prose');assert.ok(image.querySelector('img'));x.media.refresh();assert.equal(opening.querySelectorAll('figure').length,1);assert.equal(opening.firstElementChild,image);
 const t=x.turn('hero'),s='“첫말”',p=x.w.document.createElement('div');x.media.gate(t,s,0,s.length);x.media.decorate(p,t,s);assert.equal(p.querySelector('figure'),null);
 }finally{x.dom.window.close()}
});

test('switching package generations cannot reuse a prior package portrait with the same character ID',async()=>{
 const x=setup();try{x.w.NexusCortexPrimaryMedia.scope='previous-story|';const t=x.turn(),s='“첫말”';x.media.gate(t,s,0,s.length);await x.tick(5);assert.equal(x.calls(),0);assert.equal(x.media.gate(t,s,0,s.length),s.length);assert.equal(x.w.NexusCortexPrimaryMedia.size,0);}finally{x.dom.window.close()}
});

test('a missing prologue asset leaves no empty portrait and a later restore still mounts only one',async()=>{
 const x=setup(200);try{x.w.NexusCortexPrimaryMedia.clear();x.media.refresh();await x.tick(5);x.media.refresh();assert.equal(x.w.document.querySelectorAll('figure').length,0);x.w.NexusCortexPrimaryMedia.set('hero',{dataUrl:'data:hero'});x.media.refresh();x.resolve();await x.tick(30);x.media.refresh();assert.equal(x.w.document.querySelectorAll('figure').length,1);assert.ok(x.w.document.querySelector('figure img'));}finally{x.dom.window.close()}
});
