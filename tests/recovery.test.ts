import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, afterEach, beforeEach, test } from 'node:test';
import pg from 'pg';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';
import { migrate, transaction } from '../packages/database/database.ts';
import { ingest } from '../packages/ingestion/ingest.ts';
import { claimPendingJob, completeJob, ownsLease } from '../packages/processing/repository.ts';
import { projectSessionStart } from '../packages/processing/sessions.ts';
import { processNext } from '../packages/processing/worker.ts';
import { createApi } from '../apps/backend/api.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { heartbeatBatch, sessionCompletionBatch, sessionStartBatch } from '../packages/test-fixtures/session.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let db: pg.Pool;
let schema: string;
let token: string;
beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(db);
  ({ token } = await bootstrapSynthetic(db, 'test'));
});
afterEach(async () => {
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
after(() => admin.end());
async function submit(batch: unknown) {
  const response = await ingest(db, `Bearer ${token}`, batch, { environment: 'test' });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).results[0].disposition, 'accepted');
}
async function drain() { while (await processNext(db)) { /* committed claims only */ } }

test('a committed crash claim increments attempts; expired ownership is fenced and reclaim preserves one effective revision', async () => {
  const declaration = capabilityBatch(); await submit(declaration);
  const start = sessionStartBatch(declaration.events[0].payload.declaration_id); await submit(start);
  await processNext(db);
  const crashed = await transaction(db, client => claimPendingJob(client, 10));
  assert.equal(crashed?.ledger_id, '2');
  assert.equal(crashed?.attempt_count, 1);
  assert.equal((await db.query('SELECT status, attempt_count, owner_id FROM projection_jobs WHERE ledger_id=2')).rows[0].status, 'running');
  await db.query("UPDATE projection_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE ledger_id=2");
  await processNext(db);
  const job = (await db.query('SELECT status, attempt_count, owner_id, lease_expires_at FROM projection_jobs WHERE ledger_id=2')).rows[0];
  assert.equal(job.status, 'completed');
  assert.equal(job.attempt_count, 2);
  assert.equal(job.owner_id, null);
  assert.equal(job.lease_expires_at, null);
  assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rows[0].revision, '1');
  const rows = (await db.query('SELECT id, workstream_id, data FROM session_projection')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, start.events[0].session_id);
  assert.equal(rows[0].data.state, 'Starting');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM canonical_event_ledger')).rows[0].n, 2);
  await db.query("UPDATE projection_jobs SET status='pending', completed_at=NULL WHERE ledger_id=2");
  await processNext(db);
  assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rows[0].revision, '1');
});

test('stale owner cannot complete and an expired fifth claim dead-letters without a sixth run', async () => {
  await submit(capabilityBatch());
  const first = await transaction(db, client => claimPendingJob(client, 10));
  assert.ok(first);
  await db.query("UPDATE projection_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE ledger_id=1");
  const second = await transaction(db, client => claimPendingJob(client, 10));
  assert.ok(second);
  assert.notEqual(second.owner_id, first.owner_id);
  assert.equal(await transaction(db, client => ownsLease(client, first)), false);
  await assert.rejects(transaction(db, client => completeJob(client, first)), /stale_claim/);
  await db.query("UPDATE projection_jobs SET attempt_count=5, lease_expires_at=clock_timestamp()-interval '1 second' WHERE ledger_id=1");
  assert.equal(await processNext(db), false);
  const row = (await db.query('SELECT status, attempt_count, error_code FROM projection_jobs WHERE ledger_id=1')).rows[0];
  assert.deepEqual([row.status, row.attempt_count, row.error_code], ['dead_letter', 5, 'lease_expired']);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM source_capability_projection')).rows[0].n, 0);
});

test('connection loss during projection rolls back state and notification before lease reclaim', async () => {
  const declaration = capabilityBatch(); await submit(declaration);
  const start = sessionStartBatch(declaration.events[0].payload.declaration_id); await submit(start);
  await processNext(db);
  const claim = await transaction(db, client => claimPendingJob(client, 10));
  assert.ok(claim && claim.event.event_kind === 'session.started');
  const connection = await db.connect();
  try {
    await connection.query('BEGIN');
    await projectSessionStart(connection, claim.ledger_id, claim.event);
    assert.equal((await connection.query('SELECT revision FROM workspace_projection_revisions')).rows[0].revision, '1');
  } finally {
    // PostgreSQL aborts the uncommitted projection when the worker loses its connection.
    connection.release(true);
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM session_projection')).rows[0].n, 0);
  assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rowCount, 0);
  await db.query("UPDATE projection_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE ledger_id=2");
  await processNext(db);
  assert.equal((await db.query('SELECT status, attempt_count FROM projection_jobs WHERE ledger_id=2')).rows[0].attempt_count, 2);
  assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rows[0].revision, '1');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM session_projection')).rows[0].n, 1);
});

test('delayed oldest job does not block a later eligible job and failed projection dead-letters after five attempts', async () => {
  const declaration = capabilityBatch(); await submit(declaration);
  const start = sessionStartBatch(declaration.events[0].payload.declaration_id); await submit(start);
  const later = capabilityBatch(3); await submit(later);
  await processNext(db); // first declaration
  await db.query(`CREATE FUNCTION ${schema}.pg_notify(text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'private_marker'; END$$`);
  const faultDb = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},pg_catalog` });
  try {
    assert.equal(await processNext(faultDb, { backoffBaseMs: 100_000 }), true);
    const first = (await db.query('SELECT status, attempt_count, error_code, available_at > clock_timestamp() AS delayed FROM projection_jobs WHERE ledger_id=2')).rows[0];
    assert.deepEqual([first.status, first.attempt_count, first.error_code, first.delayed], ['pending', 1, 'projection_failed', true]);
    await processNext(db);
    assert.equal((await db.query('SELECT status FROM projection_jobs WHERE ledger_id=3')).rows[0].status, 'completed');
    for (let attempt = 2; attempt <= 5; attempt++) {
      await db.query("UPDATE projection_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE ledger_id=2");
      await processNext(faultDb, { backoffBaseMs: 100_000 });
      const row = (await db.query('SELECT status, attempt_count FROM projection_jobs WHERE ledger_id=2')).rows[0];
      assert.equal(row.attempt_count, attempt);
      assert.equal(row.status, attempt === 5 ? 'dead_letter' : 'pending');
    }
    assert.equal(await processNext(db), false);
    assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rowCount, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM session_projection')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM canonical_event_ledger')).rows[0].n, 3);
  } finally {
    await faultDb.end();
    await db.query(`DROP FUNCTION ${schema}.pg_notify(text,text)`);
  }
});

test('separate completion event preserves session and Workstream identity without inferring an outcome', async () => {
  const declaration = capabilityBatch(); await submit(declaration);
  const start = sessionStartBatch(declaration.events[0].payload.declaration_id); await submit(start);
  await drain();
  const before = (await db.query('SELECT id, workstream_id, data FROM session_projection')).rows[0];
  const completion = sessionCompletionBatch(start.events[0], 3);
  await submit(completion);
  await drain();
  const after = (await db.query('SELECT id, workstream_id, data FROM session_projection')).rows[0];
  const workstream = (await db.query('SELECT data FROM workstream_projection')).rows[0].data;
  assert.equal(after.id, before.id);
  assert.equal(after.workstream_id, before.workstream_id);
  assert.equal(after.data.state, 'Completed');
  assert.equal(after.data.latest_evidence_event_id, completion.events[0].event_id);
  assert.equal(after.data.latest_source_contact_at, before.data.latest_source_contact_at);
  assert.equal(workstream.state, 'Active');
  assert.equal(workstream.latest_source_contact_at, before.data.latest_source_contact_at);
  assert.equal(workstream.last_meaningful_update_at, null);
  assert.equal(workstream.outcome, undefined);
  assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rows[0].revision, '2');
  const late = heartbeatBatch(start.events[0], 4);
  await submit(late);
  await drain();
  const terminal = (await db.query('SELECT data FROM session_projection')).rows[0].data;
  assert.equal(terminal.state, 'Completed');
  assert.equal((await db.query('SELECT revision FROM workspace_projection_revisions')).rows[0].revision, '2');
});

test('API shutdown closes an active SSE response', async () => {
  const options: { environment: string; origin?: string } = { environment: 'test' };
  const server = createApi(db, options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  options.origin = url;
  try {
    const page = await fetch(`${url}/dev/login`);
    const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
    const cookie = page.headers.get('set-cookie')!.split(';')[0];
    const form = async (path: string, code?: string) => fetch(`${url}${path}`, { method: 'POST',
      headers: { cookie, origin: url, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf, ...(code ? { code } : {}) }) });
    const code = (await (await form('/dev/login/code')).json()).code;
    const signedIn = (await form('/dev/login/exchange', code)).headers.get('set-cookie')!.split(';')[0];
    let stream: Response | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      stream = await fetch(`${url}/v1/live/events`, { headers: { cookie: signedIn, 'sec-fetch-site': 'same-origin' } });
      if (stream.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(stream?.status, 200);
    await Promise.race([
      new Promise<void>(resolve => server.close(() => resolve())),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('shutdown_hung')), 1000)),
    ]);
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
