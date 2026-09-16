import type pg from 'pg';
import type { AcceptedCapabilityEvent } from '../contracts/capability.ts';
import type { projectCapability } from './capabilities.ts';

export async function claimPendingJob(client: pg.PoolClient) {
  const job = (await client.query<{ ledger_id: string }>(
    `SELECT ledger_id FROM projection_jobs WHERE status = 'pending'
     ORDER BY ledger_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
  )).rows[0];
  if (!job) return undefined;
  const ledger = (await client.query<{ event: AcceptedCapabilityEvent }>('SELECT event FROM canonical_event_ledger WHERE ledger_id = $1', [job.ledger_id])).rows[0];
  return { ledger_id: job.ledger_id, event: ledger.event };
}

export async function completeCapabilityJob(client: pg.PoolClient, projection: ReturnType<typeof projectCapability>) {
  await client.query(
    `INSERT INTO source_capability_projection (source_id, declaration_id, ledger_id, projector_version)
     VALUES ($1,$2,$3,$4) ON CONFLICT (source_id) DO UPDATE
     SET declaration_id = EXCLUDED.declaration_id, ledger_id = EXCLUDED.ledger_id, projector_version = EXCLUDED.projector_version
     WHERE source_capability_projection.ledger_id < EXCLUDED.ledger_id`,
    [projection.source_id, projection.declaration_id, projection.ledger_id, projection.projector_version],
  );
  await client.query("UPDATE projection_jobs SET status = 'completed', completed_at = clock_timestamp() WHERE ledger_id = $1", [projection.ledger_id]);
}
