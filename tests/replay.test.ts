import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, beforeEach, test } from 'node:test';
import pg from 'pg';
import { v5 } from 'uuid';
import { bootstrapSynthetic, synthetic } from '../packages/database/bootstrap.ts';
import { migrate } from '../packages/database/database.ts';
import { ingest } from '../packages/ingestion/ingest.ts';
import { verifyReplay } from '../packages/processing/replay.ts';
import { processNext } from '../packages/processing/worker.ts';
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

async function submit(batch: unknown, disposition = 'accepted') {
  const response = await ingest(db, `Bearer ${token}`, batch, { environment: 'test' });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).results[0].disposition, disposition);
}
async function drain() { while (await processNext(db)) { /* production worker path */ } }
async function liveState() {
  const rows = await Promise.all(['canonical_event_ledger', 'projection_jobs', 'source_capability_projection',
    'workspace_projection_revisions', 'workstream_projection', 'session_projection', 'telemetry_event_dispositions']
    .map(table => db.query(`SELECT * FROM ${table} ORDER BY 1`)));
  return JSON.stringify(rows.map(row => row.rows));
}

test('isolated replay rebuilds two source-distinct founding identities and late evidence without touching live state', async () => {
  const secondSource = '00000000-0000-4000-8000-000000000006';
  await db.query("INSERT INTO sources VALUES ($1,$2,$3,$4,'abisso','synthetic_m0',true)",
    [secondSource, synthetic.machine, synthetic.workspace, synthetic.user]);
  const firstDeclaration = capabilityBatch();
  const secondDeclaration = capabilityBatch();
  secondDeclaration.events[0].source.source_id = secondSource;
  await submit(firstDeclaration); await submit(secondDeclaration);
  const firstStart = sessionStartBatch(firstDeclaration.events[0].payload.declaration_id);
  const secondStart = sessionStartBatch(secondDeclaration.events[0].payload.declaration_id);
  secondStart.events[0].event_id = firstStart.events[0].event_id;
  secondStart.events[0].source.source_id = secondSource;
  await submit(firstStart); await submit(secondStart);
  await drain();
  const founding = (await db.query('SELECT id, data FROM workstream_projection ORDER BY id')).rows;
  assert.equal(founding.length, 2);
  assert.notEqual(founding[0].id, founding[1].id);
  for (const row of founding) {
    assert.equal(row.id, v5(`provisional-workstream:v1:${row.data.created_from_source_id}:${firstStart.events[0].event_id}`, synthetic.workspace));
  }
  const heartbeat = heartbeatBatch(firstStart.events[0], 3, 42);
  heartbeat.events[0].occurred_at = '2020-01-01T00:00:00.000Z';
  heartbeat.events[0].observed_at = heartbeat.events[0].occurred_at;
  await submit(heartbeat);
  const lateStart = sessionStartBatch(firstDeclaration.events[0].payload.declaration_id, 4);
  lateStart.events[0].session_id = firstStart.events[0].session_id;
  lateStart.events[0].occurred_at = '2019-01-01T00:00:00.000Z';
  lateStart.events[0].observed_at = lateStart.events[0].occurred_at;
  await submit(lateStart);
  await drain();
  const firstId = v5(`provisional-workstream:v1:${synthetic.source}:${firstStart.events[0].event_id}`, synthetic.workspace);
  const current = (await db.query('SELECT workstream_id, data FROM session_projection WHERE id=$1', [firstStart.events[0].session_id])).rows[0];
  assert.equal(current.workstream_id, firstId);
  assert.equal(current.data.started_at, firstStart.events[0].occurred_at);
  assert.equal(current.data.progress_counter, 42);
  const unchangedWorkstream = (await db.query('SELECT data FROM workstream_projection WHERE id=$1', [firstId])).rows[0].data;
  assert.equal(unchangedWorkstream.label, 'Untitled workstream');
  assert.equal(unchangedWorkstream.created_from_event_id, firstStart.events[0].event_id);
  assert.equal(unchangedWorkstream.created_at, firstStart.events[0].occurred_at);
  const before = await liveState();
  const result = await verifyReplay(db, synthetic.workspace);
  assert.equal(result.accepted_event_count, 6);
  assert.deepEqual(result.projector_versions, { session: 'm0-session-recovery-v1', capability: 'm0-capabilities-v1' });
  assert.equal(result.semantic.equal, true);
  assert.equal(result.revisions.equal, true);
  assert.equal(result.ledger_watermarks.equal, true);
  assert.equal(await liveState(), before);
  // A second run derives identity from accepted facts, with no copied mapping.
  assert.deepEqual(await verifyReplay(db, synthetic.workspace), result);
});

test('semantic comparison excludes runtime noise but detects state drift independently of revisions', async () => {
  const declaration = capabilityBatch(); await submit(declaration);
  const start = sessionStartBatch(declaration.events[0].payload.declaration_id); await submit(start);
  await drain();
  const completion = sessionCompletionBatch(start.events[0], 3); await submit(completion);
  await drain();
  assert.equal((await verifyReplay(db, synthetic.workspace)).semantic.equal, true);
  await db.query("UPDATE projection_jobs SET attempt_count=4, available_at=clock_timestamp()+interval '1 day' WHERE ledger_id=2");
  assert.equal((await verifyReplay(db, synthetic.workspace)).semantic.equal, true);
  await db.query('UPDATE session_projection SET revision=revision+1 WHERE id=$1', [start.events[0].session_id]);
  const fenceDrift = await verifyReplay(db, synthetic.workspace);
  assert.equal(fenceDrift.semantic.equal, true);
  assert.equal(fenceDrift.revisions.equal, false);
  assert.equal(fenceDrift.ledger_watermarks.equal, true);
  await db.query('UPDATE session_projection SET revision=revision-1, ledger_watermark=ledger_watermark-1 WHERE id=$1', [start.events[0].session_id]);
  const watermarkDrift = await verifyReplay(db, synthetic.workspace);
  assert.equal(watermarkDrift.semantic.equal, true);
  assert.equal(watermarkDrift.revisions.equal, true);
  assert.equal(watermarkDrift.ledger_watermarks.equal, false);
  await db.query("UPDATE session_projection SET data=jsonb_set(data,'{state}','\"Running\"') WHERE id=$1", [start.events[0].session_id]);
  assert.equal((await verifyReplay(db, synthetic.workspace)).semantic.equal, false);
  await db.query("UPDATE session_projection SET data=data || '{\"new_semantic_field\":true}'::jsonb WHERE id=$1", [start.events[0].session_id]);
  await assert.rejects(verifyReplay(db, synthetic.workspace), /unclassified_projection_field/);
});

test('replay accepts valid out-of-ledger projection commits across independent sessions', async () => {
  const declaration = capabilityBatch(); await submit(declaration); await drain();
  const first = sessionStartBatch(declaration.events[0].payload.declaration_id, 2);
  const second = sessionStartBatch(declaration.events[0].payload.declaration_id, 3);
  await submit(first); await submit(second);
  await db.query("UPDATE projection_jobs SET available_at=clock_timestamp()+interval '1 day' WHERE ledger_id=2");
  assert.equal(await processNext(db), true); // Later eligible session commits first.
  await db.query("UPDATE projection_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE ledger_id=2");
  await drain();
  const result = await verifyReplay(db, synthetic.workspace);
  assert.equal(result.semantic.equal, true);
  assert.equal(result.ledger_watermarks.equal, true);
  assert.equal(result.revisions.live.workspace_revision, result.revisions.replay.workspace_revision);
  assert.equal(result.revisions.live.sessions.find(([id]) => id === second.events[0].session_id)?.[1], '1');
  assert.equal(result.revisions.live.sessions.find(([id]) => id === first.events[0].session_id)?.[1], '2');
  assert.notDeepEqual(result.revisions.live.sessions, result.revisions.replay.sessions);
  assert.notDeepEqual(result.revisions.live.workstreams, result.revisions.replay.workstreams);
  assert.equal(result.revisions.equal, true);

  const earlierRevision = (await db.query('SELECT id, workstream_id FROM session_projection WHERE revision=1')).rows[0];
  await db.query('UPDATE session_projection SET revision=2 WHERE id=$1', [earlierRevision.id]);
  await db.query('UPDATE workstream_projection SET revision=2 WHERE id=$1', [earlierRevision.workstream_id]);
  const duplicate = await verifyReplay(db, synthetic.workspace);
  assert.equal(duplicate.semantic.equal, true);
  assert.equal(duplicate.ledger_watermarks.equal, true);
  assert.equal(duplicate.revisions.equal, false);
  await db.query('UPDATE session_projection SET revision=1 WHERE id=$1', [earlierRevision.id]);
  await db.query('UPDATE workstream_projection SET revision=1 WHERE id=$1', [earlierRevision.workstream_id]);

  await db.query('UPDATE session_projection SET revision=3 WHERE id=$1', [earlierRevision.id]);
  await db.query('UPDATE workstream_projection SET revision=3 WHERE id=$1', [earlierRevision.workstream_id]);
  assert.equal((await verifyReplay(db, synthetic.workspace)).revisions.equal, false);
  await db.query('UPDATE session_projection SET revision=1 WHERE id=$1', [earlierRevision.id]);
  await db.query('UPDATE workstream_projection SET revision=1 WHERE id=$1', [earlierRevision.workstream_id]);

  await db.query('UPDATE workspace_projection_revisions SET revision=revision+1 WHERE workspace_id=$1', [synthetic.workspace]);
  assert.equal((await verifyReplay(db, synthetic.workspace)).revisions.equal, false);
});

test('replay rejects a row revision earlier than its own effective mutation count', async () => {
  const declaration = capabilityBatch(); await submit(declaration); await drain();
  const first = sessionStartBatch(declaration.events[0].payload.declaration_id, 2);
  const second = sessionStartBatch(declaration.events[0].payload.declaration_id, 3);
  await submit(first); await submit(second);
  await submit(heartbeatBatch(first.events[0], 4));
  await db.query("UPDATE projection_jobs SET available_at=clock_timestamp()+interval '1 day' WHERE ledger_id=2");
  assert.equal(await processNext(db), true);
  await db.query("UPDATE projection_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE ledger_id=2");
  await drain();
  assert.equal((await verifyReplay(db, synthetic.workspace)).revisions.equal, true);

  const firstRow = (await db.query('SELECT workstream_id FROM session_projection WHERE id=$1', [first.events[0].session_id])).rows[0];
  const secondRow = (await db.query('SELECT workstream_id FROM session_projection WHERE id=$1', [second.events[0].session_id])).rows[0];
  await db.query('UPDATE session_projection SET revision=1 WHERE id=$1', [first.events[0].session_id]);
  await db.query('UPDATE workstream_projection SET revision=1 WHERE id=$1', [firstRow.workstream_id]);
  await db.query('UPDATE session_projection SET revision=3 WHERE id=$1', [second.events[0].session_id]);
  await db.query('UPDATE workstream_projection SET revision=3 WHERE id=$1', [secondRow.workstream_id]);
  const corrupted = await verifyReplay(db, synthetic.workspace);
  assert.equal(corrupted.semantic.equal, true);
  assert.equal(corrupted.ledger_watermarks.equal, true);
  assert.equal(corrupted.revisions.equal, false);
});

test('replay rejects row revisions that cannot fit the effective mutation schedule', async () => {
  const declaration = capabilityBatch(); await submit(declaration); await drain();
  const first = sessionStartBatch(declaration.events[0].payload.declaration_id, 2);
  const second = sessionStartBatch(declaration.events[0].payload.declaration_id, 3);
  const third = sessionStartBatch(declaration.events[0].payload.declaration_id, 4);
  await submit(first); await submit(second); await submit(third);
  await submit(heartbeatBatch(first.events[0], 5));
  await submit(heartbeatBatch(second.events[0], 6));
  await drain();
  assert.equal((await verifyReplay(db, synthetic.workspace)).revisions.equal, true);
  for (const [sessionId, revision] of [
    [first.events[0].session_id, 2], [second.events[0].session_id, 3], [third.events[0].session_id, 5],
  ] as const) {
    const row = (await db.query('SELECT workstream_id FROM session_projection WHERE id=$1', [sessionId])).rows[0];
    await db.query('UPDATE session_projection SET revision=$2 WHERE id=$1', [sessionId, revision]);
    await db.query('UPDATE workstream_projection SET revision=$2 WHERE id=$1', [row.workstream_id, revision]);
  }
  const corrupted = await verifyReplay(db, synthetic.workspace);
  assert.equal(corrupted.semantic.equal, true);
  assert.equal(corrupted.ledger_watermarks.equal, true);
  assert.equal(corrupted.revisions.equal, false);
});

test('rejected and quarantined input stays outside replay and prohibited text never appears in its result', async () => {
  const declaration = capabilityBatch(); await submit(declaration);
  const quarantineBase = capabilityBatch(2);
  const quarantined = { ...quarantineBase, events: quarantineBase.events.map(event => ({ ...event,
    extensions: { 'abisso.synthetic.m0/1': { fixture: 'quarantine', requires_interpretation: true } },
  })) };
  await submit(quarantined, 'quarantined');
  const rejected = capabilityBatch(3);
  await submit({ ...rejected, events: [{ ...rejected.events[0], payload: { ...rejected.events[0].payload, prompt: 'PROHIBITED_SENTINEL' } }] }, 'rejected');
  await drain();
  const before = await liveState();
  const result = await verifyReplay(db, synthetic.workspace);
  assert.equal(result.accepted_event_count, 1);
  assert.equal(result.semantic.equal, true);
  assert.equal(result.revisions.equal, true);
  assert.equal(result.ledger_watermarks.equal, true);
  assert.equal(await liveState(), before);
  assert(!JSON.stringify(result).includes('PROHIBITED_SENTINEL'));
  assert(!JSON.stringify(result).includes(quarantined.events[0].event_id));
  assert(!JSON.stringify(result).includes(rejected.events[0].event_id));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM canonical_event_ledger')).rows[0].n, 1);
});
