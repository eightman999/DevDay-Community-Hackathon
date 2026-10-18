import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift} from './dist/engine.mjs';
import {companionSnapshot,supportActions} from './dist/companion-context.mjs';
import {CompanionSupport} from './dist/companion-support.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('automatic notes never allow/deny and stop while paused or after duty',()=>{
 const s=new Shift();s.start();let notes=0;const events=[];
 const support=new CompanionSupport({onAction:a=>events.push(a)});
 support.tick(s,{selectedId:1,onNote:()=>{notes++;return true;}});
 assert.equal(notes,1);assert.equal(s.requests[0].status,'pending');
 s.running=false;s.time=10;support.tick(s,{selectedId:1,onNote:()=>{notes++;return true;}});assert.equal(notes,1);
 s.running=true;support.tick(s,{selectedId:1,onNote:()=>{notes++;return true;}});assert.equal(notes,2);
 s.advance(120);support.tick(s,{onNote:()=>assert.fail()});assert.equal(events.length,2);
});
test('automatic containment uses engine limits and preserves cumulative damage',()=>{
 const s=new Shift();s.start();s.decide(1,true);const logs=[],support=new CompanionSupport({onAction:a=>logs.push(a)});
 support.tick(s);assert.equal(s.quarantineUses,1);assert.equal(s.postponedAppointments,4);
 s.advance(2.1);support.tick(s);assert(s.zones.auth.repairEnd>0);assert.equal(s.repaired,0);
 s.advance(10.1);support.tick(s);assert(s.zones.auth.fixed);assert(s.unavailableRecords>=6);
 const damage=s.unavailableRecords;s.advance(4);assert.equal(s.unavailableRecords,damage);
 assert(logs.some(l=>l.kind==='quarantine'));assert(logs.some(l=>l.kind==='repair'));assert(s.quarantineUses<=2);
});
test('a validated Agents action is rechecked against current defenses before execution',async()=>{
 const s=new Shift();s.start();s.decide(1,true);const logs=[];
 const support=new CompanionSupport({provider:{support:async()=>({source:'agents',action:{kind:'repair',type:'auth'}})},onAction:a=>logs.push(a)});
 support.tick(s);await settle();support.tick(s);assert(s.zones.auth.repairEnd>0);assert.equal(logs[0].source,'agents');
 s.advance(2.1);support.tick(s);await settle();s.zones.auth.fixed=true;s.zones.auth.attacks=0;
 support.tick(s);assert.equal(logs.length,1);support.dispose();
});
test('slow or late model actions cannot stall containment, cross reset, or execute while paused',async()=>{
 let resolve;
 const s=new Shift();s.start();s.decide(1,true);
 const support=new CompanionSupport({provider:{support:()=>new Promise(r=>{resolve=r;})}});
 support.tick(s);await settle();s.advance(8.1);support.tick(s);assert.equal(s.quarantineUses,1);
 resolve({source:'agents',action:{kind:'repair',type:'auth'}});await settle();assert.equal(s.zones.auth.repairEnd,0);
 const fresh=new Shift();fresh.start();support.tick(fresh);assert.equal(fresh.repaired,0);support.dispose();
});
test('candidate actions include only existing intrusions and respect shared work and isolation quota',()=>{
 const s=new Shift();s.start();assert.deepEqual(supportActions(companionSnapshot(s)),[{kind:'wait',type:null}]);
 s.decide(1,true);s.quarantineUses=2;s.repair('auth');
 assert.deepEqual(supportActions(companionSnapshot(s)),[{kind:'wait',type:null}]);
});
test('a selected request timing out during advance cannot break the support tick',()=>{
 const s=new Shift();s.start();s.advance(28.1);
 assert.equal(s.requests[0].status,'timeout');
 assert.doesNotThrow(()=>new CompanionSupport().tick(s,{selectedId:1}));
 assert.equal(companionSnapshot(s,1).selectedId,null);
});
test('six automatic notes fit within the fourteen-second review deadline',()=>{
 const s=new Shift();s.start();let count=0;
 const support=new CompanionSupport();
 for(let i=0;i<=10;i++){support.tick(s,{selectedId:1,onNote:()=>{if(count>=6)return false;count++;return true;}});s.advance(1);}
 assert.equal(count,6);assert.equal(s.requests[0].status,'pending');
});
