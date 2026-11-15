// عالم الشراء — the UAE map wrapped around a ball. Shared by the main planet (index.html) and the preview (uae.html).
import * as THREE from 'three';
import { EMIRATES, CITIES, coast, emirateAt } from './uae-map.js?v=6';
import { toonGradient } from './toon.js?v=6';

/* ---------- how the map wraps on the ball ----------
   Longitude goes all the way around (west edge of Abu Dhabi meets Fujairah on the back, with a river between).
   Latitude goes up/down; above the northern coast is the Gulf, below the borders is open sea. */
export const LON0=51.56, LON1=56.40;     // map edges: Abu Dhabi's west border … Fujairah's coast
// tilt: as the map goes east it is lowered a little, so Fujairah ends up exactly opposite Abu Dhabi's west end
const K=.24, tilt=(lon,lat)=>lat-K*(lon-LON0);
const LAT0=21.2, LAT1=25.6;               // range of the tilted latitude (sea above and below the land)
const RIVER=2.2;                          // degrees of the ball kept for the river at the seam
const BAND=62;                            // map spans latitude −62°…+62° on the ball; beyond that is polar sea
export const RAD=10;
const D2R=Math.PI/180;
export const toBall=(lon,lat)=>{          // map → unit vector on the ball
  const th=((lon-LON0)/(LON1-LON0)-.5)*(360-RIVER)*D2R, ph=((tilt(lon,lat)-LAT0)/(LAT1-LAT0)*2-1)*BAND*D2R;
  return new THREE.Vector3(Math.cos(ph)*Math.sin(th),Math.sin(ph),Math.cos(ph)*Math.cos(th));
};
export const toMap=v=>{                   // unit vector → map (or flags for the seam river / polar sea)
  const th=Math.atan2(v.x,v.z)/D2R, ph=Math.asin(Math.max(-1,Math.min(1,v.y)))/D2R;
  const u=th/(360-RIVER)+.5, w=(ph/BAND+1)/2;
  const lon=LON0+u*(LON1-LON0);
  return {lon, lat:LAT0+w*(LAT1-LAT0)+K*(lon-LON0), seam:Math.abs(th)>(360-RIVER)/2, polar:Math.abs(ph)>BAND};
};
const RIVER_Y=[toBall(LON0,23.75).y,toBall(LON0,24.45).y];   // latitude band of the river on the ball
export const RIVER_AT=[LON0-.01,24.05];                     // a point in the river, for labels and the camera

/* ---------- noise ---------- */
let seed=2971; export const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
const P=new Uint8Array(512); {const p=[...Array(256).keys()]; for(let i=255;i>0;i--){const j=Math.floor(rnd()*(i+1));[p[i],p[j]]=[p[j],p[i]];} for(let i=0;i<512;i++)P[i]=p[i&255];}
const fade=t=>t*t*(3-2*t), hsh=(x,y,z)=>P[(P[(P[x&255]+y)&255]+z)&255]/255;
function vnoise(x,y,z){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),fx=fade(x-X),fy=fade(y-Y),fz=fade(z-Z),L=(a,b,t)=>a+(b-a)*t;
  return L(L(L(hsh(X,Y,Z),hsh(X+1,Y,Z),fx),L(hsh(X,Y+1,Z),hsh(X+1,Y+1,Z),fx),fy),L(L(hsh(X,Y,Z+1),hsh(X+1,Y,Z+1),fx),L(hsh(X,Y+1,Z+1),hsh(X+1,Y+1,Z+1),fx),fy),fz);}
export const fbm=(v,f,o=4)=>{let a=0,s=.5,t=0;for(let i=0;i<o;i++){a+=s*vnoise(v.x*f+31,v.y*f+17,v.z*f+5);t+=s;s*=.5;f*=2;}return a/t;};

/* ---------- what is at a place (real UAE geography) ---------- */
const near=(lon,lat,x,y,r)=>Math.hypot((lon-x)*.91,lat-y)<r;
export function terrain(v){
  const m=toMap(v);
  if(m.seam){ // the river only between the two coasts; elsewhere the seam is ordinary sea
    const y=v.y; if(y>RIVER_Y[0]&&y<RIVER_Y[1]) return {water:true,river:true,d:-.02};
    const tl=(Math.asin(Math.max(-1,Math.min(1,y)))/D2R/BAND+1)/2*(LAT1-LAT0)+LAT0;     // same depth as the sea on both sides
    const dA=coast(LON0,tl).d, dB=coast(LON1,tl+K*(LON1-LON0)).d;
    return {water:true,d:Math.min(-.03,(Math.min(0,dA)+Math.min(0,dB))/2)};
  }
  if(m.polar) return {water:true,d:-1};
  const c=coast(m.lon,m.lat), {lon,lat}=m;
  if(!c.land) return {water:true,d:c.d,lon,lat};
  const t={water:false,d:c.d,lon,lat,em:emirateAt(lon,lat),island:c.island};
  // Hajar mountains (RAK + Fujairah + Hatta), and Jebel Hafeet by Al Ain
  const hajar=lon>55.88&&lat>24.72&&lat<26.02&&c.d>.03;
  const hafeet=near(lon,lat,55.78,24.07,.07);
  if(hajar||hafeet) t.mountain=Math.min(1,(c.d-.02)*9)*(hafeet?1-Math.hypot((lon-55.78)*.91,lat-24.07)/.07:1);
  // Liwa / Rub' al Khali red dunes in the south
  else if(lat<23.75&&lon>52.4) t.dunes=Math.min(1,(23.75-lat)*2.5);
  // salt flats (sabkha) along the western coast
  else if(lon<54.0&&c.d<.16&&lat<24.25) t.sabkha=true;
  if(near(lon,lat,55.74,24.22,.05)||(lat>23.05&&lat<23.2&&lon>53.4&&lon<54.3&&fbm(v,60)>.55)) t.oasis=true;     // Al Ain + Liwa palms
  if(c.d<.035&&near(lon,lat,54.45,24.42,.12)) t.mangrove=true;                                              // Abu Dhabi mangroves
  for(const ct of CITIES) if(near(lon,lat,ct.at[0],ct.at[1],.035+.035*ct.size)) t.city=ct;
  return t;
}
export function height(v,t=terrain(v)){
  if(t.water) return t.river?-.05:Math.max(-.12,t.d*.6);
  let h=.03+Math.min(.04,t.d*.4);
  if(t.mountain) h+=t.mountain*(.14+.3*fbm(v,14,3));
  if(t.dunes) h+=t.dunes*.05*Math.abs(Math.sin(fbm(v,40)*30));
  return h;
}

/* ---------- colours ---------- */
const COL=Object.fromEntries(Object.entries({deep:'#1c5fb8',mid:'#2b8fd8',shallow:'#47c9d6',lagoon:'#7fe3d6',river:'#3fb8e0',polar:'#1a4c9a',
  beach:'#f6e6b8',sand:'#ecd29c',gravel:'#dcc08a',dune1:'#e9a15e',dune2:'#d9853f',sabkha:'#f3efe3',
  rock1:'#c39a72',rock2:'#a9825f',peak:'#e0c49e',oasis:'#4f9a4a',mangrove:'#3f8a4e',city:'#d8d2c6',city2:'#c8bfb0'}).map(([k,x])=>[k,new THREE.Color(x)]));
export function terrainColor(t,v,out=new THREE.Color()){
  const j=fbm(v,90,2);
  if(t.water){
    if(t.river) out.copy(COL.river);
    else if(t.d<=-1) out.copy(COL.polar);
    else if(t.d>-.03) out.copy(COL.lagoon);
    else if(t.d>-.12) out.copy(COL.shallow);
    else if(t.d>-.45) out.copy(COL.mid).lerp(COL.deep,(-t.d-.12)/.33);
    else out.copy(COL.deep).lerp(COL.polar,Math.min(1,(-t.d-.45)/1.2));
    return out.offsetHSL(0,0,(j-.5)*.03);
  }
  if(t.city) out.copy(j>.5?COL.city:COL.city2);
  else if(t.mangrove) out.copy(COL.mangrove);
  else if(t.oasis) out.copy(COL.oasis).offsetHSL(0,0,(j-.5)*.1);
  else if(t.mountain){ const r=fbm(v,26,2); out.copy(t.mountain>.7&&r>.58?COL.peak:r>.47?COL.rock1:COL.rock2); }
  else if(t.d<.012) out.copy(COL.beach);
  else if(t.sabkha) out.copy(COL.sabkha).lerp(COL.sand,j*.4);
  else if(t.dunes) out.copy(COL.sand).lerp(j>.5?COL.dune1:COL.dune2,t.dunes);
  else out.copy(COL.sand).lerp(COL.gravel,fbm(v,30,3));
  return out.offsetHSL(0,0,(j-.5)*.04);
}

/* ---------- the planet mesh ----------
   Returns the mesh plus, per triangle, its centre direction and what is there. */
export function buildPlanet(detail=96){
  const geo=new THREE.IcosahedronGeometry(1,detail); const pos=geo.attributes.position, n=pos.count, nf=n/3;
  const v=new THREE.Vector3(), cache=new Map();
  // displace every vertex by the terrain height (same position → same height, so no cracks)
  for(let i=0;i<n;i++){
    v.fromBufferAttribute(pos,i).normalize(); const k=v.x.toFixed(5)+','+v.y.toFixed(5)+','+v.z.toFixed(5);
    let h=cache.get(k); if(h===undefined){ h=height(v); cache.set(k,h); }
    pos.setXYZ(i,v.x*(RAD+h),v.y*(RAD+h),v.z*(RAD+h));
  }
  const colors=new Float32Array(n*3), a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(), C=new THREE.Color();
  const faceEm=new Int8Array(nf), faceDir=new Float32Array(nf*3), faceCentre=new Float32Array(nf*3), faceT=new Array(nf);
  for(let f=0;f<nf;f++){
    a.fromBufferAttribute(pos,f*3); b.fromBufferAttribute(pos,f*3+1); c.fromBufferAttribute(pos,f*3+2);
    v.copy(a).add(b).add(c).divideScalar(3); faceCentre.set([v.x,v.y,v.z],f*3);
    v.normalize(); faceDir.set([v.x,v.y,v.z],f*3);
    const t=terrain(v); faceT[f]=t; faceEm[f]=t.water?-1:t.em;
    terrainColor(t,v,C);
    for(let k=0;k<3;k++){ colors[(f*3+k)*3]=C.r; colors[(f*3+k)*3+1]=C.g; colors[(f*3+k)*3+2]=C.b; }
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3)); geo.computeVertexNormals();
  const planet=new THREE.Mesh(geo,new THREE.MeshToonMaterial({vertexColors:true,gradientMap:planetGradient()}));
  planet.material.userData.outlineParameters={thickness:.0025,color:[.08,.1,.2]};
  return {planet,faceEm,faceDir,faceCentre,faceT};
}
// four soft light bands: the planet reads as cartoon without harsh dark sides
let g4=null;
function planetGradient(){
  if(g4) return g4;
  g4=new THREE.DataTexture(new Uint8Array([150,150,150,255, 195,195,195,255, 232,232,232,255, 255,255,255,255]),4,1,THREE.RGBAFormat);
  g4.minFilter=g4.magFilter=THREE.NearestFilter; g4.needsUpdate=true; return g4;
}

/* emirate borders: thin raised lines along edges between different emirates */
export function borders(planet,faceEm){
  const pos=planet.geometry.attributes.position, edge=new Map(), key=(p,q)=>{const s=[p,q].map(i=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(x=>x.toFixed(4)).join(','));return s.sort().join('|');};
  for(let f=0;f<faceEm.length;f++) for(let e=0;e<3;e++){ const i=f*3+e, j=f*3+(e+1)%3, k=key(i,j);
    const o=edge.get(k); if(o===undefined) edge.set(k,[f,i,j]); else if(faceEm[o[0]]>=0&&faceEm[f]>=0&&faceEm[o[0]]!==faceEm[f]) o.push('b'); }
  const pts=[]; for(const [k,o] of edge) if(o[3]==='b'){ for(const i of [o[1],o[2]]){ const p=new THREE.Vector3().fromBufferAttribute(pos,i); p.multiplyScalar(1.0025); pts.push(p.x,p.y,p.z); } }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#5b3a1e',transparent:true,opacity:.7}));
}

/* city towers (Burj Khalifa included) */
export function towers(){
  const grp=new THREE.Group(), box=new THREE.BoxGeometry(1,1,1).translate(0,.5,0);
  const tot=CITIES.reduce((a,c)=>a+c.towers,0)+1;
  const im=new THREE.InstancedMesh(box,new THREE.MeshToonMaterial({gradientMap:toonGradient()}),tot);
  im.material.userData.outlineParameters={visible:false};
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), up=new THREE.Vector3(0,1,0), s=new THREE.Vector3(), c=new THREE.Color();
  const TC=['#f4f4ef','#cfe3f5','#9cc6e8','#e9d8b8','#ffffff','#b9d2ea'];
  let k=0;
  const place=(lon,lat,w,h,color)=>{ const d=toBall(lon,lat); const t=terrain(d); if(t.water) return;
    const p=d.clone().multiplyScalar(RAD+height(d,t)-.01); q.setFromUnitVectors(up,d); s.set(w,h,w); m.compose(p,q,s); im.setMatrixAt(k,m); im.setColorAt(k,c.set(color)); k++; };
  for(const ct of CITIES){ const r=.025+.03*ct.size;
    for(let i=0;i<ct.towers;i++){ const a=rnd()*Math.PI*2, rr=Math.sqrt(rnd())*r;
      place(ct.at[0]+Math.cos(a)*rr/.91,ct.at[1]+Math.sin(a)*rr,.05+rnd()*.05,(ct.cap?.08:.05)+rnd()*(.12+ct.size*.22)*(1-rr/r*.6),TC[Math.floor(rnd()*TC.length)]); }
    if(ct.tallest) place(ct.tallest[0],ct.tallest[1],.06,.95,'#dfe8f2');
  }
  im.count=k; grp.add(im); return grp;
}

// where to put each emirate's name
export const EMIRATE_LABEL_AT={ad:[53.6,23.55],dxb:[55.33,24.95],shj:[55.72,25.22],ajm:[55.5,25.43],uaq:[55.68,25.5],rak:[55.98,25.68],fuj:[56.27,25.32]};
export { EMIRATES, CITIES };
