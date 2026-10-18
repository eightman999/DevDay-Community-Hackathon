import {enemyService, json, visitor} from '../../../../lib/enemy-service';
export const dynamic = 'force-dynamic';
export async function GET() {
  const service = enemyService();
  const user = await visitor();
  return json({...service.status, mode: service.status.mode === 'decisions' && !user ? 'local' : service.status.mode, signInRequired: service.status.mode === 'decisions' && !user});
}
