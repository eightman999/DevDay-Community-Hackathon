import { localCompanion, validSupportAction } from './companion-context.mjs';

const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function validCompanionResponse(value, kind) {
  return !!value && ['agents', 'local'].includes(value.source) && text(value.reason, 80) && text(value.message, 600) &&
    (kind !== 'review' || (!!value.review && ['good', 'improve', 'next'].every(key => text(value.review[key], 400)))) &&
    (kind !== 'support' || (!!value.action && ['wait','repair','quarantine'].includes(value.action.kind)));
}
export function createCompanionProvider({fetchImpl = globalThis.fetch, timeoutMs = 45000,
  sessionId = globalThis.crypto?.randomUUID?.() ?? '00000000-0000-4000-8000-000000000000'} = {}) {
  let request = 0;
  const provider = {
    async message(context, kind = 'consult', {signal} = {}) {
      const fallback = reason => ({...localCompanion(context, kind), source:'local', reason});
      if (signal?.aborted) return fallback('cancelled');
      if (typeof fetchImpl !== 'function') return fallback('offline');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, {once:true});
      let timer;
      try {
        const operation = (async () => {
          const response = await fetchImpl('/api/companion/message', {method:'POST', credentials:'same-origin', cache:'no-store',
            headers:{'Content-Type':'application/json'}, signal:controller.signal,
            body:JSON.stringify({sessionId, requestId:`companion_${++request}`, kind, context})});
          if (response.status === 401) return fallback('sign-in-required');
          if ([404,405,501].includes(response.status)) return fallback('offline');
          if (!response.ok) return fallback('api-error');
          if (Number(response.headers?.get?.('content-length') ?? 0) > 8192) return fallback('invalid-response');
          const value = await response.json();
          return validCompanionResponse(value,kind) && (kind!=='support'||validSupportAction(context,value.action)) ? {source:value.source,reason:value.reason,message:value.message,
            ...(kind==='review'?{review:{good:value.review.good,improve:value.review.improve,next:value.review.next}}:{}),...(kind==='support'?{action:{kind:value.action.kind,type:value.action.type}}:{})} : fallback('invalid-response');
        })();
        const stopped = new Promise(resolve => {
          controller.signal.addEventListener('abort',()=>resolve(fallback(signal?.aborted?'cancelled':'timeout')),{once:true});
          timer = setTimeout(()=>controller.abort(),timeoutMs);
        });
        return await Promise.race([operation,stopped]);
      } catch { return fallback(signal?.aborted?'cancelled':controller.signal.aborted?'timeout':'api-error'); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
    }
  };
  provider.support=(context,options={})=>provider.message(context,'support',options);
  return provider;
}
export function companionSource(result) {
  if (result.source === 'agents') return 'Agents API';
  const reasons = {'sign-in-required':'ログインが必要',unconfigured:'API未設定',offline:'静的配信・接続なし',timeout:'応答時間切れ','api-error':'API接続失敗','invalid-response':'応答を確認できません',budget:'利用上限',cancelled:'相談を終了'};
  return `定型応答${reasons[result.reason] ? `（${reasons[result.reason]}）` : ''}`;
}
