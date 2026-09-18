import { projectSessionStart } from './sessions.ts';
import type pg from 'pg';
import { transaction } from '../database/database.ts';
import { projectCapability } from './capabilities.ts';
import { claimPendingJob, completeCapabilityJob } from './repository.ts';

// Foundation worker: one short transaction holds the claim and commits projection
// plus completion. The leased retry/backoff/dead-letter lifecycle belongs to #7.
export async function processNext(db: pg.Pool): Promise<boolean> {
  return transaction(db, async client => {
    const job = await claimPendingJob(client);
    if (!job) return false;
    if (job.event.event_kind === 'capabilities.declared') await completeCapabilityJob(client, projectCapability(job.ledger_id, job.event));
    else {
      await projectSessionStart(client, job.ledger_id, job.event);
      await client.query("UPDATE projection_jobs SET status='completed', completed_at=clock_timestamp() WHERE ledger_id=$1", [job.ledger_id]);
    }
    return true;
  });
}
