import assert from 'node:assert/strict';
import {REPLICATOR,highLifeStep,seedReplicator,ThreatField} from './dist/automata.mjs';
import {Shift,expectedVerdict,verdictReason} from './dist/engine.mjs';
const w=100,h=100,initial=seedReplicator(w,h,45,45);assert.equal(initial.size,12);let cells=initial;for(let i=0;i<12;i++)cells=highLifeStep(cells,w,h);assert.equal(cells.size,24);
function copies(s){let count=0;for(let y=0;y<h-5;y++)for(let x=0;x<w-5;x++)if(REPLICATOR.every(([dx,dy])=>s.has((y+dy)*w+x+dx)))count++;return count;}
assert.equal(copies(cells),2);for(let i=12;i<36;i++)cells=highLifeStep(cells,w,h);assert.equal(cells.size,48);assert.equal(copies(cells),4);
let mirror=seedReplicator(w,h,45,45,true);for(let i=0;i<12;i++)mirror=highLifeStep(mirror,w,h);assert.equal(mirror.size,24);
let precursor=seedReplicator(w,h,45,45,false,true);assert.equal(precursor.size,6);for(let i=0;i<3;i++)precursor=highLifeStep(precursor,w,h);assert.equal(precursor.size,12);assert.equal(copies(precursor),1);
const birthSix=new Set([12,13,14,22,24,32]);assert(highLifeStep(birthSix,10,10).has(23));birthSix.add(23);assert(!highLifeStep(birthSix,10,10).has(23));assert.equal(highLifeStep(new Set(),96,60).size,0);
for(const type of ['auth','share','flood','exfil']){const f=new ThreatField(type);f.advance(2);assert.equal(f.generation,type==='flood'?18:12);assert([...f.cells].every(k=>k>=0&&k<96*60));}
const s=new Shift();s.start();s.decide(1,true);assert.equal(s.threatFields.get(1).cells.size,12);s.advance(2);assert.equal(s.threatFields.get(1).generation,12);assert.equal(s.threatFields.get(1).cells.size,24);s.quarantine('auth');const frozen=[...s.threatFields.get(1).cells].sort();s.advance(7);assert.deepEqual([...s.threatFields.get(1).cells].sort(),frozen);s.running=false;s.advance(10);assert.deepEqual([...s.threatFields.get(1).cells].sort(),frozen);s.running=true;s.repair('auth');s.advance(10.2);assert.equal(s.threatFields.get(1).cells.size,0);
const all=new Shift();all.start();all.advance(106);for(const r of all.requests){assert.equal(expectedVerdict(r),r.valid);assert(verdictReason(r).length>5);}assert.equal(all.requests.length,16);
console.log('PASS: 12世代で核2個 / 36世代で核4個 / 鏡像 / 6セル前駆体 / B36-S23同時更新 / 有限境界 / 実ゲームの複製 / 隔離・停止・修復 / 16伝票の正解整合');
