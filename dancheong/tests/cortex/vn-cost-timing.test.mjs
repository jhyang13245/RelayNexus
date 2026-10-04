import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {usageReceipt,estimateCost} from '../../public/vn-runtime/vn-cost-core.mjs';

test('API timing ends at response consumption while slow local accounting still completes',async()=>{
  const source=fs.readFileSync('public/vn-runtime/vn-costs.mjs','utf8');
  const start=source.indexOf('  async function observe('),end=source.indexOf('  globalThis.fetch =',start);
  assert.ok(start>=0&&end>start);
  let release,received=0,saved=null,finished=false;
  const blocked=new Promise(resolve=>release=resolve);
  // Execute the shipped response observer with only its storage boundary held.
  const observe=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{
    usageReceipt,estimateCost,TextDecoder,performance,diagnostics:{record(){}},
    save:async row=>{saved=row;await blocked;},
  });
  const response=Response.json({model:'gpt-5.6-luna',usage:{input_tokens:100,output_tokens:20},output_text:'not retained'});
  const pending=observe(response,{id:'fixture',provider:'openai',category:'cast',model:'gpt-5.6-luna'},()=>received++).then(()=>finished=true);
  try {
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(received,1,'response timing must not wait for IndexedDB');
    assert.equal(finished,false,'accounting remains queued until the write completes');
    assert.equal(saved.state,'complete');assert.equal(saved.usage.output_tokens,20);
    assert.equal(saved.output_text,undefined,'only usage is retained');
    release();await pending;assert.equal(finished,true);
  } finally {release();}
});
