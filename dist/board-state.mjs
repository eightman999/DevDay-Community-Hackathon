// Translate engine state into a read-only scene. Animation never changes a verdict.
import { HOME_ORIGINS } from './automata.mjs';

export const BOARD = { width: 96, height: 60, boundary: 48, gateY: 30 };
const mix = (a, b, t) => a + (b - a) * t;
const clamp = n => Math.max(0, Math.min(1, n));
const ease = t => t * t * (3 - 2 * t);

function position(entry, time, reducedMotion) {
  const t = reducedMotion ? 1 : ease(clamp((time - entry.moveAt) / entry.duration));
  return { x: mix(entry.fromX, entry.toX, t), y: mix(entry.fromY, entry.toY, t) };
}

export class BoardState {
  constructor() { this.reset(); }

  reset() {
    this.shift = null;
    this.entries = new Map();
  }

  update(shift, { selectedId = null, filter = null, reducedMotion = false } = {}) {
    if (this.shift !== shift) { this.reset(); this.shift = shift; }
    const time = shift.time;
    // Filtering only changes emphasis, never the common queue or its order.
    const pending = shift.requests.filter(r => r.status === 'pending')
      .sort((a, b) => a.at - b.at || a.id - b.id);
    const ranks = new Map(pending.map((r, i) => [r.id, i]));
    const remaining = pending.length ? Math.min(...pending.map(r => r.deadline - time)) : 6;
    const waitingUrgency = ease(clamp((6 - remaining) / 6));
    const nodes = [];

    for (const request of shift.requests) {
      const rank = ranks.get(request.id);
      const targetX = Math.max(6, 40 - (rank ?? 0) * 8);
      let entry = this.entries.get(request.id);
      if (!entry) {
        const recent = request.status === 'pending' && time - request.at < 3;
        entry = {
          status: request.status, fromX: recent ? 4 : targetX, fromY: 30,
          toX: targetX, toY: 30, moveAt: request.at, duration: 3,
        };
        // A restored snapshot shows the current state, without replaying old arrivals.
        if (request.status !== 'pending') {
          entry.fromX = entry.toX = 46;
          entry.phaseAt = request.decisionAt ?? request.at;
        }
        this.entries.set(request.id, entry);
      }

      if (entry.status !== request.status) {
        const from = position(entry, time, reducedMotion);
        entry.fromX = from.x;
        entry.fromY = from.y;
        entry.status = request.status;
        entry.phaseAt = request.decisionAt ?? request.at;
      }

      if (request.status === 'pending') {
        if (entry.toX !== targetX) {
          const from = position(entry, time, reducedMotion);
          entry.fromX = from.x; entry.fromY = from.y;
          entry.toX = targetX; entry.moveAt = time;
          entry.duration = time - request.at < 3 ? Math.max(.25, 3 - (time - request.at)) : .25;
        }
        const p = position(entry, time, reducedMotion || shift.practice);
        nodes.push({ id: request.id, type: request.type, ...p,
          phase: time - request.at < 3 && !reducedMotion && !shift.practice ? 'approach' : 'waiting',
          untimed: !!shift.practice,
          remaining: Math.max(0, Math.ceil(request.deadline - time)),
          selected: selectedId === request.id, dimmed: !!filter && filter !== request.type,
          visible: rank < 5,
        });
        continue;
      }

      const phaseAt = entry.phaseAt ?? request.decisionAt ?? request.at;
      const elapsed = time - phaseAt;
      if (elapsed >= 1.1) continue;
      const passed = request.status === 'allow' || request.status === 'timeout';
      // The answer key is read only AFTER a decision, never for a pending color.
      const phase = passed ? (request.valid ? 'accepted' : 'intrusion') : 'rejected';
      const t = reducedMotion ? 1 : ease(clamp(elapsed / .8));
      const [originX, originY] = HOME_ORIGINS[request.type];
      let p;
      if (passed) {
        p = t < .55
          ? { x: mix(entry.fromX, 48, t / .55), y: mix(entry.fromY, 30, t / .55) }
          : { x: mix(48, 48 + originX, (t - .55) / .45), y: mix(30, originY + 2, (t - .55) / .45) };
      } else {
        p = { x: mix(entry.fromX, Math.max(3, entry.fromX - 9), t), y: mix(entry.fromY, 39, t) };
      }
      nodes.push({ id: request.id, type: request.type, ...p, phase,
        selected: selectedId === request.id, dimmed: false, visible: true,
        auto: request.status === 'auto', opacity: elapsed < .8 ? 1 : 1 - (elapsed - .8) / .3,
        trail: passed ? [{ x: entry.fromX, y: entry.fromY }, { x: 48, y: 30 }, { x: 48 + originX, y: originY + 2 }] : [],
      });
    }

    return {
      time, started: shift.started, running: shift.running, done: shift.done,
      nodes, overflow: Math.max(0, pending.length - 5), selectedId, filter, waitingUrgency,
      zones: shift.zones, threats: shift.threatFields, reducedMotion,
      attacks: Object.values(shift.zones).reduce((sum, z) => sum + z.attacks, 0),
    };
  }
}

export function hitTest(scene, x, y) {
  return scene.nodes.find(n => n.visible && (n.phase === 'approach' || n.phase === 'waiting')
    && Math.abs(n.x - x) <= 3.8 && Math.abs(n.y - y) <= 7.5)?.id ?? null;
}

export function boardPoint(x, y) {
  return { x: x * BOARD.width, y: y * BOARD.height };
}
