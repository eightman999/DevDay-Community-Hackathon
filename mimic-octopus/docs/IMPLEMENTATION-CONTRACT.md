# Shared implementation contract

This file is a temporary technical coordination note and can be retained as architecture documentation.

- Static, buildless ES modules served from `dist/`.
- Three.js is vendored at `dist/vendor/three.module.js`; renderer imports `../vendor/three.module.js`.
- Engine owner: `dist/js/engine.mjs`, `tests/engine.test.mjs`.
- Scene owner: `dist/js/scene.js` plus any renderer-only modules.
- Root owns `dist/index.html`, `dist/styles.css`, `dist/js/app.js`, `scripts/`, package config, publication, integration.
- Documentation owner: README.md, AGENTS.md, docs/GAME-DESIGN.md, docs/ART-DIRECTION.md, docs/CODEX-HANDOFF.md. Do not edit this contract.

## Game API

`engine.mjs` exports `createGame(options = {})`, `COLORS`, `SHAPES`, `DURATION_MS`.

COLORS is an array of objects `{id, name, hex}`: gold/yellow, cyan/blue, violet/purple, coral/pink.
SHAPES is an array of objects `{id,name}`: round, square, capsule.
createGame returns `{start, update, setColor, setShape, tap, pause, resume, reset, snapshot}`.
`update(dtMs)` advances simulation only in playing phase. `tap()` uses simulation elapsed time. start resets and plays. reset returns ready.

`snapshot()` returns a plain independent object:
```
{
 phase: 'ready'|'playing'|'paused'|'won'|'lost',
 elapsedMs, remainingMs, suspicion, score, scansSurvived,
 target: {color, shape, periodMs, anchorMs},
 previousTarget: {color, shape, periodMs, anchorMs},
 player: {color, shape, periodMs, anchorMs},
 match: {color:boolean,shape:boolean,rhythm:boolean,rhythmError:number},
 scan: {active:boolean, progress:0..1, nextInMs},
 environment: {index, changedAtMs, nextInMs, changes:string[],label:string},
 rhythm: {pending:boolean,lastTapMs:number|null,message:string,feedback:'idle'|'listening'|'good'|'off'|'invalid'},
 result: null|{reason:string,dominantMismatch:string,rank:string},
 stats: {colorMismatchMs,shapeMismatchMs,rhythmMismatchMs}
}
```
Initial target gold/square/period 900ms. Starting player gold/square with periodMs null until learned. Up to 90 seconds; deterministic authored environment changes; irregular stages only change 1–2 traits, climactic change all3. Two taps learn a repeating period + phase; allow forgiving phase and tempo tolerance, not exact equality. A good automatic period continues without tapping until the target changes. Damage during scans, recovery while matching. No-input play must eventually lose; correct play must be able to win. Pause must freeze all clocks. Long updates should be processed deterministically rather than skip state transitions.

## Scene API

`scene.js` exports `createScene({canvas, quality = 'auto'})` returning `{render,resize,dispose}`.
`render(snapshot, deltaSeconds, {reducedMotion = false} = {})` renders from snapshot. Use only this passed state, no game mutations. `resize(width,height)` accepts CSS pixels. Return object may expose `renderer` for diagnostics.
The canvas must show real 3D: cute original cream/cocoa striped mimic-octopus, expressive eyes, 8 flexible arms, continuously morphing mantle between rounded circle/square/capsule, nearby marching/beat-bouncing data icons, a drone, a soft pastel layered digital plaza, a visible environmental update wave and scan beam. Protagonist central and large with all critical elements fitting portrait + landscape. Preserve the pastel cream/cyan/gold art direction from dist/assets/concept-gameplay.svg.
```
const scene = createScene({canvas});
scene.resize(width,height);
scene.render(game.snapshot(),dt);
```
