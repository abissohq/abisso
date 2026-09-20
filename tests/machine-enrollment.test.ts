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
  const store: EnrollmentStore = { read: () => stored, write: (value: EnrollmentSecret) => { stored = value; } };
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
  const audit = (await db.query('SELECT actor_id, workspace_id, target_machine_id FROM machine_audit')).rows[0];
  assert.equal(audit.workspace_id, user.workspace);
  assert.equal(audit.target_machine_id, result.machine_id);
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
  const store = { read: () => null, write: () => { throw new Error('unexpected'); } };
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
    await assert.rejects(enrollMachine(origin, { read: () => null, write: () => {} }, () => { opened = true; },
      fetch, true, address.port));
    assert.equal(opened, false);
    assert.equal((await db.query('SELECT * FROM machine_enrollment_codes')).rowCount, 0);
  } finally { blocker.close(); }
});

test('Keychain adapter rejects existing item and passes secret through operation input', () => {
  const calls: { operation: string; value?: string }[] = [];
  let content = 'absent';
  const store = createKeychainStore(input => { calls.push(input); if (input.operation === 'read') return content;
    content = input.value!; return 'stored'; });
  const secret = { installation_id: randomUUID(), machine_id: randomUUID(), workspace_id: randomUUID(), user_id: randomUUID(),
    refresh_token: randomBytes(32).toString('base64url'), scope: 'telemetry:write machine:self' };
  store.write(secret);
  assert.deepEqual(store.read(), secret);
  assert.throws(() => store.write(secret), /already_enrolled/);
  assert.equal(calls.filter(call => call.operation === 'write').length, 1);
  assert.equal(calls[1].value, JSON.stringify(secret));
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
    await assert.rejects(enrollMachine(origin, { read: () => null, write: () => { saved = true; } }, url => {
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
