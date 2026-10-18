// HighLife reference seed: David Eppstein, UCI, Lifelike Rules and Pattern Notation.
// RLE: x=5,y=5,rule=B36/S23; bb3o$bobbo$o3bo$obbo$3o!
export const REPLICATOR=[[2,0],[3,0],[4,0],[1,1],[4,1],[0,2],[4,2],[0,3],[3,3],[0,4],[1,4],[2,4]];
export const PREDECESSOR=[[1,0],[2,0],[3,0],[0,1],[0,2],[0,3]];
export const THREAT_MODES={auth:{name:'単核複製',gps:6,origin:[18,13]},share:{name:'鏡像複製',gps:6,origin:[65,13]},flood:{name:'双核複製',gps:9,origin:[15,43]},exfil:{name:'前駆体複製',gps:6,origin:[65,43]}};
export function highLifeStep(cells,w,h){const counts=new Map();for(const n of cells){const x=n%w,y=Math.floor(n/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h){const k=ny*w+nx;counts.set(k,(counts.get(k)||0)+1);}}}const next=new Set();for(const[n,count]of counts){if(cells.has(n)?count===2||count===3:count===3||count===6)next.add(n);}return next;}
export function seedReplicator(w,h,cx,cy,mirror=false,predecessor=false){const cells=new Set();for(const[x,y]of predecessor?PREDECESSOR:REPLICATOR){const nx=cx+(mirror?-x:x),ny=cy+y;if(nx>=0&&nx<w&&ny>=0&&ny<h)cells.add(ny*w+nx);}return cells;}
// Local home coordinates; rendering adds x + 48 on the shared 96×60 board.
export const HOME_ORIGINS={auth:[10,26],share:[14,26],flood:[8,26],exfil:[10,26]};
export class ThreatField{
 constructor(type,w=96,h=60,origin=null){this.type=type;this.w=w;this.h=h;this.generation=0;this.accumulator=0;const mode=THREAT_MODES[type];this.gps=mode.gps;const[x,y]=origin||mode.origin;this.cells=seedReplicator(w,h,x,y,type==='share',type==='exfil');if(type==='flood')for(const c of seedReplicator(w,h,x+17,y))this.cells.add(c);}
 advance(dt){this.accumulator+=dt*this.gps;const steps=Math.floor(this.accumulator+1e-9);this.accumulator-=steps;for(let i=0;i<steps;i++){this.cells=highLifeStep(this.cells,this.w,this.h);this.generation++;}}
 clear(){this.cells.clear();}
}
