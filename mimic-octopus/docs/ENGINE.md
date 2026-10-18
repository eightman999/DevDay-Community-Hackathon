# Game engine integration

`dist/js/engine.mjs` is dependency-free and has no DOM or renderer knowledge. Its public
API and snapshot follow `IMPLEMENTATION-CONTRACT.md`.

## Clock and state

- `createGame()` starts in `ready`; `start()` starts a fresh 90-second game.
- `update(dtMs)` consumes finite positive milliseconds in deterministic 10 ms ticks.
  Fractional frame time is carried forward; a long call still visits every stage and scan.
- `pause()` freezes the simulation and all inputs, including the interval between taps.
  `resume()` continues; `reset()` returns a clean `ready` snapshot.
- `start`, `reset`, and `update` return independent snapshots. Control methods return a
  boolean indicating whether the input was accepted. A valid but off-beat pair is accepted
  and reports `rhythm.feedback = 'off'`.
- All values returned by `snapshot()` are independent of internal state. Frozen `COLORS`
  and `SHAPES` provide the IDs and Japanese labels for controls.

## Rhythm

The first tap starts a pair. The second tap learns an interval and first-tap phase.
Intervals of 260–1,800 ms are accepted; a pair expires after 1,800 ms. Accidental double
taps and expired pairs preserve an already learned automatic beat.

A measured interval within 18% of the surrounding interval locks to that interval. The
first-tap phase is retained. Matching allows a 20% cycle phase difference. Therefore a
slightly imperfect but successful pair continues to work automatically without drift;
matching the tempo while tapping halfway between beats still fails.

`player.periodMs` is `null` until the first valid pair. `anchorMs` is the beat origin on
the simulation clock; rendering can compute `((elapsedMs - anchorMs) / periodMs) % 1`.
`match.rhythmError` is a 0–1 display distance, **not** the tolerance threshold. Use
`match.rhythm` for the actual match. The public rhythm message and feedback explain
listening, success, phase error, tempo error, and invalid input.

## Authored progression

There are nine environments. Initial target: gold / square / 900 ms. Changes occur at
10.0, 19.5, 30.5, 41.0, 51.5, 62.5, 73.0, and 81.5 seconds. Early changes alter one or
two traits. The final change alters color, shape, and rhythm together. A color-only or
shape-only change preserves the rhythm phase; a changed rhythm restarts its anchor at
the environment update. Every stage gives at least 3.4 seconds before its scan.

Each environment has one scan. No mismatch damage is applied outside scans. Each second
of exposure adds 12 suspicion for wrong color, 12 for wrong shape, and 14 for wrong
rhythm. Complete matching recovers 6 suspicion per second, including during scans.
Suspicion is capped at 100, which immediately ends the game. Doing nothing loses before
the end; learning each new environment correctly can pass all nine scans with no damage.

`stats` counts mismatch milliseconds **during scans**. A survived scan awards 80 points
plus up to 120 for fully matched time; complete matching also awards 5 points per second.
Victory ranks S/A/B/C use total mismatch exposure. `result.dominantMismatch` is
`color`, `shape`, `rhythm`, or `none`; defeat has rank `RETRY`.

`scan.nextInMs` is zero during a scan and after the final scan. For an inactive scan with
zero remaining countdown, present “スキャン終了” rather than an imminent-scan cue.
Likewise `environment.nextInMs` is zero once the final environment has arrived.

## Verification

Run `node --test tests/engine.test.mjs` (or `npm test`). Tests cover actual survival and
failure paths, human timing forgiveness, phase versus tempo, invalid pairs, suspicion
and recovery, pause, reset and independent snapshots, and equivalent results at 30/60/
144 FPS as well as large and irregular updates.
