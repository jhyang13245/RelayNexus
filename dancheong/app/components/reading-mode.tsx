"use client";
import {useSyncExternalStore} from 'react';
import {BookOpen,Clapperboard,Check} from 'lucide-react';
export type ReadingMode='novel'|'visual';
const key='dancheong-reading-mode-v1',event='dancheong-reading-mode';
let memoryMode:ReadingMode|null=null;
const read=():ReadingMode=>{if(memoryMode)return memoryMode;try{return localStorage.getItem(key)==='visual'?'visual':'novel'}catch{return 'novel'}};
const subscribe=(notify:()=>void)=>{window.addEventListener(event,notify);return()=>window.removeEventListener(event,notify)};
export function useReadingMode(){
  // New client-mounted players read the selected mode on their first render;
  // the server snapshot keeps the library's initial hydration deterministic.
  const mode=useSyncExternalStore(subscribe,read,():ReadingMode=>'novel');
  const select=(value:ReadingMode)=>{try{localStorage.setItem(key,value);memoryMode=null}catch{memoryMode=value}window.dispatchEvent(new Event(event))};
  return [mode,select] as const;
}
export function ReadingModeChoice(){
  const [mode,select]=useReadingMode();
  return <div className="reading-mode-choice">
    <div className="reading-mode-heading"><span>플레이 모드</span><small>플레이 중에도 전환 가능</small></div>
    <div className="reading-mode-options" role="group" aria-label="플레이 모드">
      <button type="button" aria-label="소설" aria-pressed={mode==='novel'} onClick={()=>select('novel')}>
        <BookOpen aria-hidden="true" className="reading-mode-icon"/>
        <span><strong>소설</strong><small>문장에 집중하는 읽기</small></span>
        <Check aria-hidden="true" className="reading-mode-check"/>
      </button>
      <button type="button" aria-label="비주얼노벨" aria-pressed={mode==='visual'} onClick={()=>select('visual')}>
        <Clapperboard aria-hidden="true" className="reading-mode-icon"/>
        <span><strong>비주얼노벨</strong><small>장면과 음성으로 플레이</small></span>
        <Check aria-hidden="true" className="reading-mode-check"/>
      </button>
    </div>
  </div>;
}
