import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, COLORS, SHAPES, DURATION_MS } from '../dist/js/engine.mjs';

function startGame() {
  const game = createGame();
  game.start();
  return game;
}

function advance(game, durationMs, frameMs = durationMs) {
  let remaining = durationMs;
  while (remaining > 1e-7) {
    const delta = Math.min(frameMs, remaining);
    game.update(delta);
    remaining -= delta;
  }
}

function followEnvironment(game, frameMs) {
  const visitedStages = [];
  while (game.snapshot().phase === 'playing') {
    let state = game.snapshot();
    visitedStages.push({
      index: state.environment.index,
      changes: state.environment.changes,
      reactionMs: state.scan.nextInMs,
      periodMs: state.target.periodMs,
    });
    game.setColor(state.target.color);
    game.setShape(state.target.shape);
    if (!game.snapshot().match.rhythm) {
      const { periodMs, anchorMs } = state.target;
      const nextBeatMs = anchorMs + Math.ceil((state.elapsedMs - anchorMs) / periodMs) * periodMs;
      advance(game, nextBeatMs - state.elapsedMs, frameMs);
      game.tap();
      advance(game, periodMs, frameMs);
      game.tap();
      assert.equal(game.snapshot().match.rhythm, true, 'observed beat can be learned');
    }
    state = game.snapshot();
    const nextChangeInMs = state.environment.nextInMs;
    advance(game, nextChangeInMs || state.remainingMs, frameMs);
  }
  return { state: game.snapshot(), visitedStages };
}

test('starts ready, with the three traits and no pre-learned rhythm', () => {
  const game = createGame();
  const before = game.snapshot();
  assert.equal(COLORS.length, 4);
  assert.equal(SHAPES.length, 3);
  assert.equal(DURATION_MS, 90_000);
  assert.equal(before.phase, 'ready');
  assert.deepEqual(before.target, { color: 'gold', shape: 'square', periodMs: 900, anchorMs: 0 });
  assert.equal(before.player.periodMs, null);
  assert.equal(before.match.rhythm, false);
  game.update(20_000);
  assert.deepEqual(game.snapshot(), before, 'ready time does not advance');
});

test('two taps teach a persistent automatic rhythm; one tap does not', () => {
  const game = startGame();
  assert.equal(game.tap(), true);
  assert.equal(game.snapshot().rhythm.pending, true);
  assert.equal(game.snapshot().player.periodMs, null);
  game.update(900);
  assert.equal(game.tap(), true);
  const learned = game.snapshot();
  assert.equal(learned.rhythm.pending, false);
  assert.equal(learned.rhythm.feedback, 'good');
  assert.equal(learned.player.periodMs, 900);
  game.update(17_000);
  assert.equal(game.snapshot().match.rhythm, true, 'automatic rhythm persists across color-only updates');
});

test('slightly inaccurate human timing is accepted without accumulating tempo drift', () => {
  const game = startGame();
  game.update(90);
  game.tap();
  game.update(990);
  game.tap();
  assert.equal(game.snapshot().match.rhythm, true);
  assert.equal(game.snapshot().player.periodMs, 900, 'nearby tempo is locked to the surrounding beat');
  assert.equal(game.snapshot().player.anchorMs, 90, 'the actual first-tap phase is preserved');
  game.update(17_000);
  assert.equal(game.snapshot().match.rhythm, true);
});

test('correct tempo at the wrong phase is different from the wrong tempo', () => {
  const phaseError = startGame();
  phaseError.update(450);
  phaseError.tap();
  phaseError.update(900);
  phaseError.tap();
  assert.equal(phaseError.snapshot().player.periodMs, 900);
  assert.equal(phaseError.snapshot().match.rhythm, false);
  assert.match(phaseError.snapshot().rhythm.message, /タイミング/);

  const tempoError = startGame();
  tempoError.tap();
  tempoError.update(450);
  tempoError.tap();
  assert.equal(tempoError.snapshot().player.periodMs, 450);
  assert.equal(tempoError.snapshot().match.rhythm, false);
  assert.match(tempoError.snapshot().rhythm.message, /速さ/);
});

test('accidental double taps and an expired first tap cannot create a rhythm', () => {
  const game = startGame();
  game.tap();
  game.update(100);
  assert.equal(game.tap(), false);
  assert.equal(game.snapshot().rhythm.feedback, 'invalid');
  assert.equal(game.snapshot().player.periodMs, null);
  game.tap();
  game.update(1_810);
  assert.equal(game.snapshot().rhythm.pending, false);
  assert.equal(game.snapshot().rhythm.feedback, 'invalid');
  assert.equal(game.snapshot().player.periodMs, null);
  game.tap();
  assert.equal(game.snapshot().rhythm.pending, true, 'the next tap starts a new pair');
});

test('invalid re-tapping preserves a previously learned automatic beat', () => {
  const game = startGame();
  game.tap();
  game.update(900);
  game.tap();
  const learned = game.snapshot().player;
  game.tap();
  game.update(100);
  game.tap();
  assert.deepEqual(game.snapshot().player, learned);
  assert.equal(game.snapshot().match.rhythm, true);
});

test('scan damage has a reaction window, and matching allows recovery', () => {
  const game = startGame();
  const initial = game.snapshot();
  game.update(initial.scan.nextInMs);
  assert.equal(game.snapshot().scan.active, true);
  assert.equal(game.snapshot().suspicion, 0, 'mismatches before the scan do no damage');
  game.update(500);
  assert.ok(game.snapshot().suspicion > 0);
  const { periodMs, anchorMs } = game.snapshot().target;
  const nextBeatMs = anchorMs + Math.ceil((game.snapshot().elapsedMs - anchorMs) / periodMs) * periodMs;
  game.update(nextBeatMs - game.snapshot().elapsedMs);
  game.tap();
  game.update(periodMs);
  game.tap();
  const danger = game.snapshot().suspicion;
  game.update(1_000);
  assert.ok(game.snapshot().suspicion < danger, 'successful correction reduces suspicion');
});

test('no-input play loses, even when one update spans the entire session', () => {
  const game = startGame();
  game.update(DURATION_MS);
  const state = game.snapshot();
  assert.equal(state.phase, 'lost');
  assert.equal(state.suspicion, 100);
  assert.ok(state.elapsedMs < DURATION_MS);
  assert.ok(state.scansSurvived >= 1);
  assert.equal(state.result.dominantMismatch, 'rhythm');
  assert.ok(state.stats.rhythmMismatchMs > state.stats.colorMismatchMs);
  game.update(DURATION_MS);
  assert.deepEqual(game.snapshot(), state, 'a result is terminal until start or reset');
});

test('matching only the visual traits cannot win without learning the beat', () => {
  const game = startGame();
  while (game.snapshot().phase === 'playing') {
    const state = game.snapshot();
    game.setColor(state.target.color);
    game.setShape(state.target.shape);
    game.update(state.environment.nextInMs || state.remainingMs);
  }
  const state = game.snapshot();
  assert.equal(state.phase, 'lost');
  assert.equal(state.stats.colorMismatchMs, 0);
  assert.equal(state.stats.shapeMismatchMs, 0);
  assert.ok(state.stats.rhythmMismatchMs > 0);
  assert.equal(state.result.dominantMismatch, 'rhythm');
});

test('correct play survives every scan and wins the authored 90-second session', () => {
  const game = startGame();
  const { state, visitedStages } = followEnvironment(game, 1_000 / 60);
  assert.equal(state.phase, 'won');
  assert.equal(state.elapsedMs, DURATION_MS);
  assert.equal(state.remainingMs, 0);
  assert.equal(state.suspicion, 0);
  assert.equal(state.scansSurvived, 9);
  assert.equal(state.result.rank, 'S');
  assert.equal(state.result.dominantMismatch, 'none');
  assert.ok(state.score > 1_800);
  assert.equal(state.scan.nextInMs, 0);
  assert.equal(visitedStages.length, 9);
  for (const stage of visitedStages) {
    assert.ok(stage.reactionMs >= stage.periodMs * 2, 'there is time to observe and learn two beats');
  }
  for (const stage of visitedStages.slice(1, -1)) {
    assert.ok(stage.changes.length >= 1 && stage.changes.length <= 2);
  }
  assert.deepEqual(new Set(visitedStages.at(-1).changes), new Set(['color', 'shape', 'rhythm']));
});

test('pause freezes stage, scan, score, danger and the time between taps', () => {
  const game = startGame();
  game.tap();
  game.update(450);
  game.pause();
  const paused = game.snapshot();
  game.update(500_000);
  assert.equal(game.tap(), false);
  assert.equal(game.setColor('coral'), false);
  assert.equal(game.setShape('round'), false);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  game.update(450);
  game.tap();
  assert.equal(game.snapshot().player.periodMs, 900);
  assert.equal(game.snapshot().match.rhythm, true);

  game.update(5_500);
  assert.equal(game.snapshot().scan.active, true);
  game.pause();
  const pausedScan = game.snapshot();
  game.update(60_000);
  assert.deepEqual(game.snapshot(), pausedScan);
});

test('large, small and irregular frame intervals give the same failure result', () => {
  const large = startGame();
  large.update(90_000);
  const small = startGame();
  advance(small, 90_000, 1_000 / 144);
  const irregular = startGame();
  const deltas = [0.7, 31, 9.9, 400, 16.67, 5_000];
  let i = 0;
  while (irregular.snapshot().phase === 'playing') irregular.update(deltas[i++ % deltas.length]);
  assert.deepEqual(small.snapshot(), large.snapshot());
  assert.deepEqual(irregular.snapshot(), large.snapshot());
});

test('successful play is also independent of rendering frame rate', () => {
  const game30 = startGame();
  const game144 = startGame();
  const gameHuge = startGame();
  const outcome30 = followEnvironment(game30, 1_000 / 30).state;
  const outcome144 = followEnvironment(game144, 1_000 / 144).state;
  const outcomeHuge = followEnvironment(gameHuge, 90_000).state;
  assert.deepEqual(outcome30, outcome144);
  assert.deepEqual(outcome30, outcomeHuge);
});

test('reset and retry clear all gameplay history; returned snapshots are independent', () => {
  const pristine = createGame().snapshot();
  const game = startGame();
  const state = game.snapshot();
  state.player.color = 'coral';
  state.target.periodMs = 1;
  state.previousTarget.shape = 'capsule';
  state.environment.changes.push('rhythm');
  state.stats.colorMismatchMs = 999;
  assert.equal(game.snapshot().player.color, 'gold');
  assert.equal(game.snapshot().target.periodMs, 900);
  assert.equal(game.snapshot().previousTarget.shape, 'square');
  assert.deepEqual(game.snapshot().environment.changes, []);
  assert.equal(game.snapshot().stats.colorMismatchMs, 0);
  game.update(90_000);
  game.reset();
  assert.deepEqual(game.snapshot(), pristine);
  game.start();
  assert.equal(game.snapshot().phase, 'playing');
  assert.equal(game.snapshot().elapsedMs, 0);
  assert.equal(game.snapshot().result, null);
  assert.equal(game.snapshot().rhythm.lastTapMs, null);
});

test('unknown controls and non-finite time cannot corrupt a playing session', () => {
  const game = startGame();
  const initial = game.snapshot();
  assert.equal(game.setColor('red'), false);
  assert.equal(game.setShape('triangle'), false);
  for (const delta of [NaN, Infinity, -1, 0, '1000']) game.update(delta);
  assert.deepEqual(game.snapshot(), initial);
});
