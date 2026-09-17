import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { v7 } from 'uuid';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import pg from 'pg';
import { migrate } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';
import { createApi } from '../apps/backend/api.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let token: string;
let url: string;

beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(db);
  ({ token } = await bootstrapSynthetic(db, 'test'));
  server = createApi(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  url = `http://127.0.0.1:${address.port}/v1/telemetry/batches`;
});

afterEach(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (db) await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
import { after } from 'node:test';
after(() => admin.end());

async function post(body: unknown, credential = token) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

for (const timestamp of ['0000-01-01T00:00:00Z', '2026-09-16T12:00:00+16:00']) {
  test(`${timestamp} receives durable event rejection without rolling back a valid sibling`, async () => {
    const batch = capabilityBatch();
    batch.events[0].occurred_at = timestamp;
    const valid = capabilityBatch(2).events[0];
    batch.events.push(valid);
    const first = await post(batch);
    assert.equal(first.status, 200);
    const text = await first.text();
    const result = JSON.parse(text);
    assert.deepEqual(result.results, [
      { event_id: batch.events[0].event_id, disposition: 'rejected', reason_code: 'timestamp_invalid' },
      { event_id: valid.event_id, disposition: 'accepted' },
    ]);
    assert.equal(result.checkpoints[0].highest_durable_sequence, 2);
    const retry = await post(batch);
    assert.equal(retry.status, 200);
    assert.equal(await retry.text(), text);
    const newRequest = await post({ ...batch, request_id: v7() });
    assert.equal(newRequest.status, 200);
    assert.deepEqual((await newRequest.json()).results, [result.results[0], { event_id: valid.event_id, disposition: 'duplicate' }]);
    assert.equal((await db.query('SELECT * FROM telemetry_event_dispositions')).rowCount, 2);
    assert.equal((await db.query('SELECT event_id FROM canonical_event_ledger')).rows[0].event_id, valid.event_id);
    assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
    assert.equal((await db.query('SELECT * FROM projection_jobs')).rowCount, 1);
  });
}

async function runCapabilityDemo(port: number) {
  const demo = spawn(process.execPath, ['tooling/demo.ts'], {
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, PGOPTIONS: `-c search_path=${schema}`, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  demo.stdout.on('data', chunk => { output += chunk; });
  demo.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(demo, 'exit');
  return { code, output };
}

test('capability demo fails when HTTP 200 contains an event rejection', async () => {
  // Keep authenticated authority usable while making the synthetic provider claim disagree.
  await db.query("UPDATE sources SET provider = 'codex'");
  const result = await runCapabilityDemo(Number(new URL(url).port));
  assert.equal(result.code, 1);
  assert.match(result.output, /capability_demo_failed/);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 0);
});

test('capability demo fails when an accepted response has no durable capability result', async () => {
  // An HTTP boundary stub claims acceptance and exact replay without writing PostgreSQL.
  const acknowledgment = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const batch = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      request_id: batch.request_id,
      results: [{ event_id: batch.events[0].event_id, disposition: 'accepted' }],
      checkpoints: [],
    }));
  });
  acknowledgment.listen(0, '127.0.0.1');
  await once(acknowledgment, 'listening');
  try {
    const address = acknowledgment.address();
    assert(address && typeof address === 'object');
    const result = await runCapabilityDemo(address.port);
    assert.equal(result.code, 1);
    assert.match(result.output, /capability_demo_failed/);
  } finally {
    await new Promise<void>(resolve => acknowledgment.close(() => resolve()));
  }
});

test('capability demo verifies durable acceptance with the worker stopped', async () => {
  const result = await runCapabilityDemo(Number(new URL(url).port));
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /exact_request_replay_verified/);
  const ledger = (await db.query('SELECT ledger_id, event FROM canonical_event_ledger')).rows;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].event.event_kind, 'capabilities.declared');
  assert.equal((await db.query('SELECT ledger_id, status FROM projection_jobs')).rows[0].status, 'pending');
  const declaration = (await db.query('SELECT ledger_id, declaration_id FROM active_capability_declarations')).rows[0];
  assert.equal(declaration.ledger_id, ledger[0].ledger_id);
  assert.equal(declaration.declaration_id, ledger[0].event.payload.declaration_id);
});

test('normal and PostgreSQL boundary timestamps remain accepted without rewriting', async () => {
  const timestamps = ['2026-09-16T12:00:00Z', '0001-01-01T00:00:00Z', '2026-09-16T12:00:00+15:59', '2026-09-16T12:00:00-15:59'];
  for (const [index, timestamp] of timestamps.entries()) {
    const batch = capabilityBatch(index + 1);
    batch.events[0].occurred_at = timestamp;
    const response = await post(batch);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].disposition, 'accepted');
    const ledger = (await db.query('SELECT event FROM canonical_event_ledger WHERE event_id = $1', [batch.events[0].event_id])).rows[0];
    assert.equal(ledger.event.occurred_at, timestamp);
  }
});

test('valid timestamp representations remain intact and equivalent instants collide when representation changes', async () => {
  const batch = capabilityBatch();
  batch.events[0].occurred_at = '2026-09-16T12:00:00+00:00';
  const first = await post(batch);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).results[0].disposition, 'accepted');
  const ledger = (await db.query('SELECT event FROM canonical_event_ledger')).rows[0];
  assert.equal(ledger.event.occurred_at, '2026-09-16T12:00:00+00:00');
  assert.equal((await (await post({ ...batch, request_id: v7() })).json()).results[0].disposition, 'duplicate');
  const changed = structuredClone(batch);
  changed.request_id = v7();
  changed.events[0].occurred_at = '2026-09-16T12:00:00Z';
  const collision = await post(changed);
  assert.equal(collision.status, 200);
  assert.deepEqual((await collision.json()).results[0], {
    event_id: batch.events[0].event_id, disposition: 'rejected', reason_code: 'event_id_collision',
  });
  changed.request_id = batch.request_id;
  assert.equal((await post(changed)).status, 409);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
});

test('Batch A acknowledges durable capability acceptance with the worker stopped', async () => {
  const batch = capabilityBatch();
  const response = await post(batch);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    request_id: batch.request_id,
    results: [{ event_id: batch.events[0].event_id, disposition: 'accepted' }],
    checkpoints: [{ source_id: batch.events[0].source.source_id, stream_id: batch.events[0].source.stream_id, highest_durable_sequence: 1 }],
  });
  const ledger = (await db.query('SELECT * FROM canonical_event_ledger')).rows;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].event.event_kind, 'capabilities.declared');
  assert.equal(ledger[0].event.received_at, ledger[0].received_at.toISOString());
  assert(!('capability_snapshot_id' in ledger[0].event));
  const jobs = (await db.query('SELECT * FROM projection_jobs')).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].ledger_id, ledger[0].ledger_id);
  assert.equal(jobs[0].status, 'pending');
  assert.equal((await db.query('SELECT * FROM source_capability_projection')).rowCount, 0);
  assert.equal((await db.query('SELECT * FROM active_capability_declarations')).rows[0].ledger_id, ledger[0].ledger_id);
  assert.equal((await db.query('SELECT * FROM telemetry_event_dispositions')).rows[0].disposition, 'accepted');
  assert.equal((await db.query('SELECT * FROM telemetry_batch_requests')).rowCount, 1);
});

test('duplicate JSON keys are rejected before any acceptance', async () => {
  const batch = capabilityBatch();
  const body = JSON.stringify(batch).replace('"schema_version":"1.0"', '"schema_version":"1.0","schema_\\u0076ersion":"1.0"');
  const response = await post(body);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_json' });
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 0);
});

test('a separate worker processes the accepted ledger job through a versioned projector', async () => {
  const batch = capabilityBatch();
  assert.equal((await post(batch)).status, 200);
  const worker = spawn(process.execPath, ['apps/worker/main.ts', '--once'], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PGOPTIONS: `-c search_path=${schema}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  worker.stdout.on('data', chunk => { output += chunk; });
  worker.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(worker, 'exit');
  assert.equal(code, 0, output);
  const projection = (await db.query('SELECT * FROM source_capability_projection')).rows[0];
  assert.equal(projection.declaration_id, batch.events[0].payload.declaration_id);
  assert.equal(projection.projector_version, 'm0-capabilities-v1');
  assert.equal((await db.query('SELECT status FROM projection_jobs')).rows[0].status, 'completed');
  assert.equal((await db.query('SELECT count(*) FROM canonical_event_ledger')).rows[0].count, '1');
});

test('request retries reproduce exact responses; new requests deduplicate complete client events', async () => {
  const batch = capabilityBatch();
  const first = await (await post(batch)).text();
  const reversed = JSON.stringify(batch, null, 2);
  assert.equal(await (await post(reversed)).text(), first);
  const retry = { ...batch, request_id: v7() };
  const response = await (await post(retry)).json();
  assert.equal(response.results[0].disposition, 'duplicate');
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM projection_jobs')).rowCount, 1);
  const changedWrapper = { ...batch, issued_at: new Date(Date.now() - 1000).toISOString() };
  assert.equal((await post(changedWrapper)).status, 409);
  const changedEvent = structuredClone(batch);
  changedEvent.request_id = v7();
  // received_at belongs to the client-event digest even when the change is invalid.
  Object.assign(changedEvent.events[0], { received_at: batch.issued_at });
  const collision = await (await post(changedEvent)).json();
  assert.equal(collision.results[0].reason_code, 'event_id_collision');
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
  assert.deepEqual((await db.query('SELECT reason_code FROM ingestion_security_signals ORDER BY recorded_at')).rows.map(row => row.reason_code), ['request_id_collision', 'event_id_collision']);
});

test('bootstrap is dev/test only, deterministic, random, expiring, and digest-only', async () => {
  await assert.rejects(bootstrapSynthetic(db, 'production'), /synthetic_bootstrap_forbidden/);
  const next = await bootstrapSynthetic(db, 'test');
  assert.notEqual(next.token, token);
  assert.equal(next.token.length, 43);
  assert(next.expiresAt.getTime() > Date.now());
  assert(next.expiresAt.getTime() <= Date.now() + 15 * 60_000);
  assert.equal((await db.query('SELECT * FROM machines')).rowCount, 1);
  const stored = JSON.stringify((await db.query('SELECT * FROM machine_credentials')).rows);
  assert(!stored.includes(next.token));
  assert(!stored.includes(token));
  assert(stored.includes(createHash('sha256').update(next.token).digest('hex')));
  assert.equal((await post(capabilityBatch(), token)).status, 401);
  assert.equal((await post(capabilityBatch(), next.token)).status, 200);
});

test('every replay rechecks current credential and registration authority', async () => {
  const batch = capabilityBatch();
  assert.equal((await post(batch)).status, 200);
  assert.equal((await post(batch, '')).status, 401);
  assert.equal((await post(batch, 'x'.repeat(43))).status, 401);
  const cases = [
    ['machine_credentials', 'revoked', 'true', 'false', 401],
    ['machine_credentials', 'expires_at', "now() - interval '1 minute'", "now() + interval '15 minutes'", 401],
    ['machines', 'active', 'false', 'true', 403],
    ['users', 'active', 'false', 'true', 403],
    ['memberships', 'active', 'false', 'true', 403],
    ['workspaces', 'active', 'false', 'true', 403],
    ['sources', 'active', 'false', 'true', 403],
    ['collection_consents', 'active', 'false', 'true', 403],
    ['workspace_policies', 'operational_metadata_allowed', 'false', 'true', 403],
    ['machine_configuration', 'collection_state', "'paused'", "'active'", 403],
    ['workspace_policies', 'version', "'changed-policy'", "'m0-operational-v1'", 403],
  ] as const;
  for (const [table, field, disabled, restored, status] of cases) {
    await db.query(`UPDATE ${table} SET ${field} = ${disabled}`);
    assert.equal((await post(batch)).status, status, `${table}.${field}`);
    await db.query(`UPDATE ${table} SET ${field} = ${restored}`);
  }
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
});

test('unusable identity rejects the whole wrapper before any event processing', async () => {
  const batch = capabilityBatch();
  for (const invalid of [null, [], {}, { event_id: 'raw unsafe text' }]) {
    assert.equal((await post({ ...batch, events: [batch.events[0], invalid] })).status, 400);
  }
  assert.equal((await db.query('SELECT * FROM telemetry_batch_requests')).rowCount, 0);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 0);
});

test('strict schemas reject prohibited data, identity claims, and unfinished kinds without storing bodies', async () => {
  const sentinel = 'PRIVATE_CONTENT_MUST_NOT_SURVIVE';
  const mutations = [
    (event: Record<string, any>) => { event.payload.prompt = sentinel; },
    (event: Record<string, any>) => { event.extensions = { 'example.invalid/1': { output: sentinel } }; },
    (event: Record<string, any>) => { event.source.command = sentinel; },
    (event: Record<string, any>) => { event.privacy.policy_version = 'unaccepted-policy'; },
    (event: Record<string, any>) => { event.workspace_id = '00000000-0000-4000-8000-000000000099'; },
    (event: Record<string, any>) => { event.machine_id = '00000000-0000-4000-8000-000000000099'; },
    (event: Record<string, any>) => { event.source.source_id = '00000000-0000-4000-8000-000000000099'; },
    (event: Record<string, any>) => { event.capability_snapshot_id = event.payload.declaration_id; },
    (event: Record<string, any>) => { event.event_kind = 'session.started'; },
    (event: Record<string, any>) => { event.payload.capabilities[0].quality = 'invented'; },
    (event: Record<string, any>) => { event.occurred_at = '2026-02-30T00:00:00Z'; },
  ];
  for (const mutate of mutations) {
    const batch = capabilityBatch();
    mutate(batch.events[0]);
    const response = await post(batch);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert(!text.includes(sentinel));
    assert.equal(JSON.parse(text).results[0].disposition, 'rejected');
  }
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 0);
  assert.equal((await db.query('SELECT * FROM projection_jobs')).rowCount, 0);
  for (const table of ['telemetry_batch_requests', 'telemetry_event_dispositions', 'ingestion_security_signals']) {
    assert(!JSON.stringify((await db.query(`SELECT * FROM ${table}`)).rows).includes(sentinel));
  }
});

test('hard limits, malformed Unicode, and nondeterministic numeric values fail before equivalence', async () => {
  const batch = capabilityBatch();
  const valid = JSON.stringify(batch);
  const bodies = [
    ['{', 400],
    [valid.replace('"source_sequence":1', '"source_sequence":9007199254740993'), 400],
    [valid.replace('"source_sequence":1', '"source_sequence":1e400'), 400],
    [valid.replace('"1.0"', '"\\ud800"'), 400],
    [valid.replace('"1.0"', JSON.stringify('x'.repeat(129))), 413],
    [JSON.stringify({ ...batch, events: Array(201).fill(batch.events[0]) }), 413],
    [valid.replace('"payload":{', '"payload":{' + ' '.repeat(65536)), 413],
    [valid.replace('"extensions":{}', '"extensions":{"x":' + '['.repeat(20) + '0' + ']'.repeat(20) + '}'), 413],
  ] as const;
  for (const [body, status] of bodies) assert.equal((await post(body)).status, status);
  const compressed = gzipSync(' '.repeat(1024 * 1024 + 1));
  const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: compressed });
  assert.equal(response.status, 413);
  assert.equal((await db.query('SELECT * FROM telemetry_batch_requests')).rowCount, 0);
});

test('capability evidence references cannot gain eligibility from earlier siblings', async () => {
  for (const reversed of [false, true]) {
    const first = capabilityBatch();
    const dependent = capabilityBatch(2).events[0];
    dependent.provenance.evidence_refs = [first.events[0].event_id];
    const events = [first.events[0], dependent];
    const response = await (await post({ ...first, events: reversed ? events.reverse() : events })).json();
    assert.deepEqual(response.results.find((result: { event_id: string }) => result.event_id === dependent.event_id), {
      event_id: dependent.event_id, disposition: 'rejected', reason_code: 'invalid_field',
    });
  }
});
