import type { Project } from './studio-model';
import { APP_VERSION } from '../../lib/app-version';
import cortexManifest from '../../vendor/cortex/manifest.json';
import { CORTEX_TARGET_VERSION, CORTEX_TARGET_NEXUS_VERSION, CORTEX_TARGET_EXTENSION_REVISION } from './cortex-target';
export { CORTEX_TARGET_VERSION } from './cortex-target';

/** Pinned to the engine shipped by the official Nexus source download. */
export const CORTEX_ENGINE_PROVENANCE = {
  nexusVersion: APP_VERSION,
  extensionRevision: cortexManifest.extensionRevision,
  sourceUrl: `https://relay-novel-nexus.juno12345.chatgpt.site/downloads/Dancheong_v${APP_VERSION}_Source.zip`,
  capabilitiesUrl: 'https://relay-novel-nexus.juno12345.chatgpt.site/api/cortex/capabilities',
  assembly: 'scripts/vendor-cortex.mjs',
  extensions: ['instant-runtime.js', 'occurrence-runtime.js', 'jieum-runtime.js'],
  engineSha256: cortexManifest.sha256,
} as const;

export const CORTEX_INTEGRATION_TARGET = {
  engine: 'dancheong-cortex',
  cortexBaseVersion: CORTEX_TARGET_VERSION,
  minimumNexusVersion: CORTEX_TARGET_NEXUS_VERSION,
  minimumExtensionRevision: CORTEX_TARGET_EXTENSION_REVISION,
} as const;

export function cortexCompatibility(project: Project) {
  const instant = project.runtimeMode === 'instant_story';
  const needsHudExtension = !!project.canonHud || !!project.canonDesign?.stats.some(s=>s.revealWhenChanged);
  const limitations: { code: string; message: string }[] = [];
  return {
    schema: 'STUDIO_CORTEX_COMPATIBILITY_V1',
    targetEngineVersion: CORTEX_TARGET_VERSION,
    integrationTarget: needsHudExtension && !instant ? {...CORTEX_INTEGRATION_TARGET, minimumNexusVersion:'1.23.0',minimumExtensionRevision:'1.3.0'} : project.canonDesign && !instant ? {...CORTEX_INTEGRATION_TARGET, minimumNexusVersion:'1.19.0',minimumExtensionRevision:'1.1.0'} : CORTEX_INTEGRATION_TARGET,
    provenance: CORTEX_ENGINE_PROVENANCE,
    runtimeMode: project.runtimeMode,
    status: limitations.length ? 'ENGINE_UPDATE_REQUIRED' : 'CONTRACT_VERIFIED',
    validation: 'PINNED_ENGINE_IMPORT_AND_MOCKED_RUNTIME',
    liveModelQualityVerified: false,
    limitations,
    notes: instant ? [
      'Nexus 1.13.1의 단청 확장 1.0.0이 필요합니다. 확장이 없는 Cortex 1.42.0에는 적용되지 않습니다.',
      '완성 응답을 검증한 뒤 본문을 표시합니다. 첫 표시 시간이나 단일 호출을 보장하지 않습니다.',
      '예시 장면은 첫 1개를 사용합니다. 기억은 보존된 인용을 사용하며 외부 조사 작업을 자동 생성하지 않습니다.',
      '전용 미디어 자동 실행, 사전 지정 엔딩, 루트·루프 혼합은 지원 범위 밖입니다. 멀티플레이는 Nexus 공유방에서 별도로 실행합니다.',
    ] : [
      ...(project.canonHud?['기존 루프·분기를 보존하는 스탯 HUD는 Nexus 1.23.0 · 단청 확장 1.3.0 이상에서 실행합니다.']:[]),
      ...(project.canonDesign?['지음 1.2 정사 패키지는 Nexus 1.19.0 · 단청 확장 1.1.0 이상에서 실행합니다.']:[]),
      '발생조건 자동 선택에는 Nexus 1.13.1의 단청 확장 1.0.0이 필요합니다.',
      '발생조건은 공개된 상태로 판정합니다. 선택 가능한 후속 사건이 없거나 판정할 수 없으면 예정된 다음 사건에서 조건에 도달하는 과정을 서술합니다. 조건 충족이나 사건 완료를 미리 확정하지 않습니다.',
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
