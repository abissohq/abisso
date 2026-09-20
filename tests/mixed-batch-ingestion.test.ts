import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { migrate } from '../packages/database/database.ts';
import { bootstrapSynthetic, synthetic } from '../packages/database/bootstrap.ts';
import { createApi } from '../apps/backend/api.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { v7 } from 'uuid';
import { sessionStartBatch } from '../packages/test-fixtures/session.ts';
import { purgeExpiredQuarantine } from '../packages/ingestion/quarantine-repository.ts';
import { gzipSync } from 'node:zlib';

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
  server = createApi(db, { environment: 'test' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  url = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (db) await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
after(() => admin.end());

async function post(batch: unknown, credential = token) {
  return fetch(`${url}/v1/telemetry/batches`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: typeof batch === 'string' ? batch : JSON.stringify(batch),
  });
}
function quarantineBatch(sequence = 1) {
  const batch = capabilityBatch(sequence);
  return { ...batch, events: batch.events.map(event => ({ ...event, extensions: {
    'abisso.synthetic.m0/1': { fixture: 'quarantine', requires_interpretation: true },
  } })) };
}

test('permitted synthetic extension produces a referenced durable quarantine, never canonical acceptance', async () => {
  const batch = quarantineBatch();
  const response = await post(batch);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    request_id: batch.request_id,
    results: [{ event_id: batch.events[0].event_id, disposition: 'quarantined', reason_code: 'synthetic_interpretation_required' }],
    checkpoints: [{ source_id: batch.events[0].source.source_id, stream_id: batch.events[0].source.stream_id, highest_durable_sequence: 1 }],
  });
  const disposition = (await db.query('SELECT * FROM telemetry_event_dispositions')).rows[0];
  const quarantine = (await db.query('SELECT * FROM telemetry_quarantine')).rows[0];
  assert.equal(disposition.quarantine_id, quarantine.quarantine_id);
  assert.equal(disposition.ledger_id, null);
  assert.deepEqual(quarantine.extension, batch.events[0].extensions);
  assert.equal(quarantine.expires_at.getTime() - quarantine.created_at.getTime(), 3_600_000);
  for (const table of ['canonical_event_ledger', 'projection_jobs', 'active_capability_declarations', 'source_capability_projection', 'session_projection', 'workstream_projection', 'workspace_projection_revisions']) {
    assert.equal((await db.query(`SELECT * FROM ${table}`)).rowCount, 0, table);
  }
});

test('unpermitted namespaces, versions, fields and prohibited core content reject before quarantine', async () => {
  const sentinel = 'PRIVATE_CONTENT_MUST_NOT_SURVIVE';
  const permitted = quarantineBatch().events[0].extensions;
  const extensions = [
    { 'example.invalid/1': permitted['abisso.synthetic.m0/1'] },
    { 'abisso.synthetic.m0/2': permitted['abisso.synthetic.m0/1'] },
    { ...permitted, 'example.invalid/1': {} },
    { 'abisso.synthetic.m0/1': { ...permitted['abisso.synthetic.m0/1'], prompt: sentinel } },
    { 'abisso.synthetic.m0/1': { fixture: sentinel, requires_interpretation: true } },
    { 'abisso.synthetic.m0/1': { fixture: 'quarantine', requires_interpretation: false } },
  ];
  for (const extension of extensions) {
    const batch = quarantineBatch();
    const response = await post({ ...batch, events: [{ ...batch.events[0], extensions: extension }] });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(JSON.parse(text).results[0].disposition, 'rejected');
    assert(!text.includes(sentinel));
  }
  for (const change of [
    { payload: { prompt: sentinel } }, { source: { command: sentinel } },
    { privacy: { event_class: 'operational_metadata', policy_version: 'unaccepted-policy' } },
    { event_kind: 'session.waiting_for_human' }, { event_kind: 'tool.started' },
  ]) {
    const batch = quarantineBatch();
    const response = await post({ ...batch, events: [{ ...batch.events[0], ...change }] });
    assert.equal(response.status, 200);
    const result = (await response.json()).results[0];
    assert.equal(result.disposition, 'rejected');
    if ('event_kind' in change) assert.equal(result.reason_code, 'unknown_event_kind');
  }
  assert.equal((await db.query('SELECT * FROM telemetry_quarantine')).rowCount, 0);
  for (const table of ['telemetry_batch_requests', 'telemetry_event_dispositions', 'canonical_event_ledger', 'projection_jobs', 'ingestion_security_signals']) {
    assert(!JSON.stringify((await db.query(`SELECT * FROM ${table}`)).rows).includes(sentinel));
  }
});

test('quarantine is disabled outside dev/test composition', async () => {
  for (const environment of ['production', undefined]) {
    const api = createApi(db, { environment });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    try {
      const address = api.address();
      assert(address && typeof address === 'object');
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/telemetry/batches`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(quarantineBatch()),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).results[0].disposition, 'rejected');
    } finally {
      await new Promise<void>(resolve => api.close(() => resolve()));
    }
  }
  assert.equal((await db.query('SELECT * FROM telemetry_quarantine')).rowCount, 0);
});

test('synthetic extension transport size is bounded at 256 bytes before persistence', async () => {
  const batch = quarantineBatch();
  const json = JSON.stringify(batch);
  const extension = JSON.stringify(batch.events[0].extensions);
  const padded = json.replace(extension, extension.slice(0, -1) + ' '.repeat(256 - Buffer.byteLength(extension)) + '}');
  assert.equal((await post(padded)).status, 200);
  assert.equal((await post(padded.replace('"extensions":{', '"extensions":{ '))).status, 413);
  assert.equal((await db.query('SELECT * FROM telemetry_quarantine')).rowCount, 1);
});

function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]));
  }
  return value;
}

test('mixed accepted, duplicate, quarantined and rejected outcomes replay deterministically, including key order', async () => {
  const accepted = capabilityBatch();
  assert.equal((await post(accepted)).status, 200);
  const batch = capabilityBatch(2);
  const quarantined = quarantineBatch(3).events[0];
  const rejectedBase = capabilityBatch(4).events[0];
  const rejected = { ...rejectedBase, payload: { ...rejectedBase.payload, prompt: 'PROHIBITED_SENTINEL' } };
  const mixed = { ...batch, events: [batch.events[0], accepted.events[0], quarantined, rejected] };
  const response = await post(mixed);
  assert.equal(response.status, 200);
  const original = await response.text();
  const expected = [
    { event_id: batch.events[0].event_id, disposition: 'accepted' },
    { event_id: accepted.events[0].event_id, disposition: 'duplicate' },
    { event_id: quarantined.event_id, disposition: 'quarantined', reason_code: 'synthetic_interpretation_required' },
    { event_id: rejected.event_id, disposition: 'rejected', reason_code: 'invalid_field' },
  ];
  assert.deepEqual(JSON.parse(original).results, expected);
  assert.equal(JSON.parse(original).checkpoints[0].highest_durable_sequence, 4);
  assert.equal(await (await post(JSON.stringify(reorder(mixed), null, 2))).text(), original);
  const retry = await (await post({ ...mixed, request_id: v7() })).json();
  assert.deepEqual(retry.results, [{ ...expected[0], disposition: 'duplicate' }, ...expected.slice(1)]);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 2);
  assert.equal((await db.query('SELECT * FROM projection_jobs')).rowCount, 2);
  assert.equal((await db.query('SELECT * FROM telemetry_quarantine')).rowCount, 1);
  for (const event of [quarantined, rejected]) {
    const changed = { ...mixed, request_id: v7(), events: [{ ...event, received_at: mixed.issued_at }] };
    const collision = await (await post(changed)).json();
    assert.equal(collision.results[0].reason_code, 'event_id_collision');
  }
  assert.deepEqual((await db.query('SELECT reason_code FROM ingestion_security_signals')).rows, [
    { reason_code: 'event_id_collision' }, { reason_code: 'event_id_collision' },
  ]);
});

test('quarantine payload expires without losing its durable disposition or restoring content on retry', async () => {
  const batch = quarantineBatch();
  const original = await (await post(batch)).text();
  await db.query("UPDATE telemetry_quarantine SET created_at=created_at - interval '2 hours', expires_at=expires_at - interval '2 hours'");
  await purgeExpiredQuarantine(db);
  assert.equal((await db.query('SELECT extension FROM telemetry_quarantine')).rows[0].extension, null);
  assert.equal(await (await post(batch)).text(), original);
  const retry = await (await post({ ...batch, request_id: v7() })).json();
  assert.deepEqual(retry.results, JSON.parse(original).results);
  assert.equal(retry.checkpoints[0].highest_durable_sequence, 1);
  assert.equal((await db.query('SELECT extension FROM telemetry_quarantine')).rows[0].extension, null);
  const acl = (await db.query(`SELECT grantee, privilege_type FROM pg_class c,
    LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='telemetry_quarantine'::regclass`)).rows;
  assert(!acl.some(row => row.grantee === 0), 'PUBLIC has no quarantine privileges');
});

test('quarantined declaration cannot authorize a dependent event and valid prior evidence remains eligible', async () => {
  const declaration = quarantineBatch();
  assert.equal((await (await post(declaration)).json()).results[0].disposition, 'quarantined');
  const dependent = sessionStartBatch(declaration.events[0].payload.declaration_id);
  assert.equal((await (await post(dependent)).json()).results[0].reason_code, 'capability_unavailable');
  const accepted = capabilityBatch(3);
  assert.equal((await (await post(accepted)).json()).results[0].disposition, 'accepted');
  const evidence = quarantineBatch(4);
  evidence.events[0].provenance.evidence_refs = [accepted.events[0].event_id];
  assert.equal((await (await post(evidence)).json()).results[0].disposition, 'quarantined');
});

test('bounded in-flight ingestion rejects overload with 429 and releases its slot after malformed input', async () => {
  // Hold one HTTP request at the body boundary; no internal collaborator mock.
  const api = createApi(db);
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const address = api.address();
  assert(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/v1/telemetry/batches`;
  const waiting = Array.from({ length: 8 }, () => httpRequest(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '2', authorization: `Bearer ${token}` },
  }));
  const completions = waiting.map(request => new Promise<void>((resolve, reject) => {
    request.on('response', response => { response.resume(); response.on('end', resolve); });
    request.on('error', reject);
  }));
  try {
    for (const request of waiting) {
      const received = once(api, 'request');
      request.write('{');
      await received;
    }
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(capabilityBatch()),
    });
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'admission_limit' });
    for (const request of waiting) request.end('}');
    await Promise.all(completions);
    const next = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(capabilityBatch()),
    });
    assert.equal(next.status, 200);
  } finally {
    for (const request of waiting) if (!request.writableEnded) request.end('}');
    await Promise.all(completions);
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});

test('injected precommit database failure rolls back every mixed-batch effect; concurrent retries finalize once', async t => {
  const logs = t.mock.method(console, 'error', () => {});
  const output = t.mock.method(console, 'log', () => {});
  const privateError = 'PRIVATE_DATABASE_EXCEPTION_MUST_NOT_ESCAPE';
  await db.query(`CREATE FUNCTION fail_batch_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${privateError}'; END; $$`);
  await db.query(`CREATE CONSTRAINT TRIGGER fail_batch_commit AFTER INSERT ON telemetry_batch_requests
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_batch_commit()`);
  const batch = capabilityBatch();
  const invalid = capabilityBatch(3).events[0];
  const mixed = { ...batch, events: [batch.events[0], quarantineBatch(2).events[0], { ...invalid, confidence: 99 }] };
  const failure = await post(mixed);
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: 'internal_error' });
  for (const table of ['telemetry_batch_requests', 'telemetry_event_dispositions', 'canonical_event_ledger', 'projection_jobs', 'telemetry_quarantine', 'source_checkpoints', 'active_capability_declarations', 'ingestion_security_signals']) {
    assert.equal((await db.query(`SELECT * FROM ${table}`)).rowCount, 0, table);
  }
  assert(!JSON.stringify([...logs.mock.calls, ...output.mock.calls]).includes(privateError));
  await db.query('DROP TRIGGER fail_batch_commit ON telemetry_batch_requests');
  await db.query('DROP FUNCTION fail_batch_commit()');
  const retries = await Promise.all([post(mixed), post(mixed), post(mixed)]);
  const texts = await Promise.all(retries.map(async response => {
    assert.equal(response.status, 200);
    return response.text();
  }));
  assert.equal(texts[1], texts[0]);
  assert.equal(texts[2], texts[0]);
  assert.deepEqual(JSON.parse(texts[0]).results.map((result: { disposition: string }) => result.disposition), ['accepted', 'quarantined', 'rejected']);
  assert.equal(JSON.parse(texts[0]).checkpoints[0].highest_durable_sequence, 3);
  for (const [table, count] of [
    ['telemetry_batch_requests', 1], ['telemetry_event_dispositions', 3], ['canonical_event_ledger', 1],
    ['projection_jobs', 1], ['telemetry_quarantine', 1], ['source_checkpoints', 1], ['active_capability_declarations', 1],
  ] as const) assert.equal((await db.query(`SELECT * FROM ${table}`)).rowCount, count, table);
});

test('concurrent event identity reuse is serialized independently of request identity', async () => {
  for (const disposition of ['accepted', 'quarantined', 'rejected'] as const) {
    const batch = disposition === 'quarantined' ? quarantineBatch() : capabilityBatch();
    const events = batch.events.map(event => disposition === 'rejected' ? { ...event, confidence: 5 } : event);
    const responses = await Promise.all([post({ ...batch, events }), post({ ...batch, events, request_id: v7() })]);
    const outcomes = await Promise.all(responses.map(async response => {
      assert.equal(response.status, 200);
      return (await response.json()).results[0].disposition;
    }));
    assert.deepEqual(outcomes.sort(), disposition === 'accepted' ? ['accepted', 'duplicate'] : [disposition, disposition]);
  }
  assert.equal((await db.query('SELECT * FROM telemetry_event_dispositions')).rowCount, 3);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM projection_jobs')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM telemetry_quarantine')).rowCount, 1);
  const batch = capabilityBatch(2);
  const changed = { ...batch, request_id: v7(), events: [{ ...batch.events[0], occurred_at: '2026-09-16T00:00:00Z' }] };
  const responses = await Promise.all([post(batch), post(changed)]);
  const outcomes = await Promise.all(responses.map(async response => {
    assert.equal(response.status, 200);
    return (await response.json()).results[0];
  }));
  assert.equal(outcomes.filter(result => result.disposition === 'accepted').length, 1);
  assert.equal(outcomes.filter(result => result.reason_code === 'event_id_collision').length, 1);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 2);
  assert.deepEqual((await db.query('SELECT reason_code FROM ingestion_security_signals')).rows, [{ reason_code: 'event_id_collision' }]);
});

test('exact aged request replay returns original response and checkpoints, while changed reuse collides and unseen issuance expires', async t => {
  const batch = capabilityBatch();
  const realNow = Date.now();
  const response = await post(batch);
  assert.equal(response.status, 200);
  const original = await response.text();
  const next = capabilityBatch(2);
  assert.equal((await post(next)).status, 200);
  t.mock.timers.enable({ apis: ['Date'], now: realNow });
  t.mock.timers.tick(6 * 60_000);
  const replay = await post(JSON.stringify(reorder(batch), null, 2));
  assert.equal(replay.status, 200);
  assert.equal(await replay.text(), original);
  assert.equal(JSON.parse(original).checkpoints[0].highest_durable_sequence, 1);
  assert.equal((await db.query('SELECT highest_durable_sequence FROM source_checkpoints')).rows[0].highest_durable_sequence, '2');
  assert.equal((await post({ ...batch, issued_at: new Date().toISOString() })).status, 409);
  const expired = await post({ ...batch, request_id: v7() });
  assert.equal(expired.status, 400);
  assert.deepEqual(await expired.json(), { error: 'request_expired' });
  // Offline events may keep older event timestamps inside a fresh wrapper.
  const offline = await post({ ...next, request_id: v7(), issued_at: new Date().toISOString() });
  assert.equal(offline.status, 200);
  assert.equal((await offline.json()).results[0].disposition, 'duplicate');
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 2);
});

test('checkpoints stop at gaps and advance through contiguous accepted, rejected and quarantined durable outcomes only', async () => {
  const third = quarantineBatch(3);
  assert.equal((await (await post(third)).json()).checkpoints[0].highest_durable_sequence, 0);
  const first = capabilityBatch();
  assert.equal((await (await post(first)).json()).checkpoints[0].highest_durable_sequence, 1);
  const second = capabilityBatch(2);
  const rejected = { ...second, events: [{ ...second.events[0], confidence: 77 }] };
  assert.equal((await (await post(rejected)).json()).checkpoints[0].highest_durable_sequence, 3);
  assert.equal((await (await post({ ...third, request_id: v7() })).json()).checkpoints[0].highest_durable_sequence, 3);
  const changed = { ...third, request_id: v7(), events: [{ ...third.events[0], source: { ...third.events[0].source, source_sequence: 4 } }] };
  const collision = await (await post(changed)).json();
  assert.equal(collision.results[0].reason_code, 'event_id_collision');
  assert.deepEqual(collision.checkpoints, []);
  assert.equal((await db.query('SELECT highest_durable_sequence FROM source_checkpoints')).rows[0].highest_durable_sequence, '3');
});

test('declaration and dependent siblings never activate each other in either ordering', async () => {
  for (const reversed of [false, true]) {
    await db.query('DELETE FROM active_capability_declarations');
    const batch = capabilityBatch();
    const dependent = sessionStartBatch(batch.events[0].payload.declaration_id).events[0];
    const events = [batch.events[0], dependent];
    const response = await post({ ...batch, events: reversed ? events.reverse() : events });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).results.find((result: { event_id: string }) => result.event_id === dependent.event_id), {
      event_id: dependent.event_id, disposition: 'rejected', reason_code: 'capability_unavailable',
    });
    const corrected = { ...dependent, event_id: v7(), source: { ...dependent.source, source_sequence: 3 } };
    assert.equal((await (await post({ ...batch, request_id: v7(), events: [corrected] })).json()).results[0].disposition, 'accepted');
  }
});

test('structural inspection rejects the whole array, while usable IDs allow independent durable safe rejections', async () => {
  const batch = capabilityBatch();
  for (const invalid of [null, [], 42, 'text', {}, { event_id: 'not-an-id' }, { event_id: null }]) {
    const response = await post({ ...batch, events: [batch.events[0], invalid] });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'malformed_wrapper' });
  }
  for (const table of ['telemetry_batch_requests', 'telemetry_event_dispositions', 'canonical_event_ledger', 'projection_jobs', 'telemetry_quarantine', 'source_checkpoints']) {
    assert.equal((await db.query(`SELECT * FROM ${table}`)).rowCount, 0, table);
  }
  const missingWorkspace = { ...capabilityBatch(2).events[0], workspace_id: undefined };
  const malformedSource = { ...capabilityBatch(3).events[0], source: { source_id: synthetic.source } };
  const conflicting = { ...capabilityBatch(4).events[0], machine_id: randomUUID() };
  const unresolvable = { event_id: v7(), source: null };
  const interpreted = { ...batch, events: [batch.events[0], missingWorkspace, malformedSource, conflicting, unresolvable] };
  const response = await post(interpreted);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text).results, [
    { event_id: batch.events[0].event_id, disposition: 'accepted' },
    { event_id: missingWorkspace.event_id, disposition: 'rejected', reason_code: 'identity_mismatch' },
    { event_id: malformedSource.event_id, disposition: 'rejected', reason_code: 'invalid_field' },
    { event_id: conflicting.event_id, disposition: 'rejected', reason_code: 'identity_mismatch' },
    { event_id: unresolvable.event_id, disposition: 'rejected', reason_code: 'unauthorized_source' },
  ]);
  assert.equal(JSON.parse(text).checkpoints[0].highest_durable_sequence, 2);
  assert.equal(await (await post(interpreted)).text(), text);
  assert.equal((await db.query('SELECT * FROM telemetry_event_dispositions')).rowCount, 4);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
});

test('every mixed replay rechecks expiry, revocation and current principal/source authority', async () => {
  const batch = capabilityBatch();
  const mixed = { ...batch, events: [batch.events[0], quarantineBatch(2).events[0]] };
  assert.equal((await post(mixed)).status, 200);
  assert.equal((await post(mixed, '')).status, 401);
  assert.equal((await post(mixed, 'x'.repeat(43))).status, 401);
  const changes = [
    ['machine_credentials', 'revoked', 'true', 'false', 401],
    ['machine_credentials', 'expires_at', "now() - interval '1 minute'", "now() + interval '15 minutes'", 401],
    ['machines', 'active', 'false', 'true', 403],
    ['memberships', 'active', 'false', 'true', 403],
    ['users', 'active', 'false', 'true', 403],
    ['workspaces', 'active', 'false', 'true', 403],
    ['sources', 'active', 'false', 'true', 403],
    ['collection_consents', 'active', 'false', 'true', 403],
    ['workspace_policies', 'operational_metadata_allowed', 'false', 'true', 403],
    ['machine_configuration', 'collection_state', "'paused'", "'active'", 403],
  ] as const;
  for (const [table, field, disabled, restored, status] of changes) {
    await db.query(`UPDATE ${table} SET ${field}=${disabled}`);
    const replay = await post(mixed);
    assert.equal(replay.status, status, `${table}.${field}`);
    assert.deepEqual(await replay.json(), { error: status === 401 ? 'invalid_credentials' : 'inactive_authority' });
    await db.query(`UPDATE ${table} SET ${field}=${restored}`);
  }
  const otherMachine = randomUUID();
  await db.query('INSERT INTO machines VALUES ($1,$2,$3,true)', [otherMachine, synthetic.workspace, synthetic.user]);
  await db.query('UPDATE sources SET machine_id=$1', [otherMachine]);
  assert.equal((await post(mixed)).status, 403);
  await db.query('UPDATE sources SET machine_id=$1', [synthetic.machine]);
  assert.equal((await post(mixed)).status, 200);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM telemetry_quarantine')).rowCount, 1);
});

test('tenant/source attacks reveal no foreign ownership and cannot enter accepted or quarantine storage', async () => {
  const workspace = randomUUID();
  const user = randomUUID();
  const machine = randomUUID();
  const source = randomUUID();
  await db.query('INSERT INTO workspaces VALUES ($1,true)', [workspace]);
  await db.query('INSERT INTO users VALUES ($1,true)', [user]);
  await db.query('INSERT INTO memberships (user_id, workspace_id, active) VALUES ($1,$2,true)', [user, workspace]);
  await db.query('INSERT INTO machines VALUES ($1,$2,$3,true)', [machine, workspace, user]);
  await db.query("INSERT INTO sources VALUES ($1,$2,$3,$4,'abisso','synthetic_m0',true)", [source, machine, workspace, user]);
  const event = quarantineBatch().events[0];
  const claim = { ...event, workspace_id: workspace, user_id: user, machine_id: machine };
  const rejection = await (await post({ request_id: v7(), issued_at: new Date().toISOString(), events: [claim] })).json();
  assert.deepEqual(rejection.results[0], { event_id: event.event_id, disposition: 'rejected', reason_code: 'identity_mismatch' });
  const scoped = (await db.query('SELECT workspace_id,source_id FROM telemetry_event_dispositions')).rows;
  assert.deepEqual(scoped, [{ workspace_id: synthetic.workspace, source_id: synthetic.source }]);
  const probes = [];
  for (const sourceId of [source, randomUUID()]) {
    const response = await post({ request_id: v7(), issued_at: new Date().toISOString(), events: [{ ...claim, source: { ...claim.source, source_id: sourceId } }] });
    assert.equal(response.status, 200);
    probes.push((await response.json()).results[0]);
  }
  assert.deepEqual(probes[0], probes[1]);
  assert.equal(probes[0].reason_code, 'unauthorized_source');
  for (const table of ['canonical_event_ledger', 'projection_jobs', 'telemetry_quarantine']) assert.equal((await db.query(`SELECT * FROM ${table}`)).rowCount, 0);
});

async function login() {
  const page = await fetch(`${url}/dev/login`);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
  const cookie = page.headers.get('set-cookie')!.split(';')[0];
  const headers = { origin: url, cookie, 'content-type': 'application/x-www-form-urlencoded' };
  const issue = await fetch(`${url}/dev/login/code`, { method: 'POST', headers, body: new URLSearchParams({ csrf }) });
  assert.equal(issue.status, 200);
  const { code } = await issue.json();
  const exchange = await fetch(`${url}/dev/login/exchange`, { method: 'POST', headers, body: new URLSearchParams({ csrf, code }) });
  assert.equal(exchange.status, 200);
  return exchange.headers.get('set-cookie')!.split(';')[0];
}
async function drainWorker() {
  const child = spawn(process.execPath, ['apps/worker/main.ts', '--drain'], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PGOPTIONS: `-c search_path=${schema}` }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', value => { output += value; });
  child.stderr.on('data', value => { output += value; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, output);
  return output;
}

test('worker and authorized Live consume accepted evidence only; duplicate acceptance changes no projection, job or revision', async t => {
  const logs = t.mock.method(console, 'error', () => {});
  const cookie = await login();
  const declaration = capabilityBatch();
  assert.equal((await post(declaration)).status, 200);
  const start = sessionStartBatch(declaration.events[0].payload.declaration_id);
  const privateStart = sessionStartBatch(declaration.events[0].payload.declaration_id, 3).events[0];
  const quarantined = { ...privateStart, extensions: quarantineBatch().events[0].extensions };
  const invalid = { ...capabilityBatch(4).events[0], confidence: 99 };
  const mixed = { ...start, events: [start.events[0], quarantined, invalid] };
  const result = await (await post(mixed)).json();
  assert.deepEqual(result.results.map((item: { disposition: string }) => item.disposition), ['accepted', 'quarantined', 'rejected']);
  const before = await (await fetch(`${url}/v1/live`, { headers: { cookie } })).json();
  assert.deepEqual(before.workstreams, []);
  const workerOutput = await drainWorker();
  const live = await (await fetch(`${url}/v1/live`, { headers: { cookie } })).json();
  assert.equal(live.workstreams.length, 1);
  assert.equal(live.workstreams[0].sessions.length, 1);
  assert.equal(live.workstreams[0].sessions[0].id, start.events[0].session_id);
  const visible = JSON.stringify(live);
  assert(!visible.includes(quarantined.session_id));
  assert(!visible.includes(quarantined.event_id));
  assert(!visible.includes('abisso.synthetic.m0'));
  assert(!workerOutput.includes('abisso.synthetic.m0'));
  assert(!JSON.stringify(logs.mock.calls).includes('abisso.synthetic.m0'));
  assert.equal((await db.query('SELECT declaration_id FROM active_capability_declarations')).rows[0].declaration_id, declaration.events[0].payload.declaration_id);
  const tables = ['canonical_event_ledger', 'projection_jobs', 'session_projection', 'workstream_projection', 'workspace_projection_revisions', 'source_capability_projection'];
  const durable = await Promise.all(tables.map(async table => (await db.query(`SELECT * FROM ${table}`)).rows));
  const retry = await (await post({ ...mixed, request_id: v7() })).json();
  assert.equal(retry.results[0].disposition, 'duplicate');
  assert.equal(await drainWorker(), workerOutput);
  const after = await (await fetch(`${url}/v1/live`, { headers: { cookie } })).json();
  assert.deepEqual(after.workstreams, live.workstreams);
  assert.equal(after.workspace_projection_revision, live.workspace_projection_revision);
  assert.deepEqual(await Promise.all(tables.map(async table => (await db.query(`SELECT * FROM ${table}`)).rows)), durable);
});

async function rawPost(body: string | Buffer, headers: Record<string, string> = {}) {
  return fetch(`${url}/v1/telemetry/batches`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : new Uint8Array(body),
  });
}

test('JSON parser, wrapper and transport failures are safe whole-request failures with no durable effects', async () => {
  const batch = capabilityBatch();
  const json = JSON.stringify(batch);
  const failures: [string, number][] = [
    ['{', 400], [json + 'true', 400], [json.replace('"schema_version":"1.0"', '"schema_version":"1.0","schema_\\u0076ersion":"1.0"'), 400],
    [json.replace('"schema_version":"1.0"', '"schema_version":"\\ud800"'), 400],
    [json.replace('"schema_version":"1.0"', '"schema_version":"\\u0000"'), 400],
    [json.replace('"source_sequence":1', '"source_sequence":9007199254740993'), 400],
    [json.replace('"source_sequence":1', '"source_sequence":1e400'), 400],
    [json.replace('"source_sequence":1', '"source_sequence":01'), 400],
    [json.replace('"source_sequence":1', '"source_sequence":NaN'), 400],
    [JSON.stringify({ ...batch, request_id: randomUUID() }), 400],
    [JSON.stringify({ ...batch, issued_at: 'not-a-time' }), 400],
    [JSON.stringify({ ...batch, events: [] }), 400],
    [JSON.stringify({ ...batch, extra: true }), 400],
    [json.replace('"schema_version":"1.0"', `"schema_version":${JSON.stringify('é'.repeat(65))}`), 413],
    [JSON.stringify({ ...batch, events: Array(201).fill(batch.events[0]) }), 413],
    [JSON.stringify({ ...batch, ...Object.fromEntries(Array.from({ length: 62 }, (_, index) => [`key${index}`, 0])) }), 413],
    [JSON.stringify({ ...batch, events: [{ ...batch.events[0], extra: Array(201).fill(0) }] }), 413],
    [json.replace('"extensions":{}', '"extensions":{"x":' + '['.repeat(9) + '0' + ']'.repeat(9) + '}'), 413],
    [json.replace('"payload":{', '"payload":{"x":{"x":{"x":{"x":0}}},'), 413],
    [JSON.stringify({ ...batch, events: [{ ...batch.events[0], payload: { ...batch.events[0].payload, capabilities: Array(201).fill({}) } }] }), 413],
  ];
  for (const [body, status] of failures) {
    const response = await rawPost(body);
    assert.equal(response.status, status, body.slice(0, 100));
    const error = await response.json();
    assert(['invalid_json', 'malformed_wrapper', 'hard_limit'].includes(error.error));
    assert.deepEqual(Object.keys(error), ['error']);
  }
  for (const [body, headers, status, code] of [
    [Buffer.from([0xff]), {}, 400, 'invalid_json'],
    ['{}', { 'content-type': 'text/plain' }, 400, 'malformed_wrapper'],
    ['{}', { 'content-encoding': 'br' }, 400, 'unsupported_encoding'],
    ['invalid gzip', { 'content-encoding': 'gzip' }, 413, 'invalid_compressed_body'],
  ] as const) {
    const response = await rawPost(body, headers);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: code });
  }
  assert.equal((await fetch(`${url}/v1/telemetry/batches`)).status, 404);
  const missingAuth = await fetch(`${url}/v1/telemetry/batches`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json });
  assert.equal(missingAuth.status, 401);
  for (const table of ['telemetry_batch_requests', 'telemetry_event_dispositions', 'canonical_event_ledger', 'projection_jobs', 'telemetry_quarantine', 'source_checkpoints']) assert.equal((await db.query(`SELECT * FROM ${table}`)).rowCount, 0, table);
});

test('event, wire and decoded-byte limits are inclusive and oversized retries do not process', async () => {
  const batch = capabilityBatch();
  const event = JSON.stringify(batch.events[0]);
  const paddedEvent = event.slice(0, -1) + ' '.repeat(64 * 1024 - Buffer.byteLength(event)) + '}';
  const json = JSON.stringify(batch).replace(event, paddedEvent);
  const response = await rawPost(json);
  assert.equal(response.status, 200);
  const original = await response.text();
  assert.equal(JSON.parse(original).results[0].disposition, 'accepted');
  assert.equal((await rawPost(json.replace(paddedEvent, paddedEvent.slice(0, -1) + ' }'))).status, 413);
  const wire = json + ' '.repeat(512 * 1024 - Buffer.byteLength(json));
  assert.equal(await (await rawPost(wire)).text(), original);
  assert.equal((await rawPost(wire + ' ')).status, 413);
  const decoded = json + ' '.repeat(1024 * 1024 - Buffer.byteLength(json));
  const compressed = await rawPost(gzipSync(decoded), { 'content-encoding': 'gzip' });
  assert.equal(compressed.status, 200);
  assert.equal(await compressed.text(), original);
  assert.equal((await rawPost(gzipSync(decoded + ' '), { 'content-encoding': 'gzip' })).status, 413);
  assert.equal((await db.query('SELECT * FROM telemetry_batch_requests')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM canonical_event_ledger')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM projection_jobs')).rowCount, 1);
});

test('collection, UTF-8 string and safe-integer boundaries remain interpretable under narrower canonical validation', async () => {
  const batch = capabilityBatch();
  const repeated = await post({ ...batch, events: Array(200).fill(batch.events[0]) });
  assert.equal(repeated.status, 200);
  const results = (await repeated.json()).results;
  assert.equal(results.length, 200);
  assert.equal(results[0].disposition, 'accepted');
  assert(results.slice(1).every((result: { disposition: string }) => result.disposition === 'duplicate'));
  const maximum = capabilityBatch(Number.MAX_SAFE_INTEGER);
  assert.equal((await (await post(maximum)).json()).results[0].disposition, 'accepted');
  assert.equal((await db.query('SELECT source_sequence FROM canonical_event_ledger WHERE event_id=$1', [maximum.events[0].event_id])).rows[0].source_sequence, '9007199254740991');
  for (const value of [0, -1, 0.5]) {
    const event = capabilityBatch().events[0];
    const response = await post({ request_id: v7(), issued_at: new Date().toISOString(), events: [{ ...event, source: { ...event.source, source_sequence: value } }] });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].disposition, 'rejected');
  }
  const unknown = capabilityBatch().events[0];
  const boundary = await post({ request_id: v7(), issued_at: new Date().toISOString(), events: [{ ...unknown, extra: Array(200).fill('é'.repeat(64)) }] });
  assert.equal(boundary.status, 200);
  assert.equal((await boundary.json()).results[0].disposition, 'rejected');
  const properties = Object.fromEntries(Array.from({ length: 61 }, (_, index) => [`key${index}`, 0]));
  assert.equal((await post({ ...batch, ...properties })).status, 400);
});
