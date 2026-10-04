import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';

test('chat paints pending immediately, preserves next draft and retries failed message with same identity',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.matchMedia=(()=>({matches:true})) as any;
 Object.assign(dom.window.HTMLDialogElement.prototype,{showModal(){this.open=true},close(){this.open=false}});
 const exports:any={},calls:any[]=[];let resolve!:()=>void,reject!:(e:Error)=>void;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/multiplayer/room-chat.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:createRequire(import.meta.url),crypto:webcrypto,window:dom.window});
 const root=createRoot(dom.window.document.getElementById('root')!);
 try{
  await act(async()=>root.render(React.createElement(exports.RoomChat,{open:true,onClose(){},messages:[],error:'',participants:[],onSend:(body:string,id:string)=>{calls.push({body,id});return new Promise<void>((yes,no)=>{resolve=yes;reject=no})}})));
  const input=dom.window.document.querySelector('textarea')!;
  // Invoke React's event handler directly to avoid jsdom's pre-import input event detection.
  const props=()=> (input as any)[Object.keys(input).find(k=>k.startsWith('__reactProps'))!];
  const type=async(value:string)=>act(async()=>props().onChange({target:{value}}));
  const submit=async()=>act(async()=>dom.window.document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await type('첫 메시지');await submit();
  assert.equal(input.value,'');assert.equal(input.disabled,false);
  assert.match(dom.window.document.querySelector('article')!.textContent!,/첫 메시지/);
  await type('다음 메시지');await act(async()=>reject(Error('연결 오류')));
  assert.equal(input.value,'다음 메시지');assert.match(dom.window.document.querySelector('article')!.textContent!,/전송 실패/);
  await act(async()=> (dom.window.document.querySelector('article button') as HTMLButtonElement).click());
  assert.deepEqual(calls[1],calls[0]);await act(async()=>resolve());
  assert.equal(input.value,'다음 메시지');assert.equal(dom.window.document.querySelector('article'),null);
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close()}
});
