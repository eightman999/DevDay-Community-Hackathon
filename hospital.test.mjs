import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift, expectedVerdict, FORMS} from './dist/engine.mjs';
import {EnemyDirector} from './dist/enemy.mjs';
import {THREATS} from './dist/threats.mjs';
import {INCIDENTS,evaluatePolicy,TYPES} from './dist/catalog.mjs';

// These counts model 100 synthetic records and 100 appointments, not historical totals.
test('correct hospital triage preserves zero cumulative harm through the adaptive 120-second shift', () => {
  const director = new EnemyDirector();
  const shift = new Shift({director});
  assert.equal(shift.unavailableRecords,0);
  assert.equal(shift.postponedAppointments,0);
  assert.equal(shift.exposedRecords,0);
  assert.equal(shift.alteredRecords,0);
  shift.start();
  for(let step=0;step<1201;step++) {
    for(const r of shift.pending())shift.decide(r.id,expectedVerdict(r));
    director.tick(shift);shift.advance(.1);
  }
  assert.equal(shift.done,true);
  assert.equal(shift.time,120);
  assert.equal(shift.requests.length,FORMS.length);
  assert.equal(shift.data,100);
  assert.equal(shift.trust,100);
  assert.equal(shift.unavailableRecords,0);
  assert.equal(shift.postponedAppointments,0);
  assert.equal(shift.exposedRecords,0);
  assert.equal(shift.alteredRecords,0);
  director.dispose();
});

test('rejecting necessary normal traffic postpones synthetic appointments without making records unreadable', () => {
  const shift=new Shift();shift.start();shift.decide(1,false);shift.advance(7.1);
  assert.equal(expectedVerdict(shift.requests[1]),true);
  shift.decide(2,false);
  assert.equal(shift.postponedAppointments,8);
  assert.equal(shift.unavailableRecords,0);
  assert.match(shift.lastLog,/検査結果が届かず/);
  assert.equal(shift.trust,92);
});

test('quarantining a route pauses hospital work and cumulatively postpones appointments', () => {
  const shift=new Shift();shift.start();shift.decide(1,false);
  assert.equal(shift.quarantine('auth'),true);
  assert.equal(shift.postponedAppointments,4);
  assert.equal(shift.unavailableRecords,0);
  assert.match(shift.lastLog,/業務の一部停止/);
  shift.advance(8.1);
  assert.equal(shift.postponedAppointments,4);
  assert.equal(shift.quarantine('share'),true);
  assert.equal(shift.postponedAppointments,8);
});

test('a malicious passage and continuing infection increase unreadable synthetic records', () => {
  const shift=new Shift();shift.start();shift.decide(1,true);
  assert.equal(shift.unavailableRecords,6);
  const initial=shift.unavailableRecords;
  shift.advance(8.1);
  assert(shift.unavailableRecords>initial);
  assert.equal(shift.unavailableRecords,100-shift.data);
  assert.equal(shift.postponedAppointments,100-shift.trust);
});

test('root repair prevents further route damage while cumulative hospital losses remain', () => {
  const shift=new Shift();shift.start();shift.decide(1,true);shift.advance(7.1);shift.decide(2,false);
  assert.equal(shift.repair('auth'),true);
  shift.advance(10.1);
  assert.equal(shift.zones.auth.fixed,true);
  const records=shift.unavailableRecords,appointments=shift.postponedAppointments;
  assert(records>=6);assert(appointments>=8);
  for(const r of shift.pending())shift.decide(r.id,expectedVerdict(r));
  shift.advance(3);
  assert.equal(shift.unavailableRecords,records);
  assert.equal(shift.postponedAppointments,appointments);
  assert.equal(shift.data,100-records);
  assert.equal(shift.trust,100-appointments);
});

test('hospital indicators inherit bounded legacy scores and resetting starts a fresh simulation', () => {
  const shift=new Shift();shift.start();shift.advance(120);
  assert(shift.unavailableRecords>=0&&shift.unavailableRecords<=100);
  assert(shift.postponedAppointments>=0&&shift.postponedAppointments<=100);
  const fresh=new Shift();
  assert.equal(fresh.unavailableRecords,0);
  assert.equal(fresh.postponedAppointments,0);
});


function attackShift(pattern) {
  const template=INCIDENTS.find(r=>r.type===pattern.route&&!evaluatePolicy(r,TYPES));
  assert(template,'unsafe route template: '+pattern.route);
  const shift=new Shift({director:{select:()=>({id:template.id,source:'local',reason:'test'})}});
  shift.start();
  shift.requests[0].inspection={patternId:pattern.id,a:pattern.attackA,b:pattern.attackB};
  return shift;
}

test('confidentiality and integrity damage use separate counts without increasing unavailable records',()=>{
  for(const kind of ['confidentiality','integrity']) {
    const pattern=THREATS.find(t=>t.impactKind===kind);
    assert(pattern,'missing impact kind '+kind);
    const shift=attackShift(pattern),key=kind==='confidentiality'?'exposedRecords':'alteredRecords';
    shift.decide(1,true);
    assert.equal(shift.unavailableRecords,0);
    assert.equal(shift[key],pattern.route==='flood'?3:6);
    assert.equal(shift[kind==='confidentiality'?'alteredRecords':'exposedRecords'],0);
    const initial=shift[key];shift.advance(4.1);
    assert.equal(shift[key],initial+1);
    assert.equal(shift.unavailableRecords,0);
    assert.match(shift.requests[0].inspection.patternId,new RegExp(pattern.id));
  }
});

test('repair stops each impact kind while preserving all previously accumulated damage',()=>{
  for(const kind of ['availability','confidentiality','integrity']) {
    const pattern=THREATS.find(t=>t.impactKind===kind);
    assert(pattern,'missing impact kind '+kind);
    const shift=attackShift(pattern);
    shift.decide(1,true);shift.repair(pattern.route);shift.advance(10.1);
    const damage=[shift.unavailableRecords,shift.exposedRecords,shift.alteredRecords];
    assert(damage.some(n=>n>0));
    assert.equal(shift.zones[pattern.route].fixed,true);
    for(const r of shift.pending())shift.decide(r.id,expectedVerdict(r));
    shift.advance(3);
    assert.deepEqual([shift.unavailableRecords,shift.exposedRecords,shift.alteredRecords],damage);
  }
});

test('quarantine freezes the affected exposure or alteration and retains its work interruption cost',()=>{
  for(const kind of ['confidentiality','integrity']) {
    const pattern=THREATS.find(t=>t.impactKind===kind),shift=attackShift(pattern);
    shift.decide(1,true);
    const damage=[shift.unavailableRecords,shift.exposedRecords,shift.alteredRecords];
    const before=shift.postponedAppointments;
    assert.equal(shift.quarantine(pattern.route),true);shift.advance(7.5);
    assert.deepEqual([shift.unavailableRecords,shift.exposedRecords,shift.alteredRecords],damage);
    assert.equal(shift.postponedAppointments,before+4);
  }
});

test('each new record impact counter caps at 100; old requests retain availability damage',()=>{
  for(const kind of ['confidentiality','integrity']) {
    const pattern=THREATS.find(t=>t.impactKind===kind),shift=attackShift(pattern);
    const key=kind==='confidentiality'?'exposedRecords':'alteredRecords';
    shift[key]=99;shift.decide(1,true);shift.advance(4.1);
    assert.equal(shift[key],100);
    assert.equal(shift.unavailableRecords,0);
  }
  const legacy=new Shift();legacy.start();delete legacy.requests[0].inspection;
  legacy.decide(1,true);legacy.advance(4.1);
  assert.equal(legacy.unavailableRecords,7);
  assert.equal(legacy.exposedRecords,0);
  assert.equal(legacy.alteredRecords,0);
});

test('resource exhaustion retains three unavailable records and five postponed appointments plus ongoing costs',()=>{
 const pattern=THREATS.find(t=>t.id==='resource_exhaustion'),shift=attackShift(pattern);
 assert.equal(pattern.route,'flood');assert.equal(pattern.impactKind,'availability');
 shift.decide(1,true);
 assert.equal(shift.unavailableRecords,3);
 assert.equal(shift.postponedAppointments,5);
 assert.equal(shift.exposedRecords,0);assert.equal(shift.alteredRecords,0);
 shift.advance(4.1);
 assert.equal(shift.unavailableRecords,4);
 assert.equal(shift.postponedAppointments,6);
});
