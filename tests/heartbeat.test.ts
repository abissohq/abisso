import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, afterEach, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { v7 } from 'uuid';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApi } from '../apps/backend/api.ts';
import { LiveView } from '../apps/web/live.ts';
import { bootstrapSynthetic, synthetic } from '../packages/database/bootstrap.ts';
import { migrate } from '../packages/database/database.ts';
import { readLive } from '../packages/live/read.ts';
import { LiveSynchronization } from '../packages/live/synchronization.ts';
import { processNext } from '../packages/processing/worker.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { heartbeatBatch, sessionStartBatch } from '../packages/test-fixtures/session.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let url: string;
let token: string;
beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, application_name: schema });
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
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
after(() => admin.end());

async function login() {
  const page = await fetch(`${url}/dev/login`);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
  const initial = page.headers.get('set-cookie')!.split(';')[0];
  const form = (path: string, code?: string) => fetch(`${url}${path}`, { method: 'POST', headers: { cookie: initial, origin: url, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, ...(code ? { code } : {}) }) });
  const code = (await (await form('/dev/login/code')).json()).code;
  const exchange = await form('/dev/login/exchange', code);
  assert.equal(exchange.status, 200);
  return exchange.headers.get('set-cookie')!.split(';')[0];
}
async function submit(batch: unknown) {
  const response = await fetch(`${url}/v1/telemetry/batches`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  assert.equal(response.status, 200);
  return response.json();
}
async function snapshot(cookie: string) {
  const response = await fetch(`${url}/v1/live`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.json();
}
async function drain() { while (await processNext(db)) { /* one committed job at a time */ } }

async function stream(cookie?: string, headers: Record<string, string> = {}) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const abort = new AbortController();
    const response = await fetch(`${url}/v1/live/events`, { headers: { ...headers, ...(cookie ? { cookie } : {}) }, signal: abort.signal });
    if (response.status === 503) { abort.abort(); await delay(25); continue; }
    return { response, abort, reader: response.body?.getReader(), buffer: '' };
  }
  throw new Error('listener_unavailable');
}
async function nextEvent(connection: Awaited<ReturnType<typeof stream>>) {
  const reader = connection.reader!;
  for (;;) {
    const end = connection.buffer.indexOf('\n\n');
    if (end >= 0) {
      const frame = connection.buffer.slice(0, end);
      connection.buffer = connection.buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      if (event) return { event, data: JSON.parse(/^data: (.+)$/m.exec(frame)![1]) };
      continue;
    }
    const chunk = await reader.read();
    if (chunk.done) return null;
    connection.buffer += new TextDecoder().decode(chunk.value);
  }
}

test('three authenticated batches project Starting then Running and committed safe invalidations drive authoritative rereads', async () => {
  const cookie = await login();
  const connection = await stream(cookie);
  assert.equal(connection.response.status, 200);
  assert.deepEqual(await nextEvent(connection), { event: 'stream.ready', data: {} });
  try {
    const a = capabilityBatch();
    assert.equal((await submit(a)).results[0].disposition, 'accepted');
    const b = sessionStartBatch(a.events[0].payload.declaration_id);
    assert.equal((await submit(b)).results[0].disposition, 'accepted');
    assert.deepEqual((await snapshot(cookie)).workstreams, []);
    await drain();
    const firstHint = await nextEvent(connection);
    assert.equal(firstHint?.event, 'projection.invalidated');
    assert.deepEqual(Object.keys(firstHint!.data).sort(), ['entity_id', 'projection_type', 'revision']);
    const starting = await snapshot(cookie);
    const workstream = starting.workstreams[0];
    const session = workstream.sessions[0];
    assert.equal(starting.workspace_projection_revision, firstHint?.data.revision);
    assert.equal(workstream.state, 'Active');
    assert.equal(session.state, 'Starting');
    assert.equal(session.freshness_policy_version, 'm0-session-freshness-v1');
    const c = heartbeatBatch(b.events[0], 3, 17);
    assert.equal((await submit(c)).results[0].disposition, 'accepted');
    assert.equal((await snapshot(cookie)).workspace_projection_revision, starting.workspace_projection_revision);
    await drain();
    const secondHint = await nextEvent(connection);
    assert.equal(secondHint?.event, 'projection.invalidated');
    assert.equal(secondHint?.data.entity_id, workstream.id);
    assert.equal(secondHint?.data.revision, '2');
    const running = await snapshot(cookie);
    assert.equal(running.workspace_projection_revision, '2');
    assert.equal(running.workstreams[0].id, workstream.id);
    assert.equal(running.workstreams[0].state, 'Active');
    assert.equal(running.workstreams[0].last_meaningful_update_at, null);
    assert.equal(running.workstreams[0].attention, 'not_evaluated');
    assert.equal(running.workstreams[0].sessions[0].id, session.id);
    assert.deepEqual(running.workstreams[0].sessions[0].membership_provenance, session.membership_provenance);
    assert.equal(running.workstreams[0].sessions[0].state, 'Running');
    assert.equal(running.workstreams[0].sessions[0].progress_counter, 17);
    assert.equal(running.workstreams[0].sessions[0].latest_evidence_event_id, c.events[0].event_id);
    assert.equal(running.workstreams[0].sessions[0].ledger_watermark, '3');
    assert.equal(running.workstreams[0].ledger_watermark, '3');
    assert.equal(running.workstreams[0].revision, '2');
    assert.equal(running.workstreams[0].sessions[0].revision, '2');
    assert.ok(Date.parse(running.workstreams[0].sessions[0].latest_source_contact_at) >= Date.parse(session.latest_source_contact_at));
    const duplicate = await submit({ ...c, request_id: v7() });
    assert.equal(duplicate.results[0].disposition, 'duplicate');
    await drain();
    assert.equal((await snapshot(cookie)).workspace_projection_revision, '2');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM canonical_event_ledger')).rows[0].n, 3);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM projection_jobs')).rows[0].n, 3);
  } finally { connection.abort.abort(); }
});

test('freshness is server received evidence recency and deadline crossing does not mutate lifecycle or ledger', async () => {
  const cookie = await login();
  const a = capabilityBatch(); await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id); await submit(b); await drain();
  const c = heartbeatBatch(b.events[0]); await submit(c); await drain();
  const contact = Date.parse((await snapshot(cookie)).workstreams[0].sessions[0].latest_source_contact_at);
  for (const [offset, status] of [[59999, 'Fresh'], [60000, 'Fresh'], [60001, 'Stale']] as const) {
    const value = await readLive(db, cookie, null, new Date(contact + offset));
    assert.equal(value.workstreams[0].freshness_status, status);
    assert.equal(value.workstreams[0].sessions[0].freshness_status, status);
    assert.equal((value.workstreams[0].sessions[0] as unknown as { state: string }).state, 'Running');
  }
  const presentation = await readLive(db, cookie, null, new Date(contact + 59_999));
  const html = renderToStaticMarkup(createElement(LiveView, { snapshot: { ...presentation, browser_read_at: 0 } as never, now: 2 }));
  assert.match(html, /Running · Evidence Stale/);
  assert.doesNotMatch(html, /<dd>Fresh<\/dd>/);
  const before = await snapshot(cookie);
  assert.equal((await submit({ ...c, request_id: v7() })).results[0].disposition, 'duplicate');
  const unrelated = capabilityBatch(5);
  assert.equal((await submit(unrelated)).results[0].disposition, 'accepted');
  await drain();
  const bad = heartbeatBatch(b.events[0], 4); bad.events[0].payload.activity_class = 'heartbeat'; bad.events[0].capability_snapshot_id = v7();
  assert.equal((await submit(bad)).results[0].disposition, 'rejected');
  const privateBody = heartbeatBatch(b.events[0], 6);
  (privateBody.events[0].payload as unknown as Record<string, unknown>).prompt = 'private prompt marker';
  const privateResult = await submit(privateBody);
  assert.equal(privateResult.results[0].disposition, 'rejected');
  assert.ok(!JSON.stringify(privateResult).includes('private prompt marker'));
  const after = await snapshot(cookie);
  assert.equal(after.workspace_projection_revision, before.workspace_projection_revision);
  assert.equal(after.workstreams[0].sessions[0].latest_source_contact_at, before.workstreams[0].sessions[0].latest_source_contact_at);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM canonical_event_ledger')).rows[0].n, 4);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM projection_jobs')).rows[0].n, 4);
});

test('SSE requires browser authority, correct Origin and workspace scope', async () => {
  const cookie = await login();
  assert.equal((await stream()).response.status, 401);
  assert.equal((await stream(undefined, { authorization: `Bearer ${token}` })).response.status, 401);
  assert.equal((await stream(cookie, { origin: 'https://attacker.invalid' })).response.status, 403);
  const otherWorkspace = await fetch(`${url}/v1/live/events?workspace_id=${randomUUID()}`, { headers: { cookie } });
  assert.equal(otherWorkspace.status, 403);
  const allowed = await stream(cookie, { origin: url });
  assert.equal(allowed.response.status, 200);
  assert.equal((await nextEvent(allowed))?.event, 'stream.ready');
  const a = capabilityBatch(); await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id); await submit(b);
  await db.query('UPDATE memberships SET active=false');
  await drain();
  assert.equal(await nextEvent(allowed), null);
  allowed.abort.abort();
  assert.equal((await stream(cookie)).response.status, 403);
  const liveSession = await stream(undefined, { authorization: `Bearer ${token}` });
  assert.equal(liveSession.response.status, 401);
});

test('listener loss closes streams; commits remain readable and reconnect starts a new synchronization', async () => {
  const cookie = await login();
  const first = await stream(cookie);
  assert.equal((await nextEvent(first))?.event, 'stream.ready');
  const listener = (await db.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND pid <> pg_backend_pid() LIMIT 1', [`${schema}_realtime`])).rows[0];
  assert.ok(listener);
  await db.query('SELECT pg_terminate_backend($1)', [listener.pid]);
  assert.equal(await nextEvent(first), null);
  const a = capabilityBatch(); await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id); await submit(b);
  await drain();
  assert.equal((await snapshot(cookie)).workstreams[0].sessions[0].state, 'Starting');
  const second = await stream(cookie);
  try {
    assert.equal((await nextEvent(second))?.event, 'stream.ready');
    const reread = await snapshot(cookie);
    assert.equal(reread.workspace_projection_revision, '1');
  } finally { second.abort.abort(); first.abort.abort(); }
});

test('SQL notification failure rolls back projection and emits only after a successful retry', async () => {
  const cookie = await login();
  const connection = await stream(cookie);
  await nextEvent(connection);
  const a = capabilityBatch(); await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id); await submit(b);
  await processNext(db); // capability job
  await db.query(`CREATE FUNCTION ${schema}.pg_notify(text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_notify_failure'; END$$`);
  const faultDb = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},pg_catalog` });
  const pending = nextEvent(connection);
  try {
    await assert.rejects(processNext(faultDb), /injected_notify_failure/);
    assert.equal((await snapshot(cookie)).workspace_projection_revision, '0');
    assert.equal((await db.query("SELECT status FROM projection_jobs WHERE ledger_id=2")).rows[0].status, 'pending');
    assert.equal(await Promise.race([pending.then(() => 'notified'), delay(40).then(() => 'silent')]), 'silent');
  } finally {
    await faultDb.end();
    await db.query(`DROP FUNCTION ${schema}.pg_notify(text,text)`);
  }
  await processNext(db);
  assert.equal((await pending)?.data.revision, '1');
  assert.equal((await snapshot(cookie)).workspace_projection_revision, '1');
  connection.abort.abort();
});

test('real commits between stream.ready and snapshot, and during a delayed read, reconcile through revision fences', async () => {
  const cookie = await login();
  const a = capabilityBatch(); await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id); await submit(b);
  await processNext(db); // declaration only
  const connection = await stream(cookie);
  assert.equal((await nextEvent(connection))?.event, 'stream.ready');
  let releaseInitial!: () => void;
  const initialGate = new Promise<void>(resolve => { releaseInitial = resolve; });
  let releaseDelayed!: () => void;
  const delayedGate = new Promise<void>(resolve => { releaseDelayed = resolve; });
  let first = true;
  let delayNext = false;
  const published: { revision: string | null; ready: boolean }[] = [];
  const sync = new LiveSynchronization(async () => {
    if (first) { first = false; await initialGate; }
    const value = await snapshot(cookie);
    if (delayNext) { delayNext = false; await delayedGate; }
    return value;
  }, (value, ready) => published.push({ revision: value?.workspace_projection_revision ?? null, ready }), () => assert.fail('reconciliation failed'));
  async function waitFor(revision: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (published.at(-1)?.revision === revision && published.at(-1)?.ready) return;
      await delay(10);
    }
    assert.fail(`revision ${revision} was not synchronized`);
  }
  try {
    sync.ready(); // subscriber registered; first snapshot has not started
    await processNext(db); // start commits after stream.ready
    const startHint = await nextEvent(connection);
    sync.invalidated(startHint!.data);
    releaseInitial();
    await waitFor('1');
    delayNext = true;
    sync.reread(); // fetches revision 1, then holds its response
    for (let attempt = 0; delayNext && attempt < 100; attempt++) await delay(10);
    const c = heartbeatBatch(b.events[0]); await submit(c);
    await processNext(db); // heartbeat commits while read response is held
    const heartbeatHint = await nextEvent(connection);
    sync.invalidated(heartbeatHint!.data);
    releaseDelayed();
    await waitFor('2');
    assert.equal(published.at(-1)?.revision, (await snapshot(cookie)).workspace_projection_revision);
  } finally { connection.abort.abort(); releaseInitial(); releaseDelayed(); }
});

test('revision-fenced reconciliation ignores stale and overlapping responses across reconnects', async () => {
  type TestSnapshot = { workspace_projection_revision: string; server_now: string; workstreams: [] };
  const resolvers: ((value: TestSnapshot) => void)[] = [];
  const shown: { revision: string | null; ready: boolean }[] = [];
  const sync = new LiveSynchronization<TestSnapshot>(() => new Promise<TestSnapshot>(resolve => resolvers.push(resolve)),
    (value, ready) => shown.push({ revision: value?.workspace_projection_revision ?? null, ready }), () => assert.fail('read failed'));
  const value = (revision: string) => ({ workspace_projection_revision: revision, server_now: '2026-09-19T00:00:00.000Z', workstreams: [] as [] });
  sync.ready();
  sync.invalidated({ projection_type: 'workstream', entity_id: randomUUID(), revision: '2' });
  resolvers.shift()!(value('1'));
  await delay(0);
  assert.equal(shown.at(-1)?.ready, false);
  resolvers.shift()!(value('2'));
  await delay(0);
  assert.deepEqual(shown.at(-1), { revision: '2', ready: true });
  sync.disconnected();
  sync.ready();
  resolvers.shift()!(value('1'));
  await delay(0);
  assert.deepEqual(shown.at(-1), { revision: '2', ready: false });
  resolvers.shift()!(value('2'));
  await delay(0);
  assert.deepEqual(shown.at(-1), { revision: '2', ready: true });
  sync.invalidated({ projection_type: 'workstream', entity_id: randomUUID(), revision: '2' });
  assert.equal(resolvers.length, 0);
  sync.ready();
  const old = resolvers.shift()!;
  sync.disconnected();
  sync.ready();
  const newest = resolvers.shift()!;
  newest(value('3'));
  await delay(0);
  old(value('1'));
  await delay(0);
  assert.deepEqual(shown.at(-1), { revision: '3', ready: true });
});
