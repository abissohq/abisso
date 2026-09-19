import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { AcceptedEvent } from '../contracts/session.ts';
import type { projectCapability } from './capabilities.ts';

export type ClaimedJob = { ledger_id: string; event: AcceptedEvent; owner_id: string; attempt_count: number };

// The claim is its own transaction: a process crash still consumes the attempt.
export async function claimPendingJob(client: pg.PoolClient, leaseMs: number): Promise<ClaimedJob | undefined> {
  for (;;) {
    const job = (await client.query<{ ledger_id: string; attempt_count: number; status: string }>(
    `SELECT j.ledger_id, j.attempt_count, j.status FROM projection_jobs j
     JOIN canonical_event_ledger l ON l.ledger_id=j.ledger_id
     WHERE ((j.status='pending' AND j.available_at <= clock_timestamp())
        OR (j.status='running' AND j.lease_expires_at <= clock_timestamp()))
       AND (l.session_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM projection_jobs earlier
         JOIN canonical_event_ledger e ON e.ledger_id=earlier.ledger_id
         WHERE e.workspace_id=l.workspace_id AND e.session_id=l.session_id
           AND e.ledger_id<l.ledger_id AND earlier.status IN ('pending','running')
       ))
     ORDER BY j.ledger_id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
    )).rows[0];
    if (!job) return undefined;
    if (job.attempt_count >= 5) {
      await client.query(`UPDATE projection_jobs SET status='dead_letter', owner_id=NULL,
        lease_expires_at=NULL, error_code='lease_expired' WHERE ledger_id=$1`, [job.ledger_id]);
      continue;
    }
    const owner_id = randomUUID();
    await client.query(`UPDATE projection_jobs SET status='running', owner_id=$2,
    lease_expires_at=clock_timestamp()+($3::integer * interval '1 millisecond'),
    attempt_count=attempt_count+1, error_code=NULL WHERE ledger_id=$1`, [job.ledger_id, owner_id, leaseMs]);
    const ledger = (await client.query<{ event: AcceptedEvent }>('SELECT event FROM canonical_event_ledger WHERE ledger_id=$1', [job.ledger_id])).rows[0];
    return { ledger_id: job.ledger_id, event: ledger.event, owner_id, attempt_count: job.attempt_count + 1 };
  }
}

export async function ownsLease(client: pg.PoolClient, job: ClaimedJob) {
  return (await client.query(`SELECT 1 FROM projection_jobs WHERE ledger_id=$1 AND status='running'
    AND owner_id=$2 AND lease_expires_at > clock_timestamp() FOR UPDATE`, [job.ledger_id, job.owner_id])).rowCount === 1;
}

export async function completeJob(client: pg.PoolClient, job: ClaimedJob) {
  const result = await client.query(`UPDATE projection_jobs SET status='completed', completed_at=clock_timestamp(),
    owner_id=NULL, lease_expires_at=NULL WHERE ledger_id=$1 AND status='running' AND owner_id=$2
    AND lease_expires_at > clock_timestamp()`, [job.ledger_id, job.owner_id]);
  if (result.rowCount !== 1) throw new Error('stale_claim');
}

export async function failJob(client: pg.PoolClient, job: ClaimedJob, backoffBaseMs: number) {
  const delay = Math.min(backoffBaseMs * 2 ** (job.attempt_count - 1), 2_147_483_647);
  await client.query(`UPDATE projection_jobs SET status=$3, owner_id=NULL, lease_expires_at=NULL,
    available_at=clock_timestamp()+($4::integer * interval '1 millisecond'), error_code='projection_failed'
    WHERE ledger_id=$1 AND owner_id=$2 AND status='running' AND lease_expires_at > clock_timestamp()`,
  [job.ledger_id, job.owner_id, job.attempt_count >= 5 ? 'dead_letter' : 'pending', delay]);
}

export async function completeCapabilityJob(client: pg.PoolClient, projection: ReturnType<typeof projectCapability>) {
  await client.query(
    `INSERT INTO source_capability_projection (source_id, declaration_id, ledger_id, projector_version)
     VALUES ($1,$2,$3,$4) ON CONFLICT (source_id) DO UPDATE
     SET declaration_id = EXCLUDED.declaration_id, ledger_id = EXCLUDED.ledger_id, projector_version = EXCLUDED.projector_version
     WHERE source_capability_projection.ledger_id < EXCLUDED.ledger_id`,
    [projection.source_id, projection.declaration_id, projection.ledger_id, projection.projector_version],
  );
}
