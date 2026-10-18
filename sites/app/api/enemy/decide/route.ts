import {boundedJson, enemyService, json, visitor} from '../../../../lib/enemy-service';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'same-origin-required'}, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'json-required'}, 415);
  const service = enemyService();
  const user = await visitor();
  if (service.status.mode === 'decisions' && !user) return json({error:'sign-in-required'}, 401);
  try {
    const payload = await boundedJson(request);
    if (!payload || typeof payload.sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(payload.sessionId)) return json({error:"invalid-request"}, 400);
    return json(await service.decide(`${user?.userId ?? "anonymous-local"}:${payload.sessionId}`, payload.turn));
  } catch (error) {
    return json({error: error instanceof Error && error.message === 'body-too-large' ? 'body-too-large' : 'invalid-turn'}, error instanceof Error && error.message === 'body-too-large' ? 413 : 400);
  }
}
