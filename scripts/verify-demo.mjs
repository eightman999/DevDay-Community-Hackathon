import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Shift, expectedVerdict} from '../dist/engine.mjs';
import {EnemyDirector} from '../dist/enemy.mjs';
import {INCIDENTS} from '../dist/catalog.mjs';
import {THREATS, TRANSFER_LIMITS} from '../dist/threats.mjs';

// Only evidence shown by the inspection sheet and its published rules are read.
// No request ID, template ID, courier ID, stored valid bit, or score is consulted.
export function evidenceBot({inspection: i}) {
  const rule = THREATS.find(pattern => pattern.id === i.patternId);
  const operations = {'診療担当':['参照','更新'], '連携担当':['参照','転送'], '閲覧担当':['参照']};
  const handling = ['院内','契約先','外部'].includes(i.destination)
    && typeof i.anonymized === 'boolean' && typeof i.approval === 'boolean'
    && (i.classification === '公開資料'
      || i.classification === '院内情報' && i.destination === '院内'
      || i.classification === '診療情報' && (i.destination === '院内'
        || i.destination === '契約先' && i.anonymized && i.approval));
  return Boolean(rule && i.a === rule.safeA && i.b === rule.safeB
    && typeof i.actor === 'string' && /^JOB-\d{2}$/.test(i.actor) && i.actor === i.credentialSubject
    && Object.hasOwn(operations, i.role) && operations[i.role].includes(i.operation)
    && handling && Number.isSafeInteger(i.expandedMB) && i.expandedMB >= 0
    && i.expandedMB <= TRANSFER_LIMITS[rule.route]);
}

export const idModuloBot = request => request.id % 3 === 2;

export function simulate(seed, bot, director = new EnemyDirector()) {
  const shift = new Shift({director, seed});
  let correct = 0, reviewed = 0;
  shift.start();
  while (!shift.done) {
    for (const request of shift.pending()) {
      const allow = bot(request);
      if (allow === undefined) continue;
      correct += Number(allow === expectedVerdict(request));
      reviewed++;
      shift.decide(request.id, allow);
    }
    // All bots observe the same half-second clock; no repair or quarantine.
    shift.advance(.5);
  }
  director.dispose?.();
  return {
    seed, requests: shift.requests.length, reviewed, correct,
    accuracy: reviewed ? correct / reviewed : null,
    mistakes: shift.mistakes,
    unreviewed: shift.requests.filter(r => ['pending','timeout'].includes(r.status)).length,
    damage: {
      unavailableRecords: shift.unavailableRecords,
      exposedRecords: shift.exposedRecords,
      alteredRecords: shift.alteredRecords,
      postponedAppointments: shift.postponedAppointments
    },
    trace: shift.requests.map(r => ({id:r.id, templateId:r.templateId, courierId:r.courierId,
      normal:expectedVerdict(r), patternId:r.inspection.patternId, status:r.status}))
  };
}

export function summarize(runs) {
  const sum = key => runs.reduce((total, run) => total + run[key], 0);
  const damage = Object.fromEntries(Object.keys(runs[0].damage).map(key => {
    const values = runs.map(run => run.damage[key]);
    const total = values.reduce((a,b) => a+b, 0);
    return [key, {total, meanPerShift:total/runs.length, maxPerShift:Math.max(...values)}];
  }));
  const reviewed = sum('reviewed'), correct = sum('correct');
  const couriers = INCIDENTS.map(({id, characterName}) => ({id, name:characterName, normal:0, malicious:0}));
  for (const run of runs) for (const request of run.trace) {
    couriers.find(courier => courier.id === request.courierId)[request.normal ? 'normal' : 'malicious']++;
  }
  return {shifts:runs.length, requests:sum('requests'), reviewed, correct,
    accuracy:correct/reviewed, mistakes:sum('mistakes'), unreviewed:sum('unreviewed'),
    damage, couriers, everyCourierCarriesBoth:couriers.every(c => c.normal && c.malicious),
    traceSha256:createHash('sha256').update(JSON.stringify(runs)).digest('hex')};
}

export async function verifyDemo() {
  const seeds = Array.from({length:128}, (_, i) => i+1);
  const bots = {idModulo:idModuloBot, evidencePerfect:evidenceBot};
  const results = Object.fromEntries(Object.entries(bots).map(([name, bot]) => {
    const runs = seeds.map(seed => simulate(seed, bot));
    assert(runs.every(run => run.requests === 16 && run.reviewed === 16 && run.unreviewed === 0));
    assert(runs.every(run => run.trace[0].templateId === 1 && !run.trace[0].normal && run.trace[0].patternId === 'smb_v1'));
    return [name, summarize(runs)];
  }));
  assert(results.idModulo.accuracy < .75);
  assert.equal(results.evidencePerfect.accuracy, 1);
  assert.equal(results.evidencePerfect.mistakes, 0);
  assert(Object.values(results.evidencePerfect.damage).every(metric => metric.total === 0));
  assert(results.evidencePerfect.everyCourierCarriesBoth);
  const sourceFiles = ['dist/engine.mjs','dist/enemy.mjs','dist/enemy-policy.mjs','dist/threats.mjs',
    'dist/catalog.mjs','dist/data/incidents.csv','dist/data/vulnerabilities.csv','dist/data/attack-patterns.csv','scripts/verify-demo.mjs'];
  const sourceSha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
    [file, createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex')])));
  return {
    schemaVersion:1, seeds:{first:1,last:128,count:128},
    conditions:{durationSeconds:120, arrivalIntervalSeconds:7, decisionClockSeconds:.5,
      repairs:false, quarantine:false, provider:'local only; no external calls', initialData:100, initialAppointments:100},
    results, sourceSha256,
    limitations:[
      '同じseedと時計を各botに適用する。適応型のため判断履歴が異なると後続の投入経路も異なる。',
      '最初の通信は意図的に固定のSMB不正。以降の伝票ID・配達員の見た目は正解キーとして使わない。',
      'evidencePerfectは公開された6項目規則を完全に実行する理想bot。人間の読解速度や学習効果は測定していない。',
      'API判断との優劣・品質・遅延・コストは未検証。外部API、外部サービス、実攻撃は実行しない。',
      '被害は1当直100件を上限とするゲーム内指標の累計。各種類は独立で、実患者や実運用の被害ではない。',
      '固定templateIdと内部seedを読むソース解析botへの耐性は保証しない。CSV番号は画面非表示だが内部正解は秘密ではない。'
    ]
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await verifyDemo(), null, 2));
}
