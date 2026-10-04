import type { Project } from "./studio-model";
import { normalizeProtectedTerms } from "./disclosure-contract";
import { cortexCompatibility } from './cortex-engine-contract';

export function cortexExportReview(project: Project) {
  const isCortex = project.packageTarget === "cortex";
  const isInstant = project.runtimeMode === "instant_story";
  const compatibility = cortexCompatibility(project);
  return {
    compatibility,
    globalTerms: normalizeProtectedTerms(project.disclosure?.protectedTerms),
    eventTerms: isInstant ? [] : project.events.filter((e) => e.kind !== "constraint" && e.revealTerms.length).map((e) => ({ id: e.id, name: e.name, terms: e.revealTerms })),
    emptyProtectedTerms: isCortex && !isInstant && !normalizeProtectedTerms(project.disclosure?.protectedTerms).length,
    unsupportedEventPolicy: isCortex && compatibility.limitations.length > 0,
  };
}

export type CortexExportAcknowledgements = { acknowledgeEmptyProtection?: boolean; acknowledgeUnsupportedPolicy?: boolean };
export function assertCortexExportReviewed(project: Project, options: CortexExportAcknowledgements) {
  const review = cortexExportReview(project);
  if (review.emptyProtectedTerms && !options.acknowledgeEmptyProtection) throw new Error("전역 보호어가 0개입니다. 감독실에서 목록을 작성하거나 보호어 없이 내보내기를 확인하세요.");
  if (review.unsupportedEventPolicy && !options.acknowledgeUnsupportedPolicy) throw new Error(review.compatibility.limitations.map(item => item.message).join('\n'));
}
