import {SHIFT_SECONDS,ARRIVAL_INTERVALS,LOCAL_INTERVAL} from './timing.mjs';
// CSV-backed, deterministic rules shared by the browser and the API boundary.
import {INCIDENTS, ORDER, TYPES, evaluatePolicy} from './catalog.mjs';

const RECENT_LIMIT = 24;
const STATUSES = ['allow', 'deny', 'timeout', 'auto'];
const valid = incident => evaluatePolicy(incident, TYPES);

export function enemyCandidateIds(turn) {
  // Preserve the familiar first communication. Later choices adapt to defenses.
  if (turn.round === 0 && (valid(INCIDENTS[0]) || !Object.values(turn.zones[INCIDENTS[0].type]).some(Boolean))) return [INCIDENTS[0].id];
  const normal = INCIDENTS.filter(valid);
  const attacks = INCIDENTS.filter(r => !valid(r) && !Object.values(turn.zones[r.type]).some(Boolean));
  const candidates = turn.round % 3 === 1 || !attacks.length ? normal : attacks;
  // A CSV containing only one verdict still produces a bounded, playable shift.
  return (candidates.length ? candidates : INCIDENTS.filter(r => valid(r) || !Object.values(turn.zones[r.type]).some(Boolean))).map(r => r.id);
}

export function buildEnemyTurn(shift) {
  const turn = {
    round: shift.serial,
    time: Math.round(shift.time * 1000) / 1000,
    zones: Object.fromEntries(ORDER.map(type => {
      const z = shift.zones[type];
      return [type, {fixed: z.fixed, repairing: z.repairEnd > shift.time, quarantined: z.quarantineUntil > shift.time}];
    })),
    recent: shift.record.slice(-RECENT_LIMIT).map(r => ({type: r.type, status: r.status, valid: evaluatePolicy(r, TYPES)}))
  };
  return {...turn, candidateIds: enemyCandidateIds(turn)};
}

export function normalizeEnemyTurn(raw) {
  const fail = () => { throw new Error('Invalid enemy observation'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
  if (!Number.isInteger(raw.round) || raw.round < 0 || raw.round >= INCIDENTS.length) fail();
  if (!Number.isFinite(raw.time) || raw.time < 0 || raw.time > SHIFT_SECONDS) fail();
  if (!raw.zones || typeof raw.zones !== 'object' || Array.isArray(raw.zones)) fail();
  const zones = Object.fromEntries(ORDER.map(type => {
    const z = raw.zones[type];
    if (!z || ['fixed', 'repairing', 'quarantined'].some(key => typeof z[key] !== 'boolean')) fail();
    return [type, {fixed: z.fixed, repairing: z.repairing, quarantined: z.quarantined}];
  }));
  if (!Array.isArray(raw.recent) || raw.recent.length > RECENT_LIMIT) fail();
  const recent = raw.recent.map(r => {
    if (!r || !ORDER.includes(r.type) || !STATUSES.includes(r.status) || typeof r.valid !== 'boolean') fail();
    return {type: r.type, status: r.status, valid: r.valid};
  });
  // Do not trust browser-supplied candidates: derive them again from the CSV.
  const turn = {round: raw.round, time: raw.time, zones, recent};
  return {...turn, candidateIds: enemyCandidateIds(turn)};
}

export function chooseLocal(turn) {
  const candidates = enemyCandidateIds(turn);
  if (!candidates.length) return null;
  const latest = turn.recent.at(-1);
  const scores = Object.fromEntries(ORDER.map(type => [type, 10]));
  for (const [index, r] of turn.recent.entries()) {
    const recency = (index + 1) / turn.recent.length;
    if (!r.valid) scores[r.type] += (r.status === 'allow' || r.status === 'timeout' ? 8 : -7) * recency;
    else if (r.status === 'deny') scores[r.type] += 2 * recency;
  }
  if (latest) scores[latest.type] -= 10;
  // Round-based tie breaking alternates routes without requiring network randomness.
  const rotation = [...candidates.slice(turn.round % candidates.length), ...candidates.slice(0, turn.round % candidates.length)];
  return rotation.reduce((best, id) => scores[INCIDENTS[id - 1].type] > scores[INCIDENTS[best - 1].type] ? id : best, rotation[0]);
}

// A single bounded choice ties the communication, following interval and tactic together.
// Normal traffic remains available even when every attack route is protected.
export function enemyActions(turn) {
  const legal = INCIDENTS.filter(row => valid(row) || !Object.values(turn.zones[row.type]).some(Boolean));
  const normal = legal.filter(valid);
  const attacks = legal.filter(row => !valid(row));
  const latest = turn.recent.at(-1)?.type;
  const missed = [...turn.recent].reverse().find(r => !r.valid && ['allow', 'timeout'].includes(r.status))?.type;
  const switching = attacks.filter(row => row.type !== latest);
  const pressure = attacks.filter(row => row.type === missed);
  const groups = {
    feint: normal,
    switch: switching.length ? switching : attacks,
    pressure: pressure.length ? pressure : attacks
  };
  return Object.entries(groups).flatMap(([tactic, rows]) => rows.flatMap(row => ARRIVAL_INTERVALS.map(interval => ({
    value: `action_${row.id}_${interval}_${tactic}`, id: row.id, interval, tactic
  }))));
}

export function validEnemyAction(turn, action) {
  if (!action) return false;
  if (action.source === 'local') return (action.id === null && !turn.candidateIds.length || turn.candidateIds.includes(action.id)) &&
    (action.interval === undefined || action.interval === LOCAL_INTERVAL) && (action.tactic === undefined || action.tactic === 'local');
  return enemyActions(turn).some(item => item.id === action.id && item.interval === action.interval && item.tactic === action.tactic);
}
