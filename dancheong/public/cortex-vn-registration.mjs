// Same-drawing registration, not identity recognition. A crop/encoding change
// inherits anatomy only when colours across the visible drawing actually agree.
// All coordinates here refer to the small local RGBA thumbnail.
export function drawingRegistration(query, reference, inspect) {
  const qb=query.bounds,rb=reference.bounds;
  if(!qb||!rb||qb.width<12||qb.height<12)return null;
  const points=[];
  for(let y=qb.top+2;y<qb.bottom-2;y+=5)for(let x=qb.left+2;x<qb.right-2;x+=5){
    const i=(y*query.width+x)*4;
    if([i,i-8,i+8,i-query.width*8,i+query.width*8].every(j=>query.data[j+3]>240))points.push([x,y,query.data[i],query.data[i+1],query.data[i+2]]);
  }
  if(points.length<80)return null;
  const score=(s,tx,ty,stride=1)=>{
    let error=0,n=0,inside=0;const bands=new Set();
    for(let k=0;k<points.length;k+=stride){const [x,y,r,g,b]=points[k],rx=s*x+tx,ry=s*y+ty;
      n++;if(rx<0||ry<0||rx>=reference.width-1||ry>=reference.height-1){error+=.35;continue;}
      const ix=Math.floor(rx),iy=Math.floor(ry),fx=rx-ix,fy=ry-iy;
      const value=c=>{const i=(iy*reference.width+ix)*4+c,j=i+reference.width*4;return (reference.data[i]*(1-fx)+reference.data[i+4]*fx)*(1-fy)+(reference.data[j]*(1-fx)+reference.data[j+4]*fx)*fy;};
      if(value(3)<220){error+=.35;continue;}
      inside++;bands.add(Math.floor((y-qb.top)/qb.height*4));
      error+=((r-value(0))**2+(g-value(1))**2+(b-value(2))**2)/(3*255**2);
    }
    return {s,tx,ty,error:error/n,coverage:inside/n,bands:bands.size};
  };
  const scales=[reference.sourceWidth/query.sourceWidth*query.width/reference.width,
    query.sourceWidth/reference.sourceWidth*reference.width/query.width,
    rb.width/qb.width,rb.height/qb.height,reference.width/query.width];
  let best={error:Infinity};
  for(const s of [...new Set(scales)].filter(s=>s>.2&&s<5)){
    const xs=[0,rb.left-s*qb.left,rb.right-s*qb.right,(rb.left+rb.right-s*(qb.left+qb.right))/2];
    const ys=[0,rb.top-s*qb.top,rb.bottom-s*qb.bottom,(reference.height-s*query.height)/2,reference.height-s*query.height];
    for(const tx of xs)for(const ty of ys){const r=score(s,tx,ty,3);if(r.error<best.error)best=r;}
  }
  // Early rejection keeps unrelated pictures cheap. No name, costume, hair
  // colour or nearest-neighbour face resemblance can qualify as a match.
  if(best.error>.10)return null;
  for(const step of [2,.7,.2]){
    const origin=best;
    for(const ds of [-.008,0,.008])for(const dx of [-step,0,step])for(const dy of [-step,0,step]){
      const s=origin.s*(1+ds*step),r=score(s,origin.tx+dx,origin.ty+dy,2);if(r.error<best.error)best=r;
    }
  }
  best=score(best.s,best.tx,best.ty);
  inspect?.(best);
  if(best.error>.004||best.coverage<.97||best.bands<4)return null;
  // Invert the thumbnail mapping to reference-original -> query-original.
  const scale=(query.sourceWidth/query.width)/(best.s*reference.sourceWidth/reference.width);
  return {scale,x:-best.tx/best.s*query.sourceWidth/query.width,y:-best.ty/best.s*query.sourceHeight/query.height,
    error:best.error,coverage:best.coverage};
}

export function registeredStageCamera(reference, transform, bounds) {
  if(!reference?.body||!transform||!bounds)return null;
  const {scale:s,x:dx,y:dy}=transform;
  if(!(s>0&&s<8)||![dx,dy].every(Number.isFinite))return null;
  const p=a=>a?{...a,x:a.x*s+dx,y:a.y*s+dy}:null;
  const b=reference.body,sourceTop=reference.sourceTop;
  if(!Number.isFinite(sourceTop))return null;
  // Position of the source's visible top on the output canvas.
  const y=reference.stageY*s+bounds.top-(sourceTop*s+dy);
  return {...reference,x:reference.x*s+dx,eyeX:reference.eyeX*s+dx,eyeY:reference.eyeY*s+dy,
    width:reference.width*s,headWidth:reference.headWidth*s,eyeGap:reference.eyeGap*s,
    stageHeight:reference.stageHeight*s,stageY:y,sourceTop:bounds.top,
    stageCalibration:'registered-body-v3',
    body:{...b,eyes:p(b.eyes),chin:p(b.chin),shoulders:p(b.shoulders),hips:p(b.hips),
      shoulderWidth:b.shoulderWidth==null?null:b.shoulderWidth*s,hipWidth:b.hipWidth==null?null:b.hipWidth*s,
      torsoLength:b.torsoLength==null?null:b.torsoLength*s,
      shortSource:y+bounds.height<reference.stageHeight*s*.90,
      crownTruncated:sourceTop*s+dy<bounds.top-Math.max(4,reference.stageHeight*s*.015),
      registration:{error:transform.error,coverage:transform.coverage}},
  };
}
