import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionRequest,interpretDecision,offlineClassify} from '../decision.mjs';
test('request follows Decisions API schema and selected model',()=>{
  const r=decisionRequest('サーバー側で閲覧権限を確認する',1);
  assert.equal(r.model,'gpt-6-luna');
  assert.deepEqual(r.questions.map(x=>x.type),['choice','predicate']);
  assert.ok(r.questions[0].choices.some(x=>x.value==='root_fix'));
  assert.equal(JSON.parse(r.input).current_stage,'access_control_remediation');
});
test('offline demo clearly reports no AI',()=>{
  const r=offlineClassify('サーバー側で権限を確認する');
  assert.deepEqual(r,{category:'root_fix',confidence:null,mode:'offline'});
});
test('conflicting suggestions are not force-classified in offline mode',()=>{
  assert.equal(offlineClassify('共有リンクを隠すか、サーバー側で権限確認する').category,'unknown');
});
test('live adapter validates confidence and concrete action',()=>{
  const result=interpretDecision({answers:[
    {type:'choice',name:'response_category',choice:'root_fix',confidence:.94},
    {type:'predicate',name:'concrete_response',probability:.93}
  ]});
  assert.equal(result.category,'root_fix');
  assert.equal(result.mode,'live');
  assert.equal(interpretDecision({answers:[{type:'choice',name:'response_category',choice:'root_fix',confidence:.35}]}).category,'unknown');
});
test('refusals and missing answers cannot apply an action',()=>{
  assert.equal(interpretDecision({answers:[{type:'refusal',name:'response_category'}]}).category,'unknown');
  assert.throws(()=>decisionRequest('hello',7));
});
