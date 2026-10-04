// Transport-only changes. This never interprets, repairs or filters narrative state.
export type SharedOperation={path:(string|number)[];kind:'set'|'delete'|'length';value?:any};
export function sharedOperations(before:any,after:any):SharedOperation[]|null {
 const ops:SharedOperation[]=[];
 const visit=(a:any,b:any,path:(string|number)[])=>{
  if(ops.length>512||path.length>48)throw Error('update too large');
  if(a===b)return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   if(Array.isArray(b)){
    for(let i=0;i<b.length;i++)if(i<a.length)visit(a[i],b[i],[...path,i]);else ops.push({path:[...path,i],kind:'set',value:b[i]});
    if(b.length<a.length)ops.push({path,kind:'length',value:b.length});
   }else{
    for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
     if(['__proto__','prototype','constructor'].includes(key))throw Error('unsupported key');
     if(b[key]===undefined){if(a[key]!==undefined)ops.push({path:[...path,key],kind:'delete'});}
     else if(a[key]===undefined)ops.push({path:[...path,key],kind:'set',value:b[key]});else visit(a[key],b[key],[...path,key]);
    }
   }
  }else ops.push({path,kind:'set',value:b});
 };
 try{visit(before,after,[]);return ops.length<=512?ops:null}catch{return null}
}
