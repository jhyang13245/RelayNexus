import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const read=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('native editor uses shared shell, reviewed ID-only handoff and one PWA',()=>{
 const home=read('app/components/nexus-library-home.tsx'),editor=read('features/jieum/jieum-editor.tsx');
 assert.match(home,/putJieumHandoff/);assert.match(home,/\/jieum\?transfer=/);
 assert.doesNotMatch(home,/relay-novel-studio.*window\.open/);
 assert.match(editor,/getJieumHandoff/);assert.match(editor,/await replace\(incoming.project,incoming.id\)/);
 assert.match(editor,/showModal/);assert.match(editor,/다시 검토하기/);
 assert.doesNotMatch(editor,/addEventListener\(["']message/);
 assert.match(read('features/jieum/jieum-shell.tsx'),/NexusSiteNav/);
 assert.match(read('app/jieum/jieum-client.tsx'),/lazy\(/);
 assert.doesNotMatch(editor,/serviceWorker|RelayNovelStudio.*indexedDB/);
});
test('Jieum CSS is scoped without corrupting .panel-body or keyframes',()=>{
 const css=postcss.parse(read('features/jieum/jieum-scoped.css'));
 let panels=0;css.walkRules(rule=>{if(rule.parent?.type==='atrule'&&/keyframes$/.test((rule.parent as any).name))return;
 for(const selector of rule.selectors)assert.ok(selector.startsWith('.jieum-editor'),selector);
 assert.doesNotMatch(rule.selector,/panel-\.jieum/);if(rule.selector.includes('.panel-body'))panels++;
 });assert.ok(panels>3);
});
test('file replacement goes through durable atomic save even from AI import',()=>{
 const editor=read('features/jieum/jieum-editor.tsx'),sections=read('features/jieum/studio-sections.tsx');
 assert.match(editor,/await replace\(normalized\)/);
 assert.match(editor,/onImportFile={requestImport}/);
 assert.match(sections,/const load = onImportFile/);
});
