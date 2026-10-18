import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TYPES, ORDER, INCIDENTS, FORMS, parseCsv, parseCatalog, evaluatePolicy } from './dist/catalog.mjs';
import { expectedVerdict, verdictReason } from './dist/engine.mjs';

const [vulnerabilities, incidents] = await Promise.all([
  readFile(new URL('./dist/data/vulnerabilities.csv', import.meta.url), 'utf8'),
  readFile(new URL('./dist/data/incidents.csv', import.meta.url), 'utf8')
]);
const legacyIncidents = parseCsv(incidents).map(row => row.slice(0, 4).join(',')).join('\n') + '\n';
const encodeCsv = rows => rows.map(row => row.map(value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(',')).join('\n') + '\n';

test('CSV loader preserves all 4 policies and the 16 original requests', () => {
  assert.deepEqual(ORDER, ['auth', 'share', 'flood', 'exfil']);
  assert.equal(INCIDENTS.length, 16);
  assert.deepEqual(FORMS, [
    ['auth', false, 'AOI', 'UNKNOWN'], ['share', true, 'REN', 'REN'], ['flood', false, 'UNKNOWN', '74'], ['exfil', true, '公開資料', '外部'],
    ['share', false, 'AOI', 'UNKNOWN'], ['auth', true, 'MIKA', 'MIKA'], ['exfil', false, '社内資料', '外部'], ['flood', true, 'REN', '8'],
    ['auth', false, 'REN', 'UNKNOWN'], ['share', true, 'AOI', 'AOI'], ['flood', false, 'UNKNOWN', '92'], ['exfil', true, '社内資料', '社内'],
    ['share', false, 'MIKA', 'UNKNOWN'], ['auth', true, 'REN', 'REN'], ['exfil', false, '社内資料', '外部'], ['flood', true, 'MIKA', '12']
  ]);
  for (const [index, incident] of INCIDENTS.entries()) {
    assert.equal(incident.id, index + 1);
    assert.equal(expectedVerdict(incident), FORMS[index][1]);
    assert.equal(expectedVerdict({ ...incident, valid: !FORMS[index][1] }), FORMS[index][1]);
    assert.ok(verdictReason(incident).length > 5);
  }
  assert.equal(TYPES.flood.limit, 20);
  assert.deepEqual(ORDER.map(type => TYPES[type].name), ['受付', '電子カルテ', '検査', '予約']);
  assert.equal(expectedVerdict({type: 'flood', a: 'REN', b: '20'}), true);
  assert.equal(expectedVerdict({type: 'flood', a: 'REN', b: '21'}), false);
});

test('CSV parser handles BOM, CRLF, commas, escaped quotes and multiline values', () => {
  assert.deepEqual(parseCsv('\uFEFFid,text\r\n1,"通信,受信"\r\n2,"引用""符\r\n次行"\r\n'), [
    ['id', 'text'], ['1', '通信,受信'], ['2', '引用"符\r\n次行']
  ]);
  assert.deepEqual(parseCsv('a,b\n"",x'), [['a', 'b'], ['', 'x']]);
  assert.throws(() => parseCsv('a\n"unclosed'), /Unclosed/);
  assert.throws(() => parseCsv('a\n"closed"suffix'), /Malformed/);
  assert.throws(() => parseCsv('a\nbad"quote'), /Malformed/);
});

test('catalog rejects missing columns, duplicate ids and unknown types', () => {
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('id,type,a,b', 'id,type,a')), /missing column b/);
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('id,type,a,b', 'id,type,a,a')), /duplicate header/);
  assert.throws(() => parseCatalog(vulnerabilities + vulnerabilities.split('\n')[1] + '\n', incidents), /Duplicate vulnerability/);
  assert.throws(() => parseCatalog(vulnerabilities.replace(/^share,.*\n/m, ''), incidents), /Missing vulnerability/);
  assert.throws(() => parseCatalog(vulnerabilities.replace(/^auth,/m, 'unknown,'), incidents), /Unknown vulnerability/);
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('2,share', '1,share')), /Duplicate incident/);
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('2,share', '20,share')), /sequential/);
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('1,auth', '1,unknown')), /Unknown incident/);
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('1,auth,AOI,UNKNOWN', '1,auth,AOI')), /column count/);
  assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('1,auth,AOI,UNKNOWN', '1,auth,,UNKNOWN')), /empty a or b/);
});

test('catalog validates policy settings and integer request counts', () => {
  for (const value of ['-1', '1.5', 'NaN', 'Infinity', '9007199254740992', '1e2', '']) {
    assert.throws(() => parseCatalog(vulnerabilities, incidents.replace('UNKNOWN,74', `UNKNOWN,${value}`)));
  }
  assert.throws(() => parseCatalog(vulnerabilities.replace('rate_limit,20', 'rate_limit,-20'), incidents), /integer/);
  assert.throws(() => parseCatalog(vulnerabilities.replace('rate_limit,20', 'match,20'), incidents), /invalid policy/);
  assert.throws(() => parseCatalog(vulnerabilities.replace('#edb96d', 'red'), incidents), /invalid color/);
  assert.throws(() => parseCatalog(vulnerabilities.replace('classification,,公開資料,社内', 'classification,,,社内'), incidents), /classification values/);
  assert.throws(() => parseCatalog(vulnerabilities, 'id,type,a,b\n'), /1–18/);
  assert.throws(() => parseCatalog(vulnerabilities, legacyIncidents + '17,auth,A,A\n18,auth,A,A\n19,auth,A,A\n'), /1–18/);
});

test('editing CSV changes the actual request values and policy threshold', () => {
  const changed = parseCatalog(vulnerabilities.replace('rate_limit,20', 'rate_limit,80'), incidents.replace('1,auth,AOI,UNKNOWN', '1,auth,AOI,AOI'));
  assert.equal(changed.FORMS[0][1], true);
  assert.equal(changed.FORMS[2][1], true);
  assert.ok(changed.TYPES.flood.rule.includes('毎秒80件'));
  assert.ok(!changed.TYPES.flood.rule.includes('20件'));
  assert.equal(evaluatePolicy({type: 'flood', a: 'REN', b: '80'}, changed.TYPES), true);
  assert.equal(evaluatePolicy({type: 'flood', a: 'REN', b: '81'}, changed.TYPES), false);
  const added = parseCatalog(vulnerabilities, legacyIncidents + '17,auth,AOI,AOI\n');
  assert.equal(added.INCIDENTS.length, 17);
  assert.deepEqual(added.FORMS[16], ['auth', true, 'AOI', 'AOI']);
});

test('each hospital communication has a unique robot profile and local image without changing verdicts', () => {
  assert.equal(new Set(INCIDENTS.map(row => row.characterName)).size, INCIDENTS.length);
  assert.equal(new Set(INCIDENTS.map(row => row.characterImage)).size, INCIDENTS.length);
  for (const row of INCIDENTS) {
    assert.ok(row.characterName);
    assert.ok(row.characterRole);
    assert.ok(row.characterLine);
    assert.equal(row.characterImage, `assets/characters/incident-${String(row.id).padStart(2, '0')}.png`);
  }
  const legacy = parseCatalog(vulnerabilities, legacyIncidents);
  assert.deepEqual(legacy.FORMS, FORMS);
  assert.equal(legacy.INCIDENTS[0].characterName, undefined);
});

test('optional character profiles accept missing and empty columns while rejecting unsafe image paths', () => {
  const legacyRows = parseCsv(legacyIncidents);
  const partial = legacyRows.map((row, index) => [...row, index === 0 ? 'characterName' : index === 1 ? '案内ロボ' : '']);
  const parsed = parseCatalog(vulnerabilities, encodeCsv(partial));
  assert.equal(parsed.INCIDENTS[0].characterName, '案内ロボ');
  assert.equal(parsed.INCIDENTS[1].characterName, '');
  assert.deepEqual(parsed.FORMS, FORMS);
  for (const image of ['https://example.test/robot.png', '//example.test/robot.png', 'data:image/png;base64,abc', '../robot.png', 'assets/characters/../robot.png', '/assets/characters/incident-01.png', 'assets/characters/incident-02.png', 'assets/characters/incident-01.svg']) {
    const rows = parseCsv(incidents);
    rows[1][7] = image;
    assert.throws(() => parseCatalog(vulnerabilities, encodeCsv(rows)), /invalid characterImage/);
  }
  for (const [column, length] of [[4, 41], [5, 81], [6, 181]]) {
    const rows = parseCsv(incidents);
    rows[1][column] = 'x'.repeat(length);
    assert.throws(() => parseCatalog(vulnerabilities, encodeCsv(rows)), /too long/);
  }
  const empty = parseCsv(incidents);
  empty[1].fill('', 4);
  assert.equal(parseCatalog(vulnerabilities, encodeCsv(empty)).INCIDENTS[0].characterImage, '');
});

test('optional communication details do not affect verdicts and are shared by normal and invalid requests', () => {
  const keys = ['sourceSystem', 'destinationSystem', 'transport', 'purpose'];
  for (const row of INCIDENTS) for (const key of keys) assert.ok(row[key] && row[key].length <= 80);
  // Each set of helper fields appears on both sides of the verdict boundary.
  for (const row of INCIDENTS) {
    assert.ok(INCIDENTS.some(other => keys.every(key => row[key] === other[key]) && expectedVerdict(row) !== expectedVerdict(other)));
  }
  const rows = parseCsv(incidents);
  const columns = keys.map(key => rows[0].indexOf(key));
  for (const row of rows.slice(1)) for (const column of columns) row[column] = '別の補助表示';
  const changed = parseCatalog(vulnerabilities, encodeCsv(rows));
  assert.deepEqual(changed.FORMS, FORMS);
  for (const [index, row] of changed.INCIDENTS.entries()) {
    assert.equal(expectedVerdict(row), expectedVerdict(INCIDENTS[index]));
    assert.equal(verdictReason(row), verdictReason(INCIDENTS[index]));
  }
  assert.deepEqual(parseCatalog(vulnerabilities, legacyIncidents).FORMS, FORMS);
  const partial = parseCsv(legacyIncidents).map((row, index) => [...row, index === 0 ? 'transport' : index === 1 ? 'TLS 1.2' : '']);
  assert.equal(parseCatalog(vulnerabilities, encodeCsv(partial)).INCIDENTS[0].transport, 'TLS 1.2');
  assert.equal(parseCatalog(vulnerabilities, encodeCsv(partial)).INCIDENTS[1].transport, '');
  for (const column of columns) {
    const tooLong = parseCsv(incidents);
    tooLong[1][column] = 'x'.repeat(81);
    assert.throws(() => parseCatalog(vulnerabilities, encodeCsv(tooLong)), /too long/);
    tooLong[1][column] = 'x'.repeat(80);
    assert.doesNotThrow(() => parseCatalog(vulnerabilities, encodeCsv(tooLong)));
  }
});

test('vulnerability CSV row order does not change the fixed map quadrants', () => {
  const [header, ...rows] = vulnerabilities.trimEnd().split('\n');
  const reversed = parseCatalog([header, ...rows.reverse()].join('\n'), incidents);
  assert.deepEqual(reversed.ORDER, ['auth', 'share', 'flood', 'exfil']);
  assert.deepEqual(reversed.FORMS, FORMS);
  for (const type of ORDER) assert.deepEqual(reversed.TYPES[type], TYPES[type]);
});

test('policy rule tokens keep the displayed rule and verdict settings consistent', () => {
  assert.throws(() => parseCatalog(vulnerabilities.replace('{limit}', '20'), incidents), /rule requires \{limit\}/);
  assert.throws(() => parseCatalog(vulnerabilities.replace('{publicValue}', '公開資料'), incidents), /rule requires \{publicValue\}/);
  assert.throws(() => parseCatalog(vulnerabilities.replace('{internalValue}', '社内'), incidents), /rule requires \{internalValue\}/);
  assert.throws(() => parseCatalog(vulnerabilities.replace('{limit}', '{limit} {unknown}'), incidents), /unknown rule token/);
  const changed = parseCatalog(vulnerabilities.replace('classification,,公開資料,社内', 'classification,,配布可能,イントラネット'), incidents);
  assert.ok(changed.TYPES.exfil.rule.includes('「配布可能」'));
  assert.ok(changed.TYPES.exfil.rule.includes('「イントラネット」'));
  assert.equal(evaluatePolicy({type: 'exfil', a: '配布可能', b: '外部'}, changed.TYPES), true);
  assert.equal(evaluatePolicy({type: 'exfil', a: '社内資料', b: 'イントラネット'}, changed.TYPES), true);
  assert.equal(evaluatePolicy({type: 'exfil', a: '公開資料', b: '外部'}, changed.TYPES), false);
});

test('all 16 CSV character images exist as distinct deployable PNG assets', async () => {
  const {createHash}=await import('node:crypto');
  const hashes=new Set();
  for(const row of INCIDENTS){
    const image=await readFile(new URL(`./dist/${row.characterImage}`,import.meta.url));
    assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert(image.readUInt32BE(16)>=512&&image.readUInt32BE(20)>=512);
    hashes.add(createHash('sha256').update(image).digest('hex'));
  }
  assert.equal(hashes.size,16);
});
