import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift, expectedVerdict, ORDER} from './dist/engine.mjs';
import {INCIDENTS} from './dist/catalog.mjs';
import {buildEnemyTurn, normalizeEnemyTurn, chooseLocal, enemyActions} from './dist/enemy-policy.mjs';
import {EnemyDirector} from './dist/enemy.mjs';

const apiChoice = (turn,id,reason) => ({...enemyActions(turn).find(action=>action.id===id&&action.interval===7),source:'decisions',reason});
const settle = () => new Promise(resolve => setImmediate(resolve));
const preparedShift = director => {const shift = new Shift({director});shift.start();shift.decide(1,false);shift.advance(5.1);return shift;};

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
    if (index % 3 === 1) assert.equal(expectedVerdict(r), true);
  }
  director.dispose();
});

test('candidates exclude repaired, repairing, and quarantined attack routes; all protected routes use normal traffic', () => {
  const shift = new Shift();
  shift.start();shift.advance(14.1);
  shift.zones.auth.fixed = true;
  shift.zones.share.repairEnd = 20;
  shift.zones.flood.quarantineUntil = 20;
  let turn = buildEnemyTurn(shift);
  assert(turn.candidateIds.length);
  assert(turn.candidateIds.every(id => INCIDENTS[id - 1].type === 'exfil'));
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
    assert.equal(expectedVerdict(shift.requests[1]),true);
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
