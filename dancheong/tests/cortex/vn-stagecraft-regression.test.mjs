import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {validateStagecraft, createMusicSync, gradeFor, normalizeStagecraftPrefs} from '../../public/cortex-vn-stagecraft.mjs';
import {normalizeGain} from '../../public/cortex-vn-sound.mjs';
import {createStagecraft} from '../../public/cortex-vn-stagecraft-dom.mjs';

test('action evidence stays in one narrated sentence and rejects explicit negation', () => {
  for (const [text, anchor, kind] of [
    ['그는 웃었다. 칼날이 어깨를 베었다.', '그는 웃었다.', 'invert'],
    ['그녀는 검을 휘두르지 않았다.', '검을 휘두르지 않았다', 'speedlines'],
    ['그는 공격하지 않았다.', '공격하지 않았다', 'panels'],
    ['“칼날을 휘둘렀다.”', '칼날을 휘둘렀다', 'slowmo'],
    ['“숨을 삼켰다.”', '숨을 삼켰다', 'focuslines'],
  ]) assert.equal(validateStagecraft({action:{kind,anchor}}, text)?.action ?? null, null, text);
  assert.equal(validateStagecraft({action:{kind:'invert', anchor:'칼날이 어깨를 베었다.'}}, '칼날이 어깨를 베었다. 그는 웃었다.').action.kind, 'invert');
});

test('music deadline notifies without another render and silence cancels a pending entrance', () => {
  let time = 0, serial = 0, changes = 0; const timers = new Map();
  const sync = createMusicSync({now:()=>time, onChange:()=>changes++, setTimer:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimer:id=>timers.delete(id)});
  assert.equal(sync.select({pageKey:'a',music:'normal'}),'normal');
  assert.equal(sync.select({pageKey:'b',music:'battle',cueBound:true}),'normal');
  assert.equal(timers.size,1);
  time=6000; [...timers.values()][0].fn();
  assert.equal(changes,1);assert.equal(timers.size,0);
  assert.equal(sync.select({pageKey:'b',music:'battle',cueBound:true}),'battle');
  sync.select({pageKey:'c',music:'sad',cueBound:true});
  assert.equal(sync.select({pageKey:'c',music:'silence',cueBound:true}),'silence');assert.equal(timers.size,0);
  sync.select({pageKey:'d',music:'normal',cueBound:true});sync.reset();assert.equal(timers.size,0);
});

test('recorded samples respect a peak ceiling including unsampled transients and gain trim', () => {
  const data = new Float32Array(10000).fill(.001);data[1]=.99;
  const buffer = {numberOfChannels:1,getChannelData:()=>data};
  for (const trim of [1,2,NaN]) {
    const gain=normalizeGain(buffer,trim);assert.ok(Number.isFinite(gain));assert.ok(gain*.99<=.900001);
  }
});

test('unexpected palette prototype names safely use the neutral grade', () => {
  for(const value of ['constructor','__proto__','toString']) assert.deepEqual(gradeFor(value),gradeFor());
});

function runtime(t,{loadImage,storage=null}={}) {
  const dom=new JSDOM('<div id="vn-stage"><div class="visual"><div class="vn-background is-active has-image" style="background-image:url(&quot;bg.png&quot;)"></div></div></div>',{pretendToBeVisual:true});
  const win=dom.window, before=new Map(), names=['document','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','Image','requestIdleCallback'];
  for(const name of names){before.set(name,globalThis[name]);globalThis[name]=name==='requestIdleCallback'?()=>0:win[name]?.bind?.(win)||win[name];}
  t.after(()=>{for(const [name,value] of before){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}win.close();});
  const animations=[],sounds=[],canvases=[];
  win.HTMLElement.prototype.animate=function(frames,options){const animation={element:this,frames,options,cancel(){this.cancelled=true;},pause(){this.paused=true;},play(){this.paused=false;}};animations.push(animation);return animation;};
  win.HTMLCanvasElement.prototype.getContext=function(){canvases.push(this);return {drawImage(){},getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})};};
  const stage=win.document.querySelector('#vn-stage'),visual=stage.querySelector('.visual');
  let prefs=normalizeStagecraftPrefs({}),reduced=false;
  const craft=createStagecraft({stage,visual,loadImage,storage,prefs:()=>prefs,reduced:()=>reduced,
    sound:{whoosh:()=>sounds.push('whoosh'),motif:()=>{sounds.push('motif');return true;},stop(){},duck:{duck(){}}}});
  t.after(()=>craft.reset());
  const base={pageKey:'a',scope:'work',sceneKey:'room',enabled:true,background:'bg.png',portraits:[],direction:{},fresh:false};
  const update=value=>craft.update({...base,...value});
  return {craft,stage,visual,animations,sounds,canvases,update,setReduced:value=>{reduced=value;},setPrefs:value=>{prefs=normalizeStagecraftPrefs(value);}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('page change and reduced motion cancel running action animations', t => {
  const r=runtime(t);r.update();r.craft.fire({kind:'action',action:'slowmo'});
  assert.equal(r.animations.length,2);r.update({pageKey:'b'});
  assert.ok(r.animations.every(a=>a.cancelled));
  r.craft.fire({kind:'action',action:'speedlines'});assert.equal(r.stage.querySelector('.vn-sc-speedlines').hidden,false);
  r.setReduced(true);r.update({pageKey:'b'});assert.equal(r.stage.querySelector('.vn-sc-speedlines').hidden,true);
});

test('a delayed rapid cut cannot resurrect an effect on the next page', async t => {
  let resolveImage;const r=runtime(t,{loadImage:()=>new Promise(resolve=>{resolveImage=resolve;})});
  r.update();r.craft.fire({kind:'action',action:'rapidcut'});await tick();assert.ok(resolveImage);
  r.update({pageKey:'b'});resolveImage({naturalWidth:160,naturalHeight:90});await tick();await tick();
  assert.deepEqual(r.sounds,[]);assert.equal(r.stage.querySelector('.vn-sc-speedlines').hidden,true);assert.equal(r.stage.querySelector('.vn-sc-rapid').hidden,true);
});

test('disabled or reduced depth clears old layers and skips pixel work', t => {
  let loads=0;const r=runtime(t,{loadImage:async()=>{loads++;return {naturalWidth:160,naturalHeight:90};}});
  r.update();const bg=r.visual.querySelector('.vn-background');bg.dataset.depth='on';
  r.update({enabled:false});assert.equal(bg.dataset.depth,'off');assert.equal(bg.vnDepth.url,'');
  r.setReduced(true);r.update();assert.equal(bg.dataset.depth,'off');assert.equal(bg.vnDepth.url,'');assert.equal(loads,0);
});

test('previous CG memory cannot cross a location boundary', t => {
  const r=runtime(t);r.setPrefs({cgcamera:'off',facecheck:'off'});
  r.update({eventArt:'cg.png',background:'cg.png'});
  r.update({pageKey:'b',loading:true});assert.equal(r.stage.querySelector('.vn-sc-memory').classList.contains('is-on'),true);
  r.update({pageKey:'c',sceneKey:'another room',loading:true});assert.equal(r.stage.querySelector('.vn-sc-memory').classList.contains('is-on'),false);
});

test('late participant portraits are checked and image analysis has bounded dimensions', async t => {
  const loads=[];const r=runtime(t,{loadImage:async url=>{loads.push(url);return {naturalWidth:10,naturalHeight:20000};}});
  r.setPrefs({cgcamera:'off'});
  const frame={eventArt:'cg.png',background:'cg.png',eventCharacterIds:['a','b'],portraits:[{id:'a',url:'a.png'},{id:'b',url:''}]};
  r.update(frame);await tick();await tick();assert.ok(loads.includes('a.png'));
  r.update({...frame,portraits:[{id:'a',url:'a.png'},{id:'b',url:'b.png'}]});await tick();await tick();
  assert.ok(loads.includes('b.png'));assert.ok(r.canvases.every(c=>c.width<=128&&c.height<=128));
});

test('malformed local motif state does not block the player and paused views stay quiet', t => {
  const r=runtime(t,{storage:{getItem:()=> 'null',setItem(){}}});
  r.update({fresh:true,portraits:[{id:'a',url:'a.png'}],paused:true});assert.deepEqual(r.sounds,[]);
  r.update({fresh:true,portraits:[{id:'a',url:'a.png'}]});assert.deepEqual(r.sounds,['motif']);
});
