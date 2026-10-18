import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionProvider,validCompanionResponse,companionSource} from './dist/companion.mjs';
import {Shift} from './dist/engine.mjs';
import {companionSnapshot} from './dist/companion-context.mjs';
const context=companionSnapshot(new Shift());
const valid={source:'agents',reason:'agents',message:'6項目を確認しましょう。'};
const response=value=>({ok:true,status:200,json:async()=>value});
test('same-origin request contract and validated response',async()=>{
  let sent;
  const provider=createCompanionProvider({sessionId:'test-session',fetchImpl:async(url,options)=>{sent={url,...options};return response(valid);}});
  assert.deepEqual(await provider.message(context),valid);
  assert.equal(sent.url,'/api/companion/message');assert.equal(sent.credentials,'same-origin');
  assert.deepEqual(JSON.parse(sent.body),{sessionId:'test-session',requestId:'companion_1',kind:'consult',context});
});
test('HTTP errors and malformed model output fall back with an explicit source',async()=>{
  for(const [status,reason] of [[401,'sign-in-required'],[404,'offline'],[503,'api-error']]){
    const result=await createCompanionProvider({fetchImpl:async()=>({status,ok:false})}).message(context);
    assert.equal(result.source,'local');assert.equal(result.reason,reason);assert(result.message.length>0);
    assert(companionSource(result).includes('定型応答'));
  }
  for(const value of [{...valid,message:'x'.repeat(601)},{...valid,source:'other'},null]){
    const result=await createCompanionProvider({fetchImpl:async()=>response(value)}).message(context);
    assert.equal(result.reason,'invalid-response');
  }
  assert.equal(validCompanionResponse(valid,'review'),false);
});
test('review requires all three bounded fields and preserves only display data',async()=>{
  const review={good:'確認できた',improve:'規則を見る',next:'全項目を照合'};
  const result=await createCompanionProvider({fetchImpl:async()=>response({...valid,review,extra:'ignored'})}).message(context,'review');
  assert.deepEqual(result,{...valid,review});
  assert.equal(validCompanionResponse({...valid,review:{...review,next:'x'.repeat(401)}},'review'),false);
});
test('timeout and cancellation settle even when fetch ignores AbortSignal',async()=>{
  const fetchImpl=()=>new Promise(()=>{});
  const timeout=await createCompanionProvider({fetchImpl,timeoutMs:10}).message(context);
  assert.equal(timeout.reason,'timeout');
  const controller=new AbortController();
  const pending=createCompanionProvider({fetchImpl,timeoutMs:200}).message(context,'consult',{signal:controller.signal});
  controller.abort();assert.equal((await pending).reason,'cancelled');
});
