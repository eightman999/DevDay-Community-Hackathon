import test from 'node:test';
import assert from 'node:assert/strict';
import {Shift, expectedVerdict} from './dist/engine.mjs';

// Independent, human-readable answer key from the documented 16 applications.
const answers = [false,true,false,true,false,true,false,true,false,true,false,true,false,true,false,true];
function finish(policy) {
  const shift = new Shift(); shift.start();
  for (let i=0;i<1201;i++) {
    for (const request of shift.pending()) shift.decide(request.id, policy(request));
    shift.advance(.1);
  }
  return shift;
}
test('documented 16-answer demo finishes at data=100 and trust=100', () => {
  const s = finish(r => answers[r.id-1]);
  assert.equal(s.requests.length,16); assert.equal(s.done,true);
  assert.equal(s.data,100); assert.equal(s.trust,100); assert.equal(s.mistakes,0);
});
test('rejecting everything preserves data but loses trust on eight normal requests', () => {
  const s = finish(() => false);
  assert.equal(s.data,100); assert.equal(s.trust,36); assert.equal(s.mistakes,8);
});
test('20 requests per second passes and 21 fails', () => {
  assert.equal(expectedVerdict({type:'flood',a:'REN',b:'20'}),true);
  assert.equal(expectedVerdict({type:'flood',a:'REN',b:'21'}),false);
});
test('internal data may go internally but not externally; public data may go externally', () => {
  assert.equal(expectedVerdict({type:'exfil',a:'社内資料',b:'外部'}),false);
  assert.equal(expectedVerdict({type:'exfil',a:'社内資料',b:'社内'}),true);
  assert.equal(expectedVerdict({type:'exfil',a:'公開資料',b:'外部'}),true);
});
test('first wrong approval causes immediate damage; repair does not restore lost data', () => {
  const s=new Shift(); s.start(); s.decide(1,true); assert.equal(s.data,94);
  assert.equal(s.repair('auth'),true); s.advance(10.1);
  assert.equal(s.zones.auth.fixed,true); assert.ok(s.data<94);
  assert.equal(s.threatFields.get(1).cells.size,0);
});
