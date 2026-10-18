import test from 'node:test';
import assert from 'node:assert/strict';
import { Shift } from './dist/engine.mjs';
import { BoardState, boardPoint, hitTest } from './dist/board-state.mjs';
import { drawBoard } from './dist/board-renderer.mjs';
import { ThreatField, HOME_ORIGINS } from './dist/automata.mjs';

test('initial scene has a blue home, no fabricated requests and no threats', () => {
  const scene = new BoardState().update(new Shift());
  assert.deepEqual(scene.nodes, []);
  assert.equal(scene.threats.size, 0);
  const calls = [];
  const ctx = new Proxy({ measureText: () => ({ width: 100 }) }, {
    get: (target, key) => target[key] ?? (() => {}),
    set(target, key, value) { target[key] = value; calls.push([key, value]); return true; },
  });
  drawBoard(ctx, scene, new Set(), 0);
  assert.ok(calls.some(([key, value]) => key === 'fillStyle' && value === '#10283f'));
  assert.ok(!calls.some(([key, value]) => key === 'fillStyle' && value === '#f16c65'));
});

test('untimed practice shows a waiting packet without a fake countdown',()=>{
 const shift=new Shift({practice:true});shift.start();const scene=new BoardState().update(shift);
 assert.equal(scene.nodes[0].phase,'waiting');assert.equal(scene.nodes[0].untimed,true);assert.equal(scene.nodes[0].x,40);
 const labels=[];const ctx=new Proxy({fillText:text=>labels.push(text),measureText:()=>({width:100})},{get:(target,key)=>target[key]??(()=>{})});
 drawBoard(ctx,scene,new Set(),0);assert(labels.includes('時計なし'));assert(!labels.includes('28s'));
});

test('pending requests approach for three game seconds and queue by arrival, independent of validity', () => {
  const shift = new Shift(), board = new BoardState(); shift.start();
  assert.equal(board.update(shift).nodes[0].phase, 'approach');
  shift.advance(1.5);
  assert.ok(board.update(shift).nodes[0].x > 3 && board.update(shift).nodes[0].x < 40);
  shift.advance(9.5);
  const scene = board.update(shift);
  assert.deepEqual(scene.nodes.map(n => [n.id, n.x, n.phase]), [[1, 40, 'waiting'], [2, 32, 'waiting']]);
  assert.equal(shift.requests[0].valid, false);
  assert.equal(shift.requests[1].valid, true);
  const filtered = board.update(shift, { filter: 'share', selectedId: 2 });
  assert.deepEqual(filtered.nodes.map(n => n.id), [1, 2]);
  assert.equal(filtered.nodes[0].dimmed, true);
  assert.equal(hitTest(filtered, 32, 30), 2);
  assert.equal(filtered.nodes[1].selected, true);
});

test('deciding a later request preserves IDs and animates just that request through the gate', () => {
  const shift = new Shift(), board = new BoardState(); shift.start(); shift.advance(11);
  board.update(shift); shift.decide(2, true);
  const scene = board.update(shift);
  assert.equal(scene.nodes.find(n => n.id === 1).phase, 'waiting');
  assert.equal(scene.nodes.find(n => n.id === 2).phase, 'accepted');
  shift.advance(.5);
  assert.ok(board.update(shift).nodes.find(n => n.id === 2).x > 48);
  assert.equal(shift.threatFields.size, 0);
});

test('queue closes the gap over .25 game seconds, with no teleport on a decision', () => {
  const shift = new Shift(), board = new BoardState(); shift.start(); shift.advance(11);
  board.update(shift); shift.decide(1, false);
  assert.equal(board.update(shift).nodes.find(n => n.id === 2).x, 32);
  shift.advance(.125);
  assert.ok(board.update(shift).nodes.find(n => n.id === 2).x > 32);
  shift.advance(.125);
  assert.equal(board.update(shift).nodes.find(n => n.id === 2).x, 40);
  assert.equal(shift.threatFields.size, 0);
});

test('wrong approval and timeout create red intrusion from the same ID inside the 48×60 home', () => {
  for (const timeout of [false, true]) {
    const shift = new Shift(), board = new BoardState(); shift.start(); board.update(shift);
    if (timeout) shift.advance(28.1); else shift.decide(1, true);
    const scene = board.update(shift), node = scene.nodes.find(n => n.id === 1);
    assert.equal(node.phase, 'intrusion');
    assert.equal(scene.threats.get(node.id).w, 48);
    assert.equal(scene.threats.get(node.id).h, 60);
    assert.ok(shift.data < 100);
    assert.ok([...scene.threats.get(1).cells].every(n => n >= 0 && n < 48 * 60));
  }
});

test('home coordinates preserve replication at generations 12 and 36, including the mirrored seed', () => {
  for (const type of ['auth', 'share']) {
    const field = new ThreatField(type, 48, 60, HOME_ORIGINS[type]);
    assert.equal(field.cells.size, 12);
    field.advance(2); assert.equal(field.generation, 12); assert.equal(field.cells.size, 24);
    field.advance(4); assert.equal(field.generation, 36); assert.equal(field.cells.size, 48);
    assert.ok([...field.cells].every(n => n >= 0 && n < 48 * 60));
  }
});

test('rejection and false rejection stay outside; existing unrelated intrusion remains', () => {
  const shift = new Shift(), board = new BoardState(); shift.start(); board.update(shift);
  shift.decide(1, true); shift.advance(7.1); board.update(shift); shift.decide(2, false);
  const node = board.update(shift).nodes.find(n => n.id === 2);
  assert.equal(node.phase, 'rejected');
  assert.ok(node.x < 48);
  assert.equal(shift.threatFields.size, 1);
  assert.equal(shift.trust, 92);
});

test('pause freezes positions; isolation freezes only its red layer and extends deadlines', () => {
  const shift = new Shift(), board = new BoardState(); shift.start(); board.update(shift);
  shift.advance(1); const before = board.update(shift).nodes[0];
  shift.running = false; shift.advance(5);
  assert.deepEqual(board.update(shift).nodes[0], before);
  shift.running = true; shift.decide(1, true); shift.quarantine('auth');
  const generation = shift.threatFields.get(1).generation;
  shift.advance(7.2);
  assert.equal(shift.threatFields.get(1).generation, generation);
  assert.equal(board.update(shift).nodes.find(n => n.id === 2).phase, 'approach');
});

test('repair clears its layer and new blocked requests skip the queue', () => {
  const shift = new Shift(), board = new BoardState(); shift.start(); board.update(shift);
  shift.decide(1, true); shift.repair('auth'); shift.advance(10.1);
  assert.equal(board.update(shift).threats.get(1).cells.size, 0);
  assert.ok(shift.data < 94);
  shift.advance(46.1);
  const request = shift.requests.find(r => r.type === 'auth' && r.status === 'auto');
  assert.ok(request);
  const node = board.update(shift).nodes.find(n => n.id === request.id);
  assert.equal(node.phase, 'rejected');
  assert.equal(node.auto, true);
  assert.ok(node.x < 48);
});

test('overflow keeps the first five and filtering does not remove any queued ID', () => {
  const shift = new Shift(); shift.start();
  shift.requests = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, type: 'auth', status: 'pending', at: i, deadline: 100 }));
  shift.time = 10;
  const scene = new BoardState().update(shift, { filter: 'share' });
  assert.equal(scene.nodes.length, 7);
  assert.equal(scene.nodes.filter(n => n.visible).length, 5);
  assert.equal(scene.overflow, 2);
});

test('reduced motion snaps to state and hit coordinates match the canvas', () => {
  const shift = new Shift(); shift.start();
  assert.equal(new BoardState().update(shift, { reducedMotion: true }).nodes[0].x, 40);
  assert.deepEqual(boardPoint(40 / 96, .5), { x: 40, y: 30 });
});

test('new Shift drops old movement and threats even when request IDs are reused', () => {
  const board = new BoardState(), first = new Shift(); first.start(); board.update(first);
  first.decide(1, true); first.advance(2); board.update(first);
  const second = new Shift(); assert.equal(board.update(second).nodes.length, 0);
  second.start(); const scene = board.update(second);
  assert.equal(scene.nodes[0].x, 4);
  assert.equal(scene.nodes[0].phase, 'approach');
  assert.equal(scene.threats.size, 0);
});
