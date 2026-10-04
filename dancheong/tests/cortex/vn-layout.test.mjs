import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createVNLayout} from '../../public/cortex-vn-layout.mjs';

test('embedded VN inherits parent safe areas, follows rotation/keyboard and cleans up',async()=>{
 const dom=new JSDOM('<section class="cortex-reader-native"><iframe></iframe></section>',{pretendToBeVisual:true});
 const outer=dom.window,frame=outer.document.querySelector('iframe'),view=frame.contentWindow;
 const viewport=new outer.EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});
 Object.defineProperty(outer,'visualViewport',{value:viewport});Object.defineProperty(outer,'innerHeight',{value:844,writable:true});
 const computed=outer.getComputedStyle.bind(outer);outer.getComputedStyle=e=>e.hasAttribute('data-vn-safe-area')?{getPropertyValue:p=>({'padding-top':'47px','padding-bottom':'34px'}[p]||'0px')}:computed(e);
 const layout=createVNLayout(view),root=view.document.documentElement.style,surface=frame.parentElement.style;
 const tick=()=>new Promise(resolve=>outer.setTimeout(resolve,35));
 try{
  layout.start();layout.start();assert.equal(outer.document.querySelectorAll('[data-vn-safe-area]').length,1);
  assert.equal(root.getPropertyValue('--vn-safe-top'),'47px');assert.equal(root.getPropertyValue('--vn-safe-bottom'),'34px');
  assert.equal(surface.getPropertyValue('--vn-viewport-height'),'844px');
  viewport.height=490;viewport.dispatchEvent(new outer.Event('resize'));await tick();
  assert.equal(surface.getPropertyValue('--vn-viewport-height'),'490px');assert.equal(root.getPropertyValue('--vn-safe-bottom'),'0px');
  assert.equal(view.document.documentElement.dataset.vnKeyboardOpen,'true');
  viewport.scale=2;viewport.height=200;viewport.dispatchEvent(new outer.Event('resize'));await tick();
  assert.equal(surface.getPropertyValue('--vn-viewport-height'),'490px','pinch zoom must not change the camera');
  viewport.scale=1;viewport.height=390;outer.innerHeight=390;outer.dispatchEvent(new outer.Event('orientationchange'));await tick();
  assert.equal(surface.getPropertyValue('--vn-viewport-height'),'390px');
  assert.equal(view.document.documentElement.dataset.vnKeyboardOpen,'false');
  layout.stop();assert.equal(surface.getPropertyValue('--vn-viewport-height'),'');assert.equal(root.getPropertyValue('--vn-safe-top'),'');
  assert.equal(outer.document.querySelector('[data-vn-safe-area]'),null);
  assert.equal(view.document.documentElement.dataset.vnKeyboardOpen,undefined);
 }finally{layout.stop();dom.window.close()}
});
