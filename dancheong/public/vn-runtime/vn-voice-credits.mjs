export const TYPECAST_CREDIT = '이 콘텐츠는 인공지능 가상 연기자 서비스, 타입캐스트를 활용하여 제작되었습니다.';
export const TYPECAST_URL = 'https://typecast.ai';

// Public voice names only. Keep credits after a voice assignment changes;
// failed synthesis and previews are not credited as story performances.
export function createVoiceCredits(storage) {
  const memory = new Map();
  const key = work => `dancheong-vn-typecast-credits-v1:${work}`;
  function entries(work) {
    if (!work) return [];
    if (!memory.has(work)) {
      let rows = [];
      try { rows = JSON.parse(storage.getItem(key(work)) || '[]'); } catch { /* Memory remains available. */ }
      memory.set(work, new Map((Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string' && row[1].trim()).map(([id, name]) => [id, name.slice(0, 120)])));
    }
    return [...memory.get(work).entries()];
  }
  return {
    names: work => [...new Set(entries(work).map(([, name]) => name))],
    record(work, line, catalog) {
      if (!work || line?.provider !== 'typecast') return;
      const name = line.voiceName?.trim() || catalog.find(row => row.id === line.voice)?.name?.trim();
      if (!name) return;
      entries(work);
      const rows = memory.get(work), label = name.slice(0, 120);
      if (rows.get(line.voice) === label) return;
      rows.set(line.voice, label);
      try { storage.setItem(key(work), JSON.stringify([...rows])); } catch { /* Credits stay visible in this tab. */ }
    },
  };
}
