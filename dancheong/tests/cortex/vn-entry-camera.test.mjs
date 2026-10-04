import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cameraHeight, faceFrame, portraitLandmarks, alphaBounds } from '../../public/vn-runtime/vn-sprite.mjs';
import { characterHeight, projectStature } from '../../public/vn-runtime/vn-stature.mjs';

test('exposed forehead correction is bounded without turning height into zoom',()=>{
  const bounds={left:0,right:699,top:0,bottom:999,width:700,height:1000};
  const exposed={x:350,eyeY:116,width:178,headWidth:184,exposedForehead:true};
  const bangs={x:350,eyeY:123,width:85,headWidth:192,exposedForehead:false};
  const a=cameraHeight(exposed,bounds),b=cameraHeight(bangs,bounds);
  const old=cameraHeight({...exposed,exposedForehead:false},bounds);
  assert.ok(a<old&&old/a<=1.24+1e-8,'exposed-skin correction cannot enlarge a portrait by more than 24%');
  assert.ok(a>=b,'hair silhouette alone cannot turn an angular face into an oversized closeup');
  assert.ok(faceFrame(bounds,exposed).y>=0,'crown remains inside the drawing');
  assert.equal(characterHeight({publicProfile:'평범한 중년 남성'}),178);
  assert.equal(projectStature({heightCm:163}).scale,163/178);
  assert.equal(cameraHeight({...exposed,eyeGap:54},bounds),cameraHeight({...bangs,eyeGap:54},bounds),'validated eye landmarks still govern camera distance');
  assert.ok(faceFrame(bounds,{...bangs,eyeY:330}).y>=0,'tall hair is never cut off');
});

test('pixel measurement classifies short exposed hair separately from bangs',()=>{
  const w=400,h=1000,d=new Uint8ClampedArray(w*h*4);
  const fill=(x,y,width,height,r,g,b)=>{for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)d.set([r,g,b,255],(yy*w+xx)*4);};
  fill(90,180,220,800,20,30,40);fill(125,20,150,180,50,50,50);fill(133,65,134,130,195,150,110);
  const exposed=portraitLandmarks(d,w,alphaBounds(d,w,h));
  assert.equal(exposed.exposedForehead,true);
  // A narrower skin window under broad hair needs the covered-face estimator.
  d.fill(0);fill(90,180,220,800,20,30,40);fill(100,20,200,180,50,50,50);fill(155,100,90,95,195,150,110);
  const bangs=portraitLandmarks(d,w,alphaBounds(d,w,h));
  assert.equal(bangs.exposedForehead,false);
});

test('history import yields for first paint, batches writes, and keeps work identity',async()=>{
  const source=fs.readFileSync('public/vn-runtime/vn-costs.mjs','utf8');
  const start=source.indexOf('    importHistory('),end=source.indexOf('    async render(',start);
  let release, reads=0, writes=0;const blocked=new Promise(r=>release=r),stored=[];
  const context={historyTask:Promise.resolve(),setTimeout,context:()=>({slug:'first'}),memory:new Map(),
    historyBefore:Date.now(),estimateCost:()=>({usd:.01}),pricingDate:'test',onChange(){},
    records:async rows=>{if(!rows){reads++;await blocked;return stored;}writes++;stored.push(...rows);}};
  const api=vm.runInNewContext(`({${source.slice(start,end)}})`,context);
  const turns=[{apiLog:Array.from({length:100},(_,i)=>({id:String(i),startedAt:'2025-01-01',model:'gpt-6-luna',usage:{inputTokens:1,outputTokens:1}}))}];
  let finished=false;const task=api.importHistory(turns).then(()=>finished=true);
  assert.equal(reads,0,'first paint can occur before the database task');
  await new Promise(r=>setTimeout(r,10));assert.equal(finished,false);
  context.context=()=>({slug:'another'});release();await task;
  assert.equal(writes,1,'100 history entries use one write transaction');
  assert.equal(stored.length,100);assert.ok(stored.every(row=>row.slug==='first'));
  await api.importHistory(turns,{slug:'first'});assert.equal(writes,1,'reopening never rewrites the same history');
});

test('published entry is a single bundle with worker URLs beside it',()=>{
  const manifest=JSON.parse(fs.readFileSync('public/vn-runtime/manifest.json','utf8'));
  assert.equal(manifest.entry,'reader.mjs');
  const bundle=fs.readFileSync('public/vn-runtime/reader.mjs','utf8');
  assert.ok(bundle.length<700000);
  assert.doesNotMatch(bundle,/\bfrom\s*["']\.\.?\//u,'no renderer dependency waterfall');
  assert.match(bundle,/vn-raster-worker\.mjs/);
  assert.match(bundle,/vn-motion-worker\.mjs/);
});
