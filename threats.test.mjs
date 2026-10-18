import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INCIDENTS, parseCsv, evaluatePolicy, TYPES} from './dist/catalog.mjs';
import {THREATS, parseThreats, makeInspection, inspectionVerdict, inspectionReason} from './dist/threats.mjs';

const csv = await readFile(new URL('./dist/data/attack-patterns.csv', import.meta.url), 'utf8');
const encode = rows => rows.map(row => row.map(value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(',')).join('\n') + '\n';

test('all 11 CSV threat patterns are reachable and retain the original verdict for every communication', () => {
  assert.equal(THREATS.length, 11);
  const impactKinds = {smb_v1:'availability',auth_bypass:'integrity',sql_injection:'confidentiality',idor:'confidentiality',os_command:'availability',path_traversal:'confidentiality',unsafe_upload:'availability',deserialization:'availability',ssrf:'confidentiality',stored_xss:'integrity',resource_exhaustion:'availability'};
  for (const pattern of THREATS) assert.equal(pattern.impactKind, impactKinds[pattern.id]);
  const reached = new Set();
  for (let round = 0; round < 16; round++) for (const request of INCIDENTS) {
    const inspection = makeInspection(request, round);
    reached.add(inspection.patternId);
    assert.equal(THREATS.find(row => row.id === inspection.patternId).route, request.type);
    assert.equal(inspectionVerdict(inspection), evaluatePolicy(request, TYPES));
    assert.match(inspectionReason(inspection), inspectionVerdict(inspection) ? /^通過/ : /^拒否/);
  }
  assert.equal(reached.size, 11);
  assert.equal(makeInspection(INCIDENTS[0], 0).patternId, 'smb_v1');
  assert.throws(() => makeInspection({type: 'unknown'}), /Unknown inspection route/);
});

test('inspection verdict requires both exact safe tokens and rejects unknown or broken findings', () => {
  for (const row of THREATS) {
    const safe = {patternId: row.id, a: row.safeA, b: row.safeB};
    assert.equal(inspectionVerdict(safe), true);
    for (const broken of [{...safe, a: row.attackA}, {...safe, b: row.attackB}, {...safe, a: undefined}, {...safe, b: ''}, {...safe, a: ` ${row.safeA}`}, {...safe, patternId: 'unknown'}]) {
      assert.equal(inspectionVerdict(broken), false);
      assert.match(inspectionReason(broken), /^拒否/);
    }
    assert.ok(inspectionReason(safe).includes(row.fieldA));
    assert.ok(inspectionReason(safe).includes(row.fieldB));
  }
  for (const broken of [null, undefined, [], {}, 'smb_v1', 1]) {
    assert.equal(inspectionVerdict(broken), false);
    assert.match(inspectionReason(broken), /^拒否/);
  }
});

test('all 11 patterns occur in one fixed CSV-order shift of 16 communications', () => {
  const inspections = INCIDENTS.map((request, round) => makeInspection(request, round));
  assert.deepEqual(new Set(inspections.map(row => row.patternId)), new Set(THREATS.map(row => row.id)));
  assert.equal(inspections[0].patternId, 'smb_v1');
  for (const [round, inspection] of inspections.entries()) {
    assert.equal(inspectionVerdict(inspection), evaluatePolicy(INCIDENTS[round], TYPES));
  }
});

test('threat CSV validates header, rows, ids, routes, bounds, sources and distinct conditions', () => {
  assert.deepEqual(parseThreats('\uFEFF' + csv.replaceAll('\n', '\r\n')), THREATS);
  const mutated = edit => { const rows = parseCsv(csv); edit(rows); return encode(rows); };
  assert.throws(() => parseThreats(mutated(rows => rows[0][0] = 'route')), /duplicate header/);
  assert.throws(() => parseThreats(mutated(rows => rows[0][0] = 'other')), /missing column id/);
  assert.throws(() => parseThreats(mutated(rows => rows.pop())), /expected 11/);
  assert.throws(() => parseThreats(mutated(rows => rows[1].pop())), /column count/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][0] = 'unknown')), /unknown or duplicate/);
  assert.throws(() => parseThreats(mutated(rows => rows[2][0] = rows[1][0])), /unknown or duplicate/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][1] = 'unknown')), /invalid route/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][13] = 'unknown')), /invalid impactKind/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][2] = '')), /empty name/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][2] = 'x'.repeat(81))), /too long/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][3] = 'x'.repeat(301))), /too long/);
  assert.doesNotThrow(() => parseThreats(mutated(rows => rows[1][3] = 'x'.repeat(300))));
  for (const source of ['javascript:alert(1)', 'https://example.test/source', 'http://cwe.mitre.org/data/definitions/89.html']) assert.throws(() => parseThreats(mutated(rows => rows[1][6] = source)), /invalid source/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][11] = rows[1][9])), /must be distinct/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][12] = rows[1][10])), /must be distinct/);
  assert.throws(() => parseThreats(mutated(rows => rows[1][8] = rows[1][7])), /must be distinct/);
  assert.throws(() => parseThreats(mutated(rows => rows.slice(1).forEach(row => row[1] = 'auth'))), /missing route/);
});
