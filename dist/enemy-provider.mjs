import {LOCAL_INTERVAL} from './timing.mjs';
import { chooseLocal, normalizeEnemyTurn, validEnemyAction } from './enemy-policy.mjs';

const REASONS = new Set(['unconfigured', 'local-mode', 'timeout', 'api-error', 'invalid-response', 'refusal', 'budget', 'decisions', 'selected', 'cached', 'no-candidates', 'sign-in-required']);

// A provider returns a validated CSV id. No credentials or model output reach the UI.
export function createEnemyProvider({ fetchImpl = globalThis.fetch, timeoutMs = 3600,
  sessionId = globalThis.crypto?.randomUUID?.() ?? `cellwatch-${Date.now()}-${Math.random().toString(36).slice(2)}` } = {}) {
  let unavailable = false;
  let unavailableReason = 'offline';
  return {
    async choose(rawTurn, { signal } = {}) {
      const turn = normalizeEnemyTurn(rawTurn);
      const fallback = reason => ({ id: chooseLocal(turn), interval: LOCAL_INTERVAL, tactic: 'local', source: 'local', reason });
      if (unavailable || typeof fetchImpl !== 'function') return fallback(unavailableReason);
      if (signal?.aborted) return fallback('cancelled');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      let timer;
      try {
        // Race the entire operation, including body decoding, even if a provider ignores abort.
        const operation = (async () => {
          const response = await fetchImpl('/api/enemy/decide', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, turn }), signal: controller.signal,
            credentials: 'same-origin', cache: 'no-store'
          });
          if (response.status === 401) {
            unavailable = true;
            unavailableReason = 'sign-in-required';
            return fallback(unavailableReason);
          }
          if (!response.ok) {
            if (response.status === 404 || response.status === 405 || response.status === 501) {
              unavailable = true;
              unavailableReason = 'offline';
            }
            return fallback('api-error');
          }
          const length = Number(response.headers?.get?.('content-length') ?? 0);
          if (length > 4096) return fallback('invalid-response');
          const result = await response.json();
          if (!result || !validEnemyAction(turn, result) ||
              !['local', 'decisions'].includes(result.source) || !REASONS.has(result.reason)) {
            return fallback('invalid-response');
          }
          if (result.source === 'local' && ['unconfigured', 'local-mode'].includes(result.reason)) {
            unavailable = true;
            unavailableReason = result.reason;
          }
          return { id: result.id, interval: result.interval ?? LOCAL_INTERVAL, tactic: result.tactic ?? 'local', source: result.source, reason: result.reason };
        })();
        const expired = new Promise(resolve => {
          timer = setTimeout(() => { controller.abort(); resolve(fallback('timeout')); }, timeoutMs);
        });
        const cancelled = new Promise(resolve => {
          controller.signal.addEventListener('abort', () => resolve(fallback(signal?.aborted ? 'cancelled' : 'timeout')), { once: true });
        });
        return await Promise.race([operation, expired, cancelled]);
      } catch {
        return fallback(signal?.aborted ? 'cancelled' : controller.signal.aborted ? 'timeout' : 'api-error');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    }
  };
}
