import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createCellwatchServer } from './server.mjs';
import { normalizeEnemyTurn, enemyActions } from './dist/enemy-policy.mjs';
import {THREATS,makeInspection,inspectionChecks} from './dist/threats.mjs';
import {INCIDENTS} from './dist/catalog.mjs';

const secret = 'mock-key-for-tests-only';
function turn(round = 2) {
  return { round, time: round * 7, zones: Object.fromEntries(['auth', 'share', 'flood', 'exfil'].map(type => [type, { fixed: false, repairing: false, quarantined: false }])), recent: [] };
}
function answer(id = 1, extra = {}) {
  return new Response(JSON.stringify({ answers: [{ type: 'choice', name: 'next_action', choice: `action_${id}_7_switch`, confidence: 0.8, ...extra }] }), { headers: { 'Content-Type': 'application/json' } });
}
async function fixture(t, options = {}) {
  const server = createCellwatchServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, post: (observation = turn(), sessionId = 'test-session-123', extra = {}) => fetch(`${base}/api/enemy/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, turn: observation }), ...extra }) };
}

test('no key and forced local mode never contact the API; status and fallback are explicit', async t => {
  for (const options of [{}, { mode: 'auto' }, { apiKey: secret, mode: 'local' }, { mode: 'decisions' }]) {
    const { base, post } = await fixture(t, { ...options, fetchImpl: () => { assert.fail('upstream must not run'); } });
    assert.deepEqual(await (await fetch(`${base}/api/enemy/status`)).json(), { mode: 'local', configured: !!options.apiKey });
    const result = await (await post()).json();
    assert.equal(result.source, 'local');
    assert.equal(result.reason, options.apiKey ? 'local-mode' : 'unconfigured');
    assert.ok(normalizeEnemyTurn(turn()).candidateIds.includes(result.id));
  }
});

test('unknown enemy modes fail at server creation', () => {
  assert.throws(() => createCellwatchServer({ apiKey: secret, mode: 'decision' }), /Invalid enemy mode/);
});

test('Decisions request uses fixed endpoint/model and only CSV-backed choices and bounded observations', async t => {
  let called = 0;
  const observation = { ...turn(), candidateIds: [9999], secret: 'untrusted-client-extra' };
  const { base, post } = await fixture(t, { apiKey: secret, fetchImpl: async (url, options) => {
    called++;
    assert.equal(url, 'https://api.openai.com/v1/decisions');
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna');
    const {communications,...normalized}=JSON.parse(body.input);
    assert.deepEqual(normalized, normalizeEnemyTurn(observation));
    assert(Array.isArray(communications));
    assert.equal(body.questions[0].name, 'next_action');
    assert.deepEqual(body.questions[0].choices.map(choice => choice.value), enemyActions(normalizeEnemyTurn(observation)).map(action => action.value));
    for(const choice of body.questions[0].choices){
      const action=enemyActions(normalized).find(action=>action.value===choice.value);
      assert.deepEqual(JSON.parse(choice.description),{id:action.id,interval:action.interval,tactic:action.tactic});
    }
    for(const info of communications){
      const row=INCIDENTS.find(row=>row.id===info.id);
      const inspection=makeInspection({...row,templateId:row.id},observation.round);
      const pattern=THREATS.find(pattern=>pattern.id===inspection.patternId);
      assert.deepEqual(info,{id:row.id,type:row.type,a:row.a,b:row.b,rule:inspectionChecks(inspection).map(check=>check.label+'：'+check.rule).join(' / '),inspection,weakness:pattern.name,impact:pattern.impact,impactKind:pattern.impactKind});
    }
    assert.ok(!options.body.includes('untrusted-client-extra'));
    return answer(1);
  } });
  assert.deepEqual(await (await fetch(`${base}/api/enemy/status`)).json(), { mode: 'decisions', configured: true });
  assert.deepEqual(await (await post(observation)).json(), { id: 1, interval: 7, tactic: 'switch', source: 'decisions', reason: 'selected' });
  assert.equal(called, 1);
});

test('invalid answers, refusal, upstream errors and invalid JSON fall back without leaking upstream text or keys', async t => {
  const cases = [
    [() => answer(999), 'invalid-response'],
    [() => answer(1, { confidence: 1.2 }), 'invalid-response'],
    [() => answer(1, { confidence: undefined }), 'invalid-response'],
    [() => answer(1, { probabilities: [{ value: 'action_1_7_switch', probability: -1 }] }), 'invalid-response'],
    [() => answer(1, { name: 'wrong_question' }), 'invalid-response'],
    [() => new Response(JSON.stringify({ answers: [{ type: 'refusal', refusal: secret }] })), 'refusal'],
    [() => new Response('not JSON ' + secret), 'invalid-response'],
    [() => new Response(secret, { status: 503 }), 'api-error'],
    [() => { throw new Error(secret); }, 'api-error']
  ];
  for (const [fetchImpl, reason] of cases) {
    const { post } = await fixture(t, { apiKey: secret, fetchImpl });
    const response = await post();
    const text = await response.text();
    const result = JSON.parse(text);
    assert.equal(response.status, 200);
    assert.equal(result.source, 'local');
    assert.equal(result.reason, reason);
    assert.ok(!text.includes(secret));
    assert.ok(normalizeEnemyTurn(turn()).candidateIds.includes(result.id));
  }
});

test('timeout covers both fetch and response body consumption; there are no retries', async t => {
  for (const bodyStalls of [false, true]) {
    let calls = 0;
    const { post } = await fixture(t, { apiKey: secret, timeoutMs: 20, fetchImpl: async () => {
      calls++;
      if (!bodyStalls) return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }));
    } });
    const result = await (await post()).json();
    assert.equal(result.reason, 'timeout');
    assert.equal(result.source, 'local');
    assert.equal(calls, 1);
  }
});

test('parallel duplicate rounds share one upstream request; global budget caps new requests', async t => {
  let calls = 0;
  const { post } = await fixture(t, { apiKey: secret, maxCalls: 1, fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return answer(1); } });
  const [a, b] = await Promise.all([post(), post()]);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(calls, 1);
  assert.equal((await (await post(turn(3))).json()).reason, 'budget');
  assert.equal((await (await post(turn(), 'other-session')).json()).reason, 'budget');
  assert.equal(calls, 1);
});

test('session count and TTL bound cache while preserving global budget', async t => {
  let now = 0, calls = 0;
  const { post } = await fixture(t, { apiKey: secret, maxSessions: 1, sessionTtlMs: 100, maxCalls: 2, now: () => now, fetchImpl: async () => { calls++; return answer(); } });
  assert.equal((await (await post()).json()).source, 'decisions');
  assert.equal((await (await post(turn(), 'next-session')).json()).reason, 'budget');
  now = 101;
  assert.equal((await (await post(turn(), 'next-session')).json()).source, 'decisions');
  now = 202;
  assert.equal((await (await post(turn(), 'third-session')).json()).reason, 'budget');
  assert.equal(calls, 2);
});

test('HTTP boundary rejects foreign origins, oversized/invalid bodies and untrusted paths', async t => {
  const { base, post, server } = await fixture(t);
  assert.equal((await post(turn(), 'test-session-123', { headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' } })).status, 403);
  assert.equal((await post(turn(), 'test-session-123', { headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(base + '/api/enemy/status', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await post(turn(), 'test-session-123', { body: 'x'.repeat(32769) })).status, 413);
  assert.equal((await post(turn(), 'test-session-123', { body: '{}' })).status, 400);
  assert.equal((await post({ ...turn(), zones: {} })).status, 400);
  assert.equal((await post({ ...turn(), recent: Array(25).fill({ type: 'auth', status: 'deny', valid: false }) })).status, 400);
  assert.equal((await post(turn(), 'bad session')).status, 400);
  assert.equal((await post(turn(), 'test-session-123', { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  for (const path of ['/.env', '/server.mjs', '/%2e%2e%2fserver.mjs', '/%2eenv', '/data/../.env', '/api/unknown']) assert.equal((await fetch(base + path)).status, 404, path);
  const root = await fetch(base);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(base + '/data/incidents.csv')).status, 200);
  const score = await fetch(base + '/music/tactical-breach.txt');
  assert.equal(score.status, 200);
  assert.match(score.headers.get('content-type'), /text\/plain/);
  assert.ok((await score.text()).length > 100);
  const navigation = await fetch(base, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(navigation.status, 200);
  assert.match(await navigation.text(), /<!doctype html>/i);
  assert.equal((await fetch(base + '/app.mjs', { method: 'HEAD', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 200);
  const rebinding = await new Promise(resolve => {
    const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: '/api/enemy/status', headers: { Host: 'foreign.example' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.end();
  });
  assert.equal(rebinding, 403);
  const chunked = await new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port, method: 'POST', path: '/api/enemy/decide', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.on('error', reject);
    request.write('x'.repeat(32769));
    request.end();
  });
  assert.equal(chunked, 413);
});
