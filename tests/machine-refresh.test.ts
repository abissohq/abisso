import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApi } from '../apps/backend/api.ts';
import { migrate } from '../packages/database/database.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const hashKey = 'test-refresh-hash-key-at-least-thirty-two-bytes';
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let origin: string;
let now: Date;

beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(db);
  now = new Date();
  server = createApi(db, { environment: 'test', refreshHashKey: hashKey, now: () => now });
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

async function enrolledMachine() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const machineId = randomUUID();
  const installationId = randomUUID();
  const refreshToken = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO workspaces VALUES ($1,true)', [workspaceId]);
  await db.query('INSERT INTO users VALUES ($1,true)', [userId]);
  await db.query("INSERT INTO memberships VALUES ($1,$2,true,'owner')", [userId, workspaceId]);
  await db.query('INSERT INTO machines (id,workspace_id,user_id,active,installation_id,display_name) VALUES ($1,$2,$3,true,$4,$5)',
    [machineId, workspaceId, userId, installationId, 'Refresh test']);
  await db.query("INSERT INTO machine_refresh_credentials (digest,machine_id,expires_at,family_id,generation) VALUES ($1,$2,clock_timestamp() + interval '90 days',$2,0)",
    [createHmac('sha256', hashKey).update(refreshToken).digest('hex'), machineId]);
  return { installationId, machineId, refreshToken };
}

function refresh(refreshToken: string, body: object) {
  return fetch(`${origin}/v1/machines/refresh`, { method: 'POST', headers: {
    authorization: `Bearer ${refreshToken}`, 'content-type': 'application/json',
  }, body: JSON.stringify(body) });
}

async function assertRefreshFamilyRevoked(machineId: string) {
  const refreshCredentials = await db.query('SELECT revoked FROM machine_refresh_credentials WHERE machine_id=$1', [machineId]);
  assert(refreshCredentials.rows.length > 0);
  assert(refreshCredentials.rows.every(row => row.revoked));
  assert((await db.query('SELECT revoked FROM machine_credentials WHERE machine_id=$1', [machineId]))
    .rows.every(row => row.revoked));
}

test('an exact retry after a lost response returns the same refresh successor', async () => {
  const machine = await enrolledMachine();
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, request);
  const retry = await refresh(machine.refreshToken, request);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  const firstBody = await first.json() as { refresh_token: string; access_token: string; expires_in: number; generation: number };
  const retryBody = await retry.json() as typeof firstBody;
  assert.match(firstBody.refresh_token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(firstBody.refresh_token, 'base64url').length, 32);
  assert.equal(retryBody.refresh_token, firstBody.refresh_token);
  assert.notEqual(retryBody.access_token, firstBody.access_token);
  assert.equal(firstBody.expires_in, 900);
  assert.equal(firstBody.generation, 1);
  const next = await refresh(firstBody.refresh_token, {
    installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
  });
  assert.equal(next.status, 200);
  assert.equal((await next.json() as { generation: number }).generation, 2);
});

test('a competing predecessor request revokes the refresh family and issued access', async () => {
  const machine = await enrolledMachine();
  const firstRequest = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, firstRequest);
  assert.equal(first.status, 200);
  const issued = await first.json() as { refresh_token: string };
  const competing = await refresh(machine.refreshToken, { ...firstRequest, request_id: randomUUID() });
  assert.equal(competing.status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
  assert.equal((await refresh(issued.refresh_token, {
    installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
  })).status, 401);
});

test('concurrent competing refreshes allow one rotation and then revoke the family', async () => {
  const machine = await enrolledMachine();
  const requests = [randomUUID(), randomUUID()].map(requestId => refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: requestId,
  }));
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
  await assertRefreshFamilyRevoked(machine.machineId);
});

test('changed installation or generation on predecessor reuse revokes each family', async () => {
  for (const changed of ['installation', 'generation'] as const) {
    const machine = await enrolledMachine();
    const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
    assert.equal((await refresh(machine.refreshToken, request)).status, 200);
    const competing = changed === 'installation'
      ? { ...request, installation_id: randomUUID() }
      : { ...request, generation: 1 };
    assert.equal((await refresh(machine.refreshToken, competing)).status, 401);
    await assertRefreshFamilyRevoked(machine.machineId);
  }
});

test('malformed reuse of a consumed predecessor revokes the family', async () => {
  const machine = await enrolledMachine();
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  assert.equal((await refresh(machine.refreshToken, request)).status, 200);
  assert.equal((await refresh(machine.refreshToken, { ...request, request_id: 'not-a-request-id' })).status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
  const audit = (await db.query("SELECT audit_id,presented_request_id FROM machine_credential_audit WHERE action='machine.refresh_family_revoked'"))
    .rows.at(-1);
  assert.match(audit.audit_id, /^[0-9a-f-]{36}$/);
  assert.equal(audit.presented_request_id, null);
});

test('the exact retry is accepted at 30 seconds and late reuse revokes the family', async () => {
  const machine = await enrolledMachine();
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, request);
  assert.equal(first.status, 200);
  const firstBody = await first.json() as { refresh_token: string };
  now = new Date(now.getTime() + 30_000);
  const boundary = await refresh(machine.refreshToken, request);
  assert.equal(boundary.status, 200);
  assert.equal((await boundary.json() as { refresh_token: string }).refresh_token, firstBody.refresh_token);
  now = new Date(now.getTime() + 1);
  assert.equal((await refresh(machine.refreshToken, request)).status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
});

test('a successful rotation keeps its retry window after the predecessor expiry', async () => {
  const machine = await enrolledMachine();
  await db.query('UPDATE machine_refresh_credentials SET expires_at=$2 WHERE machine_id=$1',
    [machine.machineId, new Date(now.getTime() + 1_000)]);
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, request);
  assert.equal(first.status, 200);
  const issued = await first.json() as { refresh_token: string };
  now = new Date(now.getTime() + 2_000);
  const retry = await refresh(machine.refreshToken, request);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json() as { refresh_token: string }).refresh_token, issued.refresh_token);
});

test('expired retry metadata is removed while a keyed reuse marker still revokes late reuse', async () => {
  const machine = await enrolledMachine();
  const first = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
  });
  const successor = (await first.json() as { refresh_token: string }).refresh_token;
  now = new Date(now.getTime() + 30_001);
  assert.equal((await refresh(successor, {
    installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
  })).status, 200);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_refresh_credentials WHERE machine_id=$1 AND generation=0',
    [machine.machineId])).rows[0].n, 0);
  assert.equal((await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
  })).status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
});

test('expired and revoked refresh credentials fail closed', async () => {
  const expired = await enrolledMachine();
  await db.query('UPDATE machine_refresh_credentials SET expires_at=$2 WHERE machine_id=$1', [expired.machineId, now]);
  assert.equal((await refresh(expired.refreshToken, {
    installation_id: expired.installationId, generation: 0, request_id: randomUUID(),
  })).status, 401);
  await assertRefreshFamilyRevoked(expired.machineId);

  const revoked = await enrolledMachine();
  await db.query('UPDATE machine_refresh_credentials SET revoked=true WHERE machine_id=$1', [revoked.machineId]);
  assert.equal((await refresh(revoked.refreshToken, {
    installation_id: revoked.installationId, generation: 0, request_id: randomUUID(),
  })).status, 401);
});

test('a revoked refresh credential invalidates access tokens for its family', async () => {
  const machine = await enrolledMachine();
  const first = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
  });
  const issued = await first.json() as { access_token: string; refresh_token: string };
  await db.query('UPDATE machine_refresh_credentials SET revoked=true WHERE digest=$1',
    [createHmac('sha256', hashKey).update(issued.refresh_token).digest('hex')]);
  assert.equal((await refresh(issued.refresh_token, {
    installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
  })).status, 401);
  assert.equal((await fetch(`${origin}/v1/machines/self`, {
    headers: { authorization: `Bearer ${issued.access_token}` },
  })).status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
});

test('rotated access is limited to machine self-service and rejects expiry or revocation', async () => {
  const machine = await enrolledMachine();
  const response = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
  });
  const issued = await response.json() as { access_token: string; refresh_token: string; scope: string };
  assert.equal(issued.scope, 'telemetry:write machine:self');
  assert.equal((await fetch(`${origin}/v1/machines/self`, {
    headers: { authorization: `Bearer ${issued.access_token}` },
  })).status, 200);
  assert.equal((await fetch(`${origin}/v1/live`, {
    headers: { authorization: `Bearer ${issued.access_token}` },
  })).status, 401);
  assert.equal((await fetch(`${origin}/v1/machines/self`, {
    headers: { authorization: `Bearer ${issued.refresh_token}` },
  })).status, 401);
  await db.query('UPDATE machine_credentials SET expires_at=clock_timestamp() - interval \'1 second\' WHERE machine_id=$1',
    [machine.machineId]);
  assert.equal((await fetch(`${origin}/v1/machines/self`, {
    headers: { authorization: `Bearer ${issued.access_token}` },
  })).status, 401);
  await db.query('UPDATE machine_credentials SET expires_at=clock_timestamp() + interval \'1 minute\', revoked=true WHERE machine_id=$1',
    [machine.machineId]);
  assert.equal((await fetch(`${origin}/v1/machines/self`, {
    headers: { authorization: `Bearer ${issued.access_token}` },
  })).status, 401);
});

test('refresh persistence contains keyed hashes and non-secret retry metadata only', async () => {
  const machine = await enrolledMachine();
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const response = await refresh(machine.refreshToken, request);
  const issued = await response.json() as { access_token: string; refresh_token: string };
  const rows = (await db.query('SELECT * FROM machine_refresh_credentials WHERE machine_id=$1 ORDER BY generation',
    [machine.machineId])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].digest, createHmac('sha256', hashKey).update(machine.refreshToken).digest('hex'));
  assert.equal(rows[1].digest, createHmac('sha256', hashKey).update(issued.refresh_token).digest('hex'));
  assert.equal(rows[0].retry_installation_id, machine.installationId);
  assert.equal(rows[0].retry_request_id, request.request_id);
  assert.match(rows[0].retry_request_digest, /^[0-9a-f]{64}$/);
  const reuseMarkers = (await db.query('SELECT * FROM machine_refresh_reuse_markers')).rows;
  assert.equal(reuseMarkers.length, 1);
  assert.equal(reuseMarkers[0].marker, createHmac('sha256', hashKey)
    .update('abisso.machine-refresh.reuse-marker.v1\0').update(machine.refreshToken).digest('hex'));
  const persisted = JSON.stringify({ refresh: rows, reuseMarkers,
    audit: (await db.query('SELECT * FROM machine_credential_audit')).rows });
  for (const secret of [machine.refreshToken, issued.refresh_token, issued.access_token]) assert(!persisted.includes(secret));
});
