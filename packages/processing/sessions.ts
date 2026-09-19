import { v5 } from 'uuid';
import type pg from 'pg';
import type { AcceptedSessionActivityEvent, AcceptedSessionCompletedEvent, AcceptedSessionStartedEvent } from '../contracts/session.ts';
import { projectionInvalidationChannel } from '../live/realtime-channel.ts';

export const sessionProjectorVersion = 'm0-session-heartbeat-v1';
async function notify(client: pg.PoolClient, workspace_id: string, entity_id: string, revision: string) {
  await client.query('SELECT pg_notify($1,$2)', [projectionInvalidationChannel, JSON.stringify({ workspace_id, projection_type: 'workstream', entity_id, revision: String(revision) })]);
}
export async function projectSessionStart(client: pg.PoolClient, ledgerId: string, event: AcceptedSessionStartedEvent) {
  // Serialize projection mutation and its coherency fence within this workspace.
  await client.query('INSERT INTO workspace_projection_revisions (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [event.workspace_id]);
  await client.query('SELECT revision FROM workspace_projection_revisions WHERE workspace_id=$1 FOR UPDATE', [event.workspace_id]);
  const existing = (await client.query('SELECT ledger_watermark FROM session_projection WHERE workspace_id=$1 AND id=$2', [event.workspace_id, event.session_id])).rows[0];
  // Session creation is founded once in ledger acceptance order. Duplicate starts
  // do not refound membership or overwrite the canonical start observation.
  if (existing) return;
  const revision = (await client.query('UPDATE workspace_projection_revisions SET revision=revision+1 WHERE workspace_id=$1 RETURNING revision', [event.workspace_id])).rows[0].revision;
  const id = v5(`provisional-workstream:v1:${event.source.source_id}:${event.event_id}`, event.workspace_id);
  const evidence = {
    latest_evidence_event_id: event.event_id,
    latest_observed_at: event.observed_at,
    latest_received_at: event.received_at,
  };
  const workstream = {
    id, label: 'Untitled workstream', label_provenance: 'system_fallback', state: 'Active', provisional: true,
    identity_scheme_version: 'provisional-workstream:v1', created_from_source_id: event.source.source_id, created_from_event_id: event.event_id,
    created_at: event.occurred_at, ...evidence, latest_source_contact_at: event.received_at, last_meaningful_update_at: null,
    repository: 'not_collected', branch: 'not_collected', cost: 'not_collected', attention: 'not_evaluated', projector_version: sessionProjectorVersion,
  };
  const session = {
    id: event.session_id, provider: event.source.provider, state: 'Starting', started_at: event.occurred_at, ...evidence,
    latest_source_contact_at: event.received_at,
    identity_provenance: { fact_class: 'observed', source_id: event.source.source_id, event_id: event.event_id },
    membership_provenance: { fact_class: 'inferred', evidence_source_id: event.source.source_id, evidence_event_id: event.event_id,
      resolver_version: sessionProjectorVersion, confidence: { score: 50, band: 'Medium' }, explanation_codes: ['provisional_session_origin'],
      evidence_features: { session_origin: true, repository_availability: 'not_collected' } },
    projector_version: sessionProjectorVersion,
  };
  await client.query('INSERT INTO workstream_projection VALUES ($1,$2,$3,$4,$5)', [event.workspace_id, id, revision, ledgerId, workstream]);
  await client.query('INSERT INTO session_projection VALUES ($1,$2,$3,$4,$5,$6)', [event.workspace_id, event.session_id, id, revision, ledgerId, session]);
  await notify(client, event.workspace_id, id, revision);
}

export async function projectSessionHeartbeat(client: pg.PoolClient, ledgerId: string, event: AcceptedSessionActivityEvent) {
  await client.query('SELECT revision FROM workspace_projection_revisions WHERE workspace_id=$1 FOR UPDATE', [event.workspace_id]);
  const row = (await client.query<{ workstream_id: string; ledger_watermark: string; data: Record<string, unknown> }>(
    'SELECT workstream_id, ledger_watermark, data FROM session_projection WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [event.workspace_id, event.session_id],
  )).rows[0];
  if (!row || BigInt(row.ledger_watermark) >= BigInt(ledgerId) || row.data.state === 'Completed') return;
  // The emitted counter is evidence from the source, never a server increment.
  // Ledger acceptance order is not source chronology for offline delivery, so
  // this projector does not infer progress or repair a source's counter.
  const revision = (await client.query('UPDATE workspace_projection_revisions SET revision=revision+1 WHERE workspace_id=$1 RETURNING revision', [event.workspace_id])).rows[0].revision;
  const evidence = { latest_evidence_event_id: event.event_id, latest_observed_at: event.observed_at,
    latest_received_at: event.received_at, latest_source_contact_at: event.received_at, projector_version: sessionProjectorVersion };
  await client.query(`UPDATE session_projection SET revision=$3, ledger_watermark=$4,
    data=data || $5::jsonb WHERE workspace_id=$1 AND id=$2`, [event.workspace_id, event.session_id, revision, ledgerId,
    JSON.stringify({ ...evidence, state: 'Running', progress_counter: event.payload.progress_counter })]);
  await client.query(`UPDATE workstream_projection SET revision=$3, ledger_watermark=$4,
    data=data || $5::jsonb WHERE workspace_id=$1 AND id=$2`, [event.workspace_id, row.workstream_id, revision, ledgerId, JSON.stringify(evidence)]);
  await notify(client, event.workspace_id, row.workstream_id, revision);
}

export async function projectSessionCompletion(client: pg.PoolClient, ledgerId: string, event: AcceptedSessionCompletedEvent) {
  await client.query('SELECT revision FROM workspace_projection_revisions WHERE workspace_id=$1 FOR UPDATE', [event.workspace_id]);
  const row = (await client.query<{ workstream_id: string; ledger_watermark: string; data: { state: string } }>(
    'SELECT workstream_id, ledger_watermark, data FROM session_projection WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [event.workspace_id, event.session_id],
  )).rows[0];
  if (!row || BigInt(row.ledger_watermark) >= BigInt(ledgerId) || row.data.state === 'Completed') return;
  const revision = (await client.query('UPDATE workspace_projection_revisions SET revision=revision+1 WHERE workspace_id=$1 RETURNING revision', [event.workspace_id])).rows[0].revision;
  const evidence = { latest_evidence_event_id: event.event_id, latest_observed_at: event.observed_at,
    latest_received_at: event.received_at, projector_version: sessionProjectorVersion };
  await client.query(`UPDATE session_projection SET revision=$3, ledger_watermark=$4, data=data || $5::jsonb
    WHERE workspace_id=$1 AND id=$2`, [event.workspace_id, event.session_id, revision, ledgerId,
    JSON.stringify({ ...evidence, state: 'Completed', completed_at: event.occurred_at })]);
  await client.query(`UPDATE workstream_projection SET revision=$3, ledger_watermark=$4, data=data || $5::jsonb
    WHERE workspace_id=$1 AND id=$2`, [event.workspace_id, row.workstream_id, revision, ledgerId, JSON.stringify(evidence)]);
  await notify(client, event.workspace_id, row.workstream_id, revision);
}
