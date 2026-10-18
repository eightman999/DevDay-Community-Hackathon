import {INCIDENTS} from './catalog.mjs';
import {buildEnemyTurn, chooseLocal, validEnemyAction} from './enemy-policy.mjs';

// Selection is synchronous. The optional provider only prepares the next choice.
export class EnemyDirector {
  constructor({provider = null, timeoutMs = 1800} = {}) {
    this.provider = provider;
    this.timeoutMs = timeoutMs;
    this.status = {source: 'local', reason: provider ? '適応型の敵：ローカルで開始。' : 'API未設定：ローカル適応で稼働。', pending: false};
    this.attempted = new Set();
    this.version = 0;
    this.disposed = false;
    this.shift = null;
    this.ready = null;
    this.flight = null;
  }
  cancel() {
    this.version++;
    if (this.flight) {
      clearTimeout(this.flight.timer);
      this.flight.controller.abort();
    }
    this.flight = null;
    this.status = {...this.status, pending: false};
  }
  bind(shift) {
    if (this.shift === shift) return;
    this.cancel();
    this.shift = shift;
    this.attempted.clear();
    this.ready = null;
  }
  select(shift) {
    this.bind(shift);
    const turn = buildEnemyTurn(shift);
    const prepared = this.ready?.round === turn.round ? this.ready.result : null;
    this.ready = null;
    this.cancel();
    const accepted = prepared && validEnemyAction(turn, prepared);
    const id = accepted && prepared.source === 'decisions' ? prepared.id : chooseLocal(turn);
    const result = {
      id,
      interval: accepted && prepared.source === 'decisions' ? prepared.interval : 7,
      tactic: accepted && prepared.source === 'decisions' ? prepared.tactic : 'local',
      source: accepted ? prepared.source : 'local',
      reason: id === null ? '防御状態に合う通信候補がなく待機。' : accepted ? prepared.reason : prepared ? '防御状態が変化：ローカルで経路を再選択。' : this.fallbackReason || (this.provider ? '観測した審査結果から次の通信を選択。' : 'API未設定：ローカル適応で選択。')
    };
    this.fallbackReason = '';
    this.status = {...result, pending: false};
    return result;
  }
  tick(shift) {
    if (this.disposed) return;
    this.bind(shift);
    if (!this.provider || !shift.running || shift.done || shift.serial === 0 || shift.serial >= INCIDENTS.length) return;
    const remaining = shift.nextArrival - shift.time;
    if (remaining > 2 || remaining <= 0 || this.attempted.has(shift.serial)) return;
    const turn = buildEnemyTurn(shift);
    if (!turn.candidateIds.length) return;
    this.attempted.add(turn.round);
    this.cancel();
    const version = this.version;
    const controller = new AbortController();
    const fail = reason => {
      if (this.disposed || this.version !== version) return;
      this.fallbackReason = reason;
      this.cancel();
    };
    const timer = setTimeout(() => fail('API応答期限超過：ローカル適応で継続。'), this.timeoutMs);
    this.flight = {controller, timer};
    this.status = {...this.status, pending: true};
    Promise.resolve().then(() => {
      if (this.disposed || this.version !== version) return null;
      if (!shift.running) {fail('一時停止：ローカル適応で継続。');return null;}
      return this.provider.choose(turn, {signal: controller.signal});
    }).then(result => {
      if (this.disposed || this.version !== version || this.shift !== shift || shift.serial !== turn.round) return;
      if (!result || !validEnemyAction(turn, result) || !['decisions', 'local'].includes(result.source) || typeof result.reason !== 'string') {
        fail('API応答を検証できません：ローカル適応で継続。');
        return;
      }
      clearTimeout(timer);
      this.flight = null;
      this.ready = {round: turn.round, result: {id: result.id, interval: result.interval ?? 7, tactic: result.tactic ?? 'local', source: result.source, reason: result.reason.slice(0, 160)}};
      this.status = {...this.status, pending: false};
    }).catch(() => fail('APIに接続できません：ローカル適応で継続。'));
  }
  dispose() {
    this.disposed = true;
    this.cancel();
    this.ready = null;
    this.shift = null;
  }
}
