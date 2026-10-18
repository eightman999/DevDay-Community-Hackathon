import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift, expectedVerdict, ORDER, MAX_ROOT_REPAIRS} from './dist/engine.mjs';
import {INCIDENTS} from './dist/catalog.mjs';
import {buildEnemyTurn, normalizeEnemyTurn, chooseLocal, enemyActions} from './dist/enemy-policy.mjs';
import {EnemyDirector} from './dist/enemy.mjs';
import {evidenceBot, simulate, summarize} from './scripts/verify-demo.mjs';

const apiChoice = (turn,id,reason) => ({...enemyActions(turn).find(action=>action.id===id&&action.interval===7),source:'decisions',reason});
const settle = () => new Promise(resolve => setImmediate(resolve));
const preparedShift = director => {const shift = new Shift({director,seed:0});shift.start();shift.decide(1,false);shift.advance(5.1);return shift;};

test('choice traces retain the API observation, while local fallback records recalculated input',async()=>{
 for(const source of ['decisions','local']){
  const director=new EnemyDirector({provider:{choose:async turn=>source==='decisions'?apiChoice(turn,2,'selected'):({id:turn.candidateIds[0],source,reason:'unconfigured'})}});
  const shift=new Shift({director,seed:42});shift.start();shift.advance(5.1);director.tick(shift);await settle();
  shift.decide(1,false);shift.advance(2.1);const next=shift.requests[1];
  assert.equal(next.enemySource,source);assert.equal(next.enemyObservation.recent.length,source==='decisions'?0:1);
  assert.equal(next.enemyObservation.candidateCount,16);assert(!('seed' in next.enemyObservation));
  director.dispose();
 }
});

test('local adaptive shift keeps 16 CSV communications, seven-second arrivals, and perfect verdicts', () => {
  const director = new EnemyDirector();
  const shift = new Shift({director});
  shift.start();
  assert.equal(shift.requests[0].templateId, 1);
  for (let step = 0; step < 1201; step++) {
    for (const request of shift.pending()) shift.decide(request.id, expectedVerdict(request));
    director.tick(shift);
    shift.advance(.1);
  }
  assert.equal(shift.done, true);
  assert.equal(shift.requests.length, INCIDENTS.length);
  assert.equal(shift.mistakes, 0);
  assert.equal(shift.data, 100);
  assert.equal(shift.trust, 100);
  for (const [index, r] of shift.requests.entries()) {
    assert.equal(r.a, INCIDENTS[r.templateId - 1].a);
    assert.equal(r.b, INCIDENTS[r.templateId - 1].b);
    assert(Math.abs(r.at - index * 7) < .11);
    assert.equal(r.valid,expectedVerdict(r));
  }
  director.dispose();
});

test('the old ID-modulo answer shortcut fails across independently seeded shifts', () => {
  let correct=0,total=0;const secondAnswers=new Set();
  for(let seed=1;seed<=64;seed++){
    const director=new EnemyDirector(),shift=new Shift({director,seed});shift.start();
    while(!shift.done){for(const request of shift.pending()){const allow=request.id%3===2;correct+=Number(allow===expectedVerdict(request));total++;shift.decide(request.id,allow);}shift.advance(.5);}
    secondAnswers.add(expectedVerdict(shift.requests[1]));
    director.dispose();
  }
  assert.equal(total,64*16);
  assert.ok(correct/total<.75,`ID-only accuracy ${correct/total}`);
  assert.equal(secondAnswers.size,2,'The same visible ID must have both outcomes in different runs');
});

test('every courier can carry normal and malicious evidence without becoming an answer key', () => {
  const runs = Array.from({length:128}, (_, index) => simulate(index+1, request => {
    // Fail immediately if the evidence bot starts using any hidden answer metadata.
    const evidenceOnly = new Proxy({inspection:request.inspection}, {
      get(target, key) {assert.equal(key, 'inspection');return target[key];}
    });
    const allow = evidenceBot(evidenceOnly);
    assert.equal(allow, expectedVerdict(request));
    return allow;
  }));
  const result = summarize(runs);
  assert.equal(result.requests, 128*16);
  assert.equal(result.accuracy, 1);
  assert.equal(result.unreviewed, 0);
  assert.equal(result.mistakes, 0);
  assert(Object.values(result.damage).every(metric => metric.total === 0));
  for (const courier of result.couriers) {
    assert(courier.normal > 0, `${courier.name} must carry normal traffic`);
    assert(courier.malicious > 0, `${courier.name} must carry malicious traffic`);
  }
  assert(runs.every(run => run.trace[0].patternId === 'smb_v1' && !run.trace[0].normal),
    'Only the first teaching request intentionally fixes the malicious SMB example');
});

test('verification traces replay exactly under the same explicit seed and actions', () => {
  for (const seed of [1, 128, 0xffffffff]) assert.deepEqual(simulate(seed, evidenceBot), simulate(seed, evidenceBot));
});

test('repair-only play exhausts two root repairs and leaves attacks requiring manual review', () => {
  assert.equal(MAX_ROOT_REPAIRS, 2);
  const runs = Array.from({length:128}, (_, index) =>
    simulate(index+1, () => undefined, new EnemyDirector(), {repairOnly:true}));
  assert(runs.every(run => run.reviewed === 0 && run.completedRepairs === 2 && run.repairRejections > 0));
  assert(runs.every(run => run.timedOut > 0), 'Unfixed routes must continue requiring review');
  for (const seed of [1,2,3,42]) {
    const run = runs[seed-1];
    assert(Object.values(run.damage).some(value => value > 0), `Repair-only seed ${seed} must not bypass inspection`);
  }
  const shift = new Shift({director:new EnemyDirector(),seed:1});
  shift.start();
  assert.equal(shift.repair('auth'), true);
  assert.equal(shift.repair('share'), false, 'Only one repair can run at a time');
  shift.advance(10.1);
  assert.equal(shift.repair('share'), true);
  shift.advance(10.1);
  assert.equal(shift.repaired, 2);
  for (const type of ['flood','exfil']) {
    assert.equal(shift.repair(type), false, 'Exhausted capacity must reject further repair requests');
    assert.equal(shift.zones[type].repairEnd, 0);
    assert.equal(shift.zones[type].fixed, false);
  }
  shift.director.dispose();
});

test('selection seeds replay choices, change on a new run, and cannot expand the server observation', () => {
  const paths=seed=>{const shift=new Shift({director:new EnemyDirector(),seed});shift.start();while(!shift.done){for(const r of shift.pending())shift.decide(r.id,expectedVerdict(r));shift.advance(.5);}return shift.requests.map(r=>r.templateId);};
  assert.deepEqual(paths(12345),paths(12345));
  assert.notDeepEqual(paths(12345),paths(67890));
  const shift=new Shift();shift.serial=2;const turn=buildEnemyTurn(shift);
  for(const seed of [-1,1.5,Infinity,'123',0x100000000])assert.throws(()=>normalizeEnemyTurn({...turn,seed}));
});

test('candidates exclude repaired, repairing, and quarantined attack routes; all protected routes use normal traffic', () => {
  const shift = new Shift();
  shift.start();shift.advance(14.1);
  shift.zones.auth.fixed = true;
  shift.zones.share.repairEnd = 20;
  shift.zones.flood.quarantineUntil = 20;
  let turn = buildEnemyTurn(shift);
  assert(turn.candidateIds.length);
  assert(turn.candidateIds.every(id => expectedVerdict(INCIDENTS[id-1]) || INCIDENTS[id-1].type === 'exfil'));
  shift.zones.exfil.fixed = true;
  turn = buildEnemyTurn(shift);
  assert(turn.candidateIds.every(id => expectedVerdict(INCIDENTS[id - 1])));
});

test('local policy responds to missed traffic, switches after a block, and avoids an immediate same-route repeat', () => {
  const shift = new Shift();shift.serial = 2;
  const turn = buildEnemyTurn(shift);
  turn.recent = [{type:'exfil',status:'allow',valid:false},{type:'auth',status:'deny',valid:false}];
  assert.equal(INCIDENTS[chooseLocal(turn) - 1].type, 'exfil');
  turn.recent = [{type:'flood',status:'timeout',valid:false},{type:'share',status:'allow',valid:true}];
  assert.equal(INCIDENTS[chooseLocal(turn) - 1].type, 'flood');
  turn.recent = [{type:'flood',status:'timeout',valid:false}];
  assert.notEqual(INCIDENTS[chooseLocal(turn) - 1].type, 'flood');
});

test('server normalization restricts observation values and rederives CSV candidates', () => {
  const shift = new Shift();shift.serial = 2;
  const turn = buildEnemyTurn(shift);
  assert.deepEqual(normalizeEnemyTurn({...turn,candidateIds:[999],secret:'ignored'}),turn);
  for (const change of [{round:-1},{round:INCIDENTS.length},{time:Infinity},{time:121},{zones:{}},{recent:[{type:'unknown',status:'allow',valid:false}]},{recent:Array(25).fill({type:'auth',status:'allow',valid:false})}]) {
    assert.throws(() => normalizeEnemyTurn({...turn,...change}));
  }
});

test('provider prefetch occurs once per round and a validated choice remains synchronous', async () => {
  let calls = 0;
  const director = new EnemyDirector({provider:{choose:async turn => {calls++;return apiChoice(turn,turn.candidateIds.at(-1),'別の送信経路を選択。');}}});
  const shift = preparedShift(director);
  director.tick(shift);director.tick(shift);await settle();
  assert.equal(calls,1);
  shift.advance(2);
  assert.equal(shift.requests[1].enemySource,'decisions');
  assert.equal(shift.requests[1].templateId,16);
  director.dispose();
});

test('invalid provider IDs and failures fall back to local without changing answer policy', async () => {
  for (const choose of [async () => ({id:999,source:'decisions',reason:'bad'}), async () => {throw Error('offline');}]) {
    const director = new EnemyDirector({provider:{choose}});
    const shift = preparedShift(director);director.tick(shift);await settle();shift.advance(2);
    assert.equal(shift.requests[1].enemySource,'local');
    assert.equal(shift.requests[1].valid,expectedVerdict(shift.requests[1]));
    director.dispose();
  }
});

test('prepared API attacks are rechecked against changed repair and quarantine state at spawn', async () => {
  for (const defense of ['fixed','repairEnd','quarantineUntil']) {
    const director = new EnemyDirector({provider:{choose:async turn => apiChoice(turn,turn.candidateIds[0],'first')}});
    const shift = preparedShift(director);shift.advance(7);director.tick(shift);await settle();
    assert.equal(shift.serial,2);
    shift.zones.auth[defense] = defense === 'fixed' ? true : 30;
    shift.advance(2);
    assert.equal(shift.requests[2].enemySource,'local');
    assert.notEqual(shift.requests[2].type,'auth');
    director.dispose();
  }
});

test('slow provider never blocks arrivals, aborts on disposal, and late responses cannot affect a reset', async () => {
  let resolveChoice, oldSignal;
  const director = new EnemyDirector({provider:{choose:(turn,{signal}) => {oldSignal=signal;return new Promise(resolve => {resolveChoice=() => resolve(apiChoice(turn,turn.candidateIds[0],'late'));});}}});
  const shift = preparedShift(director);director.tick(shift);await settle();shift.advance(2);
  assert.equal(shift.requests.length,2);
  assert.equal(shift.requests[1].enemySource,'local');
  assert.equal(oldSignal.aborted,true);
  director.dispose();resolveChoice();await settle();
  const fresh = new Shift({director:new EnemyDirector()});fresh.start();fresh.advance(7.1);
  assert.equal(fresh.requests[1].enemySource,'local');
  assert.equal(director.ready,null);
  fresh.director.dispose();
});

test('deadline and paused state keep the local game usable with no repeated API calls', async () => {
  let calls=0, signal;
  const director = new EnemyDirector({timeoutMs:5,provider:{choose:(_turn,options) => {calls++;signal=options.signal;return new Promise(()=>{});}}});
  const shift = preparedShift(director);shift.running=false;director.tick(shift);await settle();assert.equal(calls,0);
  shift.running=true;director.tick(shift);await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(signal.aborted,true);director.tick(shift);assert.equal(calls,1);
  shift.advance(2);assert.equal(shift.requests[1].enemySource,'local');director.dispose();
});


test('empty adaptive candidate slots still finish the bounded shift', () => {
  const shift = new Shift({director:{select:()=>({id:null,source:'local',reason:'候補なし'})}});
  shift.start();shift.advance(120);
  assert.equal(shift.serial,INCIDENTS.length);
  assert.equal(shift.requests.length,0);
  assert.equal(shift.done,true);
  assert.equal(shift.data,100);
});


test('a pause or disposal before the provider microtask prevents a new network call', async () => {
  for (const stop of [shift=>{shift.running=false;}, (_shift,director)=>director.dispose()]) {
    let calls=0;
    const director=new EnemyDirector({provider:{choose:async turn=>{calls++;return apiChoice(turn,turn.candidateIds[0],'selected');}}});
    const shift=preparedShift(director);director.tick(shift);stop(shift,director);await settle();
    assert.equal(calls,0);director.dispose();
  }
});

test('local fallback recalculates from judgments made after prefetch', async () => {
  const director=new EnemyDirector({provider:{choose:async turn=>({id:turn.candidateIds[0],source:'local',reason:'unconfigured'})}});
  const shift=preparedShift(director);shift.advance(7);director.tick(shift);await settle();
  shift.record.push({type:'exfil',a:'社内資料',b:'外部',status:'allow'},{type:'auth',a:'AOI',b:'UNKNOWN',status:'deny'});
  const id=chooseLocal(buildEnemyTurn(shift));
  assert.equal(INCIDENTS[id-1].type,'exfil');
  shift.advance(2);assert.equal(shift.requests[2].templateId,id);assert.equal(shift.requests[2].enemySource,'local');director.dispose();
});
