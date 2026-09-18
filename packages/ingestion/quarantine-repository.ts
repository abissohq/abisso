import type pg from 'pg';
import type { SyntheticExtensions } from '../contracts/quarantine.ts';

export async function saveQuarantine(client: pg.PoolClient, scope: { workspace_id: string; source_id: string }, extension: SyntheticExtensions): Promise<string> {
  return (await client.query(`INSERT INTO telemetry_quarantine (workspace_id, source_id, extension, created_at, expires_at)
    SELECT $1,$2,$3,created,created + interval '1 hour' FROM (SELECT clock_timestamp() AS created) stamp
    RETURNING quarantine_id`, [scope.workspace_id, scope.source_id, extension])).rows[0].quarantine_id;
}

// Tombstones preserve atomic references and final outcomes without retaining content.
export async function purgeExpiredQuarantine(db: pg.Pool | pg.PoolClient) {
  await db.query('UPDATE telemetry_quarantine SET extension=NULL WHERE extension IS NOT NULL AND expires_at <= clock_timestamp()');
}
