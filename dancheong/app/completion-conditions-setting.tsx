"use client";
import { useEffect, useState } from "react";

const key = "dancheong:show-completion-conditions";
export function CompletionConditionsSetting() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { try { setEnabled(localStorage.getItem(key) === "true"); } catch {} }, []);
  return <section className="generation-control-card">
    <div className="generation-control-copy">
      <strong>종결조건 표시</strong>
      <small>활성 사건의 종결조건을 표시합니다. 꺼 두어도 두 번째 연장비트 전에는 조건을 안내합니다.</small>
    </div>
    <label style={{display:"flex", alignItems:"center", gap:10, minHeight:44, cursor:"pointer"}}>
      <input type="checkbox" role="switch" aria-label="종결조건 표시" style={{width:20,height:20,minHeight:20,padding:0,accentColor:"#2f6354"}} checked={enabled} onChange={event => {
        const next = event.target.checked;
        setEnabled(next);
        try { localStorage.setItem(key, String(next)); } catch {}
        document.querySelectorAll("iframe").forEach(frame => frame.contentWindow?.postMessage({source:"dancheong-reader-preferences", showCompletionConditions:next}, location.origin));
      }}/>
      <span>{enabled ? "표시" : "숨김"}</span>
    </label>
  </section>;
}
