import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { measureStageBody } from '../../public/cortex-vn-camera.mjs';
import { faceFrame, cameraLandmarks, boundedCameraGeometry, clearSpriteMemory, portraitFrameCheck } from '../../public/vn-runtime/vn-sprite.mjs';
import { projectStature } from '../../public/vn-runtime/vn-stature.mjs';

function figure({scale=1,dx=0,dy=0,bottom=1500,torso=600,hipConfidence=1}={}) {
  const width=1100*scale+dx*2,height=1600*scale+dy*2;
  const p=(x,y,v=1)=>({x:(x*scale+dx)/width,y:(y*scale+dy)/height,visibility:v,presence:v});
  const mesh=Array.from({length:468},()=>p(500,250));
  for(const i of [33,133])mesh[i]=p(455,250);
  for(const i of [362,263])mesh[i]=p(545,250);
  mesh[152]=p(500,380);mesh[234]=p(410,285);mesh[454]=p(590,285);
  const body=Array.from({length:33},()=>p(500,250,0));
  body[11]=p(300,510);body[12]=p(700,510);body[23]=p(350,510+torso,hipConfidence);body[24]=p(650,510+torso,hipConfidence);
  const bounds={left:100*scale+dx,right:900*scale+dx,top:30*scale+dy,bottom:bottom*scale+dy,width:801*scale,height:(bottom-30+1)*scale,transparentFraction:.3};
  return {input:{mesh,body,width,height},bounds};
}
const measure=f=>measureStageBody(f.input,f.bounds);
test('whole torso changes camera fit, without scaling shoulders or pelvis independently',()=>{
  const a=figure(),b=figure({torso:730});
  const first=measure(a),longer=measure(b);
  assert.equal(first.body.coverage,'torso');
  assert.ok(longer.stageHeight>first.stageHeight,'identical faces alone cannot force identical zoom for different torso drawings');
  const frame=faceFrame(a.bounds,first);
  assert.ok(frame.y>=0);
  assert.equal(first.body.shoulderWidth,400);
  assert.equal(first.body.hipWidth,300);
  assert.equal(first.body.shoulderWidth/first.body.hipWidth,4/3,'source build stays intact');
  assert.ok(first.body.hips.y>first.body.shoulders.y);
});
test('transparent padding, source resolution and a lower crop preserve measured anatomy',()=>{
  const a=measure(figure()),padded=measure(figure({dx:200,dy:170})),half=measure(figure({scale:.5})),cropped=measure(figure({bottom:1250}));
  assert.ok(Math.abs(a.stageHeight-padded.stageHeight)<1e-8);
  assert.ok(Math.abs(a.stageHeight-half.stageHeight*2)<1e-8);
  assert.ok(Math.abs(a.stageHeight-cropped.stageHeight)<1e-8,'visible torso is not rescaled to the available bottom edge');
});
test('hidden or cropped hips cannot become invented body anchors',()=>{
  for(const f of [figure({bottom:800}),figure({hipConfidence:.2})]){
    const m=measure(f);assert.equal(m.body.hips,null);assert.equal(m.body.coverage,'upper-body');
  }
  const short=figure({bottom:800});assert.equal(portraitFrameCheck(short.bounds,measure(short)).code,'SHORT_BODY_CROP');
});
test('validated body ignores a blonde-hair false face and authored heights still govern stature',()=>{
  const f=figure(),wrong={x:400,eyeY:80,width:30,headWidth:70,stageHeight:3000,stageCalibration:'cheek-band-v1'};
  const m=cameraLandmarks(f.input,f.bounds,wrong);
  assert.equal(m.eyeY,250);assert.notEqual(m.stageHeight,3000);
  assert.equal(projectStature({heightCm:164}).heightCm,164,'Kim Seo-yeon authored-height fixture');
  assert.equal(projectStature({heightCm:178}).scale/projectStature({heightCm:162}).scale,178/162);
});
test('a first-paint timeout does not poison subsequent camera measurement',async()=>{
  clearSpriteMemory();let release,calls=0;
  const detection=new Promise(r=>release=r),detect=()=>{calls++;return detection;};
  assert.equal(await boundedCameraGeometry('test-timeout',detect,5),null);
  const result={body:[]};release(result);
  assert.equal(await boundedCameraGeometry('test-timeout',detect,30),result);
  assert.equal(calls,1,'one in-flight local measurement is shared');
});
test('production builds from maintained overrides and ships local inference assets',()=>{
  const build=fs.readFileSync('scripts/port-visual-novel.mjs','utf8');
  assert.match(build,/cameraOverrides/);
  for(const file of ['face_landmarker.task','pose_landmarker_lite.task','wasm/vision_wasm_module_internal.wasm'])assert.ok(fs.statSync('public/vn-vision/1.0.1/'+file).size>1000000);
  const sprite=fs.readFileSync('public/vn-runtime/vn-sprite.mjs','utf8');
  assert.match(sprite,/measureStageBody/);assert.doesNotMatch(sprite,/if \(fallback\?\.stageCalibration === 'cheek-band-v1'\) return fallback/);
});
