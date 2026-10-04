import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const code=fs.readFileSync('public/cortex-nexus-view.js','utf8');
const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window as any;
w.eval(code.slice(code.indexOf('window.NexusDialogue ='),code.indexOf('// Reader-owned follow state.')));
test.after(()=>dom.window.close());
const binding=(offset:number,name:string,quoteText:string,extra={})=>({offset,speakerName:name,quoteText,bindingVersion:2,source:'WRITER_PUBLIC_NAME',...extra});
const names=(text:string,annotations:any[],options={streaming:true})=>Array.from(w.NexusDialogue.resolve(text,annotations,[],()=>true,options),(r:any)=>r.row?.visible.name||null);

test('identical utterances retain the explicit speaker at every streaming character',()=>{
 const text='“네.”\n\n“네.”\n\n“네.”',annotations=[binding(0,'민서','“네.”'),binding(6,'지훈','“네.”'),binding(12,'경비원','“네.”')];
 for(let end=1;end<=text.length;end++)assert.deepEqual(names(text.slice(0,end),annotations),['민서','지훈','경비원'].slice(0,end<=6?1:end<=12?2:3),`visible chars ${end}`);
 assert.deepEqual(names(text,annotations,{streaming:false}),['민서','지훈','경비원']);
});

test('a future annotation cannot label an earlier unbound identical quote',()=>{
 const text='“네.”\n\n“네.”';
 for(let end=1;end<=6;end++)assert.deepEqual(names(text.slice(0,end),[binding(6,'지훈','“네.”')]),[null]);
 assert.deepEqual(names(text,[binding(6,'지훈','“네.”')]),[null,'지훈']);
});

test('an explicit registered alias paints without exposing its private identity or image',()=>{
 const a=binding(0,'장신 남자','“이쪽이다.”',{source:'WRITER_CHARACTER_ALIAS',characterId:'NPC_HIDDEN'});
 assert.deepEqual(names('“',[a]),['장신 남자']);
 const row=w.NexusDialogue.resolve('“이쪽',[a],[],()=>true,{streaming:true})[0].row;
 assert.deepEqual(JSON.parse(JSON.stringify(row.person)),{});assert.equal(row.visible.referenceMode,'NONE');
 assert.equal(w.NexusDialogue.resolve('“이쪽',[a],[],()=>false,{streaming:true})[0].row,null,'image resolver never uses label-only fallback');
});

test('explicit speech classification is stable while surrounding prose arrives',()=>{
 const text='메모에 적혀 있었다. “내가 썼어.”',at=text.indexOf('“'),a=binding(at,'민서','“내가 썼어.”');
 assert.deepEqual(names(text,[a]),['민서']);
 assert.deepEqual(names(text,[{...a,source:'WRITER_NON_SPEECH_QUOTE',quoteKind:'NON_SPEECH'}]),[null]);
 assert.deepEqual(names(text,[{...a,bindingVersion:undefined}]),[null],'legacy written-quote guard remains');
});

test('ambiguous conflicting bindings and malformed labels fail closed',()=>{
 assert.deepEqual(names('“안녕.”',[binding(0,'민서','“안녕.”'),binding(0,'지훈','“안녕.”')]),[null]);
 for(const name of ['NPC_SECRET','<img>','민서\n지훈'])assert.deepEqual(names('“안녕.”',[binding(0,name,'“안녕.”')]),[null]);
 assert.deepEqual(names('“안녕.”',[binding(0,'민서','“안녕.”',{bindingInvalid:true})]),[null]);
});

test('adjacent speech, nested quoted words and untagged prose do not invent speakers',()=>{
 const text='“그가 \'먼저 가\'라고 했어.”“응.”';
 assert.deepEqual(names(text,[binding(0,'서연',text.slice(0,text.indexOf('”')+1)),binding(text.indexOf('”“')+1,'경비원','“응.”')]),['서연','경비원']);
 assert.deepEqual(names('아침(바쁜 시간)이었다. 민서가 “가자.”라고 했다.',[]),[null]);
});
