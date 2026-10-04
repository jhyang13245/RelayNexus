import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { blankStoryEvent, makeProjectForPackageTarget, normalizeProject, validateProject } from '../../features/jieum/studio-model';
import { exportScenarioPack, extractStudioProjectFromPackage, buildImportObject, buildProjectSnapshot } from '../../features/jieum/studio-export';

const oldProject = () => {
  const p = makeProjectForPackageTarget('cortex','intelligent_canon',false);
  p.locationGraph = {schema:'CORTEX_LOCATION_GRAPH_V1',nodes:[{locationRef:'location:home',label:'한옥',aliases:[]}],links:[]};
  p.package15.enabled = true;
  p.package15.requiredFeatures.push('location_graph_v1' as never);
  p.world.location = ''; p.world.locationEntityRef = 'location:home';
  p.events = [{...blankStoryEvent(1),id:'KEEP_EVENT',name:'첫 사건',description:'문을 연다.',canonLocation:'',canonLocationRef:'location:home'}];
  return p;
};
const forbidden = /"(?:locationGraph|canonLocationRef|locationEntityRef|locationRef|transitionLocationRefs|observationLocationRefs)"\s*:/;

test('old graph imports recover prose names and discard graph requirements without repeated notes', () => {
  const p = normalizeProject(oldProject());
  assert.equal(p.events[0].canonLocation,'한옥');
  assert.equal(p.world.location,'한옥');
  assert.equal(p.locationGraph.nodes.length,0);
  assert.deepEqual(normalizeProject(p),p);
  p.events[0].canonLocationRef = 'location:unregistered';
  assert.equal(validateProject(p).some(i => /위치 그래프/.test(i.area)),false);
});

for (const runtime of ['intelligent_canon','instant_story'] as const) test(`${runtime}: no graph files, requirements or place IDs in runtime and editor export`,async () => {
  const p = oldProject(); p.runtimeMode = runtime;
  const result = await exportScenarioPack(p,false);
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  for (const path of ['locations.json','cortex/location_graph.json','state/zone_definitions.json']) assert.equal(zip.file(path),null,path);
  for (const [path,entry] of Object.entries(zip.files)) if(path.endsWith('.json')) {
    const body = await entry.async('string');
    assert.doesNotMatch(body,forbidden,path);
    if(path==='manifest.json') assert.ok(!JSON.parse(body).requiredFeatures.includes('location_graph_v1'));
  }
  const restored = normalizeProject((await extractStudioProjectFromPackage(result.blob)).project);
  assert.equal(restored.locationGraph.nodes.length,0);
  assert.match(restored.world.fixedCanon,/한옥/);
  assert.doesNotMatch(JSON.stringify(buildImportObject(p)),forbidden);
  assert.doesNotMatch(JSON.stringify(buildProjectSnapshot(p)),forbidden);
  assert.equal(p.locationGraph.nodes.length,1,'export must not mutate source object');
});

test('removing registration leaves unrelated broken event references detectable', () => {
  const p = normalizeProject(oldProject()); p.events[0].nextEventId = 'MISSING_EVENT';
  assert.equal(validateProject(p).some(i => /후속사건 참조/.test(i.message)),true);
});
