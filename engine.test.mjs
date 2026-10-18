import assert from 'node:assert/strict';
import {Shift,ORDER,lifeStep} from './dist/engine.mjs';
const perfect=new Shift();perfect.start();for(let i=0;i<1200;i++){for(const r of perfect.pending())perfect.decide(r.id,r.valid);perfect.advance(.1);}perfect.advance(.1);assert.equal(perfect.data,100);assert.equal(perfect.trust,100);assert.equal(perfect.mistakes,0);assert.equal(perfect.requests.length,16);assert.equal(perfect.done,true);
const wrong=new Shift();wrong.start();wrong.decide(1,true);assert.equal(wrong.zones.auth.attacks,1);const damaged=wrong.data;wrong.advance(4);assert(wrong.data<damaged);assert(wrong.repair('auth'));assert(!wrong.repair('share'));wrong.advance(10.1);assert(wrong.zones.auth.fixed);assert.equal(wrong.zones.auth.attacks,0);const protectedData=wrong.data;wrong.advance(1);assert.equal(wrong.data,protectedData);
const denyGood=new Shift();denyGood.start();denyGood.decide(1,false);denyGood.advance(3.6);denyGood.decide(2,false);assert.equal(denyGood.trust,92);assert.equal(denyGood.data,100);
const timeout=new Shift();timeout.start();timeout.advance(13.9);assert.equal(timeout.requests[0].status,'pending');timeout.advance(.2);assert.equal(timeout.requests[0].status,'timeout');assert(timeout.data<100);
const fix=new Shift();fix.start();fix.repair('auth');fix.decide(1,false);fix.advance(10.1);fix.advance(47);const auto=fix.requests.find(r=>r.id===9);assert.equal(auto.status,'auto');assert.equal(fix.zones.auth.defended,1);assert.equal(fix.zones.auth.attacks,0);
const paused=new Shift();paused.start();paused.running=false;paused.advance(30);assert.equal(paused.time,0);assert(!paused.decide(1,false));assert(!paused.repair('share'));
const cells=new Set([2*7+3,3*7+3,4*7+3]);const next=lifeStep(cells,7,7);assert.deepEqual([...next].sort(),[3*7+2,3*7+3,3*7+4].sort());assert.deepEqual([...lifeStep(next,7,7)].sort(),[...cells].sort());
console.log('PASS: 正しい審査の完走 / 不正通過と継続被害 / 誤遮断 / タイムアウト / 修正と自動拒否 / 同時修正制限 / 一時停止 / B3-S23往復');
const quarantine=new Shift();quarantine.start();quarantine.decide(1,true);assert(quarantine.quarantine('auth'));const beforeQuarantine=quarantine.data;quarantine.advance(7.5);assert.equal(quarantine.data,beforeQuarantine);assert.equal(quarantine.trust,96);quarantine.advance(1);assert(quarantine.quarantine('share'));assert(!quarantine.quarantine('exfil'));const qDeadline=quarantine.requests.find(r=>r.type==='share'&&r.status==='pending').deadline;quarantine.advance(3);assert(quarantine.requests.find(r=>r.type==='share'&&r.status==='pending').deadline>qDeadline+2.9);console.log('PASS: 隔離中は侵食停止 / 審査期限延長 / 信頼コスト / 隔離は2回まで');

// Findings, answer keys, and explanations share the 11-weakness inspection policy.
const {test}=await import('node:test');
const {expectedVerdict,verdictReason}=await import('./dist/engine.mjs');
const {THREATS,inspectionVerdict,inspectionReason,makeInspection}=await import('./dist/threats.mjs');
const {TYPES,evaluatePolicy,INCIDENTS}=await import('./dist/catalog.mjs');

test('repair completion rejects already-pending malicious traffic before manual or timed admission',()=>{
 for(const timed of [false,true]){
  const shift=new Shift({director:{select:s=>({id:s.serial===0?1:null})}});shift.start();shift.repair('auth');shift.advance(10.1);
  assert.equal(shift.requests[0].status,'auto');assert.equal(shift.zones.auth.defended,1);
  if(timed)shift.advance(18);else assert.equal(shift.decide(1,true),false);
  assert.equal(shift.data,100);assert.equal(shift.zones.auth.attacks,0);assert.equal(shift.threatFields.size,0);
 }
 const normal=new Shift({director:{select:()=>({id:2})}});normal.start();normal.repair('share');normal.advance(10.1);
 assert.equal(normal.requests[0].status,'pending');assert.equal(normal.decide(1,true),true);assert.equal(normal.mistakes,0);
 const damaged=new Shift();damaged.start();damaged.decide(1,true);damaged.repair('auth');damaged.advance(10.1);
 assert(damaged.data<100);assert.equal(damaged.threatFields.get(1).cells.size,0);
 const guarded=new Shift();guarded.start();guarded.zones.auth.fixed=true;guarded.decide(1,true);
 assert.equal(guarded.requests[0].status,'auto');assert.equal(guarded.data,100);
});

test('context-only violations name and damage the violated rule, not a safe technical control',()=>{
 const shift=new Shift();shift.start();const request=shift.requests[0];
 const profile=THREATS.find(row=>row.id===request.inspection.patternId);
 request.inspection={...request.inspection,a:profile.safeA,b:profile.safeB,credentialSubject:'JOB-99'};
 shift.decide(request.id,true);assert.match(shift.lastLog,/認証主体の不一致/);assert(!shift.lastLog.includes(profile.name));
 assert.equal(shift.data,100);assert.equal(shift.alteredRecords,6);assert.equal(shift.exposedRecords,0);
});

test('untimed practice advances one document only after judgment and explicit next action',()=>{
 const shift=new Shift({practice:true});shift.start();shift.advance(120);
 assert.equal(shift.time,0);assert.equal(shift.requests.length,1);assert.equal(shift.requests[0].status,'pending');
 assert.equal(shift.nextPractice(),false);assert.equal(shift.repair('auth'),false);assert.equal(shift.quarantine('auth'),false);
 for(let id=1;id<=16;id++){
  const request=shift.pending()[0];assert.equal(request.id,id);shift.decide(id,expectedVerdict(request));
  assert.equal(shift.nextPractice(),true);shift.advance(120);
 }
 assert.equal(shift.done,true);assert.equal(shift.running,false);assert.equal(shift.mistakes,0);
 assert.equal(shift.requests.length,16);assert.equal(shift.time,0);
});

test('a normal timeout supports work but is never counted as a manual correct review',()=>{
 const shift=new Shift({director:{select:()=>({id:2})}});shift.start();shift.advance(17.6);
 const normal=shift.requests.find(r=>r.id===1);assert.equal(normal.status,'timeout');
 assert.equal(normal.correct,null);assert.equal(shift.zones.share.correct,0);
 assert.equal(shift.postponedAppointments,0);
});

test('first finding is SMBv1; all 16 arrivals preserve their CSV verdict and route',()=>{
 const shift=new Shift();shift.start();
 assert.equal(shift.requests[0].inspection.patternId,'smb_v1');
 shift.advance(106);
 assert.equal(shift.requests.length,16);
 for(const request of shift.requests){
  assert.equal(THREATS.find(t=>t.id===request.inspection.patternId).route,request.type);
  assert.equal(expectedVerdict(request),evaluatePolicy(request,TYPES));
  assert.equal(request.valid,inspectionVerdict(request.inspection));
  assert.equal(verdictReason(request),inspectionReason(request.inspection));
 }
});

test('all 11 safe and unsafe findings are scored by inspection, independently of old fields and stored valid',()=>{
 assert.equal(THREATS.length,11);
 for(const threat of THREATS){
  const context=makeInspection(INCIDENTS.find(r=>r.type===threat.route&&evaluatePolicy(r,TYPES)));
  const safe={type:threat.route,a:'legacy',b:'different',valid:false,inspection:{...context,patternId:threat.id,a:threat.safeA,b:threat.safeB}};
  const unsafe={type:threat.route,a:'legacy',b:'legacy',valid:true,inspection:{...context,patternId:threat.id,a:threat.attackA,b:threat.attackB}};
  assert.equal(expectedVerdict(safe),true,threat.id+' safe');
  assert.equal(expectedVerdict(unsafe),false,threat.id+' attack');
  assert.equal(verdictReason(safe),inspectionReason(safe.inspection));
  assert.equal(verdictReason(unsafe),inspectionReason(unsafe.inspection));
 }
 // Older callers without inspection still use the original CSV policy and wording.
 assert.equal(expectedVerdict({type:'auth',a:'AOI',b:'AOI'}),true);
 assert.equal(expectedVerdict({type:'auth',a:'AOI',b:'UNKNOWN'}),false);
 assert.match(verdictReason({type:'auth',a:'AOI',b:'UNKNOWN'}),/一致していません/);
});

test('defenses and decisions use the inspection answer while logs name the concrete weakness',()=>{
 const protectedShift=new Shift();protectedShift.zones.auth.fixed=true;protectedShift.start();
 assert.equal(protectedShift.requests[0].status,'auto');
 assert.equal(protectedShift.zones.auth.defended,1);
 const safeShift=new Shift({director:{select:()=>({id:2,source:'local',reason:'safe'})}});
 safeShift.zones.share.fixed=true;safeShift.start();
 assert.equal(safeShift.requests[0].status,'pending');
 assert.equal(safeShift.requests[0].valid,true);
 const bad=new Shift();bad.start();bad.decide(1,true);
 assert(bad.lastLog.includes(THREATS.find(t=>t.id==='smb_v1').name));
 assert.equal(bad.zones.auth.attacks,1);
 const corrected=new Shift();corrected.start();
 const threat=THREATS.find(t=>t.id==='smb_v1');
 corrected.requests[0].inspection={...corrected.requests[0].inspection,patternId:threat.id,a:threat.safeA,b:threat.safeB};
 assert.equal(corrected.decide(1,true),true);
 assert.equal(corrected.requests[0].correct,true);
 assert.equal(corrected.mistakes,0);
 assert.equal(corrected.threatFields.size,0);
});

test('the real game clock ends at 60 seconds with 14-second reviews and unchanged defenses',()=>{
 const shift=new Shift();shift.start();
 assert.equal(shift.nextArrival,3.5);
 assert.equal(shift.requests[0].deadline,14);
 assert(shift.quarantine('auth'));assert.equal(shift.zones.auth.quarantineUntil,8);
 assert(shift.repair('share'));assert.equal(shift.zones.share.repairEnd,10);
 shift.advance(59.99);
 assert.equal(shift.done,false);assert.equal(shift.running,true);assert.equal(shift.time,59.99);
 shift.advance(.02);
 assert.equal(shift.time,60);assert.equal(shift.done,true);assert.equal(shift.running,false);
 assert.equal(shift.serial,16);
 assert(shift.requests.at(-1).at<=52.61);
 shift.advance(60);assert.equal(shift.time,60);
});
