// عالم الشراء — modest avatars. Every outfit covers from the neck to the ankles and wrists.
// A built avatar faces +z, stands on y=0 and is about `height` metres tall.
import * as THREE from 'three';

export const SKINS = ['#f3d4b8','#e6b996','#d29d74','#b97f57','#8f5d3c','#5e3a26'];
export const HAIR  = ['#1b1512','#3b2618','#6b4527','#a0743f','#8a8a8a'];
export const CLOTH = ['#f4f2ec','#e9e2d3','#1d1d22','#2c3e66','#5b3a2e','#2f5d50','#7a2e48','#8c7a5b','#6b6f78','#3d2f5a','#b5653a','#c9b9a6'];

export const OUTFITS = {
  m: [
    {id:'kandura', name:'كندورة'},
    {id:'thobe',   name:'ثوب ملوّن'},
    {id:'shirt',   name:'قميص وبنطلون'},
  ],
  f: [
    {id:'abaya',   name:'عباية'},
    {id:'dress',   name:'فستان طويل'},
    {id:'tunic',   name:'بلوزة طويلة وتنورة'},
  ],
};
export const HEADWEAR = {
  m: [{id:'ghutra', name:'غترة وعقال'}, {id:'shemagh', name:'شماغ أحمر'}, {id:'none', name:'بدون'}],
  f: [{id:'shayla', name:'شيلة'}, {id:'hijab', name:'حجاب'}, {id:'none', name:'بدون'}],
};

export function defaultAvatar(gender='m'){
  return gender==='m'
    ? {gender:'m', skin:SKINS[2], hair:HAIR[0], outfit:'kandura', head:'ghutra', color:CLOTH[0], color2:CLOTH[2], beard:'short', glasses:false, height:1.76, build:1}
    : {gender:'f', skin:SKINS[1], hair:HAIR[0], outfit:'abaya',   head:'shayla', color:CLOTH[2], color2:CLOTH[2], beard:'none',  glasses:false, height:1.64, build:1};
}

export function randomAvatar(rand=Math.random){
  const pick=a=>a[Math.floor(rand()*a.length)];
  const g=rand()<.5?'m':'f', a=defaultAvatar(g);
  a.skin=pick(SKINS); a.hair=pick(HAIR.slice(0,4)); a.outfit=pick(OUTFITS[g]).id;
  a.head=rand()<.7?pick(HEADWEAR[g].slice(0,2)).id:'none';
  if(g==='m'){
    a.color=a.outfit==='kandura'?pick(['#f4f2ec','#f4f2ec','#e9e2d3']):pick(CLOTH);
    a.beard=pick(['none','short','short','full']);
  } else a.color=a.outfit==='abaya'?pick(['#1d1d22','#1d1d22','#3d2f5a','#5b3a2e']):pick(CLOTH);
  a.color2=pick(CLOTH); a.glasses=rand()<.15;
  a.height=g==='m'?1.66+rand()*.22:1.55+rand()*.17; a.build=.9+rand()*.25;
  return a;
}

/* ---------- shared geometry / materials ---------- */
const geo={}, mats={};
const mat=(c,opt={})=>{const k=c+JSON.stringify(opt); return mats[k]||(mats[k]=new THREE.MeshStandardMaterial({color:c,roughness:.82,...opt}));};
const lathe=(key,pts,seg=20,ps=0,pl=Math.PI*2)=>geo[key]||(geo[key]=new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),seg,ps,pl));
const once=(key,f)=>geo[key]||(geo[key]=f());

// body is built for a 1.75 m person, then the whole group is scaled
const ROBE_M   = [[0,.04],[.25,.04],[.245,.4],[.225,.8],[.215,1.0],[.225,1.2],[.24,1.36],[.21,1.44],[.1,1.49],[.06,1.5]];
const ROBE_ABY = [[0,.03],[.31,.03],[.28,.4],[.24,.8],[.215,1.0],[.215,1.2],[.23,1.36],[.2,1.44],[.1,1.49],[.06,1.5]];
const DRESS    = [[0,.04],[.29,.04],[.26,.4],[.22,.8],[.185,1.02],[.2,1.2],[.225,1.34],[.2,1.44],[.1,1.49],[.06,1.5]];
const TUNIC    = [[0,.62],[.25,.62],[.23,.8],[.2,1.0],[.215,1.2],[.235,1.35],[.205,1.44],[.1,1.49],[.06,1.5]];
const SKIRT    = [[0,.04],[.27,.04],[.24,.35],[.21,.7],[.19,.95],[0,.95]];
const SHIRT    = [[0,.9],[.2,.9],[.205,1.05],[.225,1.25],[.24,1.37],[.21,1.44],[.1,1.49],[.06,1.5]];

function cloth(c){ return mat(c,{side:THREE.DoubleSide}); }

export function buildAvatar(a){
  const A={...defaultAvatar(a?.gender||'m'),...(a||{})};
  const g=new THREE.Group(), body=new THREE.Group(); g.add(body);
  const skin=mat(A.skin,{roughness:.6}), hairM=mat(A.hair,{roughness:.9}), main=cloth(A.color), sec=cloth(A.color2);
  const shoe=mat('#2a2522',{roughness:.6});
  const anim={arms:[],legs:[],body};

  // ---- garment ----
  let robe=null, legsVisible=false;
  if(A.outfit==='kandura'||A.outfit==='thobe') robe=lathe('robeM',ROBE_M);
  else if(A.outfit==='abaya') robe=lathe('robeA',ROBE_ABY);
  else if(A.outfit==='dress') robe=lathe('dress',DRESS);
  if(robe){ const m=new THREE.Mesh(robe,main); m.scale.set(A.build,1,.78*A.build); body.add(m); }
  if(A.outfit==='tunic'){
    const t=new THREE.Mesh(lathe('tunic',TUNIC),main); t.scale.set(A.build,1,.78*A.build);
    const s=new THREE.Mesh(lathe('skirt',SKIRT),sec);  s.scale.set(A.build,1,.8*A.build); body.add(t,s);
  }
  if(A.outfit==='shirt'){
    const t=new THREE.Mesh(lathe('shirt',SHIRT),main); t.scale.set(A.build,1,.78*A.build); body.add(t);
    const belt=new THREE.Mesh(once('belt',()=>new THREE.CylinderGeometry(.205,.205,.05,20)),mat('#2a2522')); belt.position.y=.93; belt.scale.set(A.build,1,.78*A.build); body.add(belt);
    legsVisible=true;
  }
  if(A.outfit==='kandura'){ // tarboosh: the small tassel hanging from the collar
    const t=new THREE.Mesh(once('tarb',()=>new THREE.CylinderGeometry(.012,.006,.28,6)),main);
    t.position.set(0,1.32,.16*A.build); body.add(t);
  }
  // legs (trousers) — only for the shirt outfit, but they still swing under robes for the walk cycle
  if(legsVisible){
    const lg=once('leg',()=>{const c=new THREE.CapsuleGeometry(.085,.72,4,10); c.translate(0,-.44,0); return c;});
    for(const x of [-.1,.1]){
      const p=new THREE.Group(); p.position.set(x*A.build,.93,0);
      p.add(new THREE.Mesh(lg,sec)); body.add(p); anim.legs.push(p);
    }
  }
  // feet / shoes peeking out at the hem
  const ft=once('foot',()=>{const b=new THREE.BoxGeometry(.1,.07,.24); b.translate(0,.035,.04); return b;});
  [-.1,.1].forEach((x,k)=>{ const f=new THREE.Mesh(ft,A.gender==='m'&&A.outfit!=='shirt'?mat('#6b4a2e'):shoe);
    if(legsVisible){ f.position.set(0,-.93,0); anim.legs[k].add(f); }
    else { f.position.set(x*A.build,0,0); body.add(f); anim.legs.push(f); } });

  // arms: full long sleeves + hands
  const sl=once('sleeve',()=>{const c=new THREE.CapsuleGeometry(.062,.5,4,10); c.translate(0,-.3,0); return c;});
  const hd=once('hand',()=>new THREE.SphereGeometry(.05,10,8));
  for(const s of [-1,1]){
    const arm=new THREE.Group(); arm.position.set(s*.25*A.build,1.42,0); arm.rotation.z=s*.09;
    arm.add(new THREE.Mesh(sl,main));
    const cuff=new THREE.Mesh(once('cuff',()=>new THREE.CylinderGeometry(.068,.075,.08,10)),main); cuff.position.y=-.6; arm.add(cuff);
    const h=new THREE.Mesh(hd,skin); h.position.y=-.69; h.scale.set(.85,1.1,.6); arm.add(h);
    body.add(arm); anim.arms.push(arm);
  }

  // neck + head
  const neck=new THREE.Mesh(once('neck',()=>new THREE.CylinderGeometry(.055,.06,.1,10)),skin); neck.position.y=1.52; body.add(neck);
  const head=new THREE.Group(); head.position.y=1.64; body.add(head);
  const skull=new THREE.Mesh(once('head',()=>new THREE.SphereGeometry(.105,20,16)),skin); skull.scale.set(.92,1.1,1); head.add(skull);
  const eyeG=once('eye',()=>new THREE.SphereGeometry(.013,8,6)), eyeM=mat('#1a1410',{roughness:.3});
  const browG=once('brow',()=>new THREE.BoxGeometry(.036,.008,.01));
  for(const x of [-.036,.036]){
    const e=new THREE.Mesh(eyeG,eyeM); e.position.set(x,.015,.092); head.add(e);
    const b=new THREE.Mesh(browG,hairM); b.position.set(x,.042,.093); b.rotation.z=x>0?-.12:.12; head.add(b);
  }
  const nose=new THREE.Mesh(once('nose',()=>new THREE.ConeGeometry(.014,.04,6)),skin); nose.position.set(0,-.012,.102); nose.rotation.x=Math.PI/2+.4; head.add(nose);
  const mouth=new THREE.Mesh(once('mouth',()=>new THREE.BoxGeometry(.034,.007,.01)),mat('#8c4a3e')); mouth.position.set(0,-.05,.094); head.add(mouth);
  for(const x of [-.097,.097]){ const ear=new THREE.Mesh(once('ear',()=>new THREE.SphereGeometry(.022,8,6)),skin); ear.position.set(x,0,0); ear.scale.set(.5,1,.8); head.add(ear); }

  if(A.gender==='m'&&A.beard!=='none'){
    const full=A.beard==='full';
    const bg=once('beard'+A.beard,()=>new THREE.SphereGeometry(.112,16,10,Math.PI/2-1.25,2.5,full?1.62:1.85,full?.95:.7));
    const b=new THREE.Mesh(bg,hairM); b.scale.set(.93,1.12,1.02); b.position.y=full?-.006:0; head.add(b);
    const mo=new THREE.Mesh(once('mous',()=>new THREE.BoxGeometry(.05,.012,.012)),hairM); mo.position.set(0,-.036,.098); head.add(mo);
  }
  if(A.glasses){
    const ring=once('lens',()=>new THREE.TorusGeometry(.022,.004,6,16)), fr=mat('#111',{roughness:.3});
    for(const x of [-.036,.036]){ const r=new THREE.Mesh(ring,fr); r.position.set(x,.015,.105); head.add(r); }
    const br=new THREE.Mesh(once('bridge',()=>new THREE.BoxGeometry(.026,.004,.004)),fr); br.position.set(0,.02,.106); head.add(br);
  }

  // ---- head cover ----
  const gap=(w)=>[w/2, Math.PI*2-w];          // opening centred on +z (the face)
  if(A.head==='ghutra'||A.head==='shemagh'){
    const [ps,pl]=gap(1.5);
    const tex=A.head==='shemagh'?checkTex():null;
    const gm=tex?new THREE.MeshStandardMaterial({map:tex,roughness:.9,side:THREE.DoubleSide}):cloth('#f7f6f2');
    const gh=new THREE.Mesh(lathe('ghutra',[[0,.135],[.07,.125],[.112,.085],[.122,.03],[.13,-.04],[.15,-.12],[.2,-.22],[.25,-.3]],22,ps,pl),gm);
    head.add(gh);
    const agal=new THREE.Mesh(once('agal',()=>new THREE.TorusGeometry(.104,.012,8,24)),mat('#121212',{roughness:.5}));
    agal.rotation.x=Math.PI/2+.12; agal.position.y=.085; head.add(agal);
    const agal2=agal.clone(); agal2.position.y=.105; agal2.scale.setScalar(.97); head.add(agal2);
  } else if(A.head==='shayla'||A.head==='hijab'){
    const sh=A.head==='shayla';
    const [ps,pl]=gap(sh?1.25:1.15);
    const c=sh?(A.outfit==='abaya'?A.color:'#1d1d22'):A.color2;
    const prof=sh?[[0,.135],[.07,.126],[.112,.09],[.12,.03],[.118,-.04],[.13,-.11],[.2,-.2],[.26,-.32],[.27,-.42]]
                 :[[0,.135],[.07,.126],[.112,.09],[.12,.03],[.118,-.04],[.12,-.1],[.17,-.17],[.22,-.22]];
    head.add(new THREE.Mesh(lathe(sh?'shayla':'hijab',prof,22,ps,pl),cloth(c)));
    // chin wrap closes the opening below the face
    const wrap=new THREE.Mesh(once('wrap',()=>new THREE.SphereGeometry(.118,16,10,Math.PI/2-.8,1.6,2.25,.6)),cloth(c));
    wrap.scale.set(.95,1.1,1.05); head.add(wrap);
    const nk=new THREE.Mesh(once('nwrap',()=>new THREE.CylinderGeometry(.075,.11,.16,14,1,true)),cloth(c)); nk.position.y=-.13; head.add(nk);
  } else {
    // hair
    const long=A.gender==='f';
    const cap=new THREE.Mesh(once('hairCap',()=>new THREE.SphereGeometry(.112,18,12,0,Math.PI*2,0,1.45)),hairM);
    cap.scale.set(.95,1.08,1.04); cap.position.set(0,.008,-.006); cap.rotation.x=-.25; head.add(cap);
    if(long){ const back=new THREE.Mesh(once('hairLong',()=>{const c=new THREE.CapsuleGeometry(.09,.2,4,10); return c;}),hairM);
      back.position.set(0,-.1,-.06); back.scale.set(1.1,1,.6); head.add(back); }
  }

  g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
  g.scale.setScalar(A.height/1.75);
  g.userData.anim=anim; g.userData.spec=A;
  return g;
}

// walk cycle: phase in radians, amount 0..1
export function animateAvatar(g,phase,amount){
  const an=g.userData.anim; if(!an) return;
  const s=Math.sin(phase)*amount;
  an.arms.forEach((a,i)=>{ a.rotation.x=(i?-1:1)*s*.45; });
  an.legs.forEach((l,i)=>{ if(l.isGroup) l.rotation.x=(i%2?-1:1)*s*.5; else l.position.z=(i%2?-1:1)*s*.12; });
  an.body.position.y=Math.abs(Math.cos(phase))*.025*amount;
}

let _check=null;
function checkTex(){
  if(_check) return _check;
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  x.fillStyle='#f4f1ea'; x.fillRect(0,0,64,64); x.fillStyle='#c0262d';
  for(let i=0;i<64;i+=8) for(let j=0;j<64;j+=8) if(((i+j)/8)%2===0) x.fillRect(i+1,j+1,6,6);
  _check=new THREE.CanvasTexture(c); _check.colorSpace=THREE.SRGBColorSpace;
  _check.wrapS=_check.wrapT=THREE.RepeatWrapping; _check.repeat.set(6,3); _check.magFilter=THREE.NearestFilter;
  return _check;
}
