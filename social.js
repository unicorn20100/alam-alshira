// عالم الشراء — people together: live avatars, nearby + private chat, spatial voice, private calls.
//
// • Everyone in the same district joins one realtime room (Supabase Realtime): presence + positions + nearby text.
// • Voice and private messages go person-to-person over WebRTC (encrypted, not through our server).
// • Voice is spatial: you hear people nearby, louder when closer, from the direction they stand.
// • Private call: both agree; while it lasts each of you sends your voice only to the other.
// • Under-18s: they see people and nearby text, but voice and private chat are off.
import * as THREE from 'three';
import { buildAvatar, animateAvatar } from './avatar.js?v=6';
import { client, reportUser } from './backend.js?v=6';

const ICE = [{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
const NEAR_TEXT = 20, VOICE_ON = 18, VOICE_OFF = 26, MAX_PEERS = 8, HEAR = 24;
const esc = t => String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load = (k,d) => { try{ return JSON.parse(localStorage.getItem(k)||'null') ?? d; }catch(e){ return d; } };
const save = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const FONT = '"Tajawal", system-ui, sans-serif';

let cssDone=false;
function css(){
  if(cssDone) return; cssDone=true;
  const s=document.createElement('style'); s.textContent=`
  .soc-btns{position:absolute;right:14px;bottom:18px;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
  .soc-btns button{width:54px;height:54px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(14,20,38,.82);color:#fff;font-size:24px;cursor:pointer;position:relative}
  .soc-btns button.on{background:#2bb36a;border-color:#7fffb6}
  .soc-btns button.live{box-shadow:0 0 0 4px rgba(127,255,182,.45)}
  .soc-btns i{position:absolute;top:-4px;left:-4px;min-width:20px;height:20px;border-radius:10px;background:#ff5a5a;font-size:11px;font-style:normal;line-height:20px;padding:0 5px;display:none}
  .soc-chat{position:absolute;right:78px;bottom:18px;width:320px;max-height:60vh;display:none;flex-direction:column;background:rgba(14,20,38,.94);border:1px solid rgba(255,255,255,.14);border-radius:18px;overflow:hidden;pointer-events:auto}
  .soc-chat.open{display:flex}
  .soc-tabs{display:flex;gap:4px;padding:8px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.08)}
  .soc-tabs button{flex:none;padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#eef2ff;font:inherit;font-size:13px;cursor:pointer}
  .soc-tabs button.on{background:rgba(77,163,255,.25);border-color:#4da3ff}
  .soc-log{flex:1;overflow-y:auto;padding:10px;font-size:14px;line-height:1.6;min-height:160px}
  .soc-log .m{margin-bottom:6px}.soc-log .m b{color:#9fd0ff}.soc-log .m.me b{color:#7fffb6}.soc-log .sys{color:#9aa6c4;font-size:12px;text-align:center}
  .soc-in{display:flex;gap:6px;padding:8px;border-top:1px solid rgba(255,255,255,.08)}
  .soc-in input{flex:1;min-width:0;padding:9px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#151d35;color:#fff;font:inherit;font-size:15px}
  .soc-in button{padding:0 14px;border-radius:10px;border:0;background:#4da3ff;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  .soc-card{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:min(340px,92vw);background:rgba(14,20,38,.95);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:14px;display:none;pointer-events:auto}
  .soc-card.open{display:block}
  .soc-card h3{font-size:18px;margin-bottom:2px}.soc-card small{color:#9aa6c4}
  .soc-card .acts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
  .soc-card .acts button{padding:9px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:#151d35;color:#fff;font:inherit;font-size:13px;cursor:pointer}
  .soc-card .acts button.pri{background:linear-gradient(135deg,#4da3ff,#6a5cff);border:0;font-weight:700}
  .soc-card .acts button:disabled{opacity:.45;cursor:default}
  .soc-card .x{position:absolute;top:8px;left:10px;background:none;border:0;color:#9aa6c4;font-size:22px;cursor:pointer}
  .soc-ask{position:absolute;top:120px;left:50%;transform:translateX(-50%);background:#111a33;border:1px solid #7fffb6;border-radius:16px;padding:14px;display:none;pointer-events:auto;text-align:center;width:min(320px,90vw)}
  .soc-ask.open{display:block}.soc-ask div{display:flex;gap:8px;justify-content:center;margin-top:10px}
  .soc-ask button{padding:8px 16px;border-radius:10px;border:0;font:inherit;font-weight:700;cursor:pointer}
  .soc-priv{position:absolute;top:112px;left:50%;transform:translateX(-50%);background:#2bb36a;color:#04140a;border-radius:14px;padding:6px 12px;font-weight:700;font-size:13px;display:none;pointer-events:auto;cursor:pointer}
  .soc-count{background:rgba(14,20,38,.78);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:9px 12px;font-size:14px}
  @media (max-width:760px){.soc-chat{right:8px;left:8px;width:auto;bottom:84px;max-height:46vh}.soc-btns{bottom:auto;top:70px;right:10px}.soc-btns button{width:46px;height:46px;font-size:20px}}`;
  document.head.appendChild(s);
}

function tagTexture(name, opts={}){
  const c=document.createElement('canvas'); c.width=512; c.height=128; const x=c.getContext('2d');
  x.font=`800 54px ${FONT}`; x.direction='rtl'; x.textAlign='center'; x.textBaseline='middle';
  const label=(opts.lock?'🔒 ':'')+(opts.talk?'🔊 ':'')+name;
  const w=Math.min(500,x.measureText(label).width+48);
  x.fillStyle=opts.talk?'rgba(43,179,106,.92)':'rgba(10,16,32,.72)';
  x.beginPath(); x.roundRect((512-w)/2,18,w,92,46); x.fill();
  x.fillStyle='#fff'; x.fillText(label,256,66,480);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
function bubbleTexture(text){
  const c=document.createElement('canvas'); c.width=768; c.height=256; const x=c.getContext('2d');
  x.font=`600 44px ${FONT}`; x.direction='rtl'; x.textAlign='center'; x.textBaseline='middle';
  const words=text.split(/\s+/), lines=[]; let cur='';
  for(const w of words){ const t=cur?cur+' '+w:w; if(x.measureText(t).width>680&&cur){ lines.push(cur); cur=w; } else cur=t; }
  if(cur) lines.push(cur); const L=lines.slice(0,3); if(lines.length>3) L[2]+='…';
  const h=L.length*56+40, y0=(256-h)/2;
  x.fillStyle='rgba(255,255,255,.96)'; x.beginPath(); x.roundRect(24,y0,720,h,34); x.fill();
  x.fillStyle='#14203a'; L.forEach((l,i)=>x.fillText(l,384,y0+48+i*56,690));
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}

export class Social {
  // me: {id, name, avatar, adult}; room: district id (plot number)
  constructor(city, {me, room}){
    this.city=city; this.me=me; this.room=String(room);
    this.people=new Map();
    this.blocked=new Set(load('alam-blocked',[])); this.muted=new Set();
    this.mic=null; this.ctx=null; this.privateWith=null; this.follow=null;
    this.threads=new Map([['near',[]]]); this.tab='near'; this.unread=0;
    this.lastSent={x:1e9,z:1e9,ry:0,t:0}; this.sayAt=0;
    css(); this.buildUI();
    city.onPickPerson=ray=>this.pickPerson(ray);
    this._gest=()=>this.ensureAudio(); addEventListener('pointerdown',this._gest);   // browsers only allow sound after a tap
  }

  async start(){
    const c=await client(); if(!c){ this.sys('ما قدرنا نوصل للسيرفر. تقدر تتمشى بس ما تشوف الناس'); return; }
    const ch=this.ch=c.channel('city-'+this.room,{config:{presence:{key:this.me.id},broadcast:{self:false}}});
    ch.on('presence',{event:'sync'},()=>this.syncPresence())
      .on('broadcast',{event:'pos'},({payload})=>this.onPos(payload))
      .on('broadcast',{event:'say'},({payload})=>this.onSay(payload))
      .on('broadcast',{event:'sig'},({payload})=>this.onSig(payload))
      .subscribe(st=>{ if(st==='SUBSCRIBED') this.track(); });
  }
  track(){ this.ch?.track({id:this.me.id,name:this.me.name,avatar:this.me.avatar,adult:!!this.me.adult,lock:!!this.privateWith}); }

  /* ---------------- people ---------------- */
  syncPresence(){
    const st=this.ch.presenceState(), seen=new Set();
    for(const key in st){
      const p=st[key][0]; if(!p||p.id===this.me.id) continue; seen.add(p.id);
      let pp=this.people.get(p.id);
      if(!pp){ pp=this.addPerson(p); }
      else if(pp.lock!==!!p.lock){ pp.lock=!!p.lock; this.retag(pp); }
    }
    for(const [id,pp] of this.people) if(!seen.has(id)) this.removePerson(id);
    this.$count.textContent=`👥 ${this.people.size+1} هنا`;
  }
  addPerson(p){
    const g=buildAvatar(p.avatar); g.visible=false; g.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.userData.personId=p.id; } });
    const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tagTexture(p.name),depthTest:false,transparent:true}));
    tag.scale.set(1.6,.4,1); tag.position.y=2.15/g.scale.y; tag.renderOrder=10; g.add(tag);
    this.city.scene.add(g);
    const pp={id:p.id,name:String(p.name||'').slice(0,40),adult:!!p.adult,lock:!!p.lock,g,tag,cur:null,target:null,ph:Math.random()*6,walk:0,talk:false};
    this.people.set(p.id,pp);
    if(this.blocked.has(p.id)) g.visible=false;
    this.sys(`${pp.name} وصل المنطقة`);
    this.sendPos(true);           // let the newcomer see us right away
    return pp;
  }
  removePerson(id){
    const pp=this.people.get(id); if(!pp) return;
    this.hangup(pp); this.city.scene.remove(pp.g); pp.bubble&&pp.g.remove(pp.bubble);
    if(this.privateWith===id) this.endPrivate(false);
    if(this.follow===id) this.setFollow(null);
    this.people.delete(id); this.sys(`${pp.name} طلع من المنطقة`);
    if(this.card?.id===id) this.closeCard();
  }
  retag(pp){ pp.tag.material.map.dispose(); pp.tag.material.map=tagTexture(pp.name,{lock:pp.lock,talk:pp.talk}); }
  onPos(m){
    const pp=this.people.get(m.id); if(!pp) return;
    pp.target={x:+m.x,z:+m.z,ry:+m.ry,w:+m.w||0};
    if(!pp.cur){ pp.cur={...pp.target}; pp.g.visible=!this.blocked.has(pp.id); }
  }
  sendPos(force){
    if(!this.ch) return;
    const c=this.city, now=performance.now(), l=this.lastSent;
    const moved=Math.hypot(c.pos.x-l.x,c.pos.z-l.z)>.05||Math.abs(c.me.rotation.y-l.ry)>.05;
    if(!force&&!(moved&&now-l.t>180)&&!(now-l.t>2500)) return;
    Object.assign(l,{x:c.pos.x,z:c.pos.z,ry:c.me.rotation.y,t:now});
    this.ch.send({type:'broadcast',event:'pos',payload:{id:this.me.id,x:+c.pos.x.toFixed(2),z:+c.pos.z.toFixed(2),ry:+c.me.rotation.y.toFixed(2),w:+c.walkAmt.toFixed(2)}});
  }
  dist(pp){ return pp.cur?Math.hypot(pp.cur.x-this.city.pos.x,pp.cur.z-this.city.pos.z):1e9; }

  /* ---------------- text ---------------- */
  sendText(text){
    text=String(text||'').trim().slice(0,200); if(!text) return;
    const now=performance.now(); if(now-this.sayAt<900){ this.city.say('على راحتك، رسالة كل ثانية'); return; } this.sayAt=now;
    if(this.tab==='near'){
      this.ch?.send({type:'broadcast',event:'say',payload:{id:this.me.id,text,x:this.city.pos.x,z:this.city.pos.z}});
      this.log('near',this.me.name,text,true); this.bubble(null,text);
    } else {
      const pp=this.people.get(this.tab); if(!pp) return this.city.say('هذا الشخص طلع من المنطقة');
      this.dcSend(pp,{t:'msg',text}); this.log(pp.id,this.me.name,text,true);
    }
  }
  onSay(m){
    const pp=this.people.get(m.id); if(!pp||this.blocked.has(pp.id)) return;
    const text=String(m.text||'').slice(0,200);
    if(Math.hypot(m.x-this.city.pos.x,m.z-this.city.pos.z)>NEAR_TEXT) return;   // too far to hear
    this.log('near',pp.name,text); this.bubble(pp,text);
  }
  bubble(pp,text){
    const g=pp?pp.g:this.city.me, old=pp?pp.bubble:this._myBubble;
    if(old){ g.remove(old); old.material.map.dispose(); }
    const b=new THREE.Sprite(new THREE.SpriteMaterial({map:bubbleTexture(text),depthTest:false,transparent:true}));
    b.scale.set(2.4,.8,1); b.position.y=2.75/g.scale.y; b.renderOrder=11; g.add(b);
    if(pp) pp.bubble=b; else this._myBubble=b;
    clearTimeout(b._t); setTimeout(()=>{ g.remove(b); b.material.map.dispose(); },6000);
  }

  /* ---------------- voice + private (WebRTC) ---------------- */
  canTalk(pp){ return this.me.adult&&pp.adult&&!this.blocked.has(pp.id); }
  async ensureAudio(){
    if(!this.ctx){ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }
    if(this.ctx.state==='suspended') await this.ctx.resume().catch(()=>{});
  }
  async toggleMic(){
    if(!this.me.adult) return this.city.say('المكالمات الصوتية للي أعمارهم 18 وفوق');
    await this.ensureAudio();
    if(this.mic){ this.mic.getTracks().forEach(t=>t.stop()); this.mic=null; this.micBtn.classList.remove('on'); this.setTracks(); this.city.say('سكّرت المايك'); return; }
    try{
      this.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      this.micBtn.classList.add('on'); this.setTracks();
      const src=this.ctx.createMediaStreamSource(this.mic); this.micAn=this.ctx.createAnalyser(); this.micAn.fftSize=512; src.connect(this.micAn);
      this.city.say('المايك شغال. اللي قريبين منك يسمعونك');
    }catch(e){ console.warn(e); this.city.say('ما قدرنا نشغل المايك. اسمح للمتصفح يستخدمه'); }
  }
  // who receives my voice: everyone connected, or only my private partner
  setTracks(){
    const track=this.mic?.getAudioTracks()[0]||null;
    for(const pp of this.people.values()) if(pp.sender){
      const allow=track&&(!this.privateWith||this.privateWith===pp.id);
      pp.sender.replaceTrack(allow?track:null).catch(()=>{});
    }
  }
  connect(pp){
    if(pp.pc||!this.canTalk(pp)) return;
    const pc=pp.pc=new RTCPeerConnection({iceServers:ICE}); pp.cands=[];
    const initiator=this.me.id<pp.id;
    if(initiator){
      pp.sender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
      this.setupDC(pp,pc.createDataChannel('chat'));
    } else { pc.ondatachannel=e=>this.setupDC(pp,e.channel); this.sig(pp,{want:1}); }   // ask the other side to start
    pc.onicecandidate=e=>{ if(e.candidate) this.sig(pp,{cand:e.candidate}); };
    pc.ontrack=e=>this.playRemote(pp,e.streams[0]||new MediaStream([e.track]));
    pc.onconnectionstatechange=()=>{ if(['failed','closed'].includes(pc.connectionState)&&pp.pc===pc) this.hangup(pp); };
    if(initiator) (async()=>{ await pc.setLocalDescription(await pc.createOffer()); this.sig(pp,{sdp:pc.localDescription}); this.setTracks(); })();
  }
  sig(pp,data){ this.ch?.send({type:'broadcast',event:'sig',payload:{from:this.me.id,to:pp.id,...JSON.parse(JSON.stringify(data))}}); }
  async onSig(m){
    if(m.to!==this.me.id) return;
    const pp=this.people.get(m.from); if(!pp||!this.canTalk(pp)) return;
    try{
      if(m.want){ if(!pp.pc) this.connect(pp); return; }
      if(m.sdp){
        if(m.sdp.type==='offer'){ if(pp.pc&&pp.pc.signalingState!=='stable') return; if(!pp.pc) this.connect(pp);
          const pc=pp.pc; await pc.setRemoteDescription(m.sdp);
          const tr=pc.getTransceivers().find(t=>t.receiver.track.kind==='audio'); if(tr){ tr.direction='sendrecv'; pp.sender=tr.sender; }
          await pc.setLocalDescription(await pc.createAnswer()); this.sig(pp,{sdp:pc.localDescription}); this.setTracks();
        } else if(pp.pc) await pp.pc.setRemoteDescription(m.sdp);
        for(const c of pp.cands.splice(0)) await pp.pc.addIceCandidate(c).catch(()=>{});
      } else if(m.cand){
        if(!pp.pc) return;
        if(pp.pc.remoteDescription) await pp.pc.addIceCandidate(m.cand).catch(()=>{}); else pp.cands.push(m.cand);
      }
    }catch(e){ console.warn('signal',e); }
  }
  setupDC(pp,dc){
    pp.dc=dc; pp.dcq=pp.dcq||[];
    dc.onopen=()=>{ for(const m of pp.dcq.splice(0)) dc.send(JSON.stringify(m)); };
    dc.onmessage=e=>{ let m; try{ m=JSON.parse(e.data); }catch(_){ return; } this.onDirect(pp,m); };
  }
  dcSend(pp,m){
    if(pp.dc?.readyState==='open') pp.dc.send(JSON.stringify(m));
    else { (pp.dcq=pp.dcq||[]).push(m); this.connect(pp); }
  }
  playRemote(pp,stream){
    if(!this.ctx) this.ensureAudio();
    const ctx=this.ctx; if(!ctx) return;
    const el=new Audio(); el.srcObject=stream; el.muted=true; el.play().catch(()=>{});   // Chrome needs this for WebAudio to receive data
    const src=ctx.createMediaStreamSource(stream), pan=ctx.createPanner(), gain=ctx.createGain(), an=ctx.createAnalyser();
    Object.assign(pan,{panningModel:'HRTF',distanceModel:'inverse',refDistance:2,maxDistance:HEAR,rolloffFactor:1.6});
    an.fftSize=512; src.connect(an); src.connect(pan).connect(gain).connect(ctx.destination);
    pp.audio={el,src,pan,gain,an,buf:new Uint8Array(512)};
  }
  hangup(pp){
    try{ pp.dc?.close(); pp.pc?.close(); }catch(e){}
    if(pp.audio){ try{ pp.audio.src.disconnect(); pp.audio.gain.disconnect(); }catch(e){} pp.audio.el.srcObject=null; }
    pp.pc=pp.dc=pp.sender=pp.audio=null; pp.cands=[];
  }
  // private call
  askPrivate(pp){
    if(!this.canTalk(pp)) return this.city.say(pp.adult?'ما تقدر تكلم هذا الشخص':'المكالمات الخاصة للي أعمارهم 18 وفوق');
    if(pp.lock) return this.city.say(`${pp.name} في مكالمة خاصة الحين`);
    this.dcSend(pp,{t:'priv-req'}); this.city.say(`أرسلنا طلب كلام خاص لـ ${pp.name}…`);
  }
  onDirect(pp,m){
    if(this.blocked.has(pp.id)) return;
    if(m.t==='msg'){ const text=String(m.text||'').slice(0,200); this.log(pp.id,pp.name,text); if(this.tab!==pp.id||!this.chat.classList.contains('open')) this.city.say(`💬 ${pp.name}: ${text}`); }
    else if(m.t==='priv-req'){
      if(this.privateWith) return this.dcSend(pp,{t:'priv-no',busy:true});
      this.ask(`${pp.name} يبغي يكلمك كلام خاص. محد غيركم بيسمع.`,()=>{ this.dcSend(pp,{t:'priv-ok'}); this.startPrivate(pp); },()=>this.dcSend(pp,{t:'priv-no'}));
    }
    else if(m.t==='priv-ok') this.startPrivate(pp);
    else if(m.t==='priv-no') this.city.say(m.busy?`${pp.name} مشغول بمكالمة ثانية`:`${pp.name} ما قبل الكلام الخاص`);
    else if(m.t==='priv-end'&&this.privateWith===pp.id) this.endPrivate(false);
  }
  startPrivate(pp){
    this.privateWith=pp.id; this.setTracks(); this.track();
    this.privBar.textContent=`🔒 كلام خاص مع ${pp.name} · اضغط للإنهاء`; this.privBar.style.display='block';
    this.openThread(pp.id); this.city.say(`بدأ الكلام الخاص مع ${pp.name}. محد غيركم يسمع`);
    if(!this.mic) this.city.say('شغّل المايك 🎙️ عشان يسمعك');
  }
  endPrivate(notify=true){
    const pp=this.people.get(this.privateWith);
    if(notify&&pp) this.dcSend(pp,{t:'priv-end'});
    this.privateWith=null; this.setTracks(); this.track(); this.privBar.style.display='none';
    this.city.say('خلص الكلام الخاص');
  }

  /* ---------------- safety ---------------- */
  block(pp){
    this.blocked.add(pp.id); save('alam-blocked',[...this.blocked]); pp.g.visible=false; this.hangup(pp);
    if(this.privateWith===pp.id) this.endPrivate(false);
    if(this.follow===pp.id) this.setFollow(null);
    this.city.say(`حظرت ${pp.name}. ما بتشوفه ولا بتسمعه`); this.closeCard();
  }
  async report(pp){
    const ctx=[...(this.threads.get(pp.id)||[]),...(this.threads.get('near')||[])].filter(m=>m.who===pp.name).slice(-10).map(m=>m.text).join(' | ');
    try{ await reportUser({reported:pp.id,reason:'إساءة في المحادثة أو الصوت',context:ctx.slice(0,4000)}); this.city.say('وصلنا البلاغ. شكراً لك 🙏'); }
    catch(e){ console.warn(e); this.city.say('ما وصل البلاغ، جرّب مرة ثانية'); }
  }
  setFollow(id){ this.follow=id; this.city.extMove=null; if(!id) this.city.say('وقفت المشي مع الشخص'); }

  /* ---------------- UI ---------------- */
  buildUI(){
    const hud=this.city.hud;
    this.$count=document.createElement('div'); this.$count.className='soc-count'; this.$count.textContent='👥 1 هنا';
    hud.querySelector('.top > div:last-child').prepend(this.$count);
    const btns=document.createElement('div'); btns.className='soc-btns';
    btns.innerHTML=`<button data-a="chat" title="محادثة">💬<i></i></button><button data-a="mic" title="المايك">🎙️</button>`;
    hud.appendChild(btns); this.micBtn=btns.querySelector('[data-a=mic]'); this.badge=btns.querySelector('i');
    btns.querySelector('[data-a=chat]').onclick=()=>{ this.chat.classList.toggle('open'); this.unread=0; this.badge.style.display='none'; this.ensureAudio(); };
    this.micBtn.onclick=()=>this.toggleMic();
    const chat=this.chat=document.createElement('div'); chat.className='soc-chat';
    chat.innerHTML=`<div class="soc-tabs"></div><div class="soc-log"></div><form class="soc-in"><input maxlength="200" placeholder="اكتب للي قريبين منك…"><button>أرسل</button></form>`;
    hud.appendChild(chat);
    chat.querySelector('form').onsubmit=e=>{ e.preventDefault(); const i=chat.querySelector('input'); this.sendText(i.value); i.value=''; };
    // typing must not move the avatar
    chat.querySelector('input').addEventListener('keydown',e=>e.stopPropagation());
    chat.querySelector('input').addEventListener('keyup',e=>e.stopPropagation());
    this.cardEl=document.createElement('div'); this.cardEl.className='soc-card'; hud.appendChild(this.cardEl);
    this.askEl=document.createElement('div'); this.askEl.className='soc-ask'; hud.appendChild(this.askEl);
    this.privBar=document.createElement('div'); this.privBar.className='soc-priv'; hud.appendChild(this.privBar);
    this.privBar.onclick=()=>this.endPrivate(true);
    this.drawTabs();
    if(!this.me.adult) this.micBtn.style.opacity=.45;
  }
  drawTabs(){
    const tabs=this.chat.querySelector('.soc-tabs');
    const list=[['near','📍 القريبين']].concat([...this.threads.keys()].filter(k=>k!=='near'&&this.people.has(k)).map(k=>[k,'🔒 '+this.people.get(k).name]));
    tabs.innerHTML=list.map(([k,l])=>`<button data-k="${esc(k)}" class="${k===this.tab?'on':''}">${esc(l)}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{ this.tab=b.dataset.k; this.drawTabs(); this.drawLog(); });
    this.chat.querySelector('input').placeholder=this.tab==='near'?'اكتب للي قريبين منك…':`رسالة خاصة لـ ${this.people.get(this.tab)?.name||''}`;
    this.drawLog();
  }
  drawLog(){
    const L=this.threads.get(this.tab)||[], box=this.chat.querySelector('.soc-log');
    box.innerHTML=L.length?L.map(m=>m.sys?`<div class="sys">${esc(m.text)}</div>`:`<div class="m ${m.me?'me':''}"><b>${esc(m.who)}:</b> ${esc(m.text)}</div>`).join('')
      :`<div class="sys">${this.tab==='near'?'اللي تكتبه هنا يوصل للناس اللي حولك (20 متر)':'رسائل خاصة، توصل له بس'}</div>`;
    box.scrollTop=box.scrollHeight;
  }
  log(thread,who,text,me=false){
    if(!this.threads.has(thread)) this.threads.set(thread,[]);
    const L=this.threads.get(thread); L.push({who,text,me}); if(L.length>100) L.shift();
    if(thread!=='near'&&!this.chat.querySelector(`[data-k="${CSS.escape(thread)}"]`)) this.drawTabs();
    if(thread===this.tab) this.drawLog();
    if(!me&&!this.chat.classList.contains('open')){ this.unread++; this.badge.textContent=this.unread; this.badge.style.display='block'; }
  }
  sys(text){ this.log('near','',text,false); const L=this.threads.get('near'); L[L.length-1].sys=true; if(this.unread>0&&!this.chat.classList.contains('open')){ this.unread--; this.badge.textContent=this.unread; if(!this.unread) this.badge.style.display='none'; } if(this.tab==='near') this.drawLog(); }
  openThread(id){ if(!this.threads.has(id)) this.threads.set(id,[]); this.tab=id; this.chat.classList.add('open'); this.drawTabs(); }
  ask(text,yes,no){
    const el=this.askEl; el.innerHTML=`${esc(text)}<div><button style="background:#2bb36a;color:#04140a">قبول</button><button style="background:#3a4560;color:#fff">لا</button></div>`;
    el.classList.add('open'); const [a,b]=el.querySelectorAll('button');
    a.onclick=()=>{ el.classList.remove('open'); yes(); }; b.onclick=()=>{ el.classList.remove('open'); no(); };
    clearTimeout(el._t); el._t=setTimeout(()=>{ if(el.classList.contains('open')){ el.classList.remove('open'); no(); } },20000);
  }
  pickPerson(ray){
    const far=ray.far; ray.far=40;
    const hits=ray.intersectObjects([...this.people.values()].filter(p=>p.g.visible).map(p=>p.g),true).filter(h=>h.distance<40);
    ray.far=far;
    const id=hits.find(h=>h.object.userData.personId)?.object.userData.personId; if(!id) return false;
    this.openCard(this.people.get(id)); return true;
  }
  openCard(pp){
    this.card=pp; const talk=this.canTalk(pp), muted=this.muted.has(pp.id);
    this.cardEl.innerHTML=`<button class="x">×</button><h3>${esc(pp.name)}</h3><small>${Math.round(this.dist(pp))} م منك${pp.lock?' · في مكالمة خاصة':''}</small>
      <div class="acts">
        <button class="pri" data-a="msg" ${talk?'':'disabled'}>💬 رسالة خاصة</button>
        <button class="pri" data-a="call" ${talk?'':'disabled'}>🔒 كلام خاص بالصوت</button>
        <button data-a="follow">${this.follow===pp.id?'✋ وقّف المشي معه':'🚶 امشِ معه'}</button>
        <button data-a="mute">${muted?'🔊 رجّع صوته':'🔇 كتم صوته'}</button>
        <button data-a="block">🚫 حظر</button>
        <button data-a="report">⚠️ إبلاغ</button>
      </div>${talk?'':`<small style="display:block;margin-top:8px">${this.me.adult?'هذا الشخص أقل من 18، الكلام الخاص معه مقفل':'الكلام الخاص والصوت للي أعمارهم 18 وفوق'}</small>`}`;
    this.cardEl.classList.add('open');
    const on=(a,f)=>this.cardEl.querySelector(`[data-a=${a}]`).onclick=f;
    this.cardEl.querySelector('.x').onclick=()=>this.closeCard();
    on('msg',()=>{ this.connect(pp); this.openThread(pp.id); this.closeCard(); this.chat.querySelector('input').focus(); });
    on('call',()=>{ this.askPrivate(pp); this.closeCard(); });
    on('follow',()=>{ this.setFollow(this.follow===pp.id?null:pp.id); if(this.follow) this.city.say(`تمشي مع ${pp.name}. حرّك نفسك عشان توقف`); this.closeCard(); });
    on('mute',()=>{ muted?this.muted.delete(pp.id):this.muted.add(pp.id); this.openCard(pp); });
    on('block',()=>this.block(pp));
    on('report',()=>{ this.report(pp); this.closeCard(); });
  }
  closeCard(){ this.card=null; this.cardEl.classList.remove('open'); }

  /* ---------------- per frame ---------------- */
  update(dt){
    const c=this.city;
    this.sendPos(false);
    // follow a friend: walk toward them, stop next to them; any manual input cancels it
    if(this.follow){
      const pp=this.people.get(this.follow);
      if(!pp?.cur||c.manualInput) { if(c.manualInput) this.setFollow(null); else c.extMove=null; }
      else { const dx=pp.cur.x-c.pos.x, dz=pp.cur.z-c.pos.z, d=Math.hypot(dx,dz); c.extMove=d>1.8?{x:dx/d,z:dz/d}:null; }
    }
    // listener = me
    const ctx=this.ctx;
    if(ctx){ const L=ctx.listener, f=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0,c.yaw,0));
      if(L.positionX){ L.positionX.value=c.pos.x; L.positionY.value=1.6; L.positionZ.value=c.pos.z; L.forwardX.value=f.x; L.forwardY.value=0; L.forwardZ.value=f.z; L.upX.value=0; L.upY.value=1; L.upZ.value=0; }
      else { L.setPosition(c.pos.x,1.6,c.pos.z); L.setOrientation(f.x,0,f.z,0,1,0); } }
    let peers=0;
    for(const pp of this.people.values()){
      if(pp.cur&&pp.target){
        const k=Math.min(1,dt*8); pp.cur.x+=(pp.target.x-pp.cur.x)*k; pp.cur.z+=(pp.target.z-pp.cur.z)*k;
        let d=pp.target.ry-pp.cur.ry; d=Math.atan2(Math.sin(d),Math.cos(d)); pp.cur.ry+=d*k;
        pp.g.position.set(pp.cur.x,0,pp.cur.z); pp.g.rotation.y=pp.cur.ry;
        pp.walk+=((pp.target.w||0)-pp.walk)*Math.min(1,dt*6); pp.ph+=dt*7.5*pp.walk; animateAvatar(pp.g,pp.ph,pp.walk);
      }
      // voice: connect to the nearest adults, drop far ones (private partner stays connected)
      const d=this.dist(pp), keep=this.privateWith===pp.id||pp.dcq?.length||this.tab===pp.id;
      if(this.canTalk(pp)){
        if(!pp.pc&&d<VOICE_ON&&peers<MAX_PEERS&&!pp.lock) this.connect(pp);
        else if(pp.pc&&d>VOICE_OFF&&!keep) this.hangup(pp);
      }
      if(pp.pc) peers++;
      if(pp.audio){
        const a=pp.audio, inPriv=this.privateWith===pp.id;
        if(a.pan.positionX){ a.pan.positionX.value=pp.cur?.x||0; a.pan.positionY.value=1.6; a.pan.positionZ.value=pp.cur?.z||0; }
        else a.pan.setPosition(pp.cur?.x||0,1.6,pp.cur?.z||0);
        const g=this.muted.has(pp.id)||this.blocked.has(pp.id)||(this.privateWith&&!inPriv)?0:1;
        a.gain.gain.value+= (g-a.gain.gain.value)*Math.min(1,dt*10);
        a.an.getByteTimeDomainData(a.buf); let s=0; for(let i=0;i<a.buf.length;i+=4){ const v=a.buf[i]-128; s+=v*v; }
        const talk=Math.sqrt(s/(a.buf.length/4))>6&&g>0;
        if(talk!==pp.talk){ pp.talk=talk; this.retag(pp); }
      }
    }
    if(this.micAn){ const b=new Uint8Array(512); this.micAn.getByteTimeDomainData(b); let s=0; for(let i=0;i<512;i+=4){ const v=b[i]-128; s+=v*v; }
      this.micBtn.classList.toggle('live',Math.sqrt(s/128)>6); }
  }

  dispose(){
    try{ if(this.privateWith) this.endPrivate(true); }catch(e){}
    for(const pp of this.people.values()) this.hangup(pp);
    this.mic?.getTracks().forEach(t=>t.stop());
    this.ch?.unsubscribe(); this.ctx?.close().catch(()=>{});
    this.city.onPickPerson=null; removeEventListener('pointerdown',this._gest);
    this.chat.remove(); this.cardEl.remove(); this.askEl.remove(); this.privBar.remove();
  }
}
