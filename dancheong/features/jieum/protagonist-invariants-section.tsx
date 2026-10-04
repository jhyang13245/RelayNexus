"use client";

import { AlertTriangle, CircleHelp, LockKeyhole, Plus, RotateCcw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import type { Project, ProtagonistInvariant } from "./studio-model";
import { blankProtagonistInvariant, defaultProtagonistInvariants, invariantRefFromLabel } from "./studio-model";
import { Area, Field, PageFrame, Select } from "./studio-sections";

type Setter = React.Dispatch<React.SetStateAction<Project>>;

const uniqueInvariantRef = (project: Project, label: string, index: number) => {
  const base = invariantRefFromLabel(label, index);
  const used = new Set(project.protagonistInvariants.filter((_, itemIndex) => itemIndex !== index).map((item) => item.ref));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export function ProtagonistInvariantsSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const characters = [project.player, ...project.npcs];
  const update = (index: number, patch: Partial<ProtagonistInvariant>) => setProject((current) => ({
    ...current,
    protagonistInvariants: current.protagonistInvariants.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }));
  const updateLabel = (index: number, label: string) => {
    const item = project.protagonistInvariants[index];
    update(index, { label, ref: item.ref || (label.trim() ? uniqueInvariantRef(project, label, index) : "") });
  };
  const addInvariant = () => setProject((current) => ({
    ...current,
    protagonistInvariants: [...current.protagonistInvariants, blankProtagonistInvariant(current.protagonistInvariants.length, current.player.id)],
  }));
  const restoreDefaults = () => {
    if (project.protagonistInvariants.length && !confirm("현재 불변식 목록을 Cortex 권장 기본값 4개로 교체할까요?")) return;
    setProject((current) => ({ ...current, protagonistInvariants: defaultProtagonistInvariants().map((item) => ({ ...item, characterId: current.player.id })) }));
  };
  const overLimit = characters.filter((character) => project.protagonistInvariants.filter((item) => (item.characterId || project.player.id) === character.id).length > 5);

  return <PageFrame eyebrow="CORTEX CHARACTER CONTRACT" title="캐릭터가 끝까지 유지해야 할 선을 정하세요" description="추가한 캐릭터 가운데 대상을 고르고, 그 인물에게 확정되어서는 안 될 결과를 선언합니다. HARD는 절대선, SOFT는 대가를 쓰되 회복 가능한 수습선입니다."
    actions={<div className="page-actions"><button type="button" className="soft-button" onClick={restoreDefaults}><RotateCcw size={15} /> 기본값 복원</button><button type="button" className="primary-button" onClick={addInvariant}><Plus size={15} /> 불변식 추가</button></div>}>
    <section className="invariant-guide">
      <article><ShieldAlert size={22} /><div><span>HARD · 절대선</span><b>그 캐릭터에게 확정할 수 없는 결과</b><p>주인공의 사망처럼 정말 작품을 멈추게 하거나, 특정 인물의 역할을 완전히 파괴하는 결과에만 사용합니다.</p></div></article>
      <article><ShieldCheck size={22} /><div><span>SOFT · 수습선</span><b>사건을 통해 회복할 수 있는 손상</b><p>진행을 막는 비가역 확정을 피하고, 필요하면 다음 장면에서 해당 캐릭터를 위한 수습 의무를 만듭니다.</p></div></article>
    </section>
    {overLimit.length > 0 && <div className="invariant-count-warning"><AlertTriangle size={17} /><span><b>{overLimit.map((character) => character.name).join(", ")}</b> · 인물별 권장 범위는 최대 5개입니다. 항목이 많으면 작가 계약이 길어져 본문 품질에 영향을 줄 수 있습니다.</span></div>}
    <div className="invariant-list">
      {project.protagonistInvariants.map((item, index) => <article className={`invariant-card severity-${item.severity.toLowerCase()}`} key={`${item.ref || "new"}-${index}`}>
        <header><div className="invariant-order">{String(index + 1).padStart(2, "0")}</div><div><span>{item.severity === "HARD" ? "ABSOLUTE WALL" : "RECOVERABLE GUARD"}</span><h2>{item.label || "새 캐릭터 불변식"}</h2></div><button type="button" className="icon-danger" aria-label={`${item.label || `${index + 1}번째 불변식`} 삭제`} onClick={() => setProject((current) => ({ ...current, protagonistInvariants: current.protagonistInvariants.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={16} /></button></header>
        <div className="invariant-card-body">
          <Select label="적용 캐릭터" value={item.characterId || project.player.id} onChange={(characterId) => update(index, { characterId })} options={characters.map((character) => ({ value: character.id, label: `${character.isPlayer ? "주인공 · " : ""}${character.name || character.id}` }))} />
          <div className="field-row"><Field label="짧은 이름" required value={item.label} onChange={(label) => updateLabel(index, label)} placeholder="예: 보행·자립 이동 능력" /><label className="field-label invariant-ref"><span><LockKeyhole size={11} /> 고정 ref</span><input readOnly value={item.ref} placeholder="이름을 입력하면 자동 발급됩니다" /></label></div>
          <div className="severity-picker" role="radiogroup" aria-label={`${item.label || "불변식"} 심각도`}>
            <button type="button" className={item.severity === "HARD" ? "active hard" : "hard"} aria-pressed={item.severity === "HARD"} onClick={() => update(index, { severity: "HARD" })}><ShieldAlert size={17} /><span><b>HARD</b><small>정말 이야기가 끝나는 것만</small></span></button>
            <button type="button" className={item.severity === "SOFT" ? "active soft" : "soft"} aria-pressed={item.severity === "SOFT"} onClick={() => update(index, { severity: "SOFT" })}><ShieldCheck size={17} /><span><b>SOFT</b><small>후속 사건으로 수습 가능</small></span></button>
          </div>
          <Area label="필요한 이유와 판정 근거" value={item.description} onChange={(description) => update(index, { description })} placeholder="이 능력이 어느 장에서 왜 필요한지 적어 주세요. 판정 근거로 쓰입니다." />
        </div>
      </article>)}
      {!project.protagonistInvariants.length && <div className="invariant-empty"><CircleHelp size={28} /><b>선언된 불변식이 없습니다</b><span>Cortex의 전개 보호는 비활성 상태입니다. 기본값을 복원하거나 작품에 꼭 필요한 항목만 추가하세요.</span><button type="button" className="primary-button" onClick={restoreDefaults}><ShieldCheck size={15} /> 권장 기본값 4개 적용</button></div>}
    </div>
    <div className="invariant-scope-note"><CircleHelp size={16} /><p><b>불변식은 선택한 캐릭터의 물리적·정신적 가용성만 다룹니다.</b><span>특정 장면의 줄거리 요구는 이야기 설정에, 성격과 태도는 캐릭터 설정에 작성하세요.</span></p></div>
  </PageFrame>;
}
