"use client";
import type { Project } from './studio-model';
import { uid } from './studio-model';
import { Area, Field, PageFrame, Panel, Select, Toggle } from './studio-sections';
import { canonDesign, type CanonDesign } from './canon-design';
import { canonHud } from './canon-hud';
import { LegacyHudEffects } from './legacy-hud-effects';
import { worldProse,updateWorldProse,privateWorldProse,updatePrivateWorldProse } from './world-prose';
type Setter=React.Dispatch<React.SetStateAction<Project>>;
export function updateCanon(setProject:Setter,patch:Partial<CanonDesign>){setProject(p=>({...p,canonDesign:{...canonDesign(p),...patch}}));}
export const viewpoints=[
  ['3인칭 제한 시점','지훈은 잠긴 문 앞에서 멈췄다. 안에서 들린 소리가 마음에 걸렸다.'],
  ['1인칭 주인공 시점','나는 잠긴 문 앞에서 멈췄다. 안에서 무슨 일이 벌어지는 걸까.'],
  ['3인칭 관찰자 시점','지훈은 문고리를 돌렸다가 놓았다. 문틈으로 불빛이 새어 나왔다.'],
  ['전지적 작가 시점','지훈은 문 앞에서 망설였고, 안에 있던 레나는 그가 돌아가기를 바랐다.'],
];
export const proseStyles=[
  ['작품에 맞게','설정과 시작 본문의 분위기를 이어서 씁니다.'],
  ['현실주의 소설','젖은 교복 소매가 손목에 달라붙었다. 지훈은 가방에서 구겨진 안내문을 꺼냈다.'],
  ['문학적 소설','문은 닫혀 있었지만, 돌아갈 곳이 없다는 감각은 이미 그 틈을 지나왔다.'],
  ['장르소설','문 안쪽에서 금속이 부딪쳤다. 지훈은 숨을 죽이고 벽에 등을 붙였다.'],
  ['비주얼 노벨','“기다렸어.” 레나가 문을 열었다. “들어올 거야?”'],
  ['라이트 노벨','입학 첫날부터 비밀의 문이라니. 평범한 학교생활이라는 계획은 벌써 틀어진 것 같았다.'],
];
export function CanonWorldSection({project:p,setProject}:{project:Project;setProject:Setter}){
  const rules=[p.world.fixedCanon,p.world.impossibilities,p.world.aiFillConstraints,p.aiWorldContext.protectedCanon,p.aiWorldContext.avoidElements].filter(Boolean).join('\n\n');
  return <PageFrame eyebrow="SETTING BOOK" title="세계관" description="이야기에 필요한 배경과 규칙을 자유롭게 적으세요.">
    <Panel title="세계관" note="역사·정치·경제·종교·문화·기술·능력 등 필요한 분야를 함께 적으면 배경이 풍부해집니다. 모두 채울 필요는 없습니다."><Area label="세계관 설정" value={worldProse(p.world)} onChange={v=>setProject(q=>({...q,world:updateWorldProse(q.world,v)}))} placeholder="서울의 평범한 학교 아래에는 능력을 연구하는 시설이 있다. 학생들은 그 존재를 모른다."/></Panel>
    <Panel title="비공개 세계관" note="숨은 진실과 공개 조건을 함께 적으세요. 독자에게 직접 표시하지 않습니다."><Area label="작가만 참고할 설정" value={privateWorldProse(p.gmData)} onChange={v=>setProject(q=>({...q,gmData:updatePrivateWorldProse(q.gmData,v)}))} placeholder="교장은 실종 사건의 배후다. 지하 기록을 발견하기 전에는 정체를 밝히지 않는다."/></Panel>
    <Panel title="추가 참고 · 선택"><details className="jieum-extra"><summary>공개 전 보호할 이름 · 선택</summary><Area label="보호어" value={p.disclosure.protectedTerms.join("\n")} onChange={v=>setProject(q=>({...q,disclosure:{...q.disclosure,protectedTerms:v.split("\n").map(x=>x.trim()).filter(Boolean)}}))} placeholder="아직 드러나면 안 되는 고유한 이름을 한 줄에 하나씩 적으세요. 비워 두어도 됩니다."/></details><Area label="반드시 지킬 규칙" value={rules} onChange={v=>setProject(q=>({...q,world:{...q.world,fixedCanon:v,impossibilities:'',aiFillConstraints:''},aiWorldContext:{...q.aiWorldContext,protectedCanon:'',avoidElements:''}}))} placeholder="능력으로 죽은 사람을 되살릴 수 없다. 이미 공개된 사건의 결과는 바꾸지 않는다."/><Area label="참고 작품·자료" value={[p.aiWorldContext.premise,p.aiWorldContext.referenceFramework,p.aiWorldContext.localContext].filter(Boolean).join('\n\n')} onChange={v=>setProject(q=>({...q,aiWorldContext:{...q.aiWorldContext,enabled:!!v.trim(),premise:v,referenceFramework:'',localContext:''}}))} placeholder="참고할 작품과 시점, 적용할 설정을 적으세요. 예: 원작 1권까지의 설정을 사용하되 배경은 현대 서울로 옮긴다."/></Panel>
  </PageFrame>;
}
export function CanonDirectionSection({project:p,setProject}:{project:Project;setProject:Setter}){
 const d=canonDesign(p),set=(patch:Partial<CanonDesign>)=>updateCanon(setProject,patch);
 return <PageFrame eyebrow="OPENING & NARRATION" title="도입부 및 서술 설정" description="독자가 처음 읽을 장면과 작품의 문장 결을 정하세요.">
  <Panel title="도입부"><Area label="시작 본문 · 선택" value={d.openingText} onChange={openingText=>set({openingText})} placeholder="입학식이 끝난 지 열여덟 분. 배정받은 방의 문이 복도 쪽으로 쓰러져 있었다."/><Area label="시작 상황" value={d.openingSituation} onChange={openingSituation=>set({openingSituation})} placeholder="입학 첫날 낮 12시, 기숙사 205호 앞. 주인공은 쓰러진 문을 발견했고 시설팀은 아직 도착하지 않았다."/>
  <div className="canon-replies">{['작은 파동','중간 파동','큰 파동'].map((label,i)=><Field key={label} label={label} value={d.replies[i]||''} onChange={v=>set({replies:[0,1,2].map(j=>j===i?v:d.replies[j]||'')})} placeholder={['문을 건드리지 않고 주변을 살핀다.','레나에게 무슨 일이 있었는지 묻는다.','문 안으로 들어가 직접 확인한다.'][i]}/>)}</div></Panel>
  <Panel title="서술 설정"><Select label="서술 시점" value={d.viewpoint} options={viewpoints.map(([value])=>({value,label:value}))} onChange={viewpoint=>set({viewpoint})}/><p className="canon-sample">{viewpoints.find(([v])=>v===d.viewpoint)?.[1]}</p><Select label="문장 스타일" value={d.proseStyle} options={proseStyles.map(([value])=>({value,label:value}))} onChange={proseStyle=>set({proseStyle})}/><p className="canon-sample">{proseStyles.find(([v])=>v===d.proseStyle)?.[1]}</p><p>예문은 설명용입니다. 어떤 시점에서도 비공개 설정의 공개 조건과 플레이어의 선택을 지킵니다.</p><Area label="추가 서술 요청 · 선택" value={d.extraStyle} onChange={extraStyle=>set({extraStyle})} placeholder="대화는 짧고 자연스럽게, 전투에서는 거리와 행동의 인과를 분명히 표현해 주세요."/></Panel>
 </PageFrame>;
}
export function CanonStatsSection({project:p,setProject}:{project:Project;setProject:Setter}){
 const additive=!p.canonDesign;
 const d=additive?canonHud(p):canonDesign(p),set=(stats:CanonDesign['stats'])=>additive?setProject(q=>({...q,canonHud:{...canonHud(q),stats}})):updateCanon(setProject,{stats});
 return <PageFrame eyebrow="STATS & RESOURCES" title="스탯·자원" description="작품에 필요한 수치만 추가하세요. 공개한 수치는 독자의 상태창에 표시됩니다.">
 <Panel title="작품의 수치" actions={<button className="soft-button" disabled={d.stats.length>=7} onClick={()=>set([...d.stats,{id:uid('STAT'),label:'',characterId:p.player.id,initial:0,minimum:0,maximum:100,unit:'',visible:true,mode:'event',increaseWhen:'',decreaseWhen:''}])}>＋ 수치 추가</button>}>
 {!d.stats.length&&<p>수치는 선택 사항입니다. 호감도·신뢰도 또는 령주·탄약처럼 꼭 관리할 항목만 추가하세요.</p>}
 {d.stats.map(s=>{const patch=(v:Partial<typeof s>)=>set(d.stats.map(x=>x.id===s.id?{...x,...v}:x));return <article className="canon-card" key={s.id}><div className="field-row"><Field label="이름" value={s.label} onChange={label=>patch({label})} placeholder="레나 신뢰도, 령주"/><Select label="대상 인물" value={s.characterId} onChange={characterId=>patch({characterId})} options={[p.player,...p.npcs].map(c=>({value:c.id,label:c.name}))}/></div><Select label="변화 방식" value={s.mode} onChange={mode=>patch({mode:mode as typeof s.mode})} options={[{value:'event',label:'사건별 점수 · 조건마다 한 번'},{value:'resource',label:'자원 · 본문에서 사용·획득한 수량'}]}/><div className="canon-values">{(['initial','minimum','maximum'] as const).map((k,i)=><Field key={k} label={['시작값','최솟값','최댓값'][i]} type="number" value={s[k]} onChange={v=>patch({[k]:Number(v)})}/>)}<Field label="단위 · 선택" value={s.unit} onChange={unit=>patch({unit})} placeholder="획, 개, 원"/></div>{s.mode==='event'?<p>증감 조건과 변화량은 ‘점수 변화’에서 작성합니다. 실제 공개본문에서 성립한 조건만 한 번 반영됩니다.</p>:<><Area label="획득·회복 규칙" value={s.increaseWhen} onChange={increaseWhen=>patch({increaseWhen})} placeholder="양도받거나 회복한 수량만큼 증가한다. 단순한 언급이나 회상은 제외한다."/><Area label="소모·감소 규칙" value={s.decreaseWhen} onChange={decreaseWhen=>patch({decreaseWhen})} placeholder="실제로 명령을 내릴 때 1획을 소모한다. 남은 수량을 초과해 사용할 수 없다."/></>}<Toggle label="독자에게 표시" checked={s.visible} onChange={visible=>patch({visible})}/><Toggle label="첫 변화가 확정된 뒤 공개" checked={!!s.revealWhenChanged} onChange={revealWhenChanged=>patch({revealWhenChanged})}/><button className="soft-button danger-button" onClick={()=>set(d.stats.filter(x=>x.id!==s.id))}>수치 삭제</button></article>})}</Panel>{additive&&<LegacyHudEffects project={p} setProject={setProject}/>}</PageFrame>;
}
export function CanonFactionsSection({project:p,setProject}:{project:Project;setProject:Setter}){
 return <PageFrame eyebrow="FACTIONS" title="세력" description="관계는 캐릭터 설정에, 조직의 목표와 활동은 여기에 적으세요."><Panel title="세력 · 선택" actions={<button className="soft-button" onClick={()=>setProject(q=>({...q,factions:[...q.factions,{id:uid('FAC'),name:'',leader:'',officialGoal:'',hiddenGoal:'',resources:'',territory:'',income:'',militaryPower:'',intelligencePower:'',politicalPower:'',internalConflict:'',allies:'',enemies:'',playerRelation:'',currentPlan:''}]}))}>＋ 세력 추가</button>}>{p.factions.map(f=><article className="canon-card" key={f.id}><Field label="이름" value={f.name} onChange={name=>setProject(q=>({...q,factions:q.factions.map(x=>x.id===f.id?{...x,name}:x)}))} placeholder="기성학원 학생회"/><Area label="세력 설정" value={Object.entries(f).filter(([k,v])=>!['id','name','hiddenGoal'].includes(k)&&v).map(([,v])=>v).join('\n\n')} onChange={officialGoal=>setProject(q=>({...q,factions:q.factions.map(x=>x.id===f.id?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='officialGoal'?officialGoal:['id','name','hiddenGoal'].includes(k)?v:''])) as typeof f:x)}))} placeholder="학생들의 자치 조직. 회장 레나를 중심으로 교내 사건을 조사하며 교사진과 자주 충돌한다."/><Area label="비공개 설정 · 선택" value={f.hiddenGoal} onChange={hiddenGoal=>setProject(q=>({...q,factions:q.factions.map(x=>x.id===f.id?{...x,hiddenGoal}:x)}))} placeholder="회장은 실종된 전임 학생회장의 행방을 몰래 찾고 있다."/><button className="soft-button danger-button" onClick={()=>setProject(q=>({...q,factions:q.factions.filter(x=>x.id!==f.id)}))}>세력 삭제</button></article>)}</Panel></PageFrame>;
}
