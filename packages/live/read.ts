import type pg from 'pg';
import { sessionDigest } from '../browser/authentication.ts';
import { RequestFailure, uuid } from '../contracts/capability.ts';
import { transaction } from '../database/database.ts';

export async function readLive(db: pg.Pool, cookie: string | undefined, claimedWorkspace: string | null) {
  return transaction(db, async client => {
    const digest = sessionDigest(cookie);
    const session = (await client.query(`SELECT user_id FROM browser_sessions WHERE digest=$1 AND user_id IS NOT NULL
      AND expires_at > clock_timestamp() AND last_seen_at > clock_timestamp() - interval '15 minutes' FOR UPDATE`, [digest])).rows[0];
    if (!session) throw new RequestFailure(401, 'unauthenticated');
    const member = (await client.query(`SELECT m.workspace_id FROM memberships m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.user_id=$1 AND m.active AND u.active AND w.active FOR SHARE OF m,u,w`, [session.user_id])).rows[0];
    if (!member || (claimedWorkspace !== null && (!uuid.safeParse(claimedWorkspace).success || claimedWorkspace !== member.workspace_id))) throw new RequestFailure(403, 'inactive_authority');
    await client.query('UPDATE browser_sessions SET last_seen_at=clock_timestamp() WHERE digest=$1', [digest]);
    // One statement supplies the revision, rows and server time from the same
    // PostgreSQL view, even while the independent worker commits a projection.
    const snapshot = (await client.query(`SELECT COALESCE((SELECT revision::text FROM workspace_projection_revisions WHERE workspace_id=$1),'0') AS workspace_projection_revision,
      clock_timestamp() AS server_now,
      COALESCE((SELECT jsonb_agg(nested.data ORDER BY nested.id) FROM (
        SELECT w.id, w.data || jsonb_build_object('revision',w.revision::text,'ledger_watermark',w.ledger_watermark::text,
          'sessions',COALESCE((SELECT jsonb_agg(s.data || jsonb_build_object('revision',s.revision::text,'ledger_watermark',s.ledger_watermark::text) ORDER BY s.id)
            FROM session_projection s WHERE s.workspace_id=w.workspace_id AND s.workstream_id=w.id),'[]'::jsonb)) AS data
        FROM workstream_projection w WHERE w.workspace_id=$1
      ) nested),'[]'::jsonb) AS workstreams`, [member.workspace_id])).rows[0];
    return { ...snapshot, server_now: snapshot.server_now.toISOString() };
  });
}
