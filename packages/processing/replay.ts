import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type pg from 'pg';
import type { AcceptedEvent } from '../contracts/session.ts';
import { projectorVersion as capabilityProjectorVersion } from './capabilities.ts';
import { sessionProjectorVersion } from './sessions.ts';
import { projectAcceptedEvent } from './worker.ts';

type ProjectionRow = { id: string; workstream_id?: string; revision: string; ledger_watermark: string; data: Record<string, unknown> };
type CapabilityRow = { source_id: string; declaration_id: string; ledger_id: string; projector_version: string };
type Snapshot = {
  sessions: ProjectionRow[];
  workstreams: ProjectionRow[];
  capabilities: CapabilityRow[];
  revision: string;
};

const sessionFields = [
  'id', 'provider', 'state', 'started_at', 'completed_at', 'latest_evidence_event_id',
  'latest_observed_at', 'latest_received_at', 'latest_source_contact_at', 'progress_counter',
  'identity_provenance', 'membership_provenance', 'projector_version',
] as const;
const workstreamFields = [
  'id', 'label', 'label_provenance', 'state', 'provisional', 'identity_scheme_version',
  'created_from_source_id', 'created_from_event_id', 'created_at', 'latest_evidence_event_id',
  'latest_observed_at', 'latest_received_at', 'latest_source_contact_at',
  'last_meaningful_update_at', 'repository', 'branch', 'cost', 'attention', 'projector_version',
] as const;

function selected(data: Record<string, unknown>, fields: readonly string[]) {
  // A projector field must be classified here before verification can pass.
  // This prevents a new semantic field from silently escaping comparison.
  if (Object.keys(data).some(field => !fields.includes(field))) throw new Error('unclassified_projection_field');
  return Object.fromEntries(fields.filter(field => Object.hasOwn(data, field)).map(field => [field, data[field]]));
}

function semantic(snapshot: Snapshot) {
  return {
    capabilities: snapshot.capabilities.map(({ source_id, declaration_id, projector_version }) => ({ source_id, declaration_id, projector_version })),
    sessions: snapshot.sessions.map(row => ({ id: row.id, workstream_id: row.workstream_id, data: selected(row.data, sessionFields) })),
    workstreams: snapshot.workstreams.map(row => ({ id: row.id, data: selected(row.data, workstreamFields) })),
  };
}

function digest(value: unknown) {
  return createHash('sha256').update(canonicalize(value)!).digest('hex');
}

function revisions(snapshot: Snapshot) {
  return {
    workspace_revision: snapshot.revision,
    sessions: snapshot.sessions.map(row => [row.id, row.revision]),
    workstreams: snapshot.workstreams.map(row => [row.id, row.revision]),
  };
}

function coherentRevisions(snapshot: Snapshot, mutationCounts: Map<string, bigint>) {
  // M0 mutates one session/Workstream pair per revision. Commit order across
  // independent sessions can differ from ledger order, but these fences must
  // still describe a coherent snapshot of effective mutations.
  const workspaceRevision = BigInt(snapshot.revision);
  if (workspaceRevision < 0n || (workspaceRevision === 0n) !== (snapshot.workstreams.length === 0)) return false;
  const workstreams = new Map(snapshot.workstreams.map(row => [row.id, row]));
  const currentRevisions = new Set<string>();
  for (const row of snapshot.workstreams) {
    const revision = BigInt(row.revision);
    if (revision < 1n || revision > workspaceRevision || currentRevisions.has(row.revision)) return false;
    currentRevisions.add(row.revision);
  }
  if (snapshot.sessions.length !== snapshot.workstreams.length) return false;
  if (mutationCounts.size !== snapshot.sessions.length) return false;
  const referencedWorkstreams = new Set<string>();
  let totalMutations = 0n;
  for (const row of snapshot.sessions) {
    if (!row.workstream_id || referencedWorkstreams.has(row.workstream_id)
      || workstreams.get(row.workstream_id)?.revision !== row.revision) return false;
    const mutations = mutationCounts.get(row.id);
    if (!mutations || BigInt(row.revision) < mutations) return false;
    totalMutations += mutations;
    referencedWorkstreams.add(row.workstream_id);
  }
  if (totalMutations !== workspaceRevision || (workspaceRevision > 0n && !currentRevisions.has(snapshot.revision))) return false;
  // By each row's final revision, enough commit slots must exist for every
  // mutation to rows whose final revision is at or below that fence.
  let requiredMutations = 0n;
  for (const row of [...snapshot.sessions].sort((a, b) => BigInt(a.revision) < BigInt(b.revision) ? -1 : 1)) {
    requiredMutations += mutationCounts.get(row.id)!;
    if (requiredMutations > BigInt(row.revision)) return false;
  }
  return true;
}

function watermarks(snapshot: Snapshot) {
  return {
    capabilities: snapshot.capabilities.map(row => [row.source_id, row.ledger_id]),
    sessions: snapshot.sessions.map(row => [row.id, row.ledger_watermark]),
    workstreams: snapshot.workstreams.map(row => [row.id, row.ledger_watermark]),
  };
}

async function snapshot(client: pg.PoolClient, workspaceId: string): Promise<Snapshot> {
  const sessions = await client.query<ProjectionRow>('SELECT id, workstream_id, revision, ledger_watermark, data FROM session_projection WHERE workspace_id=$1 ORDER BY id', [workspaceId]);
  const workstreams = await client.query<ProjectionRow>('SELECT id, revision, ledger_watermark, data FROM workstream_projection WHERE workspace_id=$1 ORDER BY id', [workspaceId]);
  const capabilities = await client.query<CapabilityRow>(`SELECT p.source_id, p.declaration_id, p.ledger_id, p.projector_version
      FROM source_capability_projection p JOIN sources s ON s.id=p.source_id
      WHERE s.workspace_id=$1 ORDER BY p.source_id`, [workspaceId]);
  const revision = await client.query<{ revision: string }>('SELECT revision FROM workspace_projection_revisions WHERE workspace_id=$1', [workspaceId]);
  return { sessions: sessions.rows, workstreams: workstreams.rows, capabilities: capabilities.rows, revision: revision.rows[0]?.revision ?? '0' };
}

export type ReplayVerification = {
  projector_versions: { session: string; capability: string };
  accepted_event_count: number;
  semantic: { equal: boolean; live_digest: string; replay_digest: string };
  revisions: { equal: boolean; live: ReturnType<typeof revisions>; replay: ReturnType<typeof revisions> };
  ledger_watermarks: { equal: boolean; live: ReturnType<typeof watermarks>; replay: ReturnType<typeof watermarks> };
};

/** Rebuilds one workspace in transaction-local tables. No promotion API exists. */
export async function verifyReplay(db: pg.Pool, workspaceId: string): Promise<ReplayVerification> {
  const client = await db.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const ledger = await client.query<{ ledger_id: string; source_id: string; event: AcceptedEvent }>(
      'SELECT ledger_id, source_id, event FROM canonical_event_ledger WHERE workspace_id=$1 ORDER BY ledger_id', [workspaceId],
    );
    const live = await snapshot(client, workspaceId);
    // TEMP relations shadow only the projection tables on this connection. They
    // have no live foreign keys, jobs, mappings, or notification delivery state.
    await client.query(`CREATE TEMP TABLE workspace_projection_revisions (workspace_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 0) ON COMMIT DROP;
      CREATE TEMP TABLE workstream_projection (workspace_id uuid NOT NULL, id uuid NOT NULL, revision bigint NOT NULL, ledger_watermark bigint NOT NULL, data jsonb NOT NULL, PRIMARY KEY (workspace_id,id)) ON COMMIT DROP;
      CREATE TEMP TABLE session_projection (workspace_id uuid NOT NULL, id text NOT NULL, workstream_id uuid NOT NULL, revision bigint NOT NULL, ledger_watermark bigint NOT NULL, data jsonb NOT NULL, PRIMARY KEY (workspace_id,id)) ON COMMIT DROP;
      CREATE TEMP TABLE source_capability_projection (source_id uuid PRIMARY KEY, declaration_id text NOT NULL, ledger_id bigint NOT NULL, projector_version text NOT NULL) ON COMMIT DROP`);
    const mutationCounts = new Map<string, bigint>();
    let replayRevision = 0n;
    for (const fact of ledger.rows) {
      if (fact.event.source.source_id !== fact.source_id) throw new Error('ledger_source_mismatch');
      await projectAcceptedEvent(client, fact.ledger_id, fact.event, false);
      if (fact.event.event_kind !== 'capabilities.declared') {
        const current = await client.query<{ revision: string }>(
          'SELECT revision FROM workspace_projection_revisions WHERE workspace_id=$1', [workspaceId],
        );
        const nextRevision = BigInt(current.rows[0]?.revision ?? '0');
        if (nextRevision > replayRevision) {
          mutationCounts.set(fact.event.session_id, (mutationCounts.get(fact.event.session_id) ?? 0n) + 1n);
        }
        replayRevision = nextRevision;
      }
    }
    const replay = await snapshot(client, workspaceId);
    const liveDigest = digest(semantic(live));
    const replayDigest = digest(semantic(replay));
    const liveRevisions = revisions(live);
    const replayRevisions = revisions(replay);
    const liveWatermarks = watermarks(live);
    const replayWatermarks = watermarks(replay);
    await client.query('ROLLBACK'); // The verifier has no persistent write path.
    return {
      projector_versions: { session: sessionProjectorVersion, capability: capabilityProjectorVersion },
      accepted_event_count: ledger.rows.length,
      semantic: { equal: liveDigest === replayDigest, live_digest: liveDigest, replay_digest: replayDigest },
      revisions: {
        equal: live.revision === replay.revision
          && coherentRevisions(live, mutationCounts) && coherentRevisions(replay, mutationCounts),
        live: liveRevisions, replay: replayRevisions,
      },
      ledger_watermarks: { equal: digest(liveWatermarks) === digest(replayWatermarks), live: liveWatermarks, replay: replayWatermarks },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
