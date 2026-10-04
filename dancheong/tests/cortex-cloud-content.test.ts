import test from 'node:test';
import assert from 'node:assert/strict';
import {sameCloudContent} from '../lib/cortex-cloud-content';
test('cloud equality ignores only transport/presentation fields and retains gameplay, images and memory',()=>{
 const a={scenario:{world:{hp:4}},turns:[{id:'one',text:'approved',imageAssetKey:'image'}],undoLedger:[{text:'old'}],canonicalSession:{state:{memory:'memory'}},media:{generated:[{dataUrl:'image bytes'}]},settings:{model:'Luna',fontSize:'small',styleGuide:'style'},exportedAt:'old',storageDiagnostics:{revision:1}};
 const b=structuredClone(a);b.settings.model='Muse';b.settings.fontSize='large';b.exportedAt='new';b.storageDiagnostics.revision=9;assert.equal(sameCloudContent(a,b),true);
 for(const change of [(x:any)=>x.scenario.world.hp++,(x:any)=>x.turns[0].text='different',(x:any)=>x.media.generated[0].dataUrl='different',(x:any)=>x.canonicalSession.state.memory='changed',(x:any)=>x.undoLedger=[]]){const c=structuredClone(b);change(c);assert.equal(sameCloudContent(a,c),false);}
});
