import { database } from '../packages/database/database.ts';
import { purgeExpiredQuarantine } from '../packages/ingestion/quarantine-repository.ts';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) throw new Error('synthetic_maintenance_forbidden');
const db = database();
try {
  await purgeExpiredQuarantine(db);
  console.log('quarantine_purged');
} catch {
  console.error('quarantine_cleanup_failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
