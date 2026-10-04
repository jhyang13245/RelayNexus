// Full autoplay uses the same continuation command as the reader. It never
// chooses a recommendation or retries a failed paid request on its own.
export function storyComplete(scenario) {
  const runtime = scenario?.runtime || {};
  if (runtime.branchEndingState?.ending) return true;
  return !runtime.instantStory && Boolean(scenario?.event?.id) && (runtime.eventLedger?.sealed || [])
    .some(row => String(row.id || row.eventId) === String(scenario.event.id));
}

// Readable prose has a five-second grace period. Automatic navigation has a
// separate gate: every verified person in THIS beat must actually be visible.
// Never wait on global asset jobs (they include future beats and optional art).
export function fullAutoVisuals(view, { displayed = [], eventDecoded = false, canPrepare = true, offCamera = false } = {}) {
  if (view?.castStatus === 'error') return { action: 'stop', reason: '현장 인물 확인에 실패해 완전 자동을 멈췄습니다. 이미지 상태에서 다시 시도해 주세요.' };
  if (view?.castStatus === 'needs-key' || view?.castStatus !== 'ready' && !canPrepare) return { action: 'stop', reason: '인물 확인과 이미지 생성을 위한 API 키·저장 공간 설정을 확인해 주세요.' };
  if (!view || view.castStatus !== 'ready') return { action: 'wait', reason: '현장 인물 확인 중' };
  if (view.identityIssue && !view.speakerOffScene) return { action: 'stop', reason: '화자를 확실히 연결하지 못해 완전 자동을 멈췄습니다. 인물 상태를 확인하거나 수동으로 읽어 주세요.' };
  // Deliberate scenery/interior-monologue shots have no visible cast to await.
  if (offCamera) return { action: 'ready' };
  const inEvent = id => eventDecoded && view.eventBackground && view.eventCharacterIds?.includes(id);
  const missing = (view.pending || []).filter(person => !inEvent(person.id));
  if (missing.some(person => person.status === 'error')) return { action: 'stop', reason: '인물 이미지 생성에 실패해 완전 자동을 멈췄습니다. 이미지 상태에서 다시 시도해 주세요.' };
  if (missing.some(person => person.status === 'needs-key')) return { action: 'stop', reason: '인물 이미지 모델의 API 키가 없거나 생성이 일시 중지되어 완전 자동을 멈췄습니다. 설정을 확인해 주세요.' };
  if (missing.length) return { action: 'wait', reason: '인물 이미지 준비 중' };
  for (const person of view.portraits || []) {
    if (inEvent(person.id)) continue;
    const slot = displayed.find(row => row.id === person.id && !row.hidden);
    if (slot?.failedUrl === person.url) return { action: 'stop', reason: '인물 이미지를 화면에 표시하지 못해 완전 자동을 멈췄습니다. 새로고침 후 다시 켜 주세요.' };
    if (!slot?.url || !(slot.url === person.url || person.expressionReady === false && slot.baseKey === person.baseKey)) return { action: 'wait', reason: '인물 이미지 표시 준비 중' };
  }
  return { action: 'ready' };
}

export function fullAutoStep(input) {
  if (input.problem) return { action: 'stop', reason: input.problem };
  if (input.draft) return { action: 'stop', reason: '입력 중인 내용이 있어 완전 자동을 멈췄습니다.' };
  if (['error', 'needs-key', 'blocked'].includes(input.voicePhase)) return { action: 'stop', reason: input.voicePhase === 'blocked'
    ? '브라우저가 음성 재생을 막았습니다. 다시 듣기로 재생한 뒤 완전 자동을 켜 주세요.'
    : 'AI 음성을 준비하지 못해 완전 자동을 멈췄습니다. 연결 설정과 사용 한도를 확인해 주세요.' };
  if (input.visual?.action === 'stop') return input.visual;
  if (!input.hasPage || input.blocked || input.revealing || input.growing) return { action: 'wait' };
  if (input.visual?.action === 'wait') return input.visual;
  if (input.hasVoice && input.voicePhase !== 'done') return { action: 'wait' };
  if (input.hasNext) return { action: 'advance' };
  if (input.busy || input.awaiting || input.engineLocked) return { action: 'wait' };
  if (input.ended) return { action: 'stop', reason: '이야기가 끝나 완전 자동을 마쳤습니다.' };
  if (input.tailStatus && input.tailStatus !== 'COMMITTED') return { action: 'stop', reason: '현재 비트 처리가 끝나지 않아 완전 자동을 멈췄습니다. 진행상황을 확인해 주세요.' };
  return { action: 'continue' };
}

export function createContinuationGate() {
  let running = false, last = '';
  return {
    async run(key, submit) {
      if (running || !key || key === last) return false;
      last = key; running = true;
      try { await submit(); return true; } finally { running = false; }
    },
    reset() { if (!running) last = ''; },
    get running() { return running; },
  };
}
