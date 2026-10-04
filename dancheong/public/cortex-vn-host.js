/* Own one engine, switch only its reader. No navigation to an external VN site. */
(()=>{'use strict';
 const multiplayer=new URLSearchParams(location.search).get('multiplayer')==='1';
 const host=window.NexusVNHostBridge;
 const previousFetch=window.fetch.bind(window);
 window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);const method=init?.method||input?.method||'GET';
  if(!host.active&&method==='POST'&&url.origin===location.origin&&/^\/api\/vn\/(?:image|voice|gemini|typecast\/voice|openai|go)(?:\/|$)/u.test(url.pathname))return Promise.resolve(Response.json({error:{message:'비주얼노벨 화면을 벗어나 새 생성 요청을 멈췄습니다.',code:'VN_VIEW_INACTIVE'}},{status:409}));
  if(url.origin===location.origin&&url.pathname.startsWith('/api/vn/')){const headers=new Headers(init?.headers||input?.headers);headers.set('X-Cortex-Account',host.account);init={...init,headers};}
  return previousFetch(input,init);
 };
 const initialMode=new URLSearchParams(location.search).get('view')==='visual'?'visual':'novel';
 let desired=initialMode,renderer=null,layout=null,loading=null,preparing=null,preload=null,styles=[],serial=Promise.resolve(),epoch=0,requested=false,requestId=null;
 const hideNovel=hidden=>{const app=document.querySelector('.app');if(!app)return;if(hidden&&app.contains(document.activeElement))document.activeElement.blur();app.inert=hidden;if(hidden)app.setAttribute('aria-hidden','true');else app.removeAttribute('aria-hidden');};
 const channel='NEXUS_CORTEX_HOST_V1';
 const baseStyle=document.createElement('style');baseStyle.textContent=`
 #vn-root[hidden]{display:none!important}
 html[data-reading-mode="visual"],html[data-reading-mode="visual"] body{background:#080b12!important}
 html[data-reading-mode="visual"] body>.app{position:fixed!important;left:-100000px!important;pointer-events:none!important}
 html[data-reading-mode="visual"] #vn-root{visibility:visible!important}
 html[data-reading-mode="visual"] body>.nexus-import-dialog{display:none}
 #nexus-switch-visual{font:inherit;padding:7px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
 #vn-root>.vn-title-cast{position:fixed;inset:12% 5% 6%;z-index:100;background:#071017;overflow:auto;padding:24px}
 #vn-root .vn-common-settings{padding:12px;line-height:1.6;width:100%;border:1px solid #91b4bb;background:#172630;color:#f4eee2}
 #vn-root.is-playing .vn-topbar nav{max-height:calc(100dvh - 76px);overflow-y:auto;overscroll-behavior:contain}
 #vn-root.is-playing.vn-menu-open .vn-topbar{z-index:80}
 html[data-reading-mode="visual"] .nexus-jump-dock{display:none!important}
 html[data-reading-mode="visual"] #nexus-switch-visual{display:none!important}
 `;document.head.append(baseStyle);
 if(initialMode==='visual')document.documentElement.dataset.readingMode='visual';
 // Fetch the renderer and its CSS while the main host checks the account save.
 // modulepreload never executes the renderer or starts paid generation.
 function prepare(){
  if(!preparing)preparing=(async()=>{
   const response=await fetch('/vn-runtime/manifest.json',{cache:'no-cache'});if(!response.ok)throw Error('비주얼노벨 화면을 불러오지 못했습니다.');
   const manifest=await response.json();
   preload=document.createElement('link');preload.rel='modulepreload';preload.href='/vn-runtime/'+(manifest.entry||'vn.js')+'?v='+manifest.version;document.head.append(preload);
   styles=[...manifest.styles.map(name=>'/vn-runtime/'+name),'/cortex-vn-layout.css','/cortex-vn-stagecraft.css'].map(url=>{const link=document.createElement('link');link.rel='stylesheet';link.href=url+'?v='+manifest.version;link.media='not all';document.head.append(link);return link});
   await Promise.all(styles.map(link=>new Promise((resolve,reject)=>{if(link.sheet)return resolve();link.onload=resolve;link.onerror=()=>reject(Error('비주얼노벨 스타일을 불러오지 못했습니다.'))})));
   return manifest;
  })().catch(error=>{preparing=null;preload?.remove();preload=null;for(const style of styles)style.remove();styles=[];throw error});
  return preparing;
 }
 async function load(){
  if(renderer)return renderer;
  if(!loading)loading=(async()=>{
   const manifest=await prepare();
   const [vn,viewport]=await Promise.all([import('/vn-runtime/'+(manifest.entry||'vn.js')+'?v='+manifest.version),import('/cortex-vn-layout.mjs?v='+manifest.version)]);
   layout=viewport.createVNLayout(window);renderer=vn.renderer;return renderer;
  })().catch(error=>{loading=null;throw error});
  return loading;
 }
 async function setMode(mode,token,id){
  if(token!==epoch||!host.isReady())return;
  if(mode==='visual'){
   const view=await load();if(token!==epoch)return;
   const anchor=host.active?renderer?.anchor():window.NexusReaderScroll?.capture?.();
   host.active=true;globalThis.NexusVNHandlesTextReveal=true;
   for(const style of styles)style.media='all';document.documentElement.dataset.readingMode='visual';hideNovel(true);
   try{layout?.start();await view.activate(anchor)}catch(error){layout?.stop();host.active=false;globalThis.NexusVNHandlesTextReveal=false;renderer?.deactivate();for(const style of styles)style.media='not all';delete document.documentElement.dataset.readingMode;hideNovel(false);throw error}
  }else{
   const anchor=host.active?renderer?.deactivate():null;layout?.stop();
   host.active=false;globalThis.NexusVNHandlesTextReveal=false;
   for(const style of styles)style.media='not all';delete document.documentElement.dataset.readingMode;hideNovel(false);
   host.applySettings();
   if(anchor)requestAnimationFrame(()=>window.NexusReaderScroll?.restoreAnchor?.(anchor));
  }
  if(token===epoch)host.emit('VIEW_MODE_READY',{mode,requestId:id});
 }
 function request(mode,id){if(multiplayer&&mode!==initialMode)return;desired=mode==='visual'?'visual':'novel';requested=true;requestId=id;const target=desired,token=++epoch;serial=serial.catch(()=>{}).then(()=>setMode(target,token,id)).catch(error=>{if(token===epoch)host.emit('VIEW_MODE_ERROR',{mode:target,requestId:id,message:String(error.message||error)});});}
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.channel===channel&&event.data.type==='VIEW_MODE')request(event.data.mode,event.data.requestId)});
 window.addEventListener('nexus-package-ready',()=>{if(requested)request(desired,requestId)});
 if(initialMode==='visual')void prepare().catch(()=>{});
 const mount=()=>{if(multiplayer)return;const home=document.querySelector('[data-nexus-home]');if(!home||document.getElementById('nexus-switch-visual'))return;const button=document.createElement('button');button.id='nexus-switch-visual';button.type='button';button.textContent='비주얼노벨 모드';button.onclick=()=>host.emit('VIEW_MODE_REQUEST',{mode:'visual'});home.after(button)};
 window.addEventListener('nexus-reader-mounted',mount);
 if(document.readyState!=='loading')mount();else document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0),{once:true});
})();
