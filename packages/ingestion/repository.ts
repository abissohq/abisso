import type { AcceptedEvent } from '../contracts/session.ts';
import type pg from 'pg';
import type { Checkpoint } from '../contracts/capability.ts';

export type EventIdentity = { workspace_id: string; source_id: string; event_id: string };

export async function findRequest(client: pg.PoolClient, machineId: string, requestId: string) {
  return (await client.query('SELECT * FROM telemetry_batch_requests WHERE machine_id = $1 AND request_id = $2', [machineId, requestId])).rows[0];
}

export async function signalCollision(client: pg.PoolClient, machineId: string, code: 'event_id_collision' | 'request_id_collision') {
  await client.query('INSERT INTO ingestion_security_signals (machine_id, reason_code) VALUES ($1,$2)', [machineId, code]);
}

export async function acceptedReferences(client: pg.PoolClient, workspaceId: string, references: string[]): Promise<Set<string>> {
  const result = await client.query('SELECT event_id FROM canonical_event_ledger WHERE workspace_id = $1 AND event_id = ANY($2::text[])', [workspaceId, references]);
  return new Set(result.rows.map(row => row.event_id));
}

export async function findDisposition(client: pg.PoolClient, identity: EventIdentity) {
  return (await client.query('SELECT * FROM telemetry_event_dispositions WHERE workspace_id = $1 AND source_id = $2 AND event_id = $3', [identity.workspace_id, identity.source_id, identity.event_id])).rows[0];
}

export async function acceptEvent(client: pg.PoolClient, event: AcceptedEvent): Promise<string> {
  const ledgerId: string = (await client.query(
    `INSERT INTO canonical_event_ledger (workspace_id, user_id, machine_id, source_id, stream_id, source_sequence, event_id, schema_version, event_kind, session_id, occurred_at, observed_at, received_at, event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ledger_id`,
    [event.workspace_id, event.user_id, event.machine_id, event.source.source_id, event.source.stream_id, event.source.source_sequence, event.event_id, event.schema_version, event.event_kind, 'session_id' in event ? event.session_id : null, event.occurred_at, event.observed_at, event.received_at, event],
  )).rows[0].ledger_id;
  await client.query('INSERT INTO projection_jobs (ledger_id) VALUES ($1)', [ledgerId]);
  if (event.event_kind === 'capabilities.declared') await client.query(
    `INSERT INTO active_capability_declarations VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (source_id) DO UPDATE SET declaration_id = EXCLUDED.declaration_id, ledger_id = EXCLUDED.ledger_id, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until`,
    [event.source.source_id, event.payload.declaration_id, ledgerId, event.payload.valid_from, event.payload.valid_until ?? null],
  );
  return ledgerId;
}

export async function saveDisposition(client: pg.PoolClient, outcome: EventIdentity & {
  digest: string; disposition: 'accepted' | 'rejected' | 'quarantined'; reason_code: string | null;
  quarantine_id: string | null;
  ledger_id: string | null; stream_id: string | null; source_sequence: number | null;
}) {
  await client.query(
    `INSERT INTO telemetry_event_dispositions (workspace_id, source_id, event_id, digest, disposition, reason_code, ledger_id, stream_id, source_sequence, quarantine_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [outcome.workspace_id, outcome.source_id, outcome.event_id, outcome.digest, outcome.disposition, outcome.reason_code, outcome.ledger_id, outcome.stream_id, outcome.source_sequence, outcome.quarantine_id],
  );
}

export async function durableCheckpoint(client: pg.PoolClient, stream: { source_id: string; stream_id: string }): Promise<Checkpoint> {
  // The smallest missing sequence is a durable gap; never use MAX(sequence).
  const sequences = (await client.query('SELECT DISTINCT source_sequence FROM telemetry_event_dispositions WHERE source_id = $1 AND stream_id = $2 AND source_sequence IS NOT NULL ORDER BY source_sequence', [stream.source_id, stream.stream_id])).rows;
  let highest = 0;
  for (const row of sequences) {
    if (Number(row.source_sequence) !== highest + 1) break;
    highest++;
  }
  await client.query('INSERT INTO source_checkpoints VALUES ($1,$2,$3) ON CONFLICT (source_id, stream_id) DO UPDATE SET highest_durable_sequence = EXCLUDED.highest_durable_sequence', [stream.source_id, stream.stream_id, highest]);
  return { ...stream, highest_durable_sequence: highest };
}

export async function finalizeRequest(client: pg.PoolClient, record: { machine_id: string; request_id: string; digest: string; response: string; source_ids: string[] }) {
  await client.query('INSERT INTO telemetry_batch_requests (machine_id, request_id, digest, response, source_ids) VALUES ($1,$2,$3,$4,$5)', [record.machine_id, record.request_id, record.digest, record.response, record.source_ids]);
}
