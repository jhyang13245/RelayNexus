"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_VERSION_LABEL } from "../../lib/app-version";
import { STUDIO_CORTEX_TARGET } from "../../lib/studio-cortex-target";
import { restoreRememberedApiKey } from "../../lib/api-key-vault";
import { putJieumHandoff } from "../../lib/jieum-store";
import { NexusSiteNav } from "./nexus-site-nav";
import { BookRevisionMenu } from "./book-revision-menu";
import { installedHubProject } from "../../lib/hub-package";
import { groupHubRevisionProjects, hubRevisionIdentity, isSameHubWork, latestInstalledHubRevision, newestInstalledRevisionProject, uniqueHubRevisionWork } from "../../lib/hub-revision";

type LibraryProject = {
  id: string;
  sourceProjectId?: string;
  title: string;
  genre: string;
  playerName: string;
  packageVersion: string;
  sessionCount: number;
  thumbnailUrl?: string;
  updatedAt: string;
};

type LibrarySession = {
  id: string;
  projectId: string;
  name: string;
  turn: number;
  day: number;
  location: string;
  preview: string;
  lastPlayedAt: string;
};

export type HubWorkSummary = {
  currentRevision?: number;
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  genre: string;
  tags: string[];
  packageVersion: string;
  runtime: string;
  packageBytes: number;
  downloadCount: number;
  coverUrl: string;
  downloadUrl: string;
  sourceProjectId?: string;
  packageSha256?: string;
  minNexusVersion?: string;
};

type Props = {
  cortexMode?: boolean;
  modeControls?: import("react").ReactNode;
  projects: LibraryProject[];
  sessions: LibrarySession[];
  accountName: string;
  activeProjectId: string;
  busy: boolean;
  onOpenSession: (sessionId: string) => Promise<void>;
  onCreateSession: (projectId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onImportZip: () => void;
  onInstallHubWork: (work: HubWorkSummary) => Promise<void>;
  onResolveHubRevision?: (projectId: string, work: HubWorkSummary) => Promise<number | null>;
  onRestoreHubCover: (work: HubWorkSummary, project: LibraryProject) => Promise<void>;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  signOutHref?: string;
};

const relativeDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "최근";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(timestamp);
};

const coverFor = (project: LibraryProject) =>
  project.thumbnailUrl ||
  (project.id === "demo-project"
    ? "/api/hub/works/giseong-academy-first-resonance/cover?v=bundled-2026-09-09-webp"
    : "");

export function NexusLibraryHome({
  cortexMode = false,
  modeControls,
  projects,
  sessions,
  accountName,
  activeProjectId,
  busy,
  onOpenSession,
  onCreateSession,
  onDeleteSession,
  onDeleteProject,
  onImportZip,
  onInstallHubWork,
  onResolveHubRevision,
  onRestoreHubCover,
  onOpenSettings,
  onOpenAccount,
  signOutHref,
}: Props) {
  const [studioPrompt, setStudioPrompt] = useState("");
  const [studioDraftStatus, setStudioDraftStatus] = useState<"idle" | "generating" | "sent" | "error">("idle");
  const [studioDraftMessage, setStudioDraftMessage] = useState("");
  const [studioDraftProgress, setStudioDraftProgress] = useState(0);
  const [hubWorks, setHubWorks] = useState<HubWorkSummary[]>([]);
  const [hubLoading, setHubLoading] = useState(true);
  const [hubRefreshing, setHubRefreshing] = useState(false);
  const [hubError, setHubError] = useState("");
  const [hubUpdatedAt, setHubUpdatedAt] = useState("");
  const [installError, setInstallError] = useState("");
  const [installingSlug, setInstallingSlug] = useState("");
  const [resolvedRevisions, setResolvedRevisions] = useState<Record<string, number | null>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [shelfSelections, setShelfSelections] = useState<Record<string, string>>({});
  const hubRequestRef = useRef<AbortController | null>(null);
  const hubHasDataRef = useRef(false);
  const coverRepairRef = useRef(new Set<string>());
  const requestedNeoreumInstallRef = useRef(false);

  const openStudioDraft = async (runtime: "intelligent_canon" | "instant_story") => {
    const idea = studioPrompt.trim();
    if (studioDraftStatus === "generating") return;
    if(idea.length<10){setStudioDraftStatus("error");setStudioDraftMessage("만들고 싶은 이야기를 10자 이상으로 적어 주세요.");return;}
    setStudioDraftStatus("generating");
    setStudioDraftProgress(6);
    setStudioDraftMessage("짧은 아이디어까지 해석해 주인공과 작품의 핵심 방향을 잡는 중입니다…");
    let progressEstimate = 6;
    const progressTimer = window.setInterval(() => {
      progressEstimate = Math.min(92, progressEstimate + (progressEstimate < 35 ? 7 : progressEstimate < 70 ? 4 : 2));
      setStudioDraftProgress(progressEstimate);
      if (progressEstimate >= 72) setStudioDraftMessage("작품 초안을 생성하고 있습니다. 완료되면 사건 연결과 필수 설정을 검사합니다…");
      else if (progressEstimate >= 36) setStudioDraftMessage("요청한 인물과 세계관을 바탕으로 초안을 작성하고 있습니다…");
    }, 650);
    try {
      const apiKey = await restoreRememberedApiKey('openai');
      const response = await fetch("/api/studio/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, prompt: idea, runtime }),
      });
      const blueprint = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(blueprint.error || "지음 초안을 만들지 못했습니다.");
      setStudioDraftProgress(96);
      setStudioDraftMessage("완성된 JSON을 안전하게 포장하고 있습니다…");
      const transferId = await putJieumHandoff(blueprint, window.location.origin);
      window.clearInterval(progressTimer);
      setStudioDraftProgress(100);
      setStudioDraftStatus("sent");
      setStudioDraftMessage("초안 생성 완료 · 지음으로 이동합니다.");
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      window.location.assign("/jieum?transfer=" + transferId);
    } catch (error) {
      window.clearInterval(progressTimer);
      setStudioDraftProgress(0);
      setStudioDraftStatus("error");
      setStudioDraftMessage(error instanceof Error ? error.message : "지음 초안을 만들지 못했습니다.");
    }
  };

  const refreshHub = useCallback(async (mode: "initial" | "manual" = "manual") => {
    hubRequestRef.current?.abort();
    const controller = new AbortController();
    hubRequestRef.current = controller;
    if (mode === "initial") setHubLoading(true);
    if (mode === "manual") setHubRefreshing(true);
    try {
      const response = await fetch(`/api/hub/works?fresh=${Date.now().toString(36)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      const payload = (await response.json()) as { works?: HubWorkSummary[]; error?: string };
      if (!response.ok || !payload.works) throw new Error(payload.error || "공개 작품 목록을 열지 못했습니다.");
      hubHasDataRef.current = true;
      setHubWorks(payload.works);
      if (mode === "manual") setResolvedRevisions({});
      setHubError("");
      setHubUpdatedAt(new Date().toISOString());
    } catch (reason: unknown) {
      if (controller.signal.aborted) return;
      if (!hubHasDataRef.current) {
        setHubError(reason instanceof Error ? reason.message : "공개 작품 목록을 열지 못했습니다.");
      }
    } finally {
      if (hubRequestRef.current === controller) hubRequestRef.current = null;
      if (mode === "initial") setHubLoading(false);
      if (mode === "manual") setHubRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshHub("initial");
    return () => {
      hubRequestRef.current?.abort();
    };
  }, [refreshHub]);

  useEffect(() => {
    if (!onResolveHubRevision) return;
    let cancelled = false;
    void (async () => {
      const results: Record<string, number | null> = {};
      for (const project of projects) {
        if (cancelled) return;
        if (hubRevisionIdentity(project.id) || project.id in resolvedRevisions) continue;
        const work = uniqueHubRevisionWork(project, hubWorks);
        if (!work) continue;
        const revision = await onResolveHubRevision(project.id, work).catch(() => null);
        results[project.id] = revision;
      }
      if (!cancelled && Object.keys(results).length) setResolvedRevisions(old => ({ ...old, ...results }));
    })();
    return () => { cancelled = true; };
  }, [hubWorks, projects, onResolveHubRevision, resolvedRevisions]);

  const revisionFor = (project: LibraryProject) => hubRevisionIdentity(project.id)?.revision ?? resolvedRevisions[project.id];
  const currentInstallation = (work: HubWorkSummary) => work.currentRevision
    ? latestInstalledHubRevision(projects, work) ?? projects.find(project => isSameHubWork(project, work) && revisionFor(project) === work.currentRevision)
    : undefined;
  const shelfGroups = cortexMode ? groupHubRevisionProjects(projects, hubWorks)
    : projects.map(project => ({ key: `project:${project.id}`, projects: [project], work: undefined }));
  const defaultProjectForGroup = (group: (typeof shelfGroups)[number]) =>
    newestInstalledRevisionProject(group.projects, project => revisionFor(project));

  useEffect(() => {
    if (requestedNeoreumInstallRef.current || !hubWorks.length) return;
    const url = new URL(window.location.href);
    const requestedSlug = url.searchParams.get("neoreumInstall")?.trim().toLowerCase();
    if (!requestedSlug) return;
    const work = hubWorks.find((item) => item.slug === requestedSlug);
    if (!work) {
      requestedNeoreumInstallRef.current = true;
      setInstallError("선택한 너름 작품을 찾을 수 없습니다. 작품 목록을 새로고침해 주세요.");
      return;
    }
    requestedNeoreumInstallRef.current = true;
    url.searchParams.delete("neoreumInstall");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash || "#neoreum"}`);
    if (latestInstalledHubRevision(projects, work)) return;
    setInstallingSlug(work.slug);
    void onInstallHubWork(work)
      .catch((reason) => setInstallError(reason instanceof Error ? reason.message : "너름 작품을 가져오지 못했습니다."))
      .finally(() => setInstallingSlug(""));
  }, [hubWorks, onInstallHubWork, projects]);

  useEffect(() => {
    for (const work of hubWorks) {
      const installed = installedHubProject(projects, work);
      if (!installed || installed.thumbnailUrl || coverRepairRef.current.has(installed.id)) continue;
      coverRepairRef.current.add(installed.id);
      void onRestoreHubCover(work, installed).catch((reason) => {
        coverRepairRef.current.delete(installed.id);
        setInstallError(reason instanceof Error ? reason.message : "너름 표지를 복구하지 못했습니다.");
      });
    }
  }, [hubWorks, projects, onRestoreHubCover]);

  const recentSession = useMemo(
    () => [...sessions].sort((a, b) => Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt))[0],
    [sessions],
  );
  const recentProject = projects.find((project) => project.id === recentSession?.projectId)
    ?? projects.find((project) => project.id === activeProjectId)
    ?? projects[0];
  const [selectedProjectId, setSelectedProjectId] = useState(
    recentProject?.id ?? activeProjectId,
  );
  const requestedProject = projects.find((project) => project.id === selectedProjectId)
    ?? recentProject;
  const selectedProjectGroup = shelfGroups.find(group => group.projects.some(project => project.id === requestedProject?.id));
  const explicitlySelectedProject = selectedProjectGroup && shelfSelections[selectedProjectGroup.key]
    ? selectedProjectGroup.projects.find(project => project.id === shelfSelections[selectedProjectGroup.key])
    : undefined;
  const selectedProject = explicitlySelectedProject
    ?? (selectedProjectGroup ? defaultProjectForGroup(selectedProjectGroup) : undefined)
    ?? requestedProject;
  const selectedProjectSessions = useMemo(
    () => sessions
      .filter((session) => session.projectId === selectedProject?.id)
      .sort((a, b) => Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt)),
    [selectedProject?.id, sessions],
  );
  const [selectedSessionId, setSelectedSessionId] = useState(
    selectedProjectSessions[0]?.id ?? "",
  );
  const selectedSession = selectedProjectSessions.find((session) => session.id === selectedSessionId)
    ?? selectedProjectSessions[0];
  const selectedCover = selectedProject ? coverFor(selectedProject) : "";
  const selectedTitle = selectedProject?.title || "당신의 다음 이야기";
  const selectedTitleLength = Array.from(selectedTitle).length;
  const selectedTitleClass = selectedTitleLength > 28
    ? "extra-long-title"
    : selectedTitleLength > 18 ? "long-title" : "";

  useEffect(() => {
    if (!selectedProject || selectedProject.id === selectedProjectId) return;
    const projectSessions = sessions
      .filter(session => session.projectId === selectedProject.id)
      .sort((a, b) => Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt));
    setSelectedProjectId(selectedProject.id);
    setSelectedSessionId(projectSessions[0]?.id ?? "");
  }, [selectedProject, selectedProjectId, sessions]);

  const selectProject = (projectId: string, scroll = true) => {
    const group = shelfGroups.find(group => group.projects.some(project => project.id === projectId));
    if (group) setShelfSelections(old => ({ ...old, [group.key]: projectId }));
    const projectSessions = sessions
      .filter((session) => session.projectId === projectId)
      .sort((a, b) => Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt));
    setSelectedProjectId(projectId);
    setSelectedSessionId(projectSessions[0]?.id ?? "");
    if (scroll) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("#continue")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };
  const visibleGroups = shelfGroups.filter((group) => {
    const query = searchQuery.trim().toLocaleLowerCase("ko-KR");
    if (!query) return true;
    return group.projects.some(project => `${project.title} ${project.genre} ${project.playerName}`
      .toLocaleLowerCase("ko-KR")
      .includes(query));
  });

  const install = async (work: HubWorkSummary) => {
    if (installingSlug || busy) return;
    setInstallError("");
    setInstallingSlug(work.slug);
    try {
      await onInstallHubWork(work);
    } catch (reason) {
      setInstallError(reason instanceof Error ? reason.message : "작품을 가져오지 못했습니다.");
    } finally {
      setInstallingSlug("");
    }
  };

  return (
    <div className="library-home">
      <NexusSiteNav accountName={accountName} cortexMode={cortexMode} onAccount={onOpenAccount} onSettings={onOpenSettings} signOutHref={signOutHref}/>

      <div className="library-main">
        <section className="continue-stage" id="continue">
          <div className="continue-atmosphere" style={selectedCover ? { backgroundImage: `url(${selectedCover})` } : undefined} />
          <div className="continue-index"><span>YOUR<br />SESSIONS</span><b>{String(selectedProjectSessions.length).padStart(2, "0")}</b></div>
          <div className="continue-cover-frame">
            {selectedCover ? <img src={selectedCover} alt="" decoding="async" fetchPriority="high" /> : <span>{selectedProject?.title.slice(0, 1) || "단"}</span>}
            <i>SELECTED WORK</i>
          </div>
          <div className="continue-copy">
            <p className="library-kicker"><i /> 작품과 세션 선택</p>
            <span className="continue-genre">{selectedProject?.genre || "INTERACTIVE STORY"}{selectedProject && revisionFor(selectedProject) ? ` · 덧칠 v${revisionFor(selectedProject)} 전용 세션` : ""}</span>
            <h1 className={selectedTitleClass}>{selectedTitle}</h1>
            <div className="continue-session-picker">
              <header><span>CHAT SESSIONS</span><small>{selectedProjectSessions.length}개의 이야기</small></header>
              <div>
                {selectedProjectSessions.map((session) => (
                  <div
                    className={`continue-session-card${session.id === selectedSession?.id ? " active" : ""}`}
                    key={session.id}
                  >
                    <button
                      type="button"
                      className="continue-session-choice"
                      disabled={busy}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <strong>{session.name}</strong>
                      <span>D+{session.day} · {session.turn}턴</span>
                      <small>{relativeDate(session.lastPlayedAt)}</small>
                    </button>
                    {session.id !== "demo-session" && (
                      <button
                        type="button"
                        className="continue-session-delete"
                        disabled={busy || selectedProjectSessions.length <= 1}
                        aria-label={`${session.name} 세션 삭제`}
                        title={selectedProjectSessions.length <= 1 ? "마지막 세션은 삭제할 수 없습니다" : "세션 삭제"}
                        onClick={() => void onDeleteSession(session.id)}
                      >×</button>
                    )}
                  </div>
                ))}
                {selectedProject && (
                  <button
                    type="button"
                    className="new-library-session"
                    disabled={busy}
                    onClick={() => void onCreateSession(selectedProject.id)}
                  ><strong>＋ 새 이야기</strong><span>독립된 진행 시작</span><small>NEW</small></button>
                )}
              </div>
            </div>
            <h2>{selectedSession?.name || "첫 세션을 시작하세요"}</h2>
            <p className="continue-preview">{selectedSession?.preview || "ScenarioPack을 불러오면 새로운 이야기가 이 서재에 꽂힙니다."}</p>
            <div className="continue-meta">
              <span><small>현재 위치</small>{selectedSession?.location || "시작점"}</span>
              <span><small>진행</small>D+{selectedSession?.day ?? 0} · {selectedSession?.turn ?? 0}턴</span>
              <span><small>마지막 플레이</small>{relativeDate(selectedSession?.lastPlayedAt || "")}</span>
            </div>
            <div className="continue-progress"><i style={{ width: `${Math.min(88, 18 + (selectedSession?.turn ?? 0) * 6)}%` }} /></div>
            <div className="continue-actions">
            {modeControls}
            <button
              type="button"
              className="continue-button"
              disabled={!selectedSession || busy}
              onClick={() => selectedSession && void onOpenSession(selectedSession.id)}
            >
              <span>선택한 세션 입장</span><b>→</b>
            </button>
            {onDeleteProject && selectedProject && (
              <button
                type="button"
                className="continue-delete-project"
                disabled={busy}
                onClick={() => void onDeleteProject(selectedProject.id)}
              >{(selectedProjectGroup?.projects.length ?? 0) > 1 ? "선택한 덧칠 및 세션 삭제" : "작품 및 전체 세션 삭제"}</button>
            )}
            </div>
          </div>
          <div className="continue-version">DANCHEONG / {APP_VERSION_LABEL}</div>
        </section>

        <section className="multiplayer-gateway" id="play-together" hidden={cortexMode}>
          <div className="multiplayer-dancheong-band" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <div className="multiplayer-gateway-copy">
            <p>PLAY TOGETHER · RELAY MULTIPLAYER</p>
            <span>2—4 PLAYERS / ONE CANON</span>
            <h2>여럿이서 같이 즐겨요</h2>
            <p className="multiplayer-gateway-description">
              한 명의 주인공과 하나의 정사를 공유하고, 돌아오는 차례마다 다음 장면을 이어 쓰세요.
              친구를 초대해 비공개방을 열거나 지금 기다리는 공개방에 바로 합류할 수 있습니다.
            </p>
            <div className="multiplayer-gateway-actions">
              <a className="primary" href="/multiplayer#public-rooms"><span>공개방 둘러보기</span><b>→</b></a>
              <a href="/multiplayer#create-room"><span>새 릴레이 방 만들기</span><b>＋</b></a>
            </div>
          </div>
          <div className="multiplayer-relay-visual" aria-label="한 주인공의 이야기를 네 사람이 차례로 이어가는 방식">
            <header><small>LIVE RELAY</small><strong>하나의 이야기, 이어지는 차례</strong><i>●</i></header>
            <ol>
              <li className="active"><span>01</span><div><small>NOW WRITING</small><strong>첫 번째 플레이어</strong></div><b>나의 차례</b></li>
              <li><span>02</span><div><small>NEXT TURN</small><strong>두 번째 플레이어</strong></div><b>대기</b></li>
              <li><span>03</span><div><small>IN THE ROOM</small><strong>세 번째 플레이어</strong></div><b>준비</b></li>
              <li><span>04</span><div><small>OPEN SEAT</small><strong>친구를 초대하세요</strong></div><b>＋</b></li>
            </ol>
            <footer><span>한 명의 주인공</span><i>→</i><span>차례를 이어</span><i>→</i><span>하나의 정사로</span></footer>
          </div>
        </section>

        <section className="bookshelf" id="bookshelf">
          <header className="library-section-head">
            <div><p>YOUR COLLECTION</p><h2>내 서재</h2><span>{shelfGroups.length}개의 이야기가 기다리고 있습니다.</span></div>
            <div className="shelf-tools">
              <label><span>⌕</span><input id="library-search-input" type="search" placeholder="작품 검색" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
              <button type="button" onClick={onImportZip}>＋ 작품 추가</button>
            </div>
          </header>
          <div className="book-row">
            {visibleGroups.map((group, index) => {
              const project = group.projects.find(row => row.id === shelfSelections[group.key])
                ?? defaultProjectForGroup(group) ?? group.projects[0];
              const projectSessions = sessions.filter((session) => session.projectId === project.id);
              const latest = [...projectSessions].sort((a, b) => Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt))[0];
              const cover = coverFor(project);
              const work = group.work;
              const revision = revisionFor(project);
              const latestInstalled = Math.max(0, ...group.projects.map(row => revisionFor(row) ?? 0));
              const newer = Boolean(work?.currentRevision && latestInstalled && work.currentRevision > latestInstalled);
              const unknown = Boolean(work?.currentRevision && !latestInstalled && project.id in resolvedRevisions && revision == null);
              const current = work && currentInstallation(work);
              return (
                <article className={`library-book${project.id === selectedProject?.id ? " active" : ""}`} key={group.key} data-book-work={group.key}>
                  <button type="button" className="book-cover-button" aria-label={`${project.title} 선택`} disabled={busy} onClick={() => selectProject(project.id)}>
                    <span className="book-cover">
                      {(newer || unknown) && <span className="book-revision-seal"><small>{newer ? "새 덧칠" : "덧칠 확인"}</small><b>v{work?.currentRevision}</b></span>}
                      <span className="dancheong-book-front">
                        <span className="dancheong-book-spine" aria-hidden="true" />
                        {cover ? <img src={cover} alt="" /> : <i>{project.title.slice(0, 1)}</i>}
                      </span>
                    </span>
                  </button>
                    <div className="book-info">
                      <small>{project.genre}{revision ? ` · 덧칠 v${revision}` : work ? " · 기존 설치본" : ""}</small>
                      <div className="book-title-row">
                        <button type="button" className="book-title-button" disabled={busy} onClick={() => selectProject(project.id)}><strong>{project.title}</strong></button>
                        {(work || hubRevisionIdentity(project.id) || group.projects.length > 1) && <BookRevisionMenu title={project.title} selectedId={project.id}
                          options={[...group.projects].sort((a,b) => (revisionFor(b) ?? 0) - (revisionFor(a) ?? 0)).map(row => ({ id: row.id, revision: revisionFor(row), legacy: !hubRevisionIdentity(row.id), sessions: sessions.filter(session => session.projectId === row.id).length }))}
                          latestRevision={work?.currentRevision} installedLatest={Boolean(current)} busy={busy || Boolean(installingSlug)}
                          onSelect={id => selectProject(id, false)} onInstall={work ? () => { void install(work); } : undefined}/>}</div>
                      <span>{latest ? `${latest.name} · ${latest.turn}턴` : "새 이야기"}</span>
                      <span className="dancheong-book-progress">{String(index + 1).padStart(2, "0")} · {latest ? `${latest.turn}턴` : "시작 전"}{project.id === selectedProject?.id ? " · 선택됨" : ""}</span>
                    </div>
                </article>
              );
            })}
            {visibleGroups.length === 0 && (
              <p className="book-search-empty">‘{searchQuery}’와 일치하는 작품이 없습니다.</p>
            )}
            <button className="empty-book" type="button" onClick={onImportZip} disabled={busy}>
              <span>＋</span><strong>새 작품 꽂기</strong><small>ScenarioPack ZIP</small>
            </button>
          </div>
          <div className="shelf-plank"><span /><i /></div>
          {installError && <p className="hub-install-error" role="alert">{installError}</p>}
        </section>

        <span id="studio" aria-hidden="true"/><section className="studio-gateway" id="jieum">
          <div className="studio-gateway-copy">
            <p>DANCHEONG JIEUM · STORY AUTHORING</p>
            <span>STORY CREATION WORKSPACE</span>
            <h2>상상한 세계를 플레이할 수 있는 이야기로.</h2>
            <p className="studio-gateway-description">
              세계관과 인물, 사건, 비공개 설정을 설계하고 현재 단청의 Cortex 엔진에 맞는
              전용 CortexPack으로 완성하세요.
            </p>
            <a className="jieum-open-editor" href="/jieum">지음 편집기 열기 →</a>
            <div className="studio-gateway-tags">
              <span>WORLD BUILDING</span><span>CHARACTERS</span><span>CORTEX {STUDIO_CORTEX_TARGET.minimumTargetVersion}</span><span>CORTEXPACK</span>
            </div>
            <div className="studio-prompt-launcher">
              <label htmlFor="studio-story-prompt">만들고 싶은 스토리를 설명해 주세요</label>
              <textarea
                id="studio-story-prompt"
                value={studioPrompt}
                maxLength={6000}
                rows={5}
                placeholder="예: 1930년대 경성을 배경으로, 기억을 잃은 기자와 시간을 되감는 무녀가 미제 사건을 추적하는 미스터리 로맨스"
                onChange={(event) => setStudioPrompt(event.target.value)}
              />
              <div className="studio-runtime-actions">
                <button type="button" disabled={studioPrompt.trim().length < 10 || studioDraftStatus === "generating"} onClick={() => void openStudioDraft("intelligent_canon")}>
                  <small>Cortex 정사 중심 · 장기 시나리오</small>
                  <strong>사건과 엔딩이 있는 이야기</strong>
                  <b>→</b>
                </button>
                <button type="button" disabled={!studioPrompt.trim() || studioDraftStatus === "generating"} onClick={() => void openStudioDraft("instant_story")}>
                  <small>Cortex 자유 전개 · Instant Story</small>
                  <strong>설정으로 시작하는 자유로운 이야기</strong>
                  <b>→</b>
                </button>
              </div>
              <p>구상을 입력하면 새 지음 형식으로 초안을 작성합니다. 정사 모드는 사건과 엔딩까지, Instant 모드는 설정과 도입부를 만듭니다. 생성 후 지음에서 수정할 수 있습니다.</p>
              {studioDraftStatus === "generating" || studioDraftStatus === "sent" ? (
                <div className={`studio-draft-progress ${studioDraftStatus}`} role="progressbar" aria-label="지음 초안 생성 예상 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={studioDraftProgress}>
                  <div className="studio-draft-progress-head"><strong>지음 초안 · 예상 진행</strong><span>{studioDraftProgress}%</span></div>
                  <div className="studio-draft-progress-track"><i style={{ width: `${studioDraftProgress}%` }} /></div>
                </div>
              ) : null}
              {studioDraftMessage && <p className={`studio-draft-status ${studioDraftStatus}`} role="status" aria-live="polite">{studioDraftMessage}</p>}
            </div>
          </div>
          <div className="studio-workflow" aria-label="단청 지음 제작 흐름">
            <article><span>01</span><small>DESIGN</small><strong>세계와 인물을 설계</strong><p>설정·관계·비공개 진실을 하나의 작품 원장으로 구성합니다.</p></article>
            <article><span>02</span><small>BUILD</small><strong>Cortex 전용 설계</strong><p>정사 중심의 사건·종결조건 또는 자유 전개의 시작 설정을 구성합니다.</p></article>
            <article><span>03</span><small>PUBLISH</small><strong>단청으로 출간</strong><p>검증된 패키지를 너름에 덧칠해 독자에게 전달합니다.</p></article>
          </div>
        </section>

        <section className="story-hub" id="neoreum">
          <header className="library-section-head hub-heading">
            <div><p>DANCHEONG NEOREUM</p><h2>너름 공개작</h2><span>검증된 새 세계를 발견하고, 한 번에 내 서재로 가져오세요.</span></div>
            <div className="hub-heading-actions">
              <button type="button" disabled={hubRefreshing} onClick={() => void refreshHub("manual")}>{hubRefreshing ? "검색 중…" : "목록 새로고침 ↻"}</button>
              <small>{hubUpdatedAt ? `최근 새로고침 ${new Date(hubUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "새로고침 시 새 작품 검색"}</small>
              <a href="/neoreum">내 출간작 관리 ↗</a>
            </div>
          </header>
          {hubLoading ? (
            <div className="hub-loading">공개 작품 목록을 동기화하고 있습니다…</div>
          ) : hubError ? (
            <div className="hub-loading error">{hubError}</div>
          ) : (
            <>
            {installError && <p className="hub-install-error">{installError}</p>}
            <div className={`hub-work-grid ${hubWorks.length > 1 ? "has-multiple" : "has-single"}`}>
              {hubWorks.map((work, index) => (
                <article className="hub-work" key={work.slug}>
                  <div className="hub-work-cover">
                    <img
                      src={work.coverUrl}
                      alt={`${work.title}: ${work.subtitle} 표지`}
                      decoding="async"
                      loading={index < 2 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    <span>{index === 0 ? "FEATURED" : "NEW"}</span>
                    <i>CORE<br />VERIFIED</i>
                  </div>
                  <div className="hub-work-copy">
                    <h3>{work.title}<small>{work.subtitle}</small></h3>
                    <p className="hub-work-genre">{work.genre}</p>
                    <span>{work.description}</span>
                    <div>{work.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
                    <footer>
                      <small>v{work.packageVersion} · {(work.packageBytes / 1024).toFixed(0)} KB</small>
                      <button
                        type="button"
                        disabled={busy || Boolean(installingSlug)}
                        onClick={() => {
                          const installed = cortexMode ? currentInstallation(work) : installedHubProject(projects, work);
                          if (installed) selectProject(installed.id);
                          else void install(work);
                        }}
                      >
                        {installingSlug === work.slug
                          ? "가져오는 중…"
                          : Boolean(cortexMode ? currentInstallation(work) : installedHubProject(projects, work))
                            ? "설치됨 · 열기"
                            : "내 서재에 추가"} <b>↓</b>
                      </button>
                    </footer>
                  </div>
                </article>
              ))}
              <article className="hub-coming-soon"><span>{String(Math.min(6, hubWorks.length + 1)).padStart(2, "0")}—06</span><strong>새 작품<br />준비 중</strong><p>지음에서 출판된 작품이 이곳에 도착합니다.</p></article>
            </div>
            </>
          )}
        </section>

        <section className="library-brief">
          <div><p>WHAT&apos;S NEW</p><h2>{APP_VERSION_LABEL}</h2></div>
          <article><span>01</span><div><strong>Cortex 1.42.0 · 공개 본문 우선</strong><p>작가가 집필한 공개 본문을 보존하고, 사건 판정관은 누적 원문으로 종결조건만 확인합니다. 시간·장소와 화자는 작가의 주석을 따르며, 별도의 Commit Graph·Turn Delta 생성을 기본 집필 과정에 요구하지 않습니다.</p></div></article>
          <article><span>02</span><div><strong>실시간 대사 카드와 모바일 도구</strong><p>집필 중 화자 정보를 바로 카드로 표시하며, 인쇄 문구는 대사에서 제외합니다. 모바일에서도 설정·초기화·백업 도구를 안정적으로 펼칩니다.</p></div></article>
          <article><span>03</span><div><strong>GPT-Image 2.5 Flare 이미지 경로</strong><p>1088×608 장면에 패키지 대표 사진을 최대 2장까지 참고하고, 실제 usage를 분야별 API 비용에 반영합니다.</p></div></article>
        </section>
      </div>

      <footer className="library-footer">
        <span>단청 · A RELAY EXPERIENCE</span>
        <p>Every story deserves a place to return to.</p>
        <div><a href="/jieum">지음</a><a href="/neoreum">너름</a><a href="https://relay-id.juno12345.chatgpt.site">RELAY ID</a><b>{APP_VERSION_LABEL}</b></div>
      </footer>
    </div>
  );
}
