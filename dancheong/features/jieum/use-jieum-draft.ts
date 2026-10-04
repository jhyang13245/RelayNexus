import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { JieumConflictError, loadJieumDraft, saveJieumDraft } from '../../lib/jieum-store';
import { makeProjectForPackageTarget, makeNewStudioProject, normalizeProject, reviveProjectImageUrls, type Project } from './studio-model';

export function useJieumDraft() {
  const [project,setState]=useState<Project>(()=>makeProjectForPackageTarget('cortex','intelligent_canon',false));
  const [ready,setReady]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const current=useRef(project),revision=useRef(0),queue=useRef<Promise<unknown>>(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),blocked=useRef(false),lastSaved=useRef<Project|null>(null);
  const cancel=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null};
  const commit=useCallback((next:Project,handoffId?:string)=>{
    cancel();setSaved(false);
    const work=queue.current.then(async()=>{
      if(blocked.current)throw new JieumConflictError();
      revision.current=await saveJieumDraft(next,revision.current,handoffId);lastSaved.current=next;
      setSaved(current.current===next);setError('');
    });
    queue.current=work.catch(e=>{setError(e instanceof Error?e.message:'저장에 실패했습니다.');setSaved(false);if(e instanceof JieumConflictError){blocked.current=true;setConflict(true)}});
    return work;
  },[]);
  useEffect(()=>{let active=true;void loadJieumDraft<Project>().then(record=>{
    if(!active)return;revision.current=record?.revision??0;const next=record?reviveProjectImageUrls(normalizeProject(record.project)):makeNewStudioProject();
    current.current=next;lastSaved.current=record?next:null;setState(next);setReady(true);setSaved(Boolean(record));
  }).catch(e=>{if(active)setError('저장된 작업을 읽지 못했습니다. 덮어쓰지 않고 대기합니다. '+String(e.message||e))});return()=>{active=false;cancel()}},[]);
  const setProject=useCallback((value:SetStateAction<Project>)=>{
    if(blocked.current)return;
    setState(before=>{const next=typeof value==='function'?value(before):value;current.current=next;return next});setSaved(false);
  },[]);
  useEffect(()=>{if(!ready||conflict||lastSaved.current===project)return;setSaved(false);timer.current=setTimeout(()=>{void commit(project).catch(()=>{})},350);return cancel},[project,ready,conflict,commit]);
  const flush=useCallback(async()=>{cancel();await queue.current;if(lastSaved.current!==current.current)await commit(current.current)},[commit]);
  const replace=useCallback(async(next:Project,handoffId?:string)=>{await commit(next,handoffId);current.current=next;lastSaved.current=next;setState(next);setSaved(true)},[commit]);
  useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(ready&&lastSaved.current!==current.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent)},[ready]);
  return {project,setProject,ready,saved,error,conflict,flush,replace};
}
