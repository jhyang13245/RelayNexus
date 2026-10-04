"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { prepareNewSharedStory } from './prepare-story';
import { findStorySource, loadStorySource, type StorySource } from './story-source';
import { deviceTextProvider } from '../../lib/text-provider';
import {useMultiplayerPressFeedback} from './use-press-feedback';
import { readCortexProjectPackage, useCortexCatalog } from '../hooks/use-runtime-engine';

import { restoreRememberedApiKey } from "../../lib/api-key-vault";

type Session = { id: string; projectId: string; name: string; turn: number; engine?: "cortex" | "lotus" };
type Project = { id: string; title: string; hasPackage?: boolean };
type Member = {
  id: string; displayName: string; seat: number; role: "HOST" | "PLAYER";
  status: string; apiKeyReady: boolean; isSelf: boolean;
};
type Room = {
  code: string; name: string; status: string; visibility: "PUBLIC" | "PRIVATE"; maxPlayers: number; turnLimitSeconds: number;
  currentMemberId: string | null; turnDeadlineAt: string | null; keyRecoveryDeadlineAt: string | null;
  pausedReason: string; revision: number; isHost: boolean; members: Member[];
  settings: { presentation?: "novel" | "visual"; engine?: "cortex" | "lotus"; textModel: string; imageModel: string; baseUrl: string; outputContract: string };
};
type PublicRoom = {
  presentation?: 'novel' | 'visual';
  code: string; name: string; status: string; visibility: "PUBLIC"; maxPlayers: number;
  memberCount: number; turnLimitSeconds: number; hostDisplayName: string; projectTitle: string;
  createdAt: string; updatedAt: string;
};
type CostRow = { id: string; storyTurn: number; payerDisplayName: string; cause: string; model: string; baseUrl: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number; recordedAt: string };

const postJson = async (url: string, body: Record<string, unknown>, method = "POST") => {
  const response = await fetch(url, { method, signal:AbortSignal.timeout(90000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(result.error || "요청을 처리하지 못했습니다."));
  return result;
};

const secondsLeft = (deadline: string | null, now: number) => deadline
  ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
  : 0;

const memberRoleLabel = (role: Member["role"]) => role === "HOST" ? "방장" : "참가자";
const memberStatusLabel = (status: string) => status === "READY" ? "준비 완료" : status === "KEY_BLOCKED" ? "키 확인 필요" : "준비 전";

export default function MultiplayerPage() {
  useMultiplayerPressFeedback();
  const deviceCortexRows=useCortexCatalog();
  const [recentExpanded,setRecentExpanded]=useState(true);
  useEffect(()=>{const mobile=window.matchMedia('(max-width:600px)'),sync=()=>setRecentExpanded(!mobile.matches);sync();mobile.addEventListener('change',sync);return()=>mobile.removeEventListener('change',sync)},[]);
  const [lobbyTab,setLobbyTab]=useState<'join'|'create'>('join');
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [projectId,setProjectId]=useState('');
  const [presentation,setPresentation]=useState<'novel'|'visual'>('novel');
  const [startMode,setStartMode]=useState<'existing'|'new'>('existing');
  const [newStorySource,setNewStorySource]=useState<StorySource|null>(null);
  const [sourceProjectId,setSourceProjectId]=useState('');
  const [sourceRetry,setSourceRetry]=useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("새 릴레이 방");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnLimitSeconds, setTurnLimitSeconds] = useState(120);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readyPending, setReadyPending] = useState<boolean | null>(null);
  const [message, setMessage] = useState("Relay ID와 기기 API 키를 확인하는 중입니다.");
  const [clock, setClock] = useState(0);
  const roomMutationPending = useRef(false);
  const roomRead=useRef<{code:string;promise:Promise<Room>}|null>(null),lobbyRead=useRef<Promise<unknown>|null>(null),roomEpoch=useRef(0);

  const refreshRoom = useCallback(async (code: string) => {
    if(roomRead.current?.code===code)return roomRead.current.promise;
    const epoch=roomEpoch.current;
    const promise=(async()=>{
    const response = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}?story=0`, { cache: "no-store",signal:AbortSignal.timeout(20000) });
    const result = await response.json() as { room?: Room; error?: string };
    if (!response.ok || !result.room) throw new Error(result.error || "방을 불러오지 못했습니다.");
    if (!roomMutationPending.current && epoch===roomEpoch.current && roomRead.current?.code===code) setRoom(result.room);
    return result.room;
    })();roomRead.current={code,promise};try{return await promise}finally{if(roomRead.current?.promise===promise)roomRead.current=null}
  }, []);

  const refreshLobby = useCallback(async () => {
    if(lobbyRead.current)return lobbyRead.current;
    const promise=(async()=>{
    const response = await fetch("/api/multiplayer/rooms", { cache: "no-store",signal:AbortSignal.timeout(20000) });
    const result = await response.json() as { rooms?: Room[]; publicRooms?: PublicRoom[]; error?: string };
    if (!response.ok) throw new Error(result.error || "방 목록을 불러오지 못했습니다.");
    setRooms(result.rooms ?? []);
    setPublicRooms(result.publicRooms ?? []);
    return result;
    })();lobbyRead.current=promise;try{return await promise}finally{lobbyRead.current=null}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestedRoom = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase();
    void (async () => {
      try {
        const [libraryResponse, roomResponse, cortexResponse] = await Promise.all([
          fetch("/api/library?summary=1", { cache: "no-store",signal:AbortSignal.timeout(30000) }),
          fetch("/api/multiplayer/rooms", { cache: "no-store",signal:AbortSignal.timeout(20000) }),
          fetch("/api/cortex/sessions", {cache:"no-store",signal:AbortSignal.timeout(30000)}),
        ]);
        const library = await libraryResponse.json() as { projects?: Project[]; sessions?: Session[]; error?: string };
        const roomList = await roomResponse.json() as { rooms?: Room[]; publicRooms?: PublicRoom[]; error?: string };
        if (!libraryResponse.ok) throw new Error(library.error || "서재를 불러오지 못했습니다.");
        if (!roomResponse.ok) throw new Error(roomList.error || "방 목록을 불러오지 못했습니다.");
        if (cancelled) return;
        setProjects(library.projects ?? []);
        const cortexLibrary = cortexResponse.ok ? await cortexResponse.json() as {sessions:Session[]} : {sessions:[]};
        const allSessions=[...cortexLibrary.sessions.map(s=>({...s,engine:"cortex" as const})),...(library.sessions||[]).map(s=>({...s,engine:"lotus" as const}))];
        setSessions(allSessions);
        setSessionId(allSessions[0]?.id ?? "");
        setProjectId(allSessions[0]?.projectId ?? library.projects?.[0]?.id ?? '');
        setRooms(roomList.rooms ?? []);
        setPublicRooms(roomList.publicRooms ?? []);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "멀티플레이를 준비하지 못했습니다.");
      }
    })();
    if (requestedRoom) void refreshRoom(requestedRoom).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "방을 불러오지 못했습니다.");
    });
    void (async () => {
      const key = await restoreRememberedApiKey();
      const connected = Boolean(key) && (await fetch("/api/openai/test", { method: "POST", signal:AbortSignal.timeout(35000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key, provider: deviceTextProvider() }) })).ok;
      if (cancelled) return;
      setApiKeyReady(connected);
      setMessage(connected
        ? "기기 API 키가 연결되었습니다. 준비 상태에 반영됩니다."
        : "API 키가 연결되지 않았습니다. 단청 설정에서 키를 연결해 주세요.");
    })().catch(() => {
      if (!cancelled) setMessage("API 키가 연결되지 않았습니다. 단청 설정에서 키를 연결해 주세요.");
    });
    return () => { cancelled = true; };
  }, [refreshRoom]);

  useEffect(() => {
    if (room) return;
    const poll = () => {
      if (document.visibilityState === "visible") void refreshLobby().catch(() => undefined);
    };
    const interval = window.setInterval(poll, 5_000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [refreshLobby, room]);

  useEffect(() => {
    if (!room?.code || busy || readyPending !== null) return;
    const poll = () => {
      if (document.visibilityState === "visible") void refreshRoom(room.code).catch(() => undefined);
    };
    const interval = window.setInterval(poll, 2_000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [busy, readyPending, refreshRoom, room?.code]);

  useEffect(() => {
    if (!room?.code || !apiKeyReady) return;
    void postJson(
      `/api/multiplayer/rooms/${encodeURIComponent(room.code)}`,
      { action: "presence", apiKeyReady: true },
      "PATCH",
    ).then((result) => setRoom(result.room as Room)).catch(() => undefined);
  }, [apiKeyReady, room?.code]);

  useEffect(() => {
    if (!room?.code) return;
    void fetch(`/api/multiplayer/rooms/${encodeURIComponent(room.code)}/costs`, { cache: "no-store",signal:AbortSignal.timeout(20000) })
      .then(async (response) => {
        const result = await response.json() as { costs?: CostRow[] };
        if (response.ok) setCosts(result.costs ?? []);
      })
      .catch(() => undefined);
  }, [room?.code, room?.revision]);

  useEffect(() => {
    if (!room?.turnDeadlineAt && !room?.keyRecoveryDeadlineAt) return;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [room?.keyRecoveryDeadlineAt, room?.turnDeadlineAt]);

  const sessionChoices=useMemo(()=>[...new Map([...sessions,...deviceCortexRows.map(row=>({id:row.id,projectId:row.projectId,name:row.name,turn:Number(row.turn||0),engine:'cortex' as const}))].map(row=>[row.id,row])).values()],[deviceCortexRows,sessions]);
  const selectedSession = sessionChoices.find((session) => session.id === sessionId);
  const workChoices=[...projects,...sessionChoices.filter(s=>!projects.some(p=>p.id===s.projectId)).map(s=>({id:s.projectId,title:s.name}))].filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i);
  const sourceChecking=Boolean(projectId)&&(sourceProjectId!==projectId||newStorySource===null);
  const newStoryReady=!sourceChecking&&newStorySource&&newStorySource.kind!=='missing';
  const me = room?.members.find((member) => member.isSelf);
  const current = room?.members.find((member) => member.id === room.currentMemberId);
  const presentMembers = useMemo(
    () => room?.members.filter((member) => !["KICKED", "LEFT"].includes(member.status)) ?? [],
    [room?.members],
  );
  const roomCanStart = presentMembers.length >= 2 && presentMembers.every(
    (member) => member.status === "READY" && member.apiKeyReady,
  );
  const countdown = useMemo(() => secondsLeft(
    room?.status === "PAUSED_KEY" ? room.keyRecoveryDeadlineAt : room?.turnDeadlineAt ?? null,
    clock,
  ), [clock, room?.keyRecoveryDeadlineAt, room?.status, room?.turnDeadlineAt]);

  useEffect(()=>{
    const controller=new AbortController();
    setSourceProjectId(projectId);setNewStorySource(null);
    if(!projectId)return()=>controller.abort();
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
    void findStorySource(projectId,projects.some(project=>project.id===projectId&&project.hasPackage===true),readCortexProjectPackage,signal)
      .then(source=>{if(!controller.signal.aborted)setNewStorySource(source)})
      .catch(error=>{if(!controller.signal.aborted)setNewStorySource({kind:'missing',message:error instanceof Error&&error.name!=='TimeoutError'?error.message:'원본 확인 시간이 초과되었습니다. 다시 확인해 주세요.'})});
    return()=>controller.abort();
  },[projectId,projects,sourceRetry]);

  const createRoom = async () => {
    if (!projectId || (startMode==='existing'&&!sessionId)) return setMessage("작품과 시작할 이야기를 선택해 주세요.");
    setBusy(true);
    try {
      setMessage(startMode==='new'?'작품의 시작 장면을 준비하고 있습니다.':'공유 이야기를 준비하고 있습니다.');
      let initialSnapshot:Record<string,unknown>|undefined;
      if(startMode==='new'){
        if(sourceChecking||!newStorySource||newStorySource.kind==='missing')throw new Error(sourceChecking?'새 이야기용 원본을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.':newStorySource?.kind==='missing'?newStorySource.message:'원본을 다시 확인해 주세요.');
        initialSnapshot=await prepareNewSharedStory(projectId,await loadStorySource(newStorySource,AbortSignal.timeout(120000)));
      }
      const sourceSessionId=startMode==='new'?(sessions.find(s=>s.projectId===projectId&&s.engine==='cortex')?.id||sessionId):sessionId;
      const result = await postJson("/api/multiplayer/rooms", { presentation,summaryOnly:true,sessionId:sourceSessionId, projectId, startMode, initialSnapshot, engine:startMode==='new'?'cortex':selectedSession?.engine, name, maxPlayers, turnLimitSeconds, visibility });
      const created = result.room as Room;
      setRoom(created);
      setRooms((items) => [created, ...items.filter((item) => item.code !== created.code)]);
      setMessage(`참가 코드 ${created.code}로 방을 만들었습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "방을 만들지 못했습니다."); }
    finally { setBusy(false); }
  };

  const joinRoom = async () => {
    setBusy(true);
    try {
      const result = await postJson("/api/multiplayer/join", { summaryOnly:true,code: joinCode.trim().toUpperCase() });
      const joined = result.room as Room;
      setRoom(joined);
      setMessage(`‘${joined.name}’에 참가했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "방에 참가하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const joinPublicRoom = async (code: string) => {
    setBusy(true);
    try {
      const result = await postJson("/api/multiplayer/join", { summaryOnly:true,code });
      const joined = result.room as Room;
      setRoom(joined);
      setMessage(`공개방 ‘${joined.name}’에 참가했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "공개방에 참가하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const roomAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!room) return;
    roomEpoch.current++;
    roomMutationPending.current = true;
    setBusy(true);
    try {
      const result = await postJson(`/api/multiplayer/rooms/${encodeURIComponent(room.code)}`, { action, ...extra }, "PATCH");
      setRoom(result.room as Room);
      if(action==="leave"){setRoom(null);void refreshLobby();}
      setMessage(action === "start" ? "릴레이 이야기를 시작했습니다." : "방 상태를 갱신했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "방 상태를 바꾸지 못했습니다."); }
    finally { roomMutationPending.current = false; setBusy(false); }
  };

  const changeReady = async () => {
    if (!room || !me || readyPending !== null) return;
    roomEpoch.current++;
    const ready = me.status !== "READY";
    const previous = room;
    roomMutationPending.current = true;
    setReadyPending(ready);
    setRoom({ ...room, members: room.members.map((member) => member.isSelf
      ? { ...member, status: ready ? "READY" : "JOINED", apiKeyReady }
      : member) });
    setMessage(ready ? "준비 상태를 저장하는 중입니다." : "준비 취소를 저장하는 중입니다.");
    try {
      const result = await postJson(`/api/multiplayer/rooms/${encodeURIComponent(room.code)}`, { action: "ready", ready, apiKeyReady }, "PATCH");
      setRoom(result.room as Room);
      setMessage(ready ? "준비를 완료했습니다." : "준비를 취소했습니다.");
    } catch (error) {
      setRoom(previous);
      setMessage(error instanceof Error ? error.message : "준비 상태를 바꾸지 못했습니다.");
    } finally {
      roomMutationPending.current = false;
      setReadyPending(null);
    }
  };

  const copyInviteLink = async () => {
    if (!room) return;
    const invite = `${window.location.origin}/multiplayer?room=${encodeURIComponent(room.code)}`;
    await navigator.clipboard.writeText(invite);
    setMessage("초대 링크를 복사했습니다.");
  };

  return (
    <main className="multiplayer-page">
      <header className="multiplayer-header">
        <Link href="/" className="multiplayer-back">← 단청</Link>
        <div><span>DANCHEONG · MULTIPLAYER</span><h1>함께 잇는 이야기</h1><p>한 주인공, 하나의 이야기. 2~4명이 차례로 다음 장면을 이어갑니다.</p></div>
        <div className={`multiplayer-key ${apiKeyReady ? "ready" : "missing"}`}><i />{apiKeyReady ? "API KEY READY" : "API KEY REQUIRED"}</div>
      </header>

      {!room ? (<>
        <nav className="multiplayer-lobby-tabs" role="tablist" aria-label="멀티플레이 로비" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'join':e.key==='End'?'create':lobbyTab==='join'?'create':'join';setLobbyTab(next);document.getElementById('lobby-tab-'+next)?.focus()}}}>
          <button id="lobby-tab-join" type="button" role="tab" aria-selected={lobbyTab==='join'} aria-controls="join-room" tabIndex={lobbyTab==='join'?0:-1} onClick={()=>setLobbyTab('join')}>방 찾기·참가</button>
          <button id="lobby-tab-create" type="button" role="tab" aria-selected={lobbyTab==='create'} aria-controls="create-room" tabIndex={lobbyTab==='create'?0:-1} onClick={()=>setLobbyTab('create')}>방 만들기</button>
        </nav>
        <section className={`multiplayer-entry-grid is-${lobbyTab}`}>
          <article className="multiplayer-panel multiplayer-create" id="create-room" role="tabpanel" aria-labelledby="lobby-tab-create" hidden={lobbyTab!=='create'}>
            <small>HOST A ROOM</small><h2>새 릴레이 방 만들기</h2>
            <label>작품<select aria-label="작품" disabled={busy} value={projectId} onChange={e=>{setProjectId(e.target.value);setSessionId(sessionChoices.find(s=>s.projectId===e.target.value)?.id||'');setStartMode('existing')}}><option value="">작품 선택</option>{workChoices.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <div className="text-provider-options" role="radiogroup" aria-label="이야기 시작 방식">
              <button type="button" role="radio" aria-checked={startMode==='existing'} disabled={busy} onClick={()=>setStartMode('existing')}><strong>진행 중인 세션</strong><small>지금까지의 이야기에서 이어가기</small></button>
              <button type="button" role="radio" aria-checked={startMode==='new'} disabled={busy||!projectId} onClick={()=>setStartMode('new')}><strong>새 이야기</strong><small>{sourceChecking?'원본 확인 중…':newStorySource?.kind==='revision'?`덧칠 v${newStorySource.revision} 원본으로 시작`:newStorySource?.kind==='missing'&&projectId?'원본 확인 필요':'작품의 시작 장면부터 함께'}</small></button>
            </div>
            {startMode==='new'&&newStorySource?.kind==='missing'&&!sourceChecking&&<p className="multiplayer-selection" role="status">{newStorySource.message} <button type="button" disabled={busy} onClick={()=>setSourceRetry(value=>value+1)}>원본 다시 확인</button></p>}
            {startMode==='existing'&&<label>이어갈 세션<select aria-label="이어갈 세션" disabled={busy} value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">세션 선택</option>{sessionChoices.filter(s=>s.projectId===projectId).map(s=><option key={s.id} value={s.id}>{s.name} · {s.turn}비트</option>)}</select></label>}
            <p className="multiplayer-selection">{startMode==='new'?'원본 패키지의 시작 설정으로 별도의 공유 이야기를 만듭니다.':selectedSession?.engine==='lotus'?'선택한 Lotus 세션을 공유합니다.':'개인 세션은 그대로 두고, 선택한 진행을 공유 이야기로 복사합니다.'}</p>
            <div className="text-provider-options" role="radiogroup" aria-label="방 플레이 모드">
              <button type="button" role="radio" aria-checked={presentation==='novel'} disabled={busy} onClick={()=>setPresentation('novel')}><strong>소설</strong><small>본문을 펼쳐 함께 읽기</small></button>
              <button type="button" role="radio" aria-checked={presentation==='visual'} disabled={busy||(startMode==='existing'&&selectedSession?.engine==='lotus')} onClick={()=>setPresentation('visual')}><strong>비주얼노벨</strong><small>장면과 인물, 음성으로 함께 읽기</small></button>
            </div>
            <p className="multiplayer-selection">플레이 모드는 방을 만든 후 바꿀 수 없습니다.{presentation==='visual'&&' 인물 판정·이미지·음성은 해당 턴 플레이어의 연결된 API 키로 생성하고 방 전체가 재사용합니다. 키가 없거나 오류가 나도 다른 참가자의 키로 자동 대체하지 않습니다.'}</p>
            <label>방 이름<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
            <div className="multiplayer-inline">
              <label>정원<select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}><option value={2}>2명</option><option value={3}>3명</option><option value={4}>4명</option></select></label>
              <label>턴 제한<select value={turnLimitSeconds} onChange={(event) => setTurnLimitSeconds(Number(event.target.value))}><option value={60}>1분</option><option value={90}>1분 30초</option><option value={120}>2분</option><option value={180}>3분</option></select></label>
            </div>
            <label>방 공개 범위<select value={visibility} onChange={(event) => setVisibility(event.target.value === "PRIVATE" ? "PRIVATE" : "PUBLIC")}><option value="PUBLIC">공개방 · 목록에서 참가 가능</option><option value="PRIVATE">비공개방 · 코드로만 참가</option></select></label>
            <button className="multiplayer-primary" disabled={busy || !projectId || (startMode==='existing'?!sessionId:!newStoryReady)} onClick={() => void createRoom()}>{busy?'이야기 준비 중…':'방 만들기'} <b>→</b></button>
          </article>
          <article className="multiplayer-panel multiplayer-join" id="join-room" role="tabpanel" aria-labelledby="lobby-tab-join" hidden={lobbyTab!=='join'}>
            <small>JOIN BY CODE</small><h2>참가 코드로 합류</h2><p>초대받은 6자리 코드로 입장하세요.</p>
            <input className="multiplayer-code-input" aria-label="6자리 참가 코드" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={joinCode} maxLength={6} placeholder="ABC234" onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <button className="multiplayer-secondary" disabled={busy || joinCode.length !== 6} onClick={() => void joinRoom()}>코드로 참가</button>
            {rooms.length > 0 && <details className="multiplayer-recent" open={recentExpanded} onToggle={event=>setRecentExpanded(event.currentTarget.open)}><summary>내 참가방 <span>{rooms.length}개</span></summary><div className="multiplayer-recent-list">{rooms.map((item) => <button key={item.code} disabled={busy} onClick={() => void refreshRoom(item.code)}><b>{item.name}</b><em>{item.code} · {item.members.length}/{item.maxPlayers}</em></button>)}</div></details>}
          </article>
          <section className="multiplayer-public-lobby" id="public-rooms" hidden={lobbyTab!=='join'}>
            <header><div><small>PUBLIC ROOMS</small><h2>참가 가능한 공개방</h2><p>대기 중이고 정원이 남은 방만 표시됩니다.</p></div><button type="button" disabled={busy} onClick={() => void refreshLobby()}>새로고침 ↻</button></header>
            {publicRooms.length > 0 ? <div className="multiplayer-public-grid">{publicRooms.map((item) => <article key={item.code}><div><span>{item.presentation==='visual'?'비주얼노벨':'소설'} · WAITING</span><em>{item.memberCount}/{item.maxPlayers}</em></div><h3>{item.name}</h3><p>{item.projectTitle}</p><small>HOST · {item.hostDisplayName} · 턴 {item.turnLimitSeconds}초</small><button type="button" disabled={busy} onClick={() => void joinPublicRoom(item.code)}>공개방 참가 <b>→</b></button></article>)}</div> : <div className="multiplayer-public-empty"><strong>현재 대기 중인 공개방이 없습니다.</strong><span>직접 공개방을 만들거나 참가 코드로 합류할 수 있습니다.</span></div>}
          </section>
        </section></>
      ) : (
        <section className="multiplayer-room-shell">
          <div className="multiplayer-room-top">
            <div><small>{room.status}</small><h2>{room.name}</h2><p>참가 코드 <button onClick={() => void navigator.clipboard.writeText(room.code)}>{room.code} ⧉</button> <button onClick={() => void copyInviteLink()}>초대 링크 ⧉</button></p></div>
            <div className="multiplayer-room-clock"><span>{room.status === "PAUSED_KEY" ? "키 복구 유예" : current ? `${current.displayName}의 턴` : "대기 중"}</span><strong>{String(Math.floor(countdown / 60)).padStart(2, "0")}:{String(countdown % 60).padStart(2, "0")}</strong></div>
          </div>
          <div className="multiplayer-room-grid">
            <article className="multiplayer-panel"><small>PLAYERS</small><h3>참가자</h3>
              <ol className="multiplayer-members">{room.members.filter((member) => !["KICKED", "LEFT"].includes(member.status)).map((member) => <li key={member.id} className={member.id === room.currentMemberId ? "current" : ""}><span>{member.seat}</span><div><b>{member.displayName}{member.isSelf ? " · 나" : ""}</b><em>{memberRoleLabel(member.role)} <mark className={member.status === "READY" ? "is-ready" : ""}>{member.status === "READY" ? "✓ " : "○ "}{memberStatusLabel(member.status)}</mark></em></div><i className={member.apiKeyReady ? "ready" : "missing"}>{member.apiKeyReady ? "KEY" : "NO KEY"}</i>{room.isHost && member.role !== "HOST" && <button type="button" disabled={busy || readyPending !== null} onClick={() => void roomAction("kick", { memberId: member.id })}>내보내기</button>}</li>)}</ol>
              {room.status === "WAITING" && <p className="multiplayer-selection">정원은 최대 {room.maxPlayers}명입니다. 현재 참가자 {presentMembers.length}명 중 2명 이상이 모두 준비하면 바로 시작할 수 있습니다.</p>}
              {room.status === "WAITING" && <div className={`multiplayer-ready-control ${me?.status === "READY" ? "is-ready" : ""}`}>
                <p role="status" aria-live="polite"><strong>{readyPending !== null ? (readyPending ? "준비 완료 저장 중…" : "준비 취소 저장 중…") : me?.status === "READY" ? "✓ 준비 완료" : "○ 준비 전"}</strong><span>{!apiKeyReady ? "API 키를 연결하면 준비할 수 있습니다." : me?.status === "READY" ? "다른 참가자를 기다리고 있습니다." : "준비되면 아래 버튼을 눌러 주세요."}</span></p>
                <button className={me?.status === "READY" ? "multiplayer-secondary" : "multiplayer-primary multiplayer-ready-button"} disabled={busy || readyPending !== null || !apiKeyReady} onClick={() => void changeReady()}>{readyPending !== null ? (readyPending ? "준비 중…" : "취소 중…") : me?.status === "READY" ? "준비 취소" : "준비 완료"}</button>
              </div>}
            </article>
            <article className="multiplayer-panel multiplayer-contract"><small>ROOM CONTRACT</small><h3>공통 실행 설정</h3><p>플레이 모드 · <strong>{room.settings.presentation==='visual'?'비주얼노벨':'소설'}</strong> (생성 시 고정)</p>
              <dl>
                {([['textModel','본문 모델'],['imageModel','이미지 모델'],['baseUrl','Base URL'],['outputContract','엔진']] as const).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{room.settings.engine!=='cortex' && room.isHost && room.status === "WAITING" ? <input value={room.settings[key]} onChange={(event) => setRoom({ ...room, settings: { ...room.settings, [key]: event.target.value } })} /> : room.settings[key]}</dd></div>)}
              </dl>
              <p>설정은 방 공통, API 키와 비용은 플레이어별입니다.</p>{room.settings.presentation==='visual'&&<p>인물 판정·이미지·음성은 해당 턴 플레이어의 연결된 키로 생성하고 방 전체가 재사용합니다. 턴이 넘어가도 원래 턴의 담당자가 유지되며, 키가 없거나 오류가 나도 다른 사람의 키로 자동 대체하지 않습니다. 실제 호출한 기기에 사용량이 기록되며, 다른 참가자의 키는 공유하지 않습니다. 음성 ON/OFF와 읽는 속도는 각자 설정합니다.</p>}
              {room.settings.engine!=='cortex' && room.isHost && room.status === "WAITING" && <button className="multiplayer-secondary" disabled={busy} onClick={() => void roomAction("settings", { settings: room.settings, turnLimitSeconds: room.turnLimitSeconds })}>공통 설정 저장</button>}
            </article>
          </div>
          {costs.length > 0 && <article className="multiplayer-cost-log"><header><span>ROOM COST LEDGER</span><strong>최근 호출 비용</strong></header>{costs.slice(0, 6).map((cost) => <div key={cost.id}><b>턴 {cost.storyTurn} · {cost.payerDisplayName}</b><span>{cost.model === 'muse-spark-1.3-contributor' ? 'Muse Contributor' : cost.model} · {cost.cause} · 입력 {cost.inputTokens.toLocaleString()} / 출력 {cost.outputTokens.toLocaleString()} 토큰</span><em>${cost.estimatedCostUsd.toFixed(4)}</em></div>)}</article>}
          {room.status === "PAUSED_KEY" && room.isHost && <div className="multiplayer-recovery"><div><b>현재 플레이어의 API 키를 사용할 수 없습니다.</b><span>1분 30초 안에 복구하지 못하면 자동 강퇴됩니다.</span></div><button onClick={() => void roomAction("retry")}>재시도</button><button onClick={() => void roomAction("skip")}>플레이어 건너뛰기</button><a href={room.settings.engine==='cortex'?`/multiplayer/play?room=${room.code}`:`/?room=${room.code}&cause=HOST_FORCE`}>방장 비용으로 강제 진행</a></div>}
          <div className="multiplayer-room-actions">
            <button onClick={() => setRoom(null)}>방 목록</button>
            <button disabled={busy} onClick={() => void roomAction("leave")}>방 나가기</button>
            {room.isHost && room.status !== "CLOSED" && <button disabled={busy} onClick={() => void roomAction("close")}>방 종료</button>}
            {room.status === "WAITING" && room.isHost && <button className="multiplayer-primary" disabled={busy || !roomCanStart} onClick={() => void roomAction("start")}>{presentMembers.length}/{room.maxPlayers}명으로 이야기 시작 →</button>}
            {["ACTIVE", "SOLO", "PAUSED_KEY"].includes(room.status) && <a className="multiplayer-primary" href={room.settings.engine==='cortex'?`/multiplayer/play?room=${room.code}`:`/?room=${room.code}`}>{room.status === "SOLO" ? "혼자서 이어가기" : "공유 이야기 열기"} →</a>}
          </div>
        </section>
      )}
      <p className="multiplayer-message" role="status">{message}</p>
    </main>
  );
}
