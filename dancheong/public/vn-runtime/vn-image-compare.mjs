import { expressionPrompt, imageProviders } from './vn-assets.mjs?v=88af24489d44';
import { loadDeviceKeys } from './vn-key-vault.mjs?v=88af24489d44';
import { matteForReferences, transparentSprite } from './vn-chroma.mjs?v=88af24489d44';
import { displaySprite } from './vn-sprite.mjs?v=88af24489d44';
import { estimateCost } from './vn-cost-core.mjs?v=88af24489d44';
import { installCostMeter } from './vn-costs.mjs?v=88af24489d44';

const $ = id => document.getElementById(id);
const emotion = $('emotion'), button = $('generate'), selection = $('provider-selection');
let keys = {}, reference = '', referenceSha256 = '', started = false, currentReport;
const scope = 'image-compare-nadia';
const meter = installCostMeter({ context: () => ({ slug: scope, title: '나디아 · 이미지 모델 비교' }), onChange: () => { void meter.render($('costs'), scope); } });
function prompt() {
  return expressionPrompt({ person: { name: '나디아' }, context: { previous: '', preceding: '', current: emotion.value.trim().slice(0, 4400) } });
}
function selectedProviders() { return selection.value === 'both' ? ['openai','gemini'] : [selection.value]; }
function refresh() { $('prompt').textContent = prompt(); button.disabled = started || !reference || selectedProviders().some(provider=>!keys[provider]) || !emotion.value.trim(); }
function link(parent, text, url, file) { const a=document.createElement('a'); a.textContent=text; a.href=url; a.download=file; parent.append(a); return a; }
function dataDownload(value) { return URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})); }
async function dimensions(url) { const img=new Image();img.src=url;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight}; }
async function dbRecord(record) {
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('dancheong-image-compare-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('runs',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  try { return await new Promise((resolve,reject)=>{const tx=db.transaction('runs',record?'readwrite':'readonly');const q=record?tx.objectStore('runs').put(record):tx.objectStore('runs').getAll();tx.oncomplete=()=>resolve(record||q.result);tx.onerror=tx.onabort=()=>reject(tx.error);}); } finally { db.close(); }
}
function receiptView(row) { const {rawImage,displayImage,...safe}=row; return safe; }
function renderRow(row) {
  let el=document.getElementById(`result-${row.provider}`);
  if(!el){el=document.createElement('article');el.id=`result-${row.provider}`;el.className='result';$('results').append(el);}
  el.replaceChildren();const h=document.createElement('h2');h.textContent=row.provider==='openai'?'GPT Image 2.5 Flare':'Nano Banana 2';el.append(h);
  const state=document.createElement('p');state.className='summary';state.textContent=row.state==='pending'?'생성 중…':`${row.state==='complete'?'완료':row.error||'실패'} · ${row.requestSeconds?.toFixed(3)??'—'}초 · ${typeof row.cost?.usd==='number'?`$${row.cost.usd.toFixed(8)}${row.cost.kind==='upper-bound'?' 이하':''}`:'금액 미확인'}`;el.append(state);
  if(row.displayImage){const stage=document.createElement('div');stage.className='art';const img=document.createElement('img');img.src=row.displayImage;img.alt=`나디아 전투 표정 · ${row.provider}`;stage.append(img);el.append(stage);const links=document.createElement('div');links.className='links';link(links,'표시용 PNG 다운로드',row.displayImage,`nadia-battle-${row.provider}.png`);link(links,'API 원본 다운로드',row.rawImage,`nadia-battle-${row.provider}-raw.${row.rawImage.startsWith('data:image/jpeg')?'jpg':'png'}`);el.append(links);}
  const receipt=document.createElement('pre');receipt.className='receipt';receipt.textContent=JSON.stringify(receiptView(row),null,2);el.append(receipt);
}
function renderReport() {
  if(!currentReport)return;
  const safe={...currentReport,results:currentReport.results.map(receiptView)};
  const ready=safe.results.filter(r=>r.state!=='pending');
  safe.totalUsd=ready.every(r=>typeof r.cost?.usd==='number')?ready.reduce((n,r)=>n+r.cost.usd,0):null;
  safe.pricing={date:'2026-09-25',openai:'https://developers.openai.com/api/docs/models/gpt-image-2.5-flare',gemini:'https://ai.google.dev/gemini-api/docs/pricing',billing:'API token based USD estimate, excluding tax and currency conversion; not invoice'};
  const a=$('download-receipt');if(a.href.startsWith('blob:'))URL.revokeObjectURL(a.href);a.href=dataDownload(safe);a.download=`nadia-battle-comparison-${currentReport.id}.json`;a.hidden=false;
}
$('file').addEventListener('change',async()=>{
  if(started)return;const file=$('file').files[0];reference='';referenceSha256='';refresh();
  if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){$('status').textContent='8MB 이하 PNG/JPEG/WebP를 선택하세요.';return;}
  const bytes=await file.arrayBuffer();referenceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  reference=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  $('reference').src=reference;$('reference').hidden=false;const dim=await dimensions(reference);$('reference-info').textContent=`${file.name} · ${dim.width}×${dim.height} · SHA-256 ${referenceSha256}`;refresh();
});
emotion.addEventListener('input',refresh);
selection.addEventListener('change',refresh);
button.addEventListener('click',async()=>{
  if(started||button.disabled)return;const providers=selectedProviders();started=true;refresh();$('file').disabled=true;emotion.disabled=true;selection.disabled=true;
  const commonPrompt=prompt();$('results').replaceChildren();currentReport={id:crypto.randomUUID(),startedAt:new Date().toISOString(),referenceSha256,prompt:commonPrompt,quality:'low',purpose:'expression',callsPlanned:providers.length,retries:0,results:[]};
  $('status').textContent='같은 참조와 공통 프롬프트로 모델별 1회 호출합니다. 자동 재시도 없음.';
  await Promise.allSettled(providers.map(async provider=>{
    const config=imageProviders[provider];const row={provider,requestedModel:config.model,model:config.model,state:'pending',usage:null,cost:{usd:null,kind:'unknown'}};currentReport.results.push(row);renderRow(row);
    let t;
    try {
      const body={model:config.model,purpose:'expression',aspect:'portrait',quality:'low',prompt:commonPrompt,referenceImages:[reference],...(provider==='openai'?{strictModel:true}:{matteColor:await matteForReferences([reference])})};
      row.requestProfile=provider==='openai'?{size:'768x1024',quality:'low',background:'transparent',format:'png',strictModel:true}:{imageSize:'1K',aspect:'3:4',thinking:'MINIMAL',matteColor:body.matteColor};
      t=performance.now();const response=await fetch(config.endpoint,{method:'POST',signal:AbortSignal.timeout(180000),headers:{Authorization:`Bearer ${keys[provider]}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();row.requestSeconds=(performance.now()-t)/1000;row.httpStatus=response.status;row.model=result.model||config.model;row.usage=result.usage||null;row.cost=estimateCost({provider,model:row.model,usage:row.usage});
      if(!response.ok)throw new Error(response.status===401?'저장된 API 키 인증 실패 (401) · 이 브라우저의 단청 설정에서 키를 확인하세요.':'API 요청 실패. 비용 기록과 설정을 확인하세요.');
      if(row.model!==row.requestedModel)throw new Error('요청한 모델과 다른 응답입니다. 유효한 모델 비교에서 제외합니다.');
      if(!/^data:image\/(png|jpeg|webp);base64,/.test(result.imageUrl||''))throw new Error('이미지가 반환되지 않았습니다.');
      row.rawImage=result.imageUrl;row.rawDimensions=await dimensions(result.imageUrl);
      const sprite=provider==='gemini'?await transparentSprite(result.imageUrl,body.matteColor):result.imageUrl;
      row.displayImage=await displaySprite(sprite);row.displayDimensions=await dimensions(row.displayImage);row.totalSeconds=(performance.now()-t)/1000;row.state='complete';
    }catch(error){row.state='error';row.error=error.name==='TimeoutError'?'시간 초과 · 자동 재시도하지 않음':String(error.message||'요청 실패');if(t&&!row.requestSeconds)row.requestSeconds=(performance.now()-t)/1000;}
    renderRow(row);renderReport();try{await dbRecord(structuredClone(currentReport));}catch{$('status').textContent='이미지와 사용량은 표시됐지만 비교 기록 저장에 실패했습니다. 다운로드하세요.';}
  }));
  renderReport();$('status').textContent=`생성 완료 · 성공 ${currentReport.results.filter(r=>r.state==='complete').length}/${providers.length} · 자동 재시도 0회. 사용량은 단청 비용 탭에도 기록됩니다.`;
  try{await dbRecord(structuredClone(currentReport));}catch{$('status').textContent+=' 비교 결과 저장 실패 · 다운로드하세요.';}
  await meter.render($('costs'),scope);
});
try{keys=await loadDeviceKeys();$('keys').textContent=`이 브라우저의 저장된 키: OpenAI ${keys.openai?'준비됨':'없음'} / Gemini ${keys.gemini?'준비됨':'없음'}`;}catch{$('keys').textContent='키 저장소를 열지 못했습니다. 단청 설정을 확인하세요.';}
try{const runs=await dbRecord();const last=runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];if(last){currentReport=last;last.results.forEach(renderRow);renderReport();$('status').textContent='마지막 비교 결과를 복원했습니다. 자동 생성하지 않았습니다.';}}catch{/* optional previous report */}
refresh();void meter.render($('costs'),scope);
