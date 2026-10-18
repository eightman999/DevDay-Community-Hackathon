import {env, waitUntil} from 'cloudflare:workers';
// Shared with the local Node server; CSV imports are embedded by cellwatchData().
import {createDecisionService} from '../../server/decision-service.mjs';
import {createCompanionService} from '../../server/companion-service.mjs';
import {getChatGPTUser} from '../app/chatgpt-auth';

type EnemyEnv = {OPENAI_API_KEY?: string; ENEMY_MODE?: string; ENEMY_AI_ENABLED?: string; COMPANION_AI_ENABLED?: string};
let companion: ReturnType<typeof createCompanionService> | undefined;
let companionKey = '';
export function companionService() {
  const settings = env as unknown as EnemyEnv;
  const enabled = settings.COMPANION_AI_ENABLED === 'true';
  const key = enabled ? settings.OPENAI_API_KEY ?? '' : '';
  if (!companion || companionKey !== key) {
    companionKey = key;
    companion = createCompanionService({apiKey:key,enabled,defer:waitUntil});
  }
  return companion;
}
type Service = ReturnType<typeof createDecisionService>;
const createService = createDecisionService as (options: {apiKey?: string; mode?: string}) => Service;
let active: Service | undefined;
let activeKey = '';
export const MAX_BODY_BYTES = 32768;

export function enemyService() {
  const settings = env as unknown as EnemyEnv;
  // Deliberate opt-in: isolate-local counters are not a global billing cap.
  const enabled = settings.ENEMY_AI_ENABLED === 'true';
  const apiKey = enabled ? settings.OPENAI_API_KEY ?? '' : '';
  const key = `${enabled}:${settings.ENEMY_MODE ?? 'auto'}:${apiKey}`;
  if (!active || key !== activeKey) {
    activeKey = key;
    active = createService({apiKey, mode: enabled && ["auto", "local", "decisions"].includes(settings.ENEMY_MODE ?? "auto") ? settings.ENEMY_MODE : 'local'});
  }
  return active;
}

export async function visitor() { return getChatGPTUser(); }
export function json(value: unknown, status = 200) {
  return Response.json(value, {status, headers: {'Cache-Control':'no-store'}});
}
export async function boundedJson(request: Request) {
  const length = request.headers.get('content-length');
  if (length && Number(length) > MAX_BODY_BYTES) throw new Error('body-too-large');
  if (!request.body) throw new Error('invalid-body');
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('body-too-large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) { merged.set(chunk, at); at += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(merged));
}
