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
  console.log(response);
  const retry = await submit();
  if (retry.status !== 200 || await retry.text() !== response) throw new Error('demo_replay_failed');
  console.log('exact_request_replay_verified');
  // This is an observation, not a worker invocation or an acceptance prerequisite.
  console.log(JSON.stringify((await db.query(
    `SELECT l.ledger_id, j.status, p.projector_version FROM canonical_event_ledger l
     JOIN projection_jobs j USING (ledger_id)
     LEFT JOIN source_capability_projection p ON p.ledger_id = l.ledger_id
     WHERE l.event_id = $1`, [batch.events[0].event_id],
  )).rows));
} catch {
  console.error('capability_demo_failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
