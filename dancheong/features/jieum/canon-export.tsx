"use client";
import {useState} from 'react';
import {Panel,PageFrame} from './studio-sections';
import {validateProject,type Project} from './studio-model';
import {exportScenarioPack} from './studio-export';
import {saveProjectFile} from './project-file';
export function CanonExport({project,notify,go}:{project:Project;notify:(s:string)=>void;go:(s:any)=>void}){
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState('');
 const issues=validateProject(project),errors=issues.filter(i=>i.severity==='error');
 const target=(a:string)=>/캐릭터 불변식/.test(a)?'invariants':/캐릭터|인물/.test(a)?'characters':/스탯|자원/.test(a)?'stats':/세계관|보호/.test(a)?'world':/프로젝트/.test(a)?'dashboard':/도입|시작|서술/.test(a)?'direction':'story';
 const run=async()=>{setBusy(true);setProgress('패키지를 만드는 중');try{const result=await exportScenarioPack(project,true,{acknowledgeEmptyProtection:true,acknowledgeUnsupportedPolicy:true,onImageProgress:()=>setProgress('이미지를 패키지에 담는 중')});void result;setProgress('패키지 다운로드를 시작했습니다.');notify('패키지를 만들었습니다.');}catch(e){setProgress((e as Error).message)}finally{setBusy(false)}};
 return <PageFrame eyebrow="PUBLISH" title="검증·내보내기" description="작품을 확인하고 단청에서 읽을 패키지로 저장하세요."><Panel title={errors.length?`수정할 항목 ${errors.length}개`:'패키지를 만들 준비가 되었습니다'}><div className="page-actions"><button className="primary-button" disabled={busy||!!errors.length} onClick={()=>void run()}>패키지 ZIP 저장</button><button className="soft-button" disabled={busy} onClick={()=>void saveProjectFile(project).catch(e=>notify(e.message))}>작업 JSON 저장</button></div><p role="status">{progress}</p><p>ZIP에는 작품 설정과 내장 이미지, 다시 편집할 원본이 함께 들어갑니다.</p></Panel><Panel title="작품 확인">{errors.map((i,n)=><div className="canon-issue" key={n}><p>{i.message}</p><button className="soft-button" onClick={()=>go(target(i.area))}>수정하러 가기</button></div>)}{!errors.length&&<p>필수 입력과 사건 연결 검사에서 오류가 발견되지 않았습니다.</p>}<details className="jieum-extra"><summary>추가 안내 {issues.length-errors.length}개</summary>{issues.filter(i=>i.severity!=='error').map((i,n)=><p key={n}>{i.message}</p>)}</details></Panel></PageFrame>;
}
