import '../../vendor/cortex/instant-runtime.js';

type Probe = { profileId: string; inputChars: number; requiredChars: number; maximumChars: number; fits: boolean; kind: 'base' | 'suggested-input' };
export type InstantContextPreflight = { schema: 'CORTEX_INSTANT_CONTEXT_PREFLIGHT_V1'; status: 'READY' | 'INPUT_MARGIN_LOW' | 'BASE_CONTEXT_EXCEEDED' | 'RUNTIME_INVALID'; probes: Probe[]; note: string };

// Uses the shipped reducer rather than a separate character-count formula.
// Public-profile sizing is conservative; actual disclosure and future history
// are evaluated by Cortex for each turn. This is not a live-model certification.
export function inspectInstantContext(files: Record<string, unknown>): InstantContextPreflight {
  const runtime = (globalThis as any).CortexInstant;
  const normalize = (p: any) => ({ ...p, source: p, publicProfile: p.publicProfile || p.publicInfo || '' });
  let session;
  try { session = runtime.adapt(files, {}, normalize); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('INSTANT_PACKAGE_REJECTED:')) throw error;
    // Incomplete editor snapshots must remain exportable for roundtrip/repair.
    // Actual browser package download is gated on this result by the exporter.
    return { schema: 'CORTEX_INSTANT_CONTEXT_PREFLIGHT_V1', status: 'RUNTIME_INVALID', probes: [], note: 'Instant 실행 설정이 완성되지 않았습니다. Instant Story 사용 여부와 필수 설정을 확인해 주세요.' };
  }
  const scenario = runtime.toScenario(session);
  const cast = [scenario.protagonist, ...scenario.characters].map((p: any) => ({
    id: p.id, name: p.name, role: p.publicRole || '', publicProfile: p.publicProfile || '',
    age: String(p.publicAge || p.age || ''), gender: String(p.publicGender || p.gender || ''),
    publicRelationships: p.publicRelationships || '', voice: p.publicVoice || p.voice || '', aliases: p.aliases || [],
  }));
  const config = scenario.runtime.instantStory;
  const profiles = config.startProfiles.length ? config.startProfiles : [{ id: '' }];
  const probes: Probe[] = [];
  for (const profile of profiles) {
    scenario.runtime.instantState = runtime.initial(config, profile.id);
    if (profile.prologue) scenario.runtime.packageContract.openingContract.openingLine = profile.prologue;
    const inputs = ['', ...(profile.recommendedReplies || []), ...(config.exampleScenes || []).map((x: any) => x.userInput)].filter((x: unknown): x is string => typeof x === 'string');
    for (const input of [...new Set(inputs)]) {
      let requiredChars: number;
      try { requiredChars = JSON.stringify(runtime.freeContext(scenario, [], input, cast)).length; }
      catch (error) {
        const failed = error as Error & { contextBudget?: { required: number } };
        if (!failed.contextBudget || failed.message !== 'INSTANT_PACKAGE_REJECTED:CONTEXT_BUDGET_EXCEEDED') throw error;
        requiredChars = failed.contextBudget.required;
      }
      probes.push({ profileId: profile.id, inputChars: input.length, requiredChars, maximumChars: config.contextBudget.maxDynamicPromptChars, fits: requiredChars <= config.contextBudget.maxDynamicPromptChars, kind: input ? 'suggested-input' : 'base' });
    }
  }
  return { schema: 'CORTEX_INSTANT_CONTEXT_PREFLIGHT_V1', status: probes.some(p => !p.fits && p.kind === 'base') ? 'BASE_CONTEXT_EXCEEDED' : probes.some(p => !p.fits || p.maximumChars - p.requiredChars < 1000) ? 'INPUT_MARGIN_LOW' : 'READY', probes,
    note: '현재 시작 프로필·추천 입력·예시 입력의 문맥 구성 점검입니다. 실제 공개 인물, 입력, 이후 진행 기록에 따라 필요한 분량은 달라집니다.' };
}
