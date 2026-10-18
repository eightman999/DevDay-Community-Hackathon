import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift,expectedVerdict} from './dist/engine.mjs';
import {companionSnapshot,companionEvidence,normalizeCompanionContext,localCompanion} from './dist/companion-context.mjs';
import {createCompanionService,collectAgentTurn,validateCompanionOutput} from './server/companion-service.mjs';
import {createCellwatchServer} from './server.mjs';

function context(){const s=new Shift();s.start();return companionSnapshot(s,1);}
const event=e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
function stream(value,{completed=true,failed=false,id='sess_mock1',turn='turn_1'}={}){
 const events=[{type:'agent.session.created',session:{id}},
 {type:'agent.session.turn.created',turn:{id:turn,subagent_id:null}},
 {type:'agent.session.turn.item.done',turn_id:turn,item:{role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:JSON.stringify(value)}]}},
 ...(completed?[{type:'agent.session.turn.completed',turn:{id:turn,status:'completed',subagent_id:null}}]:[]),
 ...(failed?[{type:'agent.session.turn.failed',turn:{id:turn,subagent_id:null}}]:[])];
 const bytes=new TextEncoder().encode(events.map(event).join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=11)c.enqueue(bytes.slice(i,i+11));c.close();}}));
}
test('pending answers/evidence never enter model input; completed reasons use the shared verdict',()=>{
 const s=new Shift();s.start();const pending=companionEvidence(companionSnapshot(s,1),'consult');
 assert.deepEqual(pending.judged,[]);assert(!JSON.stringify(pending).includes('SMBv1'));assert(!JSON.stringify(pending).includes('templateId'));
 s.decide(1,expectedVerdict(s.requests[0]));const judged=companionEvidence(companionSnapshot(s),'consult').judged;
 assert.equal(judged[0].correct,true);assert.match(judged[0].reason,/通信方式/);
 assert.match(localCompanion(companionSnapshot(s),'review').review.good,/1件/);
 for(const patch of [{time:NaN},{requests:[{...context().requests[0],id:99}]},{zones:[]},{selectedId:99},{metrics:{...context().metrics,exposed:101}}])assert.throws(()=>normalizeCompanionContext({...context(),...patch}));
});
test('Agents SSE completion, schema/reference validation, deduplication and bounded calls',async()=>{
 let creates=0,deletes=0;
 const service=createCompanionService({enabled:true,apiKey:'test',fetchImpl:async(url,options)=>{
  if(options.method==='DELETE'){deletes++;return new Response('{}');}
  creates++;assert.equal(url,'https://api.openai.com/v1/agents/sessions');const body=JSON.parse(options.body);
  assert.equal(body.environment.type,'openai_hosted');assert.equal(body.agent.text.format.type,'json_schema');assert(!body.input.includes('SMBv1'));
  return stream({message:'6項目を順に確認しましょう。',evidenceIds:[]});
 }});
 const p={requestId:'first',kind:'consult',context:context()};const [a,b]=await Promise.all([service.message('session1',p),service.message('session1',p)]);
 assert.equal(a.source,'agents');assert.deepEqual(a,b);assert.equal(creates,1);assert.equal(deletes,1);
 assert.throws(()=>service.message('session1',{...p,context:{...p.context,time:1}}),/request-conflict/);
 for(let i=1;i<5;i++)await service.message('session1',{...p,requestId:'q'+i});
 assert.equal((await service.message('session1',{...p,requestId:'q6'})).reason,'budget');assert.equal(creates,5);
 assert.throws(()=>validateCompanionOutput({message:'test',evidenceIds:[1]},context(),'consult'));
 assert.throws(()=>validateCompanionOutput({message:'<script>',evidenceIds:[]},context(),'consult'));
});
test('failed, incomplete, malformed and denied turns use explicit local fallback and cleanup',async()=>{
 for(const scenario of ['failed','incomplete','invalid','access']){
  let cleanup=0;
  const service=createCompanionService({enabled:true,apiKey:'test',fetchImpl:async(url,options)=>{
   if(options.method==='DELETE'){cleanup++;return new Response('{}');}
   if(options.method==='GET'||!options.method)return new Response('{}',{status:404});
   if(scenario==='access')return new Response('{}',{status:403});
   return stream(scenario==='invalid'?{message:'invented',evidenceIds:[999]}:{message:'valid',evidenceIds:[]},{completed:!['failed','incomplete'].includes(scenario),failed:scenario==='failed'});
  }});
  const r=await service.message('one',{requestId:'first',kind:'consult',context:context()});
  assert.equal(r.source,'local');assert.equal(r.reason,{failed:'agent-failed',incomplete:'incomplete-turn',invalid:'invalid-response',access:'access-denied'}[scenario]);
  assert.equal(cleanup,scenario==='access'?0:1);
 }
});
test('SSE idle alone and a different turn completion do not prove success',async()=>{
 const r=await collectAgentTurn(new Response(event({type:'agent.session.idle'})+event({type:'agent.session.turn.completed',turn:{id:'other',status:'completed',subagent_id:null}})),()=>{});
 assert.equal(r.complete,false);
});
test('SSE CRLF separators survive single-byte network chunks',async()=>{
 const text=[{type:'agent.session.created',session:{id:'sess_crlf'}},{type:'agent.session.turn.created',turn:{id:'turn_crlf',subagent_id:null}},{type:'agent.session.turn.completed',turn:{id:'turn_crlf',subagent_id:null,status:'completed'}}].map(event).join('').replace(/\n/g,'\r\n');
 let found;
 const result=await collectAgentTurn(new Response(new ReadableStream({start(c){for(const byte of new TextEncoder().encode(text))c.enqueue(Uint8Array.of(byte));c.close();}})),id=>{found=id;});
 assert.equal(found,'sess_crlf');assert.equal(result.complete,true);
});
test('a connection exception after root turn creation recovers persisted completion',async()=>{
 const prefix=event({type:'agent.session.created',session:{id:'sess_disconnect'}})+event({type:'agent.session.turn.created',turn:{id:'turn_1',subagent_id:null}});let step=0;
 const service=createCompanionService({apiKey:'test',enabled:true,fetchImpl:async(url,options)=>{
  if(options.method==='DELETE')return new Response('{}');
  if(url.endsWith('/turns/turn_1'))return Response.json({id:'turn_1',status:'completed'});
  if(url.includes('/items?'))return Response.json({data:[{turn_id:'turn_1',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text:JSON.stringify({message:'復旧済み',evidenceIds:[]})}]}]});
  return new Response(new ReadableStream({pull(c){if(step++===0)c.enqueue(new TextEncoder().encode(prefix));else c.error(Error('disconnected'));}}));
 }});
 assert.equal((await service.message('s',{requestId:'first',kind:'consult',context:context()})).source,'agents');
});
test('support only accepts a currently legal defensive action and cannot allow traffic',async()=>{
 const s=new Shift();s.start();s.decide(1,true);const c=companionSnapshot(s);
 assert.throws(()=>validateCompanionOutput({message:'許可',action:{kind:'allow',type:'auth'},evidenceIds:[]},c,'support'));
 assert.throws(()=>validateCompanionOutput({message:'修復',action:{kind:'repair',type:'share'},evidenceIds:[]},c,'support'));
 const service=createCompanionService({apiKey:'test',enabled:true,fetchImpl:async(_url,options)=>options.method==='DELETE'?new Response('{}'):stream({message:'受付の隔離を支援します。',action:{kind:'quarantine',type:'auth'},evidenceIds:[1]})});
 assert.equal((await service.message('s',{requestId:'support1',kind:'support',context:c})).action.kind,'quarantine');
});
test('deadline covers an ignoring fetch or stalled SSE body without resubmitting input',async()=>{
 for(const stall of ['fetch','body']){
  let creates=0;
  const service=createCompanionService({apiKey:'test',enabled:true,timeoutMs:10,fetchImpl:async()=>{
   creates++;return stall==='fetch'?new Promise(()=>{}):new Response(new ReadableStream({start(){}}));
  }});
  const r=await service.message('session',{requestId:'one',kind:'consult',context:context()});
  assert.equal(r.reason,'timeout');assert.equal(creates,1);
 }
});
test('a lost completion is reconciled against the intended saved turn and items',async()=>{
 const service=createCompanionService({enabled:true,apiKey:'test',fetchImpl:async(url,options)=>{
  if(options.method==='DELETE')return new Response('{}');
  if(url.endsWith('/turns/turn_1'))return Response.json({id:'turn_1',status:'completed'});
  if(url.includes('/items?'))return Response.json({data:[{turn_id:'other',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:'not this turn'}]},{turn_id:'turn_1',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:JSON.stringify({message:'照合しましょう。',evidenceIds:[]})}]}]});
  return stream({message:'old',evidenceIds:[]},{completed:false});
 }});
 assert.equal((await service.message('session',{requestId:'one',kind:'consult',context:context()})).message,'照合しましょう。');
});
test('review validates all fields and evidence references, then deletes its hosted session',async()=>{
 const s=new Shift();s.start();s.decide(1,false);s.advance(120);
 const review={good:'最初の不正通信を遮断しました。',improve:'審査期限も確認しましょう。',next:'6項目を順に確認しましょう。'};
 let deleted=false;
 const service=createCompanionService({apiKey:'test',enabled:true,fetchImpl:async(_url,options)=>{
  if(options.method==='DELETE'){deleted=true;return new Response('{}');}
  return stream({message:'当直お疲れさまでした。',review,evidenceIds:[1]});
 }});
 const r=await service.message('review',{requestId:'r1',kind:'review',context:companionSnapshot(s)});
 assert.equal(r.source,'agents');assert.deepEqual(r.review,review);assert(deleted);
});
test('cleanup retries a 409 even if cancellation fails',async()=>{
 let deletions=0;
 const service=createCompanionService({apiKey:'test',enabled:true,fetchImpl:async(url,options)=>{
  if(options.method==='DELETE')return new Response('{}',{status:++deletions===1?409:200});
  if(url.endsWith('/events'))throw Error('cancel failed');
  return stream({message:'照合しましょう。',evidenceIds:[]});
 }});
 assert.equal((await service.message('s',{requestId:'first',kind:'consult',context:context()})).source,'agents');
 assert.equal(deletions,2);
});
test('review requires end of shift, preserves reason fields, and disabled mode never calls upstream',async()=>{
 const s=new Shift();s.start();s.advance(120);const snapshot=companionSnapshot(s);
 const service=createCompanionService({fetchImpl:()=>assert.fail('no API')});
 assert.throws(()=>service.message('a',{requestId:'x',kind:'review',context:context()}));
 const r=await service.message('a',{requestId:'x',kind:'review',context:snapshot});
 assert.equal(r.reason,'unconfigured');assert(r.review.good&&r.review.improve&&r.review.next);
});
test('real local HTTP route enforces origin, body, type, and returns safe companion fallback',async(t)=>{
 const server=createCellwatchServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const base=`http://127.0.0.1:${server.address().port}`,payload={sessionId:'test-session-123',requestId:'one',kind:'consult',context:context()};
 const post=(headers,body=JSON.stringify(payload))=>fetch(base+'/api/companion/message',{method:'POST',headers,body});
 assert.equal((await post({'Content-Type':'application/json',Origin:'https://attacker.invalid'})).status,403);
 assert.equal((await post({'Content-Type':'text/plain'})).status,415);
 assert.equal((await post({'Content-Type':'application/json'},'x'.repeat(33000))).status,413);
 assert.equal((await post({'Content-Type':'application/json'},'{}')).status,400);
 const response=await post({'Content-Type':'application/json'});assert.equal(response.status,200);assert.equal((await response.json()).source,'local');
});
