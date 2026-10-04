const status=document.querySelector('#status'),views=document.querySelector('#views');
const worker=new Worker('/probe-worker.mjs',{type:'module'});let id=0;
const requests=new Map();worker.onmessage=({data})=>{requests.get(data.id)?.(data);requests.delete(data.id);};
const measure=bitmap=>new Promise(resolve=>{const n=++id;requests.set(n,resolve);worker.postMessage({id:n,bitmap},[bitmap]);});
const save=async(name,data)=>fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,data})});
document.querySelector('#run').onclick=async()=>{
 const m=await fetch('/data/manifest.json').then(r=>r.json()),rows=[];
 for(const a of m.generation.generated){
  status.textContent=rows.length+'/'+m.generation.generated.length+' '+a.key;
  const i=new Image();i.src=a.url;await i.decode();const result=await measure(await createImageBitmap(i));rows.push({key:a.key,...result});
  const c=document.createElement('canvas');c.width=320;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='#344';ctx.fillRect(0,0,320,480);ctx.drawImage(i,0,0,320,480);ctx.font='12px sans-serif';ctx.fillStyle='white';ctx.fillText(a.key,3,14);
  for(const [n,p] of (result.camera?.body||[]).entries()){if(![0,2,5,11,12,23,24,25,26,27,28].includes(n))continue;ctx.fillStyle=(p.visibility||0)>.7?'lime':'red';ctx.beginPath();ctx.arc(p.x*320,p.y*480,3,0,7);ctx.fill();ctx.fillText(n+':'+(p.visibility||0).toFixed(2),p.x*320,p.y*480);}
  for(const n of [1,33,263,152]){const p=result.camera?.mesh?.[n];if(p){ctx.fillStyle='cyan';ctx.fillRect(p.x*320-2,p.y*480-2,4,4);}}
  views.append(c);await save('body-'+a.key+'.png',c.toDataURL());
 }
 await save('body-probe.json',rows);status.textContent='측정 완료 '+rows.length;
};
