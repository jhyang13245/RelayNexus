import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {HeadlessCortex,makeModel} from './harness.mjs';

test('durable cloud content identity survives export-only save, display changes and reload but changes with HUD',async()=>{
 const scenario=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
 const app=await new HeadlessCortex({standalonePath:'vendor/cortex/Cortex_v1.42.0.html',initialScenario:scenario,model:makeModel()}).open();
 try{
  const source=fs.readFileSync('public/cortex-host.js','utf8'),start=source.indexOf(' const localContent='),end=source.indexOf(' const emitReady=',start),ctx={api:app.api,crypto:webcrypto,TextEncoder};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';globalThis.key=localContent;',ctx);
  await app.api.persist({notifyHost:false});const first=await ctx.key();assert.match(first.contentKey,/^v1:[a-f0-9]{64}$/);
  await app.settle(20);app.api._setSettings({fontSize:'large',typingSpeed:'instant',model:'other-provider',baseUrl:'https://example.test',apiKey:'not-stored'});
  await app.api.persist({notifyHost:false});const second=await ctx.key();assert.notEqual(first.savedAt,second.savedAt);assert.equal(first.contentKey,second.contentKey);
  await app.api.restore();assert.equal((await ctx.key()).contentKey,first.contentKey,'read the durable record, not normalized runtime metadata');
  app.scenario.world.location='새로운 장소';await app.api.persist({notifyHost:false});assert.notEqual((await ctx.key()).contentKey,first.contentKey);
 }finally{app.close()}
});
