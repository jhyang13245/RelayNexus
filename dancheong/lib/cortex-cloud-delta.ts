import {sharedOperations,type SharedOperation} from './multiplayer-update';

// Transport only. The engine's approved narrative, memory and media are preserved verbatim.
export function cloudDelta(before:Record<string,unknown>|null,after:Record<string,unknown>){
 if(!before)return null;
 const operations=sharedOperations(before,after);
 if(!operations||operations.some(op=>!op.path.length))return null;
 const text=JSON.stringify(operations);
 return text.length<512_000?operations:null;
}

export function applyCloudDelta(base:Record<string,unknown>,operations:SharedOperation[]):Record<string,unknown>{
 if(!Array.isArray(operations)||operations.length>512)throw Error('잘못된 변경분입니다.');
 let next:any=base;
 for(const op of operations){
  if(!op||!Array.isArray(op.path)||!op.path.length||op.path.length>48||!['set','delete','length'].includes(op.kind)||op.path.some(k=>!['string','number'].includes(typeof k)||['__proto__','constructor','prototype'].includes(String(k))))throw Error('잘못된 변경 경로입니다.');
  const change=(node:any,depth:number):any=>{
   if(!node||typeof node!=='object')throw Error('변경 기준이 다릅니다.');
   const key=op.path[depth],array=Array.isArray(node);
   if(array&&(!Number.isInteger(key)||Number(key)<0||Number(key)>node.length))throw Error('잘못된 배열 위치입니다.');
   const copy:any=array?node.slice():{...node};
   if(depth<op.path.length-1){if(!Object.hasOwn(node,key))throw Error('변경 기준이 다릅니다.');copy[key]=change(node[key],depth+1);}
   else if(op.kind==='set')copy[key]=op.value;
   else if(op.kind==='delete'){if(array)throw Error('잘못된 배열 삭제입니다.');delete copy[key];}
   else{if(!Array.isArray(node[key])||!Number.isInteger(op.value)||op.value<0||op.value>node[key].length)throw Error('잘못된 배열 길이입니다.');copy[key]=node[key].slice(0,op.value);}
   return copy;
  };next=change(next,0);
 }
 return next;
}
