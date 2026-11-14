// عالم الشراء — anime / cel-shaded look: flat light bands, ink outlines, painted sky and clouds.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';

let grad=null;
// three light bands: shadow, mid, lit — the classic cel look
export function toonGradient(){
  if(grad) return grad;
  grad=new THREE.DataTexture(new Uint8Array([105,105,105,255, 185,185,185,255, 255,255,255,255]),3,1,THREE.RGBAFormat);
  grad.minFilter=grad.magFilter=THREE.NearestFilter; grad.generateMipmaps=false; grad.needsUpdate=true;
  return grad;
}
export function toonMat(opts={}){ return new THREE.MeshToonMaterial({gradientMap:toonGradient(),...opts}); }

const cache=new WeakMap();
function convert(m,instanced){
  if(!m||m.isMeshToonMaterial||m.isShaderMaterial||m.isSpriteMaterial||m.isLineBasicMaterial||m.isMeshBasicMaterial) return m;
  if(m.transparent&&m.opacity<.95) return m;                         // keep glass as glass
  let t=cache.get(m);
  if(!t){
    t=toonMat({color:m.color?.clone(),map:m.map||null,side:m.side,transparent:m.transparent,opacity:m.opacity,
      emissive:m.emissive?.clone(),emissiveIntensity:m.emissiveIntensity??1,emissiveMap:m.emissiveMap||null,vertexColors:m.vertexColors});
    cache.set(m,t);
  }
  if(instanced) t.userData.outlineParameters={visible:false};       // outline pass does not support instancing
  return t;
}
export function toonify(root){
  root.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    o.material=Array.isArray(o.material)?o.material.map(m=>convert(m,o.isInstancedMesh)):convert(o.material,o.isInstancedMesh);
    // no ink line around the sky dome or flat ground pieces
    const flat=/^(PlaneGeometry|CircleGeometry)$/.test(o.geometry?.type)||o.material.isShaderMaterial||o.material.side===THREE.BackSide;
    if(flat) for(const m of [].concat(o.material)) m.userData.outlineParameters={visible:false};
  });
}
export function makeOutline(renderer){
  return new OutlineEffect(renderer,{defaultThickness:.0042,defaultColor:[.13,.11,.17],defaultAlpha:.95});
}

// soft painted cumulus cloud
export function cloudTexture(seed=1){
  let s=seed*9301+49297; const R=()=>((s=(s*9301+49297)%233280)/233280);
  const c=document.createElement('canvas'); c.width=512; c.height=256; const x=c.getContext('2d');
  const blobs=[]; for(let i=0;i<9;i++) blobs.push([90+R()*330,150-R()*70,40+R()*55]);
  blobs.push([256,170,70]);
  x.fillStyle='rgba(176,196,230,1)';                                  // shaded underside
  for(const [bx,by,r] of blobs){ x.beginPath(); x.arc(bx,by+10,r,0,7); x.fill(); }
  x.fillStyle='#ffffff';
  for(const [bx,by,r] of blobs){ x.beginPath(); x.arc(bx-4,by-4,r*.93,0,7); x.fill(); }
  x.globalCompositeOperation='destination-in'; const g=x.createLinearGradient(0,0,0,256); g.addColorStop(0,'#000'); g.addColorStop(.86,'#000'); g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.fillRect(0,0,512,256);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}

// hand-painted grass: light and dark blotches so the ground is not flat colour
export function grassTexture(){
  const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d');
  x.fillStyle='#7cc46a'; x.fillRect(0,0,256,256);
  let s=7; const R=()=>((s=(s*16807)%2147483647)/2147483647);
  for(let i=0;i<220;i++){ x.fillStyle=R()<.5?'rgba(150,214,120,.35)':'rgba(84,160,82,.3)'; x.beginPath(); x.ellipse(R()*256,R()*256,6+R()*22,3+R()*10,R()*3,0,7); x.fill(); }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
