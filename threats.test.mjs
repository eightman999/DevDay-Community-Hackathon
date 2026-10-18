import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INCIDENTS, parseCsv, evaluatePolicy, TYPES} from './dist/catalog.mjs';
import {THREATS, parseThreats, makeInspection, inspectionVerdict, inspectionReason, inspectionChecks, TRANSFER_LIMITS} from './dist/threats.mjs';

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

test('inspection verdict requires six complete checks and rejects unknown or broken findings', () => {
  for (const row of THREATS) {
    const safe = {...makeInspection(INCIDENTS.find(r=>r.type===row.route&&evaluatePolicy(r,TYPES))), patternId: row.id, a: row.safeA, b: row.safeB};
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

test('each of the six checks can independently block otherwise valid evidence', () => {
  const safe = makeInspection(INCIDENTS.find(r=>r.type==='share'&&evaluatePolicy(r,TYPES)));
  const pattern = THREATS.find(p=>p.id===safe.patternId);
  const cases = [
    ['a', {a:pattern.attackA}], ['b', {b:pattern.attackB}],
    ['identity', {credentialSubject:'JOB-99'}],
    ['permission', {role:'閲覧担当', operation:'更新'}],
    ['handling', {classification:'院内情報',destination:'外部'}],
    ['capacity', {expandedMB:TRANSFER_LIMITS.share+1}]
  ];
  for (const [key, change] of cases) {
    const inspection = {...safe,...change};
    assert.deepEqual(inspectionChecks(inspection).filter(c=>!c.passed).map(c=>c.key),[key]);
    assert.equal(inspectionVerdict(inspection),false);
    assert.match(inspectionReason(inspection),/^拒否/);
  }
});

test('role permissions require the actual operation and allow different valid combinations', () => {
  const safe = makeInspection(INCIDENTS.find(r=>evaluatePolicy(r,TYPES)));
  for(const [role, operation, expected] of [['診療担当','更新',true],['診療担当','転送',false],['連携担当','転送',true],['連携担当','更新',false],['閲覧担当','参照',true],['閲覧担当','更新',false],['toString','参照',false]]) {
    assert.equal(inspectionVerdict({...safe,role,operation}),expected,`${role}/${operation}`);
  }
});

test('transfer decisions combine data classification, destination, anonymization and approval', () => {
  const safe=makeInspection(INCIDENTS.find(r=>evaluatePolicy(r,TYPES)));
  for(const [classification,destination,anonymized,approval,expected] of [
    ['公開資料','外部',false,false,true],['院内情報','院内',false,false,true],
    ['院内情報','外部',true,true,false],['診療情報','院内',false,false,true],
    ['診療情報','契約先',true,true,true],['診療情報','契約先',true,false,false],
    ['診療情報','契約先',false,true,false],['診療情報','外部',true,true,false],
    ['unknown','院内',true,true,false],['公開資料','unknown',true,true,false]
  ]) assert.equal(inspectionVerdict({...safe,classification,destination,anonymized,approval}),expected,`${classification}/${destination}/${anonymized}/${approval}`);
});

test('processing capacity checks exact route limits and rejects missing or nonnumeric evidence', () => {
  for(const pattern of THREATS){
    const safe={...makeInspection(INCIDENTS.find(r=>r.type===pattern.route&&evaluatePolicy(r,TYPES))),patternId:pattern.id,a:pattern.safeA,b:pattern.safeB};
    const limit=TRANSFER_LIMITS[pattern.route];
    for(const [expandedMB,expected] of [[0,true],[limit,true],[limit+1,false],[-1,false],[1.5,false],['10',false],[NaN,false],[Infinity,false],[undefined,false]]) assert.equal(inspectionVerdict({...safe,expandedMB}),expected);
    for(const field of ['actor','credentialSubject','role','operation','classification','destination','anonymized','approval']){const broken={...safe};delete broken[field];assert.equal(inspectionVerdict(broken),false,field);}
    assert.equal(inspectionVerdict({patternId:pattern.id,a:pattern.safeA,b:pattern.safeB}),false);
  }
});

test('generated malicious communications mix valid controls with every single-check failure', () => {
  const failures=new Set();
  for(let round=0;round<96;round++) for(const request of INCIDENTS){
    const inspection=makeInspection(request,round),checks=inspectionChecks(inspection);
    assert.equal(checks.length,6);
    const failed=checks.filter(c=>!c.passed);
    assert.equal(failed.length,evaluatePolicy(request,TYPES)?0:1);
    failed.forEach(c=>failures.add(c.key));
    assert.deepEqual(makeInspection(request,round),inspection);
  }
  assert.deepEqual(failures,new Set(['a','b','identity','permission','handling','capacity']));
});

test('all 11 patterns occur in one fixed CSV-order shift of 16 communications', () => {
  const inspections = INCIDENTS.map((request, round) => makeInspection(request, round));
  assert.deepEqual(new Set(inspections.map(row => row.patternId)), new Set(THREATS.map(row => row.id)));
  assert.equal(inspections[0].patternId, 'smb_v1');
  for (const [round, inspection] of inspections.entries()) {
    assert.equal(inspectionVerdict(inspection), evaluatePolicy(INCIDENTS[round], TYPES));
  }
  assert.deepEqual(new Set(inspections.flatMap(i=>inspectionChecks(i).filter(c=>!c.passed).map(c=>c.key))),new Set(['a','b','identity','permission','handling','capacity']));
  assert.ok(inspections.some(i=>inspectionVerdict(i)&&i.classification==='診療情報'&&i.destination==='契約先'));
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
