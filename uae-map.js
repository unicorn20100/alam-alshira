// عالم الشراء — UAE map data (simplified, hand-traced). Coordinates are [longitude, latitude].
// Accurate enough to recognise every coast, emirate and city; not survey-grade.

// mainland, clockwise from the Saudi border on the western coast
export const MAINLAND = [
  // Gulf coast, west → east
  [51.58,24.27],[51.70,24.12],[51.82,24.02],[52.02,23.97],[52.20,24.02],[52.38,24.10],[52.55,24.17],[52.64,24.20],
  [52.72,24.12],[52.90,24.06],[53.10,24.04],[53.30,24.06],[53.45,24.08],[53.62,24.12],[53.80,24.13],[53.97,24.17],
  [54.12,24.24],[54.25,24.30],[54.36,24.34],[54.47,24.36],[54.56,24.40],               // mainland shore facing Abu Dhabi island
  [54.62,24.50],[54.66,24.62],[54.74,24.74],[54.86,24.85],[54.98,24.95],[55.05,25.01],[55.13,25.07],[55.21,25.14],
  [55.27,25.20],[55.33,25.27],[55.39,25.33],[55.45,25.39],[55.50,25.46],[55.55,25.53],[55.62,25.59],[55.72,25.65],
  [55.82,25.71],[55.92,25.78],[55.99,25.86],[56.05,25.96],[56.08,26.06],
  // Musandam (Oman) border down to Dibba
  [56.13,25.92],[56.19,25.78],[56.26,25.63],
  // east coast (Gulf of Oman), north → south
  [56.32,25.52],[56.36,25.38],[56.36,25.24],[56.35,25.12],[56.37,25.02],[56.38,24.97],
  // Oman border inland, around Hatta and Al Ain, down to the Saudi tripoint
  [56.22,24.93],[56.10,24.86],[56.02,24.78],[55.98,24.62],[55.92,24.48],[55.86,24.33],[55.82,24.24],[55.90,24.12],
  [55.93,24.02],[55.80,23.90],[55.62,23.62],[55.48,23.30],[55.32,22.98],[55.20,22.71],
  // Saudi border, east → west, then north-west back to the coast
  [54.80,22.72],[54.20,22.76],[53.60,22.80],[53.00,22.86],[52.58,22.94],[52.30,23.32],[52.00,23.70],[51.78,24.00],[51.62,24.20],
];

// islands (Abu Dhabi island sits across a channel — the "river" — from the mainland)
export const ISLANDS = [
  {name:'جزيرة أبوظبي', pts:[[54.29,24.43],[54.33,24.49],[54.39,24.53],[54.45,24.52],[54.50,24.48],[54.53,24.44],[54.47,24.415],[54.38,24.405],[54.32,24.41]]},
  {name:'السعديات', pts:[[54.40,24.555],[54.46,24.58],[54.52,24.565],[54.47,24.545]]},
  {name:'ياس',      pts:[[54.57,24.45],[54.60,24.52],[54.63,24.50],[54.61,24.45]]},
  {name:'صير بني ياس', pts:[[52.55,24.30],[52.58,24.36],[52.65,24.35],[52.66,24.29],[52.60,24.26]]},
  {name:'دلما',     pts:[[52.28,24.48],[52.30,24.52],[52.34,24.51],[52.33,24.47]]},
  {name:'داس',      pts:[[52.87,25.14],[52.88,25.16],[52.89,25.15]]},
  {name:'نخلة جميرا', pts:[[55.12,25.10],[55.11,25.13],[55.14,25.15],[55.16,25.13],[55.15,25.10]]},
];

// water cut into the land: Dubai Creek and the Khor of Umm Al Quwain
export const CREEKS = [
  {name:'خور دبي', w:.022, pts:[[55.29,25.27],[55.31,25.25],[55.33,25.23],[55.34,25.20],[55.35,25.18]]},
  {name:'خور أم القيوين', w:.02, pts:[[55.57,25.55],[55.60,25.53],[55.63,25.51]]},
];

export const EMIRATES = [
  {id:'ad',  name:'أبوظبي',     color:'#e8c38a', seeds:[[52.3,23.6],[53.3,23.5],[54.3,23.2],[54.4,23.9],[53.4,24.0],[55.2,23.4],[55.6,24.1],[54.85,24.35],[54.35,24.45]], w:1.35},
  {id:'dxb', name:'دبي',        color:'#e3b77e', seeds:[[55.2,25.08],[55.42,24.9],[55.55,24.75]], w:1},
  {id:'shj', name:'الشارقة',    color:'#e9c690', seeds:[[55.5,25.29],[55.78,25.22],[55.95,25.18]], w:1},
  {id:'ajm', name:'عجمان',      color:'#e1b47a', seeds:[[55.47,25.40]], w:.42},
  {id:'uaq', name:'أم القيوين', color:'#ecc994', seeds:[[55.62,25.50],[55.72,25.43]], w:.55},
  {id:'rak', name:'رأس الخيمة', color:'#ddb07a', seeds:[[55.96,25.72],[56.05,25.92],[55.9,25.55]], w:1},
  {id:'fuj', name:'الفجيرة',    color:'#e6bd85', seeds:[[56.28,25.35],[56.24,25.08],[56.22,25.6]], w:.85},
];

export const CITIES = [
  {name:'أبوظبي',     at:[54.38,24.47], size:1.3, towers:70, cap:true},
  {name:'دبي',        at:[55.27,25.20], size:1.5, towers:110, cap:true, tallest:[55.274,25.197]},
  {name:'الشارقة',    at:[55.40,25.34], size:1.0, towers:45, cap:true},
  {name:'عجمان',      at:[55.46,25.41], size:.6,  towers:20, cap:true},
  {name:'أم القيوين', at:[55.56,25.56], size:.5,  towers:10, cap:true},
  {name:'رأس الخيمة', at:[55.95,25.79], size:.7,  towers:20, cap:true},
  {name:'الفجيرة',    at:[56.33,25.12], size:.6,  towers:16, cap:true},
  {name:'العين',      at:[55.74,24.21], size:.8,  towers:18},
  {name:'ليوا',       at:[53.75,23.12], size:.35, towers:4},
  {name:'الرويس',     at:[52.70,24.11], size:.35, towers:6},
  {name:'حتا',        at:[56.12,24.80], size:.25, towers:3},
];

/* ---------- geometry helpers (map units: degrees, longitude scaled by cos 24°) ---------- */
const KX = Math.cos(24*Math.PI/180);
export function inPoly(x,y,P){
  let c=false;
  for(let i=0,j=P.length-1;i<P.length;j=i++){
    const [xi,yi]=P[i],[xj,yj]=P[j];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c;
  }
  return c;
}
function segDist(px,py,ax,ay,bx,by){
  ax=(ax-px)*KX; ay-=py; bx=(bx-px)*KX; by-=py;
  const dx=bx-ax, dy=by-ay, t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(ax+dx*t,ay+dy*t);
}
function polyDist(x,y,P,closed=true){
  let d=1e9; const n=P.length;
  for(let i=0;i<(closed?n:n-1);i++){ const a=P[i], b=P[(i+1)%n]; d=Math.min(d,segDist(x,y,a[0],a[1],b[0],b[1])); }
  return d;
}
// signed distance to the coast: + on land, − in water (map units)
export function coast(lon,lat){
  let land=inPoly(lon,lat,MAINLAND), d=polyDist(lon,lat,MAINLAND), island=null;
  for(const isl of ISLANDS){
    const dd=polyDist(lon,lat,isl.pts); if(dd<d) d=dd;
    if(inPoly(lon,lat,isl.pts)){ land=true; island=isl.name; }
  }
  for(const c of CREEKS){
    const dd=polyDist(lon,lat,c.pts,false)-c.w;
    if(dd<0&&land){ land=false; d=-dd; } else if(land) d=Math.min(d,dd);
  }
  return {d:land?d:-d, land, island};
}
export function emirateAt(lon,lat){
  let best=0, bd=1e9;
  EMIRATES.forEach((e,i)=>{ for(const [sx,sy] of e.seeds){ const d=Math.hypot((lon-sx)*KX,lat-sy)/e.w; if(d<bd){ bd=d; best=i; } } });
  return best;
}
