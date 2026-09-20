import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApi } from '../apps/backend/api.ts';
import { migrate } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';
import { RequestFailure } from '../packages/contracts/capability.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let origin: string;

async function start(environment = 'test') {
  server = createApi(db, { environment, secureCookies: true, browserIdentity: async token => {
    if (!token.startsWith('verified:')) throw new RequestFailure(401, 'invalid_identity');
    return { subject: token.slice('verified:'.length) };
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(db);
  await start();
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
});
after(() => admin.end());

function cookies(response: Response) {
  const values = response.headers.getSetCookie();
  assert.equal(values.length, 2);
  return values.map(value => value.split(';')[0]).join('; ');
}
async function begin() {
  const response = await fetch(`${origin}/v1/browser/session`);
  assert.equal(response.status, 200);
  const state = await response.json() as { authenticated: boolean; workspace_id: string | null; csrf: string };
  assert.equal(state.authenticated, false);
  assert.equal(state.workspace_id, null);
  const cookie = cookies(response);
  assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Max-Age=900; Secure/);
  return { state, cookie };
}
function post(path: string, body: unknown, cookie?: string, requestOrigin = origin) {
  return fetch(`${origin}${path}`, { method: 'POST', headers: { origin: requestOrigin, cookie: cookie ?? '', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function login(subject: string) {
  const initial = await begin();
  const response = await post('/v1/browser/login', { csrf: initial.state.csrf, token: `verified:${subject}` }, initial.cookie);
  assert.equal(response.status, 200);
  const state = await response.json() as { authenticated: boolean; workspace_id: string | null; csrf: string };
  return { state, cookie: cookies(response), initial };
}

test('first Clerk login creates only a user; explicit owner creation and repeat login reuse identity', async () => {
  const first = await login('user_first');
  assert.equal(first.state.workspace_id, null);
  assert.equal((await db.query('SELECT id FROM workspaces')).rowCount, 0);
  assert.equal((await db.query('SELECT id FROM users')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM browser_identities')).rowCount, 1);
  assert.equal((await post('/v1/workspaces', { csrf: first.state.csrf }, first.cookie, 'https://evil.invalid')).status, 403);
  assert.equal((await post('/v1/workspaces', { csrf: 'wrong' }, first.cookie)).status, 403);
  const created = await post('/v1/workspaces', { csrf: first.state.csrf }, first.cookie);
  assert.equal(created.status, 201);
  const { workspace_id: workspace } = await created.json() as { workspace_id: string };
  assert.equal((await db.query('SELECT role FROM memberships WHERE workspace_id=$1', [workspace])).rows[0].role, 'owner');
  assert.equal((await post('/v1/workspaces', { csrf: first.state.csrf }, first.cookie)).status, 409);
  const repeat = await login('user_first');
  assert.equal(repeat.state.workspace_id, workspace);
  assert.equal((await db.query('SELECT id FROM users')).rowCount, 1);
  assert.equal((await db.query('SELECT id FROM workspaces')).rowCount, 1);
  assert.equal((await fetch(`${origin}/v1/live?workspace_id=${workspace}`, { headers: { cookie: repeat.cookie } })).status, 200);
});

test('provider subject is unique, cannot cross into another workspace, and an active membership blocks a second', async () => {
  const a = await login('user_a');
  const b = await login('user_b');
  const workspaceA = (await (await post('/v1/workspaces', { csrf: a.state.csrf }, a.cookie)).json()).workspace_id;
  const workspaceB = (await (await post('/v1/workspaces', { csrf: b.state.csrf }, b.cookie)).json()).workspace_id;
  assert.notEqual(workspaceA, workspaceB);
  assert.equal((await fetch(`${origin}/v1/live?workspace_id=${workspaceB}`, { headers: { cookie: a.cookie } })).status, 403);
  assert.equal((await post('/v1/workspaces', { csrf: a.state.csrf }, a.cookie)).status, 409);
  await assert.rejects(db.query('INSERT INTO browser_identities (user_id,provider,subject) VALUES ($1,$2,$3)',
    [(await db.query("SELECT user_id FROM browser_identities WHERE subject='user_b'")).rows[0].user_id, 'clerk', 'user_a']));
  assert.equal((await db.query('SELECT * FROM browser_identities')).rowCount, 2);
});

test('concurrent first logins for one Clerk subject converge on one internal user', async () => {
  const [a, b] = await Promise.all([begin(), begin()]);
  const responses = await Promise.all([a, b].map(value => post('/v1/browser/login',
    { csrf: value.state.csrf, token: 'verified:user_concurrent' }, value.cookie)));
  assert.deepEqual(responses.map(value => value.status), [200, 200]);
  assert.equal((await db.query('SELECT * FROM users')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM browser_identities')).rowCount, 1);
});

test('Clerk account switch rotates Abisso identity and sign-out invalidates it', async () => {
  const a = await login('user_switcha');
  const workspaceA = (await (await post('/v1/workspaces', { csrf: a.state.csrf }, a.cookie)).json()).workspace_id;
  const switched = await post('/v1/browser/login', { csrf: a.state.csrf, token: 'verified:user_switchb' }, a.cookie);
  assert.equal(switched.status, 200);
  const b = { state: await switched.json() as { csrf: string; workspace_id: string | null }, cookie: cookies(switched) };
  assert.equal(b.state.workspace_id, null);
  assert.equal((await fetch(`${origin}/v1/live`, { headers: { cookie: a.cookie } })).status, 401);
  assert.equal((await fetch(`${origin}/v1/live?workspace_id=${workspaceA}`, { headers: { cookie: b.cookie } })).status, 403);
  const signedOut = await post('/v1/browser/logout', { csrf: b.state.csrf }, b.cookie);
  assert.equal(signedOut.status, 200);
  assert.equal((await signedOut.json()).authenticated, false);
  assert.equal((await fetch(`${origin}/v1/live`, { headers: { cookie: b.cookie } })).status, 401);
  assert.equal((await post('/v1/workspaces', { csrf: b.state.csrf }, b.cookie)).status, 403);
});

test('CSRF, provider token, and synthetic login environment gates fail closed', async () => {
  const initial = await begin();
  assert.equal((await post('/v1/browser/login', { csrf: 'wrong', token: 'verified:user_a' }, initial.cookie)).status, 403);
  assert.equal((await post('/v1/browser/login', { csrf: initial.state.csrf, token: 'verified:user_a' }, initial.cookie.split(';')[0])).status, 403);
  assert.equal((await post('/v1/browser/login', { csrf: initial.state.csrf, token: 'verified:user_a' }, initial.cookie, 'https://evil.invalid')).status, 403);
  assert.equal((await post('/v1/browser/login', { csrf: initial.state.csrf, token: 'forged' }, initial.cookie)).status, 401);
  assert.equal((await db.query('SELECT * FROM browser_identities')).rowCount, 0);
  await new Promise<void>(resolve => server.close(() => resolve()));
  await start('production');
  assert.equal((await fetch(`${origin}/dev/login`)).status, 404);
  assert.equal((await post('/dev/login/code', { csrf: initial.state.csrf }, initial.cookie)).status, 404);
  assert.doesNotMatch(await (await fetch(origin)).text(), /Local synthetic sign in/);
});

test('browser cookie and Clerk token do not authorize machine ingestion', async () => {
  const browser = await login('user_browser');
  const machine = await bootstrapSynthetic(db, 'test');
  const body = '{}';
  for (const headers of [
    { cookie: browser.cookie, 'content-type': 'application/json' },
    { authorization: 'Bearer verified:user_browser', 'content-type': 'application/json' },
    { cookie: browser.cookie, authorization: 'Bearer verified:user_browser', 'content-type': 'application/json' },
  ] as Record<string, string>[]) {
    const response = await fetch(`${origin}/v1/telemetry/batches`, { method: 'POST', headers, body });
    assert.equal(response.status, 401);
  }
  assert.equal((await fetch(`${origin}/v1/live`, { headers: { authorization: `Bearer ${machine.token}` } })).status, 401);
  assert.equal((await db.query('SELECT * FROM telemetry_batch_requests')).rowCount, 0);
});
