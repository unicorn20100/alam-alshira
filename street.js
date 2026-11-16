// عالم الشراء — realistic test street. Real-world materials (CC0 scans from Poly Haven), real sky light and sun shadows.
// Only the people are anime (toon shading + ink outline); everything else is physically based.
// Units are metres. X runs along the street, -Z is toward the shops.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAvatar, animateAvatar, randomAvatar, defaultAvatar } from './avatar.js?v=6';
import { makeOutline } from './toon.js?v=6';

const PI=Math.PI, TAU=PI*2;
let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const R=(a,b)=>a+(b-a)*rnd();

/* ---------------- layout (z bands) ---------------- */
const FACADE=-12, ROAD0=-7, ROAD1=1, CANAL0=6, CANAL1=16, SOUTH1=24.5, XMAX=78;
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
function texSet(name,tile){
  const s={};
  for(const [k,f] of [['map','diff'],['normalMap','nor'],['roughnessMap','rough']]){
    const t=tl.load(`textures/${name}_${f}.jpg`);
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
let M={};
function makeMaterials(){
  const stone=texSet('stone',3), pav=texSet('paving',2.4), asph=texSet('asphalt',5), marble=texSet('marble',2.5),
        wood=texSet('wood',2.2), sand=texSet('sand',6);
  const std=(o)=>new THREE.MeshStandardMaterial(o);
  M.travertine=std({...stone,color:'#efe0c2',roughness:1});
  M.limestone=std({...stone,color:'#f6efe2',roughness:1});
  M.sandstone=std({...stone,color:'#d9bf93',roughness:1});
  M.paving=std({...pav,color:'#efe6d6',roughness:1});
  M.asphalt=std({...asph,color:'#9a9a9a',roughness:1});
  M.sand=std({...sand,color:'#f0d9b0',roughness:1});
  M.marbleIn=std({...marble,color:'#fff',emissive:'#fff6e8',emissiveMap:marble.map,emissiveIntensity:.22,roughness:1});
  M.woodIn=std({...wood,color:'#fff',emissive:'#ffe9cc',emissiveMap:wood.map,emissiveIntensity:.22,roughness:1});
  M.woodOut=std({...wood,color:'#e8d2b0',roughness:1});
  M.wallIn=std({...stone,color:'#e6d9c2',emissive:'#ffefd6',emissiveMap:stone.map,emissiveIntensity:.18,roughness:1});
  M.ceilIn=std({color:'#fff',emissive:'#fff',emissiveIntensity:1,emissiveMap:ceilingTex(),map:ceilingTex(),emissiveIntensity:.7});
  M.bronze=std({color:'#8a5a34',metalness:1,roughness:.32});
  M.gold=std({color:'#c49a52',metalness:1,roughness:.28});
  M.darkMetal=std({color:'#2a2c30',metalness:.9,roughness:.4});
  M.glass=new THREE.MeshPhysicalMaterial({color:'#b7c9cf',metalness:0,roughness:.02,transparent:true,opacity:.2,
    envMapIntensity:1.6,depthWrite:false,side:THREE.DoubleSide,reflectivity:.9});
  M.tint=std({color:'#29363c',metalness:.6,roughness:.08,envMapIntensity:1.4});         // tinted tower glass
  M.concrete=std({...pav,color:'#cfc9bf',roughness:1});
  M.white=std({color:'#f4f2ee',roughness:.6});
  M.paint=std({color:'#f6f6f2',roughness:.55});
  M.rubber=std({color:'#141414',roughness:.92});
  M.lamp=std({color:'#fff3d6',emissive:'#ffe6b0',emissiveIntensity:1.4});
  M.screen=std({color:'#0b0d12',metalness:.3,roughness:.15,emissive:'#3a5a8a',emissiveIntensity:.5});
  M.soft=std({color:'#d8cbb8',emissive:'#d8cbb8',emissiveIntensity:.25,roughness:1});
  M.fabricDark=std({color:'#4a4a52',emissive:'#4a4a52',emissiveIntensity:.25,roughness:1});
  M.leather=std({color:'#8a5a3a',emissive:'#8a5a3a',emissiveIntensity:.25,roughness:.7});
  M.mashrabiya=std({color:'#c09455',metalness:.95,roughness:.3,alphaMap:mashrabiyaTex(),alphaTest:.5,side:THREE.DoubleSide});
  M.water=std({color:'#0a3a40',metalness:.1,roughness:.06,normalMap:waterNormals(),normalScale:new THREE.Vector2(.55,.55),envMapIntensity:1.3});
  M.water.normalMap.repeat.set(1/3.2,1/3.2);
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
function signPlate(text,w,h,x,y,z,color){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signMat(text,color)); m.position.set(x,y,z); m.renderOrder=2; return m;
}
// lit interior room seen through the glass: one inward-facing box (floor, walls, glowing ceiling)
function interior(w,h,d,floor){
  const g=metreUV(new THREE.BoxGeometry(w,h,d)); const m=new THREE.Mesh(g,[M.wallIn,M.wallIn,M.ceilIn,floor,M.wallIn,M.wallIn]);
  for(const mm of m.material) mm.side=THREE.BackSide;
  m.position.set(0,h/2,-d/2-.05); return m;
}
// exterior shell behind a facade: side walls, roof slab and back wall
function shell(g,w,h,d,mat){
  g.add(box(.5,h,d,mat,-w/2+.25,h/2,-d/2), box(.5,h,d,mat,w/2-.25,h/2,-d/2),
        box(w,.6,d,mat,0,h-.3,-d/2), box(w,h,.5,mat,0,h/2,-d+.25));
}
function displays(g,w,d,mat,top,count=6,y=.9){
  for(let i=0;i<count;i++){
    const x=-w/2+2+(i%3)*(w-4)/2, z=-3-Math.floor(i/3)*(d-6)/1.6;
    g.add(box(2.2,y,1.1,mat,x,y/2,z,{cast:false}));
    if(top) for(let k=0;k<3;k++) g.add(box(.28,.36,.2,top,x-.6+k*.6,y+.18,z,{cast:false}));
  }
}

/* ---------------- five shop styles ---------------- */
// 1. stone arches with gold mashrabiya in the arch heads (perfume)
function shopArches(name){
  const g=new THREE.Group(), w=20, h=11, d=16;
  const s=new THREE.Shape(); s.moveTo(-w/2,0); s.lineTo(w/2,0); s.lineTo(w/2,h); s.lineTo(-w/2,h); s.closePath();
  const arch=(cx,r,spring,base)=>{ const p=new THREE.Path(); p.moveTo(cx-r,base); p.lineTo(cx+r,base); p.lineTo(cx+r,spring);
    p.absarc(cx,spring,r,0,PI,false); p.lineTo(cx-r,base); return p; };
  for(const cx of [-6.3,0,6.3]) s.holes.push(arch(cx,2.15,5.6,.55));
  const fg=new THREE.ExtrudeGeometry(s,{depth:.9,bevelEnabled:false}); fg.translate(0,0,-.9);
  const f=new THREE.Mesh(metreUV(fg),M.travertine); f.castShadow=f.receiveShadow=true; g.add(f);
  for(const cx of [-6.3,0,6.3]){
    const gs=new THREE.ShapeGeometry(new THREE.Shape(arch(cx,2.15,5.6,.55).getPoints(24)));
    const gl=new THREE.Mesh(gs,M.glass); gl.position.z=-.62; g.add(gl);
    // mashrabiya screen filling the round arch head
    const hs=new THREE.Shape(); hs.moveTo(cx-2.15,5.6); hs.absarc(cx,5.6,2.15,PI,0,true); hs.lineTo(cx-2.15,5.6);
    const hg=new THREE.ShapeGeometry(hs,24); const uv=hg.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)/1.4,uv.getY(i)/1.4);
    const sc=new THREE.Mesh(hg,M.mashrabiya); sc.position.z=-.35; sc.castShadow=true; g.add(sc);
    g.add(box(4.6,.12,.3,M.gold,cx,5.6,-.3,{uv:false}));                  // transom bar
  }
  g.add(box(w+.6,.5,1.3,M.travertine,0,h+.25,-.45), box(w+.3,.55,1.05,M.travertine,0,.27,-.3));  // cornice + plinth
  g.add(signPlate(name,8,1.5,0,9.2,.02,'#cfa762'));
  shell(g,w,h,d,M.travertine); g.add(interior(w-1.2,h-.8,d-1.6,M.marbleIn));
  displays(g,w-2,d,M.marbleIn,M.gold,6,1.0);
  return g;
}
// 2. curved glass front wrapped in vertical bronze louvers (fashion)
function shopLouvers(name){
  const g=new THREE.Group(), w=20, h=12, d=16, sag=2.6, Rr=(w*w/4+sag*sag)/(2*sag), zc=sag-Rr, a=Math.asin(w/2/Rr);
  const n=58, fin=new THREE.BoxGeometry(.09,h-1.6,.55), fins=new THREE.InstancedMesh(metreUV(fin),M.bronze,n);
  const o=new THREE.Object3D();
  for(let i=0;i<n;i++){ const t=-a+2*a*i/(n-1), sw=Math.sin(i*.37)*.08;
    o.position.set(Rr*Math.sin(t),.9+(h-1.6)/2,zc+Rr*Math.cos(t)); o.rotation.set(0,t+sw,0); o.updateMatrix(); fins.setMatrixAt(i,o.matrix); }
  fins.castShadow=fins.receiveShadow=true; g.add(fins);
  const gl=new THREE.Mesh(new THREE.CylinderGeometry(Rr-.5,Rr-.5,h-1.2,48,1,true,-a,2*a),M.glass); gl.position.set(0,h/2,zc); g.add(gl);
  // stone base and crown that follow the curve
  const band=(y0,hh,mat)=>{ const s=new THREE.Shape(); s.absarc(0,0,Rr+.15,1.5*PI-a,1.5*PI+a,false); s.lineTo(w/2,zc+1.2); s.lineTo(-w/2,zc+1.2);
    const eg=new THREE.ExtrudeGeometry(s,{depth:hh,bevelEnabled:false,curveSegments:40}); eg.rotateX(-PI/2); eg.translate(0,y0,zc);
    const m=new THREE.Mesh(metreUV(eg),mat); m.castShadow=m.receiveShadow=true; return m; };
  g.add(band(0,.9,M.limestone), band(h-.7,.7,M.limestone));
  g.add(signPlate(name,7,1.3,0,h-.35,sag+.17,'#2b211a'));
  shell(g,w,h,d,M.limestone); g.add(interior(w-1.2,h-.8,d-1.6,M.woodIn)); g.userData.arc={Rr,zc,a};
  for(let i=0;i<5;i++){ const x=-7+i*3.5; g.add(box(.05,1.6,2.4,M.gold,x,1.9,-4,{cast:false,uv:false}));     // clothes rails
    for(let k=0;k<6;k++) g.add(box(.42,1,.06,i%2?M.fabricDark:M.soft,x,1.4,-4.9+k*.36,{cast:false})); }
  return g;
}
// 3. full-height glass showroom in a thick stone portal (furniture)
function shopShowroom(name){
  const g=new THREE.Group(), w=20, h=10, d=16;
  g.add(box(1.4,h,1.2,M.sandstone,-w/2+.7,h/2,-.6), box(1.4,h,1.2,M.sandstone,w/2-.7,h/2,-.6), box(w,1.6,1.2,M.sandstone,0,h-.8,-.6),
        box(w,.4,1.2,M.sandstone,0,.2,-.6));
  const gw=w-2.8, gh=h-2;
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(gw,gh),M.glass); gl.position.set(0,.4+gh/2,-.7); g.add(gl);
  for(let i=0;i<=6;i++) g.add(box(.08,gh,.12,M.darkMetal,-gw/2+i*gw/6,.4+gh/2,-.66,{uv:false}));
  g.add(box(gw,.1,.12,M.darkMetal,0,4.6,-.66,{uv:false}));
  g.add(box(gw,.25,1.6,M.sandstone,0,4.55,-1.6));                                                    // mezzanine edge
  g.add(signPlate(name,7,1.2,0,h-.8,.02,'#3a2a1c'));
  shell(g,w,h,d,M.sandstone); g.add(interior(w-1.2,h-.8,d-1.6,M.woodIn));
  const sofa=(x,z,mat)=>{ g.add(box(2.6,.45,1,mat,x,.32,z,{cast:false}), box(2.6,.55,.25,mat,x,.75,z-.45,{cast:false}),
    box(.25,.35,1,mat,x-1.2,.6,z,{cast:false}), box(.25,.35,1,mat,x+1.2,.6,z,{cast:false})); };
  sofa(-5,-4,M.soft); sofa(0,-5.5,M.leather); sofa(5.2,-4,M.fabricDark);
  for(const x of [-5,0,5.2]) g.add(box(1.2,.35,.7,M.woodIn,x,.18,-2.6,{cast:false}));
  for(const x of [-7.5,7.6]){ g.add(box(.05,1.6,.05,M.darkMetal,x,.8,-3,{cast:false,uv:false}), box(.5,.35,.5,M.lamp,x,1.7,-3,{cast:false})); }
  return g;
}
// 4. light stone box with one big rounded opening (electronics)
function shopRounded(name){
  const g=new THREE.Group(), w=20, h=10, d=16, r=1.6;
  const s=new THREE.Shape(); s.moveTo(-w/2,0); s.lineTo(w/2,0); s.lineTo(w/2,h); s.lineTo(-w/2,h); s.closePath();
  const ox=8.2, oy0=.5, oy1=8;
  const hole=new THREE.Path(); hole.moveTo(-ox,oy0); hole.lineTo(ox,oy0); hole.lineTo(ox,oy1-r); hole.quadraticCurveTo(ox,oy1,ox-r,oy1);
  hole.lineTo(-ox+r,oy1); hole.quadraticCurveTo(-ox,oy1,-ox,oy1-r); hole.lineTo(-ox,oy0); s.holes.push(hole);
  const fg=new THREE.ExtrudeGeometry(s,{depth:.8,bevelEnabled:true,bevelThickness:.08,bevelSize:.08,bevelSegments:3,curveSegments:16});
  fg.translate(0,0,-.8); const f=new THREE.Mesh(metreUV(fg),M.limestone); f.castShadow=f.receiveShadow=true; g.add(f);
  const gl=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(hole.getPoints(16))),M.glass); gl.position.z=-.55; g.add(gl);
  g.add(signPlate(name,6.5,1.1,0,9,.03,'#4a4a4a'));
  shell(g,w,h,d,M.limestone); g.add(interior(w-1.2,h-.8,d-1.6,M.marbleIn));
  for(let i=0;i<6;i++){ const x=-5.5+(i%3)*5.5, z=-3.4-Math.floor(i/3)*5;
    g.add(box(3.4,.08,1.3,M.woodIn,x,.86,z,{cast:false}), box(.12,.82,.9,M.woodIn,x-1.4,.41,z,{cast:false}), box(.12,.82,.9,M.woodIn,x+1.4,.41,z,{cast:false}));
    for(let k=0;k<4;k++){ const dv=box(.5,.03,.34,M.screen,x-1.15+k*.77,.91,z,{cast:false,uv:false}); dv.rotation.x=-.12; g.add(dv); } }
  for(const x of [-8.6,8.6]) g.add(box(.15,4,2,M.screen,x,3.5,-8,{cast:false,uv:false}));
  return g;
}
// 5. stone block whose upper floors sit behind a full gold mashrabiya screen (jewellery)
function shopScreen(name){
  const g=new THREE.Group(), w=20, h=13, d=16;
  g.add(box(w,h-4.5,1,M.travertine,0,4.5+(h-4.5)/2,-1.2));
  const sc=new THREE.Mesh(new THREE.PlaneGeometry(w-2,h-6.4),M.mashrabiya);
  { const uv=sc.geometry.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*(w-2)/1.6,uv.getY(i)*(h-6.4)/1.6); }
  sc.position.set(0,5.1+(h-6.4)/2,-.05); sc.castShadow=true; g.add(sc);
  g.add(box(w-2,.1,.5,M.gold,0,5.1,-.25,{uv:false}), box(w-2,.1,.5,M.gold,0,h-1.3,-.25,{uv:false}));
  g.add(box(.6,h,1.6,M.travertine,-w/2+.3,h/2,-.8), box(.6,h,1.6,M.travertine,w/2-.3,h/2,-.8), box(w,1.2,1.6,M.travertine,0,h-.6,-.8));
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(w-1.2,4),M.glass); gl.position.set(0,2.4,-1.5); g.add(gl);
  for(let i=0;i<=5;i++) g.add(box(.14,4,.18,M.bronze,-(w-1.2)/2+i*(w-1.2)/5,2.4,-1.45,{uv:false}));
  g.add(box(w-1.2,.18,2.4,M.bronze,0,4.45,-.3));                                                    // bronze canopy
  g.add(signPlate(name,6.5,1.1,0,4.95,.95,'#d6b26c'));
  shell(g,w,h,d,M.travertine); g.add(interior(w-1.2,4.2,d-2.4,M.marbleIn));
  for(let i=0;i<5;i++){ const x=-7+i*3.5; g.add(box(1.6,1,.7,M.marbleIn,x,.5,-3.5,{cast:false}));
    const vit=new THREE.Mesh(new THREE.BoxGeometry(1.5,.45,.6),M.glass); vit.position.set(x,1.23,-3.5); g.add(vit);
    g.add(box(.12,.05,.12,M.gold,x,1.05,-3.5,{uv:false})); }
  return g;
}
const SHOPS=[['دار العطور',shopArches],['أزياء الرمال',shopLouvers],['أثاث النخلة',shopShowroom],
             ['إلكترونيات المستقبل',shopRounded],['مجوهرات اللؤلؤ',shopScreen]];

/* ---------------- palms, lamps, benches ---------------- */
function frondTex(){
  return canvasTex(512,128,(x,w,h)=>{
    x.clearRect(0,0,w,h);
    for(let i=12;i<w-6;i+=7){ const t=i/w, len=(h*.48)*Math.sin(Math.min(1,t*1.15)*PI*.92)+4;
      const gcol=`hsl(${78+Math.sin(i)*6},${38+t*14}%,${22+t*14+Math.cos(i*1.7)*4}%)`;
      x.strokeStyle=gcol; x.lineWidth=3.2-t*1.4;
      for(const sgn of [-1,1]){ x.beginPath(); x.moveTo(i,h/2); x.quadraticCurveTo(i+len*.35,h/2+sgn*len*.5,i+len*.75,h/2+sgn*len); x.stroke(); } }
    x.strokeStyle='#6f7a3a'; x.lineWidth=4; x.beginPath(); x.moveTo(0,h/2); x.lineTo(w,h/2); x.stroke();
  });
}
function barkTex(){
  const t=canvasTex(128,256,(x,w,h)=>{
    x.fillStyle='#7a6448'; x.fillRect(0,0,w,h);
    for(let j=0;j<h;j+=16) for(let i=-1;i<5;i++){ const cx=i*32+(j/16%2)*16, cy=j;
      x.fillStyle=`hsl(30,${22+((i*7+j)%9)}%,${30+((i*13+j)%11)}%)`;
      x.beginPath(); x.moveTo(cx,cy-12); x.lineTo(cx+15,cy); x.lineTo(cx,cy+12); x.lineTo(cx-15,cy); x.closePath(); x.fill();
      x.strokeStyle='rgba(30,20,10,.55)'; x.lineWidth=2; x.stroke(); }
  });
  t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
let palmParts=null;
function palmGeoms(){
  if(palmParts) return palmParts;
  const fronds=[]; const n=18;
  for(let i=0;i<n;i++){
    const len=R(2.6,3.4), g=new THREE.PlaneGeometry(len,1.15,12,2), p=g.attributes.position;
    for(let k=0;k<p.count;k++){ const x=p.getX(k)+len/2, y=p.getY(k), t=x/len;
      p.setXYZ(k,x,-t*t*len*R(.42,.6)+Math.abs(y)*.25,y*(1-t*.35)); }
    g.computeVertexNormals();
    const tilt=i<6?R(.35,.7):R(-.15,.25), yaw=i*2.39996;
    g.rotateZ(tilt); g.rotateY(yaw); fronds.push(g);
  }
  const crown=mergeGeometries(fronds);
  palmParts={crown,frondMat:new THREE.MeshStandardMaterial({map:frondTex(),alphaTest:.45,side:THREE.DoubleSide,roughness:.75,
    color:'#ffffff'}),barkMat:new THREE.MeshStandardMaterial({map:barkTex(),roughness:.95})};
  palmParts.barkMat.map.repeat.set(1,5);
  return palmParts;
}
function makePalm(h){
  const {crown,frondMat,barkMat}=palmGeoms(), g=new THREE.Group();
  const tg=new THREE.CylinderGeometry(.2,.3,h,10,10,true), p=tg.attributes.position, lean=R(-.4,.4);
  for(let k=0;k<p.count;k++){ const t=(p.getY(k)+h/2)/h; p.setX(k,p.getX(k)+lean*t*t); }
  tg.translate(0,h/2,0); tg.computeVertexNormals();
  const tr=new THREE.Mesh(tg,barkMat); tr.castShadow=true; g.add(tr);
  const cr=new THREE.Mesh(crown,frondMat); cr.position.set(lean,h,0); cr.rotation.y=R(0,TAU); cr.scale.setScalar(R(.9,1.1));
  cr.castShadow=true; g.add(cr);
  const boss=new THREE.Mesh(new THREE.SphereGeometry(.38,10,8),barkMat); boss.position.set(lean,h-.1,0); boss.scale.y=1.4; g.add(boss);
  return g;
}
function planter(x,z){
  const g=new THREE.Group(); g.position.set(x,CURB,z);
  const ring=new THREE.Mesh(metreUV(new THREE.CylinderGeometry(1.15,1.2,.45,28,1,true)),M.travertine); ring.position.y=.22;
  ring.material=M.travertine; ring.castShadow=ring.receiveShadow=true; g.add(ring);
  const soil=new THREE.Mesh(new THREE.CircleGeometry(1.12,28),M.sand); soil.rotation.x=-PI/2; soil.position.y=.36; soil.receiveShadow=true; g.add(soil);
  const top=new THREE.Mesh(metreUV(new THREE.RingGeometry(1.12,1.32,28)),M.travertine); top.rotation.x=-PI/2; top.position.y=.45; g.add(top);
  g.add(makePalm(R(5.5,8)).translateY(.36)); return g;
}
function lampPost(x,z){
  const g=new THREE.Group(); g.position.set(x,CURB,z);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,4.2,10),M.darkMetal); pole.position.y=2.1; pole.castShadow=true;
  const head=new THREE.Mesh(new THREE.CylinderGeometry(.22,.16,.5,8),M.darkMetal); head.position.y=4.4;
  const glow=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.32,8),M.lamp); glow.position.y=4.36;
  g.add(pole,head,glow); return g;
}
function bench(x,z,rot=0){
  const g=new THREE.Group(); g.position.set(x,CURB,z); g.rotation.y=rot;
  g.add(box(.5,.42,.5,M.travertine,-.95,.21,0), box(.5,.42,.5,M.travertine,.95,.21,0));
  for(let i=0;i<4;i++) g.add(box(2.6,.06,.11,M.woodOut,0,.45,-.2+i*.135));
  return g;
}

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
  g.userData.wheels=wheels; return g;
}

/* ---------------- the street ---------------- */
export class Street {
  constructor(renderer){
    this.r=renderer; maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const S=this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(55,1,.1,1400); this.camera.rotation.order='YXZ';
    makeMaterials();
    this.colliders=[]; this.cars=[]; this.npcs=[]; this.keys={}; this.joy={x:0,y:0};
    this.yaw=0; this.pitch=.18; this.dist=6.2; this.t=0;

    // sun: shadows follow the player
    this.sun=new THREE.DirectionalLight('#fff0d8',4.6); this.sun.castShadow=true;
    const mobile=matchMedia('(pointer:coarse)').matches; this.mobile=mobile;
    this.sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
    const sc=this.sun.shadow.camera; sc.left=-40; sc.right=40; sc.top=40; sc.bottom=-40; sc.near=1; sc.far=220;
    this.sun.shadow.bias=-.0004; this.sun.shadow.normalBias=.03;
    S.add(this.sun,this.sun.target);
    this.sunDir=new THREE.Vector3(.72,.62,.42).normalize();
    S.fog=new THREE.Fog('#dfe6ea',140,560);

    this.buildGround(); this.buildShops(); this.buildCanal(); this.buildSkyline(); this.buildProps(); this.buildCars(); this.buildPeople();
    // only the people get an ink outline
    // sky light is a soft fill; the sun does the modelling (shadows). Metal and glass keep full reflections.
    S.traverse(o=>{ if(!o.isMesh) return; for(const m of [].concat(o.material)){ if(m.isMeshToonMaterial) continue;
      m.userData.outlineParameters={visible:false}; if(m.userData.env===undefined){ m.userData.env=1; m.envMapIntensity=(m.transparent||m.metalness>.5)?1.1:.45; } } });
    this.outline=makeOutline(renderer);
  }
  async loadSky(){
    const hdr=await new RGBELoader(manager).loadAsync('textures/sky.hdr');
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
  buildShops(){
    SHOPS.forEach(([name,fn],i)=>{
      const g=fn(name), x0=-48+i*24; g.position.set(x0,0,FACADE); this.scene.add(g);
      if(g.userData.arc){ const {Rr,zc,a}=g.userData.arc; for(let t=-a;t<=a+1e-6;t+=a/14) this.colliders.push({x:x0+Rr*Math.sin(t),z:FACADE+zc+Rr*Math.cos(t),r:.75}); }
    });
    // narrow stone links between the shops so the street reads as one frontage
    for(let i=0;i<6;i++){ const x=-60+i*24; this.scene.add(box(4,7,14,M.sandstone,x,3.5,FACADE-7.2)); }
    // taller hotel/residential blocks behind the shops
    for(let i=0;i<6;i++){ const x=-62+i*25, h=R(24,40);
      const b=box(20,h,14,i%2?M.limestone:M.sandstone,x,h/2,FACADE-36); this.scene.add(b);
      for(let f=0;f<Math.floor(h/3.6)-1;f++) this.scene.add(box(20.1,1.5,14.1,M.tint,x,5+f*3.6,FACADE-36,{cast:false,uv:false})); }
  }
  buildCanal(){
    const S=this.scene, L=2*XMAX+120;
    const water=plane(L,CANAL1-CANAL0,M.water,0,WATER,(CANAL0+CANAL1)/2); water.receiveShadow=true; S.add(water); this.water=water;
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
    for(let i=0;i<14;i++){ const x=R(-260,260), z=i%2?R(90,220):R(-190,-90), h=R(60,190), w=R(16,30);
      const t=box(w,h,w,M.tint,x,h/2,z,{cast:false,uv:false}); S.add(t);
      S.add(box(w+.6,h*.18,w+.6,M.limestone,x,h*.09,z,{cast:false})); }
  }
  buildProps(){
    const S=this.scene;
    for(let x=-XMAX+4;x<=XMAX;x+=11){
      if(Math.abs(x)>4){ S.add(planter(x,3.4)); this.colliders.push({x,z:3.4,r:1.4}); }
      S.add(planter(x+5.5,18.4)); this.colliders.push({x:x+5.5,z:18.4,r:1.4});
      S.add(lampPost(x+5.5,ROAD1+.6)); this.colliders.push({x:x+5.5,z:ROAD1+.6,r:.3});
      S.add(lampPost(x,ROAD0-.6)); this.colliders.push({x,z:ROAD0-.6,r:.3});
    }
    for(let x=-XMAX+9.5;x<XMAX;x+=22){ S.add(bench(x,4.4)); this.colliders.push({x,z:4.4,r:1.3}); }
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
    this.me=buildAvatar(prof?.avatar||defaultAvatar('m')); this.me.position.set(-12,CURB,3.6+1.4); this.me.rotation.y=PI;
    this.me.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); this.scene.add(this.me);
    const paths=[[-9.8,1],[-10.9,-1],[5.3,1],[21.4,-1],[23,1]];
    for(let i=0;i<12;i++){
      const a=buildAvatar(randomAvatar(rnd)), p=paths[i%paths.length];
      a.position.set(R(-XMAX+6,XMAX-6),CURB,p[0]+R(-.4,.4)); a.userData.dir=p[1]*(i%3===2?-1:1); a.userData.sp=R(1.1,1.5); a.userData.ph=R(0,TAU);
      a.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); this.scene.add(a); this.npcs.push(a);
    }
  }

  resize(w,h){ this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  blocked(x,z){
    if(groundY(x,z)===null) return true;
    for(const c of this.colliders){ const dx=x-c.x, dz=z-c.z; if(dx*dx+dz*dz<c.r*c.r) return true; }
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
  }
  render(){ this.outline.render(this.scene,this.camera); }
}
export { manager };
