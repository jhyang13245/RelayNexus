import {jieumDraftSchema} from '../../features/jieum/generated-draft';
export function draftFixture(mode:'intelligent_canon'|'instant_story'='intelligent_canon'){
 const materialize=(s:any):any=>s.type==='object'?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,materialize(v)])):s.type==='array'?Array.from({length:s.minItems||0},()=>materialize(s.items)):s.enum?s.enum[0]:s.type==='boolean'?false:s.type==='number'?0:'';
 const d=materialize(jieumDraftSchema(mode));Object.assign(d,{title:'유리 도서관',genre:'학원 미스터리',startDate:'2026-03-02',startLocation:'학교 도서관',world:'밤이면 유리 책장에 사라진 책들이 돌아오는 학교.',privateWorld:'사서는 책의 주인이다. 마지막 편지를 읽기 전에는 밝히지 않는다.'});
 Object.assign(d.player,{id:'PLAYER',name:'윤서',publicInfo:'조용한 신입생. 실종된 친구를 찾고 있다.',appearance:'검은 머리와 회색 교복.'});
 Object.assign(d.opening,{time:'12:00:00',situation:'도서관 입구에서 분실된 편지를 발견했다.',prologue:'유리문이 열렸다. 책상 위에 편지 한 통이 놓여 있었다.',replies:['편지를 살핀다.','사서에게 묻는다.','책장 뒤를 조사한다.']});
 if(mode==='intelligent_canon'){const r=d.routes[0];r.id='r1';r.name='첫 번째 편지';r.authorComment='편지를 따라 첫 이야기를 시작합니다.';const e=r.events[0];e.id='A';e.name='유리 책장';e.description='책장의 편지를 확인하고 사서에게 돌려준다.';e.required=true;e.closureConditions=[{id:'a_goal',text:'윤서가 편지를 사서에게 돌려준다.'}];}
 return d;
}
