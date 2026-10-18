import {boundedJson, companionService, json, visitor} from '../../../../lib/enemy-service';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'same-origin-required'},403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return json({error:'json-required'},415);
  const service=companionService(),user=await visitor();
  if(service.status.configured&&!user)return json({error:'sign-in-required'},401);
  try {
    const payload=await boundedJson(request);
    if(typeof payload?.sessionId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(payload.sessionId))return json({error:'invalid-request'},400);
    return json(await service.message(`${user?.userId??'anonymous-local'}:${payload.sessionId}`,payload));
  }catch(error){return json({error:error instanceof Error&&error.message==='body-too-large'?'body-too-large':'invalid-request'},error instanceof Error&&error.message==='body-too-large'?413:400);}
}
