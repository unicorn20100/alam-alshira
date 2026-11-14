// عالم الشراء — walkable district. Every shop is its own odd-shaped building,
// sized by the space calculator from the shop's real products (all units in metres).
import * as THREE from 'three';
import { calcSpace, GONDOLA, slotFit } from './catalog.js?v=4';
import { buildAvatar, animateAvatar, randomAvatar } from './avatar.js?v=4';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mediaOk } from './backend.js?v=4';

// product photo on the faces that point at the shopper; plain colour + label elsewhere
const texLoader=new THREE.TextureLoader(); texLoader.setCrossOrigin('anonymous');
const photoCache=new Map();
function photoTex(url){
  if(!photoCache.has(url)){ const t=texLoader.load(url); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; photoCache.set(url,t); }
  return photoCache.get(url);
}

import { STYLES, COLORS } from './catalog.js?v=4';
export { STYLES, COLORS };
const NEIGHBOR_NAMES = ['دار العطور','أزياء الرمال','إلكترونيات المستقبل','بيت القهوة','عالم الألعاب','ركن الكتب',
  'مجوهرات اللؤلؤ','أثاث النخلة','رياضة بلس','ساعات الزمن','حلويات السكر','بيت الورد','صيدلية الشفاء','عالم الأحذية'];

/* ---------------- helpers ---------------- */
const FONT='"Tajawal", system-ui, sans-serif';
function canvasTex(w,h,draw){
  const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t;
}
function fitText(x,text,maxW,size,weight=800){ do{ x.font=`${weight} ${size}px ${FONT}`; size-=2; }while(x.measureText(text).width>maxW&&size>10); }
function signTex(text,bg,sub){
  return canvasTex(512,128,(x,w,h)=>{
    x.fillStyle=bg; x.fillRect(0,0,w,h); x.fillStyle='rgba(255,255,255,.14)'; x.fillRect(0,0,w,8); x.fillRect(0,h-8,w,8);
    x.fillStyle='#fff'; x.textAlign='center'; x.textBaseline='middle'; x.direction='rtl';
    fitText(x,text,w-40,sub?60:72); x.fillText(text,w/2,sub?h/2-14:h/2+4);
    if(sub){ x.font=`500 26px ${FONT}`; x.fillStyle='rgba(255,255,255,.85)'; x.fillText(sub,w/2,h/2+36); }
  });
}
function productTex(name,brand,color){
  const c=new THREE.Color(color), light=c.r*.3+c.g*.59+c.b*.11>.6;
  return canvasTex(256,256,(x,w,h)=>{
    x.fillStyle=color; x.fillRect(0,0,w,h);
    x.fillStyle=light?'rgba(0,0,0,.08)':'rgba(255,255,255,.12)'; x.fillRect(0,0,w,50);
    x.fillStyle=light?'#1b2a3a':'#fff'; x.textAlign='center'; x.textBaseline='middle'; x.direction='rtl';
    fitText(x,brand,w-20,30); x.fillText(brand,w/2,27);
    x.fillStyle='rgba(255,255,255,.92)'; x.fillRect(14,96,w-28,72);
    x.fillStyle='#1b2a3a'; fitText(x,name,w-44,34); x.fillText(name,w/2,134);
  });
}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
// materials for one product line. front: 'x' for shelf items (face the aisle), 'z' for big items
function productMats(ln,brand,front){
  const label=new THREE.MeshStandardMaterial({color:'#fff',roughness:.55,map:productTex(ln.name,brand,ln.color)});
  if(!mediaOk(ln.img)) return label;
  const photo=new THREE.MeshStandardMaterial({color:'#fff',roughness:.45,map:photoTex(ln.img)});
  const side=new THREE.MeshStandardMaterial({color:ln.color||'#ddd',roughness:.55});
  if(ln.shape==='cyl') return [photo,side,side];
  return front==='x'?[photo,photo,side,side,side,side]:[side,side,side,side,photo,photo];
}
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let cssAdded=false;
function addCSS(){
  if(cssAdded) return; cssAdded=true;
  const s=document.createElement('style'); s.textContent=`
  .city-hud{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:${FONT};color:#eef2ff}
  .city-hud .top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;gap:8px}
  .city-hud button{pointer-events:auto;font:inherit}
  .city-hud .pill{background:rgba(14,20,38,.78);border:1px solid rgba(255,255,255,.14);color:#eef2ff;border-radius:14px;
    padding:9px 14px;font-size:14px;font-weight:700;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);cursor:pointer}
  .city-hud .title{background:rgba(14,20,38,.6);border-radius:14px;padding:7px 14px;font-size:14px;font-weight:700;text-align:center}
  .city-hud .title small{display:block;font-weight:500;font-size:11px;color:#9aa6c4}
  .city-hud .hint{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.45);padding:7px 14px;
    border-radius:18px;font-size:13px;white-space:nowrap;transition:opacity .8s}
  .city-hud .joy{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;
    border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);display:none}
  .city-hud .joy i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55)}
  .city-hud .card{position:absolute;left:14px;bottom:14px;width:300px;background:rgba(14,20,38,.9);border:1px solid rgba(255,255,255,.14);
    border-radius:18px;padding:16px;pointer-events:auto;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    transform:translateY(130%);transition:transform .3s}
  .city-hud .card.open{transform:none}
  .city-hud .card h3{font-size:19px;font-weight:800;margin-bottom:2px}
  .city-hud .card .store{font-size:12px;color:#9aa6c4;margin-bottom:10px}
  .city-hud .card .row{display:flex;justify-content:space-between;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.05);margin-bottom:6px;font-size:13px}
  .city-hud .card .row span{color:#9aa6c4}
  .city-hud .card .price{font-size:26px;font-weight:800;text-align:center;margin:8px 0 10px;direction:ltr}
  .city-hud .card .add{width:100%;padding:11px;border:0;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;
    background:linear-gradient(135deg,#3ddc84,#2bb3a0);color:#06140c}
  .city-hud .card .x{position:absolute;top:10px;left:10px;width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.2);
    background:transparent;color:#fff;cursor:pointer;font-size:16px}
  .city-hud .msg{position:absolute;top:70px;left:50%;transform:translateX(-50%);background:#111a33;border:1px solid #4da3ff;
    padding:10px 16px;border-radius:12px;font-size:14px;opacity:0;transition:opacity .3s;max-width:92vw;text-align:center}
  .city-hud .dot{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:rgba(255,255,255,.7);
    box-shadow:0 0 0 1px rgba(0,0,0,.4)}
  @media (max-width:760px){.city-hud .card{left:0;right:0;bottom:0;width:auto;border-radius:20px 20px 0 0}
    .city-hud .title{font-size:12px}.city-hud .pill{font-size:12px;padding:8px 10px}.city-hud .hint{font-size:11px}}`;
  document.head.appendChild(s);
}

/* ---------------- City ---------------- */
export class City {
  static async create(opts){
    try{ await document.fonts.load(`800 40px ${FONT}`); await document.fonts.load(`500 20px ${FONT}`); }catch(e){}
    return new City(opts);
  }

  // store: {name, style, color, lines} or null for an empty plot
  constructor({renderer,title,subtitle,seed=1,store=null,avatar=null,onExit}){
    this.r=renderer; this.onExit=onExit; this.store=store;
    let s=((seed+7)*48271)%2147483647; this.rand=()=>(s=(s*16807)%2147483647)/2147483647;
    this.colliders=[]; this.rings=[]; this.pickables=[]; this.cart=[]; this.keys={}; this.stores=[];
    this.yaw=0; this.pitch=-.04; this.bob=0; this.joy={x:0,y:0}; this.joyId=null; this.lookId=null; this.insideOf=null;

    const S=this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(70,1,.05,900); this.camera.rotation.order='YXZ'; this.resize();
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(600,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
      vertexShader:`varying vec3 vW;void main(){vW=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 vW;void main(){float h=max(vW.y,0.);gl_FragColor=vec4(mix(vec3(.84,.91,.97),vec3(.32,.55,.9),pow(h,.55)),1.);}`}));
    S.add(this.sky);
    S.add(new THREE.HemisphereLight(0xe3f1ff,0x6b7a5a,1.2));
    const sun=this.sun=new THREE.DirectionalLight(0xfff1d6,2.2);
    sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,near:1,far:260});
    sun.shadow.bias=-.0004; sun.shadow.normalBias=.03; S.add(sun,sun.target);

    this.calc = store ? calcSpace(store.lines) : null;
    this.layoutDistrict();
    // you: third-person by default so you can see your own avatar
    this.view='third'; this.camD=3.2; this.walkPh=0; this.walkAmt=0;
    this.me=buildAvatar(avatar||randomAvatar(this.rand)); this.me.rotation.y=Math.PI; S.add(this.me);
    this.buildHUD(title,subtitle);
    this.bindInput();
  }

  /* ---------- district: 3×3 lots, yours in the middle ---------- */
  layoutDistrict(){
    const R=this.rand, S=this.scene;
    const lots=[];
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
      if(i===0&&j===0){ lots.push({i,j,mine:true, spec:this.store, R:this.calc?.R, side:this.calc?Math.sqrt(this.calc.plotNeeded):40}); continue; }
      if(R()<.22){ lots.push({i,j,empty:true,side:30+R()*25}); continue; }
      const r=6+R()*13;
      lots.push({i,j,R:r,side:2*r+16,spec:{name:NEIGHBOR_NAMES[Math.floor(R()*NEIGHBOR_NAMES.length)],
        style:STYLES[Math.floor(R()*STYLES.length)].id,color:COLORS[Math.floor(R()*COLORS.length)]}});
    }
    const cell=this.cell=Math.max(...lots.map(l=>l.side))+22;
    const half=this.half=cell*1.5;
    S.fog=new THREE.Fog(0xd6e9f7,cell*.8,cell*2.6);

    const g=new THREE.Mesh(new THREE.PlaneGeometry(cell*8,cell*8),new THREE.MeshStandardMaterial({color:'#86a865',roughness:1}));
    g.rotation.x=-Math.PI/2; g.receiveShadow=true; S.add(g);
    // roads between lots
    const road=new THREE.MeshStandardMaterial({color:'#3a3d42',roughness:.95});
    this.roadLines=[-cell/2,cell/2];
    for(const v of this.roadLines){
      const a=new THREE.Mesh(new THREE.PlaneGeometry(cell*3+20,10),road); a.rotation.x=-Math.PI/2; a.position.set(0,.02,v); a.receiveShadow=true; S.add(a);
      const b=new THREE.Mesh(new THREE.PlaneGeometry(10,cell*3+20),road); b.rotation.x=-Math.PI/2; b.position.set(v,.021,0); b.receiveShadow=true; S.add(b);
    }
    const dashes=[], m=new THREE.Matrix4(), q=new THREE.Quaternion(), one=new THREE.Vector3(1,1,1), yA=new THREE.Vector3(0,1,0);
    for(const v of this.roadLines) for(let t=-half-8;t<=half+8;t+=6){ if(this.roadLines.some(w=>Math.abs(t-w)<6)) continue; dashes.push([t,v,0],[v,t,1]); }
    const dm=new THREE.InstancedMesh(new THREE.BoxGeometry(2.2,.02,.16),new THREE.MeshBasicMaterial({color:'#f2f2f2'}),dashes.length);
    dashes.forEach(([x,z,r],k)=>{q.setFromAxisAngle(yA,r?Math.PI/2:0);m.compose(new THREE.Vector3(x,.03,z),q,one);dm.setMatrixAt(k,m);}); S.add(dm);

    const pave=new THREE.MeshStandardMaterial({color:'#ddd6c8',roughness:.9}), mineM=new THREE.MeshStandardMaterial({color:'#e9dfc9',roughness:.9});
    const curb=new THREE.MeshStandardMaterial({color:'#ffffff'}), curbMine=new THREE.MeshStandardMaterial({color:'#4da3ff',emissive:'#1d5fd0',emissiveIntensity:.4});
    this.treeSpots=[];
    for(const l of lots){
      const cx=l.i*cell, cz=l.j*cell, sd=l.side;
      const p=new THREE.Mesh(new THREE.BoxGeometry(sd,.15,sd),l.mine?mineM:pave); p.position.set(cx,.075,cz); p.receiveShadow=true; S.add(p);
      for(const [w,d,x,z] of [[sd,.35,0,sd/2],[sd,.35,0,-sd/2],[.35,sd,sd/2,0],[.35,sd,-sd/2,0]]){
        const c=new THREE.Mesh(new THREE.BoxGeometry(w,.3,d),l.mine?curbMine:curb); c.position.set(cx+x,.15,cz+z); S.add(c);
      }
      if(l.empty||(l.mine&&!l.spec)) this.emptyLot(cx,cz,sd,l.mine);
      else this.buildStore(l.spec,cx,cz,l.mine?this.calc.R:l.R,l.mine);
      // trees in the space between the lot and the roads
      for(let k=0;k<18;k++){
        const x=cx+(R()-.5)*(cell-14), z=cz+(R()-.5)*(cell-14);
        if(Math.abs(x-cx)<sd/2+2&&Math.abs(z-cz)<sd/2+2) continue;
        this.treeSpots.push([x,z]);
      }
    }
    // spawn: in front of your door
    const mine=this.stores.find(s=>s.interior);
    this.pos=new THREE.Vector3(0,0,mine?mine.az+7:6);
    this.buildTrees(); this.buildTraffic();
  }

  emptyLot(cx,cz,side,mine){
    const S=this.scene;
    const post=new THREE.MeshStandardMaterial({color:'#5a5f66'});
    for(const x of [-2.6,2.6]){ const p=new THREE.Mesh(new THREE.BoxGeometry(.2,3.2,.2),post); p.position.set(cx+x,1.6,cz); p.castShadow=true; S.add(p); }
    const sg=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({map:signTex(mine?'أرضك هنا':'أرض متاحة للإيجار','#1d4f91',mine?'احسب مساحتك وابنِ محلك':'تقدر تبني عليها محلك')}));
    sg.position.set(cx,3,cz+.12); S.add(sg); sg.userData.shop=mine?'أرضك':'أرض متاحة'; this.pickables.push(sg);
    this.colliders.push({x0:cx-2.8,x1:cx+2.8,z0:cz-.15,z1:cz+.15});
  }

  /* ---------- one store building ---------- */
  buildStore(spec,cx,cz,R,interior){
    const S=this.scene, rnd=this.rand, H=5, y0=H+.15;
    const grp=new THREE.Group(); grp.position.set(cx,0,cz); S.add(grp);
    const add=(mesh,x,y,z,cast=true)=>{mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;grp.add(mesh);return mesh;};
    const col=new THREE.Color(spec.color), light=col.clone().lerp(new THREE.Color('#fff'),.45), dark=col.clone().multiplyScalar(.6);
    const mat=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.55,...o});
    const glass=new THREE.MeshStandardMaterial({color:'#9fd3ef',metalness:.3,roughness:.1,transparent:true,opacity:.45,side:THREE.DoubleSide});
    const doorHalf=Math.min(1,2.2/R), segs={crystal:10,twist:12,mushroom:28,cubes:8,pyramid:8,spiral:28}[spec.style]||16;
    const glb=spec.building?.mode==='upload'&&mediaOk(spec.building?.glb)?spec.building.glb:null;
    if(glb) this.loadBuilding(glb,grp,R);
    else {
    const wallMat=spec.style==='crystal'?glass:spec.style==='mushroom'?mat('#f3ead7',{side:THREE.DoubleSide}):mat(spec.color,{side:THREE.DoubleSide});
    add(new THREE.Mesh(new THREE.CylinderGeometry(R,R,H,segs,1,true,doorHalf,Math.PI*2-doorHalf*2),wallMat),0,H/2+.15,0,spec.style!=='crystal');
    const roofDisk=()=>add(new THREE.Mesh(new THREE.CylinderGeometry(R+.3,R+.3,.4,segs),mat(dark)),0,y0+.2,0);

    if(spec.style==='crystal'){
      add(new THREE.Mesh(new THREE.SphereGeometry(R,10,5,0,Math.PI*2,0,Math.PI/2),
        new THREE.MeshStandardMaterial({color:spec.color,metalness:.3,roughness:.15,transparent:true,opacity:.55,flatShading:true,side:THREE.DoubleSide})),0,y0,0,false);
      add(new THREE.Mesh(new THREE.TorusGeometry(R,.25,6,segs),mat(dark)),0,y0,0).rotation.x=Math.PI/2;
    } else if(spec.style==='twist'){
      roofDisk(); const n=5+Math.floor(R/5);
      for(let k=0;k<n;k++){ const sz=R*1.45*(1-k*.6/n);
        add(new THREE.Mesh(new THREE.BoxGeometry(sz,3.2,sz),mat(k%2?light:col)),0,y0+.4+k*3.3+1.6,0).rotation.y=k*.32; }
    } else if(spec.style==='mushroom'){
      const cap=add(new THREE.Mesh(new THREE.SphereGeometry(R*1.5,32,14,0,Math.PI*2,0,Math.PI/2),mat(spec.color,{side:THREE.DoubleSide})),0,y0,0); cap.scale.y=.55;
      add(new THREE.Mesh(new THREE.CircleGeometry(R*1.5,32),mat('#f3ead7',{side:THREE.DoubleSide})),0,y0-.01,0).rotation.x=Math.PI/2;
      const dot=new THREE.SphereGeometry(R*.12,10,8), dm=mat('#ffffff');
      for(let k=0;k<16;k++){ const a=rnd()*Math.PI*2, e=.25+rnd()*1.1, cr=R*1.5;
        add(new THREE.Mesh(dot,dm),Math.cos(e)*Math.sin(a)*cr,y0+Math.sin(e)*cr*.55,Math.cos(e)*Math.cos(a)*cr); }
    } else if(spec.style==='cubes'){
      roofDisk(); let y=y0+.4;
      for(let k=0;k<5;k++){ const sz=R*(.5+rnd()*.6); const c=add(new THREE.Mesh(new THREE.BoxGeometry(sz,sz,sz),mat(k%2?light:col)),
        (rnd()-.5)*R*.7,y+sz/2,(rnd()-.5)*R*.7); c.rotation.set((rnd()-.5)*.5,rnd()*3,(rnd()-.5)*.5); y+=sz*.85; }
    } else if(spec.style==='pyramid'){
      const p=add(new THREE.Mesh(new THREE.ConeGeometry(R*1.3,R*1.6,4),mat(spec.color,{flatShading:true})),0,y0+R*.8,0); p.rotation.y=Math.PI/4;
    } else { // spiral
      roofDisk(); const top=R*2.6;
      add(new THREE.Mesh(new THREE.CylinderGeometry(R*.3,R*.38,top,16),mat(light)),0,y0+.4+top/2,0);
      const pts=[]; for(let k=0;k<=120;k++){const t=k/120,a=t*Math.PI*6; pts.push(new THREE.Vector3(Math.sin(a)*R*.85,y0+.6+t*top,Math.cos(a)*R*.85));}
      add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),240,Math.max(.3,R*.06),8),mat(spec.color)),0,0,0);
      add(new THREE.Mesh(new THREE.SphereGeometry(R*.45,20,14),mat(spec.color,{metalness:.4,roughness:.25})),0,y0+.4+top+R*.3,0);
    }
    }

    // entrance arch with the shop name
    const over=glb?1.15:{mushroom:1.5,pyramid:1.3}[spec.style]||1, chord=2*R*Math.sin(doorHalf), az=Math.max(R*Math.cos(doorHalf)+.9,R*over+1.5), pw=Math.max(5.5,chord+1.4), pm=mat('#2b2f36');
    for(const sx of [-1,1]) add(new THREE.Mesh(new THREE.BoxGeometry(.35,6.6,.35),pm),sx*pw/2,3.3,az);
    const sg=add(new THREE.Mesh(new THREE.PlaneGeometry(pw+.4,(pw+.4)/4),new THREE.MeshBasicMaterial({map:signTex(spec.name,dark.getStyle(),interior?'ادخل وتسوّق':'')})),0,6.6+(pw+.4)/8,az,false);
    sg.userData.shop=spec.name; this.pickables.push(sg);
    for(const sx of [-1,1]) this.colliders.push({x0:cx+sx*pw/2-.2,x1:cx+sx*pw/2+.2,z0:cz+az-.2,z1:cz+az+.2});
    this.rings.push({cx,cz,R,gap:interior?doorHalf-.25/R:0});
    this.stores.push({cx,cz,R,az,name:spec.name,interior});

    if(!interior){ // neighbours: closed glass doors
      const d=add(new THREE.Mesh(new THREE.PlaneGeometry(chord,3.6),glass),0,1.95,R*Math.cos(doorHalf),false); return;
    }

    /* --- inside: floor, light, gondolas and products, exactly as the calculator planned --- */
    const tile=canvasTex(128,128,(x,w,h)=>{x.fillStyle='#dcd9d2';x.fillRect(0,0,w,h);x.strokeStyle='#c4c1b9';x.lineWidth=3;x.strokeRect(0,0,w,h);});
    tile.wrapS=tile.wrapT=THREE.RepeatWrapping; tile.repeat.set(R/1.5,R/1.5);
    const fl=add(new THREE.Mesh(new THREE.CircleGeometry(R-.05,48),mat('#ffffff',{map:tile,roughness:.35})),0,.16,0,false); fl.rotation.x=-Math.PI/2;
    const pl=new THREE.PointLight(0xfff6e8,6+R*.6,R*2.2,1.6); pl.position.set(0,H-.3,0); grp.add(pl);
    const plan=this.calc.plan, metal=mat('#dfe3e8',{metalness:.2}), CAP=40000;
    for(const row of plan.rows){
      const L=row.units*GONDOLA.unit, zc=row.z0+L/2;
      add(new THREE.Mesh(new THREE.BoxGeometry(.05,2.1,L),metal),row.x,1.2,zc);
      add(new THREE.Mesh(new THREE.BoxGeometry(1.2,.12,L),metal),row.x,.21,zc,false);
      for(const sd of [-1,1]) for(const ly of GONDOLA.levels) add(new THREE.Mesh(new THREE.BoxGeometry(.55,.025,L),metal),row.x+sd*.31,.15+ly,zc,false);
      this.colliders.push({x0:cx+row.x-.62,x1:cx+row.x+.62,z0:cz+row.z0,z1:cz+row.z0+L});
    }
    // fill shelves: each side-level holds one product line, in order
    const lines=plan.small, places=lines.map(()=>[]); let li=0, left=lines[0]?.qty||0, shown=0;
    fill: for(const row of plan.rows) for(let u=0;u<row.units;u++) for(const sd of [-1,1]) for(const ly of GONDOLA.levels){
      if(li>=lines.length) break fill;
      const [w,h,d]=lines[li].s, k=slotFit(lines[li].s), z0=row.z0+u*GONDOLA.unit;
      for(let rr=0;rr<k.r;rr++) for(let ff=0;ff<k.f;ff++) for(let ss=0;ss<k.st;ss++){
        if(left<=0) continue;
        if(shown<CAP){ places[li].push([row.x+sd*(.6-.02-d/2-rr*(d+.01)),.15+ly+.016+h/2+ss*(h+.005),z0+.01+w/2+ff*(w+.01)]); shown++; }
        left--;
      }
      if(left<=0){ li++; left=lines[li]?.qty||0; }
    }
    const M=new THREE.Matrix4(), Q=new THREE.Quaternion(), SC=new THREE.Vector3(), P=new THREE.Vector3();
    const boxG=new THREE.BoxGeometry(1,1,1), cylG=new THREE.CylinderGeometry(.5,.5,1,10);
    lines.forEach((ln,i)=>{ if(!places[i].length) return;
      const im=new THREE.InstancedMesh(ln.shape==='cyl'?cylG:boxG,productMats(ln,spec.name,'x'),places[i].length);
      places[i].forEach(([x,y,z],n)=>{SC.set(ln.s[2],ln.s[1],ln.s[0]);M.compose(P.set(x,y,z),Q,SC);im.setMatrixAt(n,M);});
      im.userData.line=ln; im.userData.store=spec.name; im.receiveShadow=true; grp.add(im); this.pickables.push(im);
    });
    // big items on plinths in rings along the wall
    const byLine=new Map(); for(const sl of plan.slots){ if(!byLine.has(sl.line)) byLine.set(sl.line,[]); byLine.get(sl.line).push(sl); }
    const plinthG=new THREE.BoxGeometry(1,1,1), plinthM=mat('#2d3440');
    for(const [ln,list] of byLine){
      const [w,h,d]=ln.s;
      const im=new THREE.InstancedMesh(boxG,productMats(ln,spec.name,'z'),list.length);
      const pm2=new THREE.InstancedMesh(plinthG,plinthM,list.length);
      list.forEach((sl,n)=>{const x=Math.sin(sl.a)*sl.r, z=Math.cos(sl.a)*sl.r; Q.setFromAxisAngle(new THREE.Vector3(0,1,0),sl.a);
        M.compose(P.set(x,.25+h/2,z),Q,SC.set(w,h,d)); im.setMatrixAt(n,M);
        M.compose(P.set(x,.2,z),Q,SC.set(w+.3,.1,d+.3)); pm2.setMatrixAt(n,M);
        const hx=Math.abs(Math.cos(sl.a))*w/2+Math.abs(Math.sin(sl.a))*d/2, hz=Math.abs(Math.sin(sl.a))*w/2+Math.abs(Math.cos(sl.a))*d/2;
        this.colliders.push({x0:cx+x-hx,x1:cx+x+hx,z0:cz+z-hz,z1:cz+z+hz});});
      im.castShadow=true; im.userData.line=ln; im.userData.store=spec.name; grp.add(im,pm2); this.pickables.push(im);
    }
    this.shownCount=shown+plan.slots.length;
  }

  // merchant's own 3D building (.glb): fitted to the shop's diameter, door side facing the street (+z)
  loadBuilding(url,grp,R){
    new GLTFLoader().load(url,gl=>{
      if(this.disposed) return;
      const m=gl.scene, box=new THREE.Box3().setFromObject(m), size=box.getSize(new THREE.Vector3());
      const k=(2*R*1.12)/Math.max(size.x,size.z,.01); m.scale.setScalar(k);
      box.setFromObject(m); const c=box.getCenter(new THREE.Vector3());
      m.position.set(-c.x,.15-box.min.y,-c.z);
      m.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
      grp.add(m);
    },undefined,e=>{ console.warn('building model failed',e); this.say('ما قدرنا نحمّل تصميم المبنى'); });
  }

  buildTrees(){
    const R=this.rand, spots=this.treeSpots.filter(([x,z])=>!this.roadLines.some(v=>Math.abs(x-v)<7||Math.abs(z-v)<7)), n=spots.length;
    const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.14,.2,2.4,6),new THREE.MeshStandardMaterial({color:'#6b4a33'}),n);
    const crown=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6,0),new THREE.MeshStandardMaterial({flatShading:true,roughness:.9}),n);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), p=new THREE.Vector3(), c=new THREE.Color();
    spots.forEach(([x,z],i)=>{const k=.8+R()*.7;
      m.compose(p.set(x,1.2*k,z),q.identity(),s.set(k,k,k)); trunk.setMatrixAt(i,m);
      q.setFromEuler(new THREE.Euler(R(),R()*6,R())); m.compose(p.set(x,3.3*k,z),q,s.set(k,k*1.1,k)); crown.setMatrixAt(i,m);
      crown.setColorAt(i,c.setHSL(.25+R()*.08,.45,.3+R()*.1));
      this.colliders.push({x0:x-.25,x1:x+.25,z0:z-.25,z1:z+.25});});
    trunk.castShadow=crown.castShadow=true; this.scene.add(trunk,crown);
  }

  buildTraffic(){
    const R=this.rand, S=this.scene;
    const body=new THREE.BoxGeometry(1.8,.7,4.3), cab=new THREE.BoxGeometry(1.55,.6,2.2), wheel=new THREE.CylinderGeometry(.34,.34,.25,12);
    const glassM=new THREE.MeshStandardMaterial({color:'#24323f',roughness:.15,metalness:.4}), tireM=new THREE.MeshStandardMaterial({color:'#151515'});
    const taxiSign=new THREE.MeshBasicMaterial({map:canvasTex(128,48,(x,w,h)=>{x.fillStyle='#111';x.fillRect(0,0,w,h);x.fillStyle='#ffd23d';
      x.font=`800 30px ${FONT}`;x.textAlign='center';x.textBaseline='middle';x.fillText('TAXI',w/2,h/2+2);})});
    const colors=['#f2f2f2','#c0392b','#2a5bb8','#2d3440','#9aa3ad','#1f8a4c'];
    this.cars=[]; const lim=this.half+10;
    for(let i=0;i<14;i++){
      const taxi=i%2===0, g=new THREE.Group();
      const b=new THREE.Mesh(body,new THREE.MeshStandardMaterial({color:taxi?'#ffc21a':colors[Math.floor(R()*colors.length)],metalness:.35,roughness:.35}));
      b.position.y=.65; const c=new THREE.Mesh(cab,glassM); c.position.set(0,1.28,-.2); g.add(b,c);
      for(const wx of [-.85,.85]) for(const wz of [-1.35,1.35]){const w=new THREE.Mesh(wheel,tireM);w.rotation.z=Math.PI/2;w.position.set(wx,.34,wz);g.add(w);}
      if(taxi){const t=new THREE.Mesh(new THREE.BoxGeometry(.7,.24,.3),taxiSign);t.position.set(0,1.7,-.2);g.add(t);}
      g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
      this.cars.push({g,alongX:R()<.5,line:this.roadLines[Math.floor(R()*2)],dir:R()<.5?1:-1,s:(R()*2-1)*lim,lim,v:7+R()*5,cur:0});
      S.add(g);
    }
    this.people=[];
    for(let i=0;i<16;i++){
      const g=buildAvatar(randomAvatar(R)); g.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      const line=this.roadLines[Math.floor(R()*2)], off=(R()<.5?-1:1)*(6+R()*.8);
      this.people.push({g,alongX:R()<.5,line:line+off,dir:R()<.5?1:-1,s:(R()*2-1)*lim,lim,v:1.1+R()*.5,ph:R()*6}); S.add(g);
    }
  }

  /* ---------- HUD ---------- */
  buildHUD(title,subtitle){
    addCSS();
    const touch=matchMedia('(pointer:coarse)').matches;
    const el=this.hud=document.createElement('div'); el.className='city-hud';
    el.innerHTML=`<div class="top">
        <button class="pill" data-a="exit">→ رجوع للكوكب</button>
        <div class="title">${esc(title)}<small>${esc(subtitle)}</small></div>
        <div style="display:flex;gap:6px"><button class="pill" data-a="view">🎥</button><button class="pill" data-a="cart">🛒 <b>0</b></button></div></div>
      <div class="dot"></div>
      <div class="hint">${touch?'إصبع يسار للمشي · إصبع يمين للنظر · اضغط على أي منتج':'W A S D أو الأسهم للمشي · Shift للركض · اسحب بالماوس للنظر · اضغط على أي منتج'}</div>
      <div class="joy"><i></i></div><div class="msg"></div><div class="card"></div>`;
    document.body.appendChild(el);
    this.$=s=>el.querySelector(s);
    el.querySelector('[data-a=exit]').onclick=()=>this.onExit&&this.onExit();
    el.querySelector('[data-a=view]').onclick=()=>{ this.view=this.view==='third'?'first':'third';
      this.say(this.view==='third'?'تشوف شخصيتك من ورا':'تشوف بعيونك'); };
    el.querySelector('[data-a=cart]').onclick=()=>{
      const t=this.cart.reduce((a,p)=>a+(p.price||0),0);
      this.say(this.cart.length?`في السلة ${this.cart.length} منتج · المجموع $${t.toFixed(2)}`:'السلة فاضية. ادخل المحل واختر منتج');};
    setTimeout(()=>{const h=this.$('.hint');if(h)h.style.opacity=0;},9000);
    this.sel=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:'#4da3ff'}));
    this.sel.visible=false; this.scene.add(this.sel);
    setTimeout(()=>this.say(this.store?`قدامك محلك "${this.store.name}"، امشِ وادخل من البوابة`:'هذي أرضك. ارجع للكوكب واحسب مساحتك عشان تبني محلك'),600);
  }
  say(t){const m=this.$('.msg');m.textContent=t;m.style.opacity=1;clearTimeout(this._mt);this._mt=setTimeout(()=>m.style.opacity=0,3500);}

  showProduct(ln,store){
    const [w,h,d]=ln.size, card=this.$('.card');
    card.innerHTML=`<button class="x">×</button><h3>${esc(ln.name)}</h3><div class="store">${esc(store)}</div>
      ${ln.price?`<div class="price">$${(+ln.price).toLocaleString('en-US',{minimumFractionDigits:ln.price<100?2:0})}</div>`:''}
      <div class="row"><span>العرض</span><b>${w} سم</b></div><div class="row"><span>الارتفاع</span><b>${h} سم</b></div>
      <div class="row"><span>العمق</span><b>${d} سم</b></div><div class="row"><span>الكمية في المحل</span><b>${(+ln.qty).toLocaleString('en-US')}</b></div>
      <button class="add">أضف للسلة</button>`;
    card.classList.add('open');
    card.querySelector('.x').onclick=()=>{card.classList.remove('open');this.sel.visible=false;};
    card.querySelector('.add').onclick=()=>{this.cart.push(ln);this.$('[data-a=cart] b').textContent=this.cart.length;
      this.say(`تمت إضافة ${ln.name} للسلة`);card.classList.remove('open');this.sel.visible=false;};
  }

  pick(cx,cy){
    const ray=new THREE.Raycaster(); ray.far=10+(this.view==='third'?this.camD:0);
    ray.setFromCamera(new THREE.Vector2(cx/innerWidth*2-1,-(cy/innerHeight)*2+1),this.camera);
    const hit=ray.intersectObjects(this.pickables,false)[0];
    if(!hit){this.$('.card').classList.remove('open');this.sel.visible=false;return;}
    const o=hit.object;
    if(o.userData.shop){this.say(o.userData.shop===this.store?.name?`هذا محلك "${o.userData.shop}"`:`${o.userData.shop}: للعرض بس في هذي النسخة`);return;}
    if(!o.userData.line) return;
    const m=new THREE.Matrix4(); o.getMatrixAt(hit.instanceId,m); m.premultiply(o.matrixWorld);
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(); m.decompose(p,q,s);
    this.sel.position.copy(p); this.sel.quaternion.copy(q); this.sel.scale.copy(s).multiplyScalar(1.06); this.sel.visible=true;
    this.showProduct(o.userData.line,o.userData.store);
  }

  /* ---------- input ---------- */
  bindInput(){
    const cv=this.r.domElement;
    this._kd=e=>{this.keys[e.code]=true;}; this._ku=e=>{this.keys[e.code]=false;};
    this._down=e=>{
      if(e.pointerType!=='mouse'&&e.clientX<innerWidth*.45&&this.joyId===null){
        this.joyId=e.pointerId; this.joyO=[e.clientX,e.clientY,performance.now()];
        const j=this.$('.joy'); j.style.display='block'; j.style.left=e.clientX+'px'; j.style.top=e.clientY+'px'; j.firstElementChild.style.transform='';
      } else if(this.lookId===null){ this.lookId=e.pointerId; this.last=[e.clientX,e.clientY]; this.lookO=[e.clientX,e.clientY,performance.now()]; }
      cv.setPointerCapture?.(e.pointerId);
    };
    this._move=e=>{
      if(e.pointerId===this.joyId){
        let dx=e.clientX-this.joyO[0], dy=e.clientY-this.joyO[1]; const l=Math.hypot(dx,dy);
        if(l>50){dx*=50/l;dy*=50/l;} this.joy.x=dx/50; this.joy.y=dy/50; this.$('.joy i').style.transform=`translate(${dx}px,${dy}px)`;
      } else if(e.pointerId===this.lookId){
        const k=e.pointerType==='mouse'?.0042:.0065;
        this.yaw-=(e.clientX-this.last[0])*k; this.pitch=clamp(this.pitch-(e.clientY-this.last[1])*k,-1.3,1.3); this.last=[e.clientX,e.clientY];
      }
    };
    this._up=e=>{
      const tap=o=>Math.hypot(e.clientX-o[0],e.clientY-o[1])<8&&performance.now()-o[2]<350;
      if(e.pointerId===this.joyId){ if(tap(this.joyO)) this.pick(e.clientX,e.clientY);
        this.joyId=null; this.joy.x=this.joy.y=0; this.$('.joy').style.display='none'; }
      else if(e.pointerId===this.lookId){ if(tap(this.lookO)) this.pick(e.clientX,e.clientY); this.lookId=null; }
    };
    addEventListener('keydown',this._kd); addEventListener('keyup',this._ku);
    cv.addEventListener('pointerdown',this._down); cv.addEventListener('pointermove',this._move);
    cv.addEventListener('pointerup',this._up); cv.addEventListener('pointercancel',this._up);
  }

  /* ---------- loop ---------- */
  collide(p){
    const r=.35;
    for(const g of this.rings){ // round walls with a door gap facing +z
      const dx=p.x-g.cx, dz=p.z-g.cz, d=Math.hypot(dx,dz);
      if(d<g.R-r-.05||d>g.R+r+.05) continue;
      if(g.gap>0&&Math.abs(Math.atan2(dx,dz))<g.gap) continue;
      const t=d<g.R?g.R-r-.05:g.R+r+.05; p.x=g.cx+dx/(d||1)*t; p.z=g.cz+dz/(d||1)*t;
    }
    for(const b of this.colliders){
      if(p.x<b.x0-r||p.x>b.x1+r||p.z<b.z0-r||p.z>b.z1+r) continue;
      const cx=clamp(p.x,b.x0,b.x1), cz=clamp(p.z,b.z0,b.z1), dx=p.x-cx, dz=p.z-cz, d2=dx*dx+dz*dz;
      if(d2>=r*r) continue;
      if(d2>1e-8){const d=Math.sqrt(d2);p.x=cx+dx/d*r;p.z=cz+dz/d*r;}
      else { const o=[p.x-b.x0,b.x1-p.x,p.z-b.z0,b.z1-p.z], i=o.indexOf(Math.min(...o));
        if(i===0)p.x=b.x0-r; else if(i===1)p.x=b.x1+r; else if(i===2)p.z=b.z0-r; else p.z=b.z1+r; }
    }
    p.x=clamp(p.x,-this.half,this.half); p.z=clamp(p.z,-this.half,this.half);
  }

  update(dt){
    const K=this.keys;
    let mx=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0)+this.joy.x;
    let mz=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0)-this.joy.y;
    const l=Math.hypot(mx,mz); if(l>1){mx/=l;mz/=l;}
    const run=K.ShiftLeft||K.ShiftRight||Math.hypot(this.joy.x,this.joy.y)>.95;
    const sp=(run?7:4)*dt, sy=Math.sin(this.yaw), cy=Math.cos(this.yaw);
    const wx=-sy*mz+cy*mx, wz=-cy*mz-sy*mx;
    this.pos.x+=wx*sp; this.pos.z+=wz*sp;
    this.collide(this.pos);
    const moving=Math.hypot(mx,mz)>.05; this.bob+=moving?dt*(run?11:8):0;
    const cam=this.camera, me=this.me, third=this.view==='third';
    // avatar: turn toward the walking direction, swing arms/legs
    me.position.set(this.pos.x,0,this.pos.z); me.visible=third;
    if(moving){ const want=Math.atan2(wx,wz); let d=want-me.rotation.y; d=Math.atan2(Math.sin(d),Math.cos(d)); me.rotation.y+=d*Math.min(1,dt*10); }
    this.walkAmt+=((moving?1:0)-this.walkAmt)*Math.min(1,dt*8); this.walkPh+=dt*(run?11:7.5)*this.walkAmt;
    animateAvatar(me,this.walkPh,this.walkAmt);
    if(third){
      const pitch=clamp(this.pitch-.22,-1.2,.5); cam.rotation.set(pitch,this.yaw,0);
      const back=new THREE.Vector3(0,0,1).applyEuler(cam.rotation), hy=me.scale.y*1.62;
      // pull the camera in so it never ends up on the other side of a wall from you
      let D=this.camD;
      for(;D>.5;D-=.15){
        const x=this.pos.x+back.x*D, z=this.pos.z+back.z*D;
        if(!this.stores.some(s=>(Math.hypot(this.pos.x-s.cx,this.pos.z-s.cz)<s.R)!==(Math.hypot(x-s.cx,z-s.cz)<(Math.hypot(this.pos.x-s.cx,this.pos.z-s.cz)<s.R?s.R-.35:s.R+.35)))) break;
      }
      cam.position.set(this.pos.x+back.x*D,Math.max(.35,hy+back.y*D+.15),this.pos.z+back.z*D);
    } else {
      cam.position.set(this.pos.x,1.82+(moving?Math.sin(this.bob)*.035:0),this.pos.z); cam.rotation.set(this.pitch,this.yaw,0);
    }
    this.sky.position.copy(cam.position);
    this.sun.position.set(this.pos.x+40,80,this.pos.z+25); this.sun.target.position.set(this.pos.x,0,this.pos.z);

    const inside=this.stores.find(s=>s.interior&&Math.hypot(this.pos.x-s.cx,this.pos.z-s.cz)<s.R-.2)||null;
    if(inside!==this.insideOf){ this.insideOf=inside;
      if(inside){ const c=this.calc; this.say(`أهلاً في ${inside.name} · ${c.totalQty.toLocaleString('en-US')} منتج${this.shownCount<c.totalQty?' (المعروض '+this.shownCount.toLocaleString('en-US')+'، والباقي في المخزن)':''}`); }
      else this.say('رجعت للشارع'); }

    for(const c of this.cars){
      const lane=c.dir*3, px=c.alongX?c.s:c.line-lane, pz=c.alongX?c.line+lane:c.s;
      const ax=this.pos.x-px, az=this.pos.z-pz, ahead=c.alongX?ax*c.dir:az*c.dir, side=c.alongX?Math.abs(az):Math.abs(ax);
      c.cur+=(((ahead>0&&ahead<9&&side<1.8)?0:c.v)-c.cur)*Math.min(1,dt*3);
      c.s+=c.dir*c.cur*dt; if(c.s>c.lim)c.s=-c.lim; if(c.s<-c.lim)c.s=c.lim;
      c.g.position.set(c.alongX?c.s:c.line-lane,.02,c.alongX?c.line+lane:c.s);
      c.g.rotation.y=c.alongX?(c.dir>0?Math.PI/2:-Math.PI/2):(c.dir>0?0:Math.PI);
    }
    for(const p of this.people){
      p.s+=p.dir*p.v*dt; if(p.s>p.lim)p.s=-p.lim; if(p.s<-p.lim)p.s=p.lim; p.ph+=dt*6.5;
      p.g.position.set(p.alongX?p.s:p.line,0,p.alongX?p.line:p.s); animateAvatar(p.g,p.ph,1);
      p.g.rotation.y=p.alongX?(p.dir>0?Math.PI/2:-Math.PI/2):(p.dir>0?0:Math.PI);
    }
  }
  render(){ this.r.render(this.scene,this.camera); }
  resize(){ const a=innerWidth/innerHeight; this.camera.aspect=a; this.camera.fov=a<1?82:70; this.camera.updateProjectionMatrix(); }

  dispose(){
    this.disposed=true;
    const cv=this.r.domElement;
    removeEventListener('keydown',this._kd); removeEventListener('keyup',this._ku);
    cv.removeEventListener('pointerdown',this._down); cv.removeEventListener('pointermove',this._move);
    cv.removeEventListener('pointerup',this._up); cv.removeEventListener('pointercancel',this._up);
    this.hud.remove();
    this.scene.traverse(o=>{ o.geometry?.dispose();
      for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[])){ m.map?.dispose(); m.dispose(); } });
  }
}
