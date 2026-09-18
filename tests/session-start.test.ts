import { sessionStartBatch as startBatch } from '../packages/test-fixtures/session.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { LiveView } from '../apps/web/live.ts';
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { v5, v7 } from 'uuid';
import pg from 'pg';
import { migrate } from '../packages/database/database.ts';
import { bootstrapSynthetic, synthetic } from '../packages/database/bootstrap.ts';
import { createApi } from '../apps/backend/api.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let url: string;
let token: string;
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
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
after(() => admin.end());

async function login() {
  const page = await fetch(`${url}/dev/login`);
  assert.equal(page.status, 200);
  const html = await page.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
  const preCookie = page.headers.get('set-cookie')!.split(';')[0];
  const issue = await fetch(`${url}/dev/login/code`, { method: 'POST', headers: { origin: url, cookie: preCookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf }) });
  assert.equal(issue.status, 200);
  const code = (await issue.json()).code;
  const exchange = () => fetch(`${url}/dev/login/exchange`, { method: 'POST', headers: { origin: url, cookie: preCookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, code }) });
  const response = await exchange();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Max-Age=3600/);
  assert.match(cookie, /SameSite=Lax/);
  assert.notEqual(cookie.split(';')[0], preCookie);
  assert.equal((await exchange()).status, 403);
  return { cookie: cookie.split(';')[0], code };
}
async function live(cookie?: string, workspace = synthetic.workspace) {
  return fetch(`${url}/v1/live?workspace_id=${workspace}`, { headers: cookie ? { cookie } : {} });
}
async function submit(batch: unknown) {
  const response = await fetch(`${url}/v1/telemetry/batches`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  assert.equal(response.status, 200);
  return response.json();
}
async function worker() {
  const child = spawn(process.execPath, ['apps/worker/main.ts', '--drain'], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PGOPTIONS: `-c search_path=${schema}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stderr.on('data', value => { output += value; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, output);
}

test('human login rotates sessions, stores only digests and enforces current membership and principal separation', async () => {
  const { cookie, code } = await login();
  assert.equal((await live()).status, 401);
  assert.equal((await fetch(`${url}/v1/live`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await live(cookie, randomUUID())).status, 403);
  assert.equal((await live(cookie)).status, 200);
  const stored = (await db.query('SELECT * FROM browser_login_codes')).rows[0];
  assert.notEqual(stored.digest, code);
  assert.ok(stored.consumed_at);
  const browserIngest = await fetch(`${url}/v1/telemetry/batches`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(capabilityBatch()) });
  assert.equal(browserIngest.status, 401);
  await db.query('UPDATE memberships SET active = false');
  assert.equal((await live(cookie)).status, 403);
});

test('accepted A then B remains unprojected with worker stopped; restart exposes golden Starting/Active state and duplicate is a no-op', async () => {
  const { cookie } = await login();
  const a = capabilityBatch();
  assert.equal((await submit(a)).results[0].disposition, 'accepted');
  const b = startBatch(a.events[0].payload.declaration_id);
  b.events[0].event_id = '019957c0-0000-7000-8000-000000000001';
  assert.equal((await submit(b)).results[0].disposition, 'accepted');
  assert.deepEqual((await (await live(cookie)).json()).workstreams, []);
  await worker();
  const snapshot = await (await live(cookie)).json();
  assert.equal(snapshot.workspace_projection_revision, '1');
  assert.equal(snapshot.workstreams.length, 1);
  const w = snapshot.workstreams[0];
  const event = b.events[0];
  assert.equal(w.id, '09d38be5-7873-5168-bc26-ecbdbd22a14c');
  assert.equal(w.label, 'Untitled workstream');
  assert.equal(w.state, 'Active');
  assert.equal(w.identity_scheme_version, 'provisional-workstream:v1');
  assert.equal(w.created_from_source_id, synthetic.source);
  assert.equal(w.created_from_event_id, event.event_id);
  assert.equal(w.last_meaningful_update_at, null);
  assert.equal(w.repository, 'not_collected');
  assert.equal(w.branch, 'not_collected');
  assert.equal(w.cost, 'not_collected');
  assert.equal(w.attention, 'not_evaluated');
  const s = w.sessions[0];
  assert.equal(s.id, event.session_id);
  assert.equal(s.provider, 'abisso');
  assert.equal(s.state, 'Starting');
  assert.equal(s.started_at, event.occurred_at);
  assert.equal(s.latest_evidence_event_id, event.event_id);
  assert.equal(s.latest_observed_at, event.observed_at);
  assert.ok(s.latest_received_at);
  assert.equal(s.ledger_watermark, '2');
  assert.equal(w.ledger_watermark, '2');
  assert.equal(s.revision, w.revision);
  assert.equal(s.revision, snapshot.workspace_projection_revision);
  assert.deepEqual(s.identity_provenance, { fact_class: 'observed', source_id: synthetic.source, event_id: event.event_id });
  assert.equal(s.membership_provenance.fact_class, 'inferred');
  assert.equal(s.membership_provenance.evidence_event_id, event.event_id);
  const html = renderToStaticMarkup(createElement(LiveView, { snapshot }));
  for (const value of ['Untitled workstream', 'Starting', 'Active', 'inferred', event.session_id, event.event_id, 'not_collected', 'not_evaluated', 'Last meaningful update', 'null']) assert.ok(html.includes(value));
  assert.equal((await fetch(`${url}/`)).status, 200);
  assert.equal((await submit({ ...b, request_id: v7() })).results[0].disposition, 'duplicate');
  await worker();
  const again = await (await live(cookie)).json();
  delete again.server_now;
  delete snapshot.server_now;
  assert.deepEqual(again, snapshot);
});

test('login requires bound CSRF and same origin; expired codes and sessions fail closed; production omits synthetic routes', async () => {
  const page = await fetch(`${url}/dev/login`);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
  const cookie = page.headers.get('set-cookie')!.split(';')[0];
  const form = (path: string, values: Record<string, string>, origin = url) => fetch(`${url}${path}`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });
  assert.equal((await form('/dev/login/code', { csrf }, 'https://attacker.invalid')).status, 403);
  assert.equal((await form('/dev/login/code', { csrf: 'wrong' })).status, 403);
  const code = (await (await form('/dev/login/code', { csrf })).json()).code;
  await db.query("UPDATE browser_login_codes SET expires_at=clock_timestamp() - interval '1 second'");
  assert.equal((await form('/dev/login/exchange', { csrf, code })).status, 403);
  const signed = await login();
  await db.query("UPDATE browser_sessions SET last_seen_at=clock_timestamp() - interval '16 minutes' WHERE user_id IS NOT NULL");
  assert.equal((await live(signed.cookie)).status, 401);
  const prod = createApi(db, { environment: 'production' });
  prod.listen(0, '127.0.0.1'); await once(prod, 'listening');
  try {
    const address = prod.address(); assert(address && typeof address === 'object');
    for (const path of ['/dev/login', '/dev/login/code', '/dev/login/exchange']) {
      assert.equal((await fetch(`http://127.0.0.1:${address.port}${path}`, { method: path === '/dev/login' ? 'GET' : 'POST' })).status, 404);
    }
  } finally { await new Promise<void>(resolve => prod.close(() => resolve())); }
});

test('dependent starts require a previously accepted active lifecycle declaration, never a sibling or tenant claim', async () => {
  const a = capabilityBatch();
  const b = startBatch(a.events[0].payload.declaration_id);
  assert.equal((await submit({ ...a, events: [...a.events, ...b.events] })).results[1].reason_code, 'capability_unavailable');
  const valid = startBatch(a.events[0].payload.declaration_id, 3);
  valid.events[0].workspace_id = randomUUID();
  assert.equal((await submit(valid)).results[0].reason_code, 'identity_mismatch');
  const wrong = startBatch(v7(), 4);
  assert.equal((await submit(wrong)).results[0].reason_code, 'capability_unavailable');
  await db.query("UPDATE active_capability_declarations SET valid_until=clock_timestamp() - interval '1 second'");
  const expired = startBatch(a.events[0].payload.declaration_id, 5);
  assert.equal((await submit(expired)).results[0].reason_code, 'capability_unavailable');
  const unavailable = capabilityBatch(6); unavailable.events[0].payload.capabilities[0].status = 'unavailable';
  assert.equal((await submit(unavailable)).results[0].disposition, 'accepted');
  assert.equal((await submit(startBatch(unavailable.events[0].payload.declaration_id, 7))).results[0].reason_code, 'capability_unavailable');
  await worker();
  const { cookie } = await login();
  assert.deepEqual((await (await live(cookie)).json()).workstreams, []);
});

test('source-distinct founding events with the same event ID create distinct deterministic Workstreams with coherent row revisions', async () => {
  const source = '00000000-0000-4000-8000-000000000006';
  await db.query("INSERT INTO sources VALUES ($1,$2,$3,$4,'abisso','synthetic_m0',true)", [source, synthetic.machine, synthetic.workspace, synthetic.user]);
  const a1 = capabilityBatch(); const a2 = capabilityBatch(); a2.events[0].source.source_id = source;
  await submit(a1); await submit(a2);
  const b1 = startBatch(a1.events[0].payload.declaration_id); const b2 = startBatch(a2.events[0].payload.declaration_id);
  b2.events[0].event_id = b1.events[0].event_id; b2.events[0].source.source_id = source;
  await submit(b1); await submit(b2); await worker();
  const { cookie } = await login();
  const snapshot = await (await live(cookie)).json();
  assert.equal(snapshot.workspace_projection_revision, '2');
  assert.equal(snapshot.workstreams.length, 2);
  const ids = snapshot.workstreams.map((w: { id: string }) => w.id);
  assert.equal(new Set(ids).size, 2);
  for (const w of snapshot.workstreams) {
    assert.equal(w.id, v5(`provisional-workstream:v1:${w.created_from_source_id}:${b1.events[0].event_id}`, synthetic.workspace));
    assert.equal(w.sessions[0].revision, w.revision);
    assert.ok(BigInt(w.revision) <= BigInt(snapshot.workspace_projection_revision));
  }
});
