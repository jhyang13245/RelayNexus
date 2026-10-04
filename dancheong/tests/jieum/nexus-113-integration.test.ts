import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { makeProjectForPackageTarget, blankStoryEvent, normalizeProject, type Project } from '../../features/jieum/studio-model';
import { exportScenarioPack, extractStudioProjectFromPackage, aiGeneratorPromptFor } from '../../features/jieum/studio-export';
import { CORTEX_ENGINE_PROVENANCE, cortexCompatibility } from '../../features/jieum/cortex-engine-contract';
import { validateInstantStory } from '../../features/jieum/instant-story-contract';
import { eventDesign } from '../../features/jieum/cortex-event-design';
import { HeadlessCortex, makeModel } from './fixtures/nexus-1.13.0/harness.mjs';

const html = fs.readFileSync(new URL('../../vendor/cortex/Cortex_v1.42.0.html',import.meta.url));
const enginePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-nexus113-')), 'engine.html');
fs.writeFileSync(enginePath, html);
after(() => { fs.unlinkSync(enginePath); fs.rmdirSync(path.dirname(enginePath)); });
function contract() {
  const context = vm.createContext({ console, TextEncoder, TextDecoder, URL, crypto, structuredClone, setTimeout, clearTimeout, performance, AbortController });
  const scripts = [...html.toString().matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for (const index of [0, 1, 3]) vm.runInContext(scripts[index][1], context);
  return context;
}
function instant(): Project {
  const p = makeProjectForPackageTarget('cortex', 'instant_story', false);
  p.title = '공방의 편지'; p.player.id = 'PC'; p.player.name = '윤서'; p.startLocation = '공방';
  p.opening.openingTime = '09:30:00'; p.opening.openingLocation = '공방';
  p.style.customRules = '한지의 촉감을 구체적으로 묘사한다.';
  p.instantStory.corePrompt = '윤서의 행동에서 시작하여 공방의 일상을 자유롭게 이어 쓴다.';
  p.instantStory.startProfiles = ['A','B'].map(id => ({ id, name: id, prologue: `${id} 편지가 도착했다.`, startSituation: `${id} 편지를 확인한다.`, recommendedReplies: ['편지를 살핀다', '공방 주인에게 묻는다', '봉인을 뜯고 편지를 읽는다'] }));
  p.instantStory.exampleScenes = ['FIRST','SECOND'].map(id => ({ id, userInput: '책장을 넘긴다.', narration: id + ' 한지가 바스락거렸다.', recommendations: [] }));
  p.instantStory.keywordNotes = Array.from({ length: 5 }, (_, i) => ({ id: `NOTE_${i}`, title: '편지', keywords: ['편지'], priority: i, content: `공방 노트 ${i}` }));
  p.instantStory.statRules = [{ id: 'TRUST', label: '신뢰', minimum: 0, maximum: 10, initial: 2, unit: '', increaseWhen: '편지를 확인할 때', decreaseWhen: '', tiers: [{ id: 'HIGH', minimum: 4, maximum: 10, prompt: '서로 믿고 대화한다.' }] }];
  p.instantStory.endingPolicy = { minimumTurn: 2, checkInterval: 1 };
  return p;
}
async function pack(p: Project) {
  const output = await exportScenarioPack(p, false), zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const files: Record<string, any> = {};
  for (const [name, file] of Object.entries(zip.files)) if (name.endsWith('.json') && !name.startsWith('studio/')) files[name] = JSON.parse(await file.async('string'));
  return { output, zip, files };
}
test('Nexus engine assembly and extensions match the official published source', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../vendor/cortex/manifest.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(html).digest('hex'), CORTEX_ENGINE_PROVENANCE.engineSha256);
  assert.equal(manifest.sha256, CORTEX_ENGINE_PROVENANCE.engineSha256);
  const c = contract(); assert.equal(c.CortexInstant.revision, '2.0.0'); assert.equal(c.CortexOccurrence.revision, '1.1.0');
});
test('Studio Instant ZIP passes source authentication and retains dedicated settings without canon instructions', async () => {
  const p = instant(), { output, files } = await pack(p), c = contract();
  await c.CortexInstant.verifySource(files);
  const session = c.CortexNexusBridge.adaptPackage(files), sc = c.CortexNexusBridge.toCortexScenario(session);
  assert.deepEqual(Object.keys(session.eventGraph.nodes), []);
  assert.equal(sc.runtime.instantStory.corePrompt, p.instantStory.corePrompt);
  assert.equal(sc.runtime.instantStory.generation.ordinaryTurnMaxOutputTokens, 2400);
  assert.equal(sc.world.time, '09:30:00');
  assert.equal(files['rules/style.json'].cortexAuthoringGuidance, undefined);
  assert.equal(files['project.json'].style.cortexAuthoringGuidance, undefined);
  assert.equal(files['rules/style.json'].customRules, p.style.customRules);
  assert.equal(files['manifest.json'].integrationTarget.minimumExtensionRevision, '1.0.0');
  assert.equal(files['rules/instant_story_runtime.json'].streamContract.requestDiscriminator.cortexInstant, true);
  assert.equal(files['rules/instant_story_runtime.json'].researchPolicy.automaticBackgroundResearch, false);
  assert.equal(cortexCompatibility(p).status, 'CONTRACT_VERIFIED');
  assert.doesNotMatch(aiGeneratorPromptFor(p), /아직 소비하지|closureConditions|기본 3비트/);
  const restored = normalizeProject((await extractStudioProjectFromPackage(output.blob)).project);
  assert.deepEqual(restored.instantStory, p.instantStory);
});
test('new runtime rebuilds stale caches, rejects altered originals and consumes bounded keywords, stats and ending schedules', async () => {
  const { files } = await pack(instant()), c = contract(), r = c.CortexInstant;
  const sc = c.CortexNexusBridge.toCortexScenario(c.CortexNexusBridge.adaptPackage(files));
  const cast = [sc.protagonist, ...sc.characters];
  assert.equal(r.context(sc, [], '창문을 본다.', cast).activeKeywordNotes.length, 0);
  const ctx = r.context(sc, [], '편지를 확인한다.', cast);
  assert.equal(ctx.activeKeywordNotes.length, 3); assert.equal(ctx.activeKeywordNotes[0].id, 'NOTE_4');
  assert.equal(ctx.exampleScenes.length, 2); assert.deepEqual(Array.from(ctx.exampleScenes, (scene: { id: string }) => scene.id), ['FIRST', 'SECOND']);
  assert.equal(ctx.endingDue, false);
  const result = { narration: '윤서는 편지를 확인했다.', statChanges: [{ id: 'TRUST', delta: 100, evidence: '편지를 확인했다.' }], relationshipChanges: [], ending: { ended: false, evidence: '' }, presentCharacterIds: ['PC'] };
  sc.runtime.instantState = r.apply(sc, ctx, result, 'ONE'); assert.equal(sc.runtime.instantState.stats.TRUST, 10);
  assert.equal(r.apply(sc, ctx, result, 'ONE').stats.TRUST, 10);
  assert.equal(r.context(sc, [], '계속', cast).endingDue, true);
  assert.equal(r.context(sc, [], '계속', cast).stats[0].activeTiers[0].id, 'HIGH');
  files['runtime/keyword_index.json'].sourcePackageSha256 = '0'.repeat(64);
  assert.equal(r.fromFiles(files).cacheStatus.keyword_index, 'REBUILT_FROM_PROJECT');
  files['project.json'].instantStory.corePrompt = '변조';
  await assert.rejects(r.verifySource(files), /SOURCE_HASH_MISMATCH/);
  assert.throws(() => r.fromFiles(files), /RUNTIME_SOURCE_MISMATCH/);
});
test('authored Instant prologue retains line breaks, blank lines and spacing through export/import', async () => {
  const p=instant(),prologue='첫 문장에는  두 칸이 있다.\n다음 줄이다.\n\n\n“대사는 따로 둔다.”\n\n\t들여쓴 마지막 줄.';
  p.instantStory.startProfiles[0].prologue=prologue;
  const {files}=await pack(p),c=contract();await c.CortexInstant.verifySource(files);
  const sc=c.CortexNexusBridge.toCortexScenario(c.CortexNexusBridge.adaptPackage(files));
  assert.equal(sc.runtime.instantStory.startProfiles[0].prologue,prologue);
  assert.equal(sc.runtime.packageContract.openingContract.openingLine,prologue);
});

test('export validation rejects settings that the new Instant consumer refuses', () => {
  for (const mutate of [
    (p: Project) => { p.instantStory.contextBudget.recentTurns = 1.5; },
    (p: Project) => { p.instantStory.contextBudget.maxDynamicPromptChars = 3999; },
    (p: Project) => { p.instantStory.generation.ordinaryTurnMaxOutputTokens = 16001; },
    (p: Project) => { p.instantStory.statRules[0].initial = 11; },
    (p: Project) => { p.instantStory.endingPolicy.checkInterval = 0; },
  ]) { const p = instant(); mutate(p); assert.ok(validateInstantStory(p).some(issue => issue.severity === 'error')); }
});
test('whole engine imports Studio ZIP, selects profiles, commits free Instant prose and restores/rewinds without scheduled endings', async () => {
  const { output } = await pack(instant()), c = contract(), requests: any[] = [];
  const model: any = makeModel(), ordinary = model.fetch; let omitDone = false;
  model.fetch = (url: any, init: any) => {
    if (!String(url).includes('/api/simulate/stream')) return ordinary(url, init);
    const body = JSON.parse(init.body); requests.push(body); assert.equal(body.cortexInstant, true);
    const ctx = c.CortexInstant.context(body.scenario, body.turns, body.input, body.publicCast);
    const result = { narration: '윤서는 편지를 확인했다.', recommendations: ['답장을 쓴다','책장을 넘긴다','밖을 살핀다'], statChanges: [{ id: 'TRUST', delta: 2, evidence: '편지를 확인했다.' }], relationshipChanges: [], relationshipReveals: [], memoryQuotes: ['편지를 확인했다.'], ending: { ended: ctx.endingDue, evidence: ctx.endingDue ? '편지를 확인했다.' : '' }, world: { ...body.scenario.world, evidence: '' }, presentCharacterIds: ['PC'] };
    const nextState = c.CortexInstant.apply(body.scenario, ctx, result, body.turnId);
    const events = [['turn_ack', {}], ['narration_commit', { blockIndex: 0, delta: result.narration }], ['turn_sidecar', { runtime: 'cortex_instant_v1', turnId: body.turnId, result, nextState }], ...(!omitDone ? [['done', { validated: true, memoryApplied: true }]] : [])];
    return Promise.resolve(new Response(events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')));
  };
  const {installInstantModel}=await import('../cortex/instant-model.mjs');
  installInstantModel(model,{fail:()=>omitDone,onWriter:(ctx:any)=>requests.push({context:ctx}),prose:()=> '윤서는 편지를 확인했다.',hud:()=>({statChanges:[{id:'TRUST',delta:2,evidence:'편지를 확인했다.'}],relationshipChanges:[],world:null,presentCharacterIds:['PC']})});
  let app = await new HeadlessCortex({ standalonePath: enginePath, model }).open();
  try {
    const bytes = await output.blob.arrayBuffer();
    const imported = await app.api.inspectNexusPackage({ name: 'Studio.zip', size: bytes.byteLength, arrayBuffer: async () => bytes });
    app.api.applyImportedState({ canonicalSession: imported.canonicalSession, turns: [] }, { persistState: false });
    app.api._setSettings({ apiKey: 'fixture-only', typingSpeed: 'instant' });
    await app.api._selectInstantProfile('B');
    assert.equal(app.scenario.runtime.instantState.profileId, 'B'); assert.equal(app.scenario.world.time, '09:30:00');
    assert.equal((await app.turn('편지를 확인한다.')).status, 'COMMITTED');
    assert.equal(app.scenario.runtime.instantState.stats.TRUST, 4); assert.equal(app.scenario.runtime.eventLedger.sealed.length, 0);
    omitDone = true; assert.equal((await app.turn('계속')).status, 'REJECTED'); assert.equal(app.scenario.runtime.instantState.turnCount, 1);
    const saved = app.close(); app = await new HeadlessCortex({ standalonePath: enginePath, model, ...saved }).open();
    assert.equal(app.scenario.runtime.instantState.stats.TRUST, 4); assert.equal(app.scenario.runtime.instantState.profileId, 'B');
    omitDone = false; assert.equal((await app.turn('마무리한다.')).status, 'COMMITTED');
    assert.equal(app.scenario.runtime.instantState.ended, false); assert.equal(app.win.document.getElementById('send').disabled, false);
    app.win.confirm = () => true; await app.api._rewind();
    assert.equal(app.scenario.runtime.instantState.turnCount, 1); assert.equal(app.scenario.runtime.instantState.ended, false);
    assert.equal(requests[0].context.corePrompt, instant().instantStory.corePrompt);
  } finally { app.close(); }
});
test('Studio occurrence conditions bridge unknown inputs or select eligible events without false completion', async () => {
  const p = makeProjectForPackageTarget('cortex', 'intelligent_canon', false);
  p.player.id = 'PC'; p.player.name = '윤서'; p.startLocation = '공방';
  p.events = ['BEFORE','AFTER'].map((id, i) => {
    const e = { ...blankStoryEvent(i + 1), id, description: '공방에서 편지를 확인한다.' };
    e.cortexDesign = { ...eventDesign(e), occurrenceEnabled: true, occurrence: i ? '공방 안에 있다.' : '공방 밖에 있다.' };
    return e;
  });
  const { files } = await pack(p), c = contract();
  for(const unknown of [true,false]){
    const sc = c.CortexNexusBridge.toCortexScenario(c.CortexNexusBridge.adaptPackage(files));
    sc.runtime.eventLedger={...(sc.runtime.eventLedger||{}),sealed:[{id:'PREVIOUS',outcome:'SUCCESS'}]};
    const model = makeModel({ beforeRespond: (entry: any) => {
      if (entry.format !== 'cortex_event_occurrence') return;
      const answer = { verdict: unknown ? 'UNKNOWN' : JSON.stringify(entry.payload).includes('공방 밖에 있다.') ? 'FALSE' : 'TRUE', evidence: unknown ? '' : '공방' };
      return { ok: true, status: 200, body: null, json: async () => ({ output_text: JSON.stringify(answer) }) };
    } });
    const app = await new HeadlessCortex({ standalonePath: enginePath, model, initialScenario: sc }).open();
    try {
      app.api._setSettings({ apiKey: 'fixture-only', typingSpeed: 'instant' });
      const first = await app.turn('주변을 살핀다.');assert.equal(first.status,'COMMITTED');assert.equal(first.sourceEventId,unknown?'BEFORE':'AFTER');
      assert.ok(!app.scenario.runtime.eventLedger.sealed.some((row: any) => row.id === 'BEFORE'));
      const saved = app.api._export(); app.api.applyImportedState(saved, { persistState: false });
      if(unknown){assert.equal(app.scenario.runtime.occurrenceBridge.condition,'공방 밖에 있다.');assert.equal(app.scenario.event.cortexDesign.occurrenceEnabled,true);assert.equal(app.scenario.runtime.occurrenceDecisions?.some((r:any)=>r.verdict==='TRUE')||false,false)}
      else assert.equal(app.scenario.runtime.occurrenceDecisions[0].verdict,'FALSE');
    } finally { app.close(); }
  }
});
