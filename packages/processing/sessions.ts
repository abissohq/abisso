import { v5 } from 'uuid';
import type pg from 'pg';
import type { AcceptedSessionStartedEvent } from '../contracts/session.ts';

export const sessionProjectorVersion = 'm0-session-start-v1';
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
    created_at: event.occurred_at, ...evidence, last_meaningful_update_at: null,
    repository: 'not_collected', branch: 'not_collected', cost: 'not_collected', attention: 'not_evaluated', projector_version: sessionProjectorVersion,
  };
  const session = {
    id: event.session_id, provider: event.source.provider, state: 'Starting', started_at: event.occurred_at, ...evidence,
    identity_provenance: { fact_class: 'observed', source_id: event.source.source_id, event_id: event.event_id },
    membership_provenance: { fact_class: 'inferred', evidence_source_id: event.source.source_id, evidence_event_id: event.event_id,
      resolver_version: sessionProjectorVersion, confidence: { score: 50, band: 'Medium' }, explanation_codes: ['provisional_session_origin'],
      evidence_features: { session_origin: true, repository_availability: 'not_collected' } },
    projector_version: sessionProjectorVersion,
  };
  await client.query('INSERT INTO workstream_projection VALUES ($1,$2,$3,$4,$5)', [event.workspace_id, id, revision, ledgerId, workstream]);
  await client.query('INSERT INTO session_projection VALUES ($1,$2,$3,$4,$5,$6)', [event.workspace_id, event.session_id, id, revision, ledgerId, session]);
}
