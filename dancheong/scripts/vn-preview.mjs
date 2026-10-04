// Local, synthetic QA surface. Never copied into public or production builds.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/cortex-173-chronos-2turn.json','utf8')).scenario;
fixture.title='통합 검증용 이야기';fixture.runtime.storyId='vn-integration-synthetic';
const text='복도의 창으로 오후의 햇빛이 들어왔다.\n\n서현이 걸음을 멈추고 말했다.\n\n“같은 이야기를 다른 화면으로 읽어 볼까요?”\n\n멀리서 종소리가 울렸다.';
const snapshot={scenario:fixture,turns:[{id:'integration-beat-1',status:'COMMITTED',text,displayText:text,dialogueProtocol:'WRITER_INLINE_NAME_V1',dialogueAnnotations:[{bindingVersion:2,source:'WRITER_PUBLIC_NAME',speakerName:'서현',quoteText:'“같은 이야기를 다른 화면으로 읽어 볼까요?”',offset:text.indexOf('“')}],recommendations:[{label:'교실로 들어간다',risk:'LOW'}]}]};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>단청 통합 검증</title><style>body{margin:0;background:#10141a;color:white;font:14px system-ui}header{height:48px;display:flex;align-items:center;gap:12px;padding:0 18px}button{font:inherit;padding:7px}iframe{width:100%;height:calc(100dvh - 48px);border:0}</style><header><strong>단청 통합 검증</strong><button id="novel">소설</button><button id="visual">비주얼노벨</button><button id="report">검증 결과</button><output id="status">준비 중</output></header><iframe src="/cortex.html?session=vn-integration-synthetic-1&account=test"></iframe><script>
const frame=document.querySelector('iframe'),status=document.querySelector('output'),channel='NEXUS_CORTEX_HOST_V1';let restored=false,initialApi=null;
const send=(type,extra={})=>frame.contentWindow.postMessage({channel,type,...extra},location.origin);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.channel!==channel)return;const d=e.data;
if(d.type==='READY'&&!restored){restored=true;fetch('/fixture.json').then(r=>r.json()).then(snapshot=>send('CLOUD_RESTORE',{snapshot,projectId:'integration-fixture'}));send('SETTINGS',{apiKey:'',imageApiKey:'',provider:'openai',fontSize:'small',typingSpeed:'natural',imageQuality:'low',imageEvery:0,theme:'dark',readingWidth:'normal'});}
if(d.type==='CLOUD_RESTORE_COMPLETE'){initialApi=frame.contentWindow.__DANCHEONG_NEW_ENGINE_TEST__;status.textContent='소설 준비 완료';}
if(d.type==='VIEW_MODE_REQUEST')send('VIEW_MODE',{mode:d.mode});
if(d.type==='VIEW_MODE_READY')status.textContent=d.mode==='visual'?'비주얼노벨 준비 완료':'소설 준비 완료';
if(d.type==='VIEW_MODE_ERROR'||d.type==='ERROR')status.textContent=d.message;
});
document.querySelector('#novel').onclick=()=>send('VIEW_MODE',{mode:'novel'});document.querySelector('#visual').onclick=()=>send('VIEW_MODE',{mode:'visual'});
document.querySelector('#report').onclick=()=>{const w=frame.contentWindow,a=w.__DANCHEONG_NEW_ENGINE_TEST__;status.textContent='엔진 동일: '+(a===initialApi)+' / 턴: '+a._turns().length+' / 입력: '+w.document.querySelector(w.NexusVNHostBridge.active?'#vn-input':'#input').value;};
</script></html>`;
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'};
http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
 if(url.pathname==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot));return}
 if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname==='/api/account'?{authenticated:true,displayName:'검증 계정'}:{account:'test',slots:[],maxBytes:67108864}));return}
 const file=path.resolve('public','.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end('Not found');return}
 res.setHeader('Content-Type',(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');fs.createReadStream(file).pipe(res);
}).listen(5401,'127.0.0.1',()=>console.log('VN integration QA: http://127.0.0.1:5401'));
