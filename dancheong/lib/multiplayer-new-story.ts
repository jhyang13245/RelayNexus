export function validateNewSharedStory(value:unknown): Record<string,unknown> {
  const snapshot=value as Record<string,any>;
  if(!snapshot||!String(snapshot.schema||'').startsWith('CORTEX_')||!snapshot.scenario||!Array.isArray(snapshot.turns)||snapshot.turns.length!==0)
    throw new Error('새 이야기는 원본 패키지의 시작 상태여야 합니다.');
  if(snapshot.settings?.apiKey||snapshot.apiKey)throw new Error('API 키는 공유할 수 없습니다.');
  if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>80*1024*1024)throw new Error('작품의 공유 용량이 너무 큽니다.');
  return snapshot;
}
