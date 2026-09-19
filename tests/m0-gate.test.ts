import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import pg from 'pg';
import { v7 } from 'uuid';
import { createApi } from '../apps/backend/api.ts';
import { canonicalEvent } from '../packages/contracts/session.ts';
import { bootstrapSynthetic, synthetic } from '../packages/database/bootstrap.ts';
import { migrate } from '../packages/database/database.ts';
import { verifyReplay } from '../packages/processing/replay.ts';
import { processNext } from '../packages/processing/worker.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { heartbeatBatch, sessionStartBatch } from '../packages/test-fixtures/session.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
after(() => admin.end());

test('M0 acceptance profile is exact and unfinished frozen-core kinds reject', async () => {
  const a = capabilityBatch();
  const b = sessionStartBatch(a.events[0].payload.declaration_id);
  const c = heartbeatBatch(b.events[0]);
  const kinds = ['capabilities.declared', 'session.started', 'session.activity', 'session.completed'];
  assert.deepEqual(canonicalEvent.options.map(option => option.shape.event_kind.value), kinds);
  for (const event of [a.events[0], b.events[0], c.events[0]]) assert.equal(canonicalEvent.safeParse(event).success, true);
});

test('M0 measured browser tracer, privacy scan and isolated replay', async () => {
  const schema = `gate_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, application_name: schema });
  let server: ReturnType<typeof createApi> | undefined;
  const abort = new AbortController();
  try {
    await migrate(db);
    const { token } = await bootstrapSynthetic(db, 'test');
    const options: { environment: string; origin?: string } = { environment: 'test' };
    server = createApi(db, options);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    options.origin = origin;
    const page = await fetch(`${origin}/dev/login`);
    const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
    const initialCookie = page.headers.get('set-cookie')!.split(';')[0];
    const form = (path: string, values: Record<string, string>) => fetch(`${origin}${path}`, {
      method: 'POST', headers: { cookie: initialCookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values),
    });
    const code = (await (await form('/dev/login/code', { csrf })).json()).code;
    const login = await form('/dev/login/exchange', { csrf, code });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const stream = await fetch(`${origin}/v1/live/events`, { headers: { cookie, origin }, signal: abort.signal });
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    let buffer = '';
    async function nextFrame(): Promise<string> {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) { const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); return frame; }
        const chunk = await reader.read();
        if (chunk.done) throw new Error('stream_closed');
        buffer += new TextDecoder().decode(chunk.value);
      }
    }
    const frames = [await nextFrame()];
    assert.match(frames[0], /event: stream.ready/);
    async function submit(batch: unknown) {
      const started = performance.now();
      const response = await fetch(`${origin}/v1/telemetry/batches`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch),
      });
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(body).results[0].disposition, 'accepted');
      return { duration_ms: performance.now() - started, body };
    }
    async function live() {
      const started = performance.now();
      const response = await fetch(`${origin}/v1/live`, { headers: { cookie } });
      assert.equal(response.status, 200);
      const body = await response.json();
      return { duration_ms: performance.now() - started, body };
    }
    const ack: number[] = [];
    const reads: number[] = [];
    const projections: number[] = [];
    const realtime: number[] = [];
    const endToEndInvalidation: number[] = [];
    const responses: string[] = [];
    const a = capabilityBatch();
    const b = sessionStartBatch(a.events[0].payload.declaration_id);
    const c = heartbeatBatch(b.events[0]);
    for (const batch of [a, b]) { const result = await submit(batch); ack.push(result.duration_ms); responses.push(result.body); }
    const before = await live(); reads.push(before.duration_ms);
    assert.deepEqual(before.body.workstreams, []);
    const startProjectionAt = performance.now();
    while (await processNext(db)) { /* drain */ }
    projections.push(performance.now() - startProjectionAt);
    const startDrainFinishedAt = performance.now();
    frames.push(await nextFrame());
    realtime.push(performance.now() - startDrainFinishedAt);
    endToEndInvalidation.push(performance.now() - startProjectionAt);
    const starting = await live(); reads.push(starting.duration_ms);
    const row = starting.body.workstreams[0];
    assert.equal(row.state, 'Active');
    assert.equal(row.sessions[0].state, 'Starting');
    assert.equal(row.sessions[0].id, b.events[0].session_id);
    const heartbeat = await submit(c); ack.push(heartbeat.duration_ms); responses.push(heartbeat.body);
    const unchanged = await live(); reads.push(unchanged.duration_ms);
    assert.equal(unchanged.body.workspace_projection_revision, starting.body.workspace_projection_revision);
    const heartbeatProjectionAt = performance.now();
    while (await processNext(db)) { /* drain */ }
    projections.push(performance.now() - heartbeatProjectionAt);
    const heartbeatDrainFinishedAt = performance.now();
    frames.push(await nextFrame());
    realtime.push(performance.now() - heartbeatDrainFinishedAt);
    endToEndInvalidation.push(performance.now() - heartbeatProjectionAt);
    const running = await live(); reads.push(running.duration_ms);
    assert.equal(running.body.workstreams[0].id, row.id);
    assert.equal(running.body.workstreams[0].state, 'Active');
    assert.equal(running.body.workstreams[0].sessions[0].id, row.sessions[0].id);
    assert.equal(running.body.workstreams[0].sessions[0].state, 'Running');
    assert.equal(running.body.workstreams[0].sessions[0].latest_evidence_event_id, c.events[0].event_id);
    assert.equal(running.body.workspace_projection_revision, '2');
    assert.ok(frames.slice(1).every(frame => frame.includes('event: projection.invalidated')));
    const replay = await verifyReplay(db, synthetic.workspace);
    assert.equal(replay.semantic.equal, true);
    assert.equal(replay.revisions.equal, true);
    assert.equal(replay.ledger_watermarks.equal, true);

    const unfinishedKinds = [
      'session.waiting_for_human', 'session.resumed', 'session.failed', 'session.stopped', 'session.lost',
      'tool.started', 'tool.completed', 'file.touched', 'artifact.changed', 'check.completed',
      'usage.observed', 'cost.observed', 'git.context_observed', 'collector.health', 'adapter.health',
      'collection.state_changed', 'event.corrected',
    ];
    const rejectedResponses: string[] = [];
    let sequence = 4;
    async function reject(event: Record<string, unknown>, reason: string) {
      const batch = { request_id: v7(), issued_at: new Date().toISOString(), events: [event] };
      const response = await fetch(`${origin}/v1/telemetry/batches`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch),
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      rejectedResponses.push(body);
      assert.deepEqual([JSON.parse(body).results[0].disposition, JSON.parse(body).results[0].reason_code], ['rejected', reason]);
    }
    for (const event_kind of unfinishedKinds) {
      const event = { ...a.events[0], event_id: v7(), event_kind, source: { ...a.events[0].source, source_sequence: sequence++ } };
      assert.equal(canonicalEvent.safeParse(event).success, false);
      await reject(event, 'unknown_event_kind');
    }
    const prohibited = 'M0_PRIVATE_SENTINEL';
    for (const mutation of [
      { payload: { ...a.events[0].payload, prompt: prohibited } },
      { payload: { ...a.events[0].payload, message_body: prohibited } },
      { source: { ...a.events[0].source, source_sequence: sequence, command: prohibited } },
      { extensions: { 'example.invalid/1': { output: prohibited } } },
    ]) {
      const event = { ...a.events[0], event_id: v7(), source: { ...a.events[0].source, source_sequence: sequence++ }, ...mutation };
      await reject(event, 'invalid_field');
    }
    const records = await Promise.all([
      db.query('SELECT event FROM canonical_event_ledger'), db.query('SELECT response FROM telemetry_batch_requests'),
      db.query('SELECT data FROM session_projection'), db.query('SELECT data FROM workstream_projection'),
      db.query('SELECT error_code FROM projection_jobs'), db.query('SELECT extension FROM telemetry_quarantine'),
    ]);
    const fixtureFiles = ['packages/test-fixtures/capability.ts', 'packages/test-fixtures/session.ts'];
    const fixtureContents = await Promise.all(fixtureFiles.map(file => readFile(file, 'utf8')));
    const safeArtifacts = JSON.stringify({ records: records.map(result => result.rows), responses, rejectedResponses,
      frames, replay, fixtures: fixtureContents, snapshots: [starting.body, running.body] });
    assert.equal(safeArtifacts.includes(prohibited), false);
    assert.doesNotMatch(safeArtifacts, /"(?:prompt|message_body|clipboard|keystrokes|screenshot|file_content)"\s*:/i);
    assert.deepEqual((await db.query('SELECT event_kind FROM canonical_event_ledger ORDER BY ledger_id')).rows.map(row => row.event_kind),
      ['capabilities.declared', 'session.started', 'session.activity']);
    console.log(`M0_GATE_METRICS ${JSON.stringify({ environment: 'local PostgreSQL 17, Node.js, loopback HTTP/SSE, isolated test schema',
      dataset: { workspaces: 1, machines: 1, sources: 1, sessions: 1, workstreams: 1, accepted_events: 3 },
      batch_size_events: 1, geography: 'single-host loopback; no external network',
      durable_ack_ms: ack, projection_drain_ms: projections, realtime_after_drain_ms: realtime,
      worker_start_to_invalidation_ms: endToEndInvalidation, live_read_ms: reads })}`);
  } finally {
    abort.abort();
    if (server) { const activeServer = server; activeServer.closeAllConnections(); await new Promise<void>(resolve => activeServer.close(() => resolve())); }
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  }
});
