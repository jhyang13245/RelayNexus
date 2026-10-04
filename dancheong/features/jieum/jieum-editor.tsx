"use client";
import {CanonWorldSection,CanonDirectionSection,CanonStatsSection,CanonFactionsSection} from './canon-sections';
import {canonDesign,activateCanonAuthoring} from './canon-design';
import {hasLegacyCanonContracts} from './canon-hud';
import {CanonStorySection} from './canon-story';
import {CanonExport} from './canon-export';
import {saveProjectFile} from './project-file';

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Aperture, BookOpen, BookOpenCheck, Boxes, BrainCircuit, CheckCircle2, ChevronRight, Download, Feather, FileJson, FileUp,
  Gauge, GitFork, Globe2, KeyRound, LayoutDashboard, Menu, MoreHorizontal, Network, PanelLeftClose, Save, ShieldAlert, ShieldCheck,
  Settings2, Sparkles, Users, WandSparkles, X,
} from "lucide-react";
import { useJieumDraft } from "./use-jieum-draft";
import { JieumShell } from "./jieum-shell";
import { JIEUM_VERSION } from "./jieum-version";
import { CreationBasics, basicScreens, writingSteps } from "./creation-basics";
import { getJieumHandoff, validateJieumBlueprint, MAX_HANDOFF_BYTES } from "../../lib/jieum-store";
import "./jieum-scoped.css";
import "./jieum-design.css";
import type { Project } from "./studio-model";
import { projectFromNexusBlueprint } from "./nexus-blueprint";
import { convertLotusProjectToCortex, makeNewStudioProject, makeProjectForPackageTarget, normalizeProject, reviveProjectImageUrls, validateProject } from "./studio-model";
import {
  AiSection, CharactersSection, Dashboard, DirectionSection, ExportSection,
  ProjectSection, RelationsSection, StorySection, WorldSection,
} from "./studio-sections";
import { AutonomySection } from "./autonomy-section";
import { Package15Section } from "./package15-section";
import { InstantCharactersSection, InstantKeywordsSection, InstantOpeningSection, InstantSettingBookSection, InstantStatsSection } from "./instant-story-section";
import { ProtagonistInvariantsSection } from "./protagonist-invariants-section";
import { downloadProject, extractStudioProjectFromPackage, STUDIO_VERSION, type PackageImportProgress } from "./studio-export";

type Screen = "dashboard" | "project" | "world" | "characters" | "invariants" | "relations" | "autonomy" | "story" | "routes" | "instant" | "stats" | "keywords" | "direction" | "ai" | "export";
const canonNavItems: { id: Screen; label: string; caption: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "지음 홈", caption: "진행 현황과 빠른 시작", icon: LayoutDashboard },
  { id: "world", label: "세계관", caption: "정사와 AI 실시간 맥락", icon: Globe2 },
  { id: "characters", label: "캐릭터", caption: "인물과 기준 이미지", icon: Users },
  { id: "relations", label: "세력", caption: "방향성 관계 설계", icon: Network },

  { id: "story", label: "사건", caption: "사건·시계·복선·이미지", icon: Boxes },

  { id: "direction", label: "도입부 및 서술 설정", caption: "상태창·시작 장면·진실", icon: Aperture },

  { id: "export", label: "검증·내보내기", caption: "ScenarioPack 생성", icon: ShieldCheck },
];
canonNavItems.splice(canonNavItems.length-1,0,{id:"stats",label:"스탯·자원",caption:"작품에 필요한 수치",icon:Gauge});
const instantNavItems: typeof canonNavItems = [
  { id: "dashboard", label: "지음 홈", caption: "Runtime 선택과 빠른 시작", icon: LayoutDashboard },
  { id: "project", label: "프로젝트", caption: "장르·시점·플레이 방식", icon: BookOpen },
  { id: "world", label: "설정집", caption: "공개·비공개 세계관과 예시", icon: Globe2 },
  { id: "characters", label: "캐릭터", caption: "설정·외형·내장 이미지", icon: Users },
  { id: "instant", label: "도입부 설정", caption: "프롤로그와 세 파동", icon: BookOpenCheck },
  { id: "stats", label: "스탯 규칙", caption: "수치와 구간별 변화", icon: Gauge },
  { id: "keywords", label: "키워드 노트", caption: "상황별 참고 설정", icon: KeyRound },
  { id: "export", label: "검증·내보내기", caption: "InstantStoryPack 생성", icon: ShieldCheck },
];
const cortexNavItems = (items: typeof canonNavItems): typeof canonNavItems => items.flatMap((item) => {
  if (item.id === "characters") return [item, { id: "invariants" as const, label: "캐릭터 불변식", caption: "인물별 HARD·SOFT 보호", icon: ShieldAlert }];
  return [item.id === "export" ? { ...item, caption: "CortexPack 생성" } : item];
});
const cortexCanonNavItems = cortexNavItems(canonNavItems);
const cortexInstantNavItems = cortexNavItems(instantNavItems);
const projectUsesBlobImages = (project: Project) => [project.player, ...project.npcs]
  .some((character) => character.images.some((image) => image.sourceBlob instanceof Blob))
  || project.imageTriggers.some((trigger) => trigger.attachedImages.some((image) => image.sourceBlob instanceof Blob));

const completion = (project: Project) => {
  const steps = writingSteps(project);
  return Math.round(steps.filter(step => step.done).length / steps.length * 100);
};

export function projectFromNexusHandoff(search: string): { project: Project; screen: Screen } | null {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "relay-nexus") return null;
  const idea = (params.get("idea") ?? "").trim().slice(0, 6000);
  if (!idea) return null;
  const runtime = params.get("runtime") === "instant_story" ? "instant_story" : "intelligent_canon";
  const project = makeNewStudioProject(runtime);
  project.notes = idea;
  project.world.overview = idea;
  project.opening.currentSituation = idea;
  if (runtime === "instant_story") {
    project.instantStory.enabled = true;
    project.instantStory.corePrompt = idea;
    return { project, screen: "world" };
  }
  project.aiWorldContext.enabled = true;
  project.aiWorldContext.premise = idea;
  return { project, screen: "world" };
}


export async function blueprintFromNexusHash(hash: string): Promise<unknown> {
  const marker = "#relay-blueprint=";
  if (!hash.startsWith(marker)) throw new Error("Nexus Studio JSON 전달 정보가 없습니다.");
  const packed = hash.slice(marker.length);
  const separator = packed.indexOf(".");
  if (separator < 1) throw new Error("Nexus Studio JSON 전달 형식이 올바르지 않습니다.");
  const encoding = packed.slice(0, separator);
  const encoded = packed.slice(separator + 1).replaceAll("-", "+").replaceAll("_", "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(padded);
  const packedBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let jsonBytes = packedBytes;
  if (encoding === "gzip") {
    if (!("DecompressionStream" in window)) throw new Error("이 브라우저에서는 압축된 Nexus JSON을 불러올 수 없습니다.");
    const buffer = packedBytes.buffer.slice(packedBytes.byteOffset, packedBytes.byteOffset + packedBytes.byteLength) as ArrayBuffer;
    const decompressed = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    const reader=decompressed.getReader(),chunks:Uint8Array[]=[];let total=0;
    try { while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>MAX_HANDOFF_BYTES)throw new Error('청사진이 너무 큽니다. 파일로 가져와 주세요.');chunks.push(part.value)} }
    finally { await reader.cancel(); }
    jsonBytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){jsonBytes.set(chunk,offset);offset+=chunk.byteLength}
  } else if (encoding !== "json") {
    throw new Error("지원하지 않는 Nexus Studio JSON 인코딩입니다.");
  }
  if(jsonBytes.byteLength>MAX_HANDOFF_BYTES)throw new Error('청사진이 너무 큽니다. 파일로 가져와 주세요.');
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as unknown;
}

export default function JieumEditor() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [detailedScreen, setDetailedScreen] = useState<Screen | null>(null);
  const {project,setProject,ready,saved,error:storageError,conflict,flush,replace}=useJieumDraft();
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [incoming,setIncoming]=useState<{project:Project;id?:string}|null>(null);
  const [reviewOpen,setReviewOpen]=useState(true);
  const [pendingFile,setPendingFile]=useState<File|null>(null);
  const fileReviewDialog=useRef<HTMLDialogElement>(null);
  const incomingDialog=useRef<HTMLDialogElement>(null),importDialog=useRef<HTMLDialogElement>(null);
  const [applying,setApplying]=useState(false);
  const [toast, setToast] = useState("");
  const [importProgress, setImportProgress] = useState<PackageImportProgress | null>(null);
  useEffect(()=>{const dialog=fileReviewDialog.current;if(pendingFile&&!dialog?.open)dialog?.showModal();else if(!pendingFile&&dialog?.open)dialog.close()},[pendingFile]);
  useEffect(()=>{const dialog=incomingDialog.current;if(incoming&&reviewOpen&&!dialog?.open)dialog?.showModal();else if((!incoming||!reviewOpen)&&dialog?.open)dialog.close()},[incoming,reviewOpen]);
  useEffect(()=>{const dialog=importDialog.current;if(importProgress&&!dialog?.open)dialog?.showModal();else if(!importProgress&&dialog?.open)dialog.close()},[importProgress]);
  const toastTimer = useRef<number | null>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const progress = useMemo(() => completion(project), [project]);
  const issueCount = useMemo(() => validateProject(project).filter((issue) => issue.severity === "error").length, [project]);
  const legacyCanon = project.runtimeMode === 'intelligent_canon' && !project.canonDesign && (hasLegacyCanonContracts(project) || !!project.canonHud);
  const activeNavItems = project.packageTarget === "cortex"
    ? project.runtimeMode === "instant_story" ? cortexInstantNavItems : legacyCanon ? [...cortexCanonNavItems,{id:'routes' as const,label:'기존 루프·분기·엔딩',caption:'원본 계약 보존 편집',icon:GitFork}] : cortexCanonNavItems
    : project.runtimeMode === "instant_story" ? instantNavItems : canonNavItems;
  const mobileNavItems = activeNavItems.filter(item => ["dashboard", "world", "characters", "export"].includes(item.id));
  const mainScreens: Screen[] = project.runtimeMode === "instant_story"
    ? ["dashboard", "project", "world", "characters", "invariants", "instant", "stats", "keywords", "export"]
    : ["dashboard", "world", "characters", "invariants", "direction", "story", "stats", "relations", "export"];
  const mainNavItems = mainScreens.flatMap(id => activeNavItems.filter(item => item.id === id));
  const extraNavItems = activeNavItems.filter(item => !mainScreens.includes(item.id));

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  };

  useEffect(()=>{
    if(!ready)return;let cancelled=false;const params=new URLSearchParams(window.location.search),id=params.get('transfer');
    const receive=async()=>{
      try{
        if(id){const delivery=await getJieumHandoff(id,window.location.origin);if(!cancelled)setIncoming({project:projectFromNexusBlueprint(delivery.blueprint),id})}
        else if(params.get('source')==='relay-nexus'&&params.get('handoff')==='structured-v2'){
          if(window.location.hash.length>2_800_000)throw new Error('청사진이 너무 큽니다. 파일로 가져와 주세요.');
          const blueprint=await blueprintFromNexusHash(window.location.hash);validateJieumBlueprint(blueprint);if(!cancelled)setIncoming({project:projectFromNexusBlueprint(blueprint)})
        }
      }catch(e){if(!cancelled)notify(e instanceof Error?e.message:'청사진을 읽지 못했습니다.')}
    };void receive();return()=>{cancelled=true};
  },[ready]);
  const applyIncoming=async()=>{if(!incoming)return;setApplying(true);try{await replace(incoming.project,incoming.id);setScreen('world');setIncoming(null);window.history.replaceState({},'',window.location.pathname);notify('청사진을 지음 작업으로 저장했습니다.')}catch(e){notify(e instanceof Error?e.message:'저장하지 못했습니다.')}finally{setApplying(false)}};
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 981px)");
    const syncNavigation = (event?: MediaQueryListEvent) => setSidebarOpen(event ? event.matches : desktop.matches);
    syncNavigation();
    desktop.addEventListener("change", syncNavigation);
    return () => desktop.removeEventListener("change", syncNavigation);
  }, []);
  useEffect(() => {
    if (!sidebarOpen || window.innerWidth >= 981) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [sidebarOpen]);

  const go = (next: Screen) => { if(project.runtimeMode!=="instant_story"&&["project","ai","autonomy","routes"].includes(next))next="dashboard"; setScreen(next); setDetailedScreen(null); if (window.innerWidth < 980) setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const switchPackageTarget = (packageTarget: Project["packageTarget"]) => {
    if (packageTarget === project.packageTarget) return;
    if (!confirm("패키지 종류를 바꾸면 현재 작업을 비우고 독립된 새 프로젝트를 시작합니다. 필요한 경우 먼저 패키지 ZIP을 저장하세요. 계속할까요?")) return;
    setProject(makeProjectForPackageTarget(packageTarget, project.runtimeMode, true));
    settingsRef.current?.close();
    setScreen("dashboard");
    notify(packageTarget === "cortex" ? "Cortex 엔진 맞춤 프로젝트를 시작했습니다." : "Lotus 엔진 호환 프로젝트를 시작했습니다.");
  };
  const convertToCortex = () => {
    if (project.packageTarget === "cortex") return;
    const modeName = project.runtimeMode === "instant_story" ? "Instant Story" : "지능형 정사 전개";
    if (!confirm(`현재 Lotus ${modeName} 프로젝트를 Cortex 전용 구조로 변환할까요? 서사와 이미지는 유지하고, 위치 그래프와 장소 ID는 폐기합니다. 장소명은 자연어 설정에 남깁니다.`)) return;
    const converted = convertLotusProjectToCortex(project);
    setProject(converted.project);
    setScreen("dashboard");
    notify(`Cortex 변환 완료 · 이미지 ${converted.report.preservedImages}장 보존 · 장소는 자연어 설정으로 정리했습니다.`);
  };
  const importProjectFile = async (file?: File) => {
    if (!file || !ready || applying || importProgress || conflict) return;
    try {
      setImportProgress({phase:'opening',loadedBytes:0,totalBytes:file.size,currentImage:0,totalImages:0,detail:'기존 작업을 보존하면서 파일을 확인합니다.'});
      const fromZip = file.name.toLowerCase().endsWith(".zip");
      if (!fromZip && file.size > 64 * 1024 * 1024) throw new Error("대용량 작업 JSON 대신 패키지 ZIP을 선택해 주세요. ZIP은 iPhone 안전 모드로 순차 복원됩니다.");
      let lastProgressAt = 0;
      const imported = fromZip ? await extractStudioProjectFromPackage(file, (next) => {
        const now = performance.now();
        if (next.phase === "verifying" || now - lastProgressAt > 90 || next.loadedBytes >= next.totalBytes) {
          lastProgressAt = now;
          setImportProgress(next);
        }
      }) : null;
      const raw = imported ? imported.project : JSON.parse((await file.text()).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
      const candidate = imported ? raw : raw.project ?? raw.data ?? raw.currentProject ?? raw.scenario ?? raw;
      if(!candidate || typeof candidate !== "object" || typeof candidate.title !== "string" || !candidate.player || !candidate.world) throw new Error("Studio 작업 JSON이나 원본 보존 ZIP을 선택해 주세요.");
      if(!fromZip && raw.imageStorage === "zip_asset_ref") throw new Error("이미지 참조가 있는 편집 원본은 ZIP 전체로 가져와 주세요.");
      const normalized = reviveProjectImageUrls(normalizeProject(candidate));
      setImportProgress({ phase: "verifying", loadedBytes: file.size, totalBytes: file.size, currentImage: 0, totalImages: 0, detail: "기기 저장소에 안전하게 기록" });
      await replace(normalized);
      setScreen("dashboard");
      notify(imported?.fullFidelity ? "편집 원본과 이미지를 모바일 안전 모드로 복원했습니다." : imported ? "설정과 이미지를 모바일 안전 모드로 복원했습니다." : "작업 JSON을 불러왔습니다.");
    } catch (error) {
      notify(`파일을 읽지 못했습니다: ${error instanceof Error ? error.message : "형식 오류"}`);
    } finally {
      setImportProgress(null);
    }
  };
  useEffect(()=>{if(ready&&project.packageTarget==="cortex"&&project.runtimeMode==="intelligent_canon"&&!project.canonDesign&&!legacyCanon)setProject(activateCanonAuthoring);},[ready,project.packageTarget,project.runtimeMode,project.canonDesign,legacyCanon,setProject]);
  const activeLabel = activeNavItems.find((item) => item.id === screen)?.label ?? "지음 홈";
  const showBasicAuthoring = project.packageTarget !== "cortex" && basicScreens.includes(screen) && !(project.runtimeMode === "instant_story" && screen !== "project");
  const requestImport=async(file?:File)=>{if(file&&ready&&!conflict)setPendingFile(file)};

  return (
    <JieumShell flush={flush}><div className="jieum-editor"><main className={`studio-shell ${sidebarOpen ? "sidebar-is-open" : "sidebar-is-closed"}`}>
      <aside className="studio-sidebar" aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
        <div className="brand-lockup"><div className="brand-mark"><Feather size={20} strokeWidth={1.8} /></div><div><strong>단청 지음</strong><span>JIEUM · {JIEUM_VERSION}</span></div><button className="sidebar-close" aria-label="전체 메뉴 닫기" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="studio-engine-status"><span>현재 엔진</span><b>{project.packageTarget === "cortex" ? "Cortex" : "Lotus · 호환 모드"}</b><button type="button" onClick={() => settingsRef.current?.showModal()} aria-label="지음 설정"><Settings2 size={17} /> 설정</button></div>
        <div className="project-mini"><div className="project-mini-top"><span>현재 프로젝트</span><b>{progress}%</b></div><p>{project.title}</p><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><small>{project.runtimeMode === "instant_story" ? "Instant Story" : "지능형 정사"}</small></div>
        <nav className="studio-nav" aria-label="지음 저작 메뉴">{mainNavItems.map((item, index) => { const Icon = item.icon; return <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => go(item.id)}><span className="nav-index">{String(index + 1).padStart(2, "0")}</span><Icon size={18} strokeWidth={1.7} /><span><b>{item.id === "direction" ? "도입부 및 서술 설정" : item.id === "story" ? "사건" : item.label}</b></span>{item.id === "export" && issueCount > 0 ? <span className="nav-alert">{issueCount}</span> : <ChevronRight className="nav-chevron" size={15} />}</button>; })}
          {extraNavItems.length > 0 && <details className="jieum-extra" open={extraNavItems.some(item => item.id === screen) || undefined}><summary>추가 설계 도구</summary>{extraNavItems.map(item => { const Icon = item.icon; return <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => go(item.id)}><Icon size={18} /><span><b>{item.label}</b><small>{item.caption}</small></span></button>; })}</details>}
        </nav>
        <div className="sidebar-foot"><Sparkles size={16} /><p><b>모든 설정은 이 기기에 자동 저장됩니다.</b><span>이미지는 프로젝트와 패키지 파일에도 포함됩니다.</span></p></div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)} />}
      <dialog ref={settingsRef} className="studio-settings-dialog" aria-labelledby="studio-settings-title">
        <header><div><h2 id="studio-settings-title">지음 설정</h2><p>기본 제작 엔진은 Cortex입니다.</p></div><button type="button" className="icon-button" aria-label="설정 닫기" onClick={() => settingsRef.current?.close()}><X size={20} /></button></header>
        <section><h3>엔진 호환 모드</h3><p>현재 작업: <strong>{project.packageTarget === "cortex" ? "Cortex" : "Lotus"}</strong></p>
          {project.packageTarget === "cortex" ? <><p>구형 엔진용 작품을 새로 제작할 때 Lotus 모드를 선택하세요. 현재 작업을 교체하기 전에 확인합니다.</p><button type="button" className="soft-button" onClick={() => switchPackageTarget("legacy")}>Lotus 모드로 새 작업</button></> : <><p>Lotus 패키지를 편집 중입니다. 현재 내용을 유지하며 Cortex로 변환할 수 있습니다.</p><button type="button" className="primary-button" onClick={() => { settingsRef.current?.close(); convertToCortex(); }}>현재 작업을 Cortex로 변환</button><button type="button" className="soft-button" onClick={() => switchPackageTarget("cortex")}>Cortex로 새 작업</button></>}
        </section>
        <footer><button type="button" className="soft-button" onClick={() => settingsRef.current?.close()}>닫기</button></footer>
      </dialog>

      <section className="studio-workspace">
        <header className="topbar" aria-label="지음 편집 도구">
          <button className="icon-button" aria-label="사이드바 열기 또는 접기" onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={19} />}</button>
          <div className="mobile-topbar-copy"><span>DANCHEONG JIEUM</span><b>{activeLabel}</b></div>
          <div className="crumbs"><span>DANCHEONG JIEUM</span><i /><b>{activeLabel}</b></div><div className="topbar-spacer" />
          <div className={`save-state ${saved ? "saved" : "saving"}`}>{saved ? <CheckCircle2 size={15} /> : <Save size={15} />}<span>{storageError ? "저장 확인 필요" : saved ? "이 기기에 저장됨" : "저장 중"}</span></div>
          {project.packageTarget === "legacy" && <button className="soft-button cortex-convert-topbar" onClick={convertToCortex}><Sparkles size={16} /><span>Cortex로 변환</span></button>}
          <button disabled={!ready||conflict} className="soft-button snapshot-topbar-button" aria-label="패키지 ZIP 또는 작업 JSON 불러오기" onClick={() => projectImportRef.current?.click()}><FileUp size={16} /><span>불러오기</span></button>
          <input ref={projectImportRef} hidden type="file" accept=".zip,.json,.md,.txt" onChange={(event) => { void requestImport(event.target.files?.[0]); event.target.value = ""; }} />
          {!projectUsesBlobImages(project) && <button className="soft-button snapshot-topbar-button desktop-project-json" aria-label="작은 기존 프로젝트를 이미지 포함 JSON으로 저장" onClick={() => { downloadProject(project); notify("작업 JSON을 저장했습니다."); }}><FileJson size={16} /><span>작업 JSON</span></button>}
          <button className="soft-button" onClick={() => go("export")}><ShieldCheck size={16} /> 검증{issueCount > 0 && <span className="button-count">{issueCount}</span>}</button>
          <button className="primary-button" onClick={() => go("export")}><Download size={16} /> {project.packageTarget === "cortex" ? "CortexPack" : "패키지 만들기"}</button>
          <div className="mobile-progress-line" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
        </header>
        {storageError&&<div className="jieum-storage-error" role="alert">{storageError}<button type="button" onClick={()=>go('export')}>작업 내보내기</button></div>}
        {incoming&&!reviewOpen&&<div className="jieum-pending">홈에서 전달받은 청사진이 있습니다.<button onClick={()=>setReviewOpen(true)}>다시 검토하기</button></div>}
        <div className="workspace-scroll" inert={Boolean(importProgress)||applying||Boolean(incoming&&reviewOpen)}>
          <div className="jieum-edition"><span>저작 공간 · JIEUM {JIEUM_VERSION}</span><span>{project.runtimeMode === "instant_story" ? `지음 ${JIEUM_VERSION} Instant 저작 계약` : "Studio 2.3.2 파일 호환"}</span></div>
          {screen==='dashboard'&&<p className="jieum-import-help">{project.runtimeMode === "instant_story" ? "지음 작업은 원본 보존 ZIP이나 작업 JSON으로 이어 쓸 수 있습니다." : "기존 Studio 작업은 원본 보존 ZIP이나 작업 JSON으로 가져오세요."} 초안은 이 브라우저에 저장되며 다른 기기에 자동 동기화되지 않습니다.</p>}
          {legacyCanon&&<p className="jieum-import-help" role="status">원본 계약 보존 모드 · 기존 루프, 복수 엔딩과 복합 조건을 그대로 편집·내보냅니다. 새 정사 형식으로 자동 변환하지 않습니다. 스탯·자원은 사건 연결을 바꾸지 않고 추가할 수 있습니다.</p>}
          {!ready ? <div className="loading-studio"><div className="loading-mark"><Feather /></div><b>프로젝트를 여는 중</b><span>이미지와 설정을 안전하게 불러오고 있습니다.</span></div> : <>
            {showBasicAuthoring && <div className="jieum-writing-mode"><span>{detailedScreen === screen ? "상세 편집 · 기존 설정 전체" : "기본 작성 · 필요한 내용부터"}</span><button type="button" className="soft-button" aria-pressed={detailedScreen === screen} onClick={() => setDetailedScreen(detailedScreen === screen ? null : screen)}>{detailedScreen === screen ? "기본 작성으로" : "상세 설정 열기"}</button></div>}
            {showBasicAuthoring && detailedScreen !== screen ? <CreationBasics key={screen} screen={screen} project={project} setProject={setProject} /> : <>
            {screen === "dashboard" && <><section className="panel canon-home" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void requestImport(e.dataTransfer.files[0]);}}><div className="panel-body"><h2>기존 작품 불러오기</h2><p>저장한 JSON·패키지 ZIP을 선택하거나 이곳에 끌어놓으세요.</p><button className="soft-button" onClick={()=>projectImportRef.current?.click()}>파일 선택</button><label className="field-label"><span>작품 제목</span><input value={project.title} onChange={e=>setProject(p=>({...p,title:e.target.value}))} placeholder="작품의 제목"/></label><div className="field-row"><label className="field-label"><span>장르</span><input value={project.genre} onChange={e=>setProject(p=>({...p,genre:e.target.value}))} placeholder="학원 판타지"/></label><label className="field-label"><span>시작 장소</span><input value={project.startLocation} onChange={e=>setProject(p=>({...p,startLocation:e.target.value}))} placeholder="기성학원 기숙사 앞"/></label></div></div></section><Dashboard project={project} progress={progress} go={go} setProject={setProject} notify={notify} onConvertToCortex={convertToCortex} /></>}
            {screen === "project" && <ProjectSection project={project} setProject={setProject} />}
            {screen === "world" && (project.runtimeMode === "instant_story" ? <InstantSettingBookSection project={project} setProject={setProject} /> : <CanonWorldSection project={project} setProject={setProject} />)}
            {screen === "characters" && (project.runtimeMode === "instant_story" ? <InstantCharactersSection project={project} setProject={setProject} notify={notify} /> : <InstantCharactersSection project={project} setProject={setProject} notify={notify} />)}
            {screen === "invariants" && project.packageTarget === "cortex" && <ProtagonistInvariantsSection project={project} setProject={setProject} />}
            {screen === "relations" && <CanonFactionsSection project={project} setProject={setProject} />}
            {screen === "autonomy" && <AutonomySection project={project} setProject={setProject} />}
            {screen === "story" && (legacyCanon ? <StorySection project={project} setProject={setProject} notify={notify} /> : <CanonStorySection project={project} setProject={setProject} notify={notify} />)}
            {screen === "routes" && <Package15Section project={project} setProject={setProject} />}
            {screen === "instant" && project.runtimeMode === "instant_story" && <InstantOpeningSection project={project} setProject={setProject} />}
            {screen === "stats" && (project.runtimeMode === "instant_story" ? <InstantStatsSection project={project} setProject={setProject} /> : <CanonStatsSection project={project} setProject={setProject} />)}
            {screen === "keywords" && project.runtimeMode === "instant_story" && <InstantKeywordsSection project={project} setProject={setProject} />}
            {screen === "direction" && project.runtimeMode !== "instant_story" && (legacyCanon ? <DirectionSection project={project} setProject={setProject} /> : <CanonDirectionSection project={project} setProject={setProject} />)}
            {screen === "ai" && <AiSection project={project} setProject={setProject} notify={notify} onImportFile={requestImport} />}
            {screen === "export" && (project.runtimeMode === "instant_story" ? <ExportSection project={project} notify={notify} /> : <CanonExport project={project} notify={notify} go={go} />)}
            </>}
          </>}
        </div>
      </section>
      <nav className="mobile-dock" aria-label="모바일 빠른 메뉴">
        {mobileNavItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={screen === item.id && !sidebarOpen ? "active" : ""} aria-current={screen === item.id ? "page" : undefined} onClick={() => go(item.id)}><span className="mobile-dock-icon"><Icon size={21} strokeWidth={1.8} />{item.id === "export" && issueCount > 0 && <i>{issueCount}</i>}</span><b>{item.id === "dashboard" ? "홈" : item.id === "characters" ? "인물" : item.id === "world" ? project.runtimeMode === "instant_story" ? "설정집" : "세계관" : "내보내기"}</b></button>; })}
        <button type="button" className={sidebarOpen || !mobileNavItems.some((item) => item.id === screen) ? "active" : ""} aria-current={!mobileNavItems.some((item) => item.id === screen) ? "page" : undefined} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}><span className="mobile-dock-icon"><MoreHorizontal size={22} strokeWidth={1.8} /></span><b>전체</b></button>
      </nav>
      <dialog ref={incomingDialog} className="jieum-incoming" aria-labelledby="jieum-incoming-title" onCancel={event=>{if(applying)event.preventDefault();else setReviewOpen(false)}}>{incoming&&<><small>홈에서 전달된 청사진</small><h2 id="jieum-incoming-title">{incoming.project.title}</h2><p>{incoming.project.runtimeMode==='instant_story'?'Instant Story':'지능형 정사'} · 주인공 {incoming.project.player.name}</p><p>{incoming.project.world.overview}</p><p>검토 후 적용하면 현재 편집 초안을 교체합니다. 기존 작업은 먼저 파일로 내보낼 수 있습니다. 진행 중인 Cortex 세션은 바뀌지 않습니다.</p><div><button type="button" disabled={applying||conflict} onClick={()=>void applyIncoming()}>이 청사진으로 작업하기</button><button type="button" disabled={applying} onClick={async()=>{setApplying(true);try{if(await saveProjectFile(project))await applyIncoming()}catch(e){notify((e as Error).message)}finally{setApplying(false)}}}>현재 작업 JSON 저장 후 적용</button><button type="button" disabled={applying} onClick={()=>setReviewOpen(false)}>나중에 적용</button></div></>}</dialog>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
      <dialog ref={fileReviewDialog} className="jieum-incoming" aria-labelledby="jieum-file-title" onCancel={e=>{if(applying)e.preventDefault();else setPendingFile(null)}}>{pendingFile&&<><small>파일에서 이어 쓰기</small><h2 id="jieum-file-title">작성 중인 작품 내용을 저장할까요?</h2><p>{pendingFile.name}</p><p>다른 작품을 불러오기 전에 현재 내용을 JSON 파일로 저장할 수 있습니다.</p><div><button type="button" disabled={applying} onClick={()=>{const file=pendingFile;setPendingFile(null);void importProjectFile(file)}}>저장하지 않고 불러오기</button><button type="button" disabled={applying} onClick={async()=>{setApplying(true);try{if(await saveProjectFile(project)){const file=pendingFile;setPendingFile(null);setApplying(false);await importProjectFile(file)}}catch(e){notify((e as Error).message)}finally{setApplying(false)}}}>저장 후 불러오기</button><button type="button" disabled={applying} onClick={()=>setPendingFile(null)}>취소</button></div></>}</dialog>
      <dialog ref={importDialog} className="import-progress-card jieum-import-dialog" aria-label="작업 가져오기" aria-live="polite" onCancel={event=>event.preventDefault()}>{importProgress&&<><div className="import-progress-mark"><FileUp size={25} /></div><span>IPHONE SAFE IMPORT</span><h2>{importProgress.phase === "opening" ? "패키지를 순차로 읽는 중" : importProgress.phase === "settings" ? "설정을 먼저 복원하는 중" : importProgress.phase === "images" ? "이미지를 한 장씩 저장하는 중" : "무결성을 확인하는 중"}</h2><p>{importProgress.detail}</p><div className="import-progress-track"><i style={{ width: `${Math.max(3, Math.min(100, importProgress.phase === "images" || importProgress.phase === "verifying" ? importProgress.totalImages ? importProgress.currentImage / importProgress.totalImages * 100 : 96 : importProgress.totalBytes ? importProgress.loadedBytes / importProgress.totalBytes * 100 : 3))}%` }} /></div><footer><b>{importProgress.totalImages ? `${importProgress.currentImage} / ${importProgress.totalImages} 이미지` : `${Math.round(importProgress.loadedBytes / 1024 / 1024)} / ${Math.round(importProgress.totalBytes / 1024 / 1024)} MB`}</b><small>완료 전까지 기존 프로젝트는 변경되지 않습니다.</small></footer></>}</dialog>
    </main></div></JieumShell>
  );
}
