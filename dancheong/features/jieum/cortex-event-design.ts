import { withoutEventSchedule, narrativeTimeGuidance } from "./event-schedule-retirement";
import { retireLocationGraph, omitRetiredLocationFields } from "./location-retirement";
import type { Project, StoryEvent } from "./studio-model";
import { cortexRoutes } from './cortex-engine-contract';

export type ClosureCondition = { id: string; text: string; review?: { original: string; proposal: string; decision: "pending" | "keep" | "applied" } };
export type CortexEventDesign = {
  closureConditions: ClosureCondition[];
  schema: "STUDIO_EVENT_DESIGN_V2";
  occurrenceEnabled: boolean;
  otherViewpoint: boolean;
  viewpoint: string;
  occurrence: string;
  closure: string;
  selectionScope: string;
  constraints: string;
  success: string;
  unmet: string;
  review?: { original: string; proposal: string; decision: "pending" | "keep" | "applied" };
};
const uniqueText = (rows: string[]) => [...new Set(rows.map((row) => row.trim()).filter(Boolean))].join("\n\n");

/** Migration keeps every old field on the editor object; this is a separate editable projection. */
export function eventDesign(event: StoryEvent): CortexEventDesign {
  const defaults: CortexEventDesign = {
    closureConditions: [],
    schema: "STUDIO_EVENT_DESIGN_V2", occurrenceEnabled: Boolean(event.conditions?.trim()),
    otherViewpoint: false, viewpoint: "", occurrence: event.conditions || "",
    closure: uniqueText([
      ...(event.requiredFunctions || []).filter((r) => r.type !== "NEGATIVE_CONSTRAINT").map((r) => uniqueText([r.description, r.alternatives.length ? `허용된 대안: ${r.alternatives.join(" / ")}` : ""])),
      event.completionSignals || "", event.requiredItems ? `필수 소품: ${event.requiredItems}` : "",
      event.requiredDialogue ? `고정 대사${event.requiredSpeakerId ? ` (화자 ${event.requiredSpeakerId})` : ""}: ${event.requiredDialogue}` : "",
    ]),
    selectionScope: "",
    constraints: uniqueText((event.requiredFunctions || []).filter((r) => r.type === "NEGATIVE_CONSTRAINT").map((r) => r.description)),
    success: uniqueText([event.effects || "", event.onSuccess || ""]),
    unmet: uniqueText([event.onFailure || "", event.cancelConditions ? `기존 취소 경로: ${event.cancelConditions}` : "", event.failureConditions ? `기존 실패 조건: ${event.failureConditions}` : "", event.recoveryAlternatives ? `기존 수습 대안: ${event.recoveryAlternatives}` : ""]),
  };
  const migratedRows = [
    ...(event.requiredFunctions || []).filter((r) => r.type !== "NEGATIVE_CONSTRAINT").map((r) => ({ id: r.id, text: uniqueText([r.description, r.alternatives.length ? `허용된 대안: ${r.alternatives.join(" / ")}` : ""]) })),
    ...(event.completionSignals || "").split("|").filter((text) => text.trim()).map((text, i) => ({ id: `${event.id}-signal-${i+1}`, text })),
    ...(event.requiredItems ? [{ id: `${event.id}-items`, text: `필수 소품: ${event.requiredItems}` }] : []),
    ...(event.requiredDialogue ? [{ id: `${event.id}-dialogue`, text: `고정 대사${event.requiredSpeakerId ? ` (화자 ${event.requiredSpeakerId})` : ""}: ${event.requiredDialogue}` }] : []),
  ];
  const rows = event.cortexDesign?.closureConditions ?? (event.cortexDesign?.closure ? [{ id: `${event.id}-closure`, text: event.cortexDesign.closure }] : migratedRows.length ? migratedRows : [{ id: `${event.id}-closure-1`, text: "" }]);
  return { ...defaults, ...event.cortexDesign, closureConditions: rows, closure: rows.map((r) => r.text).join("\n\n"), schema: "STUDIO_EVENT_DESIGN_V2" };
}

/** Stable authoring order; calendar time and expected loop count never sort events. */
export function orderedEvents(project: Project) {
  return project.events.filter((e) => e.kind !== "constraint");
}
export function followingEvents(project: Project, event: StoryEvent) {
  const events = orderedEvents(project);
  return events.slice(events.findIndex((e) => e.id === event.id) + 1);
}

export const cortexAuthoringGuidance = [
  "최종 공개된 산문이 정사다. 사용자 요청은 확정 사실이 아니며 세계와 인과 안에서 수용·우회·제한한다.",
  "현재 사건 목표를 기본 비트부터 자연스럽게 진행한다. 기본 3비트, 최소 2비트부터 조기 종결, 연장 최대 2비트. 미충족 지적은 연장 구간에서 검토한다.",
  "원본이 허용한 미충족 전개로 수습되면 대체 종결로 전환한다. 수습되지 않은 의무만 최후 안전장치로 다음 사건 첫 문단에 이월한다. 포기·대체된 목표를 다시 강제하지 않는다.",
  narrativeTimeGuidance,
  "작가는 현재 사건·이전 두 사건 원문과 오래된 요약을 읽고, 판정관은 현재·이전 두 사건의 공개 원문만 읽는다. 계약은 달성 기준이지 사실의 증거가 아니다.",
  "첫 문단은 장면을 여는 자연스러운 산문으로 쓴다. 상태표·추천답변·선택지·내부 판정 기록을 산문 출력에 강제하지 않는다. 모델 배정과 호출 횟수는 엔진이 관리한다.",
].join("\n");

export function compileCortexEvent(event: StoryEvent, nextId = "") {
  const d = eventDesign(event);
  const { review: _editorReview, closureConditions, ...runtimeDesign } = d;
  const { priority, playerCanIntervene, preservePlayerChoice, endSceneAfterCompletion, recoveryAlternatives, cortexDesign, compiledEventIR, ...source } = event as StoryEvent & { compiledEventIR?: unknown };
  void priority; void playerCanIntervene; void preservePlayerChoice; void endSceneAfterCompletion; void recoveryAlternatives; void cortexDesign; void compiledEventIR;
  const contract = uniqueText([event.description, event.followUp ? `후속 연결 참고 (현재 사건 종결의 선행 의무가 아님): ${event.followUp}` : "",
    d.otherViewpoint ? `주인공 이외 인물 시점${d.viewpoint ? `: ${d.viewpoint}` : ""}. 시점 전환을 주인공의 이동이나 정보 습득으로 간주하지 않는다.` : "",
    d.selectionScope ? `선택·수량과 적용 범위: ${d.selectionScope}` : "",
    d.constraints ? `장면 제약: ${d.constraints}` : "",
  ]);
  return { ...omitRetiredLocationFields(withoutEventSchedule(source as StoryEvent)), recoveryAlternatives: undefined, title: event.name, summary: contract, description: contract,
    cortexDesign: { ...runtimeDesign, occurrence: d.occurrenceEnabled ? d.occurrence : '', closureConditions: closureConditions.map(({ id, text }) => ({ id, text })) },
    conditions: d.occurrenceEnabled ? d.occurrence : "", cancelConditions: "", failureConditions: "",
    effects: "", onSuccess: d.success,
    onFailure: d.unmet ? `종결조건 미충족 시 허용된 대체 종결: ${d.unmet}\n이 전개로 수습되면 사건을 전환하며 생략·포기·대체한 목표를 다시 강제하지 않는다. 이 전개로도 수습되지 않은 의무만 다음 사건으로 이월한다.` : "",
    completionSignals: "", requiredItems: "", requiredDialogue: "", requiredSpeakerId: "",
    requiredFunctions: [...d.closureConditions.filter((row) => row.text.trim()).map((row) => ({ id: row.id, description: uniqueText([row.text, d.selectionScope]), type: "READER_UNDERSTANDING", required: true, alternatives: [] })), ...(d.constraints ? [{id:`${event.id}-constraints`,description:d.constraints,type:'NEGATIVE_CONSTRAINT',required:false,alternatives:[]}] : [])],
    policyConstraints: d.constraints ? [{ id: `${event.id}-constraints`, description: d.constraints, type: "NEGATIVE_CONSTRAINT", required: false }] : [],
    nextEventId: event.nextEventId || nextId || undefined,
    beats: event.beats.map((beat) => ({ ...beat, goal: beat.content })),
    eventPolicy: { schema: "CORTEX_STUDIO_EVENT_POLICY_V2", occurrenceEnabled: d.occurrenceEnabled, occurrence: d.occurrenceEnabled ? d.occurrence : "", otherViewpoint: d.otherViewpoint, viewpoint: d.viewpoint, required: event.required, mainBeats: 3, earlyClosureMinBeats: 2, extensionBeats: 2, unmetOutcome: "TRANSITION", carryover: "ONLY_IF_AUTHORED_RECOVERY_UNRESOLVED", selection: "EXPLICIT_NEXT_THEN_ARRAY_ORDER", priority: "DISABLED" },
  };
}

export function migrateCortexProject(project: Project): Project {
  return retireLocationGraph({ ...project, packageTarget: "cortex", events: project.events.map((event) => ({ ...event, cortexDesign: eventDesign(event) })) });
}

/** One runtime projection for ZIP, project.json and public/private import views. */
export function compileCortexEvents(project: Project) {
  const events = orderedEvents(project);
  const routes = project.package15.enabled ? cortexRoutes(project) : [];
  const terminals = new Set(project.package15.branchEnding.enabled ? project.package15.endings.filter(e => (e.exclusiveGroupId || 'primary') === project.package15.branchEnding.primaryEndingGroupId).map(e => e.terminalEventId) : []);
  return events.map((event,index) => {
    const memberships = routes.filter(route => route.eventIds.includes(event.id));
    const ownRoute = routes.find(route => route.id === event.multiroute?.routeId) || (memberships.length === 1 ? memberships[0] : undefined);
    const ids = ownRoute ? ownRoute.eventIds : events.map(e => e.id);
    const next = terminals.has(event.id) ? '' : event.nextEventId || ids[ids.indexOf(event.id)+1] || '';
    const constraints = project.events.filter(e => e.kind === 'constraint' && (!e.appliesTo.length || e.appliesTo.includes(event.id))).flatMap(e => e.rules.filter(rule => rule.trim()).map((rule,i) => ({id:`${e.id}-rule-${i+1}`,description:rule,type:'NEGATIVE_CONSTRAINT',required:false})));
    const design = eventDesign(event);
    const compiled = compileCortexEvent({...event,nextEventId:next,cortexDesign:{...design,constraints:uniqueText([design.constraints,...constraints.map(c => c.description)])}},next);
    return {...compiled,sequence:index+1,nextEventId:next || undefined,policyConstraints:[...compiled.policyConstraints,...constraints]};
  });
}
