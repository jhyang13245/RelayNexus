import type { Project } from './studio-model';
import { CORTEX_TARGET_VERSION, CORTEX_TARGET_NEXUS_VERSION, CORTEX_TARGET_EXTENSION_REVISION } from './cortex-target';
export { CORTEX_TARGET_VERSION } from './cortex-target';

/** Pinned to the engine shipped by the official Nexus source download. */
export const CORTEX_ENGINE_PROVENANCE = {
  nexusVersion: CORTEX_TARGET_NEXUS_VERSION,
  extensionRevision: CORTEX_TARGET_EXTENSION_REVISION,
  sourceUrl: 'https://relay-novel-nexus.juno12345.chatgpt.site/downloads/Dancheong_v1.13.0_Source.zip',
  capabilitiesUrl: 'https://relay-novel-nexus.juno12345.chatgpt.site/api/cortex/capabilities',
  assembly: 'scripts/vendor-cortex.mjs',
  extensions: ['instant-runtime.js', 'occurrence-runtime.js'],
  engineSha256: '4c00f8afe19d76abfd357ff597c951bcb0b036213830566093dddde1c39bb193',
} as const;

export const CORTEX_INTEGRATION_TARGET = {
  engine: 'dancheong-cortex',
  cortexBaseVersion: CORTEX_TARGET_VERSION,
  minimumNexusVersion: CORTEX_TARGET_NEXUS_VERSION,
  minimumExtensionRevision: CORTEX_TARGET_EXTENSION_REVISION,
} as const;

export function cortexCompatibility(project: Project) {
  const instant = project.runtimeMode === 'instant_story';
  const limitations: { code: string; message: string }[] = [];
  return {
    schema: 'STUDIO_CORTEX_COMPATIBILITY_V1',
    targetEngineVersion: CORTEX_TARGET_VERSION,
    integrationTarget: CORTEX_INTEGRATION_TARGET,
    provenance: CORTEX_ENGINE_PROVENANCE,
    runtimeMode: project.runtimeMode,
    status: limitations.length ? 'ENGINE_UPDATE_REQUIRED' : 'CONTRACT_VERIFIED',
    validation: 'PINNED_ENGINE_IMPORT_AND_MOCKED_RUNTIME',
    liveModelQualityVerified: false,
    limitations,
    notes: instant ? [
      'Nexus 1.13.0의 단청 확장 1.0.0이 필요합니다. 확장이 없는 Cortex 1.42.0에는 적용되지 않습니다.',
      '완성 응답을 검증한 뒤 본문을 표시합니다. 첫 표시 시간이나 단일 호출을 보장하지 않습니다.',
      '예시 장면은 첫 1개를 사용합니다. 기억은 보존된 인용을 사용하며 외부 조사 작업을 자동 생성하지 않습니다.',
      '전용 미디어 자동 실행, 사전 지정 엔딩, 멀티플레이, 루트·루프 혼합은 지원 범위 밖입니다.',
    ] : [
      '발생조건 자동 선택에는 Nexus 1.13.0의 단청 확장 1.0.0이 필요합니다.',
      '발생조건은 공개된 상태로 판정합니다. 거짓이면 건너뛰고, 불확실하거나 통신에 실패하면 입력을 보존하고 보류합니다.',
    ],
  };
}

/** Materialize the explicit eventIds consumed by CortexNexusBridge.routeGraph. */
export function cortexRoutes(project: Project) {
  const events = project.events.filter(e => e.kind !== 'constraint');
  const design = project.package15;
  const commonChapters = design.chapters.filter(ch => ch.scope === 'common' || design.commonArc.chapterIds.includes(ch.id));
  const commonChapterIds = new Set(commonChapters.map(ch => ch.id));
  const commonEvents = new Set(commonChapters.flatMap(ch => ch.eventIds));
  const assignedEvents = new Set([
    ...design.chapters.flatMap(ch => ch.eventIds),
    ...design.routes.flatMap(route => [route.entryEventId, route.lockEventId]),
    ...design.endings.map(ending => ending.terminalEventId || ''),
  ]);
  return design.routes.map(route => {
    const chapters = design.chapters.filter(ch => ch.routeId === route.id || route.chapterIds.includes(ch.id));
    const chapterIds = new Set(chapters.map(ch => ch.id));
    const endings = design.endings.filter(ending => ending.routeId === route.id || route.endingIds.includes(ending.id));
    const ownEvents = new Set([
      route.entryEventId, route.lockEventId,
      ...chapters.flatMap(ch => ch.eventIds),
      ...endings.map(ending => ending.terminalEventId || ''),
    ]);
    const eventIds = events.filter(event => {
      const meta = event.multiroute;
      const common = commonEvents.has(event.id) || commonChapterIds.has(meta?.chapterId || '') || meta?.scope === 'common' || meta?.scope === 'global';
      const own = ownEvents.has(event.id) || chapterIds.has(meta?.chapterId || '') || meta?.routeId === route.id || meta?.routeEntryFor === route.id;
      // Unassigned events are shared; an explicit chapter or route stays scoped.
      const unassigned = !meta?.routeId && !meta?.chapterId && !meta?.routeEntryFor && !assignedEvents.has(event.id);
      return common || own || unassigned;
    }).map(event => event.id);
    return { ...route, eventIds };
  });
}
