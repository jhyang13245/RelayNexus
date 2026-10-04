import {stagePositions,slotWidth,stageOrder} from '/vn-runtime/vn-stage.mjs';
import {projectStature,stageReferenceHeight,STAGE_ANATOMY} from '/vn-runtime/vn-stature.mjs';
import {cleanFraming} from '/vn-runtime/vn-framing.mjs';
const container=document.querySelector('#characters'),stage=document.querySelector('#vn-stage');
window.auditRender=async(assets,roster,title)=>{
 container.replaceChildren();const order=stageOrder([],assets.map(a=>a.key)),narrow=innerWidth<=760;
 const positions=stagePositions(order.length,{layout:'nvl',narrow,compactLandscape:innerHeight<=600&&innerWidth>innerHeight}),width=slotWidth(order.length,narrow),ref=stageReferenceHeight(roster);
 const frame=cleanFraming(null), slots=[];
 for(let i=0;i<assets.length;i++){
  const a=assets.find(a=>a.key===order[i]),stature=projectStature(a.person,ref),slot=document.createElement('div');slot.className='vn-character is-present is-speaking';
  for(const [k,v]of Object.entries({'--x':positions[i],'--w':width,'--hs':stature.scale,'--stature-lift':stature.lift,'--frame-scale':frame.scale,'--frame-offset':frame.offset*100+'%'}))slot.style.setProperty(k,String(v));
  const img=new Image();img.className='vn-character-image is-visible';img.src=a.display;slot.append(img);container.append(slot);await img.decode();slots.push({a,slot,img,stature});
 }
 // Reduced-motion production styles settle without harness-specific size overrides.
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const root=stage.getBoundingClientRect(),metrics=[];const canvas=document.querySelector('#guides');canvas.width=innerWidth;canvas.height=innerHeight;const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
 for(const {a,slot,img,stature}of slots){const rect=img.getBoundingClientRect(),s=slot.getBoundingClientRect(),scale=rect.height/img.naturalHeight,b=a.bounds,f=a.camera?.frame;
  const point=(x,y)=>({x:rect.left-root.left+(f?x-b.left+f.x:x)*scale,y:rect.top-root.top+(f?y-b.top+f.y:y)*scale});
  const eye=a.face?point(a.face.eyeX??a.face.x,a.face.eyeY):null,crown=b?point(a.face?.x||(b.left+b.right)/2,b.top):null,bottom=b?point(b.left,b.bottom):null;
  const manual=a.annotation?{eye:point(a.annotation.eyeX,a.annotation.eyeY),faceWidthPx:a.annotation.faceWidth*scale}:null;
  // Measurement of the virtual floor convention (not an assertion that cropped art contains feet).
  const virtualGroundY=s.top-root.top+s.height*(STAGE_ANATOMY.crown+(1-STAGE_ANATOMY.crown)/STAGE_ANATOMY.thighFraction);
  const body=a.face?.body, joints=body?Object.fromEntries(['eyes','chin','shoulders','hips'].filter(k=>body[k]).map(k=>[k,point(body[k].x,body[k].y)])):null;
  const bodyMetrics=body?{joints,shoulderWidthPx:body.shoulderWidth*scale,hipWidthPx:body.hipWidth*scale,torsoLengthPx:body.torsoLength?body.torsoLength*scale:null,scaleSpread:body.scaleSpread,coverage:body.coverage,proportionsUncertain:body.proportionsUncertain}:null;
  const row={body:bodyMetrics,key:a.key,variant:a.variant,viewport:[innerWidth,innerHeight],heightCm:stature.heightCm,referenceCm:ref,statureScale:stature.scale,slotHeight:s.height,slotBottom:s.bottom-root.top,imageWidth:rect.width,imageHeight:rect.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,screenPixelScale:scale,estimatedEye:eye,estimatedExposedFaceWidthPx:a.face?.width? a.face.width*scale:null,manual,crownY:crown?.y,drawnBottomY:bottom?.y,virtualGroundY,headClipped:!!crown&&crown.y<0,sourceHeadTruncated:!!b&&b.top<=1,leftOverflow:Math.max(0,-(rect.left-root.left)),rightOverflow:Math.max(0,rect.right-root.right),frameStatus:a.check.code||a.check.status,calibrationMethod:a.camera?.method||'none'};metrics.push(row);
  if(joints){c.strokeStyle='#ff90df';c.lineWidth=2;c.beginPath();if(joints.shoulders&&joints.hips){c.moveTo(joints.shoulders.x,joints.shoulders.y);c.lineTo(joints.hips.x,joints.hips.y);}c.stroke();for(const p of Object.values(joints)){c.beginPath();c.arc(p.x,p.y,4,0,7);c.stroke();}}
  c.font='13px system-ui';c.fillStyle='#99f4d9';c.fillText(`${a.person.name} ${stature.heightCm}cm`,Math.max(4,s.left-root.left),innerHeight-18);if(eye){c.strokeStyle='#ffd574';c.beginPath();c.moveTo(eye.x-20,eye.y);c.lineTo(eye.x+20,eye.y);c.stroke();}if(manual){c.strokeStyle='#62efff';c.strokeRect(manual.eye.x-manual.faceWidthPx/2,manual.eye.y-3,manual.faceWidthPx,6);}
 }
 document.querySelector('#caption').textContent=title+'\n'+innerWidth+'×'+innerHeight+' / roster reference '+ref+'cm';
 // Export uses the actual DOM-computed CSS rectangles; no independent placement formula.
 const out=document.createElement('canvas');out.width=innerWidth;out.height=innerHeight;const ctx=out.getContext('2d');ctx.fillStyle='#17293a';ctx.fillRect(0,0,out.width,out.height);
 for(const {img}of slots){const r=img.getBoundingClientRect();ctx.drawImage(img,r.left-root.left,r.top-root.top,r.width,r.height);}ctx.drawImage(canvas,0,0);ctx.fillStyle='white';ctx.font='15px system-ui';ctx.fillText(title,16,25);
 return{metrics,png:out.toDataURL('image/png'),stage:{width:root.width,height:root.height}};
};
window.dispatchEvent(new Event('audit-ready'));
