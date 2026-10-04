"use client";
import {useReadingMode} from "./components/reading-mode";
import {accountFetch,accountStorageKey} from "../lib/cortex-account-scope";
import { deviceMuseReasoningEffort, deviceTextProvider } from '../lib/text-provider';
import { OPENAI_IMAGE_KEY_CHANGED, resolveOpenAIImageKey } from '../lib/openai-image-key';
import { sameCloudContent } from '../lib/cortex-cloud-content';
import {cloudDelta} from '../lib/cortex-cloud-delta';
import {cloudSaveLabel} from '../lib/reader-reliability';

import { useCallback, useEffect, useRef, useState } from "react";
import { readCortexProjectPackage, rememberCortexProjectPackage, saveCortexSession } from "./hooks/use-runtime-engine";

type ReadyInfo = { scope: string; restored: boolean; turn: number; savedAt: string; contentKey?:string };
type CloudSession = { id: string; name:string; revision: number; turn: number; updatedAt: string };
type LeaseState = "checking" | "active" | "blocked" | "error" | "taking-over" | "yielding";
type CloudSyncPhase = "idle" | "checking" | "syncing" | "complete" | "retry";

const entryWait = <T,>(request: Promise<T>, milliseconds = 8000) => new Promise<T>((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error("작품 보관함을 읽는 데 시간이 걸립니다.")), milliseconds);
  request.then(resolve, reject).finally(() => window.clearTimeout(timer));
});

let cachedCortexDeviceId='';
const cortexDeviceId = () => {
  if(cachedCortexDeviceId)return cachedCortexDeviceId;
  const key = "dancheong-cortex-cloud-device-v1";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return cachedCortexDeviceId=existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return cachedCortexDeviceId=created;
  } catch {
    return cachedCortexDeviceId=crypto.randomUUID();
  }
};

export function CortexPlayer({accountOwnerKey,sessionId,projectId,sourceProjectId,sessionName,apiKey,theme,readingWidth,fontSize,typingSpeed,imageQuality,imageEvery,file,onFileConsumed,onHome,onSettings}:{accountOwnerKey?:string;sessionId:string;projectId:string;sourceProjectId?:string;sessionName:string;apiKey:string;theme:string;readingWidth:"narrow"|"normal"|"wide";fontSize:"small"|"medium"|"large";typingSpeed:"slow"|"natural"|"fast"|"instant";imageQuality:"low"|"medium";imageEvery:0|2|5|10|20;file:File|null;onFileConsumed:()=>void;onHome:()=>void;onSettings:(tab?:"connection"|"engine")=>void}) {
  const [readingMode,setReadingMode]=useReadingMode();
  const [viewReady,setViewReady]=useState<{document:string;mode:string}|null>(null);
  const [viewError,setViewError]=useState('');
  const [viewAttempt,setViewAttempt]=useState(0);
  const viewRequest=useRef<{id:string;document:string;mode:string}|null>(null);
  const initialFrameMode=useRef<{document:string;mode:string}|null>(null);
  const owner=useRef(accountOwnerKey).current;
  const fetch=useCallback((input:RequestInfo|URL,init?:RequestInit)=>owner?accountFetch(owner,input,init):Promise.reject(new Error('계정 확인 후 서재를 다시 열어 주세요.')),[owner]);
  const [museReasoningEffort,setMuseReasoningEffort]=useState(deviceMuseReasoningEffort);
  const [textProvider,setTextProvider]=useState(deviceTextProvider);
  const [imageKeyRevision,setImageKeyRevision]=useState(0);
  useEffect(()=>{const changed=()=>setImageKeyRevision(value=>value+1);window.addEventListener(OPENAI_IMAGE_KEY_CHANGED,changed);return()=>window.removeEventListener(OPENAI_IMAGE_KEY_CHANGED,changed)},[]);
  useEffect(()=>{const changed=()=>setTextProvider(deviceTextProvider());window.addEventListener('dancheong-provider-change',changed);return()=>window.removeEventListener('dancheong-provider-change',changed)},[]);
  useEffect(()=>{const changed=()=>setMuseReasoningEffort(deviceMuseReasoningEffort());window.addEventListener('dancheong-muse-reasoning-change',changed);return()=>window.removeEventListener('dancheong-muse-reasoning-change',changed)},[]);
  const frame = useRef<HTMLIFrameElement>(null);
  const cloudRevision = useRef(0);
  const cloudMirror = useRef<Record<string,unknown>|null>(null);
  const preflightRequest = useRef('');
  const mutationRunning = useRef(false);
  const cloudSyncEpoch = useRef(0);
  const cloudRestoring = useRef(false);
  const cloudCheckedRef = useRef("");
  const cloudUploadBusy = useRef(false);
  const cloudUploadQueued = useRef(false);
  const cloudExportInFlight = useRef(false);
  const cloudExportId = useRef('');
  const cloudExportTimer = useRef<number|null>(null);
  const pendingCloudWrite = useRef('');
  const activeCloudWrite = useRef('');
  const cloudExportSequence = useRef(0);
  const requestCloudExport = useRef<()=>void>(()=>{});
  const [saveProgress,setSaveProgress] = useState<{saved:number|null;current:number}>({saved:null,current:0});
  const suppressRestoredSummary = useRef(false);
  const cloudStatusTimer = useRef<number | null>(null);
  const cloudRetryTimer = useRef<number | null>(null);
  const cloudRetryCount = useRef(0);
  const cloudNeedsRetry = useRef(false);
  const [cloudFailure, setCloudFailure] = useState("");
  const [cloudCheckAttempt, setCloudCheckAttempt] = useState(0);
  const cloudCheckFailed = useRef(false);
  const [cloudPosition, setCloudPosition] = useState<{top:number;right:number} | null>(null);
  const lastExitExportAt = useRef(0);
  const [readyInfo, setReadyInfo] = useState<ReadyInfo | null>(null);
  const [cloudCheckedScope, setCloudCheckedScope] = useState("");
  const [notice, setNotice] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [entryError, setEntryError] = useState("");
  const [forkedSession, setForkedSession] = useState<{id:string;name:string} | null>(null);
  const [forkRestoring, setForkRestoring] = useState(false);
  const [forking, setForking] = useState(false);
  const [leaseState, setLeaseState] = useState<LeaseState>("checking");
  const [leaseMessage, setLeaseMessage] = useState("");
  const [leaseAttempt, setLeaseAttempt] = useState(0);
  const [readerStarted, setReaderStarted] = useState(false);
  const [cloudSyncPhase, setCloudSyncPhase] = useState<CloudSyncPhase>("idle");
  const pendingForkSnapshot = useRef<{scope:string;snapshot:Record<string,unknown>;revision?:number} | null>(null);
  const leaseDeviceId = useRef("");
  const leaseEpoch = useRef('');
  const ensureLease = useRef<(force?:boolean,includeSession?:boolean)=>Promise<boolean>>(async()=>false);
  const admittedSession = useRef<{session:CloudSession|null}|null>(null);
  const resumeSync = useRef(false);
  const conflictPending = useRef(false);
  const [syncConflict,setSyncConflict] = useState(false);
  const recovery = useRef<{scope:string;id:string;snapshot?:Record<string,unknown>;continueCloud?:boolean}|null>(null);
  const localChangeSequence = useRef(0);
  const leaseClientId = useRef("");
  const leaseRelease = useRef<(handoff?:boolean)=>void>(()=>{});
  const takeoverMode = useRef(false);
  const takeoverPending = useRef(false);
  const takeoverExportRequested = useRef(false);
  const readerBusy = useRef(false);
  const changedSinceReady = useRef(false);
  const scope = forkedSession?.id || sessionId || "cortex-local";
  const readerDocument = `${scope}:${loadAttempt}`;
  // The URL carries only the initial mode. Hot switches must retain this iframe and engine.
  if(readerStarted && initialFrameMode.current?.document!==readerDocument)initialFrameMode.current={document:readerDocument,mode:readingMode};
  const effectiveSessionName = forkedSession?.name || sessionName;
  const ready = readyInfo?.scope === scope;
  const cloudReady = cloudCheckedScope === scope;
  const packageRead = useRef<{projectId:string;request:Promise<File|null>} | null>(null);
  const showCloudSync = useCallback((phase:CloudSyncPhase) => {
    if (cloudStatusTimer.current) window.clearTimeout(cloudStatusTimer.current);
    cloudStatusTimer.current = null;
    setCloudSyncPhase(phase);
    if (phase === "complete") {
      cloudNeedsRetry.current = false;
      cloudRetryCount.current = 0;
      if (cloudRetryTimer.current) window.clearTimeout(cloudRetryTimer.current);
    }
    if (phase === "complete") cloudStatusTimer.current = window.setTimeout(() => {
      cloudStatusTimer.current = null;
      setCloudSyncPhase("idle");
    }, 5_000);
  }, []);
  const retryCloud = useCallback(() => {
    if (cloudRetryTimer.current) window.clearTimeout(cloudRetryTimer.current);
    if (cloudUploadBusy.current || readerBusy.current || conflictPending.current) return;
    if (cloudCheckFailed.current) {
      cloudCheckedRef.current = "";
      setCloudCheckAttempt(value => value + 1);
    } else if (cloudNeedsRetry.current) {
      showCloudSync("syncing");
      requestCloudExport.current();
    }
  }, [showCloudSync]);
  const markCloudFailure = useCallback((message:string) => {
    setCloudFailure(message);
    cloudNeedsRetry.current = true;
    showCloudSync("retry");
    if (cloudRetryTimer.current) window.clearTimeout(cloudRetryTimer.current);
    if (cloudRetryCount.current < 3) {
      const delay = [5_000,15_000,30_000][cloudRetryCount.current++];
      cloudRetryTimer.current = window.setTimeout(retryCloud, delay);
    }
  }, [retryCloud,showCloudSync]);
  // Give the reader document the network and IndexedDB path first. Fate/Seoul packages can carry
  // many embedded portraits, so racing their cloud/package reads against the iframe makes mobile
  // entry look blank even when the local story itself is small.
  useEffect(() => {
    cloudCheckFailed.current = false;
    cloudNeedsRetry.current = false;
    cloudRetryCount.current = 0;
    setCloudPosition(null);
    setSaveProgress({saved:null,current:0});
    cloudExportInFlight.current=false;
    cloudExportId.current='';pendingCloudWrite.current='';activeCloudWrite.current='';preflightRequest.current='';
    if(cloudExportTimer.current)window.clearTimeout(cloudExportTimer.current);
    cloudUploadQueued.current=false;
    if (cloudRetryTimer.current) window.clearTimeout(cloudRetryTimer.current);
    showCloudSync("idle");
  }, [scope, loadAttempt, showCloudSync]);
  useEffect(() => () => {
    if(cloudExportTimer.current)window.clearTimeout(cloudExportTimer.current);
    if (cloudStatusTimer.current) window.clearTimeout(cloudStatusTimer.current);
    if (cloudRetryTimer.current) window.clearTimeout(cloudRetryTimer.current);
  }, []);
  useEffect(() => {
    packageRead.current = null;
    if (!ready) return;
    packageRead.current = {projectId,request:readCortexProjectPackage(projectId,owner).catch(()=>null)};
  }, [projectId, loadAttempt, ready]);
  const send = (type:string,payload:Record<string,unknown>={}) => {
    if(type==='CLOUD_EXPORT'){
      if(cloudExportInFlight.current||cloudUploadBusy.current||mutationRunning.current||readerBusy.current){cloudUploadQueued.current=true;return;}
      cloudExportInFlight.current=true;cloudUploadQueued.current=false;cloudExportSequence.current=localChangeSequence.current;
      const exportId=crypto.randomUUID();cloudExportId.current=exportId;payload={...payload,exportId};
      if(cloudExportTimer.current)window.clearTimeout(cloudExportTimer.current);
      cloudExportTimer.current=window.setTimeout(()=>{
        if(cloudExportId.current!==exportId||!cloudExportInFlight.current)return;
        cloudExportInFlight.current=false;cloudExportId.current='';
        markCloudFailure('기기 저장본 응답 시간 초과 · 자동 재시도');
      },30_000);
    }
    if(type==='CLOUD_RESTORE'){cloudSyncEpoch.current++;cloudRestoring.current=true;cloudMirror.current=payload.snapshot as Record<string,unknown>;cloudExportInFlight.current=false;cloudExportId.current='';if(cloudExportTimer.current)window.clearTimeout(cloudExportTimer.current);cloudUploadQueued.current=false;}
    frame.current?.contentWindow?.postMessage({channel:"NEXUS_CORTEX_HOST_V1",type,...payload,...(['CLOUD_EXPORT','CLOUD_RESTORE'].includes(type)?{syncEpoch:cloudSyncEpoch.current}:{})},window.location.origin);
  };
  requestCloudExport.current=()=>send('CLOUD_EXPORT');
  useEffect(() => {
    let cancelled = false, owned = false, reacquiring = false, renewTimer = 0, retryTimer = 0;
    let validUntil=0,leaseTask:Promise<boolean>|null=null,releaseTask:Promise<unknown>|null=null;
    const endpoint = `/api/cortex/sessions/${encodeURIComponent(scope)}/lease`;
    if (!leaseDeviceId.current) leaseDeviceId.current = cortexDeviceId();
    if (!leaseClientId.current) leaseClientId.current = `${leaseDeviceId.current}:${crypto.randomUUID()}`;
    let epoch='',admissionConfirmed=false;
    const payload = (action:"acquire"|"renew"|"release"|"takeover", handoff = false, includeSession = false) => JSON.stringify({action,exclusive:true,deviceId:leaseDeviceId.current,clientId:leaseClientId.current,epoch,...(handoff ? {handoff:true} : {}),...(includeSession?{includeSession:true}:{})});
    const release = (handoff = false) => {
      if (!owned) return;
      owned = false;
      validUntil=0;
      window.clearInterval(renewTimer);
      const body = payload("release", handoff);
      releaseTask=fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true,signal:AbortSignal.timeout(15000)}).catch(()=>undefined);
    };
    const beginYield = () => {
      window.clearInterval(renewTimer);
      send("LEASE_LOCK", {locked:true});
      takeoverPending.current = true;
      setLeaseState("yielding");
      setLeaseMessage(readerBusy.current ? "진행 중인 비트를 마친 뒤 저장하고 다른 기기로 넘깁니다." : "현재 진행을 클라우드에 저장한 뒤 다른 기기로 넘기는 중입니다.");
      if (!readerBusy.current && !takeoverExportRequested.current) {
        takeoverExportRequested.current = true;
        send("CLOUD_EXPORT");
      }
    };
    async function acquire(preserveReader = false, includeSession = false) {
      if (!preserveReader) {
        setLeaseState("checking");
        setLeaseMessage("");
        setReaderStarted(false);
      }
      try {
        const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body:payload("acquire",false,includeSession),cache:"no-store",signal:AbortSignal.timeout(15000)});
        const result = await response.clone().json().catch(()=>({})) as {error?:string;code?:string;retryAfterMs?:number;lease?:{epoch?:string}};
        if (cancelled) return;
        if(result.lease?.epoch)leaseEpoch.current=epoch=result.lease.epoch;
        if(response.status===409&&result.code==='CORTEX_WRITER_BUSY'){
          owned=false;validUntil=0;setLeaseState('active');
          setNotice('같은 기기의 다른 창에서 진행 중입니다. 저장이 끝난 뒤 다시 전송해 주세요. 별도 세션을 만들 필요는 없습니다.');
          return;
        }
        if (response.status === 409 && result.code === "CORTEX_TAKEOVER_REQUESTED") {
          // The server only returns this during acquire when this physical device still owns
          // the lease. A restored tab must therefore be able to finish the device handoff.
          owned = true;
          leaseRelease.current = release;
          beginYield();
          return;
        }
        if (response.status === 409) {
          if (preserveReader) send("LEASE_LOCK", {locked:true});
          if (takeoverMode.current) {
            setLeaseState("taking-over");
            setLeaseMessage("다른 기기의 현재 진행을 저장하고 종료하기를 기다리는 중입니다. 응답이 없으면 잠금 만료 뒤 마지막 저장본으로 이어집니다.");
            retryTimer = window.setTimeout(() => setLeaseAttempt(value => value + 1), 2_000);
            return;
          }
          const seconds = Math.max(1, Math.ceil(Number(result.retryAfterMs || 0) / 1000));
          setLeaseState("blocked");
          setLeaseMessage(`다른 기기에서 사용 중입니다. 사용이 끝나면 약 ${seconds}초 안에 자동으로 다시 확인합니다.`);
          retryTimer = window.setTimeout(() => setLeaseAttempt(value => value + 1), Math.max(1_000, Number(result.retryAfterMs || 0) + 250));
          return;
        }
        if (response.status === 401) throw Error('로그인을 확인한 뒤 다시 전송해 주세요.');
        if (!response.ok) throw new Error(result.error || "다른 기기의 사용 상태를 확인하지 못했습니다.");
        if(includeSession){admissionConfirmed=true;if(Object.hasOwn(result,'session'))admittedSession.current={session:(result as any).session};}
        const resumedAfterTakeover = takeoverMode.current;
        owned = true;
        validUntil=Date.now()+Number((result as any).lease?.ttlMs||90000);
        leaseRelease.current = release;
        takeoverMode.current = false;
        // Only the cloud check/save acknowledgement may unlock mutations.
        setLeaseState("active");
        setReaderStarted(true);
        if (resumedAfterTakeover) {
          setNotice("다른 기기의 마지막 저장을 확인하고 있습니다. 이 기기에 미전송 기록이 있으면 먼저 보존합니다.");
          resumeSync.current=true;
          if(cloudCheckedRef.current===scope&&!readerBusy.current)send('CLOUD_EXPORT');
        }
        window.clearInterval(renewTimer);
        renewTimer = window.setInterval(()=>{void checkLease(true)}, 5_000);
      } catch (error) {
        if (cancelled) return;
        setLeaseState("error");
        setLeaseMessage(error instanceof Error ? error.message : "다른 기기의 사용 상태를 확인하지 못했습니다.");
      }
    }
    let renewing = false;
    async function renew(includeSession = false) {
      if (!owned || cancelled || renewing) return;
      renewing = true;
      try {
        const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body:payload("renew",false,includeSession),cache:"no-store",signal:AbortSignal.timeout(15000)});
        if (cancelled) return;
        const result = await response.clone().json().catch(()=>({})) as {code?:string};
        if(response.ok)validUntil=Date.now()+90000;
        if(response.ok&&includeSession){admissionConfirmed=true;if(Object.hasOwn(result,'session'))admittedSession.current={session:(result as any).session};}
        if (response.status === 409 && result.code === "CORTEX_TAKEOVER_REQUESTED" && !cancelled) {
          beginYield();
          return;
        }
        if (response.status === 409 && ['CORTEX_SESSION_IN_USE','CORTEX_LEASE_EXPIRED'].includes(result.code||'') && !cancelled && !reacquiring) {
          owned = false;
          reacquiring = true;
          if(cloudCheckedRef.current===scope)resumeSync.current=true;
          window.clearInterval(renewTimer);
          send("LEASE_LOCK", {locked:true});
          await acquire(true,includeSession);
          reacquiring = false;
        }
      } catch {
        // The server lease remains valid through its expiry. A later heartbeat retries without disrupting a turn.
      } finally {
        renewing = false;
      }
    }
    function checkLease(force=false,includeSession=false):Promise<boolean>{
      // A concurrent heartbeat has no admission receipt. Wait, then obtain a
      // fresh combined receipt instead of using stale metadata from an old turn.
      if(leaseTask)return includeSession?leaseTask.then(()=>checkLease(true,true)):leaseTask;
      if(includeSession){admittedSession.current=null;admissionConfirmed=false;}
      if(!force&&owned&&validUntil>Date.now()+15000)return Promise.resolve(true);
      const task=(async()=>{if(releaseTask){await releaseTask;releaseTask=null;}if(owned)await renew(includeSession);else await acquire(true,includeSession);const ok=!cancelled&&owned&&!takeoverPending.current&&validUntil>Date.now()&&(!includeSession||admissionConfirmed);
        return ok;})();
      leaseTask=task;void task.finally(()=>{if(leaseTask===task)leaseTask=null});return task;
    }
    ensureLease.current=checkLease;
    const onVisible = () => { if (document.visibilityState === "visible") {
      if(readerBusy.current||changedSinceReady.current||cloudUploadBusy.current){void checkLease(true);return;}
      // Merely resuming a reader never claims a writer lease.
      window.dispatchEvent(new window.Event('nexus-cloud-refresh'));
    } };
    const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) release(); };
    const onPageShow = (event:PageTransitionEvent) => {if(event.persisted)onVisible()};
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener('pageshow',onPageShow);
    window.addEventListener('online',onVisible);
    leaseRelease.current=release;
    setLeaseState('active');setReaderStarted(true);
    if(takeoverMode.current)void acquire(true);
    else if(cloudCheckedRef.current===scope&&!cloudCheckFailed.current&&!conflictPending.current&&!cloudRestoring.current&&!readerBusy.current&&!mutationRunning.current){
      if(changedSinceReady.current||cloudNeedsRetry.current)send('CLOUD_EXPORT');
      else send('LEASE_LOCK',{locked:false});
    }
    return () => {
      cancelled = true;
      window.clearInterval(renewTimer);
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener('pageshow',onPageShow);
      window.removeEventListener('online',onVisible);
      release();
      if(ensureLease.current===checkLease)ensureLease.current=async()=>false;
      if (leaseRelease.current === release) leaseRelease.current = ()=>{};
    };
  }, [scope, leaseAttempt]);
  const finishCloudCheck = useCallback(() => {
    cloudCheckedRef.current = scope;
    setCloudCheckedScope(scope);
    if(!cloudCheckFailed.current&&cloudRevision.current>0&&!conflictPending.current)send('LEASE_LOCK',{locked:false});
  }, [scope]);

  useEffect(()=>{
    if(!ready)return;let disposed=false,polling=false;
    const clean=()=>!disposed&&!readerBusy.current&&!preflightRequest.current&&!changedSinceReady.current&&!cloudUploadBusy.current&&!cloudRestoring.current&&!conflictPending.current&&cloudCheckedRef.current===scope;
    const refresh=async()=>{
      if(polling||document.visibilityState!=='visible'||!clean())return;polling=true;
      try{
        const response=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?summary=1`,{cache:'no-store',signal:AbortSignal.timeout(12000)});
        if(!response.ok||!clean())return;
        const {session}=await response.json();if(!clean()||session?.revision===cloudRevision.current)return;
        const revisionAtStart=cloudRevision.current;
        const full=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}`,{cache:'no-store',signal:AbortSignal.timeout(90000)});
        if(!full.ok||!clean()||cloudRevision.current!==revisionAtStart)return;
        const remote=await full.json();if(!clean())return;
        cloudRevision.current=remote.session.revision;suppressRestoredSummary.current=true;send('LEASE_LOCK',{locked:true});
        send('CLOUD_RESTORE',{snapshot:remote.snapshot,projectId});
      }catch{/* Preflight remains fail-closed if an idle refresh cannot connect. */}finally{polling=false;}
    };
    const wake=()=>void refresh(),timer=window.setInterval(wake,8000);
    window.addEventListener('nexus-cloud-refresh',wake);window.addEventListener('focus',wake);
    return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('nexus-cloud-refresh',wake);window.removeEventListener('focus',wake)};
  },[scope,ready,projectId,fetch]);

  useEffect(() => {
    if (leaseState !== "active" || ready) return;
    const timer = window.setTimeout(() => setEntryError("세션을 여는 데 시간이 걸리고 있습니다. 저장 기록은 삭제되지 않았습니다."), 20000);
    return () => window.clearTimeout(timer);
  }, [ready, scope, loadAttempt, leaseState]);

  const retryEntry = () => {
    if (readerBusy.current) return;
    cloudCheckedRef.current = "";
    cloudRevision.current = 0;
    setReadyInfo(null);
    setCloudCheckedScope("");
    setEntryError("");
    setNotice("");
    setLoadAttempt(value => value + 1);
  };

  useEffect(() => {
    let disposed=false, ownedWriteRequest='';
    const upload = async (snapshot:Record<string,unknown>, turn:number,savedAt='',contentKey=''):Promise<boolean> => {
      snapshot={...snapshot};delete snapshot.exportedAt;delete snapshot.storageDiagnostics;
      if(mutationRunning.current){cloudUploadQueued.current=true;return false;}
      if(conflictPending.current&&!recovery.current)return false;
      if (cloudUploadBusy.current) {
        cloudUploadQueued.current = true;
        showCloudSync("syncing");
        return false;
      }
      cloudUploadBusy.current = true;
      const changeSequence=cloudExportSequence.current;
      setSaveProgress(old=>({...old,current:turn}));
      showCloudSync("syncing");
      const controller = new AbortController();
      const uploadTimeout = window.setTimeout(() => controller.abort(), 90_000);
      try {
        const acknowledge=(revision:number,savedTurn=turn)=>{
          cloudMirror.current=snapshot;
          cloudRevision.current=revision;changedSinceReady.current=localChangeSequence.current!==changeSequence;resumeSync.current=false;
          setSaveProgress(old=>({saved:savedTurn,current:changedSinceReady.current?old.current:turn}));
          cloudUploadQueued.current=changedSinceReady.current;
          try{localStorage.setItem((accountStorageKey('nexus-cloud-base:'+scope,owner)||'nexus-cloud-base:'+scope),JSON.stringify({revision,savedAt,contentKey}));}catch{}
          if(!takeoverPending.current&&!conflictPending.current)send('LEASE_LOCK',{locked:false});
          if(!changedSinceReady.current&&!readerBusy.current&&!takeoverPending.current)leaseRelease.current(true);
          showCloudSync(changedSinceReady.current?'syncing':'complete');return true;
        };
        const reconcile=async():Promise<'same'|'restore'|'retry'|'choice'>=>{
          if(readerBusy.current){cloudUploadQueued.current=true;return 'choice';}
          const response=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?sync=${Date.now()}`,{cache:'no-store',signal:controller.signal});
          if(response.status===404&&cloudRevision.current===0)return 'retry';
          if(!response.ok)throw Error('최신 클라우드 기록을 확인하지 못했습니다. 현재 기록은 기기에 남아 있습니다.');
          const remote=await response.json() as {session:CloudSession;snapshot:Record<string,unknown>};
          if(disposed||readerBusy.current||localChangeSequence.current!==changeSequence){cloudUploadQueued.current=true;return 'choice';}
          if(!remote.session||!remote.snapshot)throw Error('클라우드 기록 확인 응답이 올바르지 않습니다.');
          if(sameCloudContent(snapshot,remote.snapshot)){acknowledge(remote.session.revision,remote.session.turn);return 'same';}
          if(remote.session.revision===cloudRevision.current)return 'retry';
          let base:{contentKey?:string}|null=null;
          try{base=JSON.parse(localStorage.getItem((accountStorageKey('nexus-cloud-base:'+scope,owner)||'nexus-cloud-base:'+scope))||'null')}catch{}
          if(contentKey&&contentKey===base?.contentKey){
            // This device has not changed its acknowledged durable content. Follow
            // the remote continuation; never infer ancestry from turn count/time.
            cloudRevision.current=remote.session.revision;resumeSync.current=true;
            suppressRestoredSummary.current=true;cloudUploadQueued.current=false;
            send('LEASE_LOCK',{locked:true});send('CLOUD_RESTORE',{snapshot:remote.snapshot,projectId});return 'restore';
          }
          conflictPending.current=true;cloudUploadQueued.current=false;send('LEASE_LOCK',{locked:true});
          setSyncConflict(true);showCloudSync('idle');
          setNotice('클라우드 기록과 이 기기의 미전송 기록이 다릅니다. 두 기록을 덮어쓰거나 자동 분기하지 않고 선택을 기다립니다.');
          return 'choice';
        };
        if(recovery.current?.scope===scope){
          if(readerBusy.current)return false;
          const record=recovery.current;
          if(record.snapshot&&!sameCloudContent(record.snapshot,snapshot)){record.id='recovery-'+crypto.randomUUID();record.snapshot=snapshot;}
          record.snapshot ||= snapshot;
          const response=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}/preserve`,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({snapshot:record.snapshot,recoveryId:record.id,projectId,sourceProjectId,name:effectiveSessionName,deviceId:cortexDeviceId()})});
          const result=await response.json() as {session?:CloudSession;error?:string};
          if(!response.ok||!result.session)throw Error(result.error||'진행 보존을 다시 시도합니다.');
          if(disposed)return false;
          const id=result.session.id,name=result.session.name;
          if(record.continueCloud){
            // This is an explicit choice: save the local version first, then read
            // the current original. A failed GET leaves the local reader untouched.
            saveCortexSession({id,projectId,sourceProjectId,name,turn:result.session.turn,lastPlayedAt:new Date().toISOString()},owner);
            if(!await ensureLease.current(true))throw Error('현재 기록은 별도 보존했습니다. 다른 기기 사용이 끝나면 다시 시도해 주세요.');
            const fresh=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?sync=${Date.now()}`,{cache:'no-store',signal:controller.signal});
            if(!fresh.ok)throw Error('현재 기록은 별도 보존했습니다. 클라우드 본문을 다시 확인해 주세요.');
            const remote=await fresh.json() as {session:CloudSession;snapshot:Record<string,unknown>};
            if(disposed)return false;
            if(readerBusy.current||localChangeSequence.current!==changeSequence)throw Error('기기 기록이 추가로 변경되었습니다. 저장을 다시 확인해 주세요.');
            if(!remote.session||!remote.snapshot)throw Error('클라우드 본문 응답이 올바르지 않습니다.');
            recovery.current=null;conflictPending.current=false;setSyncConflict(false);cloudUploadQueued.current=false;
            cloudRevision.current=remote.session.revision;suppressRestoredSummary.current=true;
            send('CLOUD_RESTORE',{snapshot:remote.snapshot,projectId});setNotice('이 기기의 기록은 별도 세션으로 보존하고, 최신 클라우드 기록으로 이어갑니다.');return true;
          }
          pendingForkSnapshot.current={scope:id,snapshot:record.snapshot,revision:1};
          saveCortexSession({id,projectId,sourceProjectId,name,turn:result.session.turn,lastPlayedAt:new Date().toISOString()},owner);
          recovery.current=null;takeoverPending.current=false;cloudUploadQueued.current=false;conflictPending.current=false;setSyncConflict(false);
          setForkRestoring(true);setForkedSession({id,name});setReadyInfo(null);setCloudCheckedScope('');cloudCheckedRef.current='';cloudRevision.current=1;
          setNotice('서로 다른 진행을 덮어쓰지 않고 현재 기록을 ‘충돌 보존’ 세션으로 따로 저장했습니다. 원래 세션도 서재에 남아 있습니다.');
          return true;
        }
        if(!await ensureLease.current()){
          cloudNeedsRetry.current=true;showCloudSync('retry');return false;
        }
        if(disposed)return false;
        if(resumeSync.current){const resolved=await reconcile();if(resolved!=='retry')return resolved==='same';}
        const operations=cloudRevision.current>0?cloudDelta(cloudMirror.current,snapshot):null;
        const body = JSON.stringify({... (operations?{operations}:{snapshot}),projectId,sourceProjectId,name:effectiveSessionName,expectedRevision:cloudRevision.current,deviceId:cortexDeviceId(),leaseEpoch:leaseEpoch.current});
        // A small snapshot can finish even if mobile Safari/Chrome backgrounds the page.
        // Larger snapshots use a normal request because browsers reject oversized keepalive bodies.
        const keepalive = body.length <= 60_000 && new TextEncoder().encode(body).byteLength <= 60_000;
        const response = await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
          ...(keepalive ? {keepalive:true} : {}),
        });
        if (response.status === 401 || response.status === 403 || response.redirected) throw new Error("로그인 확인 필요 · 다시 시도");
        if (response.status === 413) throw new Error("저장 용량 초과 · 백업 필요");
        const result = await response.json().catch(() => {throw new Error(`서버 응답 오류 (${response.status}) · 재시도`);}) as {session?:CloudSession;snapshot?:Record<string,unknown>;code?:string;error?:string;serverRevision?:number};
        if(disposed)return false;
        if(result.code==='CORTEX_DELTA_INVALID'){cloudMirror.current=null;cloudUploadQueued.current=true;return false;}
        if (response.status === 409) {
          resumeSync.current=true;send('LEASE_LOCK',{locked:true});
          // Expiry is not divergence. Revalidate the same device first, then compare
          // records. SQL races also arrive here and must not create a branch.
          if(!await ensureLease.current(true)){cloudNeedsRetry.current=true;showCloudSync('retry');return false;}
          if(disposed)return false;
          const resolved=await reconcile();
          if(resolved==='retry')cloudUploadQueued.current=!readerBusy.current;
          return resolved==='same';
        }
        if (!response.ok) throw new Error(`클라우드 저장 오류 (${response.status}) · 재시도`);
        if (!result.session) throw new Error("저장 확인 응답 없음 · 재시도");
        return acknowledge(result.session.revision,result.session.turn);
      } catch (error) {
        cloudUploadQueued.current=false;
        markCloudFailure(controller.signal.aborted ? "전송 시간 초과 · 재시도" : error instanceof TypeError ? "네트워크 전송 실패 · 재시도" : error instanceof Error ? error.message : "클라우드 저장 실패 · 재시도");
        return false;
      } finally {
        window.clearTimeout(uploadTimeout);
        cloudUploadBusy.current = false;
        if (cloudUploadQueued.current && !disposed && !conflictPending.current) {
          cloudUploadQueued.current = false;
          showCloudSync("syncing");
          window.setTimeout(() => {if(!disposed)send("CLOUD_EXPORT")}, 0);
        }
      }
    };
    const listener = (event:MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== "NEXUS_CORTEX_HOST_V1") return;
      if (event.data.type === "CLOUD_STATUS_POSITION" && Number.isFinite(event.data.top) && Number.isFinite(event.data.right)) {
        setCloudPosition({top:Math.max(0,event.data.top),right:Math.max(8,event.data.right)});
      }
      if (event.data.type === "CLOUD_EXPORT_ERROR") {
        if(event.data.exportId&&event.data.exportId!==cloudExportId.current)return;
        if(cloudExportTimer.current)window.clearTimeout(cloudExportTimer.current);
        cloudExportInFlight.current=false;cloudExportId.current='';markCloudFailure("기기 저장본 준비 실패 · 재시도");
      }
      if (event.data.type === "READY") {
        if(cloudCheckedRef.current!==scope||cloudCheckFailed.current||cloudRestoring.current)send('LEASE_LOCK',{locked:true});
        const local = event.data.local || {};
        if (readyInfo?.scope !== scope) {
          changedSinceReady.current = false;
          cloudRevision.current = 0;
          cloudCheckedRef.current = "";
          suppressRestoredSummary.current = false;
        }
        const info = {scope,restored:Boolean(local.restored),turn:Number(local.turn || 0),savedAt:String(local.savedAt || ""),contentKey:String(local.contentKey||'')};
        setReadyInfo(old => old?.scope === scope && old.restored === info.restored && old.turn === info.turn && old.savedAt === info.savedAt ? old : info);
        setEntryError("");
        const seed = pendingForkSnapshot.current;
        if (seed?.scope === scope) {
          cloudRevision.current=seed.revision||0;
          pendingForkSnapshot.current = null;
          cloudCheckedRef.current = scope;
          setCloudCheckedScope(scope);
          suppressRestoredSummary.current = true;
          send("CLOUD_RESTORE", {snapshot:seed.snapshot,projectId});
        }
      }
      if (event.data.type === "ERROR") {
        cloudRestoring.current=false;
        setNotice(String(event.data.message || "세션을 불러오지 못했습니다. 다시 시도해 주세요."));
        if (readyInfo?.scope !== scope) setEntryError(String(event.data.message || "세션을 불러오지 못했습니다. 다시 시도해 주세요."));
        if (readyInfo?.scope === scope && cloudCheckedRef.current !== scope) finishCloudCheck();
      }
      if (event.data.type === "VIEW_MODE_REQUEST") {setReadingMode(event.data.mode==='visual'?'visual':'novel');return;}
      if (event.data.type === "VIEW_MODE_READY" || event.data.type === "VIEW_MODE_ERROR") {
        const request=viewRequest.current;
        if(!request || event.data.requestId!==request.id || event.data.mode!==request.mode)return;
        if(event.data.type==='VIEW_MODE_READY'){setViewReady({document:request.document,mode:request.mode});setViewError('');}
        else {const message=String(event.data.message||'화면을 불러오지 못했습니다. 다시 시도해 주세요.');setViewError(message);if(request.mode==='novel')setNotice(message);}
        return;
      }
      if (event.data.type === "HOME") onHome();
      if (event.data.type === "NEXUS_SETTINGS") onSettings(event.data.tab);
      if (event.data.type === "RESET_SESSION") void (async () => {
        setNotice("작품의 시작 장면으로 되돌리는 중입니다.");
        const cached = await readCortexProjectPackage(projectId,owner).catch(() => null);
        send(cached ? "RESET_FILE" : "RESET_PROJECT", {...(cached ? {file:cached} : {}),projectId,sourceProjectId});
      })();
      if (event.data.type === "RESET_COMPLETE") setNotice("세션을 작품의 시작 장면으로 초기화했습니다.");
      if (event.data.type === "CLOUD_RESTORE_COMPLETE") {
        if(event.data.syncEpoch!==undefined&&event.data.syncEpoch!==cloudSyncEpoch.current)return;
        cloudRestoring.current=false;
        try{localStorage.setItem((accountStorageKey('nexus-cloud-base:'+scope,owner)||'nexus-cloud-base:'+scope),JSON.stringify({revision:cloudRevision.current,savedAt:String(event.data.savedAt||''),contentKey:String(event.data.contentKey||'')}));}catch{}
        resumeSync.current=false;changedSinceReady.current=false;
        setSaveProgress({saved:cloudRevision.current>0?Number(event.data.turn||0):null,current:Number(event.data.turn||0)});
        if(!takeoverPending.current&&!conflictPending.current)send('LEASE_LOCK',{locked:false});
        setForkRestoring(false);
        setReadyInfo(old => old?.scope === scope ? {...old,restored:true,turn:Number(event.data.turn || old.turn)} : old);
        finishCloudCheck();
        showCloudSync(cloudRevision.current>0?"complete":"syncing");
        if(cloudRevision.current===0)send('CLOUD_EXPORT');
      }
      if (event.data.type === "CLOUD_SNAPSHOT" && event.data.snapshot && (cloudCheckedRef.current === scope || takeoverPending.current)) {
        if(cloudRestoring.current||(event.data.syncEpoch!==undefined&&event.data.syncEpoch!==cloudSyncEpoch.current))return;
        if(event.data.exportId&&event.data.exportId!==cloudExportId.current)return;
        if(cloudExportTimer.current)window.clearTimeout(cloudExportTimer.current);
        cloudExportId.current='';
        cloudExportInFlight.current=false;
        void upload(event.data.snapshot, Number(event.data.turn || 0),String(event.data.savedAt||''),String(event.data.contentKey||'')).then(saved => {
          if (!takeoverPending.current) return;
          if (saved) {
            takeoverPending.current = false;
            takeoverExportRequested.current = false;
            leaseRelease.current(true);
            setLeaseMessage("현재 진행을 저장했습니다. 이 기기의 세션 사용을 종료하고 다른 기기로 넘겼습니다.");
            return;
          }
          takeoverExportRequested.current = false;
          setLeaseMessage("현재 진행 저장을 다시 시도하고 있습니다. 완료될 때까지 이 화면의 입력은 잠겨 있습니다.");
          if (!readerBusy.current) window.setTimeout(() => {
            if (!takeoverPending.current || takeoverExportRequested.current) return;
            takeoverExportRequested.current = true;
            send("CLOUD_EXPORT");
          }, 1_500);
        });
      }
      if(event.data.type==='DURABLE_CHANGE'){
        if(cloudRestoring.current)return;
        localChangeSequence.current++;
        changedSinceReady.current=true;
        if(cloudCheckedRef.current===scope&&!readerBusy.current)send('CLOUD_EXPORT');
      }
      if (event.data.type === "SUMMARY") {
        setSaveProgress(old=>({...old,current:Number(event.data.turn||0)}));
        window.dispatchEvent(new CustomEvent("nexus-cortex-summary",{detail:{...event.data,id:scope,projectId,sourceProjectId,ownerKey:owner}}));
        if (suppressRestoredSummary.current) suppressRestoredSummary.current = false;
        else if (cloudCheckedRef.current === scope) {
          showCloudSync("syncing");
          send("CLOUD_EXPORT");
        }
      }
      if (event.data.type === "BUSY") {
        readerBusy.current = Boolean(event.data.busy);
        if(readerBusy.current){changedSinceReady.current=true;localChangeSequence.current++;}
        if(!readerBusy.current&&cloudUploadQueued.current&&!cloudUploadBusy.current&&cloudCheckedRef.current===scope){
          cloudUploadQueued.current=false;send('CLOUD_EXPORT');
        }
        if(!readerBusy.current&&(recovery.current?.scope===scope||resumeSync.current)&&!conflictPending.current)send('CLOUD_EXPORT');
        if (!readerBusy.current && takeoverPending.current && !takeoverExportRequested.current) {
          takeoverExportRequested.current = true;
          send("CLOUD_EXPORT");
        }
        window.dispatchEvent(new CustomEvent("nexus-cortex-busy",{detail:readerBusy.current}));
      }
      if(event.data.type==='CLOUD_WRITE_REQUEST')void(async()=>{
        const requestId=String(event.data.requestId||'');
        const deny=(message:string)=>{setNotice(message);send('CLOUD_WRITE_RESULT',{requestId,allowed:false});};
        if(!requestId)return;
        if(pendingCloudWrite.current||preflightRequest.current||mutationRunning.current||readerBusy.current){deny('현재 실행 중인 처리가 끝난 뒤 다시 시도해 주세요.');return;}
        pendingCloudWrite.current=requestId;ownedWriteRequest=requestId;
        try{
          const started=Date.now();let requestedSave=false;
          // Hold this one action while the previous save settles. Never require
          // repeated clicks, and never bypass a conflict or an unverified save.
          while(!disposed&&pendingCloudWrite.current===requestId){
            if(conflictPending.current)throw Error('서로 다른 기록이 있습니다. 진행 보존 선택을 먼저 완료해 주세요.');
            if(cloudCheckFailed.current){retryCloud();throw Error('클라우드 연결을 다시 확인합니다. 현재 본문과 입력은 유지됩니다.');}
            const saving=cloudExportInFlight.current||cloudUploadBusy.current||cloudRestoring.current;
            const dirty=changedSinceReady.current||cloudNeedsRetry.current;
            if(!saving&&!dirty&&cloudCheckedRef.current===scope)break;
            if(Date.now()-started>110_000)throw Error('클라우드 저장 응답이 지연됩니다. 현재 본문은 보존되어 있으며 연결 복구 후 다시 시도할 수 있습니다.');
            if(!saving&&dirty&&cloudCheckedRef.current===scope){
              if(requestedSave&&cloudNeedsRetry.current)throw Error('클라우드 저장에 실패했습니다. 현재 본문은 보존되어 있으며 저장을 자동 재시도합니다.');
              requestedSave=true;send('CLOUD_EXPORT');
            }
            await new Promise(resolve=>window.setTimeout(resolve,100));
          }
          if(disposed||pendingCloudWrite.current!==requestId)return;
          preflightRequest.current=requestId;
          const admitted=await ensureLease.current(true,true);
          if(disposed||pendingCloudWrite.current!==requestId)return;
          if(!admitted){deny('다른 화면에서 진행 중이거나 연결을 확인하지 못했습니다. 입력은 유지됩니다.');return;}
          let result=admittedSession.current;
          // Rolling deployments/older servers can omit the combined receipt.
          if(!result){const response=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?summary=1`,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('클라우드 기록을 확인하지 못했습니다. 입력은 유지됩니다.');result=await response.json() as {session:CloudSession};}
          if(!result?.session)throw Error('먼저 시작 장면을 클라우드에 저장해야 합니다. 잠시 후 다시 전송해 주세요.');
          if(disposed||pendingCloudWrite.current!==requestId)return;
          if(result.session.revision!==cloudRevision.current){
            const fresh=await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}`,{cache:'no-store',signal:AbortSignal.timeout(90000)});
            if(!fresh.ok)throw Error('최신 기록을 불러오지 못했습니다. 입력은 유지됩니다.');
            const remote=await fresh.json();if(disposed||pendingCloudWrite.current!==requestId)return;
            cloudRevision.current=remote.session.revision;suppressRestoredSummary.current=true;
            send('CLOUD_RESTORE',{snapshot:remote.snapshot,projectId});leaseRelease.current(true);
            deny('다른 기기의 최신 진행을 불러왔습니다. 내용을 확인한 뒤 다시 전송해 주세요.');return;
          }
          setNotice('');changedSinceReady.current=true;mutationRunning.current=true;activeCloudWrite.current=requestId;
          send('CLOUD_WRITE_RESULT',{requestId,allowed:true});
        }catch(error){if(!disposed&&pendingCloudWrite.current===requestId){leaseRelease.current(true);deny(error instanceof Error?error.message:'연결을 확인한 뒤 다시 전송해 주세요.');}}
        finally{
          if(preflightRequest.current===requestId){preflightRequest.current='';if(!disposed&&pendingCloudWrite.current!==requestId&&activeCloudWrite.current!==requestId)leaseRelease.current(true);}
          if(pendingCloudWrite.current===requestId)pendingCloudWrite.current='';if(ownedWriteRequest===requestId)ownedWriteRequest='';
        }
      })();
      if(event.data.type==='CLOUD_WRITE_CANCELLED'&&pendingCloudWrite.current===event.data.requestId)pendingCloudWrite.current='';
      if(event.data.type==='CLOUD_WRITE_FINISHED'){
        if(event.data.requestId&&event.data.requestId!==activeCloudWrite.current)return;
        mutationRunning.current=false;activeCloudWrite.current='';
        send('LEASE_LOCK',{locked:true});
        if(!readerBusy.current)send('CLOUD_EXPORT');else cloudUploadQueued.current=true;
      }
    };
    window.addEventListener("message", listener);
    return () => {
      disposed=true;
      if(ownedWriteRequest&&pendingCloudWrite.current===ownedWriteRequest){send('CLOUD_WRITE_RESULT',{requestId:ownedWriteRequest,allowed:false});pendingCloudWrite.current='';}
      window.removeEventListener("message", listener);
      window.dispatchEvent(new CustomEvent("nexus-cortex-busy",{detail:false}));
    };
  }, [scope,projectId,sourceProjectId,effectiveSessionName,onHome,onSettings,readyInfo,finishCloudCheck,showCloudSync,markCloudFailure]);

  useEffect(() => {
    const requestExitExport = () => {
      if (!ready || cloudCheckedRef.current !== scope || readerBusy.current || cloudUploadBusy.current) return;
      const now = Date.now();
      if (now - lastExitExportAt.current < 500) return;
      lastExitExportAt.current = now;
      showCloudSync("syncing");
      requestCloudExport.current();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") requestExitExport();
      else retryCloud();
    };
    window.addEventListener("online", retryCloud);
    window.addEventListener("pageshow", retryCloud);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", requestExitExport);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", requestExitExport);
      window.removeEventListener("online", retryCloud);
      window.removeEventListener("pageshow", retryCloud);
    };
  }, [ready,scope,showCloudSync,retryCloud]);

  useEffect(() => {
    if (!ready || !readyInfo || cloudCheckedRef.current === scope) return;
    let cancelled = false;
    showCloudSync("checking");
    const timeout = window.setTimeout(() => { if (!cancelled) { cancelled = true; cloudCheckFailed.current = true; finishCloudCheck(); markCloudFailure("클라우드 조회 지연 · 재시도"); } }, 90_000);
    void (async () => {
      try {
        const response = await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?summary=1&sync=${Date.now()}`, {cache:"no-store"});
        if (cancelled) return;
        if (!response) return finishCloudCheck();
        if (response.status === 404) {
          cloudCheckFailed.current = false;
          finishCloudCheck();
          if (readyInfo.restored || readyInfo.turn > 0) {
            showCloudSync("syncing");
            send("CLOUD_EXPORT");
          } else showCloudSync("idle");
          return;
        }
        if (response.status === 401 || response.status === 403 || response.redirected) throw new Error("로그인 확인 필요 · 다시 시도");
        const result = await response.json() as {session?:CloudSession;snapshot?:Record<string,unknown>;error?:string};
        if (cancelled) return;
        if (!response.ok || !result.session) throw new Error("클라우드 기록 확인 실패 · 재시도");
        let base:{revision:number;savedAt:string;contentKey?:string}|null=null;
        try{base=JSON.parse(localStorage.getItem((accountStorageKey('nexus-cloud-base:'+scope,owner)||'nexus-cloud-base:'+scope))||'null')}catch{}
        // Only a acknowledged local save may be replaced by a newer cloud snapshot.
        // Unknown legacy provenance or unsent local changes take the revision-checked
        // upload/preservation path; turn counts and clocks cannot prove ancestry.
        const preserveLocalChanges=()=>{
          const acknowledged=base&&(base.contentKey&&readyInfo.contentKey?base.contentKey===readyInfo.contentKey:base.savedAt===readyInfo.savedAt);
          if(!changedSinceReady.current&&!readerBusy.current&&!(readyInfo.restored&&!acknowledged))return false;
          cloudRevision.current=Number(base?.revision||0);
          cloudCheckFailed.current=false;finishCloudCheck();
          if(readerBusy.current)cloudUploadQueued.current=true;else send('CLOUD_EXPORT');
          return true;
        };
        if(preserveLocalChanges())return;
        cloudRevision.current = result.session.revision;
        setSaveProgress(old=>({...old,saved:result.session!.turn,current:readyInfo.turn}));
        const remoteIsNewer = !readyInfo.restored || result.session.revision !== base?.revision;
        if (remoteIsNewer) {
          if (!result.snapshot) {
            const full = await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?sync=${Date.now()}`, {cache:"no-store"});
            if (!full.ok) throw new Error("클라우드 본문 조회 실패 · 재시도");
            const restored = await full.json() as {session:CloudSession;snapshot:Record<string,unknown>};
            if (cancelled) return;
            result.snapshot = restored.snapshot;
            cloudRevision.current = restored.session.revision;
          }
          if (!result.snapshot) throw new Error("클라우드 본문 확인 필요 · 재시도");
          // The full snapshot fetch may have overlapped a new local input/image.
          if(preserveLocalChanges())return;
          cloudCheckFailed.current = false;
          suppressRestoredSummary.current = true;
          showCloudSync("syncing");
          send("CLOUD_RESTORE", {snapshot:result.snapshot,projectId});
        }
        else {
          cloudCheckFailed.current = false;
          finishCloudCheck();
          showCloudSync("complete");
        }
      } catch (error) {
        if (!cancelled) { cloudCheckFailed.current = true; finishCloudCheck(); markCloudFailure(error instanceof Error && !(error instanceof TypeError) ? error.message : "클라우드 조회 실패 · 재시도"); }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [ready,readyInfo,scope,projectId,finishCloudCheck,showCloudSync,markCloudFailure,cloudCheckAttempt]);

  useEffect(()=>{
    viewRequest.current=null;setViewError('');setViewReady(null);
    if(!ready||!cloudReady||forkRestoring)return;
    const request={id:crypto.randomUUID(),document:readerDocument,mode:readingMode};viewRequest.current=request;
    send("VIEW_MODE",{mode:readingMode,requestId:request.id});
    return()=>{if(viewRequest.current===request)viewRequest.current=null};
  },[ready,cloudReady,forkRestoring,readingMode,readerDocument,viewAttempt]);
  const viewPending=readingMode==='visual' && (!ready||!cloudReady||forkRestoring||viewReady?.document!==readerDocument||viewReady.mode!=='visual');
  useEffect(()=>{
    if(!viewPending||leaseState!=='active')return;
    const timer=window.setTimeout(()=>setViewError('장면을 불러오는 데 시간이 걸립니다. 연결을 확인한 뒤 다시 시도해 주세요.'),45000);
    return()=>window.clearTimeout(timer);
  },[viewPending,leaseState,readerDocument,viewAttempt]);
  useEffect(() => { let cancelled=false; if (ready) { const provider=textProvider; void (async()=>{const imageApiKey=provider==='openai'?apiKey:await resolveOpenAIImageKey();if(!cancelled)send("SETTINGS",{apiKey,provider,museReasoningEffort,imageApiKey:imageApiKey||'',theme,readingWidth,fontSize,typingSpeed,imageQuality,imageEvery});})();}return()=>{cancelled=true}; }, [ready,apiKey,theme,readingWidth,fontSize,typingSpeed,imageQuality,imageEvery,museReasoningEffort,textProvider,imageKeyRevision]);
  useEffect(() => { if (!ready || !cloudReady || !file) return; let cancelled=false; void entryWait(rememberCortexProjectPackage(projectId,file,owner)).catch(()=>undefined).finally(()=>{if(cancelled)return;send("IMPORT_FILE",{file,projectId,sourceProjectId});onFileConsumed()});return()=>{cancelled=true}; }, [ready,cloudReady,file,onFileConsumed,projectId,sourceProjectId]);
  useEffect(() => { if (!ready || !cloudReady || forkRestoring || file || !projectId) return; let cancelled=false;void(async()=>{if(readyInfo?.restored){send("OFFER_PROJECT",{projectId,sourceProjectId});return}const cached=await entryWait(packageRead.current?.projectId===projectId?packageRead.current.request:readCortexProjectPackage(projectId,owner)).catch(()=>null);if(cancelled)return;if(cached)send("OFFER_FILE",{file:cached,projectId,sourceProjectId});else send("OFFER_PROJECT",{projectId,sourceProjectId});})();return()=>{cancelled=true}; }, [ready,readyInfo,cloudReady,forkRestoring,file,scope,projectId,sourceProjectId]);
  useEffect(() => { if (ready) send("NOTICE", {message:notice}); }, [ready,notice]);
  const continueInSeparateSession = async () => {
    if (forking) return;
    setForking(true);
    setLeaseMessage("");
    try {
      const response = await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}?fork=${Date.now()}`, {cache:"no-store"});
      const result = await response.clone().json().catch(()=>({})) as {snapshot?:Record<string,unknown>;session?:CloudSession;error?:string};
      if (!response.ok && response.status !== 404) throw new Error(result.error || "분기할 클라우드 기록을 불러오지 못했습니다.");
      const id = crypto.randomUUID(), name = `${effectiveSessionName} · 기기 분기`;
      if (result.snapshot) pendingForkSnapshot.current = {scope:id,snapshot:result.snapshot};
      setForkRestoring(Boolean(result.snapshot));
      saveCortexSession({id,projectId,sourceProjectId,name,turn:Number(result.session?.turn || 0),lastPlayedAt:new Date().toISOString()},owner);
      setForkedSession({id,name});
      setReadyInfo(null);
      setCloudCheckedScope("");
      cloudCheckedRef.current = "";
      cloudRevision.current = 0;
      setNotice(result.snapshot
        ? `다른 기기에서 사용 중인 원본을 건드리지 않고 ‘${name}’ 세션으로 복사했습니다.`
        : `원본의 온라인 진행 기록이 없어 ‘${name}’ 세션을 별도로 시작합니다.`);
    } catch (error) {
      setLeaseMessage(error instanceof Error ? error.message : "별도 세션을 준비하지 못했습니다.");
    } finally {
      setForking(false);
    }
  };
  const takeOverOtherDevice = async () => {
    if (forking || leaseState === "taking-over") return;
    setLeaseMessage("");
    try {
      if (!leaseDeviceId.current) leaseDeviceId.current = cortexDeviceId();
      if (!leaseClientId.current) leaseClientId.current = `${leaseDeviceId.current}:${crypto.randomUUID()}`;
      const response = await fetch(`/api/cortex/sessions/${encodeURIComponent(scope)}/lease`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"takeover",deviceId:leaseDeviceId.current,clientId:leaseClientId.current}),
        cache:"no-store",
      });
      const result = await response.clone().json().catch(()=>({})) as {error?:string};
      if (!response.ok) throw new Error(result.error || "다른 기기에 종료 요청을 보내지 못했습니다.");
      takeoverMode.current = true;
      setLeaseState("taking-over");
      setLeaseMessage("다른 기기의 입력을 잠그고 현재 진행을 저장하는 중입니다. 저장이 끝나는 즉시 이 기기에서 이어집니다.");
      setLeaseAttempt(value=>value+1);
    } catch (error) {
      setLeaseState("error");
      setLeaseMessage(error instanceof Error ? error.message : "다른 기기의 세션을 넘겨받지 못했습니다.");
    }
  };
  const choiceAvailable = leaseState === "blocked" || leaseState === "error";
  const resolveSyncConflict=(continueCloud:boolean)=>{
    if(cloudUploadBusy.current||readerBusy.current)return;
    recovery.current={scope,id:'recovery-'+crypto.randomUUID(),continueCloud};
    conflictPending.current=false;setSyncConflict(false);send('CLOUD_EXPORT');
  };
  const leaseTitle = leaseState === "checking"
    ? "다른 기기의 사용 상태를 확인하는 중입니다."
    : leaseState === "blocked"
      ? "이 세션은 다른 기기에서 사용 중입니다."
      : leaseState === "taking-over"
        ? "다른 기기의 진행을 안전하게 넘겨받는 중입니다."
        : leaseState === "yielding"
          ? "이 세션을 다른 기기로 넘기는 중입니다."
          : "세션 사용 상태를 확인하지 못했습니다.";
  return <section className="cortex-reader cortex-reader-native" data-reading-mode={readingMode}>
    {syncConflict && <div className="cortex-entry-state cortex-lease-state" role="alert"><small>단청 · 기록 확인</small><strong>이어 할 기록을 선택해 주세요.</strong><p>클라우드와 이 기기에 서로 다른 기록이 있습니다. 자동으로 분기하거나 어느 쪽도 덮어쓰지 않았습니다.</p><div><button type="button" onClick={()=>resolveSyncConflict(false)}>이 기기 기록을 별도 세션으로 계속</button><button type="button" onClick={()=>resolveSyncConflict(true)}>이 기기 기록 보존 후 클라우드로 이어서</button><button type="button" onClick={onHome}>서재로 돌아가기</button></div></div>}
    {readerStarted && <iframe key={readerDocument} ref={frame} title={readingMode==='visual'?'단청 비주얼노벨':'단청 소설 집필'} src={`/cortex.html?session=${encodeURIComponent(scope)}&cloudAuthority=1&view=${initialFrameMode.current?.mode||'novel'}${owner?'&account='+encodeURIComponent(owner):''}`} style={viewPending?{visibility:'hidden'}:undefined} inert={viewPending} aria-hidden={viewPending||undefined} allow="clipboard-write; fullscreen" onLoad={()=>send("HELLO")} onError={()=>setEntryError("읽기 화면을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.")}/>}
    {readerStarted && !viewPending && cloudSyncPhase !== "idle" && <div style={cloudPosition || {visibility:"hidden"}} className={`cortex-cloud-sync cortex-cloud-sync-${cloudSyncPhase}`}><span aria-hidden="true"/><span className="cortex-cloud-copy" role="status" aria-live="polite" title={cloudSyncPhase==='retry'?cloudFailure:undefined}>{cloudSaveLabel(cloudSyncPhase,saveProgress.saved,saveProgress.current)}</span>{cloudSyncPhase==='retry'&&<button type="button" onClick={retryCloud} aria-label="미저장 변경사항 클라우드 저장 재시도">재시도</button>}</div>}
    {!syncConflict && (readingMode==='visual' && (leaseState==='checking'||leaseState==='active') && (viewPending||entryError) ? <div className="cortex-entry-state cortex-visual-entry" role="status">
      <span className="cortex-visual-entry-mark" aria-hidden="true">丹</span><strong>{entryError||viewError||'장면을 여는 중입니다'}</strong>
      {!entryError&&!viewError&&<span className="cortex-visual-entry-dots" aria-hidden="true"><i/><i/><i/></span>}
      <div>{(entryError||viewError)&&<button type="button" onClick={entryError||!ready||!cloudReady?retryEntry:()=>setViewAttempt(value=>value+1)}>다시 시도</button>}<button type="button" onClick={onHome}>서재로 돌아가기</button></div>
    </div> : leaseState !== "active" ? <div className="cortex-entry-state cortex-lease-state" role="alert"><small>단청 · SESSION LOCK</small><strong>{leaseTitle}</strong><p>{leaseMessage || "같은 세션을 동시에 수정하지 않도록 안전하게 확인합니다."}</p>{choiceAvailable && <><p><b>다른 기기 종료 후 이어서</b>는 상대 기기의 입력을 잠그고 마지막 진행을 저장한 뒤 이 세션 그대로 이어갑니다.</p><p><b>별도 세션으로 계속</b>은 현재 클라우드 기록을 복사해 서로 덮어쓰지 않는 독립 저장 세션으로 시작합니다.</p></>}<div>{choiceAvailable && <button type="button" onClick={takeOverOtherDevice}>다른 기기 종료 후 이어서</button>}{choiceAvailable && <button type="button" onClick={continueInSeparateSession} disabled={forking}>{forking ? "별도 세션 준비 중…" : "별도 세션으로 계속"}</button>}{choiceAvailable && <button type="button" onClick={()=>setLeaseAttempt(value=>value+1)}>다시 확인</button>}<button type="button" onClick={onHome}>서재로 돌아가기</button></div></div> : (!ready || entryError) && <div className="cortex-entry-state" role="status"><small>단청 · CORTEX</small><strong>{entryError || "저장된 이야기를 여는 중입니다."}</strong><p>기존 작품과 진행 기록을 유지한 채 불러옵니다.</p><div>{entryError && <button type="button" onClick={retryEntry}>다시 시도</button>}<button type="button" onClick={onHome}>서재로 돌아가기</button></div></div>)}
    {ready && notice && !syncConflict && !viewPending && <div className="cortex-entry-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice("")}>닫기</button><button type="button" onClick={onHome}>서재</button></div>}
  </section>;
}
