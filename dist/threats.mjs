import {parseCsv, evaluatePolicy, TYPES} from './catalog.mjs';

const IDS = ['smb_v1', 'auth_bypass', 'sql_injection', 'idor', 'os_command', 'path_traversal', 'unsafe_upload', 'deserialization', 'ssrf', 'stored_xss', 'resource_exhaustion'];
const COLUMNS = ['id', 'route', 'name', 'weakness', 'impact', 'patch', 'source', 'fieldA', 'fieldB', 'safeA', 'safeB', 'attackA', 'attackB', 'impactKind'];

export function parseThreats(source) {
  const [header, ...rawRows] = parseCsv(source);
  if (!header || new Set(header).size !== header.length) throw new Error('attack-patterns.csv: missing or duplicate header');
  for (const key of COLUMNS) if (!header.includes(key)) throw new Error(`attack-patterns.csv: missing column ${key}`);
  const rows = rawRows.filter(row => !(row.length === 1 && row[0] === ''));
  if (rows.length !== IDS.length) throw new Error('attack-patterns.csv: expected 11 patterns');
  const ids = new Set();
  const threats = rows.map((fields, index) => {
    if (fields.length !== header.length) throw new Error(`attack-patterns.csv: row ${index + 2} has wrong column count`);
    const row = Object.fromEntries(header.map((key, i) => [key, fields[i]]));
    if (!IDS.includes(row.id) || ids.has(row.id)) throw new Error('attack-patterns.csv: unknown or duplicate id');
    ids.add(row.id);
    if (!Object.hasOwn(TYPES, row.route)) throw new Error(`${row.id}: invalid route`);
    if (!['availability', 'confidentiality', 'integrity'].includes(row.impactKind)) throw new Error(`${row.id}: invalid impactKind`);
    for (const key of COLUMNS) {
      if (!row[key].trim()) throw new Error(`${row.id}: empty ${key}`);
      const maxLength = ['weakness', 'impact', 'patch', 'source'].includes(key) ? 300 : 80;
      if (row[key].length > maxLength) throw new Error(`${row.id}: ${key} too long`);
    }
    if (!/^https:\/\/(?:cwe\.mitre\.org\/data\/definitions\/\d+\.html|learn\.microsoft\.com\/en-us\/security-updates\/securitybulletins\/2017\/ms17-010)$/.test(row.source)) throw new Error(`${row.id}: invalid source`);
    if (row.safeA === row.attackA || row.safeB === row.attackB || row.fieldA === row.fieldB) throw new Error(`${row.id}: inspection conditions must be distinct`);
    return Object.freeze(row);
  });
  for (const route of Object.keys(TYPES)) if (!threats.some(row => row.route === route)) throw new Error(`attack-patterns.csv: missing route ${route}`);
  return Object.freeze(threats);
}

async function readThreats() {
  const url = new URL('./data/attack-patterns.csv', import.meta.url);
  if (url.protocol === 'file:') {
    const {readFile} = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`attack-patterns.csv: HTTP ${response.status}`);
  return response.text();
}

export const THREATS = parseThreats(await readThreats());

// Derive harmless scanner findings from a CSV communication, not real payloads.
export function makeInspection(request, round = 0) {
  const candidates = THREATS.filter(pattern => pattern.route === request?.type);
  if (!candidates.length) throw new Error('Unknown inspection route');
  const turn = Number.isSafeInteger(round) && round >= 0 ? round : 0;
  const pattern = candidates[Math.floor(turn / 4) % candidates.length];
  const safe = evaluatePolicy(request, TYPES);
  return Object.freeze({patternId: pattern.id, a: safe ? pattern.safeA : pattern.attackA, b: safe ? pattern.safeB : pattern.attackB});
}

export function inspectionVerdict(inspection) {
  if (!inspection || typeof inspection !== 'object' || Array.isArray(inspection)) return false;
  const pattern = THREATS.find(row => row.id === inspection.patternId);
  return !!pattern && inspection.a === pattern.safeA && inspection.b === pattern.safeB;
}

export function inspectionReason(inspection) {
  const pattern = THREATS.find(row => row.id === inspection?.patternId);
  if (!pattern || !inspection || typeof inspection !== 'object' || Array.isArray(inspection)) return '拒否：検査所見を確認できません。既知の検査項目と二つの所見が必要です。';
  const conditions = `${pattern.fieldA}が「${pattern.safeA}」、${pattern.fieldB}が「${pattern.safeB}」の両方を満たす通信だけ通せます。`;
  return `${inspectionVerdict(inspection) ? '通過' : '拒否'}：${conditions}${inspectionVerdict(inspection) ? '両方の条件を満たしています。' : '必要な条件を満たしていません。'}`;
}
