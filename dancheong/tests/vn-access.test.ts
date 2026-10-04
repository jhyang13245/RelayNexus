import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('VN accepts both exact authenticated namespaces; rejects stale, absent and cross-origin fences before paid work',async()=>{
 let account:any={id:'user-a',ownerKey:'account:user-a'};
 const exports:any={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/vn/access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Response,URL,require:()=>({getOptionalAccountContext:async()=>account})});
 const call=(identity:string,origin='https://test')=>exports.vnAccess(new Request('https://test/api/vn/go/responses',{method:'POST',headers:{'X-Cortex-Account':identity,Origin:origin}}));
 assert.equal(await call('user-a'),null);assert.equal(await call('account:user-a'),null);
 for(const [id,status,origin] of [['user-b',409,'https://test'],['account:user-b',409,'https://test'],['',409,'https://test'],['user-a',403,'https://other']] as const){
  const response=await call(id,origin);assert.equal(response.status,status);assert.equal(response.headers.get('X-VN-Provider-State'),'not-started');
 }
 account=null;assert.equal((await call('user-a')).status,401);
});
