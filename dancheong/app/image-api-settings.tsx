'use client';
import {useEffect,useRef,useState} from 'react';
import {deviceTextProvider} from '../lib/text-provider';
import {forgetRememberedApiKey,rememberApiKeyOnDevice} from '../lib/api-key-vault';
import {OPENAI_IMAGE_KEY_CHANGED,applyOpenAIImageKey,resolveOpenAIImageKey} from '../lib/openai-image-key';
import {OpenAIApiGuide} from './openai-api-guide';

export function ImageApiSettings({onGuide}:{onGuide:()=>void}) {
  const [provider,setProvider]=useState(deviceTextProvider),[draft,setDraft]=useState(''),[applied,setApplied]=useState(false),[show,setShow]=useState(false),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const edited=useRef(false);
  useEffect(()=>{let live=true;const load=()=>{void resolveOpenAIImageKey().then(key=>{if(live&&!edited.current){setDraft(key);setApplied(Boolean(key))}})};const change=()=>{setProvider(deviceTextProvider());setShow(false);load()};window.addEventListener('dancheong-provider-change',change);window.addEventListener(OPENAI_IMAGE_KEY_CHANGED,load);load();return()=>{live=false;window.removeEventListener('dancheong-provider-change',change);window.removeEventListener(OPENAI_IMAGE_KEY_CHANGED,load)}},[]);
  const save=async()=>{
    const key=draft.trim();if(!key||busy)return;
    if(!key.startsWith('sk-')||key.length>512||/\s/u.test(key)){setMessage('OpenAI에서 발급한 API 키를 확인해 주세요.');return}
    setBusy(true);let note='이번 탭에서만 유지됩니다.';
    try {
      if(remember){try{await rememberApiKeyOnDevice(key,'openai');note='이 기기에 암호화하여 기억했습니다.'}catch{setRemember(false);note='암호화 저장을 사용할 수 없어 이번 탭에서만 유지됩니다.'}}
      else await forgetRememberedApiKey('openai');
      applyOpenAIImageKey(key);setApplied(true);setShow(false);setMessage(`이미지 생성용 키를 적용했습니다. ${note} 실제 생성 시 권한과 잔액을 확인합니다.`);
    }catch{setMessage('키를 저장하지 못했습니다. 다시 시도해 주세요.')}finally{setBusy(false)}
  };
  const remove=async()=>{setBusy(true);try{await forgetRememberedApiKey('openai');applyOpenAIImageKey('');setDraft('');setApplied(false);setShow(false);setMessage('OpenAI 키를 제거했습니다. Go 본문 연결은 그대로 유지됩니다.')}catch{setMessage('키를 제거하지 못했습니다. 다시 시도해 주세요.')}finally{setBusy(false)}};
  if(provider==='openai')return null;
  return <section className="image-api-settings" aria-labelledby="image-api-title">
    <header><div><small>OPTIONAL · OPENAI</small><h3 id="image-api-title">이미지 생성 API <span>선택</span></h3></div><span className="image-api-state">{applied?'키 적용됨':'미설정'}</span></header>
    <p>입력하지 않아도 본문 플레이와 내장 이미지는 이용할 수 있습니다. 새 이미지 생성만 OpenAI에서 별도 과금됩니다.</p>
    <OpenAIApiGuide onGuide={onGuide}/>
    <div className="api-key-field"><label htmlFor="openai-image-api-key">이미지 생성용 OpenAI API Key</label><div><input id="openai-image-api-key" type={show?'text':'password'} value={draft} onChange={e=>{edited.current=true;setDraft(e.target.value);setMessage('')}} placeholder="sk-…" autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy}/><button type="button" disabled={!draft||busy} onClick={()=>setShow(!show)}>{show?'숨기기':'표시'}</button></div><small>기존 OpenAI 키가 있으면 재사용합니다. Go 키와 분리해 보관하며 다른 기기로 동기화하지 않습니다.</small></div>
    <label className="remember-key-option"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} disabled={busy}/><span><strong>이 기기에서 이미지 API 키 기억</strong><small>체크하지 않고 적용하면 이번 탭에서만 사용합니다.</small></span></label>
    {message&&<p role="status" className="image-api-message">{message}</p>}
    <div className="settings-actions">{applied&&<button type="button" className="disconnect-button" disabled={busy} onClick={()=>void remove()}>이미지 키 제거</button>}<button type="button" className="connect-button" disabled={!draft.trim()||busy} onClick={()=>void save()}>{busy?'적용 중…':'이미지 키 적용'}</button></div>
  </section>;
}
