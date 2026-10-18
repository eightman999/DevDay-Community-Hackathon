import {companionService, json, visitor} from '../../../../lib/enemy-service';
export const dynamic = 'force-dynamic';
export async function GET() {
  const service=companionService(),user=await visitor();
  return json({...service.status,mode:service.status.configured&&!user?'local':service.status.mode,signInRequired:service.status.configured&&!user});
}
