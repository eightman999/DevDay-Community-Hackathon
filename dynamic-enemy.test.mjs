import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift, expectedVerdict} from './dist/engine.mjs';
import {INCIDENTS,evaluatePolicy,TYPES} from './dist/catalog.mjs';
import {makeInspection,inspectionChecks,inspectionVerdict} from './dist/threats.mjs';
import {buildEnemyTurn, enemyActions} from './dist/enemy-policy.mjs';
import {EnemyDirector} from './dist/enemy.mjs';
import {createEnemyProvider} from './dist/enemy-provider.mjs';
import {createDecisionService} from './server/decision-service.mjs';

const observation = (round = 2) => {const shift = new Shift();shift.serial = round;return buildEnemyTurn(shift);};
const response = choice => new Response(JSON.stringify({answers:[{type:'choice',name:'next_action',choice,confidence:.8}]}),{headers:{'Content-Type':'application/json'}});

test('Decisions actions combine bounded intervals with verdict-compatible tactics', () => {
  const turn = observation();
  const actions = enemyActions(turn);
  assert(actions.length);
  assert.equal(new Set(actions.map(action=>action.value)).size,actions.length);
  assert.deepEqual([...new Set(actions.map(action=>action.interval))].sort((a,b)=>a-b),[4,7,10]);
  for (const action of actions) {
    const row = INCIDENTS.find(row=>row.id===action.id);
    assert.equal(action.value,`action_${action.id}_${action.interval}_${action.tactic}`);
    assert.equal(action.tactic==='feint',expectedVerdict(row));
  }
  assert(actions.some(action=>action.tactic==='switch'));
  assert(actions.some(action=>action.tactic==='pressure'));
});

test('switch changes the latest route and pressure targets the latest missed attack route', () => {
  const turn = observation();
  turn.recent=[{type:'exfil',status:'allow',valid:false},{type:'auth',status:'deny',valid:false}];
  const actions=enemyActions(turn);
  const switches=actions.filter(action=>action.tactic==='switch');
  const pressure=actions.filter(action=>action.tactic==='pressure');
  assert(switches.length);assert(pressure.length);
  assert(switches.every(action=>INCIDENTS[action.id-1].type!=='auth'));
  assert(pressure.every(action=>INCIDENTS[action.id-1].type==='exfil'));
  turn.zones.exfil.fixed=true;
  assert(enemyActions(turn).every(action=>expectedVerdict(INCIDENTS[action.id-1])||INCIDENTS[action.id-1].type!=='exfil'));
});

test('joint API selection can choose normal traffic outside the local attack cycle', async () => {
  const turn=observation();
  const action=enemyActions(turn).find(action=>action.tactic==='feint'&&action.interval===4);
  assert(action);assert(!turn.candidateIds.includes(action.id));
  const service=createDecisionService({apiKey:'mock-key',fetchImpl:async(_url,init)=>{
    const body=JSON.parse(init.body);
    assert.equal(body.questions.length,1);
    assert.equal(body.questions[0].name,'next_action');
    assert(body.questions[0].choices.some(choice=>choice.value===action.value));
    return response(action.value);
  }});
  assert.deepEqual(await service.decide('joint-choice',turn),{id:action.id,interval:4,tactic:'feint',source:'decisions',reason:'selected'});
});

test('unoffered interval or tactic cannot be combined with an otherwise allowed incident', async () => {
  const turn=observation();
  const action=enemyActions(turn).find(action=>action.tactic==='feint');
  for (const choice of [`action_${action.id}_1_feint`,`action_${action.id}_7_pressure`,'incident_1']) {
    const service=createDecisionService({apiKey:'mock-key',fetchImpl:async()=>response(choice)});
    const result=await service.decide('invalid-joint-choice',turn);
    assert.equal(result.source,'local');assert.equal(result.reason,'invalid-response');assert.equal(result.interval,7);
  }
});

test('browser validates the whole action and keeps the local choice on invalid combinations', async () => {
  const turn=observation();
  const action=enemyActions(turn).find(action=>action.tactic==='feint'&&action.interval===10);
  for (const change of [{interval:0},{interval:120},{tactic:'pressure'},{tactic:'freeform'}]) {
    const provider=createEnemyProvider({fetchImpl:async()=>new Response(JSON.stringify({...action,...change,source:'decisions',reason:'selected'}))});
    const result=await provider.choose(turn);
    assert.equal(result.source,'local');assert.equal(result.reason,'invalid-response');assert.equal(result.interval,7);
  }
});

test('dynamic arrivals use selected intervals and still consume all 16 slots by 105 seconds', () => {
  for (const interval of [4,10]) {
    const shift=new Shift({director:{select:state=>({id:INCIDENTS[state.serial].id,interval,tactic:'switch',source:'decisions',reason:'fixture'})}});
    shift.start();
    for(let step=0;step<1201;step++) {
      for(const request of shift.pending())shift.decide(request.id,expectedVerdict(request));
      shift.advance(.1);
    }
    assert.equal(shift.done,true);assert.equal(shift.requests.length,16);assert.equal(shift.serial,16);
    assert(shift.requests.at(-1).at<=105.11);
    assert(Math.abs(shift.requests[1].at-interval)<.11);
    assert.equal(shift.mistakes,0);assert.equal(shift.data,100);assert.equal(shift.trust,100);
    for(let index=1;index<shift.requests.length;index++)assert(shift.requests[index].at-shift.requests[index-1].at>=3.89);
  }
});

test('CSV practice keeps its fixed order, seven-second rhythm, and all eleven weaknesses', () => {
  const shift=new Shift();shift.start();shift.advance(106);
  assert.deepEqual(shift.requests.map(request=>request.templateId),INCIDENTS.map(row=>row.id));
  for(const [index,request]of shift.requests.entries())assert(Math.abs(request.at-index*7)<.11);
  assert.equal(new Set(shift.requests.map(request=>request.inspection.patternId)).size,11);
});


test('director prefetch follows a four-second schedule after a dynamic decision', async () => {
  const calls=[];
  const director=new EnemyDirector({provider:{choose:async turn=>{
    calls.push(turn.time);
    const action=enemyActions(turn).find(action=>action.tactic==='feint'&&action.interval===4);
    return {...action,source:'decisions',reason:'selected'};
  }}});
  try {
    const shift=new Shift({director});shift.start();shift.advance(5.1);
    director.tick(shift);await new Promise(resolve=>setImmediate(resolve));
    shift.advance(2);
    assert.equal(shift.requests[1].enemySource,'decisions');
    assert(Math.abs(shift.nextArrival-11)<.11);
    shift.advance(1);director.tick(shift);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1);
    shift.advance(1);director.tick(shift);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,2);
    assert(calls[1]>=9&&calls[1]<9.2);
  } finally {director.dispose();}
});


test('Decisions input sends each legal communication once and action descriptions only reference it', async () => {
  const fixtures=[observation(),observation(7)];
  fixtures[1].zones.auth.fixed=true;
  fixtures[1].zones.share.quarantined=true;
  fixtures[1].recent=[{type:'exfil',status:'timeout',valid:false}];
  for (const turn of fixtures) {
    let payload;
    const actions=enemyActions(turn);
    const service=createDecisionService({apiKey:'mock-key',fetchImpl:async(_url,init)=>{
      payload=JSON.parse(init.body);
      return response(actions[0].value);
    }});
    assert.equal((await service.decide('compact-communications',turn)).source,'decisions');
    const {communications}=JSON.parse(payload.input);
    const ids=communications.map(info=>info.id);
    assert.equal(new Set(ids).size,ids.length);
    assert.deepEqual(new Set(ids),new Set(actions.map(action=>action.id)));
    assert(communications.length<payload.questions[0].choices.length);
    for(const choice of payload.questions[0].choices) {
      const action=actions.find(action=>action.value===choice.value);
      const description=JSON.parse(choice.description);
      assert.deepEqual(description,{id:action.id,interval:action.interval,tactic:action.tactic});
      assert(communications.some(info=>info.id===description.id&&info.inspection&&info.rule&&info.impact));
    }
  }
});


test('Decisions communications share all six review rules and preserve CSV verdicts in every round', async () => {
  const failingKeys=new Set();
  const service=createDecisionService({apiKey:'mock-key',fetchImpl:async(_url,init)=>{
    const payload=JSON.parse(init.body);
    const input=JSON.parse(payload.input);
    for(const communication of input.communications) {
      const template=INCIDENTS.find(row=>row.id===communication.id);
      const inspection=makeInspection({...template,templateId:template.id},input.round);
      const checks=inspectionChecks(communication.inspection);
      assert.deepEqual(communication.inspection,inspection);
      assert.deepEqual(checks.map(check=>check.key),['a','b','identity','permission','handling','capacity']);
      assert.equal(communication.rule,checks.map(check=>check.label+'：'+check.rule).join(' / '));
      assert.equal(inspectionVerdict(communication.inspection),evaluatePolicy(template,TYPES));
      for(const check of checks)if(!check.passed)failingKeys.add(check.key);
      const tacticChoices=payload.questions[0].choices.filter(choice=>JSON.parse(choice.description).id===template.id);
      assert(tacticChoices.length);
      assert.equal(tacticChoices.every(choice=>JSON.parse(choice.description).tactic==='feint'),inspectionVerdict(communication.inspection));
    }
    return response(payload.questions[0].choices[0].value);
  }});
  for(let round=0;round<INCIDENTS.length;round++) {
    assert.equal((await service.decide('six-check-communications',observation(round))).source,'decisions');
  }
  assert.deepEqual(failingKeys,new Set(['a','b','identity','permission','handling','capacity']));
});
