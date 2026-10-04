"use client";
import { canonHud } from './canon-hud';
import { uid, type Project } from './studio-model';
import { Area, Field, Panel, Select, Toggle } from './studio-sections';

export function LegacyHudEffects({project:p,setProject}:{project:Project;setProject:React.Dispatch<React.SetStateAction<Project>>}) {
  const h=canonHud(p), stats=h.stats.filter(s=>s.mode==='event');
  const set=(effects:typeof h.effects)=>setProject(q=>({...q,canonHud:{...canonHud(q),effects}}));
  return <><Panel title="날짜·경과일 · 선택" note="승인된 현재 장면에 날짜가 확인될 때만 표시합니다. 회상·다른 시점·기기의 관측 번호로는 바뀌지 않습니다. 시간은 추측해서 채우지 않습니다.">
    <Toggle label="상태창에 날짜·경과일 표시" checked={!!h.timeline} onChange={on=>setProject(q=>({...q,canonHud:{...canonHud(q),timeline:on?{startDate:'',cycleStatId:''}:undefined}}))}/>
    {h.timeline&&<><Field label="세계의 시작 날짜" type="date" value={h.timeline.startDate} onChange={startDate=>setProject(q=>({...q,canonHud:{...canonHud(q),timeline:{...h.timeline!,startDate}}}))}/><Select label="되감김을 기록할 회차 스탯 · 선택" value={h.timeline.cycleStatId} onChange={cycleStatId=>setProject(q=>({...q,canonHud:{...canonHud(q),timeline:{...h.timeline!,cycleStatId}}}))} options={[{value:'',label:'되감김 없음'},...stats.map(s=>({value:s.id,label:s.label||'이름 없는 수치'}))]}/></>}
  </Panel><Panel title="점수 변화 · 원본 사건 유지" note="계획·인용·회상이 아니라 해당 사건의 승인된 본문에서 실제 성립할 때만 조건마다 한 번 적용합니다. 재시도·복원은 중복 가산하지 않습니다." actions={<button className="soft-button" disabled={!stats.length} onClick={()=>set([...h.effects,{id:uid('HUD_EFFECT'),eventId:'',statId:stats[0].id,criterion:'',amount:1}])}>＋ 변화 조건 추가</button>}>
    {h.effects.map(e=>{const patch=(v:Partial<typeof e>)=>set(h.effects.map(x=>x.id===e.id?{...x,...v}:x));return <article className="canon-card" key={e.id}>
      <Select label="적용할 사건" value={e.eventId} onChange={eventId=>patch({eventId})} options={[{value:'',label:'사건 선택'},...p.events.filter(x=>x.kind!=='constraint').map(x=>({value:x.id,label:x.name}))]}/>
      <Select label="변경할 수치" value={e.statId} onChange={statId=>patch({statId})} options={stats.map(s=>({value:s.id,label:s.label||'이름 없는 수치'}))}/>
      <Area label="실제 발생 조건" value={e.criterion} onChange={criterion=>patch({criterion})} placeholder="주인공이 실제로 시간을 되감아 같은 날짜의 아침으로 돌아왔다. 계획·과거 회상·다른 인물이나 기기의 회차는 제외한다."/>
      <Field label="변화량" type="number" value={e.amount} onChange={v=>patch({amount:Number(v)})}/>
      <button className="soft-button danger-button" onClick={()=>set(h.effects.filter(x=>x.id!==e.id))}>변화 조건 삭제</button>
    </article>})}
    {!h.effects.length&&<p>예: 현재 회차 · 시작 1 · 단위 회차. 실제 되감김 사건마다 +1을 지정하세요. 날짜·경과일은 임의 점수로 계산하지 않습니다.</p>}
  </Panel></>;
}
