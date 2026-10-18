import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createEnemyProvider } from './dist/enemy-provider.mjs';
import { Shift } from './dist/engine.mjs';
import { buildEnemyTurn, chooseLocal, enemyActions } from './dist/enemy-policy.mjs';
import { createCellwatchServer } from './server.mjs';

const makeTurn = () => { const shift = new Shift(); shift.serial = 2; shift.time = 12; return buildEnemyTurn(shift); };
const reply = result => new Response(JSON.stringify(result), {headers:{'Content-Type':'application/json'}});

test('HTTP provider sends only normalized observations and accepts an allowed CSV choice', async () => {
  const turn = makeTurn();
  let sent;
  const provider = createEnemyProvider({sessionId:'test-session',fetchImpl:async (url, init) => {
    assert.equal(url,'/api/enemy/decide');
    assert.equal(init.credentials,'same-origin');
    sent = JSON.parse(init.body);
    return reply({...enemyActions(turn).at(-1),source:'decisions',reason:'selected'});
  }});
  const result = await provider.choose({...turn, secret:'not for transmission'});
  assert.equal(result.source,'decisions');
  assert.equal(result.id,enemyActions(turn).at(-1).id);
  assert.equal(result.interval,enemyActions(turn).at(-1).interval);
  assert.equal(result.tactic,enemyActions(turn).at(-1).tactic);
  assert.equal(sent.sessionId,'test-session');
  assert.equal(sent.turn.secret,undefined);
});

test('missing static-only API and unconfigured/local servers stay local without repeated requests', async () => {
  for (const mode of ['offline','static-post','unconfigured','local-mode']) {
    let calls=0;
    const turn=makeTurn();
    const provider=createEnemyProvider({fetchImpl:async()=>{
      calls++;
      return ['offline','static-post'].includes(mode)?new Response('',{status:mode==='offline'?404:501}):reply({id:chooseLocal(turn),interval:7,tactic:'local',source:'local',reason:mode});
    }});
    assert.equal((await provider.choose(turn)).source,'local');
    assert.equal((await provider.choose(turn)).source,'local');
    assert.equal(calls,1);
  }
});

test('invalid proxy IDs, source metadata, JSON, and failed HTTP fall back to the local policy', async () => {
  const turn=makeTurn();
  const replies=[
    ()=>reply({id:999,source:'decisions',reason:'selected'}),
    ()=>reply({id:turn.candidateIds[0],source:'unknown',reason:'selected'}),
    ()=>reply({id:turn.candidateIds[0],source:'decisions',reason:'untrusted narrative'}),
    ()=>new Response('malformed'),
    ()=>new Response('unavailable',{status:500}),
    ()=>{throw Error('transport down');}
  ];
  for (const fetchImpl of replies) {
    const result=await createEnemyProvider({fetchImpl}).choose(turn);
    assert.equal(result.source,'local');
    assert.equal(result.id,chooseLocal(turn));
  }
});

test('timeout includes a stalled body and cancellation does not wait for an ignoring transport', async () => {
  for (const stalledBody of [false,true]) {
    const provider=createEnemyProvider({timeoutMs:10,fetchImpl:async()=>stalledBody?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{})});
    assert.equal((await provider.choose(makeTurn())).reason,'timeout');
  }
  const controller=new AbortController();
  const provider=createEnemyProvider({timeoutMs:1000,fetchImpl:()=>new Promise(()=>{})});
  const pending=provider.choose(makeTurn(),{signal:controller.signal});controller.abort();
  assert.equal((await pending).reason,'cancelled');
});

test('the actual loopback proxy contract works with a mocked Decisions upstream', async () => {
  let calls=0;
  const server=createCellwatchServer({apiKey:'fixture-only',mode:'decisions',fetchImpl:async (_url,init)=>{
    calls++;
    const payload=JSON.parse(init.body);
    const choice=payload.questions[0].choices.at(-1).value;
    return reply({answers:[{name:'next_action',type:'choice',choice,confidence:.8}]});
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    const provider=createEnemyProvider({fetchImpl:(url,init)=>fetch(origin+url,init)});
    const result=await provider.choose(makeTurn());
    assert.equal(result.source,'decisions');assert.equal(calls,1);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});


test('authenticated AI endpoints keep anonymous games local and stop repeating unauthorized requests', async () => {
  let calls = 0;
  const provider = createEnemyProvider({fetchImpl:async()=>{calls++;return new Response('',{status:401});}});
  for(let round=1;round<=3;round++) {
    const result = await provider.choose({...makeTurn(),round});
    assert.equal(result.source,'local');
    assert.equal(result.reason,'sign-in-required');
    assert.equal(result.interval,7);
  }
  assert.equal(calls,1);
});
