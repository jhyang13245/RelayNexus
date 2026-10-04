import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingRegistration, registeredStageCamera } from '../../public/cortex-vn-registration.mjs';
import { faceFrame, portraitFrameCheck } from '../../public/vn-runtime/vn-sprite.mjs';

function drawing(seed=1,height=180,offset=0){
  const width=140,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=10;x<130;x++){
    const i=(y*width+x)*4,v=(x*13+(y+offset)*7+seed*91)%255;
    data.set([v,(x*3+(y+offset)*17+seed*41)%255,(v*3+seed*71)%255,255],i);
  }
  return {width,height,sourceWidth:width,sourceHeight:height,data,bounds:{left:10,right:129,top:0,bottom:height-1,width:120,height}};
}
test('same drawing transfers coordinates through a lower crop, not just face similarity',()=>{
  const ref=drawing(),crop=drawing(1,100),mapping=drawingRegistration(crop,ref);
  assert.ok(mapping);assert.ok(Math.abs(mapping.scale-1)<.01);assert.ok(Math.abs(mapping.y)<1);
  assert.equal(drawingRegistration(drawing(2),ref),null);
  assert.equal(drawingRegistration(drawing(3,100),ref),null);
});
test('whole-body camera transfer preserves shoulders, pelvis and source aspect ratio',()=>{
  const base={x:500,eyeX:500,eyeY:250,width:160,headWidth:200,eyeGap:80,stageHeight:1500,stageY:50,sourceTop:30,
    body:{eyes:{x:500,y:250},chin:{x:500,y:380},shoulders:{x:500,y:530},hips:{x:500,y:1120},shoulderWidth:400,hipWidth:300,torsoLength:590,coverage:'torso'}};
  const bounds={left:50,right:450,top:15,bottom:400,width:401,height:386,transparentFraction:.4};
  const copy=registeredStageCamera(base,{scale:.5,x:0,y:0,error:0,coverage:1},bounds);
  assert.equal(copy.stageHeight,750);assert.equal(copy.body.torsoLength,295);assert.equal(copy.body.hips.y,560);
  assert.equal(copy.body.shoulderWidth/copy.body.hipWidth,4/3);
  assert.equal(portraitFrameCheck(bounds,copy).code,'SHORT_BODY_CROP');
  assert.equal(faceFrame(bounds,copy).outHeight,750,'a bust is not enlarged to fill missing body');
  const headCut=registeredStageCamera(base,{scale:1,x:0,y:-100,error:0,coverage:1},{...bounds,top:0,height:1400});
  assert.equal(portraitFrameCheck({...bounds,top:0,height:1400},headCut).code,'SOURCE_CROWN_CROP');
});
test('heavy occlusion cannot qualify as the same drawing',()=>{
  const ref=drawing(),hidden=drawing();
  for(let y=15;y<125;y++)for(let x=10;x<130;x++)hidden.data.set([45,45,55,255],(y*140+x)*4);
  assert.equal(drawingRegistration(hidden,ref),null);
});
test('a restarted detector receives the reference even when the client cache is warm',async()=>{
  const original={Worker:globalThis.Worker,Image:globalThis.Image,createImageBitmap:globalThis.createImageBitmap,setTimeout:globalThis.setTimeout};
  const requests=[];let idle,workers=0;
  globalThis.Image=class {async decode(){}};
  globalThis.createImageBitmap=async image=>({src:image.src,close(){}});
  globalThis.setTimeout=(fn,ms,...args)=>ms===90000?(idle=fn,0):original.setTimeout(fn,ms,...args);
  globalThis.Worker=class {constructor(){workers++;}terminate(){}postMessage(data){requests.push(data);queueMicrotask(()=>this.onmessage({data:{id:data.id,camera:{width:100,height:200,mesh:[]}}}));}};
  try{
    const {detectCameraGeometry}=await import('../../public/vn-runtime/vn-motion-landmarks.mjs?restart-test');
    await detectCameraGeometry('base');idle();
    await detectCameraGeometry('cropped','base');
    assert.equal(workers,2);
    assert.equal(requests.at(-1).referenceBitmap.src,'base');
    assert.equal(requests.at(-1).referenceCamera.width,100);idle();
  }finally{Object.assign(globalThis,original);}
});
