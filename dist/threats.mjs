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

export const REVIEW_SECONDS = 28;
export const TRANSFER_LIMITS = Object.freeze({auth:20, share:40, flood:80, exfil:30});
export const ROLE_OPERATIONS = Object.freeze({
  '診療担当': Object.freeze(['参照', '更新']),
  '連携担当': Object.freeze(['参照', '転送']),
  '閲覧担当': Object.freeze(['参照'])
});

// Derive harmless scanner findings from a CSV communication, not real payloads.
export function makeInspection(request, round = 0) {
  const candidates = THREATS.filter(pattern => pattern.route === request?.type);
  if (!candidates.length) throw new Error('Unknown inspection route');
  const turn = Number.isSafeInteger(round) && round >= 0 ? round : 0;
  const pattern = candidates[Math.floor(turn / 4) % candidates.length];
  const safe = evaluatePolicy(request, TYPES);
  const template = (request.templateId ?? request.id ?? 1) - 1;
  const seed = turn * 7 + template * 3 + Math.floor(turn / 3);
  const variant = (Math.floor(turn / 4) + template) % 6;
  const role = Object.keys(ROLE_OPERATIONS)[seed % 3];
  const operations = ROLE_OPERATIONS[role];
  const classification = ['公開資料', '院内情報', '診療情報'][Math.floor(seed / 2) % 3];
  const destination = classification === '公開資料' ? ['院内', '契約先', '外部'][seed % 3]
    : classification === '診療情報' && seed % 2 ? '契約先' : '院内';
  const actor = `JOB-${String(11 + seed % 19).padStart(2, '0')}`;
  const inspection = {
    patternId: pattern.id, a: pattern.safeA, b: pattern.safeB,
    actor, credentialSubject: actor, role, operation: operations[seed % operations.length],
    classification, destination, anonymized: !!(seed % 2), approval: !!(seed % 2),
    expandedMB: Math.max(1, TRANSFER_LIMITS[pattern.route] - (seed % 5) * 3)
  };
  // One failing check among otherwise plausible evidence; validity stays CSV-backed.
  if (!safe) {
    if (variant === 0) inspection.a = pattern.attackA;
    if (variant === 1) inspection.b = pattern.attackB;
    if (variant === 2) inspection.credentialSubject = `JOB-${31 + seed % 19}`;
    if (variant === 3) { inspection.role = '閲覧担当'; inspection.operation = '更新'; }
    if (variant === 4) { inspection.classification = '院内情報'; inspection.destination = '外部'; }
    if (variant === 5) inspection.expandedMB = TRANSFER_LIMITS[pattern.route] + 1;
  }
  return Object.freeze(inspection);
}

// The same six rules supply the review sheet, scoring, and post-decision explanations.
export function inspectionChecks(inspection) {
  if (!inspection || typeof inspection !== 'object' || Array.isArray(inspection)) return [];
  const pattern = THREATS.find(row => row.id === inspection.patternId);
  if (!pattern) return [];
  const show = value => typeof value === 'string' && value ? value : '情報なし';
  const isBoolean = value => typeof value === 'boolean';
  const destinationKnown = ['院内', '契約先', '外部'].includes(inspection.destination);
  const handling = destinationKnown && isBoolean(inspection.anonymized) && isBoolean(inspection.approval) && (
    inspection.classification === '公開資料'
    || inspection.classification === '院内情報' && inspection.destination === '院内'
    || inspection.classification === '診療情報' && (inspection.destination === '院内'
      || inspection.destination === '契約先' && inspection.anonymized && inspection.approval)
  );
  return [
    {key:'a', label:pattern.fieldA, value:show(inspection.a), rule:`${pattern.safeA}であること。`, passed:inspection.a === pattern.safeA},
    {key:'b', label:pattern.fieldB, value:show(inspection.b), rule:`${pattern.safeB}であること。`, passed:inspection.b === pattern.safeB},
    {key:'identity', label:'送信主体と認証主体', value:`送信 ${show(inspection.actor)} / 認証 ${show(inspection.credentialSubject)}`, rule:'送信ジョブIDと認証トークンの主体が一致すること。', passed:typeof inspection.actor === 'string' && /^JOB-\d{2}$/.test(inspection.actor) && inspection.actor === inspection.credentialSubject},
    {key:'permission', label:'役割と申請操作', value:`${show(inspection.role)} / ${show(inspection.operation)}`, rule:'診療担当：参照・更新。連携担当：参照・転送。閲覧担当：参照のみ。', passed:Object.hasOwn(ROLE_OPERATIONS, inspection.role) && ROLE_OPERATIONS[inspection.role].includes(inspection.operation)},
    {key:'handling', label:'情報区分と送信先', value:`${show(inspection.classification)} → ${show(inspection.destination)} / 匿名化 ${isBoolean(inspection.anonymized) ? inspection.anonymized ? 'あり' : 'なし' : '不明'} / 連携承認 ${isBoolean(inspection.approval) ? inspection.approval ? 'あり' : 'なし' : '不明'}`, rule:'公開資料：外部可。院内情報：院内のみ。診療情報：院内、または匿名化と連携承認のある契約先。', passed:handling},
    {key:'capacity', label:'展開後の処理量', value:typeof inspection.expandedMB === 'number' ? `${inspection.expandedMB} MB` : '情報なし', rule:`この領域は${TRANSFER_LIMITS[pattern.route]} MB以下。圧縮前ではなく展開後の値で確認。`, passed:Number.isSafeInteger(inspection.expandedMB) && inspection.expandedMB >= 0 && inspection.expandedMB <= TRANSFER_LIMITS[pattern.route]}
  ];
}

export function inspectionVerdict(inspection) {
  const checks = inspectionChecks(inspection);
  return checks.length === 6 && checks.every(check => check.passed);
}

export function inspectionIncident(inspection) {
  const pattern=THREATS.find(row=>row.id===inspection?.patternId);
  const failed=inspectionChecks(inspection).filter(check=>!check.passed);
  if(!pattern)return {name:'検査情報の不足',impactKind:'availability'};
  if(!failed.length)return {name:'規則を満たす通信',impactKind:null};
  if(failed.some(check=>check.key==='a'||check.key==='b'))return {name:pattern.name,impactKind:pattern.impactKind};
  const context={identity:{name:'認証主体の不一致',impactKind:'integrity'},permission:{name:'操作権限の逸脱',impactKind:inspection.operation==='更新'?'integrity':'confidentiality'},handling:{name:'情報送信規則の違反',impactKind:'confidentiality'},capacity:{name:'処理容量の超過',impactKind:'availability'}};
  return context[failed[0].key]||{name:'検査情報の不足',impactKind:'availability'};
}

export function inspectionReason(inspection) {
  const checks = inspectionChecks(inspection);
  if (!checks.length) return '拒否：既知の検査プロファイルと6項目の証拠が必要です。';
  const failed = checks.filter(check => !check.passed);
  return failed.length ? `拒否：${failed.map(check => `${check.label}（${check.value}）。規則：${check.rule}`).join(' / ')}`
    : `通過：${checks.map(check => check.label).join('・')}の6項目すべてが規則を満たしています。`;
}
