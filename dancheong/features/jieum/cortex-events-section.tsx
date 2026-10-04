"use client";
import { useState } from "react";
import { Area, Field, Panel, Select, Toggle } from "./studio-sections";
import { blankStoryEvent, uid, type Project, type StoryEvent } from "./studio-model";
import { eventDesign, followingEvents, type CortexEventDesign } from "./cortex-event-design";

export function CortexEventsEditor({ project, setProject, notify }: { project: Project; setProject: React.Dispatch<React.SetStateAction<Project>>; notify: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState("");
  const event = project.events.find((e) => e.id === selectedId) || project.events[0];
  const update = (patch: Partial<StoryEvent>) => setProject((p) => ({ ...p, events: p.events.map((e) => e.id === event.id ? { ...e, ...patch } : e) }));
  const d = event ? eventDesign(event) : null;
  const design = (patch: Partial<CortexEventDesign>) => { if (d) update({ cortexDesign: { ...d, ...patch } }); };
  const add = (kind: StoryEvent["kind"]) => {
    const e = { ...blankStoryEvent(project.events.length + 1), id: uid("EVENT"), kind, required: kind !== "constraint", name: kind === "constraint" ? "새 장면 제약" : "새 사건" };
    e.cortexDesign = eventDesign(e);
    setProject((p) => ({ ...p, events: [...p.events, e] })); setSelectedId(e.id);
  };
  const move = (direction: number) => {
    if (event) setSelectedId(event.id);
    setProject((p) => {
      const index = p.events.findIndex((e) => e.id === event?.id), target = index + direction;
      if (index < 0 || target < 0 || target >= p.events.length) return p;
      const events = [...p.events]; [events[index], events[target]] = [events[target], events[index]];
      return { ...p, events };
    });
  };
  const next = event ? followingEvents(project, event) : [];
  return <div className="cortex-event-editor">
    <div className="cortex-event-toolbar"><button className="primary-button" onClick={() => add("event")}>+ 사건</button><button className="soft-button" onClick={() => add("constraint")}>+ 장면 제약</button><span>기본 3비트 · 조기 종결 2비트부터 · 연장 최대 2비트</span></div>
    <p>지정한 후속사건이 우선입니다. 미지정이면 목록의 다음 사건으로 진행하며 마지막 사건에서 끝납니다. 시간 경과는 현재 사건의 서사를 따릅니다.</p>
    <Select label="편집할 사건" value={event?.id || ""} onChange={setSelectedId} options={project.events.map((e, i) => ({ value: e.id, label: `${i + 1}. ${e.name}${e.kind === "constraint" ? " · 제약" : ""}` }))} />
    {event && d ? <Panel title={event.name} actions={<div className="page-actions"><button className="soft-button" disabled={project.events[0]?.id === event.id} onClick={() => move(-1)}>위로</button><button className="soft-button" disabled={project.events.at(-1)?.id === event.id} onClick={() => move(1)}>아래로</button><button className="icon-danger" onClick={() => {
      if (!confirm(`‘${event.name}’을 삭제할까요? 연결된 후속사건은 자동 선택으로 바뀝니다.`)) return;
      setProject((p) => ({ ...p, events: p.events.filter((e) => e.id !== event.id).map((e) => ({ ...e, nextEventId: e.nextEventId === event.id ? "" : e.nextEventId, appliesTo: e.appliesTo.filter((id) => id !== event.id) })) }));
    }}>삭제</button></div>}>
      {event.kind !== "constraint" && <div className="trigger-options cortex-event-toggles">
        <Toggle checked={event.required} onChange={(required) => update({ required })} label="필수사건" />
        <Toggle checked={d.otherViewpoint} onChange={(otherViewpoint) => design({ otherViewpoint })} label="주인공 이외 인물 시점" />
        <Toggle checked={d.occurrenceEnabled} onChange={(occurrenceEnabled) => design({ occurrenceEnabled })} label="발생조건" />
      </div>}
      <div className="field-row"><Field label="이름" value={event.name} onChange={(name) => update({ name })} /><Select label="종류" value={event.kind} onChange={(kind) => update({ kind: kind as StoryEvent["kind"], required: kind === "constraint" ? false : event.required })} options={[{ value: "event", label: "일반 사건" }, { value: "compound", label: "복합 사건 · 시점 교차" }, { value: "constraint", label: "장면 제약" }]} /></div>
      {event.kind === "constraint" ? <><Area label="항상 지킬 장면 제약" value={event.rules.join("\n")} onChange={(value) => update({ rules: value.split("\n") })} /><label className="field-label"><span>적용 사건 · 미선택 시 전체</span><select multiple value={event.appliesTo} onChange={(e) => update({ appliesTo: Array.from(e.target.selectedOptions, (o) => o.value) })}>{project.events.filter((e) => e.kind !== "constraint").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></> : <>
        {d.otherViewpoint && <Field label="시점 인물·연출 의도" value={d.viewpoint} onChange={(viewpoint) => design({ viewpoint })} placeholder="시점 전환은 주인공의 이동·정보 습득과 별개입니다." />}
        {d.occurrenceEnabled && <Area label="이 사건을 선택할 발생조건" value={d.occurrence} onChange={(occurrence) => design({ occurrence })} placeholder="이 사건이 선택될 조건을 작성하세요. 시간표로 후보를 묶지 않습니다." />}
        <Area label="사건 내용" value={event.description} onChange={(description) => update({ description })} />
        <div className="field-row"><Field label="사건 무대" value={event.canonLocation} onChange={(canonLocation) => update({ canonLocation })} /><Field label="등장인물" value={event.participants} onChange={(participants) => update({ participants })} /></div>
        <details><summary>공개 범위·보호어</summary><Select label="사건 정보 공개 범위" value={event.visibility} onChange={(visibility) => update({ visibility: visibility as StoryEvent["visibility"] })} options={[{ value: "Public", label: "공개 설정" }, { value: "Hidden", label: "작가 비공개 설정" }]} /><Area label="이 사건 전까지 보호할 표현 · 한 줄에 하나" value={event.revealTerms.join("\n")} onChange={(text) => update({ revealTerms: text.split("\n").map((s) => s.trim()).filter(Boolean) })} /></details>
        {<div className="cortex-closure-box"><h3>{event.required ? "종결조건" : "이 사건이 선택된 뒤의 종결조건"}</h3><p>한 칸에 한 조건씩 작성하세요. 필수 조건 전체를 평가하되 작가가 허용한 대체 종결은 인정합니다.</p>
          {d.closureConditions.map((row, index) => {
            const patchRow = (patch: Partial<typeof row>) => design({ closureConditions: d.closureConditions.map((r, i) => i === index ? { ...r, ...patch } : r) });
            const reviewed = row.review && row.review.original === row.text && row.review.decision !== "pending";
            return <section className="cortex-condition-row" key={row.id}><div className="cortex-event-toolbar"><b>조건 {index + 1}</b><button className="soft-button" onClick={() => design({ closureConditions: d.closureConditions.filter((_, i) => i !== index) })}>조건 삭제</button></div><Area label={`종결조건 ${index + 1} · 현재 사건에서 도달할 결과`} value={row.text} onChange={(text) => patchRow({ text })} placeholder="독자가 확인해야 할 결과를 자연어로 적으세요. 정서·암시·관계도 가능합니다." />
              {!reviewed ? <details className="cortex-author-review"><summary>조건 문맥 검토 · 필요할 때 펼치기</summary><p>다음 사건의 행동이 불필요한 앞조건인지 검토하세요. 순서 자체가 필수이면 유지합니다. 먼 과거 사실은 현재 장면에서 확인·회상할지 검토하세요. 이 안내는 오류 판정이 아닙니다.</p>
                <button className="soft-button" onClick={() => void navigator.clipboard.writeText(JSON.stringify({ task: "현재 종결조건에 다음 사건 내용을 불필요한 앞조건으로 붙였을 때만 제거안을 제안하라. 진짜 필수 순서는 유지한다. 복합 의도·수량·금지·허용 대체 경로와 후속 전제 충돌을 검토하라. 원문과 수정안·이유를 따로 제시하라.", condition: row.text, event, next: next.slice(0, 2) }, null, 2)).then(() => notify("문맥 검토 요청을 복사했습니다.")).catch(() => notify("클립보드를 사용할 수 없습니다."))}>문맥 검토 요청 복사</button>
                <div className="form-grid two-col"><Area label="수정 전 원문" value={row.text} onChange={(text) => patchRow({ text })} /><Area label="수정안 · 제안 붙여넣기" value={row.review?.proposal || ""} onChange={(proposal) => patchRow({ review: { original: row.text, proposal, decision: "pending" } })} /></div>
                <div className="cortex-event-toolbar"><button className="soft-button" onClick={() => patchRow({ review: { original: row.text, proposal: row.review?.proposal || "", decision: "keep" } })}>원문 유지</button><button className="primary-button" disabled={!row.review?.proposal.trim()} onClick={() => { const proposal = row.review?.proposal || ""; patchRow({ text: proposal, review: { original: proposal, proposal: row.text, decision: "applied" } }); }}>수정안 적용</button></div>
              </details> : <details><summary>검토 완료 · {row.review?.decision === "keep" ? "원문 유지" : "수정 적용"}</summary>{row.review?.decision === "applied" && <pre>{row.review.proposal}</pre>}<button className="soft-button" onClick={() => patchRow({ review: { original: row.text, proposal: "", decision: "pending" } })}>다시 검토</button></details>}
            </section>;
          })}
          <button className="primary-button" onClick={() => design({ closureConditions: [...d.closureConditions, { id: uid("CONDITION"), text: "" }] })}>+ 종결조건 추가</button>
          <Area label="선택·수량과 적용 범위" value={d.selectionScope} onChange={(selectionScope) => design({ selectionScope })} placeholder="필요할 때만: 후보 중 몇 종류인지, 사건 전체인지, 반복을 세는지 등" />
        </div>}
        <Area label="장면 제약 · 금지사항" value={d.constraints} onChange={(constraints) => design({ constraints })} placeholder="위반된 사실을 없던 일로 만들지 않고 공개된 결과에서 수습합니다." />
        <div className="form-grid two-col"><Area label={event.required ? "종결조건 달성 시 마무리" : "사건 마무리"} value={d.success} onChange={(success) => design({ success })} />{event.required && <Area label="종결조건 미충족 시 전개" value={d.unmet} onChange={(unmet) => design({ unmet })} placeholder="허용할 대체 종결을 쓰세요. 이것으로도 수습 불가능할 때만 미해결 의무를 이월합니다." />}</div>
        <Select label="후속사건" value={event.nextEventId} onChange={(nextEventId) => update({ nextEventId })} options={[{ value: "", label: next[0] ? `목록 순서 · ${next[0].name}` : "자동 · 마지막 사건" }, ...project.events.filter((candidate) => candidate.kind !== "constraint" && candidate.id !== event.id).map((e) => ({ value: e.id, label: e.name }))]} />
        <Area label="후속 연결의 작가 메모" value={event.followUp} onChange={(followUp) => update({ followUp })} />
        <details><summary>비트별 연출 참고 · 비워도 엔진이 배정</summary>{event.beats.map((beat, index) => <div key={index}><Field label={`참고 ${index + 1} 시점`} value={beat.viewpoint} onChange={(viewpoint) => update({ beats: event.beats.map((b, i) => i === index ? { ...b, viewpoint } : b) })} /><Area label="연출 의도" value={beat.content} onChange={(content) => update({ beats: event.beats.map((b, i) => i === index ? { ...b, content } : b) })} /></div>)}<button className="soft-button" onClick={() => update({ beats: [...event.beats, { id: uid("BEAT"), viewpoint: "", content: "" }] })}>연출 참고 추가</button></details>
        <details><summary>기존 편집 원문 · 호환 보관</summary><p>구형 필드는 보관되며 Cortex 실행에는 위 편집 내용을 사용합니다. 개입 불가 여부를 다른 인물 시점으로 자동 해석하지 않습니다.</p><pre>{JSON.stringify({ conditions: event.conditions, cancelConditions: event.cancelConditions, failureConditions: event.failureConditions, effects: event.effects, onSuccess: event.onSuccess, onFailure: event.onFailure, completionSignals: event.completionSignals, requiredFunctions: event.requiredFunctions, requiredItems: event.requiredItems, requiredDialogue: event.requiredDialogue, recoveryAlternatives: event.recoveryAlternatives, playerCanIntervene: event.playerCanIntervene }, null, 2)}</pre></details>
      </>}
    </Panel> : <p>첫 사건을 추가해 작품의 진행을 설계하세요.</p>}
  </div>;
}
