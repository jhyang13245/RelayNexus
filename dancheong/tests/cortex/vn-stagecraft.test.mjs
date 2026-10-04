import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {JSDOM} from 'jsdom';
import {validateStagecraft,stagecraftCues,textMarks,typingPace,createMusicSync,leitmotif,estimateDepth,depthMasks,focusRegions,regionTransform,coverPoint,spriteSignature,signatureMatch,composeArtStyle,artRuleText,normalizeArtRule,gradeFor,normalizeStagecraftPrefs,stagecraftSchema} from '../../public/cortex-vn-stagecraft.mjs';
import {createDuck,createSampleFoley,createStageSound,normalizeGain} from '../../public/cortex-vn-sound.mjs';
import {cuePlan} from '../../public/cortex-vn-performance.mjs';
import {createCuePlayer} from '../../public/cortex-vn-cue-player.mjs';
import {compactCastRequest,expandCastDecision} from '../../public/cortex-vn-cast-wire.mjs';
import {typeset,renderTypeset} from '../../public/vn-runtime/vn-typeset.mjs';
import {createTextRevealer} from '../../public/vn-runtime/vn-reader.mjs';
import {castRequest,directionFor} from '../../public/vn-runtime/vn-cast.mjs';
import {musicCues} from '../../public/vn-runtime/vn-music-direction.mjs';
import {musicPattern} from '../../public/vn-runtime/vn-music.mjs';
import {selectedTrack,musicMoods} from '../../public/vn-runtime/vn-work-music.mjs';

const beat='검은 그림자가 칼날을 휘둘렀다. 시키는 숨을 삼켰다. “죽여 버릴 거야.”';
const plain={marks:[],layout:'normal',tempo:'normal',action:{kind:'none',anchor:''},stinger:{kind:'none',anchor:''},leitmotif:'none'};

test('stagecraft accepts only exact, motivated, present-tense staging',()=>{
 assert.equal(validateStagecraft(plain,beat),null,'ordinary beats stay plain');
 const result=validateStagecraft({...plain,marks:[{text:'죽여',style:'crimson'},{text:'없는 단어',style:'gold'}],action:{kind:'speedlines',anchor:'칼날을 휘둘렀다'},stinger:{kind:'shock',anchor:'숨을 삼켰다'}},beat,{focusId:'shiki'});
 assert.deepEqual(result.marks,[{text:'죽여',style:'crimson'}]);
 assert.deepEqual(result.action,{kind:'speedlines',anchor:'칼날을 휘둘렀다'});
 assert.equal(result.stinger.kind,'shock');
 // Physical action needs narration (not a quotation) and action wording.
 assert.equal(validateStagecraft({...plain,action:{kind:'invert',anchor:'죽여 버릴 거야'}},beat)?.action??null,null);
 assert.equal(validateStagecraft({...plain,action:{kind:'panels',anchor:'창밖을 보았다'}},'그는 창밖을 보았다.')?.action??null,null);
 assert.equal(validateStagecraft({...plain,action:{kind:'focuslines',anchor:'숨을 삼켰다'}},beat).action.kind,'focuslines');
 assert.equal(validateStagecraft({...plain,action:{kind:'speedlines',anchor:'칼날을 휘둘렀다'}},'기억 속에서 그는 칼날을 휘둘렀다.')?.action??null,null,'memories are not present action');
 assert.equal(validateStagecraft({...plain,layout:'center'},beat).layout,'center');
 assert.equal(validateStagecraft({...plain,layout:'center'},beat.repeat(3)),null,'long lines are not isolated');
 assert.equal(validateStagecraft({...plain,leitmotif:'focus'},beat),null,'a motif needs a present focus');
 assert.equal(validateStagecraft({...plain,tempo:'halting'},'그건 아니야'),null,'halting needs punctuation');
 assert.equal(validateStagecraft({...plain,marks:[{text:'죽여',style:'neon'}]},beat),null);
});

test('stagecraft cues ride the text clock; emphasis keeps only its stinger',()=>{
 const stagecraft={marks:[],layout:'normal',tempo:'normal',action:{kind:'speedlines',anchor:'칼날을 휘둘렀다'},stinger:{kind:'shock',anchor:'숨을 삼켰다'},leitmotif:'none'};
 const visible=typeset(beat).visible;
 const plan=cuePlan({stagecraft},visible);
 assert.deepEqual(plan.map(c=>c.kind),['action','stinger']);
 assert.equal(plan[0].at,Array.from(visible.slice(0,visible.indexOf('칼날을 휘둘렀다')+'칼날을 휘둘렀다'.length)).length);
 const withEmphasis=cuePlan({stagecraft,emphasis:{kind:'hold',text:'죽여 버릴 거야.'}},visible);
 assert.deepEqual(withEmphasis.map(c=>c.kind).sort(),['emphasis','stinger']);
 assert.deepEqual(stagecraftCues(null,visible),[]);
 const fired=[];const player=createCuePlayer({fire:c=>fired.push(c.kind)});
 player.update({key:'p',text:visible,direction:{stagecraft},fresh:true,enabled:true});
 player.progress(5);assert.deepEqual(fired,[]);
 for(let i=6;i<=Array.from(visible).length;i++)player.progress(i);assert.deepEqual(fired,['action','stinger']);
});

test('text marks typeset as styled spans; tremble splits glyphs; partial typing stays exact',()=>{
 const marks=textMarks({marks:[{text:'죽여',style:'tremble'},{text:'칼날',style:'crimson'}]},beat);
 const layout=typeset(beat,'',marks);
 assert.equal(layout.visible,beat);
 assert.deepEqual(layout.segments.filter(s=>s.fx).map(s=>[s.text,s.fx]),[['칼날','crimson'],['죽여','tremble']]);
 const dom=new JSDOM('<p></p>'),p=dom.window.document.querySelector('p');
 renderTypeset(p,layout,Infinity);
 assert.equal(p.textContent,beat);
 assert.equal(p.querySelector('.vn-fx-tremble').children.length,2);
 assert.equal(p.querySelector('.vn-fx-crimson').textContent,'칼날');
 renderTypeset(p,layout,8);assert.equal(p.textContent,Array.from(beat).slice(0,8).join(''));
 assert.deepEqual(typeset(beat).segments,[{text:beat}],'no effects, no change');
});

test('typing pace slows marked phrases and pauses at halting punctuation',()=>{
 const visible='그건… 아니야, 정말로.';
 const pace=typingPace({marks:[{text:'정말로',style:'tremble'}],tempo:'halting'},visible);
 assert.ok(pace(3)>pace(2),'after an ellipsis');
 assert.ok(pace(Array.from(visible).indexOf('정'))>=2.2);
 assert.equal(typingPace({marks:[],tempo:'normal'},visible),null);
 assert.equal(typingPace({marks:[],tempo:'slow'},visible)(1),2.4);
 const delays=[];const reveal=createTextRevealer({write(){},onComplete(){},schedule:(fn,ms)=>{delays.push(ms);return delays.length;},cancel(){}});
 reveal.update({key:'a',text:'가나다',speed:'natural'});const plainDelays=delays.length;
 for(let i=0;i<3;i++){/* advance */}
 const slow=[];const slowReveal=createTextRevealer({write(){},onComplete(){},schedule:(fn,ms)=>{slow.push(ms);return slow.length;},cancel(){}});
 slowReveal.update({key:'a',text:'가나다',speed:'natural',pace:()=>3});
 assert.equal(plainDelays,1);assert.equal(slow.length,1);
});

test('the cast request carries stagecraft in the same call, compact wire included',()=>{
 const person={id:'a',name:'시키',aliases:[]};
 const request=castRequest({scope:'t',candidates:[person],publicText:beat},'gpt-6-luna');
 assert.match(request.instructions,/stagecraft\.action/u);
 const cue=request.text.format.schema.properties.beats.items.properties.cues.items.anyOf.find(c=>c.properties.field.enum[0]==='stagecraft');
 assert.deepEqual(cue.properties.value,stagecraftSchema,'one call, compact wire, same schema');
 assert.equal(typeof compactCastRequest,'function');
 const expanded=expandCastDecision({format:'cast-compact-1',proofs:[],bindings:[],beats:[{beat:'P0',speaker:'',speakerLabel:'',speakerEvidence:-1,onStage:[],cues:[]}]});
 assert.equal(expanded.beats[0].stagecraft,null,'omitted stagecraft is plain');
 const direction=directionFor({shot:'medium',expressions:[],focus:'C0',stagecraft:{...plain,action:{kind:'speedlines',anchor:'칼날을 휘둘렀다'}}},[person],new Set([0]),beat,beat);
 assert.equal(direction.stagecraft.action.kind,'speedlines');
 assert.equal(directionFor({shot:'medium',expressions:[]},[person],new Set([0]),beat,beat).stagecraft,null,'old cached decisions stay valid');
});

test('battle music: a cue, a procedural pattern and a tense fallback for tracks',async()=>{
 assert.ok(musicCues.includes('battle'));
 const pattern=musicPattern('battle');assert.equal(pattern.mood,'battle');assert.equal(pattern.bpm,152);
 assert.equal(musicMoods.battle,'전투');
 const reads=[];const blob=new Blob([new Uint8Array([1])],{type:'audio/mpeg'});
 const track=await selectedTrack('w','battle',{},async key=>{reads.push(JSON.parse(key)[2]);return JSON.parse(key)[2]==='tense'?{blob,savedAt:1}:null;});
 assert.deepEqual(reads,['battle','tense']);assert.ok(track.id.includes(':tense:'));
});

test('music change waits for the beat cue, then enters with it (or after a timeout)',()=>{
 let t=0;const sync=createMusicSync({now:()=>t,hold:6000});
 assert.equal(sync.select({pageKey:'a',music:'normal'}),'normal');
 assert.equal(sync.select({pageKey:'b',music:'battle',cueBound:true}),'normal','held until the cue');
 assert.equal(sync.release(),true);
 assert.equal(sync.select({pageKey:'b',music:'battle',cueBound:true}),'battle');
 assert.equal(sync.select({pageKey:'c',music:'sad',cueBound:true}),'battle');t=7000;
 assert.equal(sync.select({pageKey:'c',music:'sad',cueBound:true}),'sad','never held forever');
 assert.equal(sync.select({pageKey:'d',music:'warm',cueBound:false}),'warm');
});

test('leitmotifs are stable per character and differ between characters',()=>{
 assert.deepEqual(leitmotif('arcueid','w'),leitmotif('arcueid','w'));
 assert.notDeepEqual(leitmotif('arcueid','w').notes,leitmotif('ciel','w').notes);
 const theme=leitmotif('x');assert.ok(theme.notes.length>=5&&theme.notes.length<=7);
});

function image(w,h,pixel){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const [r,g,b,a=255]=pixel(x,y);data.set([r,g,b,a],(y*w+x)*4);}return data;}
test('heuristic depth: hazy bright sky reads far, detailed ground reads near',()=>{
 const w=64,h=36,data=image(w,h,(x,y)=>y<h/2?[205,215,228]:[(x*37+y*11)%200,(x*13)%160+40,(y*29)%120]);
 const depth=estimateDepth(data,w,h),avg=(y0,y1)=>{let s=0,n=0;for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){s+=depth[y*w+x];n++;}return s/n;};
 assert.ok(avg(h-8,h)>avg(0,8)+.4);
 const masks=depthMasks(depth);assert.equal(masks.near.length,w*h);
 assert.ok(masks.near[(h-1)*w+5]>200&&masks.near[w+5]<30);
});

test('CG close-up regions find a face-like skin area; transforms never show edges',()=>{
 const w=96,h=54,data=image(w,h,(x,y)=>Math.hypot(x-60,y-16)<7?[244,208,190]:[40,48,70]);
 const [face]=focusRegions(data,w,h);
 assert.equal(face.kind,'face');assert.ok(Math.abs(face.x-60/96)<.05&&Math.abs(face.y-16/54)<.08);
 assert.equal(regionTransform({x:.99,y:.01},2),'translate(-50.00%, 50.00%) scale(2)');
 const point=coverPoint({x:.5,y:.5},{width:1600,height:900},{width:800,height:800});assert.ok(Math.abs(point.x-.5)<1e-9);
 assert.ok(focusRegions(image(w,h,()=>[30,30,30]),w,h).length===1,'fallback detail region');
});

test('CG/sprite colour check flags a missing distinctive hair colour only',()=>{
 const sprite=image(40,80,(x,y)=>y<10?[236,120,170]:y<70?[245,210,195]:[0,0,0,0]);
 const signature=spriteSignature(sprite,40,80);assert.equal(signature.kind,'chromatic');
 const withPink=image(64,36,(x,y)=>x<10&&y<10?[236,120,170]:[60,90,140]);
 const withoutPink=image(64,36,(x,y)=>[60,90+(x%3),140]);
 assert.equal(signatureMatch(signature,withPink,64,36).verdict,'match');
 assert.equal(signatureMatch(signature,withoutPink,64,36).verdict,'mismatch');
 const black=spriteSignature(image(40,80,(x,y)=>y<10?[20,20,22]:[245,210,195]),40,80);
 assert.equal(signatureMatch(black,withoutPink,64,36).verdict,'unknown');
});

test('art rule joins the style note; grade strengths are bounded',()=>{
 assert.equal(composeArtStyle('',{}),'');
 assert.equal(artRuleText({palette:'auto'}),'');
 const style=composeArtStyle('수묵 느낌',{palette:'noir',line:'bold',shading:'cel'});
 assert.match(style,/crimson accent/u);assert.match(style,/수묵 느낌$/u);assert.ok(style.length<=600);
 assert.deepEqual(normalizeArtRule({palette:'x',line:'fine'}),{palette:'auto',line:'fine',shading:'auto'});
 assert.equal(gradeFor('warm','off').filter,'none');
 assert.match(gradeFor('cool','strong').filter,/hue-rotate\(8\.0deg\)/u);
 assert.equal(normalizeStagecraftPrefs({grade:'max',sfx:'synth',action:'off'}).grade,'subtle');
 assert.equal(normalizeStagecraftPrefs({sfx:'synth'}).sfx,'synth');
});

test('ducking returns smoothly to full volume',()=>{
 let t=0;const duck=createDuck({now:()=>t});
 assert.equal(duck.level(),1);duck.duck(.3,1000,500);assert.equal(duck.level(),.3);
 t=1250;assert.ok(Math.abs(duck.level()-.65)<1e-9);t=2000;assert.equal(duck.level(),1);
});

function fakeAudio(){
 const started=[];
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
 const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),detune:param(),Q:param(),pan:param(),playbackRate:param(),start(at){started.push(this);},stop(){},type:''});
 const context={state:'running',currentTime:1,sampleRate:8000,destination:{},resume:async()=>{},
  createGain:node,createOscillator:node,createBiquadFilter:node,createStereoPanner:node,createBufferSource:node,
  createBuffer:(c,n)=>({numberOfChannels:c,getChannelData:()=>new Float32Array(n)}),
  decodeAudioData:async bytes=>{if(bytes.byteLength===0)throw Error('bad');const data=new Float32Array(400).map((_,i)=>Math.sin(i/5)*.5);return {numberOfChannels:1,getChannelData:()=>data};}};
 return {context,started};
}
test('recorded foley decodes the manifest, plays samples, and falls back to synthesis',async()=>{
 const {context,started}=fakeAudio(),fallback=[];
 const files={'/vn-sfx/manifest.json':JSON.stringify({kinds:{impact:[{path:'hit.ogg'},{path:'../escape.ogg'}],door:[{path:'broken.ogg'}]}}),'/vn-sfx/hit.ogg':new Uint8Array([1,2]),'/vn-sfx/broken.ogg':new Uint8Array([])};
 const fetchImpl=async url=>{if(!(url in files))return new Response('',{status:404});const body=files[url];return typeof body==='string'?new Response(body):new Response(body);};
 const foley=createSampleFoley({createContext:()=>context,enabled:()=>true,fetchImpl,fallback:{play:kind=>{fallback.push(kind);return true;},resume(){},stop(){}}});
 foley.play('impact','x');assert.deepEqual(fallback,['impact'],'before decoding, synthesis plays');
 foley.resume();await new Promise(r=>setTimeout(r,20));
 assert.equal(foley.loaded,1,'undecodable and path-escaping files are ignored');
 assert.equal(foley.play('impact','x'),true);assert.equal(started.length,1);
 foley.play('door','y');foley.play('heavy','z');assert.deepEqual(fallback,['impact','door','impact']);
 const synthOnly=createSampleFoley({createContext:()=>context,enabled:()=>true,mode:()=>'synth',fetchImpl,fallback:{play:kind=>{fallback.push('s:'+kind);return true;},resume(){},stop(){}}});
 synthOnly.resume();synthOnly.play('impact','q');assert.equal(fallback.at(-1),'s:impact');
 assert.ok(normalizeGain({numberOfChannels:1,getChannelData:()=>new Float32Array(100).fill(.5)})>0);
 assert.equal(normalizeGain({numberOfChannels:1,getChannelData:()=>new Float32Array(100)}),0);
});

test('stingers and motifs need music on and duck the score',()=>{
 const {context,started}=fakeAudio();let music=false;const duck=createDuck({now:()=>0});
 const sound=createStageSound({createContext:()=>context,musicEnabled:()=>music,sfxEnabled:()=>true,duck});
 assert.equal(sound.stinger('shock'),false);music=true;
 assert.equal(sound.stinger('shock'),true);assert.ok(started.length>3);assert.ok(duck.level()<1);
 assert.equal(sound.stinger('unknown'),false);
 assert.equal(sound.motif('arcueid','w'),true);assert.equal(sound.whoosh(),true);
});

test('stage runtime: grade wrapper, centre line, reduced motion and settings',async()=>{
 const dom=new JSDOM('<div id="vn-stage"><div class="vn-scene-visual"><div class="vn-backdrop"><div class="vn-background is-active has-image" style="background-image:url(&quot;x.png&quot;)"></div></div><div id="vn-characters"></div></div></div><div id="panel"></div>',{pretendToBeVisual:true});
 const {window}=dom;for(const name of ['document','getComputedStyle','requestAnimationFrame','Image'])globalThis[name]=window[name];
 globalThis.requestIdleCallback=()=>0;window.HTMLElement.prototype.animate=function(){return {cancel(){},set onfinish(f){}};};
 const {createStagecraft}=await import('../../public/cortex-vn-stagecraft-dom.mjs');
 const stage=window.document.getElementById('vn-stage'),visual=stage.querySelector('.vn-scene-visual');
 let prefs=normalizeStagecraftPrefs({}),reduced=false;const sounds=[];
 const craft=createStagecraft({stage,visual,reduced:()=>reduced,prefs:()=>prefs,palette:()=>'noir',sound:{stinger:k=>sounds.push(k),whoosh:()=>sounds.push('whoosh'),motif:()=>true,duck:{duck(){}}},storage:null});
 assert.equal(visual.parentElement.className,'vn-grade');
 assert.match(stage.style.getPropertyValue('--vn-grade-filter'),/^$|saturate/u);
 craft.update({pageKey:'a',scope:'w',enabled:true,composition:'stage',direction:{stagecraft:{...plain,layout:'center'}},kind:'narration',portraits:[]});
 assert.ok(stage.classList.contains('is-center-line'));
 assert.match(stage.style.getPropertyValue('--vn-grade-filter'),/saturate\(0\.610\)/u);
 craft.fire({kind:'stinger',stinger:'reveal'});assert.deepEqual(sounds,['reveal']);
 craft.fire({kind:'action',action:'speedlines'});assert.ok(sounds.includes('whoosh'));
 reduced=true;sounds.length=0;craft.fire({kind:'action',action:'speedlines'});assert.deepEqual(sounds,[],'reduced motion: no action layer');
 reduced=false;prefs={...prefs,action:'off'};craft.fire({kind:'action',action:'speedlines'});assert.deepEqual(sounds,[]);
 craft.update({pageKey:'b',scope:'w',enabled:true,composition:'stage',direction:{},kind:'dialogue',waiting:true,portraits:[{id:'a',url:'s.png'}]});
 assert.ok(stage.classList.contains('is-wait-masked'));assert.ok(stage.classList.contains('has-dof'));
 const panel=window.document.getElementById('panel');let saved=null;
 const controls=craft.mountSettings(panel,{save:value=>{saved=value;prefs=value;},rule:()=>({palette:'warm'})});
 assert.equal(panel.querySelector('#vn-art-palette').value,'warm');
 panel.querySelector('#vn-sc-grade').value='strong';panel.querySelector('#vn-sc-grade').dispatchEvent(new window.Event('change'));
 assert.equal(saved.grade,'strong');
 panel.querySelector('#vn-art-line').value='bold';assert.deepEqual(controls.artRule(),{palette:'warm',line:'bold',shading:'auto'});
 craft.update({pageKey:'c',enabled:false});assert.ok(!stage.classList.contains('is-center-line'));
});

test('recorded SFX ship with CC0 provenance and matching hashes',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/vn-sfx/manifest.json','utf8'));
 const rows=Object.values(manifest.kinds).flat();assert.ok(rows.length>=15);
 for(const row of rows){
  assert.equal(row.license,'CC0-1.0');assert.ok(row.author&&row.source);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('public/vn-sfx/'+row.path)).digest('hex'),row.sha256);
 }
 assert.match(fs.readFileSync('public/vn-sfx/CREDITS.md','utf8'),/CC0/u);
});

test('the built reader wires stagecraft through the adapter only',()=>{
 const vn=fs.readFileSync('public/vn-runtime/vn.js','utf8');
 for(const marker of ['stagecraft.update({pageKey','musicSync.select(','composeArtStyle(state.artStyle','stagecraft.marks(','pace: stagecraft.pace(','* stageDuck.level()','createSampleFoley({'])assert.ok(vn.includes(marker),marker);
 assert.ok(!fs.readFileSync('vendor/visual-novel/public/vn.js','utf8').includes('stagecraft'),'originals stay intact');
});
