import { projectSessionCompletion, projectSessionHeartbeat, projectSessionStart } from './sessions.ts';
import type pg from 'pg';
import { transaction } from '../database/database.ts';
import { projectCapability } from './capabilities.ts';
import { claimPendingJob, completeCapabilityJob, completeJob, failJob, ownsLease } from './repository.ts';

export type WorkerOptions = { leaseMs?: number; backoffBaseMs?: number };
export async function processNext(db: pg.Pool, options: WorkerOptions = {}): Promise<boolean> {
  const leaseMs = options.leaseMs ?? 30_000;
  const backoffBaseMs = options.backoffBaseMs ?? 1_000;
  if (![leaseMs, backoffBaseMs].every(value => Number.isInteger(value) && value > 0 && value <= 2_147_483_647)) throw new Error('invalid_worker_config');
  const job = await transaction(db, client => claimPendingJob(client, leaseMs));
  if (!job) return false;
  try {
    await transaction(db, async client => {
      if (!await ownsLease(client, job)) return;
      if (job.event.event_kind === 'capabilities.declared') await completeCapabilityJob(client, projectCapability(job.ledger_id, job.event));
      else if (job.event.event_kind === 'session.started') await projectSessionStart(client, job.ledger_id, job.event);
      else if (job.event.event_kind === 'session.activity') await projectSessionHeartbeat(client, job.ledger_id, job.event);
      else if (job.event.event_kind === 'session.completed') await projectSessionCompletion(client, job.ledger_id, job.event);
      else throw new Error('unsupported_projection');
      await completeJob(client, job);
    });
  } catch {
    // Projection changes, revision and NOTIFY were rolled back. Only safe codes persist.
    await transaction(db, client => failJob(client, job, backoffBaseMs));
  }
  return true;
}
