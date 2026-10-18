import assert from 'node:assert/strict';
import {Shift,ORDER,lifeStep} from './dist/engine.mjs';
const perfect=new Shift();perfect.start();for(let i=0;i<1200;i++){for(const r of perfect.pending())perfect.decide(r.id,r.valid);perfect.advance(.1);}perfect.advance(.1);assert.equal(perfect.data,100);assert.equal(perfect.trust,100);assert.equal(perfect.mistakes,0);assert.equal(perfect.requests.length,16);assert.equal(perfect.done,true);
const wrong=new Shift();wrong.start();wrong.decide(1,true);assert.equal(wrong.zones.auth.attacks,1);const damaged=wrong.data;wrong.advance(4);assert(wrong.data<damaged);assert(wrong.repair('auth'));assert(!wrong.repair('share'));wrong.advance(10.1);assert(wrong.zones.auth.fixed);assert.equal(wrong.zones.auth.attacks,0);const protectedData=wrong.data;wrong.advance(1);assert.equal(wrong.data,protectedData);
const denyGood=new Shift();denyGood.start();denyGood.decide(1,false);denyGood.advance(7.1);denyGood.decide(2,false);assert.equal(denyGood.trust,92);assert.equal(denyGood.data,100);
const timeout=new Shift();timeout.start();timeout.advance(14.1);assert.equal(timeout.requests[0].status,'timeout');assert(timeout.data<100);
const fix=new Shift();fix.start();fix.repair('auth');fix.decide(1,false);fix.advance(10.1);fix.advance(47);const auto=fix.requests.find(r=>r.id===9);assert.equal(auto.status,'auto');assert.equal(fix.zones.auth.defended,1);assert.equal(fix.zones.auth.attacks,0);
const paused=new Shift();paused.start();paused.running=false;paused.advance(30);assert.equal(paused.time,0);assert(!paused.decide(1,false));assert(!paused.repair('share'));
const cells=new Set([2*7+3,3*7+3,4*7+3]);const next=lifeStep(cells,7,7);assert.deepEqual([...next].sort(),[3*7+2,3*7+3,3*7+4].sort());assert.deepEqual([...lifeStep(next,7,7)].sort(),[...cells].sort());
console.log('PASS: 正しい審査の完走 / 不正通過と継続被害 / 誤遮断 / タイムアウト / 修正と自動拒否 / 同時修正制限 / 一時停止 / B3-S23往復');
const quarantine=new Shift();quarantine.start();quarantine.decide(1,true);assert(quarantine.quarantine('auth'));const beforeQuarantine=quarantine.data;quarantine.advance(7.5);assert.equal(quarantine.data,beforeQuarantine);assert.equal(quarantine.trust,96);quarantine.advance(1);assert(quarantine.quarantine('share'));assert(!quarantine.quarantine('exfil'));const qDeadline=quarantine.requests.find(r=>r.type==='share'&&r.status==='pending').deadline;quarantine.advance(3);assert(quarantine.requests.find(r=>r.type==='share'&&r.status==='pending').deadline>qDeadline+2.9);console.log('PASS: 隔離中は侵食停止 / 審査期限延長 / 信頼コスト / 隔離は2回まで');

// Findings, answer keys, and explanations share the 11-weakness inspection policy.
const {test}=await import('node:test');
const {expectedVerdict,verdictReason}=await import('./dist/engine.mjs');
const {THREATS,inspectionVerdict,inspectionReason}=await import('./dist/threats.mjs');
const {TYPES,evaluatePolicy}=await import('./dist/catalog.mjs');

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
  const safe={type:threat.route,a:'legacy',b:'different',valid:false,inspection:{patternId:threat.id,a:threat.safeA,b:threat.safeB}};
  const unsafe={type:threat.route,a:'legacy',b:'legacy',valid:true,inspection:{patternId:threat.id,a:threat.attackA,b:threat.attackB}};
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
 corrected.requests[0].inspection={patternId:threat.id,a:threat.safeA,b:threat.safeB};
 assert.equal(corrected.decide(1,true),true);
 assert.equal(corrected.requests[0].correct,true);
 assert.equal(corrected.mistakes,0);
 assert.equal(corrected.threatFields.size,0);
});
