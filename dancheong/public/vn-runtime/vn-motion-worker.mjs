import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '/vn-vision/1.0.1/vision_bundle.mjs';
import ModuleFactory from '/vn-vision/1.0.1/wasm/vision_wasm_module_internal.js';
import { motionGeometry } from './vn-motion-geometry.mjs?v=7cd28f52501e';
import { measureStageBody } from '../cortex-vn-camera.mjs?v=7cd28f52501e';
import { drawingRegistration, registeredStageCamera } from '../cortex-vn-registration.mjs?v=7cd28f52501e';
let detectors, queue = Promise.resolve();
const drawings=[]; // At most 12 thumbnails, about 3 MiB; no full image history.
async function models() {
  detectors ||= (async () => {
    const files = await FilesetResolver.forVisionTasks('/vn-vision/1.0.1/wasm', true);
    files.wasmLoaderPath = undefined;
    self.ModuleFactory = ModuleFactory;
    const face = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/vn-vision/1.0.1/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 2, minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5,
    });
    self.ModuleFactory = ModuleFactory;
    const pose = await PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/vn-vision/1.0.1/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5,
      outputSegmentationMasks: false,
    });
    return { face, pose };
  })();
  return detectors;
}
async function measure(bitmap, knownCamera = null, candidates = drawings) {
  const width = bitmap.width, height = bitmap.height;
  const raw = new OffscreenCanvas(width, height), rc = raw.getContext('2d', { willReadFrequently: true });
  rc.drawImage(bitmap, 0, 0);
  const data = rc.getImageData(0, 0, width, height).data;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 24) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return null;
  const bounds = { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
  const ratio=Math.min(1,256/Math.max(width,height)),tw=Math.round(width*ratio),th=Math.round(height*ratio);
  const thumbCanvas=new OffscreenCanvas(tw,th),tc=thumbCanvas.getContext('2d',{willReadFrequently:true});
  tc.drawImage(bitmap,0,0,tw,th);
  const thumb={width:tw,height:th,sourceWidth:width,sourceHeight:height,data:tc.getImageData(0,0,tw,th).data,
    bounds:{left:Math.round(left*ratio),right:Math.round(right*ratio),top:Math.round(top*ratio),bottom:Math.round(bottom*ratio),width:Math.round(bounds.width*ratio),height:Math.round(bounds.height*ratio)}};
  if(knownCamera?.width===width && knownCamera?.height===height){
    const measured=measureStageBody(knownCamera,bounds);
    if(measured){
      const drawing={thumb,measured,mesh:knownCamera.mesh,body:knownCamera.body,width,height};drawings.push(drawing);
      if(drawings.length>12)drawings.shift();
      return {camera:knownCamera,geometry:knownCamera.mesh?motionGeometry(knownCamera.mesh,width,height):null,drawing};
    }
  }
  for(let i=candidates.length-1;i>=0;i--){
    const base=candidates[i],transform=drawingRegistration(thumb,base.thumb);
    if(!transform)continue;
    const registered=registeredStageCamera(base.measured,transform,bounds);
    if(!registered)continue;
    const project=points=>points?.map(p=>({...p,x:(p.x*base.width*transform.scale+transform.x)/width,y:(p.y*base.height*transform.scale+transform.y)/height}));
    const mesh=project(base.mesh),body=project(base.body);
    const index=drawings.indexOf(base);if(index>=0){drawings.splice(index,1);drawings.push(base);}
    return {geometry:mesh?motionGeometry(mesh,width,height):null,camera:{width,height,mesh,body,registered},drawing:{thumb,measured:registered,mesh,body,width,height}};
  }
  const {face,pose}=await models();
  const sample = (side, ox, oy, angle = 0) => {
    const canvas = new OffscreenCanvas(512, 512), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b8b8b8'; ctx.fillRect(0, 0, 512, 512);
    ctx.translate(256, 256); ctx.rotate(angle); ctx.scale(512 / side, 512 / side);
    ctx.drawImage(bitmap, -ox - side / 2, -oy - side / 2);
    return canvas;
  };
  const unproject = (points, side, ox, oy, angle = 0) => points.map(p => {
    const x = (p.x - .5) * side, y = (p.y - .5) * side, c = Math.cos(angle), s = Math.sin(angle);
    return { ...p, x: (c * x + s * y + side / 2 + ox) / width, y: (-s * x + c * y + side / 2 + oy) / height };
  });
  let mesh = null, geometry = null;
  // Transparent padding and lower-body crop must not set the head search size.
  // Anchor the window at the visible figure's crown, with several width-based
  // attempts for wide hair/props and tilted faces. No skin-colour prerequisite.
  for (const [fraction, angle, shift=0] of [[1, 0], [.7, 0], [1.35, 0], [1, -.35], [1, .35], [.85,0,-.2], [.85,0,.2]]) {
    const side = bounds.width * fraction, ox = (left + right - side) / 2 + shift*bounds.width, oy = top - side * .04;
    const result = face.detect(sample(side, ox, oy, angle));
    if (result.faceLandmarks.length > 1) return null;
    if (result.faceLandmarks.length !== 1) continue;
    mesh = unproject(result.faceLandmarks[0], side, ox, oy, angle);
    geometry = motionGeometry(mesh, width, height);
    break;
  }
  const eye=mesh?{x:(mesh[33].x+mesh[133].x+mesh[362].x+mesh[263].x)*width/4,y:(mesh[33].y+mesh[133].y+mesh[362].y+mesh[263].y)*height/4}:null;
  const jaw=eye?Math.hypot(mesh[152].x*width-eye.x,mesh[152].y*height-eye.y):0;
  // Reserve the same *anatomical* window for a bust and a long drawing. A
  // cropped bottom is blank space, not permission to hallucinate raised hips.
  const side = jaw>8 ? jaw*17 : Math.max(bounds.width, bounds.height)*1.08;
  const ox = eye ? eye.x-side/2 : (left+right-side)/2, oy=eye ? eye.y-jaw*2.5 : (top+bottom-side)/2;
  let result = pose.detect(sample(side, ox, oy));
  let body = result.landmarks.length === 1 ? unproject(result.landmarks[0], side, ox, oy) : null;
  if(!body && jaw>8){
    for(const factor of [.9,1.12]){
      const span=side*factor,x=ox-(span-side)/2,y=oy-(span-side)*.15;
      result=pose.detect(sample(span,x,y));
      if(result.landmarks.length===1){body=unproject(result.landmarks[0],span,x,y);break;}
    }
  }
  // A tilted head under very wide hair may be missed by the silhouette crop.
  // Pose eyes give another search window, never the final facial dimensions.
  if(!mesh && body){
    const ex=(body[2].x+body[5].x)*width/2,ey=(body[2].y+body[5].y)*height/2;
    const sy=(body[11].y+body[12].y)*height/2,span=(sy-ey)*2.4;
    if(span>24&&span<Math.max(width,height)*1.5){
      const x=ex-span/2,y=ey-span*.45;
      const retry=face.detect(sample(span,x,y));
      if(retry.faceLandmarks.length===1){mesh=unproject(retry.faceLandmarks[0],span,x,y);geometry=motionGeometry(mesh,width,height);}
    }
  }
  const camera={mesh,body,width,height},measured=measureStageBody(camera,bounds);
  // Even a face-only baseline can be reused for the EXACT same drawing, but it
  // remains explicitly unmeasured for full-body quality, never a new identity.
  const drawing=measured?{thumb,measured,mesh,body,width,height}:null;
  if(drawing && top>1 && bounds.width*bounds.height<width*height*.995){
    drawings.push(drawing);if(drawings.length>12)drawings.shift();
  }
  return { geometry, camera, drawing };
}
self.onmessage = ({ data: { id, bitmap, referenceBitmap, referenceCamera } }) => {
  queue = queue.then(async () => {
    let result = null;
    try {
      const reference=referenceBitmap?await measure(referenceBitmap,referenceCamera):null;
      // An explicitly supplied base is the ONLY eligible calibration source.
      // Never self-match an earlier failed measurement of the damaged variant.
      result = await measure(bitmap,null,referenceBitmap?(reference?.drawing?[reference.drawing]:[]):drawings);
      if(result)delete result.drawing;
    } catch (e) { result = { diagnostic: String(e?.message || e) }; }
    finally { bitmap.close();referenceBitmap?.close(); }
    self.postMessage({ id, ...result });
  });
};
