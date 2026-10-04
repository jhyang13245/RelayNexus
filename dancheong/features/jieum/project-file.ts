import type {Project} from './studio-model';
import {buildProjectSnapshot} from './studio-export';
const encode=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob)});
export async function saveProjectFile(project:Project):Promise<boolean>{
 const picker=(window as unknown as {showSaveFilePicker?:(options:unknown)=>Promise<{createWritable:()=>Promise<{write:(s:string)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}>}>}).showSaveFilePicker;
 const filename=`${project.title.replace(/[<>:"/\\|?*]/g,'_')||'지음'}_작업.json`;
 // Invoke the native picker before awaiting image conversion to preserve user activation.
 let handle:Awaited<ReturnType<NonNullable<typeof picker>>>|undefined;
 try{if(picker)handle=await picker({suggestedName:filename,types:[{description:'지음 작업 JSON',accept:{'application/json':['.json']}}]});}catch(e){if((e as Error).name==='AbortError')return false;throw e;}
 const image=async<T extends {sourceBlob?:Blob;dataUrl:string}>(i:T)=>{const {sourceBlob,...rest}=i;return {...rest,dataUrl:sourceBlob?await encode(sourceBlob):i.dataUrl} as T};
 const character=async(c:Project['player'])=>({...c,images:await Promise.all(c.images.map(image))});
 const copy={...project,player:await character(project.player),npcs:await Promise.all(project.npcs.map(character)),imageTriggers:await Promise.all(project.imageTriggers.map(async t=>({...t,attachedImages:await Promise.all(t.attachedImages.map(image))})))};
 const text=JSON.stringify(buildProjectSnapshot(copy),null,2);
 if(handle){const writable=await handle.createWritable();try{await writable.write(text);await writable.close();}catch(e){await writable.abort().catch(()=>{});throw e;}return true;}
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 // Browsers without a picker cannot confirm that a download reached disk.
 return confirm('JSON 다운로드를 요청했습니다. 파일이 저장된 것을 확인했다면 계속하세요.');
}
