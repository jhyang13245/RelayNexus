import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/cortex-nexus-view.js','utf8');
function setup({pending=false}={}){
 const requested=[];
 const people=['hero','a','b','c','secret'].map(id=>({id,name:id,referenceMode:'PRIMARY'}));
 let scenario={protagonist:people[0],characters:people.slice(1),runtime:{storyId:'test',mediaGeneration:'v1'}};
 const turns=[{text:'“one” “two” “three” “hidden”',dialogueAnnotations:['a','b','c','secret'].map((characterId,i)=>({characterId,quoteText:['“one”','“two”','“three”','“hidden”'][i]})),imageUrl:'scene'}];
 const window={NexusCortexPrimaryMedia:new Map(people.map(p=>[p.id,{dataUrl:p.id}])),CortexTurnExperience:{refreshPublicAppearances(){},publicCharacter:p=>p.id==='secret'?null:p,publicText:(_,s)=>s}};
 class Image{naturalWidth=320;naturalHeight=180;set src(url){requested.push(url);if(!pending)queueMicrotask(()=>this.onload?.())}decode(){return Promise.resolve()}}
 vm.runInNewContext(source,{window,Image,setTimeout,clearTimeout,Map,Promise});
 return{window,requested,api:{_scenario:()=>scenario,_turns:()=>turns},replace(){scenario={...scenario}},turns};
}
test('entry primes at most three public images in display order, excluding hidden identities',async()=>{
 const {window,requested,api}=setup();await window.primeNexusReaderImages(api,async()=>{});
 assert.deepEqual(requested,['a','b','c']);assert.equal(window.NexusCortexPrimedImages.size,3);assert.equal(window.NexusCortexPrimedImages.scope,'test|v1');
});
test('entry requires writer-bound speech for character images, not a name mention',async()=>{
 const {window,requested,api,turns}=setup();turns[0].dialogueAnnotations=[];
 await window.primeNexusReaderImages(api,async()=>{});assert.deepEqual(requested,['scene']);
});
test('pending images and pending asset lookup cannot hold entry past the shared budget',async()=>{
 for(const blockLookup of [false,true]){const {window,api}=setup({pending:true});const start=Date.now();await window.primeNexusReaderImages(api,()=>blockLookup?new Promise(()=>{}):Promise.resolve(),{waitMs:20});assert.ok(Date.now()-start<500);}
});
test('a late asset lookup from a replaced scenario cannot populate the new image cache',async()=>{
 const {window,api,requested,replace}=setup();let release;const task=window.primeNexusReaderImages(api,()=>new Promise(resolve=>{release=resolve}));replace();release();await task;assert.deepEqual(requested,[]);assert.equal(window.NexusCortexPrimedImages,undefined);
});
