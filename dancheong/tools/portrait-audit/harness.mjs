import {alphaBounds,portraitLandmarks,checkSpriteFrame,displaySprite,clearSpriteMemory,spriteMemoryStatus} from '/vn-runtime/vn-sprite.mjs';
import {savedCamera} from '/vn-runtime/vn-camera-store.mjs';
import {cleanSpriteEdges,transparentSprite} from '/vn-runtime/vn-chroma.mjs';
import {prepareMotionFrames} from '/vn-runtime/vn-motion.mjs';
const $=s=>document.querySelector(s),status=s=>$('#status').textContent=s;
const manifest=await fetch('/data/manifest.json').then(r=>r.json());
const annotations=await fetch('/data/annotations.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
const rows=manifest.rows.filter(r=>manifest.eligible.includes(r.key));
for(const r of rows){const o=document.createElement('option');o.value=r.key;o.textContent=r.title+' · '+r.person.name;$('#character').append(o);}
const cache=new Map();
async function image(url){const i=new Image();i.src=url;await i.decode();return i;}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
async function save(name,data){const r=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,data})});if(!r.ok)throw Error('Result save failed '+name);}
async function prepare(row,variant){
 const id=row.key+'/'+variant;if(cache.has(id))return cache.get(id);
 const generated=manifest.generation.generated.find(g=>g.key===row.key);if(variant!=='reference'&&!generated)return null;
 const src=await image(variant==='reference'?row.reference.url:generated.url),w=src.naturalWidth,h=src.naturalHeight;
 let c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true}),an=variant!=='reference'?annotations[row.key]:null;
 if(variant==='half'){c=canvas(Math.round(w/2),Math.round(h/2));ctx=c.getContext('2d');ctx.drawImage(src,0,0,c.width,c.height);if(an)an={...an,eyeX:an.eyeX/2,eyeY:an.eyeY/2,faceWidth:an.faceWidth/2};}
 else if(variant==='padded'){const dx=Math.round(w*.2),dy=Math.round(h*.15);c=canvas(w+dx*2,h+dy*2);ctx=c.getContext('2d');ctx.drawImage(src,dx,dy);if(an)an={...an,eyeX:an.eyeX+dx,eyeY:an.eyeY+dy};}
 else if(variant==='bust'){c=canvas(w,Math.round(h*.56));ctx=c.getContext('2d');ctx.drawImage(src,0,0);}
 else if(variant==='crown-cut'){const cut=Math.round(h*.075);c=canvas(w,h-cut);ctx=c.getContext('2d');ctx.drawImage(src,0,-cut);if(an)an={...an,eyeY:an.eyeY-cut};}
 else if(variant==='occluded'){ctx.drawImage(src,0,0);ctx.fillStyle='#303039';ctx.fillRect(w*.12,h*.06,w*.76,h*.65);}
 else{if(variant==='chroma'){ctx.fillStyle='#00ff00';ctx.fillRect(0,0,w,h);}ctx.drawImage(src,0,0);}
 let url=c.toDataURL('image/png');
 if(variant==='chroma')url=await transparentSprite(url,'green');else if(variant!=='reference')url=await cleanSpriteEdges(url,'green');
 const cleaned=await image(url);c=canvas(cleaned.naturalWidth,cleaned.naturalHeight);ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(cleaned,0,0);
 const pixels=ctx.getImageData(0,0,c.width,c.height).data,bounds=alphaBounds(pixels,c.width,c.height),face=portraitLandmarks(pixels,c.width,bounds);
 const base=!['reference','generated'].includes(variant)?await prepare(row,'generated'):null;
 const start=performance.now(),check=await checkSpriteFrame(url),temporary=await displaySprite(url,url,base?.url||''),camera=await savedCamera(url);
 const fallback=Boolean(base&&temporary===await displaySprite(base.url));
 let motionFallback=null;
 if(variant==='occluded'){
  const motion=await prepareMotionFrames(url,url,url,base.url),actual=await image(motion.base),expected=await image(base.display);
  motionFallback=!motion.blink&&!motion.talk&&!motion.both&&actual.naturalWidth===expected.naturalWidth&&actual.naturalHeight===expected.naturalHeight;
  if(!motionFallback)throw Error('Occluded animation bypassed standing portrait fallback');
 }
 // The audit holds snapshots longer than the game. Copy the actual rendered bytes
 // before its bounded display cache retires a blob URL; do not change the pixels.
 const display=temporary.startsWith('blob:')?await new Promise(async(resolve,reject)=>{try{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(await fetch(temporary).then(r=>r.blob()));}catch(e){reject(e);}}):temporary;
 const value={key:row.key,person:row.person,variant,url,display,bounds,face:camera?.landmarks||face,camera,check,annotation:an,source:{width:c.width,height:c.height},prepareMs:performance.now()-start,fallback,motionFallback};
 if(fallback)Object.assign(value,{bounds:base.bounds,face:base.face,camera:base.camera,annotation:base.annotation,source:base.source});
 cache.set(id,value);if(cache.size>12)cache.delete(cache.keys().next().value);return value;
}
async function frame(w,h){const wrap=document.createElement('div');wrap.className='wrap';const f=document.createElement('iframe');f.width=w;f.height=h;f.style.width=w+'px';f.style.height=h+'px';wrap.append(f);$('#views').append(wrap);await new Promise((ok,no)=>{f.onload=()=>ok();f.onerror=no;f.src='/frame.html';});if(!f.contentWindow.auditRender)throw Error('Stage module did not load');return f;}
async function show(){try{$('#views').replaceChildren();const row=rows.find(r=>r.key===$('#character').value),[w,h]=$('#viewport').value.split('x').map(Number),variant=$('#variant').value;
 const roster=manifest.rows.filter(r=>r.work===row.work).map(r=>r.person),peers=rows.filter(r=>r.work===row.work&&r.key!==row.key).slice(0,2);
 const baseline=$('#comparison').value,count=Number($('#group').value),a=await prepare(row,variant),ref=await prepare(row,baseline);if(!a)throw Error('No generated asset for this character');
 const companions=(await Promise.all(peers.map(p=>prepare(p,'generated')))).filter(Boolean);
 const left=await frame(w,h),before=await left.contentWindow.auditRender([ref,...(baseline==='reference'?[]:companions)].slice(0,count),roster,baseline+' · 비교 기준');
 const right=await frame(w,h),after=await right.contentWindow.auditRender([a,...companions].slice(0,count),roster,variant+' · 실제 배치');
 const prefix=`review-${row.key}--${baseline}-vs-${variant}--${w}x${h}--group-${count}`;
 await save(prefix+'--before.png',before.png);await save(prefix+'--after.png',after.png);await save(prefix+'.json',{before:before.metrics,after:after.metrics});
 status('비교 화면 저장 완료: 노란 선은 자동 추정 눈높이, 파란 선은 수동 측정입니다. 두 조건 모두 같은 displaySprite 경로를 거칩니다.');
 }catch(e){status(e.stack);}}
async function run(){
 $('#run').disabled=true;$('#review').disabled=true;const started=new Date().toISOString(),metrics=[],audits=[],errors=[];$('#views').replaceChildren();const views=[];
 try{for(const [w,h]of [[1440,900],[844,390],[390,844]])views.push(await frame(w,h));
 for(let n=0;n<rows.length;n++){
  const row=rows[n],roster=manifest.rows.filter(r=>r.work===row.work).map(r=>r.person),peers=rows.filter(r=>r.work===row.work&&r.key!==row.key).slice(0,2);
  status(`${n+1}/${rows.length} ${row.person.name} · 원본/생성/해상도/여백/크롭/크로마 검사 중`);
  const neighborAssets=(await Promise.all(peers.map(p=>prepare(p,'generated')))).filter(Boolean);
  for(const variant of ['reference','generated','half','padded','bust','crown-cut','chroma','occluded']){try{
   const a=await prepare(row,variant);if(!a){errors.push({key:row.key,variant,reason:'GENERATION_NOT_RUN'});continue;}
   audits.push({key:row.key,variant,bounds:a.bounds,face:a.face,frame:a.camera?.frame,method:a.camera?.method,check:a.check,prepareMs:a.prepareMs,source:a.source,annotation:!!a.annotation,fallback:a.fallback,motionFallback:a.motionFallback});
   for(const f of views)for(const count of [1,2,3]){
    const group=[a,...neighborAssets].slice(0,count),mode='group-'+group.length;
    const rendered=await f.contentWindow.auditRender(group,roster,row.person.name+' / '+variant+' / '+mode);
    for(const r of rendered.metrics)metrics.push({...r,caseKey:row.key,mode,isTarget:r.key===row.key});
    if((variant==='generated'&&count!==2)||(variant==='reference'&&count===1))await save(`${row.key}--${variant}--${f.width}x${f.height}--${mode}.png`,rendered.png);
   }
  }catch(e){errors.push({key:row.key,variant,reason:String(e?.stack||e?.message||e)});}}
  await save('checkpoint.json',{completedCharacters:n+1,metrics:metrics.length,errors});
 }
 const missing=manifest.rows.filter(r=>!r.reference).map(r=>({key:r.key,name:r.person.name,heightCm:r.heightCm,reason:'NO_EMBEDDED_REFERENCE'}));
 const kim=manifest.rows.find(r=>r.person.name==='김서연');
 const result={started,finished:new Date().toISOString(),version:'1.25.9-body-camera-local',userAgent:navigator.userAgent,viewports:[[1440,900],[844,390],[390,844]],requestedCharacters:50,uniqueCharacters:rows.length,generatedCharacters:manifest.generation.generated.length,missing,kimSeoYeon:{heightCm:kim.heightCm,heightSource:kim.heightSource,packageHeightCm:kim.packageHeightCm,imageValidation:'NOT_RUN_NO_REFERENCE'},metrics,audits,errors,memory:spriteMemoryStatus(),notes:['Actual CSS and runtime functions imported unchanged.','Virtual ground is inferred for mid-thigh sprites; no visible feet ground truth.','Source illustrations contain backgrounds: OPAQUE_SPRITE is expected and must not be called a calibrated pass.','Iframe dimensions simulate layout, not iPhone hardware or safe-area behavior.','Automatic measurements are not a visual-quality pass.','No API keys, game saves or production storage accessed.']};
 await save('measurements.json',result);$('#summary').textContent=`고유 인물 ${rows.length}명 · 입상 ${manifest.generation.generated.length}명 · 측정행 ${metrics.length} · 실행 오류 ${errors.length}`;status('측정 완료. 결과 파일 저장됨. 육안 검토와 실패 분석 필요.');
 }catch(e){status(e.stack);await save('run-error.json',{message:String(e.stack),metrics,audits,errors});}finally{$('#run').disabled=false;$('#review').disabled=false;}
}
$('#run').onclick=run;$('#review').onclick=show;status(`공개 참조 ${rows.length}명 / 생성 입상 ${manifest.generation.generated.length}명. 전체 측정 실행 버튼으로 시작합니다.`);
