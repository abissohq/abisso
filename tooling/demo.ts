import { database, localDatabaseUrl } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';

if (process.env.NODE_ENV && !['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('synthetic_demo_forbidden');
process.env.DATABASE_URL ??= localDatabaseUrl;
const db = database();
try {
  const { token } = await bootstrapSynthetic(db, process.env.NODE_ENV ?? 'development');
  const sequence = Number((await db.query('SELECT COALESCE(MAX(source_sequence), 0) AS sequence FROM telemetry_event_dispositions')).rows[0].sequence) + 1;
  const batch = capabilityBatch(sequence);
  const submit = () => fetch(`http://127.0.0.1:${process.env.PORT ?? 3001}/v1/telemetry/batches`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(batch),
  });
  const first = await submit();
  if (first.status !== 200) throw new Error('demo_ingestion_failed');
  const response = await first.text();
  const result = JSON.parse(response);
  if (result.request_id !== batch.request_id || result.results?.length !== 1 ||
      result.results[0].event_id !== batch.events[0].event_id || result.results[0].disposition !== 'accepted') {
    throw new Error('demo_acceptance_failed');
  }
  console.log(response);
  const retry = await submit();
  if (retry.status !== 200 || await retry.text() !== response) throw new Error('demo_replay_failed');
  console.log('exact_request_replay_verified');
  // Durable acceptance includes a ledger fact, its job, and the active declaration.
  // Worker completion remains an observation, not an acceptance prerequisite.
  const durable = (await db.query(
    `SELECT l.ledger_id, j.status, p.projector_version FROM canonical_event_ledger l
     JOIN projection_jobs j USING (ledger_id)
     JOIN active_capability_declarations a ON a.ledger_id = l.ledger_id AND a.source_id = l.source_id
     LEFT JOIN source_capability_projection p ON p.ledger_id = l.ledger_id
     WHERE l.event_id = $1 AND l.workspace_id = $2 AND l.source_id = $3
       AND l.event_kind = 'capabilities.declared' AND a.declaration_id = $4
       AND l.event->'payload'->>'declaration_id' = $4`,
    [batch.events[0].event_id, batch.events[0].workspace_id, batch.events[0].source.source_id, batch.events[0].payload.declaration_id],
  )).rows;
  if (durable.length !== 1) throw new Error('demo_durable_acceptance_failed');
  console.log(JSON.stringify(durable));
} catch {
  console.error('capability_demo_failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
