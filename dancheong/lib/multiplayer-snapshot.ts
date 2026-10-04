import {readRuntimeJsonText, storeRuntimeJson, deleteRuntimeObject, R2_JSON_POINTER, type StoredJsonPointer} from './runtime-json-store';
import {sharedOperations} from './multiplayer-update';
import {vnSnapshotManifest} from './multiplayer-vn-manifest';

const fields={inline:'snapshot_json',key:'snapshot_r2_key',sha256:'snapshot_sha256',byteLength:'snapshot_byte_length'};
type Row=Record<string,any>;
type Owner={ownerKey:string;projectId:string;sessionId:string;revision:number};
export function sharedMediaVersion(row:Row):string {
  try {const value=JSON.parse(String(row.snapshot_json||'{}')).mediaVersion;if(typeof value==='string')return value;}catch{}
  return `legacy-${row.snapshot_sha256||row.revision}`;
}
export async function readSharedSnapshot(row:Row, knownMedia='',base?:{revision:number;version:string}) {
  const snapshotVersion=String(row.snapshot_sha256||'');
  if(base&&knownMedia&&knownMedia===sharedMediaVersion(row))try{
    const update=JSON.parse(String(row.snapshot_json||'{}')).update;
    if(update&&update.baseRevision===base.revision&&update.baseVersion===base.version&&update.revision===Number(row.revision)){
      const packet=JSON.parse(await readRuntimeJsonText({snapshot_r2_key:update.key,snapshot_sha256:update.sha256,snapshot_byte_length:update.byteLength},fields));
      if(packet.schema==='CORTEX_SHARED_UPDATE_V1'&&packet.baseVersion===base.version&&packet.revision===Number(row.revision))return {update:packet,snapshotVersion,mediaVersion:knownMedia,mediaReused:true};
    }
  }catch{/* The complete, hash-validated snapshot remains the recovery authority. */}
  const stored=JSON.parse(await readRuntimeJsonText(row,fields));
  const {_multiplayerMedia,...snapshot}=stored;
  const mediaVersion=sharedMediaVersion(row);
  if(knownMedia && knownMedia===mediaVersion)delete snapshot.media;
  else if(_multiplayerMedia){
    snapshot.media=JSON.parse(await readRuntimeJsonText({snapshot_r2_key:_multiplayerMedia.key,snapshot_sha256:_multiplayerMedia.sha256,snapshot_byte_length:_multiplayerMedia.byteLength},fields));
  }
  return {snapshot,snapshotVersion,mediaVersion,mediaReused:Boolean(knownMedia && knownMedia===mediaVersion)};
}

// A reuse token is valid only against this room's current, server-owned snapshot.
// Clients never supply object-store paths; legacy full snapshots remain supported.
export async function storeSharedSnapshot(input:Row, owner:Owner, previous?:Row, unchanged?:string,createUpdate=true) {
  const {_multiplayerMedia:untrustedPointer,media:inputMedia,...snapshot}=input;
  if(snapshot.scenario?.runtime?.vnPresentation){
    snapshot.scenario={...snapshot.scenario,runtime:{...snapshot.scenario.runtime}};
    delete snapshot.scenario.runtime.vnPresentation;
  }
  let media=inputMedia,pointer:StoredJsonPointer|undefined,prior:Row|undefined,newMediaKey:string|undefined;
  if(unchanged){
    if(!previous || unchanged!==sharedMediaVersion(previous))throw Error('이미지 기준이 변경되었습니다. 최신 공유 기록을 다시 불러와 주세요.');
    prior=JSON.parse(await readRuntimeJsonText(previous,fields));
    pointer=prior!._multiplayerMedia;media=prior!.media;
  }
  if(media!==undefined&&!pointer){pointer=await storeRuntimeJson({...owner,category:'pack',value:media});newMediaKey=pointer.key;}
  const mediaVersion=pointer?.sha256||'no-media';
  const saved=await storeRuntimeJson({...owner,category:'revision',value:{...snapshot,...(pointer?{_multiplayerMedia:pointer}:{})}}).catch(async error=>{if(newMediaKey)await deleteRuntimeObject(newMediaKey).catch(()=>undefined);throw error});
  let update:Row|undefined;
  if(createUpdate&&prior&&previous?.snapshot_sha256&&Number(previous.revision)+1===owner.revision)try{
    const {_multiplayerMedia,media:oldMedia,...before}=prior;
    const operations=sharedOperations(before,snapshot);
    if(operations){
      const packet={schema:'CORTEX_SHARED_UPDATE_V1',baseRevision:Number(previous.revision),baseVersion:previous.snapshot_sha256,revision:owner.revision,operations};
      const text=JSON.stringify(packet);
      if(new TextEncoder().encode(text).byteLength<Math.min(1024*1024,saved.byteLength*.7)){
        const stored=await storeRuntimeJson({...owner,category:'checkpoint',value:text});
        update={...stored,baseRevision:packet.baseRevision,baseVersion:packet.baseVersion,revision:owner.revision};
      }
    }
  }catch{/* Optional fast path failure must not prevent a full durable commit. */}
  return {...saved,newMediaKey,updateKey:update?.key as string|undefined,inline:JSON.stringify({...JSON.parse(R2_JSON_POINTER),mediaVersion,vnReading:vnSnapshotManifest(snapshot),...(update?{update}:{})})};
}
