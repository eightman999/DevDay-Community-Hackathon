import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../dist/js/engine.mjs';
import { buildCoachingReport } from '../dist/js/coaching.mjs';

test('未学習を架空の拍に変換せず、注釈メタデータの制約内に収める', () => {
  const game = createGame(); game.start(); game.update(6300);
  const state = game.snapshot();
  const before = JSON.stringify(state);
  const report = buildCoachingReport(state);
  assert.match(report.metadata.player, /未学習/);
  assert.match(report.metadata.scan, /スキャン中/);
  assert.equal(Object.keys(report.metadata).length, 6);
  for (const value of Object.values(report.metadata)) assert.ok(value.length <= 256);
  assert.ok(Buffer.byteLength(JSON.stringify(report.metadata)) <= 2048);
  assert.equal(JSON.stringify(state), before);
});

test('周期が同じでも半拍ずれた状態を区別する', () => {
  const game = createGame(); game.start();
  const state = game.snapshot();
  state.player.periodMs = 900; state.player.anchorMs = 450;
  const report = buildCoachingReport(state);
  assert.match(report.metadata.rhythm, /周期誤差0.0%/);
  assert.match(report.metadata.rhythm, /位相差50.0%/);
});

test('一致・結果・累計の記録がエンジンの実データに従う', () => {
  const game = createGame(); game.start(); game.update(900); game.tap(); game.update(900); game.tap();
  assert.match(buildCoachingReport(game.snapshot()).metadata.rhythm, /判定一致/);
  game.update(90000);
  const state = game.snapshot();
  assert.equal(state.phase, 'lost');
  const report = buildCoachingReport(state);
  assert.match(report.metadata.moment, /lost/);
  assert.ok(report.metadata.exposure.includes(`${Math.round(state.stats.rhythmMismatchMs)}ms`));
});
