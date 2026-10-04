import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, } from 'node:crypto';
import { createRequire } from 'node:module';
const sharp=createRequire(import.meta.url)('C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const original=path.resolve('outputs/portrait-audit-20261003'),root=path.resolve('outputs/portrait-fix-20261003');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const before=await read(path.join(original,'results/measurements.json')),after=await read(path.join(root,'results/measurements.json')),manifest=await read(path.join(original,'manifest.json'));
const targets=r=>r.metrics.filter(x=>x.isTarget&&x.mode==='group-1'&&x.viewport[0]===1440);
const old=targets(before),rows=targets(after),base=rows.filter(x=>x.variant==='generated');
const name=key=>manifest.rows.find(x=>x.key===key)?.person.name||key;
const invariance=rows.filter(x=>!['generated','reference'].includes(x.variant)).map(x=>{
  const a=base.find(a=>a.key===x.key),o=old.find(a=>a.key===x.key&&a.variant===x.variant),ob=old.find(a=>a.key===x.key&&a.variant==='generated'),f=x.variant==='half'?.5:1;
  return {key:x.key,name:name(x.key),variant:x.variant,previousPct:(o.screenPixelScale*f/ob.screenPixelScale-1)*100,currentPct:(x.screenPixelScale*f/a.screenPixelScale-1)*100,status:x.frameStatus,method:x.calibrationMethod};
});
const body=base.map(x=>({key:x.key,name:name(x.key),heightCm:x.heightCm,method:x.calibrationMethod,status:x.frameStatus,
  shoulderWidthPx:x.body?.shoulderWidthPx,hipWidthPx:x.body?.hipWidthPx,torsoLengthPx:x.body?.torsoLengthPx,hipsY:x.body?.joints?.hips?.y,
  hipAnchorErrorPx:x.body?.joints?.hips?x.body.joints.hips.y-(x.slotBottom-x.slotHeight+.84*x.slotHeight):null,
  manualFaceWidthPx:x.manual?.faceWidthPx,headClipped:x.headClipped}));
const counts=(list,key)=>Object.fromEntries([...new Set(list.map(x=>x[key]))].map(v=>[v,list.filter(x=>x[key]===v).length]));
const summary={generated:base.length,metrics:after.metrics.length,errors:after.errors,viewports:after.viewports,methods:counts(base,'calibrationMethod'),checks:counts(base,'frameStatus'),
  scaleVariants:Object.fromEntries(['half','padded','bust','crown-cut','chroma'].map(v=>{const a=invariance.filter(x=>x.variant===v);return[v,{previousOver10:a.filter(x=>Math.abs(x.previousPct)>10).length,currentOver10:a.filter(x=>Math.abs(x.currentPct)>10).length,maxAbsPct:Math.max(...a.map(x=>Math.abs(x.currentPct)))}]})),
  generatedHeadClips:base.filter(x=>x.headClipped).length,
  missingReferenceSamples:15,kimSeoYeon:{heightCm:164,visualTest:'not run; no embedded reference'},
  testedVersion:(await read('public/vn-runtime/manifest.json')).version,
  notes:['±10% is an audit alarm, not a visual quality approval.','Pose landmarks are estimates; actual shoulder/hip anatomy is not ground truth.','Damaged source cases are retained, including unresolved errors.','No image generation, paid API, game saves or production deployment in this correction.']};
await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2));
await fs.writeFile(path.join(root,'body-measurements.json'),JSON.stringify(body,null,2));
await fs.writeFile(path.join(root,'invariance.json'),JSON.stringify(invariance,null,2));
const csv=(list,keys)=>'\uFEFF'+[keys.join(','),...list.map(row=>keys.map(k=>JSON.stringify(row[k]??'')).join(','))].join('\n');
await fs.writeFile(path.join(root,'body-measurements.csv'),csv(body,Object.keys(body[0])));
await fs.writeFile(path.join(root,'invariance.csv'),csv(invariance,Object.keys(invariance[0])));
const selected=manifest.rows.filter(x=>manifest.eligible.includes(x.key));
const esc=s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
for(let start=0;start<selected.length;start+=12){
 const batch=selected.slice(start,start+12),ops=[];
 for(let i=0;i<batch.length;i++){
  const a=batch[i],left=i%3*480,top=Math.floor(i/3)*330;
  ops.push({input:await sharp(path.join(root,`results/${a.key}--generated--1440x900--group-1.png`)).resize(480,300).toBuffer(),left,top});
  ops.push({input:Buffer.from(`<svg width="480" height="30"><rect width="480" height="30" fill="#f2f5f7"/><text x="8" y="21" font-size="16">${esc(a.person.name)} / ${a.heightCm}cm</text></svg>`),left,top:top+300});
 }
 await sharp({create:{width:1440,height:Math.ceil(batch.length/3)*330,channels:3,background:'#17293a'}}).composite(ops).png().toFile(path.join(root,`contact-${start/12+1}.png`));
}
const table=(cols,list)=>'<div class="scroll"><table><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr>'+list.map(r=>'<tr>'+r.map(c=>'<td>'+esc(typeof c==='number'?c.toFixed(2):c)+'</td>').join('')+'</tr>').join('')+'</table></div>';
const pair=(key,v='1440x900',n=3)=>`<div class="pair"><figure><img src="../portrait-audit-20261003/results/${key}--generated--${v}--group-${n}.png"><figcaption>수정 전</figcaption></figure><figure><img src="results/${key}--generated--${v}--group-${n}.png"><figcaption>전신 좌표 보정 후</figcaption></figure></div>`;
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>단청 전신 입상 보정 검증</title><style>body{max-width:1200px;margin:auto;padding:20px;background:#101a26;color:#edf2f6;font:16px/1.7 system-ui}h1{font-size:28px}a{color:#9df}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;height:auto}table{border-collapse:collapse}td,th{padding:9px;border:1px solid #456;white-space:nowrap}.scroll{overflow:auto}small{color:#abb}@media(max-width:650px){.pair{grid-template-columns:1fr}body{padding:14px}}</style>
<h1>단청 전신 입상 보정 검증</h1><p>얼굴 색상만으로 확대율을 고정하던 경로를 바꾸고, 얼굴·어깨·몸통·골반을 함께 측정합니다. 그림 전체를 같은 배율로 배치하고, 설정 키와 공통 바닥 규칙을 유지합니다. 특정 작품이나 인물 이름에 따른 보정은 없습니다.</p>
<p>35명·7가지 입력 조건·3개 화면 크기·단독/2인/3인 배치, ${after.metrics.length} 측정행, 실행 오류 ${after.errors.length}건. <strong>기하 검사 통과와 그림의 시각적 품질 승인은 다릅니다.</strong> 실제 기준 그림이 없는 김서연은 164cm 수치 검사만 실행했습니다. 요청된 50명 중 15명분은 미실행입니다.</p>
<h2>김다윤과 백서현</h2><p>같은 162cm인 두 인물의 몸통 길이·골반 위치를 함께 비교합니다. 가운데 박은서는 178cm입니다. 분홍색 선은 추정 어깨–골반 중심선입니다.</p>${pair('chronos-core__NPC_KIM_DAYUN')}
<h2>히시리와 홍재</h2><p>왼쪽 히시리 168cm, 가운데 한시우 178cm, 오른쪽 홍재 163cm. 키와 원본 자세·체형 차이는 유지합니다.</p>${pair('fate-seoul__NPC_MASTER_ADASHINO_HISHIRI')}
<h2>신체 측정 결과</h2>${table(['인물','키','방식','몸통 px','골반 y','골반 기준 오차 px','상태'],body.map(x=>[x.name,x.heightCm,x.method,x.torsoLengthPx,x.hipsY,x.hipAnchorErrorPx,x.status]))}
<h2>남은 크롭 및 검출 편차</h2><p>아래는 동일 그림의 변형에서 확대율이 ±10% 이상 달라진 실제 사례입니다. 훼손된 원본을 강제로 정상으로 처리하지 않았습니다. 원본 크롭, 관절 가림, 검출 실패에 대한 자동 보정은 여전히 한계가 있습니다.</p>${table(['인물','변형','전 편차 %','후 편차 %','현재 상태'],invariance.filter(x=>Math.abs(x.currentPct)>10).map(x=>[x.name,x.variant,x.previousPct,x.currentPct,x.status]))}
<h2>자료와 범위</h2><p><a href="body-measurements.csv">전신 측정 CSV</a> · <a href="invariance.csv">변형 편차 CSV</a> · <a href="summary.json">요약 JSON</a> · <a href="results/measurements.json">브라우저 원시 측정</a></p><p>그림을 새로 생성하거나 운영 배포하지 않았습니다. 기존 생성 이미지 35장을 사용했고, 사용자 키·게임 기록·원본 그림을 삭제하지 않았습니다. 1440×900 / 844×390 / 390×844는 브라우저 레이아웃 검사이며 실제 iPhone 성능 검사와 다릅니다.</p><p>관절 검출: <a href="https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker">Google MediaPipe</a>, 동일 사이트에 둔 고정 모델을 기기에서 실행. 유료 API·외부 추론 요청은 없습니다.</p><p>전체 연락판: <a href="contact-1.png">1</a> · <a href="contact-2.png">2</a> · <a href="contact-3.png">3</a></p></html>`;
await fs.writeFile(path.join(root,'report.html'),html);
const provenance={created:new Date().toISOString(),runtime:await read('public/vn-runtime/manifest.json'),sources:{}};
for(const file of ['public/cortex-vn-camera.mjs','scripts/port-visual-novel.mjs',...['sprite','motion-landmarks','motion-worker','raster-worker'].map(n=>'vendor/visual-novel/nexus-'+n+'.mjs')])provenance.sources[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile(path.join(root,'provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify(summary,null,2));
