import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {drawingRegistration} from '../../public/cortex-vn-registration.mjs';
const sharp=createRequire(import.meta.url)('C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const folder='outputs/portrait-audit-20261003/generated';
async function thumbnail(input){const source=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});const sw=source.info.width,sh=source.info.height,ratio=Math.min(1,256/Math.max(sw,sh));
 const {data,info}=await sharp(input).ensureAlpha().resize(Math.round(sw*ratio),Math.round(sh*ratio),{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
 let l=info.width,r=-1,t=info.height,b=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>24){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 return {...info,data,sourceWidth:sw,sourceHeight:sh,bounds:{left:l,right:r,top:t,bottom:b,width:r-l+1,height:b-t+1}};
}
const rows=[];for(const name of (await fs.readdir(folder)).filter(n=>n.endsWith('.png'))){const file=path.join(folder,name),meta=await sharp(file).metadata(),base=await thumbnail(file);rows.push({name,base});
 for(const variant of ['half','padded','bust','crown-cut']){
  let s=sharp(file);if(variant==='half')s=s.resize(Math.round(meta.width/2),Math.round(meta.height/2));
  if(variant==='padded')s=s.extend({left:Math.round(meta.width*.2),right:Math.round(meta.width*.2),top:Math.round(meta.height*.15),bottom:Math.round(meta.height*.15),background:'#0000'});
  if(variant==='bust')s=s.extract({left:0,top:0,width:meta.width,height:Math.round(meta.height*.56)});
  if(variant==='crown-cut')s=s.extract({left:0,top:Math.round(meta.height*.075),width:meta.width,height:meta.height-Math.round(meta.height*.075)});
  let debug;const found=drawingRegistration(await thumbnail(await s.png().toBuffer()),base,v=>debug=v);
  if(!found)console.log('MISS',name,variant,debug);else if(Math.abs(found.scale-(variant==='half'?.5:1))>.015)console.log('SCALE',name,variant,found.scale);
 }
}
let falseMatches=0;for(const a of rows)for(const b of rows)if(a!==b&&drawingRegistration(a.base,b.base)){falseMatches++;console.log('WRONG',a.name,b.name);}
console.log(JSON.stringify({characters:rows.length,falseMatches}));
