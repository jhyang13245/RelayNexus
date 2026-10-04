export type SavePhase = 'idle'|'checking'|'syncing'|'complete'|'retry';
// Counts are acknowledged server snapshots, never inferred from clocks or the UI.
export function cloudSaveLabel(phase:SavePhase,saved:number|null,current:number){
 const n=Math.max(0,Math.floor(current||0));
 if(phase==='checking')return '클라우드 기록 확인 중…';
 if(phase==='complete')return saved===null?'클라우드 기록 확인 완료':saved===0?'시작 장면 저장 완료':`${saved}비트까지 저장 완료`;
 const range=saved!==null&&n>saved?(n===saved+1?`${n}비트`:`${saved+1}–${n}비트`):n?`${n}비트 변경사항`:'시작 장면';
 if(phase==='retry')return saved===null?'클라우드 저장 확인 필요':`${range} 미저장`;
 return `${range} 저장 중…`;
}

export type MultiplayerConnection='connecting'|'connected'|'reconnecting'|'offline';
export function multiplayerConnectionLabel(connection:MultiplayerConnection,catchingUp:boolean,turn?:number){
 if(connection==='offline')return '오프라인 · 연결을 기다리는 중';
 if(connection==='reconnecting')return '연결 복구 중…';
 if(connection==='connecting')return '공유 기록 확인 중…';
 if(catchingUp)return '최신 본문 불러오는 중…';
 return typeof turn==='number'?`${turn}비트까지 반영됨`:'실시간 연결됨';
}
