const stages = { queue: '이미지 요청 대기', image: '이미지 API', raster: '배경 제거·입상 검사', decode: '입상 화면 표시', text: '본문·판정 API', firstText: '첫 스트리밍 응답', cast: '인물 판정 API', voice: '음성 API', music: '음악 API', persist: '비트 저장 완료' };
export function createDiagnostics({ now = () => performance.now(), limit = 128 } = {}) {
  const samples = [], seen = new Map(); let hits = 0, misses = 0;
  function record(stage, milliseconds) { if (!(stage in stages) || !Number.isFinite(milliseconds)) return; samples.push({ stage, ms: Math.max(0, Math.round(milliseconds)) }); if (samples.length > limit) samples.shift(); }
  return {
    start(stage) { const start = now(); let done = false; return () => { if (!done) { done = true; record(stage, now() - start); } }; },
    record,
    cache(key, hit) { if (seen.has(key)) return; seen.set(key, true); if (seen.size > 256) seen.delete(seen.keys().next().value); if (hit) hits++; else misses++; },
    snapshot() { return { samples: samples.map(row => ({ ...row })), cache: { hits, misses }, version: 1 }; },
    render(element) {
      element.replaceChildren(); const h = document.createElement('h3'); h.textContent = '이 탭의 대기 시간'; element.append(h);
      const note = document.createElement('p'); note.textContent = `이미지 준비 요청 중 기존 이미지 재사용 ${hits}건 / 새 생성 ${misses}건. 같은 자산은 중복 집계하지 않습니다. 최근 ${limit}개 측정만 유지하며 본문·API 키는 기록하지 않습니다.`; element.append(note);
      for (const [stage, label] of Object.entries(stages)) {
        const times = samples.filter(row => row.stage === stage).map(row => row.ms).sort((a,b) => a-b); if (!times.length) continue;
        const p = document.createElement('p'); p.textContent = `${label} · 중앙 ${(times[Math.floor(times.length/2)]/1000).toFixed(2)}초 · 최장 ${(times.at(-1)/1000).toFixed(2)}초 · ${times.length}회`; element.append(p);
      }
      if (!samples.length) { const p = document.createElement('p'); p.textContent = '아직 측정한 요청이 없습니다.'; element.append(p); }
    },
  };
}
export const diagnostics = createDiagnostics();
