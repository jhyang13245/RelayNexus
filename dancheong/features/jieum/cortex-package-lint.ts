import { normalizeProtectedTerms } from "./disclosure-contract";
import { eventDesign, orderedEvents } from "./cortex-event-design";
import { validateBranchEndingContract } from "./branch-ending-contract";
import type { Project } from "./studio-model";
import { CORTEX_TARGET_VERSION, cortexCompatibility, cortexRoutes } from './cortex-engine-contract';

export type CortexPackageLintLevel = "ERROR" | "WARN" | "INFO";
export type CortexPackageLintFinding = {
  level: CortexPackageLintLevel;
  code: string;
  message: string;
  where?: string;
};
export type CortexPackageLintReport = {
  schema: "CORTEX_PACKAGE_LINT_V4";
  targetEngine: "dancheong-cortex";
  minimumTargetVersion: typeof CORTEX_TARGET_VERSION;
  events: number;
  locations: number;
  errors: number;
  warnings: number;
  infos: number;
  findings: CortexPackageLintFinding[];
};

export function lintCortexPackage(project: Project): CortexPackageLintReport {
  const findings: CortexPackageLintFinding[] = [];
  const report = (
    level: CortexPackageLintLevel,
    code: string,
    message: string,
    where = "",
  ) => findings.push({ level, code, message, where });
  const events = orderedEvents(project);
  if (!normalizeProtectedTerms(project.disclosure.protectedTerms).length)
    report(
      "WARN",
      "PROTECTED_TERMS_EMPTY",
      "전역 보호어가 0개입니다. 감독실에서 목록을 확인하세요. 사건별 공개어와 GM 비밀은 전역 보호어를 대신하지 않습니다.",
    );
  const ids = new Set<string>();
  for (const event of project.events) {
    if (!event.id.trim() || ids.has(event.id))
      report(
        "ERROR",
        "EVENT_ID_INVALID",
        "사건 식별자는 비어 있거나 중복될 수 없습니다.",
        event.id,
      );
    ids.add(event.id);
  }
  for (const event of project.events) {
    for (const ref of event.appliesTo)
      if (!ids.has(ref))
        report(
          "ERROR",
          "FIELD_EVENT_DANGLING",
          "제약의 대상 사건이 없습니다.",
          event.id,
        );
    if (event.kind === "constraint") continue;
    if (event.nextEventId === event.id)
      report(
        "ERROR",
        "EVENT_SELF_LINK",
        "자기 자신을 후속사건으로 선택할 수 없습니다.",
        event.id,
      );
    if (event.nextEventId && !ids.has(event.nextEventId))
      report(
        "ERROR",
        "FIELD_EVENT_DANGLING",
        "후속사건 참조가 없습니다.",
        event.id,
      );
    const d = eventDesign(event);
    if (d.occurrenceEnabled && !d.occurrence.trim())
      report(
        "ERROR",
        "OCCURRENCE_EMPTY",
        "발생조건을 입력하거나 토글을 끄세요.",
        event.id,
      );
    if (event.required) {
      if (!d.closureConditions.length || !d.closure.trim())
        report(
          "WARN",
          "CLOSURE_MISSING",
          "필수사건의 종결조건을 작성하세요.",
          event.id,
        );
      const conditionIds = new Set<string>();
      for (const row of d.closureConditions) {
        if (!row.id || conditionIds.has(row.id))
          report(
            "ERROR",
            "CONDITION_ID_INVALID",
            "종결조건 식별자가 비어 있거나 중복됩니다.",
            event.id,
          );
        conditionIds.add(row.id);
        if (!row.text.trim())
          report(
            "WARN",
            "CONDITION_EMPTY",
            "비어 있는 종결조건은 실행용 패키지에서 제외됩니다.",
            event.id,
          );
      }
    }
  }
  for (const limitation of cortexCompatibility(project).limitations) report('WARN',limitation.code,limitation.message);
  if (project.package15.enabled) {
    const routeIds = new Set<string>();
    for (const route of cortexRoutes(project)) {
      if (!route.id.trim() || routeIds.has(route.id)) report('ERROR','CORTEX_ROUTE_ID_INVALID','루트 ID가 비어 있거나 중복됩니다.',route.id);
      routeIds.add(route.id);
      if (!route.eventIds.length) report('ERROR','CORTEX_ROUTE_EMPTY','이 루트에 연결된 사건이 없습니다.',route.id);
    }
  }
  for (const finding of validateBranchEndingContract(project))
    report(finding.level, finding.code, finding.message, finding.where);
  if (project.package15.branchEnding.enabled)
    report(
      "INFO",
      "BRANCH_ENGINE_CONTRACT_VERIFIED",
      "Cortex 1.42.0의 공개 본문 선택 기록·조건별 분기·미평가 대체 경로·배타 엔딩 계약을 검사합니다.",
    );
  return {
    schema: "CORTEX_PACKAGE_LINT_V4",
    targetEngine: "dancheong-cortex",
    minimumTargetVersion: CORTEX_TARGET_VERSION,
    events: events.length,
    locations: 0,
    errors: findings.filter((f) => f.level === "ERROR").length,
    warnings: findings.filter((f) => f.level === "WARN").length,
    infos: findings.filter((f) => f.level === "INFO").length,
    findings,
  };
}
