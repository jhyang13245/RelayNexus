import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {ViewportHead,mergeViewport} from '../node_modules/vinext/dist/shims/metadata.js';

test('main document emits one edge-to-edge viewport with reader zoom preserved',()=>{
  const require=createRequire(import.meta.url),exports={};
  const code=ts.transpileModule(fs.readFileSync('app/layout.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(code,{exports,URL,require:name=>name.endsWith('.css')?{}:require(name)});
  // Exercise the pinned framework's actual metadata renderer as well as the
  // root layout: viewportFit alone was silently lost by this renderer.
  const html=renderToStaticMarkup(React.createElement(exports.default,null,
    React.createElement(ViewportHead,{viewport:mergeViewport([exports.viewport])})));
  const dom=new JSDOM(html);
  try{
    const tags=dom.window.document.querySelectorAll('meta[name="viewport"]');
    assert.equal(tags.length,1,'duplicate viewport tags can disagree on Safari');
    assert.match(tags[0].content,/width=device-width/u);
    assert.match(tags[0].content,/initial-scale=1/u);
    assert.match(tags[0].content,/viewport-fit=cover/u);
    assert.doesNotMatch(tags[0].content,/maximum-scale|user-scalable=no/u);
  }finally{dom.window.close()}
});
