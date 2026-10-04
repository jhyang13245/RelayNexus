"use client";

import { useMemo, useState } from "react";
import {
  Activity, BrainCircuit, CheckCircle2, Clock3, Eye, EyeOff, Footprints,
  GitBranch, History, Landmark, Lock, MapPin, Plus, Radio, ShieldCheck,
  Sparkles, Target, Trash2, UserRound, Zap,
} from "lucide-react";
import type {
  AutonomyActor, AutonomySettings, Project, RelationshipMemory,
  RelationshipMemoryEffect, RelationshipMemorySettings,
} from "./studio-model";
import { blankAutonomyActor, blankRelationshipMemory } from "./studio-model";
import { Area, Field, PageFrame, Panel, Select, Tabs, Toggle } from "./studio-sections";

type Setter = React.Dispatch<React.SetStateAction<Project>>;
type Tab = "actors" | "memories" | "rules";

const tierOptions = [
  { value: "nearby", label: "근거리 · 매 턴 후보" },
  { value: "regional", label: "지역권 · 간헐 후보" },
  { value: "distant", label: "원거리 · 큰 변화만" },
  { value: "event_only", label: "사건 조건일 때만" },
];
const cadenceOptions = [
  { value: "every_turn", label: "매 턴 평가" },
  { value: "every_2_turns", label: "2턴마다" },
  { value: "every_3_to_5_turns", label: "3~5턴마다" },
  { value: "on_trigger", label: "조건 충족 시만" },
];
const memoryTypes: { value: RelationshipMemory["type"]; label: string }[] = [
  { value: "promise_kept", label: "지킨 약속" },
  { value: "promise_broken", label: "깨진 약속" },
  { value: "rescue", label: "구조·보호" },
  { value: "betrayal", label: "배신" },
  { value: "debt", label: "빚·은혜" },
  { value: "secret_shared", label: "공유한 비밀" },
  { value: "humiliation", label: "모욕·상처" },
  { value: "shared_success", label: "함께한 성공" },
  { value: "shared_failure", label: "함께한 실패" },
  { value: "custom", label: "사용자 지정" },
];
const scoreKeys: (keyof RelationshipMemoryEffect)[] = ["trust", "favor", "fear", "respect", "suspicion", "hostility", "dependency"];
const scoreLabels: Record<keyof RelationshipMemoryEffect, string> = { trust: "신뢰", favor: "호감", fear: "공포", respect: "존경", suspicion: "의심", hostility: "적대", dependency: "의존" };
const clamp = (value: number) => Math.max(-100, Math.min(100, value));

function actorName(project: Project, actor: AutonomyActor) {
  return actor.entityType === "character"
    ? project.npcs.find((character) => character.id === actor.entityId)?.name ?? "연결 끊긴 NPC"
    : project.factions.find((faction) => faction.id === actor.entityId)?.name ?? "연결 끊긴 세력";
}

function characterName(project: Project, id: string) {
  return [project.player, ...project.npcs].find((character) => character.id === id)?.name ?? "미지정";
}

export function AutonomySection({ project, setProject }: { project: Project; setProject: Setter }) {
  const [tab, setTab] = useState<Tab>("actors");
  const enabledActors = project.autonomyActors.filter((actor) => actor.enabled);
  const offscreenActors = enabledActors.filter((actor) => actor.offscreenEnabled);
  const unresolvedMemories = project.relationshipMemories.filter((memory) => memory.unresolved);
  const availableNpcs = project.npcs.filter((character) => !project.autonomyActors.some((actor) => actor.entityType === "character" && actor.entityId === character.id));
  const availableFactions = project.factions.filter((faction) => !project.autonomyActors.some((actor) => actor.entityType === "faction" && actor.entityId === faction.id));

  const relationSummaries = useMemo(() => project.characterRelations.map((relation) => {
    const memories = project.relationshipMemories.filter((memory) => memory.relationId === relation.id);
    const scores = Object.fromEntries(scoreKeys.map((key) => [key, clamp(relation[key] + memories.filter((memory) => memory.active).reduce((sum, memory) => sum + Number(memory.effects[key] || 0), 0))])) as RelationshipMemoryEffect;
    return { relation, memories, scores };
  }), [project.characterRelations, project.relationshipMemories]);

  const addActor = (entityType: AutonomyActor["entityType"], entityId: string) => {
    const actor = blankAutonomyActor(entityType, entityId);
    if (entityType === "character") {
      const character = project.npcs.find((item) => item.id === entityId);
      actor.currentLocation = project.startLocation;
      actor.shortTermGoal = character?.goals ?? "";
      actor.longTermGoal = character?.goals ?? "";
      actor.resources = [character?.assets, character?.skills].filter(Boolean).join("\n");
      actor.constraints = character?.weaknesses ?? "";
      actor.knowledge = character?.publicInfo ?? "";
    } else {
      const faction = project.factions.find((item) => item.id === entityId);
      actor.currentLocation = faction?.territory ?? project.startLocation;
      actor.shortTermGoal = faction?.officialGoal ?? "";
      actor.longTermGoal = faction?.hiddenGoal || faction?.officialGoal || "";
      actor.currentPlan = faction?.currentPlan ?? "";
      actor.nextAction = faction?.currentPlan ?? "";
      actor.resources = faction?.resources ?? "";
      actor.constraints = faction?.internalConflict ?? "";
    }
    setProject((current) => ({ ...current, autonomyActors: [...current.autonomyActors, actor] }));
  };

  const updateActor = (id: string, patch: Partial<AutonomyActor>) => setProject((current) => ({
    ...current,
    autonomyActors: current.autonomyActors.map((actor) => actor.id === id ? { ...actor, ...patch } : actor),
  }));

  const addMemory = () => {
    const relation = project.characterRelations[0];
    if (!relation) return;
    setProject((current) => ({ ...current, relationshipMemories: [...current.relationshipMemories, blankRelationshipMemory(relation)] }));
  };

  const updateMemory = (id: string, patch: Partial<RelationshipMemory>) => setProject((current) => ({
    ...current,
    relationshipMemories: current.relationshipMemories.map((memory) => memory.id === id ? { ...memory, ...patch } : memory),
  }));

  const updateAutonomySettings = (patch: Partial<AutonomySettings>) => setProject((current) => ({ ...current, autonomySettings: { ...current.autonomySettings, ...patch } }));
  const updateMemorySettings = (patch: Partial<RelationshipMemorySettings>) => setProject((current) => ({ ...current, relationshipMemorySettings: { ...current.relationshipMemorySettings, ...patch } }));

  return <PageFrame eyebrow="LIVING WORLD ENGINE" title="보이지 않는 곳에서도 세계는 움직입니다" description="NPC와 세력이 스스로 계획하고 실패하게 만들고, 모든 관계 변화에 약속·배신·빚 같은 구체적인 이유를 남깁니다.">
    <section className="autonomy-hero">
      <div className="autonomy-hero-copy"><span><Radio size={13} /> WORLD PULSE · LIVE</span><h2>자율 세계 장부</h2><p>플레이어의 시야 밖에서 일어난 행동은 숨은 장부에 축적되고, 목격 가능한 흔적만 다음 장면과 상태창에 도착합니다.</p></div>
      <div className="world-orbit" aria-hidden="true"><i className="world-ring ring-a" /><i className="world-ring ring-b" /><span className="world-node node-player">P</span><span className="world-node node-a" /><span className="world-node node-b" /><span className="world-node node-c" /></div>
      <div className="autonomy-metrics"><div><strong>{enabledActors.length}</strong><span>활성 배우</span></div><div><strong>{offscreenActors.length}</strong><span>오프스크린</span></div><div><strong>{project.relationshipMemories.length}</strong><span>이유 기억</span></div><div><strong>{unresolvedMemories.length}</strong><span>미해결 감정</span></div></div>
    </section>

    <Tabs active={tab} onChange={(next) => setTab(next as Tab)} items={[{ id: "actors", label: "NPC·세력 자율 행동", count: project.autonomyActors.length }, { id: "memories", label: "관계 이유 기억", count: project.relationshipMemories.length }, { id: "rules", label: "런타임 규칙" }]} />

    {tab === "actors" && <div className="autonomy-layout">
      <div className="autonomy-main-column">
        <Panel title="자율 배우 연결" note="등록된 NPC와 세력을 한 번 눌러 행동 엔진에 연결하세요." badge="ACTOR POOL">
          <div className="actor-pool">
            {availableNpcs.map((character) => <button type="button" key={character.id} onClick={() => addActor("character", character.id)}><span className="actor-pool-avatar">{character.images[0] ? <img src={(character.images.find((image) => image.isPrimary) ?? character.images[0]).dataUrl} alt="" /> : <UserRound size={17} />}</span><span><b>{character.name}</b><small>NPC · {character.role || "역할 미설정"}</small></span><Plus size={16} /></button>)}
            {availableFactions.map((faction) => <button type="button" key={faction.id} onClick={() => addActor("faction", faction.id)}><span className="actor-pool-avatar faction"><Landmark size={17} /></span><span><b>{faction.name}</b><small>세력 · {faction.leader || "지도자 미설정"}</small></span><Plus size={16} /></button>)}
            {!availableNpcs.length && !availableFactions.length && <div className="actor-pool-empty"><CheckCircle2 size={17} /><span>{project.npcs.length || project.factions.length ? "모든 NPC와 세력이 연결되었습니다." : "먼저 캐릭터와 세력을 추가하세요."}</span></div>}
          </div>
        </Panel>

        <div className="actor-card-list">{project.autonomyActors.map((actor, index) => {
          const name = actorName(project, actor);
          return <article className={`autonomy-actor-card ${actor.enabled ? "" : "disabled"}`} key={actor.id}>
            <header><div className={`actor-kind ${actor.entityType}`} >{actor.entityType === "character" ? <UserRound size={19} /> : <Landmark size={19} />}</div><div><span>{actor.entityType === "character" ? "AUTONOMOUS NPC" : "AUTONOMOUS FACTION"}</span><h3>{name}</h3><p>{actor.currentLocation || "위치 미설정"} · 우선도 {actor.goalPriority}</p></div><Toggle checked={actor.enabled} onChange={(enabled) => updateActor(actor.id, { enabled })} label="활성" /><button className="icon-danger" type="button" aria-label={`${name} 자율 프로필 삭제`} onClick={() => setProject((current) => ({ ...current, autonomyActors: current.autonomyActors.filter((item) => item.id !== actor.id) }))}><Trash2 size={15} /></button></header>
            <div className="actor-glance"><div><Target size={14} /><span>지금의 목표</span><b>{actor.shortTermGoal || "단기 목표를 입력하세요"}</b></div><div><Footprints size={14} /><span>다음 행동</span><b>{actor.nextAction || "다음 행동을 입력하세요"}</b></div><div className="actor-flags"><span className={actor.offscreenEnabled ? "on" : ""}><EyeOff size={12} /> 시야 밖 행동</span><span className={actor.canFailOffscreen ? "on" : ""}><Activity size={12} /> 독립 실패</span></div></div>
            <details className="actor-details" open={index === 0}><summary><span>행동 판단 설계 열기</span><small>목표 · 정보 · 자원 · 성공/실패</small><Zap size={15} /></summary><div className="actor-details-body">
              <div className="field-row three"><Select label="활동 범위" value={actor.activityTier} onChange={(activityTier) => updateActor(actor.id, { activityTier: activityTier as AutonomyActor["activityTier"] })} options={tierOptions} /><Select label="행동 주기" value={actor.actionCadence} onChange={(actionCadence) => updateActor(actor.id, { actionCadence: actionCadence as AutonomyActor["actionCadence"] })} options={cadenceOptions} /><Field label="목표 우선도" type="number" min={0} max={100} value={actor.goalPriority} onChange={(goalPriority) => updateActor(actor.id, { goalPriority: Number(goalPriority) })} /></div>
              <div className="field-row"><Field label="현재 위치" value={actor.currentLocation} onChange={(currentLocation) => updateActor(actor.id, { currentLocation })} /><Select label="위치 공개 범위" value={actor.locationVisibility} onChange={(locationVisibility) => updateActor(actor.id, { locationVisibility: locationVisibility as AutonomyActor["locationVisibility"] })} options={[{ value: "Public", label: "공개 가능" }, { value: "Hidden", label: "GM 비공개" }]} /></div>
              <div className="form-grid three-col actor-goals"><Area label="단기 목표" value={actor.shortTermGoal} onChange={(shortTermGoal) => updateActor(actor.id, { shortTermGoal })} /><Area label="중기 목표" value={actor.mediumTermGoal} onChange={(mediumTermGoal) => updateActor(actor.id, { mediumTermGoal })} /><Area secret label="장기·숨은 목표" value={actor.longTermGoal} onChange={(longTermGoal) => updateActor(actor.id, { longTermGoal })} /></div>
              <div className="field-row"><Area secret label="현재 계획" value={actor.currentPlan} onChange={(currentPlan) => updateActor(actor.id, { currentPlan })} /><Area secret label="다음 행동 후보" value={actor.nextAction} onChange={(nextAction) => updateActor(actor.id, { nextAction })} /></div>
              <div className="form-grid two-col"><Area secret label="알고 있는 사실" value={actor.knowledge} onChange={(knowledge) => updateActor(actor.id, { knowledge })} placeholder="이 배우가 실제로 획득한 정보만" /><Area secret label="오해·거짓 정보" value={actor.misinformation} onChange={(misinformation) => updateActor(actor.id, { misinformation })} /><Area secret label="사용 가능한 자원" value={actor.resources} onChange={(resources) => updateActor(actor.id, { resources })} /><Area secret label="능력·사회·시간 제약" value={actor.constraints} onChange={(constraints) => updateActor(actor.id, { constraints })} /></div>
              <div className="field-row three"><Select label="위험 감수" value={actor.riskTolerance} onChange={(riskTolerance) => updateActor(actor.id, { riskTolerance: riskTolerance as AutonomyActor["riskTolerance"] })} options={[{ value: "low", label: "낮음" }, { value: "moderate", label: "보통" }, { value: "high", label: "높음" }, { value: "extreme", label: "극단적" }]} /><Area label="협력 기준" value={actor.cooperationRules} onChange={(cooperationRules) => updateActor(actor.id, { cooperationRules })} /><Area label="충돌 대응" value={actor.conflictRules} onChange={(conflictRules) => updateActor(actor.id, { conflictRules })} /></div>
              <Area label="이동 규칙" value={actor.travelRules} onChange={(travelRules) => updateActor(actor.id, { travelRules })} />
              <div className="outcome-grid"><Area label="성공 결과" value={actor.successOutcome} onChange={(successOutcome) => updateActor(actor.id, { successOutcome })} /><Area label="부분 성공" value={actor.partialOutcome} onChange={(partialOutcome) => updateActor(actor.id, { partialOutcome })} /><Area label="실패 결과" value={actor.failureOutcome} onChange={(failureOutcome) => updateActor(actor.id, { failureOutcome })} /></div>
              <div className="actor-toggle-grid"><Toggle checked={actor.offscreenEnabled} onChange={(offscreenEnabled) => updateActor(actor.id, { offscreenEnabled })} label="플레이어가 없어도 행동" note="화면 밖 세계 장부에서 실행" /><Toggle checked={actor.canFailOffscreen} onChange={(canFailOffscreen) => updateActor(actor.id, { canFailOffscreen })} label="화면 밖에서도 실패 가능" note="주요 인물·세력도 특혜 없음" /><Toggle checked={actor.revealTraces} onChange={(revealTraces) => updateActor(actor.id, { revealTraces })} label="관측 가능한 흔적 남김" note="결과를 단서·소문으로 연결" /></div>
            </div></details>
          </article>;
        })}</div>
        {!project.autonomyActors.length && <div className="autonomy-empty"><BrainCircuit size={27} /><b>아직 자율 배우가 없습니다.</b><span>위의 NPC 또는 세력을 눌러 살아 움직이는 세계의 첫 축을 만드세요.</span></div>}
      </div>

      <aside className="world-pulse-panel"><header><div><span>HIDDEN WORLD LEDGER</span><b>다음 월드 펄스</b></div><span className="pulse-live"><i /> READY</span></header><div className="pulse-order">{enabledActors.slice().sort((a, b) => b.goalPriority - a.goalPriority).slice(0, project.autonomySettings.maxActionsPerTurn).map((actor, index) => <div key={actor.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{actorName(project, actor)}</b><p>{actor.nextAction || actor.currentPlan || "행동 후보를 설계하세요."}</p><small><MapPin size={10} /> {actor.currentLocation || "위치 미설정"}</small></div><em>{actor.goalPriority}</em></div>)}{!enabledActors.length && <p className="pulse-empty">활성 배우를 연결하면 우선도에 따라 다음 행동 후보가 표시됩니다.</p>}</div><footer><Lock size={13} /><span>이 패널의 내용은 플레이어에게 직접 공개되지 않습니다.</span></footer></aside>
    </div>}

    {tab === "memories" && <div className="memory-layout">
      <div className="memory-main-column">
        <Panel title="관계 원인 장부" note="점수를 바꾸기 전에 원인이 되는 사건 기억을 먼저 남깁니다." badge="CAUSAL MEMORY" actions={<button type="button" className="soft-button" disabled={!project.characterRelations.length} onClick={addMemory}><Plus size={14} /> 이유 기억</button>}>
          <div className="memory-principle"><History size={18} /><p><b>신뢰 +10이 아니라 “약속을 지켜서 신뢰했다”</b><span>모든 변화는 방향·공개 범위·영구성·해결 조건을 가진 독립 기록이 됩니다.</span></p></div>
        </Panel>
        <div className="memory-card-list">{project.relationshipMemories.map((memory) => {
          const relation = project.characterRelations.find((item) => item.id === memory.relationId);
          const updateEffect = (key: keyof RelationshipMemoryEffect, value: number) => updateMemory(memory.id, { effects: { ...memory.effects, [key]: value } });
          return <article className={`memory-card ${memory.active ? "" : "inactive"}`} key={memory.id}><header><div className={`memory-visibility ${memory.visibility.toLowerCase()}`}>{memory.visibility === "Public" ? <Eye size={16} /> : <EyeOff size={16} />}</div><div><span>{memoryTypes.find((item) => item.value === memory.type)?.label ?? "기억"} · {memory.turnLabel || "시점 미정"}</span><h3>{memory.title || "제목 없는 기억"}</h3><p>{characterName(project, memory.sourceId)} → {characterName(project, memory.targetId)}</p></div>{memory.unresolved && <span className="unresolved-badge"><Clock3 size={12} /> 미해결</span>}<button className="icon-danger" type="button" aria-label={`${memory.title} 삭제`} onClick={() => setProject((current) => ({ ...current, relationshipMemories: current.relationshipMemories.filter((item) => item.id !== memory.id) }))}><Trash2 size={15} /></button></header>
            <div className="memory-fields"><div className="field-row three"><Select label="방향성 관계" value={memory.relationId} onChange={(relationId) => { const next = project.characterRelations.find((item) => item.id === relationId); updateMemory(memory.id, { relationId, sourceId: next?.sourceId ?? "", targetId: next?.targetId ?? "" }); }} options={project.characterRelations.map((item) => ({ value: item.id, label: `${characterName(project, item.sourceId)} → ${characterName(project, item.targetId)}` }))} /><Select label="기억 유형" value={memory.type} onChange={(type) => updateMemory(memory.id, { type: type as RelationshipMemory["type"] })} options={memoryTypes} /><Field label="기록 시점" value={memory.turnLabel} onChange={(turnLabel) => updateMemory(memory.id, { turnLabel })} placeholder="TURN 12 · D+3" /></div>
              <div className="field-row"><Field label="기억 제목" value={memory.title} onChange={(title) => updateMemory(memory.id, { title })} /><Select label="공개 범위" value={memory.visibility} onChange={(visibility) => updateMemory(memory.id, { visibility: visibility as RelationshipMemory["visibility"] })} options={[{ value: "Public", label: "공개 가능한 이유" }, { value: "Hidden", label: "GM 비공개 이유" }]} /></div>
              <div className="field-row"><Area label="무슨 일이 있었나" value={memory.summary} onChange={(summary) => updateMemory(memory.id, { summary })} /><Area secret={memory.visibility === "Hidden"} label="왜 관계가 바뀌었나" value={memory.cause} onChange={(cause) => updateMemory(memory.id, { cause })} /></div>
              <div className="memory-score-editor">{scoreKeys.map((key) => <label key={key}><span>{scoreLabels[key]}</span><input type="number" min={-100} max={100} value={memory.effects[key]} onChange={(event) => updateEffect(key, Number(event.target.value))} /><b className={memory.effects[key] > 0 ? "positive" : memory.effects[key] < 0 ? "negative" : ""}>{memory.effects[key] > 0 ? "+" : ""}{memory.effects[key]}</b></label>)}</div>
              <div className="field-row three"><Field label="중요도" type="number" min={0} max={100} value={memory.importance} onChange={(importance) => updateMemory(memory.id, { importance: Number(importance) })} /><Select label="지속 방식" value={memory.permanence} onChange={(permanence) => updateMemory(memory.id, { permanence: permanence as RelationshipMemory["permanence"] })} options={[{ value: "temporary", label: "일시적" }, { value: "decaying", label: "서서히 약화" }, { value: "permanent", label: "영구 기억" }]} /><Select label="원인 사건 연결" value={memory.eventId} onChange={(eventId) => updateMemory(memory.id, { eventId })} options={[{ value: "", label: "연결 없음" }, ...project.events.map((event) => ({ value: event.id, label: event.name }))]} /></div>
              <Field label="검색 태그" value={memory.tags} onChange={(tags) => updateMemory(memory.id, { tags })} placeholder="약속, 구조, 빚" />
              <div className="memory-toggle-row"><Toggle checked={memory.active} onChange={(active) => updateMemory(memory.id, { active })} label="관계 계산에 적용" note="끄면 기록은 보존하되 점수 효과만 제외합니다." /><Toggle checked={memory.unresolved} onChange={(unresolved) => updateMemory(memory.id, { unresolved })} label="아직 해결되지 않은 감정·약속" note="NPC의 다음 판단과 자율 행동 후보에 계속 영향을 줍니다." /></div>
              {memory.unresolved && <Area label="해결 또는 변환 조건" value={memory.resolutionConditions} onChange={(resolutionConditions) => updateMemory(memory.id, { resolutionConditions })} placeholder="사과를 받아들인다 / 빚을 갚는다 / 진실을 확인한다" />}
              {!relation && <div className="memory-link-error"><ShieldCheck size={14} /> 연결된 관계가 없습니다. 방향성 관계를 다시 선택하세요.</div>}
            </div>
          </article>;
        })}</div>
        {!project.characterRelations.length && <div className="autonomy-empty"><GitBranch size={27} /><b>먼저 방향성 인물 관계가 필요합니다.</b><span>‘관계와 세력’에서 A → B 관계를 만든 뒤 이유 기억을 추가하세요.</span></div>}
        {project.characterRelations.length > 0 && !project.relationshipMemories.length && <div className="autonomy-empty"><History size={27} /><b>첫 번째 관계 이유를 기록해 보세요.</b><span>약속, 구조, 배신, 빚 또는 단순한 첫인상도 장기 기억이 될 수 있습니다.</span></div>}
      </div>

      <aside className="relation-ledger"><header><div><span>DERIVED RELATIONSHIPS</span><b>이유로 계산된 관계</b></div><GitBranch size={18} /></header>{relationSummaries.map(({ relation, memories, scores }) => <section key={relation.id}><div className="relation-ledger-title"><span>{characterName(project, relation.sourceId)}</span><i>→</i><b>{characterName(project, relation.targetId)}</b><em>{memories.filter((memory) => memory.active).length}/{memories.length} active</em></div><div className="relation-score-chips">{scoreKeys.map((key) => <span key={key}><small>{scoreLabels[key]}</small><b className={scores[key] > 0 ? "positive" : scores[key] < 0 ? "negative" : ""}>{scores[key] > 0 ? "+" : ""}{scores[key]}</b></span>)}</div><div className="reason-stack">{memories.slice().sort((a, b) => b.importance - a.importance).slice(0, 3).map((memory) => <div className={memory.active ? "" : "inactive"} key={memory.id}><span className={memory.visibility === "Hidden" ? "hidden" : "public"}>{memory.visibility === "Hidden" ? <EyeOff size={10} /> : <Eye size={10} />}</span><p><b>{memory.title}</b><small>{memory.cause || memory.summary || "원인 미입력"}</small></p></div>)}{!memories.length && <p className="reason-empty">기본값만 있습니다. 아직 이유 기억이 없습니다.</p>}</div></section>)}{!relationSummaries.length && <p className="pulse-empty">방향성 관계를 만들면 기준 점수와 기억 효과를 합산해 보여줍니다.</p>}<footer><Lock size={13} /><span>Hidden 이유는 시뮬레이터의 내부 판단에만 사용됩니다.</span></footer></aside>
    </div>}

    {tab === "rules" && <div className="engine-rules-layout">
      <div className="engine-rule-column">
        <Panel title="NPC·세력 자율 행동 규칙" note="한 턴에 누가 움직이고 무엇을 근거로 성공·실패하는지 고정합니다." badge="AUTONOMY V1">
          <Toggle checked={project.autonomySettings.enabled} onChange={(enabled) => updateAutonomySettings({ enabled })} label="자율 행동 엔진 사용" note="꺼도 설계 데이터는 패키지 안에 보존됩니다." />
          <div className="field-row three"><Field label="턴당 최대 행동" type="number" min={1} max={10} value={project.autonomySettings.maxActionsPerTurn} onChange={(maxActionsPerTurn) => updateAutonomySettings({ maxActionsPerTurn: Number(maxActionsPerTurn) })} /><Field label="세력 기본 주기(턴)" type="number" min={1} max={20} value={project.autonomySettings.factionTickTurns} onChange={(factionTickTurns) => updateAutonomySettings({ factionTickTurns: Number(factionTickTurns) })} /><Select label="흔적 공개 정책" value={project.autonomySettings.tracePolicy} onChange={(tracePolicy) => updateAutonomySettings({ tracePolicy: tracePolicy as AutonomySettings["tracePolicy"] })} options={[{ value: "observable_only", label: "관측 가능한 결과만" }, { value: "rumors_allowed", label: "소문도 허용" }, { value: "silent_until_discovered", label: "발견 전까지 완전 비공개" }]} /></div>
          <div className="rule-toggle-grid"><Toggle checked={project.autonomySettings.deterministicSeed} onChange={(deterministicSeed) => updateAutonomySettings({ deterministicSeed })} label="시드 기반 재현" note="같은 상태·시드면 같은 판정" /><Toggle checked={project.autonomySettings.requireTravelTime} onChange={(requireTravelTime) => updateAutonomySettings({ requireTravelTime })} label="이동 시간 강제" note="순간이동식 편의 전개 금지" /><Toggle checked={project.autonomySettings.enforceKnowledgeBounds} onChange={(enforceKnowledgeBounds) => updateAutonomySettings({ enforceKnowledgeBounds })} label="정보 경계 강제" note="모르는 사실로 판단 금지" /><Toggle checked={project.autonomySettings.enforceResourceBounds} onChange={(enforceResourceBounds) => updateAutonomySettings({ enforceResourceBounds })} label="자원 경계 강제" note="없던 인맥·도구 생성 금지" /><Toggle checked={project.autonomySettings.allowOffscreenFailure} onChange={(allowOffscreenFailure) => updateAutonomySettings({ allowOffscreenFailure })} label="오프스크린 실패 허용" note="주요 NPC도 독립적으로 실패" /></div>
          <Area label="자율 행동 하드 룰" value={project.autonomySettings.rules} onChange={(rules) => updateAutonomySettings({ rules })} />
        </Panel>
        <Panel title="관계 이유 기억 규칙" note="관계 변화가 숫자 조정이 아니라 서사의 누적 결과가 되게 합니다." badge="MEMORY V1">
          <Toggle checked={project.relationshipMemorySettings.enabled} onChange={(enabled) => updateMemorySettings({ enabled })} label="관계 이유 기억 사용" />
          <div className="rule-toggle-grid"><Toggle checked={project.relationshipMemorySettings.deriveScoresFromMemory} onChange={(deriveScoresFromMemory) => updateMemorySettings({ deriveScoresFromMemory })} label="기억에서 점수 계산" note="기준값 + 기억 효과 합산" /><Toggle checked={project.relationshipMemorySettings.keepContradictoryMemories} onChange={(keepContradictoryMemories) => updateMemorySettings({ keepContradictoryMemories })} label="모순된 기억 보존" note="좋아하지만 의심하는 감정 허용" /><Toggle checked={project.relationshipMemorySettings.decayEnabled} onChange={(decayEnabled) => updateMemorySettings({ decayEnabled })} label="일시 기억 감쇠" note="영구·미해결 기억은 별도" /><Toggle checked={project.relationshipMemorySettings.displayPublicReasonsInHud} onChange={(displayPublicReasonsInHud) => updateMemorySettings({ displayPublicReasonsInHud })} label="HUD에 공개 이유 표시" note="직접 만난 인물만 노출" /></div>
          <Field label="관계당 활성 기억 상한" type="number" min={1} max={200} value={project.relationshipMemorySettings.maxActiveMemoriesPerRelation} onChange={(maxActiveMemoriesPerRelation) => updateMemorySettings({ maxActiveMemoriesPerRelation: Number(maxActiveMemoriesPerRelation) })} />
          <Area label="관계 기억 하드 룰" value={project.relationshipMemorySettings.rules} onChange={(rules) => updateMemorySettings({ rules })} />
        </Panel>
      </div>
      <aside className="runtime-pipeline"><header><Sparkles size={17} /><div><span>ENGINE 2.0</span><b>턴 처리 파이프라인</b></div></header>{[
        ["01", "플레이어 입력 판정", "선택·행동·경과 시간을 확정"],
        ["02", "자율 배우 선별", "위치·주기·우선도로 최대 수만 선택"],
        ["03", "성공·부분·실패 판정", "정보·자원·제약·위험을 대조"],
        ["04", "숨은 세계 장부 갱신", "위치·자원·사건 시계·흔적 반영"],
        ["05", "관계 이유 기억 기록", "행동의 원인과 방향성 효과를 추가"],
        ["06", "관계 점수 재계산", "기준값 + 유효 기억 효과 합산"],
        ["07", "이미지 트리거 평가", "조건에 맞는 생성·첨부 이미지 실행"],
        ["08", "공개 필터와 HUD", "관측 가능한 결과와 이유만 출력"],
      ].map(([number, title, note]) => <div className="pipeline-step" key={number}><span>{number}</span><i /><p><b>{title}</b><small>{note}</small></p></div>)}<footer><ShieldCheck size={14} /><span>이 실행 명세는 ScenarioPack의 rules 폴더에 함께 저장됩니다.</span></footer></aside>
    </div>}
  </PageFrame>;
}
