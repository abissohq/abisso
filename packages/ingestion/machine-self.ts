import { createHash } from 'node:crypto';
import type pg from 'pg';
import { RequestFailure } from '../contracts/capability.ts';

export async function machineSelf(db: pg.Pool, authorization: string | undefined) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
  if (!token) throw new RequestFailure(401, 'invalid_credentials');
  const digest = createHash('sha256').update(token).digest('hex');
  const result = await db.query(`SELECT m.id AS machine_id, m.workspace_id, m.user_id, m.display_name
    FROM machine_credentials c JOIN machines m ON m.id=c.machine_id
    JOIN users u ON u.id=m.user_id JOIN memberships b ON b.user_id=m.user_id AND b.workspace_id=m.workspace_id
    JOIN workspaces w ON w.id=m.workspace_id WHERE c.digest=$1 AND c.audience='machine:access'
    AND c.expires_at > clock_timestamp() AND NOT c.revoked AND m.active AND u.active AND b.active AND w.active`, [digest]);
  if (!result.rowCount) throw new RequestFailure(401, 'invalid_credentials');
  return { ...result.rows[0], scope: 'telemetry:write machine:self' };
}
