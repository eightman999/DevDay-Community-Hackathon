import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,ITEMS,classify,timingGrade,DURATION} from '../engine.mjs';
test('rule change and priority: personal information overrides encryption; exe blocked only after notice',()=>{
 assert.equal(classify({pii:true,unreadable:true},20).action,'reject');
 assert.equal(classify({unreadable:true},0).action,'hold');
 assert.equal(classify({executable:true},14.9).action,'allow');
 assert.equal(classify({executable:true},15).action,'reject');
});
test('timing windows accept either side of the beat and reject outside',()=>{
 assert.equal(timingGrade(-.074),'PERFECT');assert.equal(timingGrade(.14),'GOOD');assert.equal(timingGrade(-.22),'OK');assert.equal(timingGrade(.221),null);
});
test('all-correct on-beat run completes 12 files and scores 1200',()=>{
 const g=createGame();g.start();let t=0;
 for(const item of ITEMS){g.update(item.target-t);t=item.target;const r=g.choose(classify(item,t).action);assert.equal(r.grade,'PERFECT');assert.equal(r.correct,true);}
 g.update(DURATION-t);assert.equal(g.snapshot().phase,'done');assert.equal(g.snapshot().score,1200);assert.equal(g.snapshot().maxCombo,12);
});
test('no input produces twelve misses including a long frame',()=>{
 const g=createGame();g.start();g.update(30);const s=g.snapshot();assert.equal(s.results.length,12);assert.equal(s.correct,0);assert.equal(s.score,0);assert.equal(s.phase,'done');
});
test('early input and repeated input cannot consume next file; pause freezes time',()=>{
 const g=createGame();g.start();assert.deepEqual(g.choose('allow'),{early:true});g.update(2);assert.equal(g.choose('allow').correct,true);assert.deepEqual(g.choose('allow'),{early:true});g.pause();g.update(10);assert.equal(g.choose('allow'),null);assert.equal(g.snapshot().time,2);g.resume();g.update(2.5);assert.equal(g.choose('reject').correct,true);
});
test('wrong choice is recorded once and breaks combo; restart clears result state',()=>{
 const g=createGame();g.start();g.update(2);g.choose('allow');g.update(2.5);const r=g.choose('hold');assert.equal(r.correct,false);assert.equal(r.expected,'reject');assert.equal(g.snapshot().combo,0);g.start();assert.equal(g.snapshot().results.length,0);assert.equal(g.snapshot().index,0);
});
