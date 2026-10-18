// CSV-backed boundaries; local selection is reproducible within a seeded run.
import {INCIDENTS, ORDER, TYPES, evaluatePolicy} from './catalog.mjs';

const RECENT_LIMIT = 24;
const STATUSES = ['allow', 'deny', 'timeout', 'auto'];
const valid = incident => evaluatePolicy(incident, TYPES);

export function enemyCandidateIds(turn) {
  // Preserve the familiar first communication. Later choices adapt to defenses.
  if (turn.round === 0 && (valid(INCIDENTS[0]) || !Object.values(turn.zones[INCIDENTS[0].type]).some(Boolean))) return [INCIDENTS[0].id];
  const normal = INCIDENTS.filter(valid);
  const attacks = INCIDENTS.filter(r => !valid(r) && !Object.values(turn.zones[r.type]).some(Boolean));
  // Never reveal the verdict through the round number. The API can choose either
  // class; defenses exclude malicious candidates only, not needed normal work.
  return [...normal, ...attacks].sort((a,b)=>a.id-b.id).map(r=>r.id);
}

export function buildEnemyTurn(shift) {
  const turn = {
    round: shift.serial,
    seed: shift.seed ?? 0,
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
  const seed = raw.seed ?? 0;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail();
  if (!Number.isFinite(raw.time) || raw.time < 0 || raw.time > 120) fail();
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
  const turn = {round: raw.round, seed, time: raw.time, zones, recent};
  return {...turn, candidateIds: enemyCandidateIds(turn)};
}

export function chooseLocal(turn) {
  let candidates = enemyCandidateIds(turn);
  if (!candidates.length) return null;
  // Per-run entropy removes the ID-only answer key without changing scoring.
  let entropy = ((turn.seed ?? 0) ^ Math.imul(turn.round + 1, 0x9e3779b9)) >>> 0;
  entropy = Math.imul(entropy ^ (entropy >>> 16), 0x85ebca6b);
  entropy = Math.imul(entropy ^ (entropy >>> 13), 0xc2b2ae35);
  entropy ^= entropy >>> 16;
  const preferNormal = (entropy >>> 0) / 0x100000000 < .45;
  const preferred = candidates.filter(id=>valid(INCIDENTS[id-1])===preferNormal);
  if (turn.round > 0 && preferred.length) candidates = preferred;
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
