import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import worker from '../dist/server/index.js';
const render=async path=>{const r=await worker.fetch(new Request('http://localhost'+path,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});assert.equal(r.status,200);return r.text()};
test('native Jieum route renders its own metadata without external Studio iframe or another PWA',async()=>{
 const html=await render('/jieum');assert.match(html,/<title>단청 지음/);assert.doesNotMatch(html,/<iframe|relay-novel-studio.*(?:iframe|src=)/);assert.equal([...html.matchAll(/rel="manifest"/g)].length,1);
 assert.doesNotMatch(html,/codex-preview|studio\.webmanifest/);
});
test('home and footer point to native Jieum while legacy Studio anchor survives',async()=>{
 const html=await render('/');assert.match(html,/href="\/jieum"/);assert.match(html,/id="studio"/);assert.match(html,/id="jieum"/);
 assert.doesNotMatch(html,/src="[^"]*jieum-editor/);
});
test('editor has separate lazy JS and scoped CSS; package codecs do not enter initial home chunk',()=>{
 const files=fs.readdirSync('dist/client/assets');const editor=files.find(f=>/^jieum-editor-.*\.js$/.test(f));assert.ok(editor);
 const cssFile=files.find(f=>/^jieum-editor-.*\.css$/.test(f));assert.ok(cssFile);
 const css=fs.readFileSync('dist/client/assets/'+cssFile,'utf8');assert.match(css,/\.jieum-editor/);assert.match(css,/\.jieum-route\.theme-dark/);
 assert.ok(fs.statSync('dist/client/assets/'+editor).size>100000);
});
