// عالم الشراء — realistic test street. Real-world materials (CC0 scans from Poly Haven), real sky light and sun shadows.
// Only the people are anime (toon shading + ink outline); everything else is physically based.
// Units are metres. X runs along the street, -Z is toward the shops.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAvatar, animateAvatar, randomAvatar, defaultAvatar } from './avatar.js?v=6';
import { makeOutline } from './toon.js?v=6';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Water } from 'three/addons/objects/Water.js';
import { mediaOk } from './backend.js?v=6';

// the scene (with the anime ink outline on people) rendered into the composer's buffer
class OutlineScenePass extends Pass {
  constructor(outline,scene,camera){ super(); this.o=outline; this.scene=scene; this.camera=camera; this.needsSwap=false; }
  render(renderer,writeBuffer,readBuffer){ renderer.setRenderTarget(this.renderToScreen?null:readBuffer); this.o.render(this.scene,this.camera); }
}
// ambient occlusion (soft contact shadow in corners and under things); skips glass, water and cut-out leaves/screens
class StreetAO extends GTAOPass {
  overrideVisibility(){ super.overrideVisibility(); this.scene.traverse(o=>{ if(o.userData.noAO) o.visible=false; }); }
}

const PI=Math.PI, TAU=PI*2;
let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const R=(a,b)=>a+(b-a)*rnd();

/* ---------------- layout (z bands) ---------------- */
const FACADE=-22, ROAD0=-7, ROAD1=1, CANAL0=6, CANAL1=16, SOUTH1=24.5, XMAX=78;
const CURB=.15, WATER=-1.05, BRIDGE_HALF=2.1;
const LANES=[{z:-5,dir:1},{z:-1,dir:-1}];

export function groundY(x,z){
  if(z<FACADE+.3||z>SOUTH1-.3||Math.abs(x)>XMAX) return null;
  if(z>CANAL0-.2&&z<CANAL1+.2){
    if(Math.abs(x)>BRIDGE_HALF-.35) return null;
    const t=clamp((z-(CANAL0-.2))/(CANAL1-CANAL0+.4),0,1); return CURB+1.05*Math.sin(PI*t);
  }
  if(z>ROAD0&&z<ROAD1) return 0;
  return CURB;
}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* ---------------- texture sets ---------------- */
const manager=new THREE.LoadingManager();
const tl=new THREE.TextureLoader(manager);
let maxAniso=8;
// cut large-format stone panels into the texture: dark joints in colour, grooves in the normal map, slight tone per panel
function addJoints(tx,kind,tile,[pw,ph]){
  const img=tx.image, c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0);
  const W=c.width, H=c.height, cols=Math.round(tile/pw), rows=Math.round(tile/ph), cw=W/cols, rh=H/rows, lw=Math.max(2,W/300);
  let sd=11; const r=()=>(sd=(sd*16807)%2147483647)/2147483647;
  const vlines=[];
  for(let j=0;j<rows;j++){ const off=(j%2)*cw/2; for(let i=0;i<=cols;i++) vlines.push([off+i*cw,j*rh]); }
  if(kind==='map'){
    for(let j=0;j<rows;j++){ const off=(j%2)*cw/2; for(let i=-1;i<cols;i++){ const v=r(); x.fillStyle=v<.5?`rgba(255,250,240,${(.5-v)*.16})`:`rgba(120,95,60,${(v-.5)*.14})`;
      x.fillRect(off+i*cw,j*rh,cw,rh); } }
    x.fillStyle='rgba(95,78,55,.7)';
    for(let j=0;j<=rows;j++) x.fillRect(0,j*rh-lw/2,W,lw);
    for(const [vx,vy] of vlines) x.fillRect(vx-lw/2,vy,lw,rh);
  }else{
    for(let j=0;j<=rows;j++){ x.fillStyle='rgb(128,70,225)'; x.fillRect(0,j*rh-lw/2,W,lw/2); x.fillStyle='rgb(128,190,225)'; x.fillRect(0,j*rh,W,lw/2); }
    for(const [vx,vy] of vlines){ x.fillStyle='rgb(190,128,225)'; x.fillRect(vx-lw/2,vy,lw/2,rh); x.fillStyle='rgb(70,128,225)'; x.fillRect(vx,vy,lw/2,rh); }
  }
  tx.image=c; tx.needsUpdate=true;
}
function texSet(name,tile,joints){
  const s={};
  for(const [k,f] of [['map','diff'],['normalMap','nor'],['roughnessMap','rough']]){
    const t=tl.load(`textures/${name}_${f}.jpg`,joints&&k!=='roughnessMap'?(tx=>addJoints(tx,k,tile,joints)):undefined);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/tile,1/tile); t.anisotropy=maxAniso;
    if(k==='map') t.colorSpace=THREE.SRGBColorSpace;
    s[k]=t;
  }
  return s;
}
// UVs in metres so every surface shares one texture scale (picks the axis the face looks along)
function metreUV(g){
  g=g.index?g.toNonIndexed():g; g.computeVertexNormals();
  const p=g.attributes.position, n=g.attributes.normal, uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const ax=Math.abs(n.getX(i)), ay=Math.abs(n.getY(i)), az=Math.abs(n.getZ(i)), x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    if(ay>=ax&&ay>=az){ uv[i*2]=x; uv[i*2+1]=z; } else if(ax>=az){ uv[i*2]=z; uv[i*2+1]=y; } else { uv[i*2]=x; uv[i*2+1]=y; }
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); return g;
}
function canvasTex(w,h,draw,srgb=true){
  const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); if(srgb) t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=maxAniso; return t;
}
const FONT='"Tajawal", system-ui, sans-serif';

/* ---------------- materials ---------------- */
/* ---------------- procedural travertine: warm banded stone with pores, cut into large panels ---------------- */
function travertine({tile=2.4,pw=1.2,ph=.6,base=[232,218,192],sv=3}={}){
  const N=1024; let sd=sv*977+13; const r=()=>(sd=(sd*16807)%2147483647)/2147483647;
  const mk=()=>{ const c=document.createElement('canvas'); c.width=c.height=N; return c; };
  const col=mk(), nor=mk(), x=col.getContext('2d'), y=nor.getContext('2d');
  x.fillStyle=`rgb(${base})`; x.fillRect(0,0,N,N); y.fillStyle='rgb(128,128,255)'; y.fillRect(0,0,N,N);
  const cols=Math.round(tile/pw), rows=Math.round(tile/ph), cw=N/cols, rh=N/rows;
  for(let j=0;j<rows;j++){ const off=(j%2)*cw/2; for(let i=-1;i<cols;i++){
    const x0=off+i*cw, y0=j*rh, t=r()-.5;
    x.save(); x.beginPath(); x.rect(x0,y0,cw,rh); x.clip();
    x.fillStyle=`rgba(${t>0?'255,247,232':'170,135,95'},${Math.abs(t)*.24})`; x.fillRect(x0,y0,cw,rh);
    const nb=10+Math.floor(r()*12);
    for(let b=0;b<nb;b++){ const yy=y0+r()*rh, dark=r()<.6; x.strokeStyle=dark?`rgba(165,130,88,${.07+r()*.16})`:`rgba(255,251,242,${.12+r()*.22})`;
      x.lineWidth=1+r()*7; x.beginPath(); x.moveTo(x0-8,yy); for(let s=0;s<=10;s++) x.lineTo(x0+s*cw/10,yy+Math.sin(s*1.1+b)*r()*3); x.stroke(); }
    for(let p=0;p<55;p++){ const px=x0+r()*cw, py=y0+r()*rh, l=2+r()*12, hh=1+r()*2.2;
      x.fillStyle=`rgba(125,98,66,${.22+r()*.3})`; x.fillRect(px,py,l,hh);
      y.fillStyle='rgb(128,96,235)'; y.fillRect(px,py,l,1); y.fillStyle='rgb(128,165,235)'; y.fillRect(px,py+hh,l,1); }
    x.restore(); } }
  const lw=Math.max(2,N/420);
  x.fillStyle='rgba(130,108,80,.5)';
  for(let j=0;j<=rows;j++) x.fillRect(0,j*rh-lw/2,N,lw);
  for(let j=0;j<rows;j++){ const off=(j%2)*cw/2; for(let i=0;i<=cols;i++) x.fillRect(off+i*cw-lw/2,j*rh,lw,rh); }
  for(let j=0;j<=rows;j++){ y.fillStyle='rgb(128,72,225)'; y.fillRect(0,j*rh-lw/2,N,lw/2); y.fillStyle='rgb(128,186,225)'; y.fillRect(0,j*rh,N,lw/2); }
  for(let j=0;j<rows;j++){ const off=(j%2)*cw/2; for(let i=0;i<=cols;i++){ const vx=off+i*cw; y.fillStyle='rgb(186,128,225)'; y.fillRect(vx-lw/2,j*rh,lw/2,rh); y.fillStyle='rgb(72,128,225)'; y.fillRect(vx,j*rh,lw/2,rh); } }
  const tex=(c,srgb)=>{ const t=new THREE.CanvasTexture(c); if(srgb) t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/tile,1/tile); t.anisotropy=maxAniso; return t; };
  return {map:tex(col,true),normalMap:tex(nor,false)};
}
function screenArtTex(){
  return canvasTex(512,288,(x,w,h)=>{ const g=x.createLinearGradient(0,0,w,h); g.addColorStop(0,'#14204a'); g.addColorStop(.5,'#3b4fb0'); g.addColorStop(1,'#1a1030'); x.fillStyle=g; x.fillRect(0,0,w,h);
    for(let k=0;k<5;k++){ x.strokeStyle=`rgba(${150+k*20},${170+k*12},255,${.25+k*.08})`; x.lineWidth=6-k; x.beginPath();
      for(let i=0;i<=w;i+=8) x.lineTo(i,h*.55+Math.sin(i/70+k*.7)*40*(1-k*.12)+k*8); x.stroke(); } });
}
let M={};
function makeMaterials(){
  const marble=texSet('marble',2.5), wood=texSet('wood',2.2), sand=texSet('sand',6), asph=texSet('asphalt',5);
  const trav=travertine({base:[226,208,178]}), pave=travertine({tile:2.4,pw:1.2,ph:.8,base:[238,228,208],sv:7});
  const std=(o)=>new THREE.MeshStandardMaterial(o);
  M.travertine=std({...trav,color:'#ffffff',roughness:.82});
  M.limestone=std({...trav,color:'#fff9f0',roughness:.8});
  M.sandstone=std({...trav,color:'#f2dfc4',roughness:.88});
  M.paving=std({...pave,color:'#ffffff',roughness:.5});
  M.asphalt=std({...asph,color:'#8c8c8c',roughness:1});
  M.sand=std({...sand,color:'#f0d9b0',roughness:1});
  M.mulch=std({...sand,color:'#7a5c40',roughness:1});
  M.dunes=std({...sand,color:'#e6c896',roughness:1});
  M.marbleIn=std({...marble,color:'#fff',emissive:'#ffefd8',emissiveMap:marble.map,emissiveIntensity:.3,roughness:.6});
  M.woodIn=std({...wood,color:'#fff',emissive:'#ffdcb0',emissiveMap:wood.map,emissiveIntensity:.32,roughness:.8});
  M.woodOut=std({...wood,color:'#e8c9a0',roughness:.8});
  M.soffit=std({...wood,color:'#d39a62',roughness:.7});
  M.wallIn=std({...trav,color:'#f6e8d0',emissive:'#ffd8a6',emissiveMap:trav.map,emissiveIntensity:.42,roughness:.9});
  M.wallGlow=std({...trav,color:'#e8cfa8',emissive:'#ffc078',emissiveMap:trav.map,emissiveIntensity:.35,roughness:.9});
  M.ceilIn=std({color:'#fff',map:ceilingTex(),emissive:'#ffe2b8',emissiveMap:ceilingTex(),emissiveIntensity:.9});
  M.bronze=std({color:'#9c6a3a',metalness:1,roughness:.3});
  M.bronzePot=std({color:'#a8763e',metalness:.9,roughness:.36});
  M.gold=std({color:'#caa062',metalness:1,roughness:.25});
  M.darkMetal=std({color:'#2a2c30',metalness:.9,roughness:.4});
  M.glow=std({color:'#ffe6bf',emissive:'#ffc77a',emissiveIntensity:2.4});
  M.glowShelf=std({color:'#fff1d8',emissive:'#ffd59a',emissiveIntensity:1.4});
  M.amber=std({color:'#c98a2e',emissive:'#b86d16',emissiveIntensity:1.1,roughness:.2});
  M.glass=new THREE.MeshPhysicalMaterial({color:'#b9c4c0',metalness:0,roughness:.02,transparent:true,opacity:.1,
    envMapIntensity:.5,depthWrite:false,side:THREE.DoubleSide,reflectivity:.9});
  M.tint=std({color:'#3a4a50',metalness:.6,roughness:.08,envMapIntensity:1.4});
  M.concrete=std({...pave,color:'#e6dccb',roughness:.8});
  M.white=std({color:'#f4f2ee',roughness:.6});
  M.paint=std({color:'#f6f6f2',roughness:.55});
  M.rubber=std({color:'#141414',roughness:.92});
  M.lamp=M.glow;
  M.screen=std({color:'#0b0d12',metalness:.3,roughness:.15,emissive:'#3a5a8a',emissiveIntensity:.5});
  M.screenArt=std({map:screenArtTex(),emissive:'#ffffff',emissiveMap:null,emissiveIntensity:1});
  M.screenArt.emissiveMap=M.screenArt.map;
  M.soft=std({color:'#e3d4bd',emissive:'#e3d4bd',emissiveIntensity:.25,roughness:1});
  M.cushionIn=std({color:'#efe4d2',emissive:'#efe4d2',emissiveIntensity:.25,roughness:1});
  M.cushionOut=std({color:'#efe7da',roughness:.95});
  M.fabricDark=std({color:'#4a4a52',emissive:'#4a4a52',emissiveIntensity:.25,roughness:1});
  M.leather=std({color:'#8a5a3a',emissive:'#8a5a3a',emissiveIntensity:.25,roughness:.7});
  M.rattan=std({color:'#9a7550',roughness:.85});
  M.ceramic=new THREE.MeshPhysicalMaterial({color:'#7cbcb0',roughness:.22,clearcoat:.8});
  M.poolTile=std({color:'#3fb3b5',roughness:.4});
  M.mashrabiya=std({color:'#c09455',metalness:.95,roughness:.3,alphaMap:mashrabiyaTex(),alphaTest:.5,side:THREE.DoubleSide});
  M.water=std({color:'#127a80',metalness:.1,roughness:.06,normalMap:waterNormals(),normalScale:new THREE.Vector2(.55,.55),envMapIntensity:1.3});
  M.water.normalMap.repeat.set(1/3.2,1/3.2);
  M.pool=std({color:'#2aa3a8',metalness:.1,roughness:.04,normalMap:M.water.normalMap,normalScale:new THREE.Vector2(.25,.25),envMapIntensity:1.1,transparent:true,opacity:.88});
  M.jet=std({color:'#ffffff',emissive:'#dff6ff',emissiveIntensity:.4,transparent:true,opacity:.55});
}
function ceilingTex(){
  return canvasTex(256,256,(x,w,h)=>{ x.fillStyle='#d9d2c6'; x.fillRect(0,0,w,h);
    x.fillStyle='#fffaf0'; for(let i=0;i<2;i++) for(let j=0;j<2;j++) x.fillRect(i*128+24,j*128+50,80,28); });
}
function mashrabiyaTex(){
  const t=canvasTex(512,512,(x,w,h)=>{
    x.fillStyle='#000'; x.fillRect(0,0,w,h); x.strokeStyle='#fff'; x.lineWidth=9; x.lineJoin='round';
    const c=128;
    for(let i=0;i<=4;i++) for(let j=0;j<=4;j++){
      const cx=i*c, cy=j*c, r=c*.36;
      for(const rot of [0,PI/4]){ x.beginPath();
        for(let k=0;k<4;k++){ const a=rot+k*PI/2+PI/4; x.lineTo(cx+Math.cos(a)*r*1.18,cy+Math.sin(a)*r*1.18); } x.closePath(); x.stroke(); }
      x.beginPath(); x.arc(cx,cy,r*.42,0,TAU); x.stroke();
      x.beginPath(); x.moveTo(cx+r*1.18,cy); x.lineTo(cx+c-r*1.18,cy); x.moveTo(cx,cy+r*1.18); x.lineTo(cx,cy+c-r*1.18); x.stroke();
    }
    x.lineWidth=14; x.strokeRect(0,0,w,h);
  },false);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
// tileable ripple normals for the canal
function waterNormals(){
  const N=256, waves=[[3,1,.5],[-2,4,.3],[5,-3,.22],[1,-7,.14],[9,2,.1],[-6,-8,.08]];
  const t=canvasTex(N,N,(x)=>{
    const img=x.createImageData(N,N);
    for(let j=0;j<N;j++) for(let i=0;i<N;i++){
      let dx=0,dy=0; const u=i/N*TAU, v=j/N*TAU;
      for(const [a,b,amp] of waves){ const c=Math.cos(a*u+b*v)*amp; dx+=c*a; dy+=c*b; }
      const n=new THREE.Vector3(-dx*.12,-dy*.12,1).normalize(), k=(j*N+i)*4;
      img.data[k]=(n.x*.5+.5)*255; img.data[k+1]=(n.y*.5+.5)*255; img.data[k+2]=(n.z*.5+.5)*255; img.data[k+3]=255;
    }
    x.putImageData(img,0,0);
  },false);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
function signMat(text,color='#d7b06a',font=800){
  const t=canvasTex(1024,192,(x,w,h)=>{
    x.clearRect(0,0,w,h); x.fillStyle=color; x.textAlign='center'; x.textBaseline='middle'; x.direction='rtl';
    let s=120; do{ x.font=`${font} ${s}px ${FONT}`; s-=4; }while(x.measureText(text).width>w-60&&s>30);
    x.shadowColor='rgba(0,0,0,.35)'; x.shadowBlur=6; x.fillText(text,w/2,h/2+8);
  });
  return new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.25,metalness:.6,roughness:.35,
    emissive:color,emissiveMap:t,emissiveIntensity:.25,depthWrite:false});
}

/* ---------------- small builders ---------------- */
function box(w,h,d,mat,x=0,y=0,z=0,{cast=true,recv=true,uv=true}={}){
  const g=uv?metreUV(new THREE.BoxGeometry(w,h,d)):new THREE.BoxGeometry(w,h,d);
  const m=new THREE.Mesh(g,mat); m.position.set(x,y,z); m.castShadow=cast; m.receiveShadow=recv; return m;
}
function plane(w,d,mat,x,y,z){                       // flat on the ground
  const g=new THREE.PlaneGeometry(w,d); g.rotateX(-PI/2); g.translate(x,y,z);
  const m=new THREE.Mesh(metreUV(g),mat); m.receiveShadow=true; return m;
}
// collects many small static pieces and merges them per material (far fewer draw calls)
function batch(parent){
  const lists=new Map();
  const add=(w,h,d,mat,x=0,y=0,z=0,ry=0)=>{ const g=new THREE.BoxGeometry(w,h,d); if(ry) g.rotateY(ry); g.translate(x,y,z); push(g,mat); };
  const push=(g,mat)=>{ g=metreUV(g); for(const k of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(k)) g.deleteAttribute(k);
    if(!lists.has(mat)) lists.set(mat,[]); lists.get(mat).push(g); };
  add.geo=push;
  add.done=()=>{ for(const [mat,gs] of lists){ const m=new THREE.Mesh(mergeGeometries(gs),mat); m.castShadow=!mat.emissiveIntensity||mat.emissiveIntensity<.5; m.receiveShadow=true; parent.add(m); } lists.clear(); };
  return add;
}
function panelGeo(w,h,cell){ const g=new THREE.PlaneGeometry(w,h), uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w/cell,uv.getY(i)*h/cell); return g; }
function scaleUV(g,k){ const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*k,uv.getY(i)*k); return g; }
function extrude(B,shape,depth,mat,z0,opts={}){ const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:24,...opts}); g.translate(0,0,z0); B.geo(g,mat); }
function signPlate(text,w,h,x,y,z,color){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signMat(text,color)); m.position.set(x,y,z); m.renderOrder=2; return m;
}
function glassPane(w,h,x,y,z,ry=0){ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),M.glass); m.position.set(x,y,z); m.rotation.y=ry; return m; }
function frameRect(B,w,h,t,x,y,z,mat=M.bronze,depth=.12){
  B(w,t,depth,mat,x,y+h/2-t/2,z); B(w,t,depth,mat,x,y-h/2+t/2,z); B(t,h,depth,mat,x-w/2+t/2,y,z); B(t,h,depth,mat,x+w/2-t/2,y,z);
}
// bronze-framed glass wall, bottom at y0
function glazing(g,B,w,h,x,y0,z,nx=3,ny=1,t=.07){
  const y=y0+h/2; g.add(glassPane(w,h,x,y,z)); frameRect(B,w,h,t*1.5,x,y,z);
  for(let i=1;i<nx;i++) B(t,h,.1,M.bronze,x-w/2+i*w/nx,y,z);
  for(let j=1;j<ny;j++) B(w,t,.1,M.bronze,x,y0+j*h/ny,z);
}
function door(g,B,x,z,w=2.4,h=3.4){
  glazing(g,B,w,h,x,0,z,2,1,.09);
  for(const s of [-1,1]) B(.05,1.7,.06,M.gold,x+s*.2,1.35,z+.12);
  frameRect(B,w+.5,h+.3,.22,x,(h+.3)/2,z+.08,M.bronze,.34);
}
function mash(g,B,w,h,x,y0,z,ry=0,cell=1.1){
  const p=new THREE.Mesh(panelGeo(w,h,cell),M.mashrabiya); p.position.set(x,y0+h/2,z); p.rotation.y=ry; p.castShadow=true; g.add(p);
  if(!ry) frameRect(B,w,h,.07,x,y0+h/2,z,M.bronze,.1);
  return p;
}
function pendant(B,x,y,z,s=1){ B(.36*s,.5*s,.36*s,M.glow,x,y,z); B(.012,1.6,.012,M.darkMetal,x,y+.25*s+.8,z); }
function bottles(B,x,y,z,w,rows=4){
  for(let r=0;r<rows;r++){ B(w,.04,.36,M.glowShelf,x,y+r*.55,z);
    const n=Math.floor(w/.24); for(let i=0;i<n;i++){ const hh=.18+((i*7+r)%3)*.05; B(.09,hh,.09,(i+r)%3?M.amber:M.gold,x-w/2+.15+i*.24,y+r*.55+.02+hh/2,z); } }
}
// lit interior room seen through the glass: one inward-facing box (floor, walls, glowing ceiling)
const back=m=>m.userData.back||(m.userData.back=Object.assign(m.clone(),{side:THREE.BackSide}));
function interior(w,h,d,floor,x=0,z0=-.05){
  const g=metreUV(new THREE.BoxGeometry(w,h,d)); const m=new THREE.Mesh(g,[M.wallIn,M.wallIn,M.ceilIn,floor,M.wallIn,M.wallIn]);
  m.material=m.material.map(back);
  m.position.set(x,h/2,z0-d/2); return m;
}
function shellB(B,w,h,d,mat,zf=0){
  B(.5,h,d+zf,mat,-w/2+.25,h/2,-(d+zf)/2-0); B(.5,h,d+zf,mat,w/2-.25,h/2,-(d+zf)/2);
  B(w,.6,d,mat,0,h-.3,-d/2); B(w,h,.5,mat,0,h/2,-d+.25);
}
function sofa(B,x,z,mat,ry=0,len=2.6){
  const c=Math.cos(ry), s=Math.sin(ry), P=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c];
  let p=P(0,0); B(len,.42,1,mat,p[0],.3,p[1],ry); p=P(0,-.42); B(len,.6,.22,mat,p[0],.7,p[1],ry);
  p=P(-len/2+.12,0); B(.24,.62,1,mat,p[0],.4,p[1],ry); p=P(len/2-.12,0); B(.24,.62,1,mat,p[0],.4,p[1],ry);
  p=P(-len/4,.05); B(len/2-.1,.14,.8,M.cushionIn,p[0],.58,p[1],ry); p=P(len/4,.05); B(len/2-.1,.14,.8,M.cushionIn,p[0],.58,p[1],ry);
}
// rounded-front footprint as a 2D shape (x, -z): front corners rounded with radius rc, inset from the outline by `ins`
function roundedPlan(w,d,rc,ins=0){
  const s=new THREE.Shape(), r=rc-ins;
  s.moveTo(-w/2+ins,d); s.lineTo(-w/2+ins,rc); s.absarc(-w/2+rc,rc,r,PI,1.5*PI,false);
  s.lineTo(w/2-rc,ins); s.absarc(w/2-rc,rc,r,1.5*PI,2*PI,false); s.lineTo(w/2-ins,d); s.closePath(); return s;
}
function planBand(B,shape,y0,hh,mat){ const g=new THREE.ExtrudeGeometry(shape,{depth:hh,bevelEnabled:false,curveSegments:20}); g.rotateX(-PI/2); g.translate(0,y0,0); B.geo(g,mat); }
// points along the front of a rounded plan (left side → corner → front → corner → right side)
function frontPath(w,rc,ins,sideDepth,step){
  const pts=[], add=(x,z,a)=>pts.push({x,z,a});
  for(let z=-sideDepth;z<-rc;z+=step) add(-w/2+ins,z,-PI/2);
  const r=rc-ins, n=Math.max(2,Math.round(r*PI/2/step));
  for(let i=0;i<=n;i++){ const t=PI+i/n*PI/2; add(-w/2+rc+Math.cos(t)*r,-(rc+Math.sin(t)*r),-(t-1.5*PI)); }
  for(let x=-w/2+rc+step;x<w/2-rc;x+=step) add(x,-ins,0);
  for(let i=0;i<=n;i++){ const t=1.5*PI+i/n*PI/2; add(w/2-rc+Math.cos(t)*r,-(rc+Math.sin(t)*r),-(t-1.5*PI)); }
  for(let z=-rc-step;z>-sideDepth;z-=step) add(w/2-ins,z,PI/2);
  return pts;
}

/* ---------------- five shop styles (after the reference designs) ---------------- */
// 1. perfume: travertine cube, three arches with thick stone surrounds, mashrabiya arch heads and tall screens
function shopPerfume(name){
  const g=new THREE.Group(), B=batch(g), w=18, h=9, d=14;
  const archP=(cx,r,sp,base=.35)=>{ const p=new THREE.Path(); p.moveTo(cx-r,base); p.lineTo(cx+r,base); p.lineTo(cx+r,sp); p.absarc(cx,sp,r,0,PI,false); p.lineTo(cx-r,base); return p; };
  const A=[[-5.6,1.7,4.2],[0,2.3,4.6],[5.6,1.7,4.2]];
  const s=new THREE.Shape(); s.moveTo(-w/2,0); s.lineTo(w/2,0); s.lineTo(w/2,h); s.lineTo(-w/2,h); s.closePath();
  for(const [cx,r,sp] of A) s.holes.push(archP(cx,r,sp));
  extrude(B,s,.8,M.travertine,-.8);
  for(const [cx,r,sp] of A){
    const o=new THREE.Shape(), R2=r+.5; o.moveTo(cx-R2,.35); o.lineTo(cx+R2,.35); o.lineTo(cx+R2,sp); o.absarc(cx,sp,R2,0,PI,false); o.lineTo(cx-R2,.35);
    o.holes.push(archP(cx,r,sp)); extrude(B,o,.4,M.limestone,0);
    const hs=new THREE.Shape(); hs.moveTo(cx-r,sp); hs.absarc(cx,sp,r,PI,0,true); hs.lineTo(cx-r,sp);
    const sc=new THREE.Mesh(scaleUV(new THREE.ShapeGeometry(hs,24),1/1.1),M.mashrabiya); sc.position.z=-.3; sc.castShadow=true; g.add(sc);
    B(2*r,.12,.14,M.bronze,cx,sp,-.3);
    if(cx===0) door(g,B,0,-.5,2*r-.3,sp-.4); else glazing(g,B,2*r,sp-.35,cx,.35,-.5,3,2);
  }
  for(const x of [-2.95,2.95]) mash(g,B,.95,6.4,x,.9,.06);
  for(const x of [-8.3,8.3]) mash(g,B,.8,5.4,x,1.2,.06);
  B(w+.6,.5,1.3,M.limestone,0,h+.25,-.4); B(w+.3,.36,1.05,M.limestone,0,.18,-.25);
  B(w-.4,.06,.06,M.glow,0,h-.12,.24);                                                   // warm light line under the cornice
  g.add(signPlate(name,5.6,.95,0,8.15,.04,'#c99a52'));
  shellB(B,w,h,d,M.travertine); g.add(interior(w-1.2,h-.8,d-1.6,M.marbleIn));
  for(const x of [-5.6,0,5.6]) bottles(B,x,1.1,-d+1.4,3.2,5);
  for(const x of [-8,8]) bottles(B,x,1.1,-6,1,5);
  const ctr=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,1,32),M.marbleIn); ctr.position.set(0,.5,-6.5); g.add(ctr);
  B(1.4,.9,.1,M.glow,0,6.3,-4); pendant(B,-5.6,5.6,-4,1.2); pendant(B,5.6,5.6,-4,1.2);
  B.done(); g.userData.spots=[-5.6,5.6]; g.userData.dispZ=-1.4;
  return g;
}
// 2. fashion: two floors with rounded corners, upper floor wrapped in bronze louvres, projecting stone portal
function shopFashion(name){
  const g=new THREE.Group(), B=batch(g), w=20, h=9.4, d=14, rc=2.8;
  planBand(B,roundedPlan(w,d,rc,0),0,.35,M.limestone);
  planBand(B,roundedPlan(w,d,rc,0),4.2,.7,M.limestone);
  planBand(B,roundedPlan(w,d,rc,0),h-.8,.8,M.limestone);
  planBand(B,roundedPlan(w,d,rc,.9),4.9,h-.8-4.9,M.wallGlow);                         // lit upper floor behind the louvres
  // ground-floor glass: straight runs plus the two curved corners
  for(const sx of [-1,1]){ glazing(g,B,4.0,3.85,sx*5.2,.35,-.35,3,1);
    const cg=new THREE.Mesh(new THREE.CylinderGeometry(rc-.35,rc-.35,3.85,20,1,true,sx<0?1.5*PI:0,PI/2),M.glass); cg.position.set(sx*(w/2-rc),.35+3.85/2,-rc); g.add(cg);
    for(let k=1;k<3;k++){ const t=(sx<0?1.5*PI:0)+k*PI/6; B(.07,3.85,.07,M.bronze,sx*(w/2-rc)+Math.sin(t)*(rc-.35),.35+3.85/2,-rc+Math.cos(t)*(rc-.35)); } }
  // louvres on the upper floor
  const P=frontPath(w,rc,.12,6,.34), fin=metreUV(new THREE.BoxGeometry(.06,3.5,.42)), fins=new THREE.InstancedMesh(fin,M.bronze,P.length), o=new THREE.Object3D();
  P.forEach((p,i)=>{ o.position.set(p.x,4.9+1.75+.05,p.z); o.rotation.set(0,p.a,0); o.updateMatrix(); fins.setMatrixAt(i,o.matrix); });
  fins.castShadow=fins.receiveShadow=true; g.add(fins);
  // portal: thick stone frame with a rounded opening and a tall bronze door
  const ps=new THREE.Shape(); ps.moveTo(-3.3,0); ps.lineTo(3.3,0); ps.lineTo(3.3,8.6); ps.lineTo(-3.3,8.6); ps.closePath();
  const ho=new THREE.Path(), r=1.1; ho.moveTo(-2,0); ho.lineTo(2,0); ho.lineTo(2,7-r); ho.quadraticCurveTo(2,7,2-r,7); ho.lineTo(-2+r,7); ho.quadraticCurveTo(-2,7,-2,7-r); ho.lineTo(-2,0); ps.holes.push(ho);
  extrude(B,ps,1.7,M.limestone,-.2,{bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:2});
  door(g,B,0,-.1,3.2,6.2); B(3.6,.1,.1,M.glow,0,6.95,1.2);
  for(let k=0;k<3;k++) B(5.6-k*.4,.15,.5,M.limestone,0,.075+k*.15-.15,1.75+(2-k)*.45);
  g.add(signPlate(name,4.6,.8,0,7.8,1.52,'#7a5a34'));
  B(.5,h,d-rc,M.limestone,-w/2+.25,h/2,-rc-(d-rc)/2); B(.5,h,d-rc,M.limestone,w/2-.25,h/2,-rc-(d-rc)/2); B(w,h,.5,M.limestone,0,h/2,-d+.25);
  // inside: marble floor and ceiling following the rounded front, rails, mannequins
  const fl=new THREE.Mesh(new THREE.ShapeGeometry(roundedPlan(w,d,rc,.4),12),M.marbleIn); fl.rotation.x=-PI/2; fl.position.y=.36; g.add(fl);
  const ce=new THREE.Mesh(new THREE.ShapeGeometry(roundedPlan(w,d,rc,.4),12),M.ceilIn); ce.rotation.x=PI/2; ce.scale.y=-1; ce.position.y=4.18; g.add(ce);
  g.add(interior(w-1.4,3.8,d-3,M.marbleIn,0,-2.5));
  const dress=new THREE.LatheGeometry([[0,0],[.28,0],[.22,.5],[.16,.9],[.13,1.2],[.17,1.4],[.08,1.55],[.09,1.7],[0,1.78]].map(v=>new THREE.Vector2(v[0],v[1])),16);
  for(const [x,z,m] of [[-6.4,-1.4,M.cushionIn],[-4.3,-1.6,M.leather],[4.4,-1.5,M.soft],[6.5,-1.4,M.cushionIn]]){
    const mm=new THREE.Mesh(dress,m); mm.position.set(x,.75,z); g.add(mm); B(.7,.4,.7,M.marbleIn,x,.55,z); }
  for(const x of [-7,-3.5,3.5,7]) { B(.05,1.7,2.6,M.gold,x,2,-6); for(let k=0;k<7;k++) B(.4,1.05,.06,k%2?M.soft:M.leather,x,1.5,-7.1+k*.36); }
  B.done(); g.userData.spots=[-5.4,5.4]; g.userData.dispZ=-2.6; g.userData.foot={hw:w/2,front:1.7};
  return g;
}
// 3. furniture: tall glass hall under a deep stone canopy with a wooden ceiling, lower wings, open loggia
function shopFurniture(name){
  const g=new THREE.Group(), B=batch(g), d=14;
  // central hall
  B(.9,10.4,d,M.travertine,-4.95,5.2,-d/2); B(.6,10.4,d,M.travertine,4.8,5.2,-d/2);
  B(10.7,.9,d+2.6,M.travertine,0,10.15,-d/2+1.3); B(10.5,.08,2.6,M.soffit,0,9.66,1.3);             // canopy + wood soffit
  glazing(g,B,9,9.3,0,.3,-.3,4,2);
  for(const x of [-4.1,-3.25]) mash(g,B,.8,9.2,x,.3,.08);
  door(g,B,0,.6,3,3.6); B(3.6,.25,1.3,M.bronze,0,3.95,.4);
  g.add(signPlate(name,5,.8,0,10.15,1.32+1.3,'#f3e3c3'));
  g.add(interior(9.4,9.6,d-1.2,M.woodIn,-.1,-.4));
  for(const [x,y] of [[-1.6,7.6],[-.6,6.8],[.5,7.3],[1.5,6.5],[0,8.2]]) pendant(B,x,y,-3.2,1.3);
  // left wing with an open loggia (wood ceiling) and a glass wall set back
  B(6.2,.8,d,M.travertine,-8.4,5.8,-d/2); B(5.6,.06,3.4,M.soffit,-8.2,5.37,-1.7); B(.7,6.2,d,M.travertine,-11.15,3.1,-d/2);
  glazing(g,B,5.4,5,-8.1,.3,-3.4,3,1); g.add(interior(5.4,5.2,d-4,M.woodIn,-8.1,-3.5));
  const lp=plane(5.6,3.4,M.paving,-8.2,.02,-1.7); g.add(lp);
  sofa(B,-8.2,-1.8,M.cushionOut,0,2.4); B(1.1,.35,.6,M.woodOut,-8.2,.18,-.7);
  B(.12,1.5,.12,M.bronze,-10.2,.75,-2.4); B(.5,.4,.5,M.glow,-10.2,1.6,-2.4);
  // right wing: glass shop front with a screen at the corner
  B(6.3,1.1,d,M.travertine,8.1,6.05,-d/2); B(.6,6.6,d,M.travertine,10.95,3.3,-d/2);
  glazing(g,B,5,5.2,7.6,.3,-.3,3,1); mash(g,B,.6,5.6,10.35,.3,.1); g.add(interior(5.4,5.4,d-1.2,M.woodIn,7.9,-.4));
  B(23.2,.35,1.1,M.travertine,0,.17,.0); B(.4,6.2,d,M.travertine,-11.3,3.1,-d/2); B(23,10.4,.5,M.travertine,0,5.2,-d+.25);
  sofa(B,-1.8,-4.8,M.cushionIn,0); sofa(B,2.2,-6.2,M.cushionIn,0); sofa(B,7.8,-4,M.cushionIn,0); B(1.2,.38,.7,M.woodIn,-1.8,.19,-3.6); B(1.2,.38,.7,M.woodIn,2.2,.19,-5);
  for(let k=0;k<3;k++) B(2.6,.04,.4,M.glowShelf,-3,1.2+k*.9,-d+1.2);
  B.done(); g.userData.spots=[-2.6,2.6,7.6]; g.userData.dispZ=-1.5; g.userData.foot={hw:11.5,front:.9};
  return g;
}
// 4. electronics: low travertine pavilion with rounded corners, roof garden, bronze columns, screened corners
function shopTech(name){
  const g=new THREE.Group(), B=batch(g), w=20, h=6.4, d=14, rc=2.2;
  planBand(B,roundedPlan(w,d,rc,0),0,.3,M.travertine);
  planBand(B,roundedPlan(w+.6,d,rc+.3,0),5.0,1.4,M.travertine);
  B(w-.6,.06,.06,M.glow,0,4.94,.15);
  glazing(g,B,w-2*rc,4.7,0,.3,-.25,8,1);
  for(const sx of [-1,1]){
    const cg=new THREE.Mesh(new THREE.CylinderGeometry(rc-.25,rc-.25,4.7,18,1,true,sx<0?1.5*PI:0,PI/2),M.glass); cg.position.set(sx*(w/2-rc),2.65,-rc); g.add(cg);
    const cm=new THREE.Mesh(new THREE.CylinderGeometry(rc,rc,4.6,18,1,true,sx<0?1.5*PI:0,PI/2),M.mashrabiya);
    scaleUV(cm.geometry,1); { const uv=cm.geometry.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*3.4/1.1,uv.getY(i)*4.6/1.1); }
    cm.position.set(sx*(w/2-rc),2.65,-rc); cm.castShadow=true; g.add(cm);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,4.7,24),M.bronze); col.position.set(sx*3.4,2.65,.1); col.castShadow=true; g.add(col);
  }
  door(g,B,0,-.1,2.8,3.9); B(3.4,.25,.6,M.bronze,0,4.2,.15);
  g.add(signPlate(name,5,.75,0,5.7,.36,'#7a5a34'));
  B(.5,h,d-rc,M.travertine,-w/2+.25,h/2,-rc-(d-rc)/2); B(.5,h,d-rc,M.travertine,w/2-.25,h/2,-rc-(d-rc)/2); B(w,h,.5,M.travertine,0,h/2,-d+.25);
  B(w-1,.3,d-1.5,M.mulch,0,6.45,-d/2);                                                  // roof garden soil
  const fl=new THREE.Mesh(new THREE.ShapeGeometry(roundedPlan(w,d,rc,.3),12),M.marbleIn); fl.rotation.x=-PI/2; fl.position.y=.31; g.add(fl);
  g.add(interior(w-1.2,4.6,d-2.6,M.marbleIn,0,-2.4));
  const ce=new THREE.Mesh(new THREE.ShapeGeometry(roundedPlan(w,d,rc,.3),12),M.ceilIn); ce.rotation.x=PI/2; ce.scale.y=-1; ce.position.y=4.98; g.add(ce);
  for(let i=0;i<6;i++){ const x=-5.5+(i%3)*5.5, z=-4.4-Math.floor(i/3)*3.6;
    B(3.4,.07,1.2,M.woodIn,x,.86,z); B(.14,.82,.9,M.woodIn,x-1.4,.41,z); B(.14,.82,.9,M.woodIn,x+1.4,.41,z);
    for(let k=0;k<4;k++) B(.48,.025,.32,M.screen,x-1.15+k*.77,.91,z); }
  for(const x of [-6,0,6]){ B(2.6,1.5,.08,M.screenArt,x,2.8,-d+.6); }
  for(const x of [-8.6,8.6]) for(let k=0;k<4;k++) B(.4,.04,2.2,M.glowShelf,x,1.2+k*.7,-7);
  B.done(); g.userData.spots=[-5.8,-2.6,2.6,5.8]; g.userData.dispZ=-1.3; g.userData.roof={y:6.6,w:w-1.6,d:d-2};
  return g;
}
// 5. jewellery: glass ground floor under a cube wrapped in gold mashrabiya
function shopJewel(name){
  const g=new THREE.Group(), B=batch(g), w=15, h=9.6, d=12;
  B(.6,h,d,M.travertine,-w/2+.3,h/2,-d/2); B(.6,h,d,M.travertine,w/2-.3,h/2,-d/2);
  B(w+.4,.45,d+.4,M.travertine,0,h-.2,-d/2+.2); B(w,4.8,.4,M.wallGlow,0,6.6,-1.3); B(w,.35,d,M.travertine,0,.17,-d/2);
  B(w,.25,1.3,M.soffit,0,4.05,-.6);
  mash(g,B,w-.1,4.9,0,4.2,.1,0,1.4);
  for(const sx of [-1,1]){ const p=mash(g,B,5.5,4.9,sx*(w/2+.06),4.2,-2.75,PI/2,1.4); }
  B(w+.2,.12,.18,M.gold,0,4.2,.12); B(w+.2,.12,.18,M.gold,0,9.1,.12);
  glazing(g,B,w-1.4,3.6,0,.35,-1.2,5,1);
  door(g,B,0,-1.05,2.4,3.3);
  g.add(signPlate(name,4.6,.7,0,3.95,.14,'#d9b56c'));
  B(w,h,.5,M.travertine,0,h/2,-d+.25);
  g.add(interior(w-1.4,3.8,d-2.8,M.marbleIn,0,-1.4));
  for(let i=0;i<5;i++){ const x=-5+i*2.5; B(1.5,.95,.7,M.marbleIn,x,.48,-4.6); g.add(glassBox(1.4,.45,.6,x,1.18,-4.6)); B(.9,.04,.4,M.glowShelf,x,.98,-4.6); }
  for(let k=0;k<3;k++) B(w-3,.05,.35,M.glowShelf,0,1.2+k*.8,-d+1.6);
  B.done(); g.userData.spots=[-4.6,-1.8,1.8,4.6]; g.userData.dispZ=-2.3; g.userData.foot={hw:w/2+.2,front:.2};
  return g;
}
function glassBox(w,h,d,x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M.glass); m.position.set(x,y,z); return m; }
const SHOPS=[['دار العطور',shopPerfume],['أزياء الرمال',shopFashion],['أثاث النخلة',shopFurniture],
             ['إلكترونيات المستقبل',shopTech],['مجوهرات اللؤلؤ',shopJewel]];
export const FACADE_NAMES=['أقواس ومشربية','شرائح برونز منحنية','واجهة زجاج بإطار حجر','حجر بفتحة دائرية الزوايا','مشربية ذهبية كاملة'];

/* ---------------- a real shop's products in its window ---------------- */
const photoLoader=new THREE.TextureLoader(); photoLoader.setCrossOrigin('anonymous');
function productLabel(l){
  return canvasTex(256,256,(x,w,h)=>{
    const col=/^#[0-9a-f]{6}$/i.test(l.color)?l.color:'#d9cbb3'; x.fillStyle=col; x.fillRect(0,0,w,h);
    x.fillStyle='rgba(255,255,255,.9)'; x.fillRect(16,86,w-32,84);
    x.fillStyle='#2a2118'; x.textAlign='center'; x.textBaseline='middle'; x.direction='rtl';
    const t=String(l.name||'').slice(0,30); let sz=40; do{ x.font=`800 ${sz}px ${FONT}`; sz-=2; }while(x.measureText(t).width>w-44&&sz>12);
    x.fillText(t,w/2,128);
  });
}
function priceTag(price){
  return canvasTex(256,96,(x,w,h)=>{ x.fillStyle='#fbf7ef'; x.fillRect(0,0,w,h); x.fillStyle='#2a2118'; x.textAlign='center'; x.textBaseline='middle';
    x.font=`800 54px ${FONT}`; x.fillText('$'+(+price).toLocaleString('en-US',{maximumFractionDigits:2}),w/2,h/2+3); });
}
function windowDisplay(g,store){
  const spots=g.userData.spots||[-6,-3,0,3,6], z=g.userData.dispZ??-1.7;
  const lines=(Array.isArray(store.lines)?store.lines:[]).filter(l=>l&&l.name).slice(0,spots.length);
  const used=lines.length<spots.length?spots.slice(Math.floor((spots.length-lines.length)/2)):spots;
  lines.forEach((l,i)=>{
    const x=used[i];
    g.add(box(1.1,.95,.7,M.marbleIn,x,.475,z,{cast:false}));
    const map=mediaOk(l.img)?photoLoader.load(l.img,t=>{t.colorSpace=THREE.SRGBColorSpace;}):productLabel(l);
    const pm=new THREE.MeshStandardMaterial({map,emissive:'#fff',emissiveMap:map,emissiveIntensity:.35,roughness:.6});
    const ph=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.3),pm); ph.position.set(x,1.8,z); g.add(ph);
    g.add(box(1.42,1.42,.04,M.gold,x,1.8,z-.03,{cast:false,uv:false}));
    if(+l.price>0){ const tg=new THREE.Mesh(new THREE.PlaneGeometry(.5,.19),new THREE.MeshStandardMaterial({map:priceTag(l.price),emissive:'#fff',
      emissiveMap:null,emissiveIntensity:.15,roughness:.7})); tg.material.emissiveMap=tg.material.map; tg.position.set(x,.72,z+.36); g.add(tg); }
  });
}

/* ---------------- date palms: every one built differently ---------------- */
function frondTex(dry){
  return canvasTex(512,128,(x,w,h)=>{
    x.clearRect(0,0,w,h);
    for(let i=10;i<w-4;i+=4){ const t=i/w, len=(h*.5)*Math.pow(Math.sin(Math.min(1,t*1.08)*PI*.95),.6)*(.78+((i*7)%13)/45);
      const hue=dry?30+((i*3)%9):68+((i*5)%16), sat=dry?38:28+t*22, lig=dry?36+((i*7)%12):(22+t*18+((i*11)%9));
      x.strokeStyle=`hsl(${hue},${sat}%,${lig}%)`; x.lineWidth=2.4-t*1.3;
      for(const sg of [-1,1]){ if(((i*13+(sg>0?5:0))%19)===0) continue;
        x.beginPath(); x.moveTo(i,h/2); x.quadraticCurveTo(i+len*.25,h/2+sg*len*.55,i+len*.6,h/2+sg*len*.98); x.stroke(); } }
    x.strokeStyle=dry?'#7a5a32':'#9a9a58'; x.lineWidth=3; x.beginPath(); x.moveTo(0,h/2); x.lineTo(w,h/2); x.stroke();
  });
}
function barkTex(){
  const t=canvasTex(256,512,(x,w,h)=>{
    x.fillStyle='#4a3a28'; x.fillRect(0,0,w,h);
    const cw=64, rh=40;
    for(let j=-1;j<h/rh+1;j++) for(let i=-1;i<w/cw+1;i++){ const cx=i*cw+(((j%2)+2)%2)*cw/2, cy=j*rh;
      const gr=x.createLinearGradient(cx,cy-rh*.5,cx,cy+rh*.7); gr.addColorStop(0,'#a58a66'); gr.addColorStop(.55,'#806848'); gr.addColorStop(1,'#3a2c1e');
      x.fillStyle=gr; x.beginPath(); x.moveTo(cx-cw*.56,cy-rh*.45); x.quadraticCurveTo(cx,cy+rh*.95,cx+cw*.56,cy-rh*.45); x.quadraticCurveTo(cx,cy+rh*.15,cx-cw*.56,cy-rh*.45); x.fill(); }
  });
  t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
let PM=null;
function palmMats(){
  if(PM) return PM;
  const bark=barkTex(); bark.repeat.set(3,16);
  const fm=(dry,tint)=>new THREE.MeshStandardMaterial({map:frondTex(dry),color:tint,alphaTest:.4,side:THREE.DoubleSide,roughness:dry?.9:.65});
  PM={fronds:[fm(false,'#ffffff'),fm(false,'#e6f0d8'),fm(false,'#fff2d6')],dry:fm(true,'#ffffff'),
      bark:new THREE.MeshStandardMaterial({map:bark,bumpMap:bark,bumpScale:4,roughness:.95}),dates:new THREE.MeshStandardMaterial({color:'#a2551c',roughness:.45})};
  return PM;
}
function frondGeo(L,elev,droop,width,fold){
  const segs=12, pos=[], uv=[], idx=[];
  for(let s=0;s<=segs;s++){ const t=s/segs, xx=L*t*Math.cos(elev), yy=L*t*Math.sin(elev)-droop*L*t*t;
    const wv=width*Math.pow(Math.sin(Math.min(1,t*1.1+.05)*PI*.95),.7)*(1-.35*t);
    for(const k of [-1,0,1]){ pos.push(xx,yy+(k?wv*fold:0),k*wv); uv.push(t,(k+1)/2); } }
  for(let s=0;s<segs;s++) for(let k=0;k<2;k++){ const a=s*3+k, b=a+1, c=a+3, e=a+4; idx.push(a,c,b,b,c,e); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function makePalm(h){
  const P=palmMats(), g=new THREE.Group(), lx=R(-.6,.6), lz=R(-.4,.4);
  const tg=new THREE.CylinderGeometry(.26,.36,h,14,18,true), p=tg.attributes.position;
  for(let k=0;k<p.count;k++){ const t=(p.getY(k)+h/2)/h, b=1+.05*Math.sin(t*11+lx*7); p.setXYZ(k,p.getX(k)*b+lx*t*t,p.getY(k),p.getZ(k)*b+lz*t*t); }
  tg.translate(0,h/2,0); tg.computeVertexNormals();
  const tr=new THREE.Mesh(tg,P.bark); tr.castShadow=tr.receiveShadow=true; g.add(tr);
  const top=new THREE.Vector3(lx,h,lz), green=[], dry=[], n=Math.floor(R(28,42)), droop=R(.22,.42), spread=R(.9,1.18), wid=R(.45,.6);
  for(let i=0;i<n;i++){ const t=i/n, isDry=t<.14&&rnd()<.75;
    const elev=isDry?R(-1.35,-.95):(-.45+t*1.85+R(-.15,.15)), L=(isDry?R(2.2,3):R(2.6,3.9))*spread*(t>.85?.7:1);
    const fg=frondGeo(L,elev,isDry?.05:droop*(1-t*.6),wid*R(.85,1.1),R(.25,.45));
    fg.rotateY(i*2.39996+R(-.25,.25)); fg.translate(top.x,top.y-.1-(1-t)*.55,top.z); (isDry?dry:green).push(fg); }
  const cg=new THREE.Mesh(mergeGeometries(green),P.fronds[Math.floor(rnd()*3)]); cg.castShadow=true; g.add(cg);
  if(dry.length){ const dg=new THREE.Mesh(mergeGeometries(dry),P.dry); dg.castShadow=true; g.add(dg); }
  const boot=new THREE.Mesh(new THREE.CylinderGeometry(.44,.3,1.2,12),P.bark); boot.position.set(top.x,top.y-.55,top.z); g.add(boot);
  if(rnd()<.45){ const ds=[]; const nc=2+Math.floor(rnd()*3);
    for(let c=0;c<nc;c++){ const a=rnd()*TAU; for(let k=0;k<24;k++){ const s=new THREE.IcosahedronGeometry(.055,0);
      s.translate(top.x+Math.cos(a)*(.5+R(0,.15))+R(-.12,.12),top.y-.7-R(0,.6),top.z+Math.sin(a)*(.5+R(0,.15))+R(-.12,.12)); ds.push(s); } }
    g.add(new THREE.Mesh(mergeGeometries(ds),P.dates)); }
  return g;
}

/* ---------------- street furniture ---------------- */
// bronze lantern post with mashrabiya glass box
function lamp(B,S,x,z){
  B(.44,.5,.44,M.travertine,x,CURB+.25,z);
  const sh=new THREE.CylinderGeometry(.07,.11,3.6,4,1); sh.rotateY(PI/4); sh.translate(x,CURB+.5+1.8,z); B.geo(sh,M.bronze);
  for(const y of [.62,1.5,4.05]) B(.22,.07,.22,M.bronze,x,CURB+y,z);
  const ly=CURB+4.5; B(.2,.5,.2,M.glow,x,ly,z);
  for(let k=0;k<4;k++){ const a=k*PI/2, pn=new THREE.Mesh(panelGeo(.4,.6,.55),M.mashrabiya); pn.position.set(x+Math.sin(a)*.2,ly,z+Math.cos(a)*.2); pn.rotation.y=a; S.add(pn); }
  for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) B(.045,.64,.045,M.bronze,x+sx*.2,ly,z+sz*.2);
  B(.5,.05,.5,M.bronze,x,ly-.33,z);
  const cap=new THREE.ConeGeometry(.37,.32,4); cap.rotateY(PI/4); cap.translate(x,ly+.47,z); B.geo(cap,M.bronze);
  const fin=new THREE.SphereGeometry(.05,8,6); fin.translate(x,ly+.68,z); B.geo(fin,M.bronze);
}
function bollardLight(B,x,z){ B(.2,.9,.2,M.bronze,x,CURB+.45,z); B(.05,.55,.215,M.glow,x,CURB+.5,z); B(.215,.55,.05,M.glow,x,CURB+.5,z); }
function floorLantern(B,S,x,z,s=1){
  B(.5*s,.06,.5*s,M.bronze,x,CURB+.03,z); B(.5*s,.06,.5*s,M.bronze,x,CURB+1.17*s,z); B(.24*s,.9*s,.24*s,M.glow,x,CURB+.6*s,z);
  for(let k=0;k<4;k++){ const a=k*PI/2, pn=new THREE.Mesh(panelGeo(.46*s,1.1*s,.55),M.mashrabiya); pn.position.set(x+Math.sin(a)*.23*s,CURB+.6*s,z+Math.cos(a)*.23*s); pn.rotation.y=a; S.add(pn); }
}
function bench(B,S,x,z,ry=0){
  const c=Math.cos(ry), s=Math.sin(ry), P=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c];
  for(const sx of [-1,1]){ const [px,pz]=P(sx*1.05,0); const pn=new THREE.Mesh(panelGeo(.55,.42,.5),M.mashrabiya); pn.position.set(px,CURB+.21,pz); pn.rotation.y=ry+PI/2; S.add(pn);
    B(.05,.42,.05,M.bronze,...P(sx*1.05,.27).flatMap((v,i)=>i?[CURB+.21,v]:[v]),ry); B(.05,.42,.05,M.bronze,...P(sx*1.05,-.27).flatMap((v,i)=>i?[CURB+.21,v]:[v]),ry); }
  let p=P(0,0); B(2.3,.1,.62,M.travertine,p[0],CURB+.47,p[1],ry); B(2.1,.12,.52,M.cushionOut,p[0],CURB+.58,p[1],ry);
  p=P(-.75,-.12); const bol=new THREE.CylinderGeometry(.11,.11,.5,14); bol.rotateZ(PI/2); bol.rotateY(ry); bol.translate(p[0],CURB+.74,p[1]); B.geo(bol,M.cushionOut);
}
let _pot=null;
function potGeo(){ return _pot||(_pot=new THREE.LatheGeometry([[0,0],[.3,0],[.42,.14],[.5,.45],[.52,.75],[.46,1],[.49,1.05],[.43,1.06],[.41,1]].map(v=>new THREE.Vector2(v[0],v[1])),28)); }
function bigPot(B,x,z,s=1){ const g=potGeo().clone(); g.scale(s,s,s); g.translate(x,CURB,z); B.geo(g,M.bronzePot);
  const so=new THREE.CircleGeometry(.41*s,20); so.rotateX(-PI/2); so.translate(x,CURB+.98*s,z); B.geo(so,M.mulch); return CURB+.98*s; }
function pool(B,S,x,z,w,d,bowl=false){
  B(w+.5,.4,.25,M.travertine,x,CURB+.2,z+d/2+.12); B(w+.5,.4,.25,M.travertine,x,CURB+.2,z-d/2-.12);
  B(.25,.4,d,M.travertine,x+w/2+.12,CURB+.2,z); B(.25,.4,d,M.travertine,x-w/2-.12,CURB+.2,z);
  B(w,.05,d,M.poolTile,x,CURB+.02,z);
  const wt=new THREE.Mesh(new THREE.PlaneGeometry(w,d),M.pool); wt.rotation.x=-PI/2; wt.position.set(x,CURB+.3,z); wt.receiveShadow=true; S.add(wt);
  if(bowl){ const bg=new THREE.LatheGeometry([[0,0],[.22,0],[.22,.38],[.55,.44],[.95,.62],[1.06,.78],[1.0,.8],[.9,.68],[0,.64]].map(v=>new THREE.Vector2(v[0],v[1])),36);
    bg.translate(x,CURB+.25,z); B.geo(bg,M.ceramic);
    const wd=new THREE.Mesh(new THREE.CircleGeometry(.9,32),M.pool); wd.rotation.x=-PI/2; wd.position.set(x,CURB+.97,z); S.add(wd);
    const jet=new THREE.Mesh(new THREE.CylinderGeometry(.015,.04,.5,8),M.jet); jet.position.set(x,CURB+1.2,z); S.add(jet); }
}
function armchair(B,x,z,ry){
  const c=Math.cos(ry), s=Math.sin(ry), P=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c];
  let p=P(0,0); B(.85,.36,.8,M.rattan,p[0],CURB+.2,p[1],ry); B(.72,.14,.66,M.cushionOut,p[0],CURB+.45,p[1],ry);
  p=P(0,-.34); B(.85,.5,.14,M.rattan,p[0],CURB+.62,p[1],ry); p=P(0,-.25); B(.7,.38,.12,M.cushionOut,p[0],CURB+.72,p[1],ry);
  for(const sx of [-1,1]){ p=P(sx*.38,0); B(.12,.3,.8,M.rattan,p[0],CURB+.53,p[1],ry); }
}
function sideTable(B,S,x,z){ const t=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.5,20,1,true),M.mashrabiya);
  { const uv=t.geometry.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*2.1/.5,uv.getY(i)*.5/.5); }
  t.position.set(x,CURB+.25,z); S.add(t); const top=new THREE.CylinderGeometry(.36,.36,.04,24); top.translate(x,CURB+.52,z); B.geo(top,M.bronze); }

/* ---------------- cars (generic, no make or badge) ---------------- */
const PAINTS=['#f2f2f0','#111214','#9ea3a8','#3a3f45','#d8c7a8','#1c2c4a','#5a1a22','#ffffff','#2f3a33'];
let carGeo=null;
function carGeometry(){
  if(carGeo) return carGeo;
  const s=new THREE.Shape(); s.moveTo(-2.32,.34); s.lineTo(-1.92,.34);
  s.absarc(-1.45,.36,.45,PI,0,true); s.lineTo(1.0,.34); s.absarc(1.45,.36,.45,PI,0,true); s.lineTo(2.3,.34);
  s.quadraticCurveTo(2.44,.4,2.42,.62); s.quadraticCurveTo(2.4,.8,2.05,.86); s.lineTo(.92,.98);
  s.quadraticCurveTo(.45,1.3,.05,1.42); s.lineTo(-.95,1.44); s.quadraticCurveTo(-1.55,1.42,-1.95,1.04);
  s.lineTo(-2.3,.98); s.quadraticCurveTo(-2.46,.72,-2.32,.34);
  const body=new THREE.ExtrudeGeometry(s,{depth:1.66,bevelEnabled:true,bevelThickness:.09,bevelSize:.08,bevelSegments:4,curveSegments:14});
  body.translate(0,0,-.83);
  const w=new THREE.Shape(); w.moveTo(.82,1.02); w.quadraticCurveTo(.4,1.3,.02,1.38); w.lineTo(-.95,1.39);
  w.quadraticCurveTo(-1.5,1.37,-1.86,1.06); w.lineTo(.82,1.02);
  const win=new THREE.ExtrudeGeometry(w,{depth:1.9,bevelEnabled:false,curveSegments:10}); win.translate(0,0,-.95);
  const tire=new THREE.CylinderGeometry(.36,.36,.26,22); tire.rotateX(PI/2);
  const rim=new THREE.CylinderGeometry(.23,.23,.27,14); rim.rotateX(PI/2);
  carGeo={body,win,tire,rim}; return carGeo;
}
const carGlass=()=>M.carGlass||(M.carGlass=new THREE.MeshStandardMaterial({color:'#0c1014',metalness:.9,roughness:.05,envMapIntensity:1.5}));
function makeCar(paint,suv){
  const {body,win,tire,rim}=carGeometry(), g=new THREE.Group(), shellG=new THREE.Group(); g.add(shellG);
  const pm=new THREE.MeshPhysicalMaterial({color:paint,metalness:.55,roughness:.32,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.2});
  const b=new THREE.Mesh(body,pm); b.castShadow=true; b.receiveShadow=true; shellG.add(b);
  shellG.add(new THREE.Mesh(win,carGlass()));
  const trim=M.darkMetal;
  shellG.add(box(.06,.14,1.4,trim,2.44,.5,0,{uv:false}), box(.05,.12,1.5,trim,-2.4,.5,0,{uv:false}));            // grille + rear trim
  for(const z of [-.62,.62]){ shellG.add(box(.06,.09,.34,M.lamp,2.42,.68,z,{cast:false,uv:false}));
    const tl=box(.05,.08,.38,new THREE.MeshStandardMaterial({color:'#5a0a0a',emissive:'#ff1a1a',emissiveIntensity:.6}),-2.38,.8,z,{cast:false,uv:false}); shellG.add(tl); }
  const wheels=[];
  for(const x of [-1.45,1.45]) for(const z of [-.8,.8]){
    const wg=new THREE.Group(); wg.position.set(x,.36,z);
    const t=new THREE.Mesh(tire,M.rubber); t.castShadow=true; const r=new THREE.Mesh(rim,M.alloy||(M.alloy=new THREE.MeshStandardMaterial({color:'#c8ccd0',metalness:1,roughness:.25})));
    wg.add(t,r); g.add(wg); wheels.push(wg);
  }
  if(suv){ shellG.scale.set(1.02,1.16,1.08); for(const w of wheels){ w.scale.setScalar(1.12); w.position.y=.4; w.position.z*=1.08; } shellG.position.y=.05; }
  // mirrors, black sills, door shut lines, chrome belt line, handles and blank number plates
  const plastic=M.plastic||(M.plastic=new THREE.MeshStandardMaterial({color:'#17181a',roughness:.65}));
  const chrome=M.chrome||(M.chrome=new THREE.MeshStandardMaterial({color:'#d9dde0',metalness:1,roughness:.12}));
  const plate=M.plate||(M.plate=new THREE.MeshStandardMaterial({color:'#f3f3ee',roughness:.4}));
  for(const sd of [-1,1]){ const z=sd*.93;
    const mr=box(.22,.12,.14,pm,.62,1.02,sd*1.0,{uv:false}); shellG.add(mr);
    shellG.add(box(1.85,.13,.03,plastic,0,.42,z,{cast:false,uv:false}));
    shellG.add(box(2.7,.02,.025,chrome,-.5,.985,z,{cast:false,uv:false}));
    for(const lx of [-.42,.72]) shellG.add(box(.012,.52,.02,plastic,lx,.7,z,{cast:false,uv:false}));
    for(const hx of [-.62,.5]) shellG.add(box(.16,.03,.03,chrome,hx,.86,z+sd*.01,{cast:false,uv:false}));
  }
  shellG.add(box(.02,.13,.52,plate,2.49,.44,0,{cast:false,uv:false}), box(.02,.13,.52,plate,-2.45,.6,0,{cast:false,uv:false}));
  shellG.add(box(.1,.16,1.7,plastic,2.36,.36,0,{cast:false,uv:false}), box(.1,.16,1.7,plastic,-2.3,.38,0,{cast:false,uv:false}));
  g.userData.wheels=wheels; return g;
}

/* ---------------- the street ---------------- */
export class Street {
  constructor(renderer,{hi=true,stores=[]}={}){
    this.r=renderer; this.hi=hi; this.stores=stores; this.slots=[]; maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const S=this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(55,1,.1,1400); this.camera.rotation.order='YXZ';
    makeMaterials();
    this.colliders=[]; this.plants=[]; this.cars=[]; this.npcs=[]; this.keys={}; this.joy={x:0,y:0};
    this.yaw=.3; this.pitch=.16; this.dist=7.5; this.t=0;

    // sun: shadows follow the player
    this.sun=new THREE.DirectionalLight('#ffcf98',5.2); this.sun.castShadow=true;
    const mobile=matchMedia('(pointer:coarse)').matches; this.mobile=mobile;
    const sz=hi?4096:1024, ext=hi?34:30; this.sun.shadow.mapSize.set(sz,sz);
    const sc=this.sun.shadow.camera; sc.left=-ext; sc.right=ext; sc.top=ext; sc.bottom=-ext; sc.near=1; sc.far=220;
    this.sun.shadow.bias=-.0004; this.sun.shadow.normalBias=.03;
    S.add(this.sun,this.sun.target);
    this.sunDir=new THREE.Vector3(.62,.44,.66).normalize();     // late-afternoon sun: low, warm, long shadows
    S.fog=new THREE.Fog('#eadfcf',150,600);

    this.buildGround(); this.buildShops(); this.buildCanal(); this.buildSkyline(); this.buildProps(); this.buildCars(); this.buildPeople();
    // only the people get an ink outline
    // sky light is a soft fill; the sun does the modelling (shadows). Metal and glass keep full reflections.
    S.traverse(o=>{ if(!o.isMesh) return; for(const m of [].concat(o.material)){ if(m.isMeshToonMaterial) continue;
      m.userData.outlineParameters={visible:false}; if(m.userData.env===undefined){ m.userData.env=1; m.envMapIntensity=m===M.glass?.55:(m.transparent||m.metalness>.5)?1.0:.36; }
      if(m.transparent||m.alphaTest>0||m.isShaderMaterial) o.userData.noAO=true; } });
    this.outline=makeOutline(renderer);
    if(hi){ const size=renderer.getDrawingBufferSize(new THREE.Vector2());
      this.composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,samples:4}));
      this.composer.addPass(new OutlineScenePass(this.outline,S,this.camera));
      this.ao=new StreetAO(S,this.camera,size.x,size.y); this.ao.updateGtaoMaterial({radius:1.0,distanceExponent:1.5,thickness:1.4,scale:1.1,samples:16});
      this.ao.blendIntensity=.85; this.composer.addPass(this.ao); this.composer.addPass(new OutputPass()); }
  }
  async loadSky(){
    const hdr=await new RGBELoader(manager).loadAsync('textures/sky_afternoon.hdr');
    hdr.mapping=THREE.EquirectangularReflectionMapping;
    const pm=new THREE.PMREMGenerator(this.r); this.scene.environment=pm.fromEquirectangular(hdr).texture; pm.dispose();
    this.scene.background=hdr; this.scene.backgroundIntensity=1;
  }

  buildGround(){
    const S=this.scene;
    S.add(plane(2*XMAX+120,ROAD1-ROAD0,M.asphalt,0,0,(ROAD0+ROAD1)/2));
    S.add(plane(2*XMAX+120,ROAD0-FACADE,M.paving,0,CURB,(FACADE+ROAD0)/2));
    S.add(plane(2*XMAX+120,CANAL0-ROAD1,M.paving,0,CURB,(ROAD1+CANAL0)/2));
    S.add(plane(2*XMAX+120,SOUTH1+4-CANAL1,M.paving,0,CURB,(CANAL1+SOUTH1+4)/2));
    S.add(plane(1600,800,M.sand,0,-.05,CANAL0-.6-400), plane(1600,800,M.sand,0,-.05,CANAL1+.6+400));     // open over the canal
    for(const z of [ROAD0,ROAD1]) S.add(box(2*XMAX+120,CURB+.02,.3,M.concrete,0,(CURB)/2,z+(z===ROAD0?-.15:.15),{cast:false}));
    // road paint
    const paint=M.paint, dash=new THREE.PlaneGeometry(3,.15); dash.rotateX(-PI/2);
    const dashes=new THREE.InstancedMesh(dash,paint,60), o=new THREE.Object3D();
    for(let i=0;i<60;i++){ o.position.set(-XMAX-50+i*6.4,.012,(ROAD0+ROAD1)/2); o.updateMatrix(); dashes.setMatrixAt(i,o.matrix); }
    dashes.receiveShadow=true; S.add(dashes);
    for(const z of [ROAD0+.45,ROAD1-.45]){ const l=plane(2*XMAX+120,.15,paint,0,.011,z); S.add(l); }
    for(let i=0;i<8;i++){ const z=ROAD0+.6+i*.95; S.add(plane(3.2,.5,paint,0,.013,z)); }      // crossing in front of the bridge
  }
  // a plant from the CC0 plant kit (placed once the kit has loaded)
  plant(kind,x,y,z,s=1){ this.plants.push({kind,x,y,z,s,r:R(0,TAU),v:rnd()}); }
  // raised travertine bed with soil, planted with a natural mix
  bed(B,x,z,w,d,{palm=0,olive=0,flowers=.5,rock=true,hedge=false,density=1}={}){
    const y=CURB+.32;
    B(w,.32,.18,M.travertine,x,CURB+.16,z+d/2-.09); B(w,.32,.18,M.travertine,x,CURB+.16,z-d/2+.09);
    B(.18,.32,d-.36,M.travertine,x+w/2-.09,CURB+.16,z); B(.18,.32,d-.36,M.travertine,x-w/2+.09,CURB+.16,z);
    B(w-.3,.3,d-.3,M.mulch,x,CURB+.14,z);
    this.colliders.push({x,z,hw:w/2,hd:d/2});
    for(let i=0;i<palm;i++){ const px=x+(palm>1?(i-(palm-1)/2)*w/palm:R(-.2,.2)), pz=z+R(-.2,.2); const p=makePalm(R(6,10.5)); p.position.set(px,y,pz); this.scene.add(p); }
    for(let i=0;i<olive;i++) this.plant('olive',x+(olive>1?(i-(olive-1)/2)*w/olive:R(-.3,.3)),y,z+R(-.3,.3),R(1.5,2.1));
    const n=Math.round(w*d*.9*density);
    for(let i=0;i<n;i++){ const px=x+R(-w/2+.45,w/2-.45), pz=z+R(-d/2+.45,d/2-.45), u=rnd();
      if(u<flowers*.55) this.plant('flowers',px,y,pz,R(1.6,2.6));
      else if(u<flowers*.55+.2) this.plant('low',px,y,pz,R(1.1,1.7));
      else this.plant('bush',px,y,pz,R(.45,.85)); }
    if(hedge) this.plant('hedge',x,y,z+d/2-.5,R(.9,1.1));
    if(rock&&w*d>5) this.plant('rock',x+R(-w/4,w/4),y-.05,z+R(-d/4,d/4),R(.3,.55));
  }
  buildShops(){
    const S=this.scene, B=batch(S), FNS=SHOPS.map(s=>s[1]), F=FACADE;
    SHOPS.forEach(([demo],i)=>{
      const real=this.stores[i]||null, f=real?.store?.facade, fi=Number.isInteger(f)&&f>=0&&f<5?f:i;
      const name=real?String(real.store.name||'محل').slice(0,40):demo;
      const g=FNS[fi](name), x0=-56+i*28; g.position.set(x0,CURB,F); S.add(g);
      if(real) windowDisplay(g,real.store);
      this.slots.push({x0,real,name});
      const ft=g.userData.foot; if(ft) this.colliders.push({x:x0,z:F+ft.front/2,hw:ft.hw,hd:Math.max(.3,ft.front/2)+.3});
      if(g.userData.roof){ const r=g.userData.roof; for(let k=0;k<26;k++) this.plant(rnd()<.35?'flowers':'bush',x0+R(-r.w/2,r.w/2),CURB+r.y,F-R(.8,r.d*.4),rnd()<.35?R(1.6,2.4):R(.5,.8)); }
      this.forecourt(B,fi,x0);
    });
    // gardens between and beside the shops
    for(let i=0;i<=5;i++){ const x=-70+i*28;
      this.bed(B,x,F+4.2,5.2,7.6,{palm:2,olive:1,flowers:.6});
      const p=makePalm(R(7,10)); p.position.set(x+R(-1.5,1.5),CURB,F-3); S.add(p); this.plant('olive',x+R(-2,2),CURB,F-6,R(1.6,2.2)); }
    // a second row of palms and olives behind the shops (an oasis, not towers)
    for(let x=-78;x<=78;x+=R(7,11)){ const p=makePalm(R(8,12)); p.position.set(x,CURB,F-R(16,26)); S.add(p); this.plant('olive',x+R(-3,3),CURB,F-R(15,22),R(1.8,2.6)); }
    B.done();
  }
  // landscaped forecourt in front of each shop, after the reference images
  forecourt(B,kind,x0){
    const S=this.scene, F=FACADE, C=this.colliders;
    const potPlant=(x,z,k='olive',s=1)=>{ const y=bigPot(B,x,z,s); this.plant(k,x,y,z,k==='olive'?R(.75,.95)*s:R(.6,.8)*s); C.push({x,z,r:.6*s}); };
    if(kind===0){                                            // perfume: fountain bowl, lounge, lanterns, pots
      pool(B,S,x0+4.2,F+4.4,3.6,2.4,true); C.push({x:x0+4.2,z:F+4.4,hw:2,hd:1.4});
      potPlant(x0-2.1,F+1.3,'bush',1); potPlant(x0+2.1,F+1.3,'bush',1);
      floorLantern(B,S,x0-1.5,F+.9); floorLantern(B,S,x0+1.5,F+.9);
      armchair(B,x0-6.6,F+3.6,.5); armchair(B,x0-4.4,F+3.6,-.5); sideTable(B,S,x0-5.5,F+3.9); C.push({x:x0-5.5,z:F+3.7,hw:1.8,hd:.7});
      this.bed(B,x0+7.4,F+8.2,4,2.4,{flowers:.8});
    }else if(kind===1){                                      // fashion: steps, reflecting pool, olives in bronze pots
      pool(B,S,x0,F+4.6,6.4,2.2); C.push({x:x0,z:F+4.6,hw:3.5,hd:1.3});
      potPlant(x0-4.2,F+2.3,'olive',1.15); potPlant(x0+4.2,F+2.3,'olive',1.15);
      for(const sx of [-1,1]){ bollardLight(B,x0+sx*6.4,F+7.5); bollardLight(B,x0+sx*1.9,F+7.5); this.bed(B,x0+sx*7.6,F+3.4,3.6,3.2,{flowers:.7}); }
    }else if(kind===2){                                      // furniture: pool with an olive bed and boulder
      pool(B,S,x0+7.6,F+3.4,5,2.4); C.push({x:x0+7.6,z:F+3.4,hw:2.7,hd:1.4});
      this.bed(B,x0-7.6,F+4.4,5.6,4.2,{olive:1,flowers:.5});
      potPlant(x0-2.7,F+2.3,'olive',.9); potPlant(x0+2.7,F+2.3,'olive',.9);
      for(const x of [-4,4]) bollardLight(B,x0+x,F+7.8);
    }else if(kind===3){                                      // electronics: screened benches, palms, bollards
      bench(B,S,x0-5.2,F+3,0); bench(B,S,x0+5.2,F+3,0); C.push({x:x0-5.2,z:F+3,hw:1.2,hd:.4},{x:x0+5.2,z:F+3,hw:1.2,hd:.4});
      for(const sx of [-1,1]){ this.bed(B,x0+sx*8.6,F+3.4,3,3.2,{palm:1,flowers:.6}); bollardLight(B,x0+sx*2.6,F+1.3); }
      potPlant(x0-1.9,F+1.4,'olive',.8); potPlant(x0+1.9,F+1.4,'olive',.8);
    }else{                                                   // jewellery: flowering beds, palms, floor lanterns
      for(const sx of [-1,1]){ this.bed(B,x0+sx*5.8,F+3.6,3.4,3.6,{palm:1,flowers:.9,hedge:true}); floorLantern(B,S,x0+sx*1.7,F+.9,.9); }
      potPlant(x0,F+5.6,'bush',1.2);
    }
  }
  buildCanal(){
    const S=this.scene, L=2*XMAX+120;
    if(this.hi){   // real mirror reflections of the street, the palms and the sky, with sun glints
      const w=new Water(new THREE.PlaneGeometry(L,CANAL1-CANAL0),{textureWidth:1024,textureHeight:1024,waterNormals:M.water.normalMap,
        sunDirection:this.sunDir.clone(),sunColor:0xffd6a6,waterColor:0x0f6a6e,distortionScale:1.6,fog:true});
      w.rotation.x=-PI/2; w.position.set(0,WATER,(CANAL0+CANAL1)/2); w.material.uniforms.size.value=3.2; w.receiveShadow=true;
      S.add(w); this.mirror=w;
    }else{ const water=plane(L,CANAL1-CANAL0,M.water,0,WATER,(CANAL0+CANAL1)/2); water.receiveShadow=true; S.add(water); }
    for(const z of [CANAL0,CANAL1]){ const s=z===CANAL0?1:-1;
      S.add(box(L,1.4,.6,M.travertine,0,WATER+.55,z+s*.3));
      S.add(box(L,.14,.75,M.travertine,0,CURB+.07,z-s*.37,{cast:false}));                         // coping stone
      // glass balustrade with a bronze rail along the water
      const gl=new THREE.Mesh(new THREE.PlaneGeometry(L,.95),M.glass); gl.position.set(0,CURB+.6,z-s*.2); S.add(gl);
      S.add(box(L,.06,.09,M.bronze,0,CURB+1.08,z-s*.2,{uv:false}));
    }
    // footbridge: stone deck on a shallow arch with glass sides
    const n=24, deck=[];
    for(let i=0;i<n;i++){ const t0=i/n, t1=(i+1)/n, z0=CANAL0-.2+t0*(CANAL1-CANAL0+.4), z1=CANAL0-.2+t1*(CANAL1-CANAL0+.4);
      const y0=CURB+1.05*Math.sin(PI*t0), y1=CURB+1.05*Math.sin(PI*t1), len=Math.hypot(z1-z0,y1-y0);
      const seg=new THREE.BoxGeometry(BRIDGE_HALF*2,.3,len+.02); seg.rotateX(Math.atan2(y1-y0,z1-z0)); seg.translate(0,(y0+y1)/2-.15,(z0+z1)/2);
      deck.push(metreUV(seg)); }
    const dm=new THREE.Mesh(mergeGeometries(deck),M.travertine); dm.castShadow=dm.receiveShadow=true; S.add(dm);
    const archS=new THREE.Shape(); archS.moveTo(CANAL0-.4,WATER-.2); archS.lineTo(CANAL1+.4,WATER-.2); archS.lineTo(CANAL1+.4,CURB);
    archS.quadraticCurveTo((CANAL0+CANAL1)/2,CURB+1.9,CANAL0-.4,CURB);
    const hole=new THREE.Path(); hole.moveTo(CANAL0+.5,WATER-.2); hole.lineTo(CANAL1-.5,WATER-.2); hole.quadraticCurveTo((CANAL0+CANAL1)/2,CURB+1.6,CANAL0+.5,WATER-.2);
    archS.holes.push(hole);
    for(const x of [-BRIDGE_HALF,BRIDGE_HALF-.35]){
      const eg=new THREE.ExtrudeGeometry(archS,{depth:.35,bevelEnabled:false,curveSegments:20}); eg.rotateY(-PI/2); eg.translate(x+.35,0,0);
      const m=new THREE.Mesh(metreUV(eg),M.travertine); m.castShadow=m.receiveShadow=true; S.add(m);
      for(let i=0;i<n;i+=2){ const t=(i+1)/n, z=CANAL0-.2+t*(CANAL1-CANAL0+.4), y=CURB+1.05*Math.sin(PI*t);
        S.add(box(.04,1.0,.05,M.bronze,x+(x<0?.2:.15),y+.5,z,{uv:false,cast:false})); }
      const rail=[]; for(let i=0;i<n;i++){ const t0=i/n,t1=(i+1)/n, z0=CANAL0-.2+t0*(CANAL1-CANAL0+.4), z1=CANAL0-.2+t1*(CANAL1-CANAL0+.4);
        const y0=CURB+1.05*Math.sin(PI*t0)+1, y1=CURB+1.05*Math.sin(PI*t1)+1, len=Math.hypot(z1-z0,y1-y0);
        const seg=new THREE.BoxGeometry(.08,.06,len); seg.rotateX(Math.atan2(y1-y0,z1-z0)); seg.translate(x+(x<0?.2:.15),(y0+y1)/2,(z0+z1)/2); rail.push(seg); }
      S.add(new THREE.Mesh(mergeGeometries(rail),M.bronze));
    }
  }
  buildSkyline(){
    const S=this.scene;
    // across the canal: low courtyard buildings, then towers fading into the haze
    for(let i=0;i<7;i++){ const x=-66+i*22, h=R(8,14), w=R(16,19);
      S.add(box(w,h,12,i%2?M.travertine:M.limestone,x,h/2,SOUTH1+10));
      S.add(box(w-2,3,.3,M.tint,x,h*.55,SOUTH1+3.9,{cast:false,uv:false}));
      if(i%2) S.add(box(w,.4,2.2,M.bronze,x,3.6,SOUTH1+3.3)); }
    // desert hills on the horizon, softened by the haze
    for(const [z0,z1] of [[-90,-700],[110,700]]){
      const g=new THREE.PlaneGeometry(2400,Math.abs(z1-z0),160,40); g.rotateX(-PI/2); g.translate(0,0,(z0+z1)/2);
      const p=g.attributes.position;
      for(let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i), f=clamp((Math.abs(z)-Math.abs(z0))/160,0,1);
        const hgt=(Math.sin(x*.011+z*.004)*.5+.5)*38+(Math.sin(x*.031-z*.013)*.5+.5)*16+Math.sin(x*.09+z*.05)*3;
        p.setY(i,-.2+f*f*hgt); }
      g.computeVertexNormals(); const m=new THREE.Mesh(g,M.dunes); m.receiveShadow=true; S.add(m); }
  }
  buildProps(){
    const S=this.scene, B=batch(S);
    // lantern posts on both kerbs
    for(let x=-XMAX+4;x<=XMAX;x+=14){ lamp(B,S,x,ROAD0-.6); this.colliders.push({x,z:ROAD0-.6,r:.35}); lamp(B,S,x+7,ROAD1+.6); this.colliders.push({x:x+7,z:ROAD1+.6,r:.35}); }
    // promenade: planted beds with palms, mashrabiya benches between
    for(let x=-XMAX+4;x<=XMAX;x+=11){
      if(Math.abs(x)>4) this.bed(B,x,3.5,2.6,2.6,{palm:1,flowers:.6,rock:false,density:.8});
      this.bed(B,x+5.5,19,2.8,2.8,{palm:1,flowers:.5,rock:false,density:.8});
    }
    for(let x=-XMAX+9.5;x<XMAX;x+=22){ bench(B,S,x,4.5,0); this.colliders.push({x,z:4.5,hw:1.2,hd:.4}); }
    // bronze bollards with light slits along the shop-side kerb
    for(let x=-XMAX+2;x<=XMAX;x+=3.5) if(Math.abs(x)>2.6&&Math.abs(((x+XMAX-4)%14+14)%14)>1) bollardLight(B,x,ROAD0-.35);
    // generic pedestrian signals at the crossing
    for(const [x,z,ry] of [[-2.4,ROAD0-.5,0],[2.4,ROAD1+.5,PI]]){
      const g=new THREE.Group(); g.position.set(x,CURB,z); g.rotation.y=ry;
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,3,10),M.bronze); pole.position.y=1.5; pole.castShadow=true;
      const head=box(.32,.7,.26,M.bronze,0,2.75,.18,{uv:false});
      const red=new THREE.Mesh(new THREE.CircleGeometry(.09,16),new THREE.MeshStandardMaterial({color:'#300',emissive:'#ff2a1a',emissiveIntensity:1.2}));
      red.position.set(0,2.9,.315); const grn=new THREE.Mesh(new THREE.CircleGeometry(.09,16),new THREE.MeshStandardMaterial({color:'#032',emissive:'#1aff8a',emissiveIntensity:.15}));
      grn.position.set(0,2.6,.315); g.add(pole,head,red,grn); S.add(g); this.colliders.push({x,z,r:.3});
    }
    const dc=new THREE.CircleGeometry(.35,20); dc.rotateX(-PI/2);
    for(let x=-XMAX+8;x<XMAX;x+=19){ const d=new THREE.Mesh(dc,M.darkMetal); d.position.set(x,.008,ROAD0+1.2+((x|0)%2?5.6:0)); d.receiveShadow=true; S.add(d); }
    B.done();
  }
  // CC0 plant kit (Poly Haven): each placement picks a variant and gets its own size and turn, drawn as instances
  async loadPlants(){
    const { GLTFLoader }=await import('three/addons/loaders/GLTFLoader.js'), { DRACOLoader }=await import('three/addons/loaders/DRACOLoader.js');
    const dl=new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/');
    const gltf=await new GLTFLoader(manager).setDRACOLoader(dl).loadAsync('models/plants.glb');
    const root=gltf.scene; root.updateMatrixWorld(true);
    const V={}; root.traverse(o=>{ if(!o.isMesh) return; let t=o; while(t.parent&&t.parent!==root) t=t.parent; (V[t.name]||(V[t.name]=[])).push(o); });
    const KIND={olive:/searsia_lucida_[abcd]/,bush:/shrub_02|searsia_lucida_e/,flowers:/shrub_03/,hedge:/shrub_01/,low:/shrub_04/,rock:/boulder/};
    const names=Object.keys(V), pick={};
    for(const k in KIND) pick[k]=names.filter(n=>KIND[k].test(n));
    const groups={};
    for(const p of this.plants){ const list=pick[p.kind]; if(!list?.length) continue; const n=list[Math.floor(p.v*list.length)]; (groups[n]||(groups[n]=[])).push(p); }
    const tmp=new THREE.Matrix4(), q=new THREE.Quaternion(), up=new THREE.Vector3(0,1,0);
    for(const n in groups){
      const meshes=V[n], bb=new THREE.Box3(); meshes.forEach(m=>bb.expandByObject(m));
      const c=bb.getCenter(new THREE.Vector3()), off=new THREE.Matrix4().makeTranslation(-c.x,-bb.min.y,-c.z);
      for(const m of meshes){
        const local=off.clone().multiply(m.matrixWorld), list=groups[n];
        for(const mat of [].concat(m.material)){ mat.envMapIntensity=.5; mat.userData.outlineParameters={visible:false}; if(mat.transparent&&mat.alphaTest>0) mat.transparent=false; }
        const im=new THREE.InstancedMesh(m.geometry,m.material,list.length);
        list.forEach((p,i)=>{ q.setFromAxisAngle(up,p.r); tmp.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(p.s,p.s*R(.9,1.1),p.s)); im.setMatrixAt(i,tmp.clone().multiply(local)); });
        im.castShadow=true; im.receiveShadow=true; im.userData.noAO=true; this.scene.add(im);
      }
    }
  }
  buildCars(){
    for(let i=0;i<10;i++){
      const lane=LANES[i%2], c=makeCar(PAINTS[i%PAINTS.length],i%3===1);
      c.position.set(-XMAX-40+i*34+R(-6,6),0,lane.z); c.rotation.y=lane.dir>0?0:PI;
      c.userData.lane=lane; c.userData.speed=R(8,12); c.userData.v=c.userData.speed;
      this.scene.add(c); this.cars.push(c);
    }
  }
  buildPeople(){
    let prof=null; try{ prof=JSON.parse(localStorage.getItem('alam-profile-v1')||'null'); }catch(e){}
    this.me=buildAvatar(prof?.avatar||defaultAvatar('m')); this.me.position.set(-14,CURB,-8.8); this.me.rotation.y=PI;
    this.me.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); this.scene.add(this.me);
    const paths=[[-8.6,1],[-9.5,-1],[5.4,1],[21.4,-1],[23,1]];
    for(let i=0;i<12;i++){
      const a=buildAvatar(randomAvatar(rnd)), p=paths[i%paths.length];
      a.position.set(R(-XMAX+6,XMAX-6),CURB,p[0]+R(-.4,.4)); a.userData.dir=p[1]*(i%3===2?-1:1); a.userData.sp=R(1.1,1.5); a.userData.ph=R(0,TAU);
      a.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); this.scene.add(a); this.npcs.push(a);
    }
  }

  resize(w,h){ this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
    if(this.composer){ this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(w,h); } }
  // the shop frontage you are standing at (on the shop-side pavement)
  nearSlot(){ const p=this.me.position; if(p.z>ROAD0-.2) return null;
    return this.slots.find(s=>Math.abs(p.x-s.x0)<14)||null; }
  blocked(x,z){
    if(groundY(x,z)===null) return true;
    for(const c of this.colliders){ const dx=x-c.x, dz=z-c.z;
      if(c.r!==undefined){ if(dx*dx+dz*dz<c.r*c.r) return true; } else if(Math.abs(dx)<c.hw+.3&&Math.abs(dz)<c.hd+.3) return true; }
    return false;
  }
  update(dt){
    this.t+=dt; const k=this.keys, me=this.me;
    // ---- player ----
    let fx=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0)+this.joy.x, fz=(k.KeyS||k.ArrowDown?1:0)-(k.KeyW||k.ArrowUp?1:0)+this.joy.y;
    const len=Math.hypot(fx,fz); let moving=false;
    if(len>.08){
      fx/=Math.max(1,len); fz/=Math.max(1,len);
      const sp=(k.ShiftLeft||k.ShiftRight?7:3.6)*Math.min(1,len), c=Math.cos(this.yaw), s=Math.sin(this.yaw);
      const dx=(fx*c+fz*s)*sp*dt, dz=(-fx*s+fz*c)*sp*dt;
      const nx=me.position.x+dx, nz=me.position.z+dz;
      if(!this.blocked(nx,nz)){ me.position.x=nx; me.position.z=nz; }
      else if(!this.blocked(nx,me.position.z)) me.position.x=nx;
      else if(!this.blocked(me.position.x,nz)) me.position.z=nz;
      const target=Math.atan2(dx,dz); let d=target-me.rotation.y; d=Math.atan2(Math.sin(d),Math.cos(d)); me.rotation.y+=d*Math.min(1,dt*10);
      moving=true; me.userData.ph=(me.userData.ph||0)+dt*sp*2.6;
    }
    const gy=groundY(me.position.x,me.position.z); if(gy!==null) me.position.y+=(gy-me.position.y)*Math.min(1,dt*14);
    animateAvatar(me,me.userData.ph||0,moving?1:0);
    // ---- camera (third person, kept out of the shops) ----
    const tgt=new THREE.Vector3(me.position.x,me.position.y+1.55,me.position.z);
    const cp=Math.cos(this.pitch), off=new THREE.Vector3(Math.sin(this.yaw)*cp,Math.sin(this.pitch),Math.cos(this.yaw)*cp).multiplyScalar(this.dist);
    const cam=tgt.clone().add(off); if(cam.z<FACADE+.6){ const f=(tgt.z-(FACADE+.6))/Math.max(.01,tgt.z-cam.z); cam.lerpVectors(tgt,cam,clamp(f,.2,1)); }
    cam.y=Math.max(cam.y,(groundY(cam.x,cam.z)??WATER)+.4);
    this.camera.position.copy(cam); this.camera.lookAt(tgt);
    // ---- sun + shadows follow ----
    this.sun.target.position.set(me.position.x,0,me.position.z); this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir,120);
    // ---- cars: brake for people on the road ----
    for(const c of this.cars){ const u=c.userData, dir=u.lane.dir; let want=u.speed;
      const ahead=(me.position.x-c.position.x)*dir;
      if(Math.abs(me.position.z-u.lane.z)<2.2&&ahead>0&&ahead<14) want=0;
      for(const o of this.cars) if(o!==c&&o.userData.lane===u.lane){ const a=(o.position.x-c.position.x)*dir; if(a>0&&a<9) want=Math.min(want,o.userData.v*.8); }
      u.v+=(want-u.v)*Math.min(1,dt*(want<u.v?3.5:1.2)); c.position.x+=u.v*dir*dt;
      if(c.position.x*dir>XMAX+50) c.position.x=-(XMAX+50)*dir;
      for(const w of u.wheels) w.children.forEach(m=>m.rotation.z-=u.v*dt/.36);
    }
    // ---- passers-by ----
    for(const a of this.npcs){ const u=a.userData; a.position.x+=u.dir*u.sp*dt; u.ph+=dt*u.sp*2.6;
      if(Math.abs(a.position.x)>XMAX-4){ u.dir=-Math.sign(a.position.x); }
      a.rotation.y=u.dir>0?PI/2:-PI/2; animateAvatar(a,u.ph,1); }
    // ---- water ripples ----
    const n=M.water.normalMap; n.offset.x=this.t*.012; n.offset.y=this.t*.007;
    if(this.mirror) this.mirror.material.uniforms.time.value=this.t*.35;
  }
  render(){ if(this.composer) this.composer.render(); else this.outline.render(this.scene,this.camera); }
}
export { manager };
