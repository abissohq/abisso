import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import pg from 'pg';
import { createApi } from '../apps/backend/api.ts';
import { migrate } from '../packages/database/database.ts';
import { RequestFailure } from '../packages/contracts/capability.ts';
import { enrollMachine } from '../packages/collector/enrollment.ts';
import { createKeychainStore, type EnrollmentSecret, type EnrollmentStore } from '../packages/collector/keychain.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { bootstrapSynthetic, synthetic } from '../packages/database/bootstrap.ts';
import { v7 } from 'uuid';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const hashKey = 'test-refresh-hash-key-at-least-thirty-two-bytes';
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let origin: string;

beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(db);
  server = createApi(db, { environment: 'test', refreshHashKey: hashKey, browserIdentity: async token => {
    if (!token.startsWith('verified:')) throw new RequestFailure(401, 'invalid_identity');
    return { subject: token.slice(9) };
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
after(() => admin.end());

function post(path: string, body: unknown, cookie = '', withOrigin = true) {
  return fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json',
    ...(cookie ? { cookie } : {}), ...(withOrigin ? { origin } : {}) }, body: JSON.stringify(body) });
}
function cookies(response: Response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
async function browser(subject = 'user_enroll') {
  const first = await fetch(`${origin}/v1/browser/session`);
  const initial = await first.json() as { csrf: string };
  const login = await post('/v1/browser/login', { csrf: initial.csrf, token: `verified:${subject}` }, cookies(first));
  assert.equal(login.status, 200);
  const session = await login.json() as { csrf: string };
  const cookie = cookies(login);
  const create = await post('/v1/workspaces', { csrf: session.csrf }, cookie);
  assert.equal(create.status, 201);
  return { csrf: session.csrf, cookie, workspace: (await create.json() as { workspace_id: string }).workspace_id };
}

test('browser confirmation, loopback state, PKCE exchange and scoped machine authority', async () => {
  const user = await browser();
  let stored: EnrollmentSecret | null = null;
  const installationId = randomUUID();
  const store: EnrollmentStore = { read: () => stored, installationId: () => installationId, write: (value: EnrollmentSecret) => { stored = value; } };
  let handoff!: Promise<void>;
  const result = await enrollMachine(origin, store, url => {
    handoff = (async () => {
      const page = new URL(url);
      assert.equal(page.hostname, '127.0.0.1');
      assert.equal(page.searchParams.get('scope'), 'telemetry:write machine:self');
      const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
        redirect_uri: page.searchParams.get('redirect_uri'), challenge: page.searchParams.get('challenge'),
        display_name: 'Desk Mac', scope: page.searchParams.get('scope') }, user.cookie);
      assert.equal(issued.status, 201);
      const body = await issued.json() as { code: string; redirect_uri: string };
      const callback = new URL(body.redirect_uri);
      callback.searchParams.set('code', body.code);
      callback.searchParams.set('state', page.searchParams.get('state')!);
      assert.equal((await fetch(callback)).status, 200);
    })();
  }, fetch, true);
  await handoff;
  const saved = store.read();
  assert(saved);
  assert.equal(result.workspace_id, user.workspace);
  assert.equal(saved.scope, 'telemetry:write machine:self');
  assert.equal((await db.query('SELECT display_name, installation_id FROM machines WHERE id=$1', [result.machine_id])).rows[0].display_name, 'Desk Mac');
  assert.equal((await db.query('SELECT digest, consumed_at FROM machine_enrollment_codes')).rows[0].consumed_at !== null, true);
  assert.equal((await db.query('SELECT * FROM machine_refresh_credentials')).rowCount, 1);
  const audit = (await db.query('SELECT * FROM machine_audit')).rows[0];
  assert.equal(audit.actor_type, 'user');
  assert.equal(audit.workspace_id, user.workspace);
  assert.equal(audit.action, 'machine.registered');
  assert.equal(audit.target_type, 'machine');
  assert.equal(audit.target_id, result.machine_id);
  assert.equal(audit.result, 'success');
  assert.equal(audit.reason, 'authorized_enrollment');
  assert.equal(audit.before_state, 'unregistered');
  assert.equal(audit.after_state, 'registered');
  assert.match(audit.request_id, /^[0-9a-f-]{36}$/);
  assert(audit.recorded_at instanceof Date);
  assert.deepEqual(Object.keys(audit).sort(), ['id', 'workspace_id', 'actor_type', 'actor_id', 'action',
    'target_type', 'target_id', 'result', 'reason', 'before_state', 'after_state', 'request_id', 'recorded_at'].sort());
  const audited = JSON.stringify(audit);
  for (const forbidden of [saved.refresh_token, user.cookie, 'Desk Mac']) assert(!audited.includes(forbidden));
  await assert.rejects(db.query(`INSERT INTO machine_audit
    (workspace_id,actor_type,actor_id,action,target_type,target_id,result,reason,before_state,after_state,request_id)
    VALUES ($1,'user',$2,'machine.registered','machine',$3,'success','unsafe_unbounded_reason','unregistered','registered',$4)`,
  [audit.workspace_id, audit.actor_id, audit.target_id, randomUUID()]));
  await assert.rejects(db.query("UPDATE machine_audit SET reason='installation_conflict'"));
  await assert.rejects(db.query('DELETE FROM machine_audit'));
  assert.equal((await fetch(`${origin}/v1/live?workspace_id=${user.workspace}`, { headers: { authorization: `Bearer ${saved.refresh_token}` } })).status, 401);
  assert.equal((await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace }, '', false)).status, 403);
  assert.equal((await post('/v1/telemetry/batches', {}, user.cookie, false)).status, 401);
});

test('wrong PKCE, redirect, workspace, expiry and code replay fail closed', async () => {
  const user = await browser();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'http://127.0.0.1:12345/callback';
  const issue = (workspace = user.workspace) => post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: workspace,
    redirect_uri: redirect, challenge, display_name: 'Test Mac', scope: 'telemetry:write machine:self' }, user.cookie);
  assert.equal((await issue(randomUUID())).status, 403);
  const issued = await issue();
  assert.equal(issued.status, 201);
  const { code } = await issued.json() as { code: string };
  const redeem = (overrides: object = {}) => post('/v1/machines/enrollment-exchanges', { code, verifier,
    redirect_uri: redirect, installation_id: randomUUID(), ...overrides }, '', false);
  assert.equal((await redeem({ verifier: randomBytes(32).toString('base64url') })).status, 403);
  assert.equal((await redeem({ redirect_uri: 'http://127.0.0.1:12346/callback' })).status, 403);
  assert.equal((await redeem({ redirect_uri: 'http://localhost:12345/callback' })).status, 400);
  assert.equal((await redeem({ user_id: randomUUID(), workspace_id: randomUUID() })).status, 400);
  assert.equal((await redeem()).status, 200);
  assert.equal((await redeem()).status, 403);
  const second = await issue();
  const secondCode = (await second.json() as { code: string }).code;
  await db.query('UPDATE machine_enrollment_codes SET expires_at=clock_timestamp() - interval \'1 second\' WHERE digest=$1',
    [createHash('sha256').update(secondCode).digest('hex')]);
  assert.equal((await redeem({ code: secondCode })).status, 403);
  assert.equal((await db.query('SELECT * FROM machines')).rowCount, 1);
});

test('wrong loopback state fails before exchange', async () => {
  const store = { read: () => null, installationId: () => randomUUID(), write: () => { throw new Error('unexpected'); } };
  let opened = false;
  let callbackRequest!: Promise<Response>;
  await assert.rejects(enrollMachine(origin, store, url => {
    opened = true;
    const page = new URL(url);
    const callback = new URL(page.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', randomBytes(32).toString('base64url'));
    callback.searchParams.set('state', 'wrong');
    callbackRequest = fetch(callback);
  }, fetch, true), /invalid_callback/);
  assert.equal((await callbackRequest).status, 400);
  assert(opened);
  assert.equal((await db.query('SELECT * FROM machines')).rowCount, 0);
});

test('unavailable loopback callback fails before opening the browser', async () => {
  const blocker = createServer();
  blocker.listen(0, '127.0.0.1');
  await once(blocker, 'listening');
  const address = blocker.address();
  assert(address && typeof address !== 'string');
  let opened = false;
  try {
    await assert.rejects(enrollMachine(origin, { read: () => null, installationId: () => randomUUID(), write: () => {} }, () => { opened = true; },
      fetch, true, address.port));
    assert.equal(opened, false);
    assert.equal((await db.query('SELECT * FROM machine_enrollment_codes')).rowCount, 0);
  } finally { blocker.close(); }
});

test('Keychain adapter rejects existing item and passes secret through operation input', () => {
  const calls: { operation: string; value?: string }[] = [];
  let content = 'absent';
  const store = createKeychainStore(input => { calls.push(input); if (input.operation === 'installation' || input.operation === 'read_installation') return secret.installation_id;
    if (input.operation === 'read') return content;
    content = input.value!; return 'stored'; });
  const secret = { installation_id: randomUUID(), machine_id: randomUUID(), workspace_id: randomUUID(), user_id: randomUUID(),
    refresh_token: randomBytes(32).toString('base64url'), scope: 'telemetry:write machine:self' };
  store.write(secret);
  assert.deepEqual(store.read(), secret);
  assert.throws(() => store.write(secret), /already_enrolled/);
  assert.equal(calls.filter(call => call.operation === 'write').length, 1);
  assert.equal(calls.find(call => call.operation === 'write')?.value, JSON.stringify(secret));
});

test('Keychain rejects malformed persisted enrollment records', () => {
  const valid = { installation_id: randomUUID(), machine_id: randomUUID(), workspace_id: randomUUID(),
    user_id: randomUUID(), refresh_token: randomBytes(32).toString('base64url'), scope: 'telemetry:write machine:self' };
  const invalid = [
    { ...valid, installation_id: undefined }, { ...valid, extra: 'unexpected' },
    { ...valid, installation_id: 'not-a-uuid' }, { ...valid, machine_id: 'not-a-uuid' },
    { ...valid, workspace_id: 'not-a-uuid' }, { ...valid, user_id: 'not-a-uuid' },
    { ...valid, refresh_token: 'short' }, { ...valid, scope: 'telemetry:write' },
    { ...valid, workspace_id: 42 }, { ...valid, machine_id: null },
    { ...valid, refresh_token: 123 }, { ...valid, scope: null },
    ...Object.keys(valid).map(field => {
      const copy: Record<string, unknown> = { ...valid };
      delete copy[field];
      return copy;
    }),
  ];
  for (const record of invalid) {
    const store = createKeychainStore(() => JSON.stringify(record));
    assert.throws(() => store.read(), /keychain_invalid/);
  }
  const duplicateKey = JSON.stringify(valid).replace('"scope":', '"scope":"wrong","scope":');
  assert.throws(() => createKeychainStore(() => duplicateKey).read(), /keychain_invalid/);
  assert.throws(() => createKeychainStore(input => input.operation === 'read' ? JSON.stringify(valid) : randomUUID()).read(), /keychain_invalid/);
});

test('simultaneous enrollments cannot leave two active machines for one Keychain', async () => {
  const user = await browser();
  let stored: EnrollmentSecret | null = null;
  const installationId = randomUUID();
  const store: EnrollmentStore = { read: () => stored, installationId: () => installationId, write(value) {
    if (stored) throw new Error('already_enrolled');
    stored = value;
  } };
  const handoffs: Promise<void>[] = [];
  const start = () => enrollMachine(origin, store, url => {
    handoffs.push((async () => {
      const page = new URL(url);
      const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
        redirect_uri: page.searchParams.get('redirect_uri'), challenge: page.searchParams.get('challenge'),
        display_name: 'Race Mac', scope: page.searchParams.get('scope') }, user.cookie);
      assert.equal(issued.status, 201);
      const { code } = await issued.json() as { code: string };
      const callback = new URL(page.searchParams.get('redirect_uri')!);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', page.searchParams.get('state')!);
      assert.equal((await fetch(callback)).status, 200);
    })());
  }, fetch, true);
  const outcomes = await Promise.allSettled([start(), start()]);
  await Promise.all(handoffs);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines WHERE active')).rows[0].n, 1);
  assert.equal((await db.query('SELECT installation_id FROM machines WHERE active')).rows[0].installation_id, installationId);
});

test('failed Keychain write followed by enrollment retry cannot create another active machine', async () => {
  const user = await browser();
  const handoffs: Promise<void>[] = [];
  const open = (url: string) => {
    handoffs.push((async () => {
      const page = new URL(url);
      const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
        redirect_uri: page.searchParams.get('redirect_uri'), challenge: page.searchParams.get('challenge'),
        display_name: 'Retry Mac', scope: page.searchParams.get('scope') }, user.cookie);
      assert.equal(issued.status, 201);
      const { code } = await issued.json() as { code: string };
      const callback = new URL(page.searchParams.get('redirect_uri')!);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', page.searchParams.get('state')!);
      assert.equal((await fetch(callback)).status, 200);
    })());
  };
  const installationId = randomUUID();
  await assert.rejects(enrollMachine(origin, { read: () => null, installationId: () => installationId,
    write: () => { throw new Error('keychain_unavailable'); } }, open, fetch, true));
  await assert.rejects(enrollMachine(origin, { read: () => null, installationId: () => installationId,
    write: () => {} }, open, fetch, true));
  await Promise.all(handoffs);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines WHERE active')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_credentials')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_refresh_credentials')).rows[0].n, 1);
});

test('machine registration audit has the required safe fields', async () => {
  const columns = (await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='machine_audit'`)).rows.map(row => row.column_name);
  assert(columns.includes('target_type'));
  assert(columns.includes('reason'));
});

test('concurrent redemption consumes a code once, while invalid bindings preserve a valid retry', async () => {
  const user = await browser();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'http://127.0.0.1:12345/callback';
  const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
    redirect_uri: redirect, challenge, display_name: 'Code Race', scope: 'telemetry:write machine:self' }, user.cookie);
  const { code } = await issued.json() as { code: string };
  const installationId = randomUUID();
  const redeem = (changes: object = {}) => post('/v1/machines/enrollment-exchanges',
    { code, verifier, redirect_uri: redirect, installation_id: installationId, ...changes }, '', false);
  assert.equal((await redeem({ verifier: randomBytes(32).toString('base64url') })).status, 403);
  assert.equal((await redeem({ redirect_uri: 'http://127.0.0.1:12346/callback' })).status, 403);
  assert.equal((await db.query('SELECT consumed_at FROM machine_enrollment_codes')).rows[0].consumed_at, null);
  const statuses = (await Promise.all([redeem(), redeem()])).map(response => response.status).sort();
  assert.deepEqual(statuses, [200, 403]);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines WHERE active')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_credentials')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_refresh_credentials')).rows[0].n, 1);
});

test('installation conflict rolls back code consumption and commits a safe rejection audit', async () => {
  const user = await browser();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'http://127.0.0.1:12345/callback';
  const issue = async () => {
    const response = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
      redirect_uri: redirect, challenge, display_name: 'Conflict Mac', scope: 'telemetry:write machine:self' }, user.cookie);
    return (await response.json() as { code: string }).code;
  };
  const redeem = (code: string, installationId: string) => post('/v1/machines/enrollment-exchanges',
    { code, verifier, redirect_uri: redirect, installation_id: installationId }, '', false);
  const installationId = randomUUID();
  const firstCode = await issue();
  const firstExchange = await redeem(firstCode, installationId);
  assert.equal(firstExchange.status, 200);
  const firstTokens = await firstExchange.json() as { access_token: string; refresh_token: string };
  const retryCode = await issue();
  assert.equal((await redeem(retryCode, installationId)).status, 409);
  const digest = createHash('sha256').update(retryCode).digest('hex');
  assert.equal((await db.query('SELECT consumed_at FROM machine_enrollment_codes WHERE digest=$1', [digest])).rows[0].consumed_at, null);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines WHERE active')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_credentials')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_refresh_credentials')).rows[0].n, 1);
  const rejected = (await db.query("SELECT * FROM machine_audit WHERE result='rejected'")).rows;
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].actor_type, 'user');
  assert.equal(rejected[0].workspace_id, user.workspace);
  assert.equal(rejected[0].action, 'machine.registered');
  assert.equal(rejected[0].target_type, 'machine');
  assert.equal(rejected[0].reason, 'installation_conflict');
  assert.equal(rejected[0].before_state, 'registered');
  assert.equal(rejected[0].after_state, 'registered');
  assert.match(rejected[0].request_id, /^[0-9a-f-]{36}$/);
  assert(rejected[0].recorded_at instanceof Date);
  assert.equal(rejected[0].actor_id, (await db.query('SELECT user_id FROM machine_enrollment_codes WHERE digest=$1', [digest])).rows[0].user_id);
  const audited = JSON.stringify(rejected[0]);
  for (const forbidden of [firstCode, retryCode, verifier, redirect, 'Conflict Mac', firstTokens.access_token,
    firstTokens.refresh_token, user.cookie]) assert(!audited.includes(forbidden));
  assert.equal((await redeem(retryCode, randomUUID())).status, 200);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines WHERE active')).rows[0].n, 2);
});

test('mixed browser tabs cannot swap callback state or register either machine', async () => {
  const user = await browser();
  const pages: URL[] = [];
  const stores = [randomUUID(), randomUUID()].map(installationId =>
    ({ read: () => null, installationId: () => installationId, write: () => {} }));
  const attempts = stores.map(store => enrollMachine(origin, store, url => { pages.push(new URL(url)); }, fetch, true));
  const settled = Promise.allSettled(attempts);
  while (pages.length < 2) await new Promise(resolve => setTimeout(resolve, 1));
  const codes = await Promise.all(pages.map(async page => {
    const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
      redirect_uri: page.searchParams.get('redirect_uri'), challenge: page.searchParams.get('challenge'),
      display_name: 'Tab Mac', scope: page.searchParams.get('scope') }, user.cookie);
    return (await issued.json() as { code: string }).code;
  }));
  const callbacks = pages.map((page, index) => {
    const callback = new URL(page.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', codes[1 - index]);
    callback.searchParams.set('state', pages[1 - index].searchParams.get('state')!);
    return callback;
  });
  assert.deepEqual((await Promise.all(callbacks.map(callback => fetch(callback)))).map(response => response.status), [400, 400]);
  assert((await settled).every(result => result.status === 'rejected'));
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines')).rows[0].n, 0);
});

test('mixed browser tabs cannot redeem a different tab code with their own state', async () => {
  const user = await browser();
  const pages: URL[] = [];
  const stores = [randomUUID(), randomUUID()].map(installationId =>
    ({ read: () => null, installationId: () => installationId, write: () => {} }));
  const settled = Promise.allSettled(stores.map(store =>
    enrollMachine(origin, store, url => { pages.push(new URL(url)); }, fetch, true)));
  while (pages.length < 2) await new Promise(resolve => setTimeout(resolve, 1));
  const codes = await Promise.all(pages.map(async page => {
    const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
      redirect_uri: page.searchParams.get('redirect_uri'), challenge: page.searchParams.get('challenge'),
      display_name: 'Tab Code', scope: page.searchParams.get('scope') }, user.cookie);
    assert.equal(issued.status, 201);
    return (await issued.json() as { code: string }).code;
  }));
  const callbacks = pages.map((page, index) => {
    const callback = new URL(page.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', codes[1 - index]);
    callback.searchParams.set('state', page.searchParams.get('state')!);
    return callback;
  });
  assert.deepEqual((await Promise.all(callbacks.map(callback => fetch(callback)))).map(response => response.status), [200, 200]);
  assert((await settled).every(result => result.status === 'rejected'));
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machines')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_enrollment_codes WHERE consumed_at IS NOT NULL')).rows[0].n, 0);
});

test('enrolled machine cannot claim another source or machine in ingestion', async () => {
  const user = await browser();
  await bootstrapSynthetic(db, 'test');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'http://127.0.0.1:12345/callback';
  const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
    redirect_uri: redirect, challenge, display_name: 'Scoped Mac', scope: 'telemetry:write machine:self' }, user.cookie);
  const { code } = await issued.json() as { code: string };
  const exchange = await post('/v1/machines/enrollment-exchanges', { code, verifier, redirect_uri: redirect,
    installation_id: randomUUID() }, '', false);
  assert.equal(exchange.status, 200);
  const machine = await exchange.json() as { machine_id: string; user_id: string; access_token: string };
  const self = await fetch(`${origin}/v1/machines/self`, { headers: { authorization: `Bearer ${machine.access_token}` } });
  assert.equal(self.status, 200);
  assert.equal((await self.json()).machine_id, machine.machine_id);
  assert.equal((await fetch(`${origin}/v1/live?workspace_id=${user.workspace}`, { headers: { authorization: `Bearer ${machine.access_token}` } })).status, 401);
  assert.equal((await fetch(`${origin}/v1/machines/self`, { headers: { cookie: user.cookie } })).status, 401);
  const source = randomUUID();
  await db.query('INSERT INTO workspace_policies VALUES ($1,$2,true)', [user.workspace, synthetic.policy]);
  await db.query('INSERT INTO collection_consents VALUES ($1,$2,true)', [machine.machine_id, synthetic.policy]);
  await db.query("INSERT INTO machine_configuration VALUES ($1,$2,'active')", [machine.machine_id, synthetic.policy]);
  await db.query("INSERT INTO sources VALUES ($1,$2,$3,$4,'abisso','synthetic_m0',true)",
    [source, machine.machine_id, user.workspace, machine.user_id]);
  const batch = capabilityBatch();
  const send = () => fetch(`${origin}/v1/telemetry/batches`, { method: 'POST',
    headers: { authorization: `Bearer ${machine.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  let response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].reason_code, 'unauthorized_source');
  batch.request_id = v7();
  batch.events[0].source.source_id = source;
  batch.events[0].workspace_id = user.workspace;
  batch.events[0].user_id = machine.user_id;
  batch.events[0].machine_id = synthetic.machine;
  response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].reason_code, 'identity_mismatch');
});

test('collector rejects an exchange redirect before forwarding code or verifier', async () => {
  const user = await browser();
  const attacker = createServer((_request, response) => response.end('reached'));
  attacker.listen(0, '127.0.0.1');
  await once(attacker, 'listening');
  const address = attacker.address();
  assert(address && typeof address !== 'string');
  let attackerHits = 0;
  attacker.on('request', () => { attackerHits++; });
  const redirector = createServer((_request, response) => {
    response.writeHead(307, { location: `http://127.0.0.1:${address.port}/stolen` }).end();
  });
  redirector.listen(0, '127.0.0.1');
  await once(redirector, 'listening');
  const redirectAddress = redirector.address();
  assert(redirectAddress && typeof redirectAddress !== 'string');
  let saved = false;
  let handoff!: Promise<void>;
  try {
    await assert.rejects(enrollMachine(origin, { read: () => null, installationId: () => randomUUID(), write: () => { saved = true; } }, url => {
      handoff = (async () => {
        const page = new URL(url);
        const issued = await post('/v1/machines/enrollment-codes', { csrf: user.csrf, workspace_id: user.workspace,
          redirect_uri: page.searchParams.get('redirect_uri'), challenge: page.searchParams.get('challenge'),
          display_name: 'Redirect Mac', scope: page.searchParams.get('scope') }, user.cookie);
        const { code } = await issued.json() as { code: string };
        const callback = new URL(page.searchParams.get('redirect_uri')!);
        callback.searchParams.set('code', code);
        callback.searchParams.set('state', page.searchParams.get('state')!);
        await fetch(callback);
      })();
    }, ((url, init) => fetch(new URL('/exchange', `http://127.0.0.1:${redirectAddress.port}`), init)) as typeof fetch, true));
    await handoff;
    assert.equal(attackerHits, 0);
    assert.equal(saved, false);
  } finally { redirector.close(); attacker.close(); }
});
