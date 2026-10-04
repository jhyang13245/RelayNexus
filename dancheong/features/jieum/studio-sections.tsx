import { JIEUM_VERSION } from "./jieum-version"; import { cortexExportReview } from "./cortex-export-review";
import { writingSteps } from "./creation-basics";
import { worldProse, updateWorldProse } from "./world-prose";
"use client";

import { useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowRight, BookOpenCheck, BrainCircuit, CheckCircle2, ChevronRight, CircleAlert, Copy,
  Download, FileArchive, FileJson, FileText, Image as ImageIcon, ImagePlus,
  Gauge, Gem, Link2, Lock, Plus, RefreshCw, RotateCcw, ShieldCheck, Smartphone, Sparkles,
  Search, Star, Sword, Trash2, Upload, UserRound, WalletCards, X, Zap,
} from "lucide-react";
import type {
  Character, CharacterRelation, CortexRequiredFunction, EventClock, Faction, FactionRelation, Foreshadowing,
  ImageTrigger, Project, StatusRelationshipDisplay, StatusResource, StatusStat, StoryEvent,
} from "./studio-model";
import { blankCharacter, blankCortexRequiredFunction, blankImageTrigger, blankStatusRelationshipDisplay, blankStoryBeat, blankStoryEvent, defaultProtagonistInvariants, makeFateStatusWindow, makeProjectForPackageTarget, makeStatusWindow, normalizeProject, uid, validateProject, worldFields } from "./studio-model";
import { createDemoPreset, DEMO_PRESETS, type DemoPresetId } from "./demo-presets";
import {
  aiGeneratorPromptFor, buildImportObject, downloadImportJson, downloadImportMd, downloadProject,
  exportScenarioPack, extractStudioProjectFromPackage, packageVersionFor, STUDIO_VERSION, visualManifest,
} from "./studio-export";
import { CortexEventsEditor } from "./cortex-events-section";
import type { ImageExportMode, ImageOptimizationProgress } from "./image-optimization";

type Screen = "dashboard" | "project" | "world" | "characters" | "invariants" | "relations" | "autonomy" | "story" | "routes" | "instant" | "stats" | "keywords" | "direction" | "ai" | "export";
type Setter = React.Dispatch<React.SetStateAction<Project>>;
type Notify = (message: string) => void;
const splitTerms = (value: string) => value.split(/[|,\n]/u).map((item) => item.trim()).filter(Boolean);

const projectUsesBlobImages = (project: Project) => [project.player, ...project.npcs]
  .some((character) => character.images.some((image) => image.sourceBlob instanceof Blob))
  || project.imageTriggers.some((trigger) => trigger.attachedImages.some((image) => image.sourceBlob instanceof Blob));

export function PageFrame({ eyebrow, title, description, actions, children }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <div className="page-frame"><header className="page-heading with-actions"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>{children}</div>;
}

export function Panel({ title, note, badge, wide, children, actions }: { title: string; note?: string; badge?: string; wide?: boolean; children: React.ReactNode; actions?: React.ReactNode }) {
  return <section className={`panel ${wide ? "wide" : ""}`}><header><div><h2>{title}{badge && <span className="panel-badge">{badge}</span>}</h2>{note && <p>{note}</p>}</div>{actions}</header><div className="panel-body">{children}</div></section>;
}

export function Field({ label, value, onChange, placeholder, required, type = "text", min, max, step }: { label: string; value: string | number; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string; min?: number; max?: number; step?: number }) {
  return <label className="field-label"><span>{label}{required && <i>*</i>}</span><input type={type} min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] | { value: string; label: string }[] }) {
  return <label className="field-label"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => typeof option === "string" ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function Area({ label, value, onChange, placeholder, secret }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; secret?: boolean }) {
  return <label className={`text-area-label ${secret ? "secret-field" : ""}`}><span>{secret && <Lock size={11} />}{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export function Toggle({ checked, onChange, label, note }: { checked: boolean; onChange: (checked: boolean) => void; label: string; note?: string }) {
  return <label className="toggle-row"><button type="button" className={`toggle ${checked ? "on" : ""}`} aria-pressed={checked} onClick={() => onChange(!checked)}><i /></button><span><b>{label}</b>{note && <small>{note}</small>}</span></label>;
}

export function Tabs({ items, active, onChange }: { items: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return <div className="section-tabs" role="tablist">{items.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onChange(item.id)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>;
}

export function Dashboard({ project, progress, go, setProject, notify, onConvertToCortex }: { project: Project; progress: number; go: (screen: Screen) => void; setProject: Setter; notify: Notify; onConvertToCortex: () => void }) {
  const [demoPickerOpen, setDemoPickerOpen] = useState(false);
  const imageCount = [project.player, ...project.npcs].reduce((sum, character) => sum + character.images.length, 0);
  const triggerImageCount = project.imageTriggers.reduce((sum, trigger) => sum + trigger.attachedImages.length, 0);
  const playableEventCount = project.events.filter((event) => event.kind !== "constraint").length;
  const metrics = project.runtimeMode === "instant_story"
    ? [[project.npcs.length, "등장인물", "characters"], [project.instantStory.startProfiles.length, "도입부", "instant"], [project.instantStory.exampleScenes.length, "예시 설정", "world"], [project.instantStory.keywordNotes.length, "키워드 노트", "keywords"]] as const
    : [[project.npcs.length, "등장인물", "characters"], [project.factions.length, "활성 세력", "relations"], [playableEventCount, "예정 사건", "story"], [project.eventClocks.length, "사건 시계", "story"]] as const;
  const productionSteps = writingSteps(project).map(step => [step.label, step.done, step.screen]);
  const switchRuntime = (runtimeMode: Project["runtimeMode"]) => {
    if (runtimeMode === project.runtimeMode) return;
    if (!confirm("Runtime을 바꾸면 현재 작업을 비우고 새 프로젝트를 시작합니다. 필요한 경우 먼저 패키지 ZIP을 저장하세요. 계속할까요?")) return;
    setProject(makeProjectForPackageTarget(project.packageTarget, runtimeMode, true));
    go("dashboard");
    notify(runtimeMode === "instant_story" ? "Instant Story Runtime 전용 프로젝트를 시작했습니다." : "지능형 정사 전개 Runtime 프로젝트를 시작했습니다.");
  };
  const applyDemo = (id: DemoPresetId) => {
    const preset = DEMO_PRESETS.find((item) => item.id === id);
    const next = createDemoPreset(id);
    next.packageTarget = project.packageTarget;
    next.protagonistInvariants = project.packageTarget === "cortex" ? defaultProtagonistInvariants() : [];
    setProject(next);
    setDemoPickerOpen(false);
    notify(`${preset?.title ?? "기성학원 데모"}를 적용했습니다.`);
  };
  return <PageFrame eyebrow="SCENARIO WORKSPACE" title={project.title} description={`${project.genre} · ${project.startDate} · ${project.startLocation}`}
    actions={<button className="soft-button" onClick={() => setDemoPickerOpen(true)}><Sparkles size={15} /> 완성형 데모 선택</button>}>
    {demoPickerOpen && <div className="demo-picker-backdrop" role="presentation" onMouseDown={() => setDemoPickerOpen(false)}>
      <section className="demo-picker" role="dialog" aria-modal="true" aria-labelledby="demo-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>BUILT-IN DEMOS</span><h2 id="demo-picker-title">적용할 완성형 데모를 선택하세요</h2><p>현재 편집 내용은 선택한 기성학원 데모로 교체됩니다. 두 버전은 독립된 원본으로 유지됩니다.</p></div><button type="button" className="icon-button" aria-label="데모 선택 닫기" onClick={() => setDemoPickerOpen(false)}><X size={18} /></button></header>
        <div className="demo-choice-grid">{DEMO_PRESETS.map((preset) => <article key={preset.id} className={`demo-choice ${preset.id === "giseong_instant_story" ? "instant" : "full-fit"}`}><div className="demo-choice-top"><span>{preset.eyebrow}</span><b>{preset.badge}</b></div><h3>{preset.title}</h3><p>{preset.description}</p><ul>{preset.facts.map((fact) => <li key={fact}><CheckCircle2 size={14} />{fact}</li>)}</ul><button type="button" className={preset.id === "giseong_instant_story" ? "primary-button" : "soft-button"} onClick={() => applyDemo(preset.id)}>{preset.id === "giseong_instant_story" ? <Zap size={16} /> : <Sparkles size={16} />} 이 버전 적용</button></article>)}</div>
        <footer><CircleAlert size={15} /><span>자동 저장된 현재 작업도 교체됩니다. 필요한 경우 먼저 패키지 ZIP을 내려받으세요.</span></footer>
      </section>
    </div>}
    {project.packageTarget === "legacy" && <section className="cortex-conversion-card" aria-labelledby="cortex-conversion-title">
      <div className="cortex-conversion-icon"><ShieldCheck size={24} /></div>
      <div><span>LOSSLESS ENGINE MIGRATION</span><h2 id="cortex-conversion-title">불러온 Lotus 프로젝트를 Cortex 전용으로 변환</h2><p>{project.runtimeMode === "instant_story" ? "시작 설정·예시 장면·키워드 노트·캐릭터·이미지를 그대로 유지하고 Cortex 불변식과 전용 manifest를 추가합니다." : "사건 ID·서사·GM 정보·이미지·비트 원문을 보존하면서 Cortex v1.41.6용 조건별 편집 구조를 추가합니다. 장소는 자연어로 작성합니다. 기존 실패·취소 경로는 미충족 전개로 모아 검토할 수 있습니다."}</p></div>
      <button type="button" className="primary-button" onClick={onConvertToCortex}><Sparkles size={16} /> Cortex로 Cortex 변환 <ArrowRight size={15} /></button>
    </section>}
    <section className="runtime-choice-grid" aria-label="제작 Runtime 선택">
      <button type="button" className={`runtime-choice canon ${project.runtimeMode === "intelligent_canon" ? "active" : ""}`} onClick={() => switchRuntime("intelligent_canon")}>
        <span>INTELLIGENT CANON</span><BrainCircuit size={26} /><h3>지능형 정사 전개 Runtime</h3><p>사건·인과·NPC 자율 행동·관계 기억·세계선으로 장기 세계를 시뮬레이션합니다.</p><b>{project.runtimeMode === "intelligent_canon" ? "현재 Runtime" : "새 프로젝트로 전환"}</b>
      </button>
      <button type="button" className={`runtime-choice instant ${project.runtimeMode === "instant_story" ? "active" : ""}`} onClick={() => switchRuntime("instant_story")}>
        <span>INSTANT STORY</span><Zap size={26} /><h3>Instant Story Runtime</h3><p>시작 설정·예시 장면·스탯·키워드 노트만 활성화해 입력 즉시 자유롭게 이어지는 크랙식 플레이를 만듭니다.</p><b>{project.runtimeMode === "instant_story" ? "현재 Runtime" : "새 프로젝트로 전환"}</b>
      </button>
    </section>
    <section className="hero-card"><div className="hero-copy"><span className="hero-kicker">{project.runtimeMode === "instant_story" ? <><Zap size={15} /> INSTANT · INPUT FIRST</> : <><Sparkles size={15} /> LIVING WORLD · CAUSAL MEMORY</>}</span><h2>{project.runtimeMode === "instant_story" ? <>입력하면 바로.<br /><em>이야기는 자유롭게.</em></> : <>설정은 정교하게.<br /><em>세계는 스스로 움직이게.</em></>}</h2><p>{project.runtimeMode === "instant_story" ? "정해진 사건표를 따라가지 않습니다. 현재 입력과 활성 키워드 노트만으로 장면을 즉시 이어가는 InstantStoryPack을 만드세요." : "NPC·세력의 숨은 행동과 관계가 바뀐 이유까지 사건 시계, 이미지, 실시간 상태창과 하나의 ScenarioPack으로 묶어 장기 시뮬레이션을 시작하세요."}</p><div className="hero-actions"><button className="primary-button large" onClick={() => go(progress < 38 ? "project" : project.runtimeMode === "instant_story" ? "world" : "characters")}><Plus size={18} /> {progress < 38 ? "프로젝트 설계 시작" : project.runtimeMode === "instant_story" ? "설정집 계속 쓰기" : "캐릭터 구성 계속"}</button>{project.runtimeMode === "instant_story" ? <button className="ghost-button" onClick={() => go("instant")}><BookOpenCheck size={18} /> 도입부 설정</button> : <><button className="ghost-button" onClick={() => go("autonomy")}><BrainCircuit size={18} /> 자율 세계 설계</button><button className="ghost-button" onClick={() => go("direction")}><Activity size={18} /> 상태창 HUD 설계</button></>}{projectUsesBlobImages(project) ? <button className="ghost-button" onClick={() => go("export")}><FileArchive size={18} /> 패키지 ZIP으로 백업</button> : <button className="ghost-button" onClick={() => { downloadProject(project); notify(`이미지 ${imageCount + triggerImageCount}장까지 작업 JSON에 저장했습니다.`); }}><FileJson size={18} /> 현재 작업 JSON</button>}</div></div>
      <div className="hero-orbit" aria-label={`기본 작성 진행률 ${progress}%`}><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="progress-core"><strong>{progress}<small>%</small></strong><span>기본 작성</span></div><span className="orbit-label label-one">{project.runtimeMode === "instant_story" ? "START" : "CANON"}</span><span className="orbit-label label-two">CHARACTER</span><span className="orbit-label label-three">{project.runtimeMode === "instant_story" ? "KEYWORD" : "EVENT"}</span></div></section>
    <section className="metric-grid">{metrics.map(([value, label, target]) => <button key={label} onClick={() => go(target)} className="metric-card"><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong><ChevronRight size={17} /></button>)}</section>
    <section className="dashboard-grid">
      <Panel title="제작 순서" note="기본 내용부터 작성하세요. 예시·이미지·상태창은 선택 사항이며, 내보내기 검증은 별도로 진행합니다.">{productionSteps.map(([label, done, target], index) => <button className="check-row" key={String(label)} onClick={() => go(target as Screen)}><span className={done ? "check done" : "check"}>{done ? <CheckCircle2 size={17} /> : index + 1}</span><b>{String(label)}</b><small>{done ? "작성됨" : "작성하기"}</small><ChevronRight size={16} /></button>)}</Panel>
      <Panel title="비주얼 캐논" note="주요 인물의 외형을 세션이 바뀌어도 유지합니다." badge="NEW"><div className="visual-preview"><div className="visual-stack">{[project.player, ...project.npcs].flatMap((character) => character.images.filter((image) => image.isPrimary).map((image) => <img key={image.id} src={image.dataUrl} alt={character.name} />)).slice(0, 3)}{imageCount === 0 && <div className="visual-placeholder"><ImagePlus size={26} /><span>기준 이미지</span></div>}</div><div><h3>{imageCount ? `${imageCount}개의 이미지가 정사에 연결됨` : "캐릭터 기준 이미지를 넣어보세요"}</h3><p>대표 이미지와 표정 자료를 패키지에 함께 넣고, 첫 등장과 장면 이미지에서 외형 일관성을 지키도록 자동 지시합니다.</p><button className="text-button" onClick={() => go("characters")}>비주얼 바이블 열기 <ChevronRight size={14} /></button></div></div></Panel>
    </section>
  </PageFrame>;
}

export function ProjectSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const setRoot = <K extends keyof Project>(key: K, value: Project[K]) => setProject((current) => ({ ...current, [key]: value }));
  return <PageFrame eyebrow="PROJECT FOUNDATION" title="이야기의 좌표부터 고정하세요" description={project.runtimeMode === "instant_story" ? "장르, 시간, 장소와 난이도를 정하세요." : "장르, 시간과 시작 장소를 정하세요."}>
    <div className="form-grid two-col"><Panel title="작품 정보" note="패키지와 대화 상단에 표시되는 기본 정보입니다."><div className="field-row"><Field label="시나리오 제목" value={project.title} onChange={(v) => setRoot("title", v)} required /><Field label="작성자" value={project.author} onChange={(v) => setRoot("author", v)} placeholder="선택 입력" /></div><div className="field-row"><Field label="장르" value={project.genre} onChange={(v) => setRoot("genre", v)} required /><Select label="세계 유형" value={project.worldType} onChange={(v) => setRoot("worldType", v)} options={["현실 세계", "대체역사", "완전한 가상세계", "판타지", "SF", "혼합 세계"]} /></div><Field label="전체 분위기" value={project.tone} onChange={(v) => setRoot("tone", v)} /><Field label="플레이 방식" value={project.playStyle} onChange={(v) => setRoot("playStyle", v)} /></Panel>
      <Panel title="시작 좌표" note="첫 턴이 열리는 정확한 시간과 장소입니다."><div className="field-row"><Field label="시작 날짜" value={project.startDate} onChange={(v) => setRoot("startDate", v)} /><Field label="시작 지역" value={project.startLocation} onChange={(v) => setRoot("startLocation", v)} required /></div>{project.runtimeMode === "instant_story" && <div className="difficulty-picker" role="radiogroup" aria-label="난이도">{(["EASY", "NORMAL", "HARD"] as const).map((level) => <button key={level} className={project.difficulty === level ? "active" : ""} onClick={() => setRoot("difficulty", level)}><b>{level}</b><span>{level === "EASY" ? "서사 중심" : level === "NORMAL" ? "균형 진행" : "완전 자율 세계"}</span></button>)}</div>}<Area label="프로젝트 메모" value={project.notes} onChange={(v) => setRoot("notes", v)} placeholder="제작 의도, 금지 요소, 참고 메모를 자유롭게 적으세요." /></Panel>
    </div>
  </PageFrame>;
}

export function WorldSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const setWorld = (key: string, value: string) => setProject((current) => ({ ...current, world: key === "overview" ? updateWorldProse(current.world, value) : { ...current.world, [key]: value } }));
  const setContext = (patch: Partial<Project["aiWorldContext"]>) => setProject((current) => ({ ...current, aiWorldContext: { ...current.aiWorldContext, ...patch } }));
  const setMoment = (key: keyof Project["aiWorldContext"]["evaluationMoments"], value: boolean) => setProject((current) => ({ ...current, aiWorldContext: { ...current.aiWorldContext, evaluationMoments: { ...current.aiWorldContext.evaluationMoments, [key]: value } } }));
  const setCharacterResearch = (patch: Partial<Project["aiWorldContext"]["referenceCharacterResearch"]>) => setProject((current) => ({ ...current, aiWorldContext: { ...current.aiWorldContext, referenceCharacterResearch: { ...current.aiWorldContext.referenceCharacterResearch, ...patch } } }));
  const applyKoreanGrailPreset = () => {
    if (!confirm("현재 AI 세계관 고려 내용을 ‘한국에서 열리는 성배전쟁’ 예시로 바꿀까요?")) return;
    setContext({
      enabled: true,
      liveEvaluation: true,
      premise: "현대 한국, 서울을 중심으로 비밀리에 벌어지는 성배전쟁. 참가자와 영령은 한국의 지리·역사·사회 구조 안에서 움직인다.",
      referenceFramework: "Fate 시리즈의 성배전쟁 기본 구조: 마스터-서번트 계약, 클래스, 영주, 성배, 마술사회와 감독 기관, 진명·보구·상성의 정보전",
      referenceUsage: "원작 계통의 성배전쟁 작동 원리, 마술사회 은폐 논리, 클래스 상성, 진명 비공개 문법을 참고한다. 패키지에 적힌 변형 규칙과 현재 정사가 항상 우선한다.",
      localContext: "서울 지하철과 도로망, 한강과 산지, CCTV·스마트폰·언론 환경, 한국의 행정·군경·종교·교육기관, 주거와 야간 생활이 전투·은폐·조사에 현실적으로 영향을 준다.",
      enrichmentPriorities: "한국사와 지역 전승을 활용한 영령 후보, 서울 권역별 전장 특성, 마술사 가문의 한국 정착사, 감독 기관의 이해관계, 민간 피해 은폐, 평범한 학교·직장 일상과 비밀 전쟁의 충돌",
      protectedCanon: "패키지에 등록된 마스터·서번트·세력·사건을 우선한다. 서번트 진명과 배후의 목적은 충분한 단서와 사건 진행 없이 공개하지 않는다.",
      avoidElements: "원작 사건의 그대로인 재연, 패키지에 등록되지 않은 원작 인물의 편의적 난입, 한국 사회를 이름만 바꾼 일본 배경처럼 묘사하는 것, 근거 없는 진명 공개와 설정 설명 덤프",
      originalityRule: "원작 계통의 규칙과 분위기를 바탕으로 하되, 한국에서 실제로 열렸을 때 생기는 장소·역사·제도·인물 동기의 차이를 새 사건과 결과로 발전시킨다.",
      spoilerRule: "서번트 진명·보구의 정체·흑막·비밀 진영은 플레이어가 관측한 행동, 전승 단서, 관계 기억과 사건 결과로 단계적으로 추론하게 한다.",
      knowledgePolicy: "hybrid",
      updateDepth: "deep",
      evaluationMoments: { sessionStart: true, sceneTransition: true, eventGeneration: true, npcDecision: true, everyTurn: true },
    });
  };
  const momentLabels: [keyof Project["aiWorldContext"]["evaluationMoments"], string, string][] = [
    ["sessionStart", "세션 시작", "전체 세계관 정합성 초기화"],
    ["sceneTransition", "장면 전환", "새 장소·시간의 맥락 보강"],
    ["eventGeneration", "사건 생성", "참고 규칙과 현지 개연성 대조"],
    ["npcDecision", "NPC 판단", "세력·인물 지식에 맞는 선택"],
    ["everyTurn", "매 대화", "매 API 응답 전에 짧게 재검토"],
  ];
  if (project.runtimeMode === "instant_story") return <PageFrame eyebrow="INSTANT WORLD NOTES" title="항상 필요한 세계 설정만 고정하세요" description="이 내용은 작품 공통 설정으로 캐시됩니다. 장면별 세부 정보는 Instant Story의 키워드 노트로 나누세요.">
    <div className="world-grid">{worldFields.filter(([key]) => ["overview", "fixedCanon", "impossibilities", "aiFillConstraints"].includes(key)).map(([key, label, help], index) => <Panel key={key} title={key === "overview" ? "세계관" : label} note={key === "overview" ? "역사, 정치, 경제, 사회·문화, 종교·이념, 기술, 군사, 교통·통신, 화폐·물가, 초자연적 능력 등 필요한 분야를 자유롭게 적어 주세요. 구체적인 배경이 담길수록 패키지가 더 풍부해집니다. 모든 분야를 채울 필요는 없습니다." : help} badge={index < 2 ? "STATIC" : undefined} wide={key === "overview" || key === "fixedCanon"}><textarea className="editor-area" aria-label={key === "overview" ? "세계관 자유 작성" : label} value={key === "overview" ? worldProse(project.world) : project.world[key] ?? ""} onChange={(e) => setWorld(key, e.target.value)} placeholder={`${label}을 입력하세요…`} /><div className="character-count">{(project.world[key] ?? "").length.toLocaleString()}자</div></Panel>)}</div>
  </PageFrame>;
  return <PageFrame eyebrow="WORLD CANON" title="AI가 넘지 못할 세계의 경계" description="고정 정사와 참고 세계관을 분리하고, API가 매 장면에서 지역·시대·원작 계통의 규칙을 다시 고려하게 합니다.">
    <section className={`ai-context-shell ${project.aiWorldContext.enabled ? "enabled" : ""}`}>
      <header className="ai-context-hero"><div className="ai-context-icon"><BrainCircuit size={25} /></div><div><span>LIVE WORLD CONTEXT</span><h2>AI 실시간 세계관 고려</h2><p>한 줄짜리 핵심 전제를 매 API 요청의 세계관 판단 기준으로 확장합니다. 명시된 패키지 정사를 지키면서 참고 작품의 규칙과 한국의 실제 맥락을 함께 대조합니다.</p></div><div className="ai-context-hero-actions"><span className="ai-live-badge"><i />{project.aiWorldContext.enabled ? "CONTEXT ON" : "CONTEXT OFF"}</span><button type="button" className="context-preset-button" onClick={applyKoreanGrailPreset}><Sparkles size={15} /> 한국 성배전쟁 예시</button></div></header>
      <div className="ai-context-layout">
        <div className="ai-context-main">
          <Panel title="핵심 세계관 신호" note="시뮬레이터 API가 무엇을 기준으로 추론해야 하는지 먼저 고정합니다." badge="API CONTEXT"><div className="ai-context-switches"><Toggle checked={project.aiWorldContext.enabled} onChange={(enabled) => setContext({ enabled })} label="AI 세계관 고려 활성화" note="ScenarioPack에 실행 규칙을 포함합니다." /><Toggle checked={project.aiWorldContext.liveEvaluation} onChange={(liveEvaluation) => setContext({ liveEvaluation })} label="실시간 재평가" note="선택한 시점마다 최신 사건·장부와 다시 대조합니다." /></div><Field label="핵심 전제" value={project.aiWorldContext.premise} onChange={(premise) => setContext({ premise })} placeholder="예: 현대 한국에서 열리는 비밀 성배전쟁" required /><div className="form-grid two-col"><Area label="참고 작품·세계관·장르 틀" value={project.aiWorldContext.referenceFramework} onChange={(referenceFramework) => setContext({ referenceFramework })} placeholder="예: Fate 시리즈의 성배전쟁 구조와 마술사회" /><Area label="참고 설정 활용 방식" value={project.aiWorldContext.referenceUsage} onChange={(referenceUsage) => setContext({ referenceUsage })} /><Area label="지역·시대·사회문화 맥락" value={project.aiWorldContext.localContext} onChange={(localContext) => setContext({ localContext })} placeholder="예: 서울의 지형·교통·CCTV·행정·군경·종교 환경" /><Area label="AI가 풍부하게 만들 항목" value={project.aiWorldContext.enrichmentPriorities} onChange={(enrichmentPriorities) => setContext({ enrichmentPriorities })} /></div></Panel>
          <Panel title="기존 캐릭터 실시간 조사" note="2차 창작에 등장하는 원작 인물을 검색해 성격·말투·능력과 시점별 상태를 근거와 함께 세션에 고정합니다." badge="REFERENCE LOOKUP"><div className="reference-research-card"><div className="reference-research-head"><span><Search size={17} /></span><div><b>검색 → 검증 → 세션 캐시</b><small>공식 자료를 먼저 확인하고 현재 패키지의 각색 설정과 충돌하는 부분은 자동으로 덮어쓰지 않습니다.</small></div></div><div className="ai-context-switches"><Toggle checked={project.aiWorldContext.referenceCharacterResearch.enabled} onChange={(enabled) => setCharacterResearch({ enabled })} label="기존 캐릭터 조사" note="지정한 원작 인물의 캐릭터성을 실시간 반영합니다." /><Toggle checked={project.aiWorldContext.referenceCharacterResearch.allowWebSearch} onChange={(allowWebSearch) => setCharacterResearch({ allowWebSearch })} label="웹 검색 도구 사용" note="시뮬레이터 API에 검색 도구가 있을 때만 실행합니다." /></div><Area label="조사할 기존 작품 캐릭터" value={project.aiWorldContext.referenceCharacterResearch.characterNames} onChange={(characterNames) => setCharacterResearch({ characterNames })} placeholder={"한 줄에 한 명씩 입력\n예: 프란체스카 프렐라티\n카독 젬루푸스\n올가마리 아니무스피어"} /><div className="form-grid two-col"><Area label="조사·반영 범위" value={project.aiWorldContext.referenceCharacterResearch.researchScope} onChange={(researchScope) => setCharacterResearch({ researchScope })} /><Area label="출처 우선순위" value={project.aiWorldContext.referenceCharacterResearch.sourcePriority} onChange={(sourcePriority) => setCharacterResearch({ sourcePriority })} /></div><div className="reference-research-options"><Field label="원작 시점·스포일러 기준" value={project.aiWorldContext.referenceCharacterResearch.canonCutoff} onChange={(canonCutoff) => setCharacterResearch({ canonCutoff })} /><Select label="검색 결과 캐시" value={project.aiWorldContext.referenceCharacterResearch.cacheMode} onChange={(cacheMode) => setCharacterResearch({ cacheMode: cacheMode as Project["aiWorldContext"]["referenceCharacterResearch"]["cacheMode"] })} options={[{ value: "session", label: "세션 동안 고정" }, { value: "scene", label: "장면마다 재검증" }, { value: "none", label: "캐시하지 않음" }]} /></div><div className="reference-research-flags"><Toggle checked={project.aiWorldContext.referenceCharacterResearch.verifyOnFirstAppearance} onChange={(verifyOnFirstAppearance) => setCharacterResearch({ verifyOnFirstAppearance })} label="첫 등장 전 확인" note="성격·말투·호칭과 능력 한계를 검증" /><Toggle checked={project.aiWorldContext.referenceCharacterResearch.verifyOnCanonConflict} onChange={(verifyOnCanonConflict) => setCharacterResearch({ verifyOnCanonConflict })} label="정사 충돌 시 재검색" note="서로 다른 작품·시점·번역 표기를 구분" /><Toggle checked={project.aiWorldContext.referenceCharacterResearch.recordSourcesInLedger} onChange={(recordSourcesInLedger) => setCharacterResearch({ recordSourcesInLedger })} label="출처 장부 기록" note="URL·확인 시각·채택 사실·충돌을 GM 장부에 저장" /></div></div></Panel>
          <Panel title="정사와 창작의 경계" note="참고 설정이 현재 패키지의 인물·사건을 덮어쓰거나 스포일러를 앞당기지 못하게 합니다." badge="CANON GUARD"><div className="form-grid two-col"><Area secret label="반드시 지킬 현재 정사" value={project.aiWorldContext.protectedCanon} onChange={(protectedCanon) => setContext({ protectedCanon })} /><Area label="피해야 할 요소" value={project.aiWorldContext.avoidElements} onChange={(avoidElements) => setContext({ avoidElements })} /><Area label="독자성 규칙" value={project.aiWorldContext.originalityRule} onChange={(originalityRule) => setContext({ originalityRule })} /><Area secret label="스포일러·진명 공개 규칙" value={project.aiWorldContext.spoilerRule} onChange={(spoilerRule) => setContext({ spoilerRule })} /></div></Panel>
        </div>
        <aside className="ai-context-runtime"><header><div><span>SIMULATOR PIPELINE</span><b>API 판단 루프</b></div><span className="runtime-api-chip"><Zap size={12} /> API</span></header><div className="context-runtime-step"><span>01</span><div><b>현재 장부 읽기</b><small>정사·사건·관계 기억·NPC 위치를 먼저 확인</small></div></div><div className="context-runtime-step"><span>02</span><div><b>참고 세계관 대조</b><small>원작 계통의 규칙과 장르적 기대를 구조적으로 참고</small></div></div><div className="context-runtime-step"><span>03</span><div><b>현지화·개연성 보강</b><small>한국의 장소·역사·기관·일상에 맞는 결과만 채택</small></div></div><div className="context-runtime-step"><span>04</span><div><b>정사·스포일러 검문</b><small>패키지 우선순위와 플레이어의 관측 범위를 마지막 확인</small></div></div><div className="ai-context-selects"><Select label="API 지식 사용" value={project.aiWorldContext.knowledgePolicy} onChange={(knowledgePolicy) => setContext({ knowledgePolicy: knowledgePolicy as Project["aiWorldContext"]["knowledgePolicy"] })} options={[{ value: "hybrid", label: "패키지 + 모델 지식" }, { value: "model_knowledge", label: "모델 지식 적극 참고" }, { value: "package_only", label: "패키지 내용만 사용" }]} /><Select label="보강 깊이" value={project.aiWorldContext.updateDepth} onChange={(updateDepth) => setContext({ updateDepth: updateDepth as Project["aiWorldContext"]["updateDepth"] })} options={[{ value: "light", label: "가볍게 · 핵심만" }, { value: "balanced", label: "균형 · 장면 단위" }, { value: "deep", label: "깊게 · 설정과 후폭풍" }]} /></div><div className="context-moment-list"><span>재평가 시점</span>{momentLabels.map(([key, label, note]) => <Toggle key={key} checked={project.aiWorldContext.evaluationMoments[key]} onChange={(value) => setMoment(key, value)} label={label} note={note} />)}</div><footer><ShieldCheck size={15} /><span>우선순위: 현재 패키지 정사 → 현재 장부 → 참고 설정 → AI 보완</span></footer></aside>
      </div>
    </section>
    <div className="world-grid">{worldFields.filter(([key]) => ["overview", "fixedCanon", "impossibilities", "aiFillConstraints"].includes(key)).map(([key, label, help], index) => <Panel key={key} title={key === "overview" ? "세계관" : label} note={key === "overview" ? "역사, 정치, 경제, 사회·문화, 종교·이념, 기술, 군사, 교통·통신, 화폐·물가, 초자연적 능력 등 필요한 분야를 자유롭게 적어 주세요. 구체적인 배경이 담길수록 패키지가 더 풍부해집니다. 모든 분야를 채울 필요는 없습니다." : help} badge={index < 2 ? "핵심" : index > 10 ? "정사 잠금" : undefined} wide={key === "overview" || key === "fixedCanon"}><textarea className="editor-area" aria-label={key === "overview" ? "세계관 자유 작성" : label} value={key === "overview" ? worldProse(project.world) : project.world[key] ?? ""} onChange={(e) => setWorld(key, e.target.value)} placeholder={`${label}을 입력하세요…`} /><div className="character-count">{(project.world[key] ?? "").length.toLocaleString()}자</div></Panel>)}</div>
  </PageFrame>;
}

const importanceOptions = [{ value: "protagonist", label: "주인공" }, { value: "major", label: "주요 인물" }, { value: "supporting", label: "조연" }, { value: "minor", label: "단역" }];

export function CharactersSection({ project, setProject, notify }: { project: Project; setProject: Setter; notify: Notify }) {
  const [selectedId, setSelectedId] = useState(project.player.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const characters = [project.player, ...project.npcs];
  const selected = characters.find((character) => character.id === selectedId) ?? project.player;
  const update = (patch: Partial<Character>) => setProject((current) => selected.isPlayer ? ({ ...current, player: { ...current.player, ...patch } }) : ({ ...current, npcs: current.npcs.map((character) => character.id === selected.id ? { ...character, ...patch } : character) }));
  const addNpc = () => { const character = blankCharacter(false); setProject((current) => ({ ...current, npcs: [...current.npcs, character] })); setSelectedId(character.id); notify("새 주요 인물을 추가했습니다."); };
  const removeNpc = () => { if (selected.isPlayer || !confirm(`${selected.name}을 삭제할까요? 관계 참조는 검증에서 확인할 수 있습니다.`)) return; setProject((current) => ({ ...current, npcs: current.npcs.filter((character) => character.id !== selected.id) })); setSelectedId(project.player.id); };
  const handleImages = async (files: FileList | null) => {
    if (!files) return;
    const remaining = Math.max(0, 6 - selected.images.length);
    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, remaining);
    if (!accepted.length) { notify("이미지는 한 장당 8MB 이하, 인물당 최대 6장까지 등록할 수 있습니다."); return; }
    const loaded = accepted.map((file, index): Character["images"][number] => ({ id: uid("IMG"), fileName: file.name, mimeType: file.type, dataUrl: URL.createObjectURL(file), sourceBlob: file, byteLength: file.size, label: selected.images.length + index ? "표정·의상 참고" : "대표 기준 이미지", isPrimary: selected.images.length + index === 0, addedAt: new Date().toISOString() }));
    update({ images: [...selected.images, ...loaded] }); notify(`${loaded.length}개의 기준 이미지를 추가했습니다.`);
  };
  const primary = selected.images.find((image) => image.isPrimary) ?? selected.images[0];
  return <PageFrame eyebrow="CHARACTER VISUAL BIBLE" title="인물의 얼굴을 정사로 고정하세요" description="프로필과 기준 이미지를 한 곳에서 연결해 첫 등장과 이후 장면의 외형을 일관되게 유지합니다." actions={<button className="primary-button" onClick={addNpc}><Plus size={15} /> 인물 추가</button>}>
    <div className="character-layout"><aside className="character-list"><div className="character-list-head"><b>등장인물</b><span>{characters.length}</span></div>{characters.map((character) => { const thumb = character.images.find((image) => image.isPrimary) ?? character.images[0]; return <button key={character.id} className={selected.id === character.id ? "active" : ""} onClick={() => setSelectedId(character.id)}>{thumb ? <img src={thumb.dataUrl} alt="" /> : <span className="avatar-fallback">{character.name.slice(0, 1)}</span>}<span><b>{character.name}</b><small>{importanceOptions.find((item) => item.value === character.importance)?.label} · {character.role}</small></span>{character.images.length > 0 && <ImageIcon size={13} />}</button>; })}<button className="add-character" onClick={addNpc}><Plus size={16} /> 새 인물</button></aside>
      <div className="character-editor"><section className="character-cover"><div className="portrait-frame">{primary ? <img src={primary.dataUrl} alt={`${selected.name} 대표 이미지`} /> : <div className="portrait-empty"><UserRound size={42} /><span>기준 이미지 없음</span></div>}<span className="importance-badge">{importanceOptions.find((item) => item.value === selected.importance)?.label}</span></div><div className="character-title"><span>CHARACTER · {selected.id}</span><h2>{selected.name}</h2><p>{selected.role || "역할 미설정"} · {selected.affiliation || "소속 미설정"}</p><div className="cover-actions"><button className="primary-button" onClick={() => inputRef.current?.click()}><ImagePlus size={15} /> 이미지 추가</button>{!selected.isPlayer && <button className="danger-button" onClick={removeNpc}><Trash2 size={15} /> 인물 삭제</button>}</div></div></section>
        <input ref={inputRef} hidden type="file" multiple accept="image/*" onChange={(event) => { void handleImages(event.target.files); event.target.value = ""; }} />
        <Panel title="기준 이미지" note="iPhone 사진 보관함을 지원합니다. 장당 8MB 이하, 대표 1장과 표정·의상 참고 최대 5장을 권장합니다." badge={`${selected.images.length}/6`}>
          <div className="image-library">{selected.images.map((image) => <div className={`reference-image ${image.isPrimary ? "primary" : ""}`} key={image.id}><img src={image.dataUrl} alt={image.label} /><div className="image-overlay"><button title="대표 이미지 지정" onClick={() => update({ images: selected.images.map((item) => ({ ...item, isPrimary: item.id === image.id })) })}><Star size={15} fill={image.isPrimary ? "currentColor" : "none"} /></button><button title="이미지 삭제" onClick={() => { const next = selected.images.filter((item) => item.id !== image.id); if (image.isPrimary && next[0]) next[0] = { ...next[0], isPrimary: true }; update({ images: next }); }}><X size={16} /></button></div><input value={image.label} onChange={(event) => update({ images: selected.images.map((item) => item.id === image.id ? { ...item, label: event.target.value } : item) })} />{image.isPrimary && <span>대표</span>}</div>)}{selected.images.length < 6 && <button className="image-drop" onClick={() => inputRef.current?.click()}><ImagePlus size={24} /><b>이미지 추가</b><small>클릭하여 선택</small></button>}</div>
        </Panel>
        <div className="form-grid two-col character-forms"><Panel title="기본 프로필"><div className="field-row"><Field label="이름" value={selected.name} onChange={(name) => update({ name })} required /><Select label="비중" value={selected.importance} onChange={(importance) => update({ importance: importance as Character["importance"] })} options={importanceOptions} /></div><div className="field-row three"><Field label="나이" value={selected.age} onChange={(age) => update({ age })} /><Field label="성별" value={selected.gender} onChange={(gender) => update({ gender })} /><Field label="출신" value={selected.origin} onChange={(origin) => update({ origin })} /></div><div className="field-row"><Field label="역할" value={selected.role} onChange={(role) => update({ role })} /><Field label="신분·직업" value={selected.occupation} onChange={(occupation) => update({ occupation })} /></div><Field label="소속" value={selected.affiliation} onChange={(affiliation) => update({ affiliation })} /><Area label="외형 묘사" value={selected.appearance} onChange={(appearance) => update({ appearance })} /></Panel>
          <Panel title="외형 일관성" badge="VISUAL LOCK"><Area label="외형 앵커" value={selected.visualAnchor} onChange={(visualAnchor) => update({ visualAnchor })} placeholder="머리, 눈, 얼굴형, 체형, 고유 액세서리처럼 반드시 유지할 특징" /><Toggle checked={selected.imageOnFirstAppearance} onChange={(imageOnFirstAppearance) => update({ imageOnFirstAppearance })} label="첫 등장 시 인물 이미지 필수" note="비중 높은 인물이 처음 등장하면 이미지가 반드시 함께 나옵니다." /><Toggle checked={selected.visualLock} onChange={(visualLock) => update({ visualLock })} label="외형 정사 잠금" note="이후 이미지에서도 기준 이미지와 외형 앵커를 유지합니다." /><Select label="기준 이미지가 없을 때" value={selected.imageFallback} onChange={(imageFallback) => update({ imageFallback: imageFallback as Character["imageFallback"] })} options={[{ value: "generate_anime", label: "애니풍 이미지 생성 후 최초 결과 고정" }, { value: "prompt_only", label: "이미지 프롬프트만 출력" }, { value: "none", label: "이미지 생략" }]} /></Panel>
          <Panel title="성격과 행동 원리"><Area label="성격" value={selected.personality} onChange={(personality) => update({ personality })} /><Area label="가치관" value={selected.values} onChange={(values) => update({ values })} /><Area label="말투" value={selected.speechStyle} onChange={(speechStyle) => update({ speechStyle })} /><Area label="목표" value={selected.goals} onChange={(goals) => update({ goals })} /></Panel>
          <Panel title="능력과 정보"><Area label="능력·기술" value={selected.skills} onChange={(skills) => update({ skills })} /><Area label="약점·제약" value={selected.weaknesses} onChange={(weaknesses) => update({ weaknesses })} /><Area label="공개 정보" value={selected.publicInfo} onChange={(publicInfo) => update({ publicInfo })} /><Area secret label="GM 숨은 정보" value={selected.hiddenInfo} onChange={(hiddenInfo) => update({ hiddenInfo })} /></Panel>
        </div>
      </div>
    </div>
    <Panel title="전체 비주얼 규칙" note="개별 캐릭터 설정보다 상위에 적용되는 이미지 생성 규칙입니다." wide><div className="form-grid two-col"><Area label="공통 이미지 스타일" value={project.visualBible.globalStyle} onChange={(globalStyle) => setProject((current) => ({ ...current, visualBible: { ...current.visualBible, globalStyle } }))} /><Area label="외형 일관성 규칙" value={project.visualBible.consistencyRules} onChange={(consistencyRules) => setProject((current) => ({ ...current, visualBible: { ...current.visualBible, consistencyRules } }))} /><Area label="첫 등장 규칙" value={project.visualBible.introductionRule} onChange={(introductionRule) => setProject((current) => ({ ...current, visualBible: { ...current.visualBible, introductionRule } }))} /><Toggle checked={project.visualBible.enabled} onChange={(enabled) => setProject((current) => ({ ...current, visualBible: { ...current.visualBible, enabled } }))} label="비주얼 바이블 사용" note="비활성화하면 이미지 파일은 보관되지만 자동 출력 지시는 적용하지 않습니다." /></div></Panel>
  </PageFrame>;
}

export function RelationsSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const [tab, setTab] = useState("characters");
  const allCharacters = [project.player, ...project.npcs];
  const addCharacterRelation = () => { const relation: CharacterRelation = { id: uid("REL"), sourceId: project.player.id, targetId: project.npcs[0]?.id ?? project.player.id, relationType: "동료", trust: 0, favor: 0, fear: 0, respect: 0, suspicion: 0, hostility: 0, dependency: 0, publicSummary: "", hiddenNotes: "" }; setProject((current) => ({ ...current, characterRelations: [...current.characterRelations, relation] })); };
  const addFaction = () => { const faction: Faction = { id: uid("FAC"), name: "새 세력", leader: "", officialGoal: "", hiddenGoal: "", resources: "", territory: "", income: "", militaryPower: "", intelligencePower: "", politicalPower: "", internalConflict: "", allies: "", enemies: "", playerRelation: "", currentPlan: "" }; setProject((current) => ({ ...current, factions: [...current.factions, faction] })); };
  const addFactionRelation = () => { const relation: FactionRelation = { id: uid("FREL"), sourceFactionId: project.factions[0]?.id ?? "", targetFactionId: project.factions[1]?.id ?? project.factions[0]?.id ?? "", status: "중립", cooperation: 0, tension: 0, dependency: 0, publicSummary: "", hiddenNotes: "" }; setProject((current) => ({ ...current, factionRelations: [...current.factionRelations, relation] })); };
  return <PageFrame eyebrow="RELATIONSHIP SYSTEM" title="관계는 언제나 방향을 가집니다" description="A가 B를 신뢰하는 정도와 B가 A를 신뢰하는 정도를 분리하고, 세력의 이해관계를 독립적으로 움직이게 합니다.">
    <Tabs active={tab} onChange={setTab} items={[{ id: "characters", label: "인물 관계", count: project.characterRelations.length }, { id: "factions", label: "세력", count: project.factions.length }, { id: "faction-relations", label: "세력 관계", count: project.factionRelations.length }]} />
    {tab === "characters" && <div className="stack-list"><button className="add-wide" onClick={addCharacterRelation}><Plus size={16} /> 인물 관계 추가</button>{project.characterRelations.map((relation) => { const update = (patch: Partial<CharacterRelation>) => setProject((current) => ({ ...current, characterRelations: current.characterRelations.map((item) => item.id === relation.id ? { ...item, ...patch } : item) })); return <Panel key={relation.id} title={`${allCharacters.find((c) => c.id === relation.sourceId)?.name ?? "미지정"} → ${allCharacters.find((c) => c.id === relation.targetId)?.name ?? "미지정"}`} badge={relation.relationType} actions={<button className="icon-danger" onClick={() => setProject((current) => ({ ...current, characterRelations: current.characterRelations.filter((item) => item.id !== relation.id) }))}><Trash2 size={15} /></button>}><div className="field-row three"><Select label="출발 인물" value={relation.sourceId} onChange={(sourceId) => update({ sourceId })} options={allCharacters.map((c) => ({ value: c.id, label: c.name }))} /><Select label="도착 인물" value={relation.targetId} onChange={(targetId) => update({ targetId })} options={allCharacters.map((c) => ({ value: c.id, label: c.name }))} /><Field label="관계 유형" value={relation.relationType} onChange={(relationType) => update({ relationType })} /></div><div className="relation-sliders">{(["trust", "favor", "fear", "respect", "suspicion", "hostility", "dependency"] as const).map((key) => <label key={key}><span>{({ trust: "신뢰", favor: "호감", fear: "공포", respect: "존경", suspicion: "의심", hostility: "적대", dependency: "의존" } as const)[key]}<b>{relation[key]}</b></span><input type="range" min="-100" max="100" value={relation[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} /></label>)}</div><div className="field-row"><Area label="공개 관계 요약" value={relation.publicSummary} onChange={(publicSummary) => update({ publicSummary })} /><Area secret label="GM 비공개 메모" value={relation.hiddenNotes} onChange={(hiddenNotes) => update({ hiddenNotes })} /></div></Panel>; })}{!project.characterRelations.length && <Empty icon={<Link2 />} text="인물 관계가 없습니다. 방향성 관계를 하나 추가해 보세요." />}</div>}
    {tab === "factions" && <div className="stack-list"><button className="add-wide" onClick={addFaction}><Plus size={16} /> 세력 추가</button>{project.factions.map((faction) => { const update = (patch: Partial<Faction>) => setProject((current) => ({ ...current, factions: current.factions.map((item) => item.id === faction.id ? { ...item, ...patch } : item) })); return <Panel key={faction.id} title={faction.name} note={`ID · ${faction.id}`} actions={<button className="icon-danger" onClick={() => setProject((current) => ({ ...current, factions: current.factions.filter((item) => item.id !== faction.id) }))}><Trash2 size={15} /></button>}><div className="field-row"><Field label="세력명" value={faction.name} onChange={(name) => update({ name })} /><Field label="지도자" value={faction.leader} onChange={(leader) => update({ leader })} /></div><div className="form-grid two-col"><Area label="공식 목표" value={faction.officialGoal} onChange={(officialGoal) => update({ officialGoal })} /><Area secret label="숨은 목표" value={faction.hiddenGoal} onChange={(hiddenGoal) => update({ hiddenGoal })} /><Area label="자원" value={faction.resources} onChange={(resources) => update({ resources })} /><Area label="통제 지역" value={faction.territory} onChange={(territory) => update({ territory })} /><Area label="내부 갈등" value={faction.internalConflict} onChange={(internalConflict) => update({ internalConflict })} /><Area secret label="현재 비공개 계획" value={faction.currentPlan} onChange={(currentPlan) => update({ currentPlan })} /></div><div className="field-row three"><Field label="군사력" value={faction.militaryPower} onChange={(militaryPower) => update({ militaryPower })} /><Field label="정보력" value={faction.intelligencePower} onChange={(intelligencePower) => update({ intelligencePower })} /><Field label="정치력" value={faction.politicalPower} onChange={(politicalPower) => update({ politicalPower })} /></div></Panel>; })}</div>}
    {tab === "faction-relations" && <div className="stack-list"><button className="add-wide" onClick={addFactionRelation} disabled={!project.factions.length}><Plus size={16} /> 세력 관계 추가</button>{project.factionRelations.map((relation) => { const update = (patch: Partial<FactionRelation>) => setProject((current) => ({ ...current, factionRelations: current.factionRelations.map((item) => item.id === relation.id ? { ...item, ...patch } : item) })); return <Panel key={relation.id} title={`${project.factions.find((f) => f.id === relation.sourceFactionId)?.name ?? "미지정"} → ${project.factions.find((f) => f.id === relation.targetFactionId)?.name ?? "미지정"}`} badge={relation.status} actions={<button className="icon-danger" onClick={() => setProject((current) => ({ ...current, factionRelations: current.factionRelations.filter((item) => item.id !== relation.id) }))}><Trash2 size={15} /></button>}><div className="field-row three"><Select label="출발 세력" value={relation.sourceFactionId} onChange={(sourceFactionId) => update({ sourceFactionId })} options={project.factions.map((f) => ({ value: f.id, label: f.name }))} /><Select label="도착 세력" value={relation.targetFactionId} onChange={(targetFactionId) => update({ targetFactionId })} options={project.factions.map((f) => ({ value: f.id, label: f.name }))} /><Field label="관계 상태" value={relation.status} onChange={(status) => update({ status })} /></div><div className="relation-sliders three">{(["cooperation", "tension", "dependency"] as const).map((key) => <label key={key}><span>{({ cooperation: "협력", tension: "긴장", dependency: "의존" } as const)[key]}<b>{relation[key]}</b></span><input type="range" min={key === "cooperation" ? -100 : 0} max="100" value={relation[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} /></label>)}</div><div className="field-row"><Area label="공개 관계 요약" value={relation.publicSummary} onChange={(publicSummary) => update({ publicSummary })} /><Area secret label="GM 비공개 메모" value={relation.hiddenNotes} onChange={(hiddenNotes) => update({ hiddenNotes })} /></div></Panel>; })}</div>}
  </PageFrame>;
}

export function StorySection({ project, setProject, notify }: { project: Project; setProject: Setter; notify: Notify }) {
  const [tab, setTab] = useState("events");
  const triggerImageInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const allCharacters = [project.player, ...project.npcs];
  const playableEvents = project.events.filter((event) => event.kind !== "constraint");
  const isCortexCanon = project.packageTarget === "cortex" && project.runtimeMode === "intelligent_canon";
  const addEvent = (kind: StoryEvent["kind"] = "event") => {
    const event = blankStoryEvent(playableEvents.length + 1);
    event.kind = kind;
    if (kind === "constraint") {
      event.id = uid("CONSTRAINT"); event.name = "새 장면 제약"; event.required = false;
      event.rules = [""]; event.appliesTo = [];
    }
    if (kind === "compound") {
      if (!isCortexCanon) event.id = uid("COMPOUND");
      event.name = "새 복합 사건"; event.required = true;
      event.beats = isCortexCanon ? [blankStoryBeat(1), blankStoryBeat(2), blankStoryBeat(3)] : [blankStoryBeat(1), blankStoryBeat(2)];
    } else if (kind === "event" && isCortexCanon) {
      event.beats = [blankStoryBeat(1), blankStoryBeat(2), blankStoryBeat(3)];
    }
    setProject((current) => ({ ...current, events: [...current.events, event] }));
  };
  const addClock = () => { const clock: EventClock = { id: uid("CLOCK"), name: "새 사건 시계", visibility: "Hidden", status: "Active", current: 0, maximum: 6, relatedEventId: "", advanceRules: "", regressRules: "", triggerResult: "", publicHint: "", hiddenNotes: "" }; setProject((current) => ({ ...current, eventClocks: [...current.eventClocks, clock] })); };
  const addForeshadow = () => { const item: Foreshadowing = { id: uid("FSH"), title: "새 장기 복선", visibility: "Hidden", status: "Planned", earliestDate: "", latestDate: "", plantingScene: "", reinforcementPlan: "", payoffConditions: "", payoffResult: "", relatedEntities: "", misdirection: "", notes: "" }; setProject((current) => ({ ...current, foreshadowings: [...current.foreshadowings, item] })); };
  const addImageTrigger = () => {
    const trigger = { ...blankImageTrigger(), sourceId: playableEvents[0]?.id ?? "" };
    setProject((current) => ({ ...current, imageTriggers: [...current.imageTriggers, trigger] }));
    setTab("image-triggers");
  };
  const handleTriggerImages = async (triggerId: string, files: FileList | File[]) => {
    const trigger = project.imageTriggers.find((item) => item.id === triggerId);
    if (!trigger) return;
    const remaining = Math.max(0, 4 - trigger.attachedImages.length);
    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, remaining);
    if (!accepted.length) { notify("이미지는 한 장당 8MB 이하, 트리거당 최대 4장까지 등록할 수 있습니다."); return; }
    try {
      const loaded = accepted.map((file, index): ImageTrigger["attachedImages"][number] => ({ id: uid("TRGIMG"), fileName: file.name, mimeType: file.type, dataUrl: URL.createObjectURL(file), sourceBlob: file, byteLength: file.size, label: trigger.attachedImages.length + index === 0 ? "대표 전개 이미지" : "보조 전개 이미지", isPrimary: trigger.attachedImages.length + index === 0, addedAt: new Date().toISOString() }));
      setProject((current) => ({ ...current, imageTriggers: current.imageTriggers.map((item) => item.id === triggerId ? { ...item, mode: "show_trigger_image", attachedImages: [...item.attachedImages, ...loaded] } : item) }));
      notify(`${loaded.length}장의 전개 이미지를 연결하고 전용 이미지 표시 모드로 전환했습니다.`);
    } catch { notify("이미지를 읽지 못했습니다. 다른 이미지 파일로 다시 시도해 주세요."); }
  };
  const triggerLabels: Record<ImageTrigger["triggerType"], string> = {
    event_start: "사건 활성화 시",
    event_condition_met: "사건 조건 충족 시",
    event_success: "사건 성공 시",
    event_failure: "사건 실패 시",
    clock_value: "시계 특정 값 도달",
    clock_completed: "사건 시계 완료",
    foreshadow_revealed: "복선 공개 시",
    story_progress: "스토리 진행 지점",
    custom_condition: "사용자 지정 조건",
  };
  const modeLabels: Record<ImageTrigger["mode"], string> = {
    generate_scene: "새 장면 이미지 생성",
    generate_character_variant: "캐릭터 변형 컷 생성",
    show_trigger_image: "불러온 전개 이미지 표시",
    show_package_image: "패키지 기준 이미지 표시",
  };
  return <PageFrame eyebrow="STORY ENGINE" title="결정적 전개를 한 장면으로 남기세요" description="사건·시계·복선을 추적하고, 정확한 조건이 충족되는 순간 불러온 이미지 표시 또는 새 장면 이미지 생성을 실행합니다."><Tabs active={tab} onChange={setTab} items={[{ id: "events", label: "사건·제약", count: project.events.length }, { id: "clocks", label: "사건 시계", count: project.eventClocks.length }, { id: "foreshadows", label: "장기 복선", count: project.foreshadowings.length }, { id: "image-triggers", label: "이미지 트리거", count: project.imageTriggers.length }]} />
    {tab === "events" && (isCortexCanon ? <CortexEventsEditor project={project} setProject={setProject} notify={notify} /> : <div className="stack-list">
      <div className="trigger-intro">
        <div className="trigger-intro-icon"><ShieldCheck size={22} /></div>
        <div><span>DETERMINISTIC STORY CONTRACT</span><b>사건·장면 제약·교차 비트를 서로 다른 데이터로 고정합니다.</b><p>일반 사건은 순서대로 봉인하고, 장면 제약은 지정 사건 동안 항상 적용합니다. 동시에 벌어지는 전투나 시점 교차는 복합 사건의 비트 순서로 설계하세요.</p></div>
        <div className="story-add-actions"><button className="primary-button" onClick={() => addEvent("event")}><Plus size={15} /> 일반 사건</button><button className="soft-button" onClick={() => addEvent("constraint")}><Lock size={15} /> 장면 제약</button><button className="soft-button" onClick={() => addEvent("compound")}><RefreshCw size={15} /> 복합 사건</button></div>
      </div>
      {project.events.map((event) => {
        const update = (patch: Partial<StoryEvent>) => setProject((current) => ({ ...current, events: current.events.map((item) => item.id === event.id ? { ...item, ...patch } : item) }));
        const remove = () => setProject((current) => ({ ...current, events: current.events.filter((item) => item.id !== event.id).map((item) => ({ ...item, appliesTo: item.appliesTo.filter((id) => id !== event.id) })) }));
        const kindLabel = event.kind === "constraint" ? "장면 제약" : event.kind === "compound" ? "복합 사건" : "일반 사건";
        return <Panel key={event.id} title={event.name} badge={`${kindLabel}${event.kind !== "constraint" && event.required ? ` · 필수 ${event.sequence}` : ""} · ${event.visibility}`} actions={<button className="icon-danger" aria-label={`${event.name} 삭제`} onClick={remove}><Trash2 size={15} /></button>}>
            <div className="field-row three"><Field label={event.kind === "constraint" ? "제약 이름" : "사건명"} value={event.name} onChange={(name) => update({ name })} /><Select label="데이터 종류" value={event.kind} onChange={(kind) => update({ kind: kind as StoryEvent["kind"], required: kind === "constraint" ? false : event.required, beats: kind !== "constraint" && !event.beats.length ? (isCortexCanon ? [blankStoryBeat(1), blankStoryBeat(2), blankStoryBeat(3)] : kind === "compound" ? [blankStoryBeat(1), blankStoryBeat(2)] : []) : event.beats })} options={[{ value: "event", label: "일반 사건" }, { value: "constraint", label: "장면 제약" }, { value: "compound", label: "복합 사건 · 비트 교차" }]} /><Select label="공개 범위" value={event.visibility} onChange={(visibility) => update({ visibility: visibility as StoryEvent["visibility"] })} options={["Public", "Hidden"]} /></div>

          {event.kind === "constraint" ? <>
            <div className="constraint-targets"><span>적용 대상 사건</span><p>선택하지 않으면 모든 사건에 적용됩니다.</p><div>{playableEvents.map((target) => <label key={target.id}><input type="checkbox" checked={event.appliesTo.includes(target.id)} onChange={(e) => update({ appliesTo: e.target.checked ? [...event.appliesTo, target.id] : event.appliesTo.filter((id) => id !== target.id) })} /><b>{target.name}</b><small>{target.kind === "compound" ? "복합" : `순서 ${target.sequence}`}</small></label>)}</div></div>
            <Area secret label="항상 지킬 규칙 · 줄바꿈 구분" value={event.rules.join("\n")} onChange={(value) => update({ rules: value.split("\n") })} placeholder="히시리와 테슬라는 서로 모르는 사람처럼 행동한다.\n마스터·Archer·계약 관계를 공개하지 않는다." />
          </> : <>
            <div className="field-row three"><Select label="사건 유형" value={event.type} onChange={(type) => update({ type: type as StoryEvent["type"] })} options={["Fixed", "Conditional", "Random", "Foreshadowing"]} /><Select label="상태" value={event.status} onChange={(status) => update({ status: status as StoryEvent["status"] })} options={["Planned", "Active", "Paused", "Completed", "Cancelled"]} />{isCortexCanon ? <Field label="막 키 · act" value={event.act} onChange={(act) => update({ act })} placeholder="ACT1" /> : <Field label="발생 가능 시기" value={event.timeWindow} onChange={(timeWindow) => update({ timeWindow })} />}</div>
            {isCortexCanon && <><div className="field-row"><Select label="다음 사건 · nextEventId" value={event.nextEventId} onChange={(nextEventId) => update({ nextEventId })} options={[{ value: "", label: "배열 순서 사용" }, ...playableEvents.filter((candidate) => candidate.id !== event.id).map((candidate) => ({ value: candidate.id, label: candidate.name }))]} /><Area secret label="봉인 때 공개할 용어 · revealTerms" value={event.revealTerms.join("\n")} onChange={(value) => update({ revealTerms: splitTerms(value) })} placeholder="protectedTerms와 정확히 같은 표기" /></div></>}
            <div className="field-row"><Field label="우선순위 · 최대 100" type="number" min={0} max={100} value={event.priority} onChange={(priority) => update({ priority: Math.max(0, Math.min(100, Number(priority))) })} /><Field label="관련 인물·세력" value={event.participants} onChange={(participants) => update({ participants })} /></div>
            <div className="form-grid two-col"><Area label="발생 조건" value={event.conditions} onChange={(conditions) => update({ conditions })} /><Area label="취소 조건" value={event.cancelConditions} onChange={(cancelConditions) => update({ cancelConditions })} /><Area label="직접 효과" value={event.effects} onChange={(effects) => update({ effects })} /><Area label="성공 시" value={event.onSuccess} onChange={(onSuccess) => update({ onSuccess })} /><Area label="실패 시" value={event.onFailure} onChange={(onFailure) => update({ onFailure })} />{isCortexCanon && <Area secret label="명시적 실패 판정 조건" value={event.failureConditions} onChange={(failureConditions) => update({ failureConditions })} placeholder="요건 미충족과 별개로 실패를 확정할 관측 가능한 조건" />}<Area label="후속 사건·후폭풍" value={event.followUp} onChange={(followUp) => update({ followUp })} /><Area label="장면 설명" value={event.description} onChange={(description) => update({ description })} /></div>
            {(event.kind === "compound" || isCortexCanon) && <div className="compound-editor"><div className="compound-head"><div><span>STRUCTURED BEATS</span><b>{isCortexCanon ? "Cortex 본편 예산은 정확히 3비트입니다." : "한 번에 한 비트만 진행합니다."}</b></div><button className="soft-button" onClick={() => update({ beats: [...event.beats, blankStoryBeat(event.beats.length + 1)] })}><Plus size={14} /> 비트 추가</button></div>{event.beats.map((beat, index) => { const updateBeat = (patch: Partial<typeof beat>) => update({ beats: event.beats.map((item) => item.id === beat.id ? { ...item, ...patch } : item) }); return <div className="beat-card" key={beat.id}><div className="beat-index">{String(index + 1).padStart(2, "0")}</div><div className="beat-fields"><div className="field-row"><Field label="시점 인물" value={beat.viewpoint} onChange={(viewpoint) => updateBeat({ viewpoint })} placeholder="예: 카독" /><Field label="비트 ID" value={beat.id} onChange={(id) => updateBeat({ id })} /></div><Area label="이번 비트에서 실제로 일어날 내용" value={beat.content} onChange={(content) => updateBeat({ content })} /></div><button className="icon-danger" disabled={event.beats.length <= (isCortexCanon ? 3 : 2)} onClick={() => update({ beats: event.beats.filter((item) => item.id !== beat.id) })}><Trash2 size={14} /></button></div>; })}</div>}
            <div className="trigger-options"><Toggle checked={event.playerCanIntervene} onChange={(playerCanIntervene) => update({ playerCanIntervene })} label="플레이어 개입 가능" /><Toggle checked={event.required} onChange={(required) => update({ required })} label="필수 사건 · 우회해도 결과 보존" />{event.required && <><Toggle checked={event.preservePlayerChoice} onChange={(preservePlayerChoice) => update({ preservePlayerChoice })} label="플레이어의 첫 선택 유지" /><Toggle checked={event.endSceneAfterCompletion} onChange={(endSceneAfterCompletion) => update({ endSceneAfterCompletion })} label="완료 뒤 같은 턴에서 다음 사건 금지" /></>}</div>
            {event.required && <><div className="field-row three"><Field label="필수 전개 순서" type="number" min={1} value={event.sequence} onChange={(sequence) => update({ sequence: Math.max(1, Number(sequence)) })} /><Select label="필수 대사 화자" value={event.requiredSpeakerId} onChange={(requiredSpeakerId) => update({ requiredSpeakerId })} options={[{ value: "", label: "화자 지정 안 함" }, ...allCharacters.filter((character) => !character.isPlayer).map((character) => ({ value: character.id, label: character.name }))]} /><Field label="필수 소품 · 쉼표 구분" value={event.requiredItems} onChange={(requiredItems) => update({ requiredItems })} placeholder="예: 황동열쇠, 불탄 고문서 조각" /></div>{isCortexCanon ? <div className="compound-editor"><div className="compound-head"><div><span>ATOMIC REQUIREMENTS</span><b>한 요건에 한 사실만 적고, 봉인 필수 요건은 1~3개로 제한합니다.</b></div><button type="button" className="soft-button" onClick={() => update({ requiredFunctions: [...event.requiredFunctions, blankCortexRequiredFunction(event.requiredFunctions.length + 1)] })}><Plus size={14} /> 종결조건 추가</button></div>{event.requiredFunctions.map((requirement, requirementIndex) => { const updateRequirement = (patch: Partial<CortexRequiredFunction>) => update({ requiredFunctions: event.requiredFunctions.map((item, index) => index === requirementIndex ? { ...item, ...patch } : item) }); return <div className="beat-card" key={`${requirement.id}-${requirementIndex}`}><div className="beat-index">{String(requirementIndex + 1).padStart(2, "0")}</div><div className="beat-fields"><div className="field-row"><Field label="요건 ID" value={requirement.id} onChange={(id) => updateRequirement({ id })} /><Select label="판정 유형" value={requirement.type} onChange={(type) => updateRequirement({ type: type as CortexRequiredFunction["type"] })} options={["PHYSICAL_FACT", "READER_UNDERSTANDING", "PLAYER_AGENCY", "NEGATIVE_CONSTRAINT"]} /></div><Area secret label="관측·인용 가능한 한 문장" value={requirement.description} onChange={(description) => updateRequirement({ description })} /><Area label="대안 표현 · 줄바꿈" value={requirement.alternatives.join("\n")} onChange={(value) => updateRequirement({ alternatives: splitTerms(value) })} placeholder="두 어절 이상의 서술형 후보" /></div><button type="button" className="icon-danger" onClick={() => update({ requiredFunctions: event.requiredFunctions.filter((_, index) => index !== requirementIndex) })}><Trash2 size={14} /></button></div>; })}</div> : <div className="form-grid two-col"><Area secret label="완료 판정 문구 · | 구분" value={event.completionSignals} onChange={(completionSignals) => update({ completionSignals })} placeholder="본문에 나타나야 완료로 보는 짧은 표현을 적으세요." /><Area secret label="정확히 출력할 필수 대사" value={event.requiredDialogue} onChange={(requiredDialogue) => update({ requiredDialogue })} placeholder="비우면 강제 대사가 없습니다." /><Area secret label="우회 복구 대안 · | 구분" value={event.recoveryAlternatives} onChange={(recoveryAlternatives) => update({ recoveryAlternatives })} placeholder="예: 인접 보관함 | NPC의 별도 전달 | 지연 발동" /></div>}</>}
          </>}
        </Panel>;
      })}
    </div>)}
    {tab === "clocks" && <div className="stack-list"><button className="add-wide" onClick={addClock}><Plus size={16} /> 사건 시계 추가</button>{project.eventClocks.map((clock) => { const update = (patch: Partial<EventClock>) => setProject((current) => ({ ...current, eventClocks: current.eventClocks.map((item) => item.id === clock.id ? { ...item, ...patch } : item) })); const ratio = Math.max(0, Math.min(100, (clock.current / Math.max(1, clock.maximum)) * 100)); return <Panel key={clock.id} title={clock.name} badge={`${clock.current}/${clock.maximum}`} actions={<button className="icon-danger" onClick={() => setProject((current) => ({ ...current, eventClocks: current.eventClocks.filter((item) => item.id !== clock.id) }))}><Trash2 size={15} /></button>}><div className="clock-bar"><i style={{ width: `${ratio}%` }} /></div><div className="field-row three"><Field label="시계명" value={clock.name} onChange={(name) => update({ name })} /><Select label="공개 범위" value={clock.visibility} onChange={(visibility) => update({ visibility: visibility as EventClock["visibility"] })} options={["Public", "Hidden"]} /><Select label="상태" value={clock.status} onChange={(status) => update({ status: status as EventClock["status"] })} options={["Active", "Paused", "Triggered", "Resolved"]} /></div><div className="field-row three"><Field label="현재 칸" type="number" value={clock.current} onChange={(current) => update({ current: Number(current) })} /><Field label="최대 칸" type="number" value={clock.maximum} onChange={(maximum) => update({ maximum: Number(maximum) })} /><Select label="연결 사건" value={clock.relatedEventId} onChange={(relatedEventId) => update({ relatedEventId })} options={[{ value: "", label: "연결 안 함" }, ...playableEvents.map((event) => ({ value: event.id, label: event.name }))]} /></div><div className="form-grid two-col"><Area label="전진 규칙" value={clock.advanceRules} onChange={(advanceRules) => update({ advanceRules })} /><Area label="후퇴 규칙" value={clock.regressRules} onChange={(regressRules) => update({ regressRules })} /><Area secret label="최대치 도달 결과" value={clock.triggerResult} onChange={(triggerResult) => update({ triggerResult })} /><Area label="플레이어에게 보이는 암시" value={clock.publicHint} onChange={(publicHint) => update({ publicHint })} /><Area secret label="GM 비공개 메모" value={clock.hiddenNotes} onChange={(hiddenNotes) => update({ hiddenNotes })} /></div></Panel>; })}</div>}
    {tab === "foreshadows" && <div className="stack-list"><button className="add-wide" onClick={addForeshadow}><Plus size={16} /> 복선 추가</button>{project.foreshadowings.map((item) => { const update = (patch: Partial<Foreshadowing>) => setProject((current) => ({ ...current, foreshadowings: current.foreshadowings.map((value) => value.id === item.id ? { ...value, ...patch } : value) })); return <Panel key={item.id} title={item.title} badge={item.status} actions={<button className="icon-danger" onClick={() => setProject((current) => ({ ...current, foreshadowings: current.foreshadowings.filter((value) => value.id !== item.id) }))}><Trash2 size={15} /></button>}><div className="field-row three"><Field label="복선 제목" value={item.title} onChange={(title) => update({ title })} /><Select label="공개 범위" value={item.visibility} onChange={(visibility) => update({ visibility: visibility as Foreshadowing["visibility"] })} options={["Public", "Hidden"]} /><Select label="상태" value={item.status} onChange={(status) => update({ status: status as Foreshadowing["status"] })} options={["Planned", "Planted", "Reinforced", "Revealed", "Cancelled"]} /></div><div className="field-row"><Field label="최초 회수 가능일" value={item.earliestDate} onChange={(earliestDate) => update({ earliestDate })} /><Field label="최종 회수 기한" value={item.latestDate} onChange={(latestDate) => update({ latestDate })} /></div><div className="form-grid two-col"><Area label="최초 심기 장면" value={item.plantingScene} onChange={(plantingScene) => update({ plantingScene })} /><Area label="강화 계획" value={item.reinforcementPlan} onChange={(reinforcementPlan) => update({ reinforcementPlan })} /><Area secret label="회수 조건" value={item.payoffConditions} onChange={(payoffConditions) => update({ payoffConditions })} /><Area secret label="회수 결과" value={item.payoffResult} onChange={(payoffResult) => update({ payoffResult })} /><Area label="관련 인물·세력" value={item.relatedEntities} onChange={(relatedEntities) => update({ relatedEntities })} /><Area secret label="오도·미끼 장치" value={item.misdirection} onChange={(misdirection) => update({ misdirection })} /></div></Panel>; })}</div>}
    {tab === "image-triggers" && <div className="stack-list">
      <div className="trigger-intro">
        <div className="trigger-intro-icon"><ImagePlus size={22} /></div>
        <div><span>PROGRESSION IMAGE ENGINE</span><b>전개가 조건을 만족한 바로 그 턴에 실행됩니다.</b><p>AI로 새 장면을 만들거나, 아이폰 사진 보관함·카메라·파일에서 준비한 이미지를 불러와 그 순간에 정확히 표시할 수 있습니다.</p></div>
        <button className="primary-button" onClick={addImageTrigger}><Plus size={15} /> 트리거 추가</button>
      </div>
      {project.imageTriggers.map((trigger) => {
        const update = (patch: Partial<ImageTrigger>) => setProject((current) => ({ ...current, imageTriggers: current.imageTriggers.map((item) => item.id === trigger.id ? { ...item, ...patch } : item) }));
        const isEvent = ["event_start", "event_condition_met", "event_success", "event_failure"].includes(trigger.triggerType);
        const isClock = ["clock_value", "clock_completed"].includes(trigger.triggerType);
        const sourceOptions = isEvent
          ? playableEvents.map((event) => ({ value: event.id, label: event.name }))
          : isClock
            ? project.eventClocks.map((clock) => ({ value: clock.id, label: clock.name }))
            : project.foreshadowings.map((item) => ({ value: item.id, label: item.title }));
        const selectedNames = trigger.characterIds.map((id) => allCharacters.find((character) => character.id === id)?.name).filter(Boolean).join(", ");
        const sourceName = isEvent
          ? playableEvents.find((event) => event.id === trigger.sourceId)?.name
          : isClock
            ? project.eventClocks.find((clock) => clock.id === trigger.sourceId)?.name
            : project.foreshadowings.find((item) => item.id === trigger.sourceId)?.title;
        const conditionText = trigger.triggerType === "story_progress" ? trigger.storyProgress : trigger.triggerType === "custom_condition" ? trigger.customCondition : `${sourceName ?? "연결 대상 미지정"}${trigger.triggerType === "clock_value" ? ` · ${trigger.threshold}칸` : ""}`;
        return <Panel key={trigger.id} title={trigger.name} note={`ID · ${trigger.id}`} badge={trigger.enabled ? `${trigger.visibility} · ON` : "OFF"} actions={<button className="icon-danger" aria-label={`${trigger.name} 삭제`} onClick={() => setProject((current) => ({ ...current, imageTriggers: current.imageTriggers.filter((item) => item.id !== trigger.id) }))}><Trash2 size={15} /></button>}>
          <div className="trigger-summary">
            <span>{triggerLabels[trigger.triggerType]}</span><ChevronRight size={14} /><b>{conditionText || "조건을 입력하세요"}</b><ChevronRight size={14} /><em>{modeLabels[trigger.mode]}</em>
          </div>
          <div className="field-row three">
            <Field label="트리거 이름" value={trigger.name} onChange={(name) => update({ name })} required />
            <Select label="실행 조건" value={trigger.triggerType} onChange={(triggerType) => {
              const next = triggerType as ImageTrigger["triggerType"];
              const sourceId = ["event_start", "event_condition_met", "event_success", "event_failure"].includes(next) ? playableEvents[0]?.id ?? "" : ["clock_value", "clock_completed"].includes(next) ? project.eventClocks[0]?.id ?? "" : next === "foreshadow_revealed" ? project.foreshadowings[0]?.id ?? "" : "";
              update({ triggerType: next, sourceId });
            }} options={Object.entries(triggerLabels).map(([value, label]) => ({ value, label }))} />
            <Select label="공개 범위" value={trigger.visibility} onChange={(visibility) => update({ visibility: visibility as ImageTrigger["visibility"] })} options={[{ value: "Hidden", label: "Hidden · GM 전용" }, { value: "Public", label: "Public · 플레이어 공개" }]} />
          </div>
          {(isEvent || isClock || trigger.triggerType === "foreshadow_revealed") && <div className="field-row">
            <Select label={isEvent ? "연결 사건" : isClock ? "연결 사건 시계" : "연결 복선"} value={trigger.sourceId} onChange={(sourceId) => update({ sourceId })} options={[{ value: "", label: "연결 대상을 선택하세요" }, ...sourceOptions]} />
            {trigger.triggerType === "clock_value" ? <Field label="실행할 시계 값" type="number" min={0} value={trigger.threshold} onChange={(threshold) => update({ threshold: Number(threshold) })} /> : <Field label="우선순위" type="number" min={0} max={100} value={trigger.priority} onChange={(priority) => update({ priority: Number(priority) })} />}
          </div>}
          {trigger.triggerType === "story_progress" && <Area label="스토리 진행 지점" value={trigger.storyProgress} onChange={(storyProgress) => update({ storyProgress })} placeholder="예: 제2막 진입 직후, D+7 밤, 주인공이 금지 구역의 진실을 확인한 다음 턴" />}
          {trigger.triggerType === "custom_condition" && <Area secret={trigger.visibility === "Hidden"} label="사용자 지정 실행 조건" value={trigger.customCondition} onChange={(customCondition) => update({ customCondition })} placeholder="현재 상태 장부로 판정 가능한 조건을 구체적으로 적으세요." />}
          <div className="field-row three">
            <Select label="이미지 동작" value={trigger.mode} onChange={(mode) => update({ mode: mode as ImageTrigger["mode"] })} options={Object.entries(modeLabels).map(([value, label]) => ({ value, label }))} />
            <Select label="이미지 비율" value={trigger.aspectRatio} onChange={(aspectRatio) => update({ aspectRatio: aspectRatio as ImageTrigger["aspectRatio"] })} options={[{ value: "landscape", label: "가로형 · 장면" }, { value: "portrait", label: "세로형 · 인물" }, { value: "square", label: "정사각형" }]} />
            <Select label="출력 위치" value={trigger.outputPosition} onChange={(outputPosition) => update({ outputPosition: outputPosition as ImageTrigger["outputPosition"] })} options={[{ value: "before_scene", label: "장면 서술 전" }, { value: "after_scene", label: "장면 서술 후" }, { value: "turn_bottom", label: "턴 맨 아래" }]} />
          </div>
          <div className={`trigger-image-box ${trigger.attachedImages.length ? "has-images" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleTriggerImages(trigger.id, event.dataTransfer.files); }}>
            <div className="trigger-image-head"><div className="trigger-image-mark"><Upload size={19} /></div><div><span>TRIGGER IMAGE ASSET</span><b>직접 준비한 전개 이미지</b><p>사진을 추가하면 자동으로 ‘불러온 전개 이미지 표시’ 모드가 선택됩니다. 대표 이미지는 조건 충족 시 원본 그대로 사용됩니다.</p></div><button type="button" className="soft-button" onClick={() => triggerImageInputs.current[trigger.id]?.click()}><ImagePlus size={15} /> 사진·파일 불러오기</button></div>
            <input ref={(node) => { triggerImageInputs.current[trigger.id] = node; }} hidden type="file" multiple accept="image/*" onChange={(event) => { if (event.target.files) void handleTriggerImages(trigger.id, event.target.files); event.target.value = ""; }} />
            {trigger.attachedImages.length ? <div className="trigger-image-library">{trigger.attachedImages.map((image) => <div className={`trigger-reference-image ${image.isPrimary ? "primary" : ""}`} key={image.id}><img src={image.dataUrl} alt={image.label || trigger.name} /><div className="trigger-image-actions"><button type="button" title="대표 이미지 지정" aria-label={`${image.label} 대표 이미지 지정`} onClick={() => update({ attachedImages: trigger.attachedImages.map((item) => ({ ...item, isPrimary: item.id === image.id })) })}><Star size={15} fill={image.isPrimary ? "currentColor" : "none"} /></button><button type="button" title="이미지 삭제" aria-label={`${image.label} 삭제`} onClick={() => { const next = trigger.attachedImages.filter((item) => item.id !== image.id); if (image.isPrimary && next[0]) next[0] = { ...next[0], isPrimary: true }; update({ attachedImages: next }); }}><X size={16} /></button></div><input aria-label="트리거 이미지 설명" value={image.label} onChange={(event) => update({ attachedImages: trigger.attachedImages.map((item) => item.id === image.id ? { ...item, label: event.target.value } : item) })} />{image.isPrimary && <span>대표 출력</span>}</div>)}{trigger.attachedImages.length < 4 && <button type="button" className="trigger-image-add" onClick={() => triggerImageInputs.current[trigger.id]?.click()}><Plus size={18} /><b>추가 이미지</b><small>{trigger.attachedImages.length}/4</small></button>}</div> : <button type="button" className="trigger-image-drop" onClick={() => triggerImageInputs.current[trigger.id]?.click()}><ImagePlus size={27} /><b>사진 보관함 또는 파일에서 선택</b><span>이미지를 끌어놓아도 됩니다 · 장당 8MB 이하 · 최대 4장</span></button>}
          </div>
          <div className="character-picker">
            <span>등장 캐릭터 <small>{selectedNames || "선택 없음"}</small></span>
            <div className="character-chip-grid">{allCharacters.map((character) => {
              const selected = trigger.characterIds.includes(character.id);
              const primary = character.images.find((image) => image.isPrimary) ?? character.images[0];
              return <button type="button" key={character.id} className={`character-chip ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => update({ characterIds: selected ? trigger.characterIds.filter((id) => id !== character.id) : [...trigger.characterIds, character.id] })}>{primary ? <img src={primary.dataUrl} alt="" /> : <span>{character.name.slice(0, 1)}</span>}<b>{character.name}</b>{selected && <CheckCircle2 size={14} />}</button>;
            })}</div>
          </div>
          {!['show_package_image', 'show_trigger_image'].includes(trigger.mode) && <div className="form-grid two-col">
            <Area label="이미지 프롬프트" value={trigger.prompt} onChange={(prompt) => update({ prompt })} placeholder="그 순간의 구도, 행동, 표정, 조명과 배경을 구체적으로 적으세요." />
            <Area label="제외 요소" value={trigger.negativePrompt} onChange={(negativePrompt) => update({ negativePrompt })} placeholder="텍스트, 워터마크, 외형 불일치 등" />
            <Area label="촬영 구도" value={trigger.shotType} onChange={(shotType) => update({ shotType })} placeholder="예: 로우 앵글, 인물 중심 미디엄 샷" />
            <Area label="스타일 덮어쓰기" value={trigger.styleOverride} onChange={(styleOverride) => update({ styleOverride })} placeholder="비우면 비주얼 바이블의 글로벌 스타일을 사용합니다." />
          </div>}
          {trigger.mode === "show_package_image" && <div className="package-image-note"><ImageIcon size={18} /><div><b>기준 이미지 재사용 모드</b><span>선택한 캐릭터의 대표 이미지를 새로 생성하지 않고 그대로 보여줍니다. 캐릭터 편집기의 이미지 보관함에서 대표 이미지를 지정하세요.</span></div></div>}
          {trigger.mode === "show_trigger_image" && <div className="package-image-note trigger-asset-note"><ImageIcon size={18} /><div><b>불러온 전개 이미지 출력 모드</b><span>{trigger.attachedImages.length ? `대표 이미지 1장과 보조 이미지 ${Math.max(0, trigger.attachedImages.length - 1)}장이 패키지에 포함됩니다.` : "위 영역에서 이미지를 불러오면 해당 파일이 ScenarioPack에 포함됩니다."}</span></div></div>}
          <div className="trigger-options">
            <Toggle checked={trigger.enabled} onChange={(enabled) => update({ enabled })} label="트리거 활성화" />
            <Toggle checked={trigger.once} onChange={(once) => update({ once })} label="최초 1회만 실행" />
            <Toggle checked={trigger.spoilerProtection} onChange={(spoilerProtection) => update({ spoilerProtection })} label="미공개 스포일러 차단" />
            <Toggle checked={trigger.useCharacterReferences} onChange={(useCharacterReferences) => update({ useCharacterReferences })} label="캐릭터 기준 이미지 참조" />
            <Toggle checked={trigger.preserveFaces} onChange={(preserveFaces) => update({ preserveFaces })} label="얼굴·외형 일관성 고정" />
            {["clock_value", "story_progress", "custom_condition"].includes(trigger.triggerType) && <Field label="우선순위" type="number" min={0} max={100} value={trigger.priority} onChange={(priority) => update({ priority: Number(priority) })} />}
          </div>
        </Panel>;
      })}
      {!project.imageTriggers.length && <Empty icon={<ImagePlus />} text="아직 이미지 트리거가 없습니다. 사건·시계·복선의 결정적 순간을 한 장면으로 연결해 보세요." />}
    </div>}
  </PageFrame>;
}

export function DirectionSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const [tab, setTab] = useState("status");
  const setGroup = (group: "opening" | "gmData" | "style", key: string, value: string) => setProject((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  const openingFields = [["preHistory", "시작 직전까지의 사건"], ["currentSituation", "현재 상황 *"], ["immediateProblem", "당장 해결할 문제"], ["knownRisks", "알려진 위험"], ["hiddenRisks", "플레이어가 모르는 위험"], ["openingCharacters", "첫 장면 등장인물"], ["openingLocation", "첫 장면 장소 *"], ["openingEvent", "첫 장면 사건 *"], ["firstGoal", "첫 번째 목표"], ["openingLine", "첫 문장"]];
  const gmFields = [["worldTruthLedger", "세계의 실제 진실"], ["hiddenTimeline", "비공개 시간표"], ["secretResources", "숨겨진 자원·연락망"], ["plannedTwists", "계획된 반전"], ["forbiddenDisclosures", "플레이어에게 금지된 공개 항목"], ["failureEscalationRules", "실패 악화·후폭풍 규칙"], ["continuityNotes", "장기 연속성 메모"]];
  const styleFields = [["narrationPerson", "서술 시점"], ["proseStyle", "문장 스타일"], ["dialogueStyle", "대화 스타일"], ["descriptionDensity", "묘사 밀도"], ["violenceLevel", "폭력 묘사"], ["romanceLevel", "연애 요소"], ["statusDisclosure", "상태 공개 수준"], ["customRules", "추가 규칙"]];
  return <PageFrame eyebrow="DIRECTOR'S ROOM" title="첫 장면과 숨은 진실을 분리하세요" description="플레이어가 보는 장면, 문체, 감독자만 아는 사실과 매 턴 출력 형식을 관리합니다."><Tabs active={tab} onChange={setTab} items={[{ id: "opening", label: "시작 장면" }, { id: "gm", label: "GM 진실 장부" }, { id: "style", label: "문체·규칙" }, { id: "presentation", label: "출력 연출" }, { id: "status", label: "상태창 HUD" }]} />
    {tab === "opening" && <div className="world-grid">{openingFields.map(([key, label]) => <Panel key={key} title={label} badge={["hiddenRisks"].includes(key) ? "HIDDEN" : undefined} wide={["currentSituation", "openingEvent"].includes(key)}><textarea className="editor-area" value={project.opening[key]} onChange={(event) => setGroup("opening", key, event.target.value)} /></Panel>)}</div>}
    {tab === "gm" && <><Panel title="전역 보호어" note={project.runtimeMode === "instant_story" ? "Instant Story에서는 선택 사항입니다. 조기 노출을 막을 희귀한 명칭이 있을 때만 적으세요." : "공개 전까지 보호할 희귀한 명칭을 한 줄에 하나씩 적으세요. 일반 단어를 과도하게 등록하지 마세요."}><Area secret label="보호어 목록" value={project.disclosure.protectedTerms.join("\n")} onChange={(value) => setProject((current) => ({ ...current, disclosure: { ...current.disclosure, protectedTerms: value.split("\n") } }))} /><p>사건별 공개어와 GM 비밀 설명은 이 목록을 자동으로 채우지 않습니다. 정확한 문자열에 대한 보호이며 의미적 스포일러 전체를 막는 기능은 아닙니다.</p></Panel><div className="secret-banner"><Lock size={18} /><div><b>감독자 전용 영역</b><span>이 내용은 HIDDEN_GM_DATA에만 들어가며 플레이어에게 직접 노출하거나 요약하지 않습니다.</span></div></div><div className="world-grid">{gmFields.map(([key, label]) => <Panel key={key} title={label} badge="HIDDEN"><textarea className="editor-area secret-area" value={project.gmData[key]} onChange={(event) => setGroup("gmData", key, event.target.value)} /></Panel>)}</div></>}
    {tab === "style" && <div className="world-grid">{styleFields.map(([key, label]) => <Panel key={key} title={label} wide={key === "customRules"}><textarea className="editor-area" value={project.style[key]} onChange={(event) => setGroup("style", key, event.target.value)} /></Panel>)}</div>}
    {tab === "presentation" && <div className="form-grid two-col"><Panel title="추천 답변">{project.packageTarget === "cortex" ? <p>Cortex 산문에는 추천답변을 넣지 않습니다. 이전 추천답변 설정은 편집 원본에 보관됩니다.</p> : <><Toggle checked={project.turnPresentation.recommendedReplies.enabled} onChange={(enabled) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, recommendedReplies: { ...current.turnPresentation.recommendedReplies, enabled } } }))} label="매 턴 추천 행동 표시" note="자유 입력을 제한하지 않으며 성공을 보장하지 않습니다." /><Field label="추천 개수" type="number" min={1} max={5} value={project.turnPresentation.recommendedReplies.count} onChange={(count) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, recommendedReplies: { ...current.turnPresentation.recommendedReplies, count: Number(count) } } }))} /><Toggle checked={project.turnPresentation.recommendedReplies.showRisk} onChange={(showRisk) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, recommendedReplies: { ...current.turnPresentation.recommendedReplies, showRisk } } }))} label="위험도 표시" /></>}</Panel>
      <Panel title="장면 이미지"><Toggle checked={project.turnPresentation.sceneImage.enabled} onChange={(enabled) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, sceneImage: { ...current.turnPresentation.sceneImage, enabled } } }))} label="장면 이미지 사용" /><Select label="생성 빈도" value={project.turnPresentation.sceneImage.frequency} onChange={(frequency) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, sceneImage: { ...current.turnPresentation.sceneImage, frequency } } }))} options={[{ value: "every_turn", label: "매 턴" }, { value: "scene_change", label: "장면 전환 시" }, { value: "important_only", label: "중요 장면만" }, { value: "on_command", label: "/이미지 명령 시" }, { value: "off", label: "사용 안 함" }]} /><Select label="이미지 비율" value={project.turnPresentation.sceneImage.aspectRatio} onChange={(aspectRatio) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, sceneImage: { ...current.turnPresentation.sceneImage, aspectRatio } } }))} options={[{ value: "landscape", label: "가로형" }, { value: "square", label: "정사각형" }, { value: "portrait", label: "세로형" }]} /><Area label="스타일 힌트" value={project.turnPresentation.sceneImage.styleHint} onChange={(styleHint) => setProject((current) => ({ ...current, turnPresentation: { ...current.turnPresentation, sceneImage: { ...current.turnPresentation.sceneImage, styleHint } } }))} /></Panel></div>}
    {tab === "status" && <StatusWindowEditor project={project} setProject={setProject} />}
  </PageFrame>;
}

const statusSectionOptions: { key: keyof Project["statusWindow"]["sections"]; label: string; note: string }[] = [
  { key: "profile", label: "프로필", note: "이름·직위·소속" },
  { key: "skills", label: "Ability", note: "쉬운 공개 설명 1~2줄" },
  { key: "stats", label: "능력치", note: "게이지와 등급" },
  { key: "resources", label: "Resources", note: "작품별 핵심 자원 1~3개" },
  { key: "condition", label: "Condition", note: "스포일러 없는 현재 상태" },
  { key: "funds", label: "자금", note: "현재 보유 금액" },
  { key: "relationships", label: "인물·세력 관계", note: "문장·수치·기호 조합" },
];

const StatusResourceIcon = ({ resource }: { resource: StatusResource }) => {
  if (/gem|crystal|보석|결정/i.test(resource.icon)) return <Gem size={20} />;
  if (/sword|weapon|blade|무기|검/i.test(resource.icon)) return <Sword size={20} />;
  if (/shield|armor|방어|보호/i.test(resource.icon)) return <ShieldCheck size={20} />;
  return <Sparkles size={20} />;
};

function StatusWindowEditor({ project, setProject }: { project: Project; setProject: Setter }) {
  const status = project.statusWindow;
  const setStatus = (patch: Partial<Project["statusWindow"]>) => setProject((current) => ({ ...current, statusWindow: { ...current.statusWindow, ...patch } }));
  const setSection = (key: keyof Project["statusWindow"]["sections"], value: boolean) => setProject((current) => ({ ...current, statusWindow: { ...current.statusWindow, sections: { ...current.statusWindow.sections, [key]: value } } }));
  const updateStat = (id: string, patch: Partial<StatusStat>) => setStatus({ stats: status.stats.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const updateResource = (id: string, patch: Partial<StatusResource>) => setStatus({ resources: status.resources.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const updateRelationshipDisplay = (id: string, patch: Partial<StatusRelationshipDisplay>) => setStatus({ relationshipDisplays: status.relationshipDisplays.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const addRelationshipDisplay = (entityType: StatusRelationshipDisplay["entityType"]) => setStatus({ relationshipDisplays: [...status.relationshipDisplays, blankStatusRelationshipDisplay(entityType)] });
  const addStat = () => setStatus({ stats: [...status.stats, { id: uid("STAT"), icon: "◆", name: "새 능력치", rank: "F", current: 0, max: 100, color: "amber" }] });
  const allCharacters = [project.player, ...project.npcs];
  const relations = project.characterRelations.filter((relation) => relation.sourceId === project.player.id || relation.targetId === project.player.id).slice(0, 2);
  const relationshipDisplays = status.relationshipDisplays.slice(0, 4);
  const publicClocks = project.eventClocks.filter((clock) => clock.visibility === "Public").slice(0, 2);
  const skillPreview = status.abilitySummary.trim() || "현재 공개된 특별 능력은 아직 없다.";
  const compact = status.displayMode === "always_compact";

  return <div className="status-designer">
    <section className="status-designer-hero">
      <div className="status-hero-icon"><Activity size={25} /></div>
      <div><span>TURN HUD DESIGNER · RUNTIME READY</span><h2>대화가 끝날 때마다, 세계의 변화를 한눈에.</h2><p>패키지에는 초기값·공개 항목·갱신 규칙이 저장되고 시뮬레이터는 매 턴 상태 장부를 갱신한 뒤 추천 행동 직전에 HUD를 렌더링합니다.</p></div>
      <div className="status-preset-actions"><button className="status-preset-button" type="button" onClick={() => setProject((current) => ({ ...current, statusWindow: makeStatusWindow() }))}><RotateCcw size={15} /> 작품 공통</button><button className="status-preset-button" type="button" onClick={() => setProject((current) => ({ ...current, statusWindow: makeFateStatusWindow() }))}><Sparkles size={15} /> Fate 프리셋</button></div>
    </section>

    <div className="status-builder-grid">
      <div className="status-control-column">
        <Panel title="출력 방식" note="크랙식 정보 블록을 매 턴 안정적으로 재현하는 런타임 설정입니다." badge="LIVE">
          <Toggle checked={status.enabled} onChange={(enabled) => setStatus({ enabled })} label="매 턴 상태창 사용" note="꺼도 데이터는 보존되지만 시뮬레이터 출력 지시는 비활성화됩니다." />
          <div className="field-row"><Field label="상태창 제목" value={status.title} onChange={(title) => setStatus({ title })} /><Select label="출력 빈도" value={status.displayMode} onChange={(displayMode) => setStatus({ displayMode: displayMode as Project["statusWindow"]["displayMode"] })} options={[{ value: "always_full", label: "매 턴 전체 상태" }, { value: "always_compact", label: "매 턴 요약 상태" }, { value: "changes_only", label: "변화가 있을 때만" }]} /></div>
          <div className="field-row"><Select label="HUD 테마" value={status.theme} onChange={(theme) => setStatus({ theme: theme as Project["statusWindow"]["theme"] })} options={[{ value: "dark_rpg", label: "다크 RPG" }, { value: "glass_navy", label: "글래스 네이비" }, { value: "minimal", label: "미니멀" }]} /><Select label="출력 위치" value={status.placement} onChange={(placement) => setStatus({ placement: placement as Project["statusWindow"]["placement"] })} options={[{ value: "before_replies", label: "추천 행동 직전" }, { value: "turn_bottom", label: "턴 맨 아래" }]} /></div>
          <div className="status-switch-grid"><Toggle checked={status.showDeltas} onChange={(showDeltas) => setStatus({ showDeltas })} label="증감값 표시" note="이전 턴 대비 +/− 표시" /><Toggle checked={status.highlightChanges} onChange={(highlightChanges) => setStatus({ highlightChanges })} label="변화 원인 강조" note="이번 턴 원인 태그 연결" /><Toggle checked={status.collapseOnMobile} onChange={(collapseOnMobile) => setStatus({ collapseOnMobile })} label="모바일 접기" note="iPhone에서는 한 손으로 접기" /></div>
        </Panel>

        <Panel title="공개 섹션" note="시뮬레이터가 플레이어에게 보여줄 핵심 HUD 항목만 켜세요." badge={`${statusSectionOptions.filter((item) => status.sections[item.key]).length}/${statusSectionOptions.length}`}>
          <div className="status-section-grid">{statusSectionOptions.map((item) => <button key={item.key} type="button" className={status.sections[item.key] ? "active" : ""} aria-pressed={status.sections[item.key]} onClick={() => setSection(item.key, !status.sections[item.key])}><span>{status.sections[item.key] ? <CheckCircle2 size={16} /> : <span className="status-empty-check" />}</span><b>{item.label}</b><small>{item.note}</small></button>)}</div>
          <div className="status-privacy-note"><Lock size={15} /><p><b>공개 필터는 항상 우선합니다.</b><span>미등장 인물·진명·비밀 진영·숨은 관계·비공개 사건 시계는 섹션을 켜도 공개 조건 전에는 나타나지 않습니다.</span></p></div>
        </Panel>

        <Panel title="한눈에 읽는 공개 설명" note="각 문장은 한두 줄로만 작성합니다. 플레이어가 아직 모르는 정체·계약·미래 사건은 쓰지 마세요." badge="1–2 LINES">
          <div className="form-grid two-col">
            <Area label="Ability · 현재 이해 가능한 능력" value={status.abilitySummary} onChange={(abilitySummary) => setStatus({ abilitySummary })} placeholder="예: 공간과 길을 빠르게 기억하며, 복잡한 도시 동선을 정확히 파악한다." />
            <Area label="Condition · 현재 확인된 상태" value={status.conditionSummary} onChange={(conditionSummary) => setStatus({ conditionSummary })} placeholder="예: 피로가 조금 쌓였지만 움직임에는 지장이 없다." />
          </div>
          <div className="status-privacy-note"><Lock size={15} /><p><b>짧은 문장에도 공개 필터가 적용됩니다.</b><span>미공개 마스터·서번트·진명·계약 관계와 숨은 능력은 확인된 장면 전까지 자동으로 제외됩니다.</span></p></div>
        </Panel>

        <Panel title="인물·세력 관계 현황" note="각 관계마다 짧은 문장, 스탯 수치, 이모지·기호를 원하는 만큼 겹쳐 표시할 수 있습니다." badge={`${status.relationshipDisplays.length} RELATIONS`} actions={<div className="status-relation-actions"><button className="soft-button" type="button" onClick={() => addRelationshipDisplay("character")}><UserRound size={14} /> 인물</button><button className="soft-button" type="button" onClick={() => addRelationshipDisplay("faction")}><ShieldCheck size={14} /> 세력</button></div>}>
          <Toggle checked={status.sections.relationships} onChange={(relationships) => setSection("relationships", relationships)} label="상태창에 관계 현황 표시" note="공개 조건을 충족한 항목만 출력합니다." />
          <div className="status-relationship-editor-list">{status.relationshipDisplays.map((relation) => <article className="status-relationship-editor" key={relation.id}>
            <header><span>{relation.symbol || (relation.entityType === "faction" ? "◆" : "○")}</span><div><b>{relation.label || "관계 이름"}</b><small>{relation.entityType === "faction" ? "FACTION" : "CHARACTER"} · {relation.id}</small></div><button className="icon-danger" type="button" aria-label={`${relation.label} 관계 표시 삭제`} onClick={() => setStatus({ relationshipDisplays: status.relationshipDisplays.filter((item) => item.id !== relation.id) })}><Trash2 size={14} /></button></header>
            <div className="form-grid three-col"><Select label="대상 종류" value={relation.entityType} onChange={(entityType) => updateRelationshipDisplay(relation.id, { entityType: entityType as StatusRelationshipDisplay["entityType"] })} options={[{ value: "character", label: "인물" }, { value: "faction", label: "세력" }]} /><Field label="표시 이름" value={relation.label} onChange={(label) => updateRelationshipDisplay(relation.id, { label })} /><Field label="대상 ID · 선택" value={relation.entityId} onChange={(entityId) => updateRelationshipDisplay(relation.id, { entityId })} /></div>
            <div className="status-relationship-format"><Toggle checked={relation.showSentence} onChange={(showSentence) => updateRelationshipDisplay(relation.id, { showSentence })} label="짧은 문장" /><Toggle checked={relation.showStat} onChange={(showStat) => updateRelationshipDisplay(relation.id, { showStat })} label="스탯 수치" /><Toggle checked={relation.showSymbol} onChange={(showSymbol) => updateRelationshipDisplay(relation.id, { showSymbol })} label="이모지·기호" /></div>
            {relation.showSentence && <Area label="관계 문장" value={relation.sentence} onChange={(sentence) => updateRelationshipDisplay(relation.id, { sentence })} placeholder="예: 아직 경계하지만 조금씩 신뢰하고 있다." />}
            {relation.showStat && <div className="form-grid three-col"><Field label="스탯 이름" value={relation.statLabel} onChange={(statLabel) => updateRelationshipDisplay(relation.id, { statLabel })} /><Field label="현재 수치" type="number" value={relation.current} onChange={(current) => updateRelationshipDisplay(relation.id, { current: Number(current) })} /><div className="field-row"><Field label="최소" type="number" value={relation.minimum} onChange={(minimum) => updateRelationshipDisplay(relation.id, { minimum: Number(minimum) })} /><Field label="최대" type="number" value={relation.maximum} onChange={(maximum) => updateRelationshipDisplay(relation.id, { maximum: Number(maximum) })} /></div></div>}
            {relation.showSymbol && <Field label="이모지·기호" value={relation.symbol} onChange={(symbol) => updateRelationshipDisplay(relation.id, { symbol })} placeholder="예: 💙, ⚠, ◆, ♡" />}
            <div className="form-grid two-col"><Select label="공개 방식" value={relation.visibility} onChange={(visibility) => updateRelationshipDisplay(relation.id, { visibility: visibility as StatusRelationshipDisplay["visibility"] })} options={[{ value: "public", label: "처음부터 공개" }, { value: "met_only", label: "직접 만난 뒤" }, { value: "conditional", label: "조건 충족 후" }]} /><Field label="공개 조건" value={relation.revealRule} onChange={(revealRule) => updateRelationshipDisplay(relation.id, { revealRule })} /></div>
            <Area label="갱신 규칙" value={relation.updateRule} onChange={(updateRule) => updateRelationshipDisplay(relation.id, { updateRule })} />
          </article>)}</div>
          {!status.relationshipDisplays.length && <button className="add-wide" type="button" onClick={() => addRelationshipDisplay("character")}><Plus size={15} /> 첫 관계 표시 추가</button>}
          <div className="status-privacy-note"><Lock size={15} /><p><b>관계 출력은 공개 가능한 인식만 보여줍니다.</b><span>숨은 호감·배신 계획·비밀 세력은 실제로 드러나기 전까지 문장·수치·기호 어디에도 표시하지 않습니다.</span></p></div>
        </Panel>

        <Panel title="초기 능력치" note="시뮬레이터는 이 값을 시작 상태로 복제하고 서사적 원인이 있을 때만 변경합니다." badge={`${status.stats.length} STATS`} actions={<button className="soft-button" type="button" onClick={addStat}><Plus size={14} /> 능력치</button>}>
          <div className="status-edit-list">{status.stats.map((stat) => <div className="status-edit-card" key={stat.id}><div className="status-edit-card-head"><span className={`status-edit-icon ${stat.color}`}>{stat.icon || "◆"}</span><b>{stat.name || "이름 없는 능력치"}</b><button className="icon-danger" type="button" aria-label={`${stat.name} 삭제`} onClick={() => setStatus({ stats: status.stats.filter((item) => item.id !== stat.id) })}><Trash2 size={14} /></button></div><div className="status-edit-fields"><Field label="아이콘" value={stat.icon} onChange={(icon) => updateStat(stat.id, { icon })} /><Field label="이름" value={stat.name} onChange={(name) => updateStat(stat.id, { name })} /><Field label="등급" value={stat.rank} onChange={(rank) => updateStat(stat.id, { rank })} /><Select label="색상" value={stat.color} onChange={(color) => updateStat(stat.id, { color: color as StatusStat["color"] })} options={[{ value: "green", label: "에메랄드" }, { value: "blue", label: "아이스 블루" }, { value: "amber", label: "앰버" }, { value: "violet", label: "바이올렛" }, { value: "red", label: "크림슨" }]} /><Field label="현재" type="number" min={0} value={stat.current} onChange={(current) => updateStat(stat.id, { current: Number(current) })} /><Field label="최대" type="number" min={1} value={stat.max} onChange={(max) => updateStat(stat.id, { max: Number(max) })} /></div></div>)}</div>
          {!status.stats.length && <button className="add-wide" type="button" onClick={addStat}><Plus size={15} /> 첫 능력치 추가</button>}
        </Panel>

        <Panel title="Resources" note="레이아웃은 모든 작품에서 같고, 이름·아이콘·공개 조건은 작품 설정에 맞춥니다. Fate 계열에서는 령주·보석·마술무기를 사용하세요." badge="1–3 CORE">
          <div className="status-resource-edit-grid">{status.resources.map((resource) => <div className="status-resource-editor fixed-resource" key={resource.id}><div className="status-resource-glyph"><StatusResourceIcon resource={resource} /></div><strong>{resource.name}</strong><small>{resource.revealRule}</small><div className="field-row"><Field label="이름" value={resource.name} onChange={(name) => updateResource(resource.id, { name })} /><Field label="아이콘 키" value={resource.icon} onChange={(icon) => updateResource(resource.id, { icon })} /></div><div className="field-row"><Field label="보유량" type="number" min={0} value={resource.current} onChange={(current) => updateResource(resource.id, { current: Number(current) })} /><Field label="단위" value={resource.unit} onChange={(unit) => updateResource(resource.id, { unit })} /></div><Area label="공개·증감 조건" value={resource.revealRule} onChange={(revealRule) => updateResource(resource.id, { revealRule })} /></div>)}</div>
        </Panel>

        <Panel title="자금" note="플레이어가 현재 사용할 수 있다고 확인된 금액만 표시합니다." badge="FUNDS">
          <div className="status-funds-editor"><span><WalletCards size={22} /></span><Field label="항목명" value={status.funds.name} onChange={(name) => setStatus({ funds: { ...status.funds, name } })} /><Field label="현재 금액" type="number" min={0} value={status.funds.current} onChange={(current) => setStatus({ funds: { ...status.funds, current: Number(current) } })} /><Field label="단위" value={status.funds.unit} onChange={(unit) => setStatus({ funds: { ...status.funds, unit } })} /></div>
        </Panel>

        <Panel title="매 턴 갱신 규칙" note="공개 장부가 세계의 실제 상태보다 앞서지 않도록 강제하는 규칙입니다." badge="HARD RULE"><Area label="상태 장부·공개 필터 지침" value={status.updateRules} onChange={(updateRules) => setStatus({ updateRules })} /></Panel>
      </div>

      <aside className="status-preview-column">
        <div className="status-preview-heading"><div><span>SIMULATOR OUTPUT PREVIEW</span><b>실시간 HUD 미리보기</b></div><span className="status-device"><Smartphone size={14} /> iOS SAFE</span></div>
        <section className={`status-live-card theme-${status.theme} ${compact ? "compact" : ""} ${status.enabled ? "" : "disabled"}`}>
          <header><div><span className="status-live-dot" /><p>{status.title || "TURN STATUS · LIVE"}</p></div><em>TURN 01</em></header>
          {status.sections.profile && <div className="status-profile-block"><div className="status-avatar">{project.player.images[0] ? <img src={(project.player.images.find((image) => image.isPrimary) ?? project.player.images[0]).dataUrl} alt="" /> : project.player.name.slice(0, 1)}</div><div><span>PLAYER STATUS</span><h3>{project.player.name || "주인공"}</h3><p>{project.player.role || project.player.occupation || "역할 미설정"} · {project.player.affiliation || "소속 미설정"}</p></div><b className="status-online"><i /> ACTIVE</b></div>}
          {status.sections.skills && !compact && <div className="status-live-section"><span className="status-section-label"><Zap size={13} /> ABILITY</span><p className="status-skill-copy">{skillPreview}</p></div>}
          {status.sections.stats && <div className="status-live-section"><span className="status-section-label"><Gauge size={13} /> CORE STATS</span><div className="status-stat-list">{status.stats.map((stat) => { const maximum = Math.max(1, Number(stat.max) || 1); const current = Math.max(0, Math.min(Number(stat.current) || 0, maximum)); const percent = Math.round((current / maximum) * 100); return <div className={`status-stat-row ${stat.color}`} key={stat.id}><span className="status-stat-icon">{stat.icon || "◆"}</span><div><span><b>{stat.name || "능력치"}</b><em>{stat.rank || "-"}</em><strong>{current}<small> / {maximum}</small></strong></span><div className="status-stat-track"><i style={{ width: `${percent}%` }} /></div></div>{status.showDeltas && <mark className="stable">±0</mark>}</div>; })}</div></div>}
          {status.sections.resources && <div className="status-live-section"><span className="status-section-label">RESOURCES</span><div className="status-resource-row">{status.resources.map((resource) => <div key={resource.id}><span><StatusResourceIcon resource={resource} /></span><p><b>{resource.current}</b><small>{resource.unit}</small></p><em>{resource.name}</em></div>)}</div></div>}
          {!compact && status.sections.condition && <div className="status-info-line"><span>CONDITION</span><p>{status.conditionSummary || "현재 확인된 부상이나 이상 상태는 없다."}</p>{status.highlightChanges && <em>이번 턴 유지</em>}</div>}
          {!compact && status.sections.funds && <div className="status-info-line status-funds-line"><span>FUNDS</span><p><WalletCards size={14} /> <b>{status.funds.current.toLocaleString("ko-KR")}</b>{status.funds.unit}</p></div>}
          {!compact && status.sections.inventory && <div className="status-info-line"><span>INVENTORY</span><p>{project.player.inventory || "등록된 소지품 없음"}</p></div>}
          {!compact && status.sections.relationships && <div className="status-live-section"><span className="status-section-label">CHARACTER · FACTION RELATIONSHIPS</span>{relationshipDisplays.length ? <div className="status-relationship-display-list">{relationshipDisplays.map((relation) => { const range = Math.max(1, relation.maximum - relation.minimum); const percent = Math.max(0, Math.min(100, ((relation.current - relation.minimum) / range) * 100)); return <div className="status-relationship-display" key={relation.id}><header><span>{relation.showSymbol ? relation.symbol || "○" : relation.entityType === "faction" ? "◆" : "○"}</span><b>{relation.label || "관계"}</b><em>{relation.entityType === "faction" ? "세력" : "인물"}</em></header>{relation.showSentence && <p>{relation.sentence || "공개 가능한 관계 설명이 없다."}</p>}{relation.showStat && <div className="status-relationship-meter"><span><b>{relation.statLabel || "관계"}</b><strong>{relation.current}<small> / {relation.maximum}</small></strong></span><i><b style={{ width: `${percent}%` }} /></i></div>}</div>; })}</div> : <div className="status-relation-list">{relations.length ? relations.map((relation) => { const otherId = relation.sourceId === project.player.id ? relation.targetId : relation.sourceId; const latestReason = project.relationshipMemorySettings.displayPublicReasonsInHud ? project.relationshipMemories.filter((memory) => memory.relationId === relation.id && memory.active && memory.visibility === "Public").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined; return <div key={relation.id}><span>{allCharacters.find((character) => character.id === otherId)?.name ?? "미상"}</span><p>{latestReason ? `${latestReason.title} · ${latestReason.summary || latestReason.cause}` : relation.publicSummary || relation.relationType}</p><em>{latestReason ? "이유 기억" : "직접 만남 후 공개"}</em></div>; }) : <p className="status-empty-runtime">인물·세력 관계 표시 항목을 추가하면 문장·수치·기호가 여기에 함께 나타납니다.</p>}</div>}</div>}
          {!compact && status.sections.clocks && <div className="status-live-section"><span className="status-section-label">PUBLIC CLOCKS</span>{publicClocks.length ? <div className="status-clock-list">{publicClocks.map((clock) => <div key={clock.id}><span><b>{clock.name}</b><em>{clock.current}/{clock.maximum}</em></span><i><b style={{ width: `${Math.min(100, Math.max(0, (clock.current / Math.max(1, clock.maximum)) * 100))}%` }} /></i></div>)}</div> : <p className="status-empty-runtime">공개된 사건 시계가 없습니다.</p>}</div>}
          {!compact && status.sections.objective && <div className="status-objective"><span>ACTIVE OBJECTIVE</span><p>{project.opening.firstGoal || "첫 번째 목표를 설정하세요."}</p></div>}
          <footer><Lock size={12} /><span>미등장 인물·진명·비밀 진영 자동 차단</span><b>{status.placement === "before_replies" ? "NEXT · 추천 행동" : "END OF TURN"}</b></footer>
          {!status.enabled && <div className="status-disabled-cover"><Activity size={25} /><b>상태창 출력 꺼짐</b><span>설정과 초기값은 안전하게 보존됩니다.</span></div>}
        </section>
        <div className="status-preview-note"><Activity size={15} /><p><b>단순 숫자판보다 한 단계 더 깊게</b><span>실제 시뮬레이터에서는 변화량 옆에 “피격”, “휴식”, “대화 선택” 같은 원인 태그가 붙고 이전 턴 상태와 비교됩니다.</span></p></div>
      </aside>
    </div>
  </div>;
}

function stripFence(text: string) { const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i); const value = (match ? match[1] : text).trim(); const start = value.indexOf("{"); const end = value.lastIndexOf("}"); return start >= 0 && end > start ? value.slice(start, end + 1) : value; }

export function AiSection({ project, notify, onImportFile }: { project: Project; setProject: Setter; notify: Notify; onImportFile:(file?:File)=>Promise<void> }) {
  const aiGeneratorPrompt = aiGeneratorPromptFor(project);
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = async () => { await navigator.clipboard.writeText(aiGeneratorPrompt); notify("AI 설계 요청문을 복사했습니다."); };
  const load = onImportFile;
  return <PageFrame eyebrow="AI PROJECT IMPORT" title="아이디어 한 줄에서 완성 설계까지" description="요청문을 ChatGPT에 전달해 실시간 세계관 맥락, 자율 NPC·세력, 관계 이유 기억, 사건, 이미지 트리거, 상태창과 GM 장부를 한 번에 구성할 수 있습니다."><div className="ai-grid"><Panel title="1. 요청문 복사" note="핵심 아이디어와 참고 세계관·현지화 방향만 채워 ChatGPT에 전달하세요." badge="PROMPT"><textarea className="prompt-preview" readOnly value={aiGeneratorPrompt} /><div className="panel-actions"><button className="primary-button" onClick={copy}><Copy size={15} /> 요청문 복사</button><button className="soft-button" onClick={() => { const url = URL.createObjectURL(new Blob([aiGeneratorPrompt], { type: "text/markdown" })); const a = document.createElement("a"); a.href = url; a.download = `RelayNovelStudio_v${STUDIO_VERSION}_AI_Request.md`; a.click(); URL.revokeObjectURL(url); }}><Download size={15} /> MD 저장</button></div></Panel><Panel title="2. 작업 JSON·패키지 ZIP 불러오기" note="새 V2 패키지는 이미지 중복 없이 완전 복원하며, 구형 V1 패키지도 모바일 안전 모드로 순차 복구합니다." badge="MOBILE SAFE"><button className="import-drop" onClick={() => fileRef.current?.click()}><Upload size={28} /><b>작업 JSON·패키지 ZIP·AI 설계 선택</b><span>PACKAGE ZIP · PROJECT_SNAPSHOT_V1/V2 · AI_PROJECT_V2</span></button><input ref={fileRef} hidden type="file" accept=".zip,.json,.md,.txt" onChange={(event) => { void load(event.target.files?.[0]); event.target.value = ""; }} /><div className="import-checks"><span><CheckCircle2 /> 세계관·정사</span><span><CheckCircle2 /> AI 실시간 세계관 맥락</span><span><CheckCircle2 /> 캐릭터·세력</span><span><CheckCircle2 /> NPC·세력 자율 행동</span><span><CheckCircle2 /> 관계 이유 기억</span><span><CheckCircle2 /> 사건·시계·복선</span><span><CheckCircle2 /> 캐릭터·트리거 이미지</span><span><CheckCircle2 /> GM 데이터·첫 장면</span></div></Panel></div><Panel title="현재 프로젝트를 위한 핵심 정보" note="아래 정보가 AI 요청문의 아이디어 칸에 들어갈 핵심입니다." wide><div className="ai-summary"><div><span>제목</span><b>{project.title}</b></div><div><span>자율 배우</span><b>{project.autonomyActors.length}</b></div><div><span>세계관 AI</span><b>{project.aiWorldContext.enabled ? "ON" : "OFF"}</b></div>{project.runtimeMode === "instant_story" && <div><span>난이도</span><b>{project.difficulty}</b></div>}</div></Panel></PageFrame>;
}

export function ExportSection({ project, notify }: { project: Project; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [imageMode, setImageMode] = useState<ImageExportMode>("screen");
  const [imageProgress, setImageProgress] = useState<ImageOptimizationProgress | null>(null);
  const [lastExport, setLastExport] = useState("");
  const review = cortexExportReview(project);
  const reviewKey = JSON.stringify([project.projectId, project.runtimeMode, project.packageTarget, review.globalTerms, review.eventTerms, project.events.map((e) => [e.id, e.cortexDesign])]);
  const [emptyProtectionReviewed, setEmptyProtectionReviewed] = useState("");
  const [policyReviewed, setPolicyReviewed] = useState("");
  const reviewPending = (review.emptyProtectedTerms && emptyProtectionReviewed !== reviewKey) || (review.unsupportedEventPolicy && policyReviewed !== reviewKey);
  const issues = useMemo(() => validateProject(project), [project]);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const imageCount = visualManifest(project).characters.reduce((sum, character) => sum + character.images.length, 0);
  const triggerImageCount = project.imageTriggers.reduce((sum, trigger) => sum + trigger.attachedImages.length, 0);
  const packageVersion = packageVersionFor(project);
  const isInstant = project.runtimeMode === "instant_story";
  const isCortex = project.packageTarget === "cortex";
  const usesBlobImages = projectUsesBlobImages(project);
  const packName = isCortex ? "CortexPack" : isInstant ? "InstantStoryPack" : "ScenarioPack";
  const makeZip = async (mode: ImageExportMode = imageMode) => {
    setBusy(true); setImageProgress(null); setLastExport("");
    try {
      const summary = await exportScenarioPack(project, true, { imageMode: mode, onImageProgress: setImageProgress, acknowledgeEmptyProtection: emptyProtectionReviewed === reviewKey, acknowledgeUnsupportedPolicy: policyReviewed === reviewKey });
      const result = `${packName} ${(summary.blobBytes / 1024 / 1024).toFixed(1)} MiB · 이미지 ${summary.logicalAssetCount}장 · ${mode === "screen" ? `${summary.imageOptimization.converted}장 최적화, ${summary.imageOptimization.retained}장 원본 유지` : "원본 보존"}`;
      const contextNote = summary.instantContextPreflight?.status === 'INPUT_MARGIN_LOW' ? ' · Instant 입력 여유가 작습니다. 설정집과 캐릭터 설명의 중복 내용을 줄이면 긴 입력이 더 안정적입니다.' : '';
      setLastExport(result + contextNote); notify(result + contextNote);
    } catch (error) { notify(`ZIP 생성에 실패했습니다: ${error instanceof Error ? error.message : "오류"}`); }
    finally { setBusy(false); setImageProgress(null); }
  };
  return <PageFrame eyebrow="VALIDATE & EXPORT" title="하나의 파일로 작품을 실행하고 다시 편집하세요" description={isCortex ? "Cortex 엔진 맞춤 실행 계약과 캐릭터 불변식, Studio 편집 원본을 독립 CortexPack에 담습니다." : isInstant ? "Instant Runtime 실행 자료와 Studio 편집 원본 JSON을 한 ZIP에 함께 담습니다. 정사 Runtime으로는 폴백하지 않습니다." : "Nexus 실행 자료와 이미지 포함 Studio 편집 원본 JSON을 한 ScenarioPack에 함께 담습니다."}>
    <section className="export-hero"><div><span className={errors ? "status-dot bad" : "status-dot good"} />{errors ? "수정이 필요한 항목이 있습니다" : reviewPending ? "보호어·엔진 지원 범위를 확인하세요" : `${packName}을 만들 준비가 됐습니다`}<h2>{project.title}</h2><p>지음 {JIEUM_VERSION} · Studio {STUDIO_VERSION} 호환 · Package {packageVersion} · {isCortex ? `Cortex 맞춤 · 불변식 ${project.protagonistInvariants.length}개` : isInstant ? "Instant Story Runtime v2 전용 · 사건/정사 엔진 없음" : `지능형 정사 전개 · 자율 배우 ${project.autonomyActors.length} · 이유 기억 ${project.relationshipMemories.length}`} · HUD {project.statusWindow.stats.length} 능력치 · 이미지 {imageCount + triggerImageCount}장</p></div><button className="primary-button export-main" disabled={busy || errors > 0 || reviewPending} onClick={() => void makeZip()}>{busy ? <RefreshCw className="spin" size={18} /> : <FileArchive size={18} />}{busy ? imageProgress && imageProgress.completed < imageProgress.total ? `이미지 최적화 ${imageProgress.completed}/${imageProgress.total}` : "ZIP 구성 중…" : errors ? `오류 ${errors}건 수정 필요` : reviewPending ? "아래 내보내기 항목 확인 필요" : `${imageMode === "screen" ? "화면용 최적화" : "원본 보존"} ${packName} ZIP`}</button></section>
    {isCortex && <Panel title="보호어·엔진 지원 범위" note={isInstant ? "전역 보호어는 선택 사항입니다. 비어 있어도 패키지를 바로 내보낼 수 있습니다." : "현재 작품의 목록과 실행 가능 범위를 확인한 뒤 내보내세요."}>
      <p>전역 보호어 {review.globalTerms.length}개 · 사건별 공개어가 있는 사건 {review.eventTerms.length}개</p>
      <details><summary>내보낼 보호어 목록 확인</summary><p>{review.globalTerms.join(" · ") || "전역 보호어 없음"}</p>{review.eventTerms.map((e) => <p key={e.id}>{e.name}: {e.terms.join(" · ")}</p>)}</details>
      <p>수정 위치: 감독실 → GM 진실 장부 → 전역 보호어. 사건별 공개어는 각 사건의 공개 범위에서 편집합니다.</p>
      {review.emptyProtectedTerms && <Toggle checked={emptyProtectionReviewed === reviewKey} onChange={(checked) => setEmptyProtectionReviewed(checked ? reviewKey : "")} label="전역 보호어 없이 내보내기" note="전역 목록을 사용하는 문자열 보호가 비어 있음을 확인했습니다. 사건별 공개어만으로 작품 전체의 비밀을 보호하지 않습니다." />}
      <p>Nexus {review.compatibility.provenance.nexusVersion} · Cortex {review.compatibility.targetEngineVersion} · 단청 확장 {review.compatibility.provenance.extensionRevision}</p>
      {review.compatibility.limitations.map(item => <p key={item.code}>{item.message}</p>)}
      {review.compatibility.notes.map(note => <p key={note}>{note}</p>)}
      {review.unsupportedEventPolicy && <Toggle checked={policyReviewed === reviewKey} onChange={(checked) => setPolicyReviewed(checked ? reviewKey : "")} label="현재 엔진의 지원 한계를 확인했습니다" note="원본 설정은 ZIP에 보존됩니다. 미지원 기능은 엔진 업데이트 후 실행할 수 있습니다." />}
    </Panel>}
    <Panel title="패키지 이미지 저장" note="작업 중인 원본은 유지하고, 내보내는 ZIP에만 선택한 설정을 적용합니다.">
      <fieldset disabled={busy} className="image-export-options"><Select label="이미지 품질" value={imageMode} onChange={(value) => setImageMode(value as ImageExportMode)} options={[{ value: "screen", label: "화면용 최적화 · 긴 변 최대 1,600px" }, { value: "original", label: "원본 보존 · 해상도와 바이트 그대로" }]} /></fieldset>
      <p className="image-export-note">{imageMode === "screen" ? "비율을 유지하며 WebP 품질 85로 저장합니다. WebP 저장을 지원하지 않으면 불투명 이미지는 JPEG, 투명 이미지는 PNG를 사용합니다. 세부 화질과 색상·메타데이터는 달라질 수 있으며, 확대용 원본은 별도 백업하세요. 애니메이션·이미 최적화된 이미지·변환해도 커지는 이미지는 유지합니다." : "현재 작업의 이미지 바이트를 그대로 저장합니다. 최적화 ZIP에서 불러온 이미지를 이전 고해상도 원본으로 되돌리는 기능은 아닙니다."}</p>
      <p className="image-export-note">최적화 ZIP도 서사·인물 설정과 이미지 연결을 보존하며 Studio에서 다시 편집할 수 있습니다. 이미지 원본 바이트의 무손실 복원은 원본 보존 백업 ZIP을 사용하세요.</p>
      <div role="status" aria-live="polite">{busy && imageProgress ? `이미지 처리 ${imageProgress.completed} / ${imageProgress.total}` : lastExport}</div>
    </Panel>
    <div className="snapshot-notice"><FileJson size={21} /><div><b>편집 스냅샷 V2 · 이미지 중복 저장 없음</b><span>studio/project-snapshot.json에는 제작 설정과 자산 참조만 저장하고, 이미지 {imageCount + triggerImageCount}장은 선택한 품질로 assets/에 한 번만 저장합니다.</span></div><strong>{imageCount + triggerImageCount}<small> IMAGES</small></strong></div>
    <div className="export-grid"><button className="snapshot-export-button" disabled={busy || errors > 0 || reviewPending} onClick={() => void makeZip("original")}><FileArchive /><span><b>원본 보존 백업 ZIP</b><small>현재 이미지 화질과 제작 설정을 그대로 보관</small></span><Download /></button>{!usesBlobImages && <button className="snapshot-export-button" onClick={() => { downloadProject(project); notify(`캐릭터·트리거 이미지 ${imageCount + triggerImageCount}장을 포함한 작업 JSON을 저장했습니다.`); }}><FileJson /><span><b>현재 작업 JSON</b><small>작은 기존 프로젝트용 단일 파일 복원 원본</small></span><Download /></button>}{!isInstant && <><button onClick={() => downloadImportMd(project)}><FileText /><span><b>ChatGPT용 MD</b><small>채팅에 바로 업로드하는 통합 설정</small></span><Download /></button><button onClick={() => downloadImportJson(project)}><ShieldCheck /><span><b>구조화 IMPORT JSON</b><small>시뮬레이터 전달용 공개/비공개 구조</small></span><Download /></button><button onClick={() => { navigator.clipboard.writeText(JSON.stringify(buildImportObject(project), null, 2)); notify("IMPORT JSON을 클립보드에 복사했습니다."); }}><Copy /><span><b>IMPORT JSON 복사</b><small>다른 도구에 빠르게 전달</small></span><ArrowRight /></button></>}</div>
    <div className="validation-summary"><div><strong>{issues.length}</strong><span>전체 검사</span></div><div className="error"><strong>{errors}</strong><span>오류</span></div><div className="warning"><strong>{warnings}</strong><span>경고</span></div><div className="info"><strong>{issues.filter((issue) => issue.severity === "info").length}</strong><span>안내</span></div></div>
    <Panel title={isCortex && !isInstant ? "설정 검증 · Cortex 패키지 린터" : "설정 검증 결과"} note={isCortex && !isInstant ? "Cortex 1.42.0의 구조·참조·종결조건·분기 지원 범위를 검사합니다." : "경고가 있어도 내보낼 수 있지만 의도한 설정인지 확인하는 편이 좋습니다."} badge={`${errors} ERR · ${warnings} WARN`}><div className="issue-list">{issues.map((issue, index) => <div key={`${issue.area}-${index}`} className={`issue ${issue.severity}`}>{issue.severity === "error" ? <AlertCircle /> : issue.severity === "warning" ? <CircleAlert /> : <CheckCircle2 />}<div><b>{issue.area}</b><span>{issue.message}</span></div></div>)}</div></Panel>
    <Panel title="ZIP 패키지 구성" note="단청·Nexus는 실행 자료만 사용하고 studio/ 편집 인덱스는 무시합니다. Relay Core는 manifest의 editorSource와 assets/를 함께 읽습니다." wide><div className="package-tree"><span className="highlight">studio/project-snapshot.json · V2 편집 인덱스</span><span className="highlight">assets/ · 선택한 품질의 이미지 1회 저장</span>{isCortex && <span className="highlight">cortex/protagonist_invariants.json · HARD/SOFT 계약</span>}{isInstant ? <><span>manifest.json · INSTANT_RUNTIME_IMPORT.json</span><span>world/ · characters/ · start/ · assets/</span><span className="highlight">project.json · 작가 전용 비공개 컨텍스트 원본</span><span className="highlight">rules/instant_story_runtime.json</span><span className="highlight">runtime/context_index.json · keyword_index.json · media_lookup.json</span><span className="highlight">schemas/instant_story_runtime_v2.schema.json</span><span>미포함: events/ · actors/ · relations/ · routes/ · loops/ · narrative_runtime</span></> : <><span>manifest.json · CHATGPT_IMPORT.md / .json</span><span>world/ · characters/ · factions/ · events/ · gm/ · start/</span><span className="highlight">Asset-Once 실행 자산 · SHA-256</span><span className="highlight">rules/narrative_runtime.json · 지능형 정사 전개</span>{project.package15.enabled && <><span className="highlight">routes/route_graph.json · chapters · reveal · endings</span><span className="highlight">loops/loop_policy.json · state/*_definitions.json</span></>}<span className="highlight">actors/autonomy_actors.json · relations/relationship_memories.json</span></>}</div></Panel>
  </PageFrame>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="empty-state">{icon}<p>{text}</p></div>; }
