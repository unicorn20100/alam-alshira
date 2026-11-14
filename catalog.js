// عالم الشراء — product presets + space calculator.
// The same layout function is used by the calculator AND by the 3D store,
// so the building the tenant gets is exactly the one the numbers describe.

export const STYLES = [
  {id:'crystal', name:'قبة كريستال'}, {id:'twist', name:'برج ملتوي'}, {id:'mushroom', name:'فطر'},
  {id:'cubes', name:'مكعبات طائرة'}, {id:'pyramid', name:'هرم'}, {id:'spiral', name:'حلزون'},
];
export const COLORS = ['#e2574c','#f2a93b','#3ccf91','#4da3ff','#8e6cf0','#e05ea0','#1f8a4c','#efe9df'];

// sizes are in centimetres: [width, height, depth]
export const PRESETS = [
  {id:'can',     name:'قوطي أكل',          size:[7.5,11,7.5], shape:'cyl', color:'#c0392b', price:1.5},
  {id:'soda',    name:'علبة مشروب',        size:[6.6,12,6.6], shape:'cyl', color:'#d6362f', price:.75},
  {id:'water',   name:'قارورة ماء 1.5 لتر', size:[9,33,9],    shape:'cyl', color:'#7cc7f2', price:.5},
  {id:'biscuit', name:'علبة بسكويت',       size:[15,5,6],     shape:'box', color:'#e8a33d', price:1.25},
  {id:'cereal',  name:'علبة حبوب',         size:[20,30,7],    shape:'box', color:'#f39c1e', price:4.5},
  {id:'perfume', name:'علبة عطر',          size:[8,12,5],     shape:'box', color:'#3b2f63', price:85},
  {id:'phone',   name:'علبة جوال',         size:[9,17,5],     shape:'box', color:'#222a35', price:699},
  {id:'shirt',   name:'قميص مطوي',         size:[25,5,30],    shape:'box', color:'#2a5bb8', price:25},
  {id:'shoe',    name:'علبة حذاء',         size:[33,12,20],   shape:'box', color:'#8a4b2a', price:60},
  {id:'book',    name:'كتاب',              size:[15,23,3],    shape:'box', color:'#0f6e6e', price:12},
  {id:'toy',     name:'علبة لعبة',         size:[30,25,15],   shape:'box', color:'#e05ea0', price:35},
  {id:'rice',    name:'كيس أرز 5 كغ',      size:[30,42,12],   shape:'box', color:'#e9dfc7', price:11},
  {id:'tv',      name:'تلفزيون 55 بوصة',   size:[123,71,6],   shape:'box', color:'#15181d', price:1899},
  {id:'fridge',  name:'ثلاجة',             size:[90,180,70],  shape:'box', color:'#d9dde2', price:2499},
  {id:'sofa',    name:'كنبة',              size:[200,85,90],  shape:'box', color:'#7a5c48', price:1450},
  {id:'custom',  name:'منتج مخصص',         size:[20,20,20],   shape:'box', color:'#1f8a4c', price:10},
];
export const presetById = id => PRESETS.find(p=>p.id===id) || PRESETS[PRESETS.length-1];
export function makeLine(id, qty, over={}){
  const p=presetById(id);
  return {preset:p.id, name:p.name, size:[...p.size], shape:p.shape, color:p.color, price:p.price, qty, ...over};
}

// one gondola unit: 1.2 m long, 0.5 m deep per side, 5 shelf levels, 37 cm clear height per level
export const GONDOLA = {unit:1.2, depth:.5, levels:[.12,.52,.92,1.32,1.72], clear:.37};
export const toM = s => s.map(v=>v/100);
export const isBig = s => s[1]>GONDOLA.clear || s[0]>.8 || s[2]>GONDOLA.depth;
export function slotFit(s){
  const [w,h,d]=s;
  return { f:Math.max(1,Math.floor(GONDOLA.unit/(w+.01))), r:Math.max(1,Math.floor(GONDOLA.depth/(d+.01))),
           st:Math.max(1,Math.floor(GONDOLA.clear/(h+.005))) };
}
export const perSlot = s => { const k=slotFit(s); return k.f*k.r*k.st; };          // one side, one level
export const perSide = s => perSlot(s)*GONDOLA.levels.length;                        // one side of a unit

const MAX_BIG = 1500;   // big items actually laid out (beyond this they're "in the warehouse")

// Lay out a round store of radius R: big items in rings along the wall, gondola rows inside.
export function planLayout(R, lines){
  const big=[], small=[];
  for(const l of lines){ if(!(l.qty>0)) continue; const s=toM(l.size); (isBig(s)?big:small).push({...l,s}); }
  const doorHalf=Math.min(1, 2.2/R);
  const slots=[]; let bigTotal=0, ok=true;
  const items=[]; for(const b of big){ bigTotal+=b.qty; for(let i=0;i<b.qty&&items.length<MAX_BIG;i++) items.push(b); }
  let ringR=R-.8, depth=0, ang=doorHalf+.2;
  for(const it of items){
    const [w,,d]=it.s;
    for(;;){
      const rr=ringR-d/2-.2, da=(w+.8)/rr;
      if(rr>2 && ang+da<=2*Math.PI-doorHalf-.2){ slots.push({line:it, a:ang+da/2, r:rr}); ang+=da; depth=Math.max(depth,d+.2); break; }
      ringR-=depth+2.4; depth=0; ang=doorHalf+.2;
      if(ringR<3){ ok=false; break; }
    }
    if(!ok) break;
  }
  const Rin = slots.length ? ringR-depth-1.8 : R-.6;
  const rows=[]; let sides=0;
  for(let k=0;;k++){
    const ax=2.2+k*3;                              // 3.2 m centre aisle, then 1.8 m aisles
    if(ax+.6>Rin-.8) break;
    for(const x of [-ax,ax]){
      const half=Math.sqrt(Math.max(0,(Rin-.6)**2-(ax+.6)**2));
      const z0=-half, z1=Math.min(half,Rin-4.5);
      const units=Math.floor((z1-z0)/GONDOLA.unit);
      if(units<1) continue;
      rows.push({x,z0,units}); sides+=units*2;
    }
  }
  return {R, doorHalf, slots, rows, sides, small, bigOK:ok&&slots.length>=Math.min(bigTotal,MAX_BIG), bigTotal};
}

// Find the smallest store that holds everything.
export function calcSpace(lines){
  let needSides=0, totalQty=0, bigQty=0;
  for(const l of lines){ if(!(l.qty>0)) continue; totalQty+=l.qty; const s=toM(l.size);
    if(isBig(s)) bigQty+=l.qty; else needSides+=Math.ceil(l.qty/perSide(s)); }
  let plan;
  for(let R=5;R<=90;R+=.5){ plan=planLayout(R,lines); if(plan.bigOK&&plan.sides>=needSides) break; }
  const R=plan.R, footprint=Math.PI*R*R;
  const plotNeeded=Math.ceil((2*R+16)**2/50)*50;      // 8 m of land around the building
  return {R, plan, needSides, units:Math.ceil(needSides/2), shelfLen:needSides*GONDOLA.unit, totalQty, bigQty,
    footprint, plotNeeded, fits:plan.bigOK&&plan.sides>=needSides};
}

// Demo catalogues for shops that are already rented on the planet.
const DEMO = {
  'عطور':[['perfume',2500]], 'أزياء':[['shirt',1500],['shoe',400]], 'عباءات':[['shirt',900]],
  'إلكترونيات':[['phone',800],['tv',18]], 'مقهى':[['biscuit',600],['soda',400]], 'مطاعم':[['soda',800],['biscuit',300]],
  'حلويات':[['biscuit',1500]], 'أغذية':[['can',3000],['water',800],['cereal',600],['rice',60]],
  'سوبرماركت':[['can',6000],['soda',2000],['water',1500],['cereal',1200],['biscuit',1500],['rice',120],['fridge',6]],
  'ألعاب':[['toy',900]], 'كتب':[['book',3000]], 'مجوهرات':[['perfume',700,{name:'علبة مجوهرات',color:'#b8942e'}]],
  'ساعات':[['perfume',600,{name:'علبة ساعة',color:'#1d2a3a'}]], 'نظارات':[['perfume',800,{name:'علبة نظارة',color:'#7a2e58'}]],
  'أثاث':[['sofa',14],['custom',20,{name:'طاولة',size:[120,75,80],color:'#a0764f'}]],
  'رياضة':[['shoe',700],['shirt',600]], 'زهور':[['custom',90,{name:'مزهرية',size:[20,40,20],color:'#e05ea0'}]],
  'مول تجاري':[['can',3000],['shirt',1500],['phone',400],['perfume',800],['tv',16],['sofa',6],['fridge',6]],
};
export function demoLines(category){
  return (DEMO[category]||[['custom',500]]).map(([id,q,o])=>makeLine(id,q,o));
}
