// CSV is the source of truth in both the static browser app and Node tests.
const TYPE_IDS = ['auth', 'share', 'flood', 'exfil'];
const TYPE_COLUMNS = ['id', 'name', 'label', 'pattern', 'rule', 'patch', 'hint', 'color', 'policy', 'limit', 'publicValue', 'internalValue'];
const INCIDENT_COLUMNS = ['id', 'type', 'a', 'b'];

export function parseCsv(source) {
  if (typeof source !== 'string') throw new Error('CSV must be text');
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  function endField() { row.push(field); field = ''; closed = false; }
  function endRow() { endField(); rows.push(row); row = []; }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else if (c === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Malformed CSV quote');
      field += c;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (row.length || field !== '' || closed) endRow();
  return rows;
}

function records(source, required, label) {
  const [header, ...rows] = parseCsv(source);
  if (!header || new Set(header).size !== header.length) throw new Error(`${label}: missing or duplicate header`);
  for (const key of required) if (!header.includes(key)) throw new Error(`${label}: missing column ${key}`);
  return rows.filter(row => !(row.length === 1 && row[0] === '')).map((row, index) => {
    if (row.length !== header.length) throw new Error(`${label}: row ${index + 2} has wrong column count`);
    return Object.fromEntries(header.map((key, i) => [key, row[i]]));
  });
}

function unsignedInteger(value, label) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${label}: expected a nonnegative integer`);
  return Number(value);
}

// The game and answer explanations consume the same CSV-backed policy.
export function evaluatePolicy(request, types) {
  const type = types[request.type];
  if (!type) throw new Error(`Unknown vulnerability type: ${request.type}`);
  if (type.policy === 'match') return request.a === request.b;
  if (type.policy === 'rate_limit') return /^\d+$/.test(String(request.b)) && Number.isSafeInteger(Number(request.b)) && Number(request.b) <= type.limit;
  return request.a === type.publicValue || request.b === type.internalValue;
}

export function parseCatalog(vulnerabilitiesCsv, incidentsCsv) {
  const vulnerabilities = records(vulnerabilitiesCsv, TYPE_COLUMNS, 'vulnerabilities.csv');
  const types = Object.create(null);
  for (const row of vulnerabilities) {
    if (!TYPE_IDS.includes(row.id)) throw new Error(`Unknown vulnerability type: ${row.id}`);
    if (Object.hasOwn(types, row.id)) throw new Error(`Duplicate vulnerability id: ${row.id}`);
    for (const key of ['name', 'label', 'pattern', 'rule', 'patch', 'hint']) {
      if (!row[key].trim()) throw new Error(`${row.id}: empty ${key}`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(row.color)) throw new Error(`${row.id}: invalid color`);
    const policy = { auth: 'match', share: 'match', flood: 'rate_limit', exfil: 'classification' }[row.id];
    if (row.policy !== policy) throw new Error(`${row.id}: invalid policy ${row.policy}`);
    if (policy === 'rate_limit') row.limit = unsignedInteger(row.limit, `${row.id}.limit`);
    else if (row.limit !== '') throw new Error(`${row.id}: limit only applies to rate_limit`);
    if (policy === 'classification') {
      if (!row.publicValue.trim() || !row.internalValue.trim()) throw new Error(`${row.id}: missing classification values`);
    } else if (row.publicValue !== '' || row.internalValue !== '') throw new Error(`${row.id}: unexpected classification values`);
    const ruleSettings = policy === 'rate_limit' ? { limit: row.limit }
      : policy === 'classification' ? { publicValue: row.publicValue, internalValue: row.internalValue } : {};
    for (const key of Object.keys(ruleSettings)) {
      if (!row.rule.includes(`{${key}}`)) throw new Error(`${row.id}: rule requires {${key}}`);
    }
    row.rule = row.rule.replace(/\{([^{}]+)\}/g, (token, key) => {
      if (!Object.hasOwn(ruleSettings, key)) throw new Error(`${row.id}: unknown rule token ${token}`);
      return String(ruleSettings[key]);
    });
    types[row.id] = Object.freeze(row);
  }
  for (const id of TYPE_IDS) if (!Object.hasOwn(types, id)) throw new Error(`Missing vulnerability type: ${id}`);
  const incidents = records(incidentsCsv, INCIDENT_COLUMNS, 'incidents.csv');
  if (!incidents.length || incidents.length > 18) throw new Error('incidents.csv: expected 1–18 incidents for a 120-second shift');
  const ids = new Set();
  for (const [index, row] of incidents.entries()) {
    row.id = unsignedInteger(row.id, 'incident.id');
    if (ids.has(row.id)) throw new Error(`Duplicate incident id: ${row.id}`);
    ids.add(row.id);
    if (row.id !== index + 1) throw new Error('Incident ids must be sequential, starting at 1');
    if (!Object.hasOwn(types, row.type)) throw new Error(`Unknown incident type: ${row.type}`);
    if (!row.a.trim() || !row.b.trim()) throw new Error(`Incident ${row.id}: empty a or b`);
    if (row.type === 'flood') unsignedInteger(row.b, `Incident ${row.id}.b`);
    for (const [key, maxLength] of [['characterName', 40], ['characterRole', 80], ['characterLine', 180], ['sourceSystem', 80], ['destinationSystem', 80], ['transport', 80], ['purpose', 80]]) {
      if (row[key] !== undefined && row[key].length > maxLength) throw new Error(`Incident ${row.id}: ${key} too long`);
    }
    // Profiles remain optional, including partially populated CSV columns.
    // Only local per-incident art is accepted: no URLs, traversal or data URIs.
    if (row.characterImage && row.characterImage !== `assets/characters/incident-${String(row.id).padStart(2, '0')}.png`) {
      throw new Error(`Incident ${row.id}: invalid characterImage`);
    }
    Object.freeze(row);
  }
  return Object.freeze({
    TYPES: Object.freeze(types),
    ORDER: Object.freeze([...TYPE_IDS]),
    INCIDENTS: Object.freeze(incidents),
    FORMS: Object.freeze(incidents.map(row => Object.freeze([row.type, evaluatePolicy(row, types), row.a, row.b])))
  });
}

async function readCatalogFile(name) {
  const url = new URL(`./data/${name}`, import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.text();
}

const catalog = parseCatalog(...await Promise.all([
  readCatalogFile('vulnerabilities.csv'), readCatalogFile('incidents.csv')
]));
export const { TYPES, ORDER, INCIDENTS, FORMS } = catalog;
