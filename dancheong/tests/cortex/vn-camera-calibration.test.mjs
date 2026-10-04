import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateStageFace } from '../../public/cortex-vn-camera.mjs';
import { alphaBounds, portraitLandmarks, cameraLandmarks, faceFrame } from '../../public/vn-runtime/vn-sprite.mjs';
import { characterHeight, projectStature, stageReferenceHeight } from '../../public/vn-runtime/vn-stature.mjs';
import { CAMERA_VERSION, cameraIdentity, savedCamera, saveCamera, clearCameraMemory } from '../../public/vn-runtime/vn-camera-store.mjs';

// Same face and body photographed through two different hairstyles. A slit
// between bangs exposes skin well above the actual eyes (the reported bug).
function portrait({ forehead = false, height = 1000, scale = 1 } = {}) {
  const width = 400 * scale, data = new Uint8ClampedArray(width * height * scale * 4);
  const fill = (x, y, w, h, rgb) => {
    for (let yy=y*scale; yy<(y+h)*scale; yy++) for(let xx=x*scale; xx<(x+w)*scale; xx++) data.set([...rgb,255],(yy*width+xx)*4);
  };
  fill(90,200,220,height-220,[20,30,40]);
  fill(100,20,200,210,[45,45,50]);
  if(forehead) fill(180,80,40,65,[195,150,110]);
  fill(140,145,120,85,[195,150,110]);
  const bounds=alphaBounds(data,width,height*scale);
  return {data,width,bounds,face:portraitLandmarks(data,width,bounds)};
}

test('a forehead gap does not move the eyes upward or enlarge the same face',()=>{
  const covered=portrait(),parted=portrait({forehead:true});
  assert.equal(parted.face.stageCalibration,'cheek-band-v1');
  assert.ok(parted.face.eyeY>120,'anchor lies near the eyes, not at the forehead slit at y=80');
  assert.equal(parted.face.eyeY,covered.face.eyeY);
  assert.equal(faceFrame(parted.bounds,parted.face).outHeight,faceFrame(covered.bounds,covered.face).outHeight);
  assert.ok(faceFrame(parted.bounds,parted.face).y>=0,'hair crown remains inside the rendered frame');
});

test('body crop and source resolution do not change relative face magnification',()=>{
  const full=portrait({forehead:true}),bust=portrait({forehead:true,height:600}),large=portrait({forehead:true,scale:2});
  const a=faceFrame(full.bounds,full.face),b=faceFrame(bust.bounds,bust.face),c=faceFrame(large.bounds,large.face);
  assert.equal(a.outHeight,b.outHeight,'a shorter image must not be enlarged to fit');
  assert.ok(Math.abs(c.outHeight/a.outHeight-2)<.005,'double-resolution pixels retain the same display scale');
  assert.ok(Math.abs(large.face.eyeY/2-full.face.eyeY)<1);
});

test('validated eyes override a colour-based forehead estimate before camera caching',()=>{
  const {bounds,face}=portrait({forehead:true});
  const geometry={regions:{blink:[{cx:170,cy:139},{cx:230,cy:140}]}};
  const measured=cameraLandmarks(geometry,bounds,face);
  assert.equal(measured.eyeY,139.5);
  assert.equal(measured.stageHeight,undefined,'a stale cheek-band scale cannot override measured geometry');
  assert.notDeepEqual(faceFrame(bounds,measured),faceFrame(bounds,face));
});

test('uncertain skin and short exposed hair preserve the established fallback',()=>{
  const {data,width,bounds}=portrait();
  const fallback={x:200,eyeY:140,width:120,headWidth:200};
  assert.equal(calibrateStageFace(new Uint8ClampedArray(data.length),width,bounds,fallback),fallback);
  const exposed={...fallback,exposedForehead:true};
  assert.equal(calibrateStageFace(data,width,bounds,exposed),exposed);
  assert.equal(calibrateStageFace(data,width,bounds,null),null);
});

test('authored heights and a common virtual floor remain independent of camera normalization',()=>{
  const roster=[{heightCm:163},{heightCm:168},{heightCm:178}],reference=stageReferenceHeight(roster);
  const projections=roster.map(person=>projectStature(person,reference));
  assert.equal(characterHeight({heightCm:163,publicProfile:'키 180cm'}),163);
  const belowFrame=.97*.35/.65;
  const floors=projections.map(p=>-p.lift+p.scale*belowFrame);
  assert.ok(Math.max(...floors)-Math.min(...floors)<1e-12,'cropped thighs are not mistaken for a shared foot line');
  assert.equal(projections[0].scale/projections[1].scale,163/168);
  assert.deepEqual(projectStature(roster[0],reference),projections[0],'solo and group slots use the same camera/height projection');
});

test('old geometry is recalculated without changing source images or clearing paid assets',async()=>{
  clearCameraMemory();
  const source='data:image/webp;base64,cHJlc2VydmVkLWltYWdl',hash=await cameraIdentity(source);
  const {width,bounds,face}=portrait();
  const row={hash,version:'stage-camera-main-1.25.1',width,height:1000,bounds,frame:faceFrame(bounds,face)};
  assert.equal(await savedCamera(source,row),null);
  const current=await saveCamera(source,row);
  assert.equal(current.version,CAMERA_VERSION);
  assert.equal(current.hash,hash);
  assert.deepEqual(await savedCamera(source),current);
});
