"use client";
import { useRouter } from 'next/navigation';
import { useEffect,useState,type ReactNode } from 'react';
import { NexusSiteNav } from '../../app/components/nexus-site-nav';
export function JieumShell({children,flush}:{children:ReactNode;flush:()=>Promise<void>}){
  const router=useRouter();
  const [theme,setTheme]=useState('light'),[name,setName]=useState('Relay ID'),[notice,setNotice]=useState('');
  useEffect(()=>{const syncTheme=()=>{try{const saved=JSON.parse(localStorage.getItem('relay-nexus-appearance-v1')||'{}');setTheme(saved.theme==='dark'?'dark':'light')}catch{}};syncTheme();window.addEventListener('storage',syncTheme);void fetch('/api/account',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(a=>{if(a?.authenticated)setName(a.displayName||'Relay 사용자')}).catch(()=>{});['/','/jieum','/neoreum','/multiplayer'].forEach(route=>router.prefetch(route));return()=>window.removeEventListener('storage',syncTheme)},[router]);
  const navigate=async(href:string)=>{try{await flush();router.push(href);return true}catch{setNotice('저장을 완료하지 못했습니다. 작업을 파일로 내보낸 뒤 이동해 주세요.');return false}};
  return <div className={`jieum-route nexus-library-shell theme-${theme}`}><div className="library-home"><NexusSiteNav active="jieum" accountName={name} onAccount={()=>void navigate('/?panel=account')} onSettings={()=>void navigate('/?panel=settings')} onNavigate={navigate}/></div>{notice&&<p role="alert" className="jieum-shell-notice">{notice}</p>}{children}</div>;
}
