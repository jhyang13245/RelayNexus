import test from 'node:test';
import assert from 'node:assert/strict';
import { motionGeometry, transformGeometry, regionWeight, supportedFeatures, preciseMotionPixels } from '../public/vn-motion-geometry.mjs';

const width = 200, height = 300;
function mesh() {
  const p = Array.from({ length: 478 }, () => ({ x: .5, y: .3 }));
  const put = (i,x,y) => p[i] = { x:x/width, y:y/height };
  for (const [ids,cx] of [[[33,160,158,133,153,144],72],[[362,385,387,263,373,380],128]]) {
    [[-13,0],[-6,-4],[6,-4],[13,0],[6,4],[-6,4]].forEach(([x,y],i)=>put(ids[i],cx+x,65+y));
  }
  const ids=[61,40,37,0,267,270,291,321,314,17,84,91];
  ids.forEach((id,i)=>put(id,100-15*Math.cos(i*Math.PI/6),110-4*Math.sin(i*Math.PI/6)));
  return p;
}
function pixels() {
  const out = new Uint8ClampedArray(width*height*4);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) { const i=(y*width+x)*4;out.set([x%4?170:90, x%4?150:70, x%4?140:60,255],i); }
  return out;
}
const geometry = () => motionGeometry(mesh(),width,height);
function change(base,regions) {
  const out=base.slice();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(regions.some(r=>regionWeight(r,x,y)>.8)){const i=(y*width+x)*4;out[i]=50;out[i+1]=40;out[i+2]=30;}
  return out;
}
test('uses separate measured eyes and lips, rejects missing, malformed and implausible mesh',()=>{
  const g=geometry();assert.equal(g.regions.blink.length,2);assert.equal(g.regions.talk.length,1);
  assert.ok(Math.abs(g.regions.blink[0].cx-72)<1);assert.ok(Math.abs(g.regions.talk[0].cy-110)<1);
  assert.equal(motionGeometry([],width,height),null);
  const p=mesh();p[33].x=NaN;assert.equal(motionGeometry(p,width,height),null);
  const behind=mesh();for(const i of [61,40,37,0,267,270,291,321,314,17,84,91])behind[i].y=.05;
  assert.equal(motionGeometry(behind,width,height),null);
});
test('uniform scale, letterbox offsets and a tilted face retain coordinate alignment',()=>{
  const g=geometry(), scaled=transformGeometry(g,2,20,30);
  assert.equal(scaled.regions.blink[0].cx,g.regions.blink[0].cx*2+20);
  assert.equal(scaled.regions.talk[0].ry,g.regions.talk[0].ry*2);
  const a=.25,c=Math.cos(a),s=Math.sin(a),p=mesh().map(p=>{const x=p.x*width-100,y=p.y*height-90;return{x:(c*x-s*y+100)/width,y:(s*x+c*y+90)/height};});
  const tilted=motionGeometry(p,width,height);assert.ok(tilted);assert.ok(Math.abs(tilted.regions.blink[0].angle-a)<.001);
});
test('uncertain flat/transparent feature region stays static',()=>{
  const b=pixels();assert.equal(supportedFeatures(b,width,height,geometry(),'blink'),true);
  const flat=new Uint8ClampedArray(b.length).fill(255);assert.equal(supportedFeatures(flat,width,height,geometry(),'blink'),false);
  for(let i=3;i<b.length;i+=4)b[i]=0;assert.equal(supportedFeatures(b,width,height,geometry(),'blink'),false);
});
test('accepts local eye change; keeps all non-eye pixels and alpha exactly original',()=>{
  const b=pixels(),g=geometry(),v=change(b,g.regions.blink),out=preciseMotionPixels(b,v,width,height,g,'blink');assert.ok(out);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;assert.equal(out[i+3],b[i+3]);if(!g.regions.blink.some(r=>regionWeight(r,x,y)))assert.deepEqual(out.slice(i,i+4),b.slice(i,i+4));}
});
test('both eyes must actually change; mouth frames cannot masquerade as blinks',()=>{
  const b=pixels(),g=geometry();assert.equal(preciseMotionPixels(b,change(b,[g.regions.blink[0]]),width,height,g,'blink'),null);
  assert.equal(preciseMotionPixels(b,change(b,g.regions.talk),width,height,g,'blink'),null);
  assert.ok(preciseMotionPixels(b,change(b,g.regions.talk),width,height,g,'talk'));
});
test('hair movement is rejected even with a large unchanged body; incompatible expression rejects',()=>{
  const b=pixels(),g=geometry(),v=change(b,g.regions.blink);
  for(let y=12;y<18;y++)for(let x=50;x<150;x++){const i=(y*width+x)*4;v[i]=255;v[i+1]=0;}
  assert.equal(preciseMotionPixels(b,v,width,height,g,'blink'),null);
  const both=change(change(b,g.regions.blink),g.regions.talk);assert.equal(preciseMotionPixels(b,both,width,height,g,'blink'),null);
  assert.equal(preciseMotionPixels(b,b.slice(4),width,height,g,'blink'),null);
});
