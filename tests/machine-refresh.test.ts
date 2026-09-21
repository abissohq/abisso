import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApi } from '../apps/backend/api.ts';
import { migrate } from '../packages/database/database.ts';
import { purgeExpiredMachineRefreshRetries, rotateMachineCredential } from '../packages/ingestion/machine-refresh.ts';

const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const hashKey = 'test-refresh-hash-key-at-least-thirty-two-bytes';
let db: pg.Pool;
let schema: string;
let server: ReturnType<typeof createApi>;
let origin: string;
let now: Date;
let diagnosticLines: string[];
let gatedClockInstalled: boolean;

beforeEach(async () => {
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`,
    application_name: schema });
  await migrate(db);
  now = new Date();
  gatedClockInstalled = false;
  await db.query('CREATE TABLE machine_credential_test_clock (value timestamptz NOT NULL)');
  await db.query('INSERT INTO machine_credential_test_clock VALUES ($1)', [now]);
  await db.query(`CREATE OR REPLACE FUNCTION machine_credential_clock() RETURNS timestamptz LANGUAGE sql STABLE AS $$
    SELECT value FROM machine_credential_test_clock
  $$`);
  diagnosticLines = [];
  server = createApi(db, { environment: 'test', refreshHashKey: hashKey,
    diagnosticLog: line => diagnosticLines.push(line) });
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

async function setDatabaseNow(value: Date) {
  now = value;
  await db.query('UPDATE machine_credential_test_clock SET value=$1', [value]);
}

let nextClockGateKey = 4_823_000;

async function clockGate() {
  const key = nextClockGateKey++;
  if (!gatedClockInstalled) {
    await db.query('ALTER TABLE machine_credential_test_clock ADD COLUMN gate_key bigint');
    await db.query(`CREATE OR REPLACE FUNCTION machine_credential_clock() RETURNS timestamptz LANGUAGE plpgsql VOLATILE AS $$
      DECLARE result timestamptz; gate bigint;
      BEGIN
        SELECT value,gate_key INTO result,gate FROM machine_credential_test_clock;
        IF gate IS NOT NULL THEN PERFORM pg_advisory_xact_lock(gate); END IF;
        RETURN result;
      END
    $$`);
    gatedClockInstalled = true;
  }
  const client = await db.connect();
  await client.query('SELECT pg_advisory_lock($1)', [key]);
  await db.query('UPDATE machine_credential_test_clock SET gate_key=$1', [key]);
  let held = true;
  return {
    async release() {
      if (!held) return;
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
      held = false;
    },
    async close() {
      if (held) await client.query('SELECT pg_advisory_unlock($1)', [key]);
      client.release();
    },
  };
}

async function waitForRefreshLock(predicate: (query: string) => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const activity = await db.query(`SELECT query FROM pg_stat_activity
      WHERE application_name=$1 AND wait_event_type='Lock'`, [schema]);
    if (activity.rows.some(row => predicate(row.query))) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('refresh_lock_wait_not_observed');
}

function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>(accept => { resolve = accept; }), resolve };
}

function pausePoolAfterQuery(match: (query: string) => boolean, reached: ReturnType<typeof deferred>,
  resume: ReturnType<typeof deferred>) {
  return {
    async connect() {
      const client = await db.connect();
      let paused = false;
      return new Proxy(client, {
        get(target, property) {
          if (property !== 'query') {
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return async (...args: unknown[]) => {
            const result = await (target.query as Function).apply(target, args);
            if (!paused && match(String(args[0]))) {
              paused = true;
              reached.resolve();
              await resume.promise;
            }
            return result;
          };
        },
      });
    },
  } as unknown as pg.Pool;
}

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
  return { installationId, machineId, refreshToken, userId };
}

function rawRefresh(refreshToken: string, body: string | Uint8Array<ArrayBuffer>) {
  return fetch(`${origin}/v1/machines/refresh`, { method: 'POST', headers: {
    authorization: `Bearer ${refreshToken}`, 'content-type': 'application/json',
  }, body });
}

function refresh(refreshToken: string, body: object) {
  return rawRefresh(refreshToken, JSON.stringify(body));
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

test('only byte-identical predecessor requests receive retry treatment', async () => {
  const variants = [
    { name: 'key order', retry: (installationId: string, requestId: string) =>
      `{"request_id":"${requestId}","generation":0,"installation_id":"${installationId}"}` },
    { name: 'whitespace', retry: (installationId: string, requestId: string) =>
      ` \n { "installation_id" : "${installationId}" , "generation" : 0 , "request_id" : "${requestId}" } \t` },
    { name: 'decimal zero', retry: (installationId: string, requestId: string) =>
      `{"installation_id":"${installationId}","generation":0.0,"request_id":"${requestId}"}` },
    { name: 'exponent zero', retry: (installationId: string, requestId: string) =>
      `{"installation_id":"${installationId}","generation":0e0,"request_id":"${requestId}"}` },
    { name: 'escaped UUID hyphen', retry: (installationId: string, requestId: string) =>
      `{"installation_id":"${installationId.replaceAll('-', '\\u002d')}","generation":0,"request_id":"${requestId}"}` },
  ];
  for (const variant of variants) {
    const machine = await enrolledMachine();
    const requestId = randomUUID();
    const firstBody = `{"installation_id":"${machine.installationId}","generation":0,"request_id":"${requestId}"}`;
    assert.equal((await rawRefresh(machine.refreshToken, firstBody)).status, 200, variant.name);
    assert.equal((await rawRefresh(machine.refreshToken, variant.retry(machine.installationId, requestId))).status, 401,
      variant.name);
    await assertRefreshFamilyRevoked(machine.machineId);
  }
});

test('legal noncanonical JSON spelling is valid when replayed byte-for-byte', async () => {
  const machine = await enrolledMachine();
  const requestId = randomUUID();
  const body = ` \n { "request_id" : "${requestId}" , "generation" : 0.0 , "installation_id" : "${machine.installationId.replaceAll('-', '\\u002d')}" } \t`;
  const first = await rawRefresh(machine.refreshToken, body);
  const retry = await rawRefresh(machine.refreshToken, body);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json() as { refresh_token: string }).refresh_token,
    (await first.json() as { refresh_token: string }).refresh_token);
});

test('uppercase UUID identity preserves byte-exact retry semantics', async () => {
  const uppercaseRequest = await enrolledMachine();
  const uppercaseRequestId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const uppercaseRequestBody = JSON.stringify({ installation_id: uppercaseRequest.installationId,
    generation: 0, request_id: uppercaseRequestId });
  const firstRequest = await rawRefresh(uppercaseRequest.refreshToken, uppercaseRequestBody);
  const retryRequest = await rawRefresh(uppercaseRequest.refreshToken, uppercaseRequestBody);
  assert.equal(firstRequest.status, 200);
  assert.equal(retryRequest.status, 200);
  assert.equal((await retryRequest.json() as { refresh_token: string }).refresh_token,
    (await firstRequest.json() as { refresh_token: string }).refresh_token);
  const canonicalRequestId = uppercaseRequestId.toLowerCase();
  const requestMetadata = (await db.query(`SELECT retry_installation_id,retry_request_id
    FROM machine_refresh_credentials WHERE machine_id=$1 AND generation=0`, [uppercaseRequest.machineId])).rows[0];
  assert.deepEqual(requestMetadata, {
    retry_installation_id: uppercaseRequest.installationId,
    retry_request_id: canonicalRequestId,
  });
  assert.equal((await db.query(`SELECT client_rotation_request_id FROM machine_credential_audit
    WHERE actor_id=$1 AND action='machine.refresh_rotated'`, [uppercaseRequest.machineId])).rows[0].client_rotation_request_id,
  canonicalRequestId);

  const uppercaseInstallation = await enrolledMachine();
  const uppercaseInstallationBody = JSON.stringify({ installation_id: uppercaseInstallation.installationId.toUpperCase(),
    generation: 0, request_id: randomUUID() });
  const firstInstallation = await rawRefresh(uppercaseInstallation.refreshToken, uppercaseInstallationBody);
  const retryInstallation = await rawRefresh(uppercaseInstallation.refreshToken, uppercaseInstallationBody);
  assert.equal(firstInstallation.status, 200);
  assert.equal(retryInstallation.status, 200);
  assert.equal((await retryInstallation.json() as { refresh_token: string }).refresh_token,
    (await firstInstallation.json() as { refresh_token: string }).refresh_token);

  const changedCase = await enrolledMachine();
  const original = JSON.stringify({ installation_id: changedCase.installationId,
    generation: 0, request_id: uppercaseRequestId });
  const changed = JSON.stringify({ installation_id: changedCase.installationId,
    generation: 0, request_id: canonicalRequestId });
  assert.equal((await rawRefresh(changedCase.refreshToken, original)).status, 200);
  assert.equal((await rawRefresh(changedCase.refreshToken, changed)).status, 401);
  await assertRefreshFamilyRevoked(changedCase.machineId);
});

test('refresh body preserves the 2,048-byte transport boundary', async () => {
  const accepted = await enrolledMachine();
  const acceptedJson = JSON.stringify({ installation_id: accepted.installationId, generation: 0, request_id: randomUUID() });
  const acceptedBody = acceptedJson + ' '.repeat(2048 - Buffer.byteLength(acceptedJson));
  assert.equal(Buffer.byteLength(acceptedBody), 2048);
  assert.equal((await rawRefresh(accepted.refreshToken, acceptedBody)).status, 200);

  const rejected = await enrolledMachine();
  const rejectedJson = JSON.stringify({ installation_id: rejected.installationId, generation: 0, request_id: randomUUID() });
  const rejectedBody = rejectedJson + ' '.repeat(2049 - Buffer.byteLength(rejectedJson));
  assert.equal((await rawRefresh(rejected.refreshToken, rejectedBody)).status, 413);
  const row = (await db.query('SELECT revoked,consumed_at FROM machine_refresh_credentials WHERE machine_id=$1',
    [rejected.machineId])).rows[0];
  assert.deepEqual(row, { revoked: false, consumed_at: null });
});

test('duplicate JSON keys on first refresh use fail without changing authority', async () => {
  const machine = await enrolledMachine();
  const requestId = randomUUID();
  const duplicateBody = `{"installation_id":"${machine.installationId}","generation":7,"generation":0,"request_id":"${requestId}"}`;
  const response = await rawRefresh(machine.refreshToken, duplicateBody);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_refresh' });
  const refreshRows = (await db.query(`SELECT generation,revoked,consumed_at FROM machine_refresh_credentials
    WHERE machine_id=$1`, [machine.machineId])).rows;
  assert.deepEqual(refreshRows, [{ generation: 0, revoked: false, consumed_at: null }]);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_credentials WHERE machine_id=$1',
    [machine.machineId])).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM machine_credential_audit WHERE actor_id=$1',
    [machine.machineId])).rows[0].n, 0);
});

test('refresh parsing does not inherit telemetry string-limit semantics', async () => {
  const machine = await enrolledMachine();
  const body = JSON.stringify({ installation_id: machine.installationId, generation: 0,
    request_id: randomUUID(), extra: 'x'.repeat(129) });
  const response = await rawRefresh(machine.refreshToken, body);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_refresh' });
  const row = (await db.query('SELECT revoked,consumed_at FROM machine_refresh_credentials WHERE machine_id=$1',
    [machine.machineId])).rows[0];
  assert.deepEqual(row, { revoked: false, consumed_at: null });
});

test('successful rotation records the complete safe machine audit contract', async () => {
  const machine = await enrolledMachine();
  const requestId = randomUUID();
  const response = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: requestId,
  });
  assert.equal(response.status, 200);
  const audit = (await db.query('SELECT * FROM machine_credential_audit')).rows[0];
  assert.equal(audit.actor_type, 'machine');
  assert.equal(audit.actor_id, machine.machineId);
  assert.equal(audit.target_type, 'machine');
  assert.equal(audit.target_id, machine.machineId);
  assert.equal(audit.action, 'machine.refresh_rotated');
  assert.equal(audit.result, 'success');
  assert.equal(audit.reason, 'authorized_refresh');
  assert.equal(audit.server_request_id, response.headers.get('x-correlation-id'));
  assert.equal(audit.client_rotation_request_id, requestId);
  assert.notEqual(String(audit.id), audit.server_request_id);
  assert.equal(audit.before_generation, 0);
  assert.equal(audit.after_generation, 1);
  assert.equal(audit.before_family_revoked, false);
  assert.equal(audit.after_family_revoked, false);
  assert(audit.recorded_at instanceof Date);
  assert.equal(audit.recorded_at.getTime(), now.getTime());
  const boundaries = (await db.query(`SELECT
    EXTRACT(EPOCH FROM (p.retry_expires_at-p.consumed_at))::integer AS retry_seconds,
    EXTRACT(EPOCH FROM (r.expires_at-$2::timestamptz))::integer AS refresh_seconds,
    EXTRACT(EPOCH FROM (a.expires_at-$2::timestamptz))::integer AS access_seconds
    FROM machine_refresh_credentials p
    JOIN machine_refresh_credentials r ON r.machine_id=p.machine_id AND r.generation=1
    JOIN machine_credentials a ON a.machine_id=p.machine_id
    WHERE p.machine_id=$1 AND p.generation=0`, [machine.machineId, audit.recorded_at])).rows[0];
  assert.deepEqual(boundaries, { retry_seconds: 30, refresh_seconds: 7_776_000, access_seconds: 900 });
  await assert.rejects(db.query("UPDATE machine_credential_audit SET result='rejected'"));
  await assert.rejects(db.query('DELETE FROM machine_credential_audit'));
});

test('competing reuse records a rejected family-revocation audit', async () => {
  const machine = await enrolledMachine();
  const firstRequestId = randomUUID();
  assert.equal((await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: firstRequestId,
  })).status, 200);
  const competingRequestId = randomUUID();
  const competing = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: competingRequestId,
  });
  assert.equal(competing.status, 401);
  const audit = (await db.query(`SELECT * FROM machine_credential_audit
    WHERE action='machine.refresh_family_revoked'`)).rows[0];
  assert.equal(audit.actor_type, 'machine');
  assert.equal(audit.actor_id, machine.machineId);
  assert.equal(audit.target_type, 'machine');
  assert.equal(audit.target_id, machine.machineId);
  assert.equal(audit.result, 'rejected');
  assert.equal(audit.reason, 'credential_reuse');
  assert.equal(audit.server_request_id, competing.headers.get('x-correlation-id'));
  assert.equal(audit.client_rotation_request_id, competingRequestId);
  assert.equal(audit.before_generation, 0);
  assert.equal(audit.after_generation, 0);
  assert.equal(audit.before_family_revoked, false);
  assert.equal(audit.after_family_revoked, true);
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

test('concurrent byte-identical retries return one refresh successor', async () => {
  const machine = await enrolledMachine();
  const body = JSON.stringify({ installation_id: machine.installationId, generation: 0, request_id: randomUUID() });
  const responses = await Promise.all([
    rawRefresh(machine.refreshToken, body), rawRefresh(machine.refreshToken, body),
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const results = await Promise.all(responses.map(response => response.json() as Promise<{ refresh_token: string }>));
  assert.equal(results[0].refresh_token, results[1].refresh_token);
});

test('family-first locking makes direct and reuse-marker predecessor races revoke without deadlock', async () => {
  for (const predecessor of ['retained-row', 'reuse-marker'] as const) {
    const machine = await enrolledMachine();
    const first = await refresh(machine.refreshToken, {
      installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
    });
    assert.equal(first.status, 200, predecessor);
    const issued = await first.json() as { refresh_token: string };
    if (predecessor === 'reuse-marker') {
      await setDatabaseNow(new Date(now.getTime() + 30_001));
      await purgeExpiredMachineRefreshRetries(db);
      assert.equal((await db.query(`SELECT count(*)::integer AS n FROM machine_refresh_credentials
        WHERE machine_id=$1 AND generation=0`, [machine.machineId])).rows[0].n, 0);
    }

    const gate = await clockGate();
    try {
      const reuse = refresh(machine.refreshToken, {
        installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
      });
      await waitForRefreshLock(query => query.includes('machine_credential_clock() AS now'));
      const current = refresh(issued.refresh_token, {
        installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
      });
      await waitForRefreshLock(query => !query.includes('machine_credential_clock() AS now')
        && (query.includes('machine_refresh_credentials') || query.includes('FROM machines m')));
      await gate.release();
      const responses = await Promise.all([reuse, current]);
      assert.deepEqual(responses.map(response => response.status), [401, 401], predecessor);
      assert(!responses.some(response => response.status === 500), predecessor);
      await assertRefreshFamilyRevoked(machine.machineId);
      assert.equal((await db.query(`SELECT count(*)::integer AS n FROM machine_refresh_credentials
        WHERE machine_id=$1 AND generation>1 AND NOT revoked`, [machine.machineId])).rows[0].n, 0, predecessor);
      assert((await db.query(`SELECT count(*)::integer AS n FROM machine_credential_audit
        WHERE actor_id=$1 AND action='machine.refresh_family_revoked'`, [machine.machineId])).rows[0].n >= 1,
      predecessor);
    } finally {
      await gate.close();
    }
  }
});

test('a waiting marker request locks a newly committed successor before revocation', async () => {
  const machine = await enrolledMachine();
  const first = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
  });
  const issued = await first.json() as { refresh_token: string };
  await setDatabaseNow(new Date(now.getTime() + 30_001));
  await purgeExpiredMachineRefreshRetries(db);

  const currentGate = await clockGate();
  let markerGate: Awaited<ReturnType<typeof clockGate>> | undefined;
  try {
    const current = refresh(issued.refresh_token, {
      installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
    });
    await waitForRefreshLock(query => query.includes('machine_credential_clock() AS now'));
    markerGate = await clockGate();
    const lateReuse = refresh(machine.refreshToken, {
      installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
    });
    await waitForRefreshLock(query => query.includes('machine_refresh_credentials')
      && query.includes('ORDER BY generation FOR UPDATE'));
    await currentGate.release();
    assert.equal((await current).status, 200);
    await waitForRefreshLock(query => query.includes('machine_credential_clock() AS now'));

    const probe = await db.connect();
    try {
      await probe.query('BEGIN');
      await assert.rejects(probe.query(`SELECT 1 FROM machine_refresh_credentials
        WHERE machine_id=$1 AND generation=2 FOR UPDATE NOWAIT`, [machine.machineId]),
      error => (error as { code?: string }).code === '55P03');
      await probe.query('ROLLBACK');
    } finally {
      probe.release();
    }

    await markerGate.release();
    assert.equal((await lateReuse).status, 401);
    await assertRefreshFamilyRevoked(machine.machineId);
    assert.equal((await db.query(`SELECT revoked FROM machine_refresh_credentials
      WHERE machine_id=$1 AND generation=2`, [machine.machineId])).rows[0].revoked, true);
  } finally {
    await currentGate.close();
    if (markerGate) await markerGate.close();
  }
});

test('cleanup between family resolution and locking falls back to the reuse marker', async () => {
  const machine = await enrolledMachine();
  const firstRequest = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, firstRequest);
  const issued = await first.json() as { refresh_token: string };
  await setDatabaseNow(new Date(now.getTime() + 30_001));

  const reached = deferred();
  const resume = deferred();
  const body = Buffer.from(JSON.stringify(firstRequest));
  const serverRequestId = randomUUID();
  const pending = rotateMachineCredential(pausePoolAfterQuery(
    query => query.includes('SELECT family_id,machine_id FROM machine_refresh_credentials'), reached, resume),
  `Bearer ${machine.refreshToken}`, body, body.toString(), hashKey, serverRequestId);
  await reached.promise;
  await purgeExpiredMachineRefreshRetries(db);
  assert.equal((await db.query(`SELECT count(*)::integer AS n FROM machine_refresh_credentials
    WHERE machine_id=$1 AND generation=0`, [machine.machineId])).rows[0].n, 0);
  resume.resolve();
  await assert.rejects(pending, error => (error as { code?: string }).code === 'invalid_credentials');
  await assertRefreshFamilyRevoked(machine.machineId);
  assert.equal((await refresh(issued.refresh_token, {
    installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
  })).status, 401);
  const audit = (await db.query(`SELECT reason FROM machine_credential_audit
    WHERE actor_id=$1 AND server_request_id=$2`, [machine.machineId, serverRequestId])).rows[0];
  assert.equal(audit.reason, 'credential_reuse');
});

test('global retry cleanup and reuse serialize without a refresh deadlock', async () => {
  const machine = await enrolledMachine();
  const predecessorRequest = {
    installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
  };
  const first = await refresh(machine.refreshToken, predecessorRequest);
  assert.equal(first.status, 200);
  const issued = await first.json() as { access_token: string; refresh_token: string };

  await db.query('DELETE FROM machine_refresh_credentials WHERE machine_id=$1', [machine.machineId]);
  const consumedAt = new Date(now.getTime() - 31_000);
  const retryExpiredAt = new Date(now.getTime() - 1);
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000);
  const generationTwoToken = randomBytes(32).toString('base64url');
  const digest = (token: string) => createHmac('sha256', hashKey).update(token).digest('hex');
  await db.query(`INSERT INTO machine_refresh_credentials
    (digest,machine_id,expires_at,family_id,generation,consumed_at,retry_expires_at,
      retry_installation_id,retry_request_id,retry_request_digest)
    VALUES
      ($1,$2,$3,$2,1,$4,$5,$6,$7,$8),
      ($9,$2,$3,$2,0,$4,$5,$6,$10,$11),
      ($12,$2,$3,$2,2,NULL,NULL,NULL,NULL,NULL)`,
  [digest(issued.refresh_token), machine.machineId, expiresAt, consumedAt, retryExpiredAt,
    machine.installationId, randomUUID(), createHash('sha256').update('generation-one').digest('hex'),
    digest(machine.refreshToken), randomUUID(), createHash('sha256').update('generation-zero').digest('hex'),
    digest(generationTwoToken)]);
  assert.deepEqual((await db.query(`SELECT generation FROM machine_refresh_credentials
    WHERE family_id=$1 ORDER BY ctid`, [machine.machineId])).rows.map(row => row.generation), [1, 0, 2]);

  const gateKey = nextClockGateKey++;
  await db.query(`CREATE FUNCTION pause_reverse_refresh_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.generation = 1 THEN PERFORM pg_advisory_xact_lock(${gateKey}); END IF;
      RETURN OLD;
    END
  $$`);
  await db.query(`CREATE TRIGGER pause_reverse_refresh_cleanup BEFORE DELETE ON machine_refresh_credentials
    FOR EACH ROW EXECUTE FUNCTION pause_reverse_refresh_cleanup()`);
  const gate = await db.connect();
  await gate.query('SELECT pg_advisory_lock($1)', [gateKey]);
  let released = false;
  try {
    const cleanup = purgeExpiredMachineRefreshRetries(db);
    await waitForRefreshLock(query => query.includes('DELETE FROM machine_refresh_credentials'));
    const reuse = refresh(machine.refreshToken, {
      installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
    });
    await waitForRefreshLock(query => query.includes('ORDER BY generation FOR UPDATE'));
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    released = true;

    const [cleanupResult, reuseResponse] = await Promise.all([
      cleanup.then(() => null, error => error as { code?: string }),
      reuse,
    ]);
    assert.equal(cleanupResult?.code, undefined);
    assert.notEqual(reuseResponse.status, 500);
    assert.equal(reuseResponse.status, 401);
    await assertRefreshFamilyRevoked(machine.machineId);
    const audit = (await db.query(`SELECT reason FROM machine_credential_audit
      WHERE actor_id=$1 AND action='machine.refresh_family_revoked'`, [machine.machineId])).rows.at(-1);
    assert.equal(audit.reason, 'credential_reuse');
  } finally {
    if (!released) await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    gate.release();
  }
});

test('global retry cleanup removes expired generations across families', async () => {
  const machines = await Promise.all([enrolledMachine(), enrolledMachine()]);
  for (const machine of machines) {
    const first = await refresh(machine.refreshToken, {
      installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
    });
    assert.equal(first.status, 200);
    const generationOne = await first.json() as { refresh_token: string };
    const second = await refresh(generationOne.refresh_token, {
      installation_id: machine.installationId, generation: 1, request_id: randomUUID(),
    });
    assert.equal(second.status, 200);
  }
  await setDatabaseNow(new Date(now.getTime() + 30_001));

  await purgeExpiredMachineRefreshRetries(db);
  await purgeExpiredMachineRefreshRetries(db);

  for (const machine of machines) {
    const remaining = (await db.query(`SELECT generation,consumed_at FROM machine_refresh_credentials
      WHERE machine_id=$1 ORDER BY generation`, [machine.machineId])).rows;
    assert.deepEqual(remaining, [{ generation: 2, consumed_at: null }]);
    assert.equal((await db.query(`SELECT count(*)::integer AS n FROM machine_refresh_reuse_markers
      WHERE machine_id=$1`, [machine.machineId])).rows[0].n, 2);
  }
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
  const malformed = await refresh(machine.refreshToken, { ...request, request_id: 'not-a-request-id' });
  assert.equal(malformed.status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
  const audit = (await db.query(`SELECT server_request_id,client_rotation_request_id FROM machine_credential_audit
    WHERE action='machine.refresh_family_revoked'`))
    .rows.at(-1);
  assert.equal(audit.server_request_id, malformed.headers.get('x-correlation-id'));
  assert.equal(audit.client_rotation_request_id, null);
});

test('duplicate-key reuse of a consumed predecessor revokes with no client request ID', async () => {
  const machine = await enrolledMachine();
  const requestId = randomUUID();
  const original = `{"installation_id":"${machine.installationId}","generation":0,"request_id":"${requestId}"}`;
  assert.equal((await rawRefresh(machine.refreshToken, original)).status, 200);
  const duplicate = `{"installation_id":"${machine.installationId}","generation":0,"generation":0,"request_id":"${requestId}"}`;
  const response = await rawRefresh(machine.refreshToken, duplicate);
  assert.equal(response.status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
  const audit = (await db.query(`SELECT * FROM machine_credential_audit
    WHERE action='machine.refresh_family_revoked'`)).rows[0];
  assert.equal(audit.reason, 'credential_reuse');
  assert.equal(audit.server_request_id, response.headers.get('x-correlation-id'));
  assert.equal(audit.client_rotation_request_id, null);
});

test('invalid UTF-8 is rejected on first use and revokes consumed-predecessor reuse', async () => {
  const malformed = new Uint8Array([0xff]);
  const firstUse = await enrolledMachine();
  assert.equal((await rawRefresh(firstUse.refreshToken, malformed)).status, 400);
  const firstUseRow = (await db.query('SELECT revoked,consumed_at FROM machine_refresh_credentials WHERE machine_id=$1',
    [firstUse.machineId])).rows[0];
  assert.deepEqual(firstUseRow, { revoked: false, consumed_at: null });

  const consumed = await enrolledMachine();
  assert.equal((await refresh(consumed.refreshToken, {
    installation_id: consumed.installationId, generation: 0, request_id: randomUUID(),
  })).status, 200);
  assert.equal((await rawRefresh(consumed.refreshToken, malformed)).status, 401);
  await assertRefreshFamilyRevoked(consumed.machineId);
});

test('the exact retry is accepted at 30 seconds and late reuse revokes the family', async () => {
  const machine = await enrolledMachine();
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, request);
  assert.equal(first.status, 200);
  const firstBody = await first.json() as { refresh_token: string };
  await setDatabaseNow(new Date(now.getTime() + 30_000));
  const boundary = await refresh(machine.refreshToken, request);
  assert.equal(boundary.status, 200);
  assert.equal((await boundary.json() as { refresh_token: string }).refresh_token, firstBody.refresh_token);
  await setDatabaseNow(new Date(now.getTime() + 1));
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
  await setDatabaseNow(new Date(now.getTime() + 2_000));
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
  await setDatabaseNow(new Date(now.getTime() + 30_001));
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
  const expiredAudit = (await db.query(`SELECT * FROM machine_credential_audit
    WHERE actor_id=$1 AND action='machine.refresh_family_revoked'`, [expired.machineId])).rows[0];
  assert.equal(expiredAudit.reason, 'credential_expired');
  assert.deepEqual([expiredAudit.before_family_revoked, expiredAudit.after_family_revoked], [false, true]);

  const revoked = await enrolledMachine();
  await db.query('UPDATE machine_refresh_credentials SET revoked=true WHERE machine_id=$1', [revoked.machineId]);
  const revokedRequestId = randomUUID();
  assert.equal((await refresh(revoked.refreshToken, {
    installation_id: revoked.installationId, generation: 0, request_id: revokedRequestId,
  })).status, 401);
  const revokedAudit = (await db.query(`SELECT * FROM machine_credential_audit
    WHERE actor_id=$1 AND action='machine.refresh_family_revoked'`, [revoked.machineId])).rows[0];
  assert.equal(revokedAudit.reason, 'credential_revoked');
  assert.equal(revokedAudit.client_rotation_request_id, revokedRequestId);
  assert.deepEqual([revokedAudit.before_family_revoked, revokedAudit.after_family_revoked], [true, true]);
});

test('inactive machine authority revokes the family with a safe audit', async () => {
  const machine = await enrolledMachine();
  await db.query('UPDATE users SET active=false WHERE id=$1', [machine.userId]);
  const requestId = randomUUID();
  const response = await refresh(machine.refreshToken, {
    installation_id: machine.installationId, generation: 0, request_id: requestId,
  });
  assert.equal(response.status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
  const audit = (await db.query('SELECT * FROM machine_credential_audit WHERE actor_id=$1', [machine.machineId])).rows[0];
  assert.equal(audit.reason, 'inactive_authority');
  assert.equal(audit.result, 'rejected');
  assert.equal(audit.server_request_id, response.headers.get('x-correlation-id'));
  assert.equal(audit.client_rotation_request_id, requestId);
  assert.deepEqual([audit.before_generation, audit.after_generation], [0, 0]);
  assert.deepEqual([audit.before_family_revoked, audit.after_family_revoked], [false, true]);
});

test('application clock skew cannot extend or revive machine credentials', async () => {
  const applicationNow = new Date();
  await setDatabaseNow(new Date(applicationNow.getTime() - 5 * 60_000));
  const ahead = await enrolledMachine();
  assert.equal((await refresh(ahead.refreshToken, {
    installation_id: ahead.installationId, generation: 0, request_id: randomUUID(),
  })).status, 200);
  const excessive = (await db.query(`SELECT
    (SELECT expires_at > machine_credential_clock() + interval '15 minutes' FROM machine_credentials
      WHERE machine_id=$1 ORDER BY expires_at DESC LIMIT 1) AS access,
    (SELECT expires_at > machine_credential_clock() + interval '90 days' FROM machine_refresh_credentials
      WHERE machine_id=$1 AND generation=1) AS refresh`, [ahead.machineId])).rows[0];
  assert.deepEqual(excessive, { access: false, refresh: false });

  await setDatabaseNow(new Date(applicationNow.getTime() + 5 * 60_000));
  const expired = await enrolledMachine();
  await db.query("UPDATE machine_refresh_credentials SET expires_at=machine_credential_clock() - interval '1 millisecond' WHERE machine_id=$1",
    [expired.machineId]);
  assert.equal((await refresh(expired.refreshToken, {
    installation_id: expired.installationId, generation: 0, request_id: randomUUID(),
  })).status, 401);

  const retry = await enrolledMachine();
  const retryRequest = { installation_id: retry.installationId, generation: 0, request_id: randomUUID() };
  assert.equal((await refresh(retry.refreshToken, retryRequest)).status, 200);
  await setDatabaseNow(new Date(now.getTime() + 30_001));
  assert.equal((await db.query(`SELECT retry_expires_at < machine_credential_clock() AS expired
    FROM machine_refresh_credentials WHERE machine_id=$1 AND generation=0`, [retry.machineId])).rows[0].expired, true);
  assert.equal((await refresh(retry.refreshToken, retryRequest)).status, 401);
});

test('credential row-lock waiting happens before the authoritative security timestamp', async () => {
  const machine = await enrolledMachine();
  const originalNow = now;
  const locker = await db.connect();
  let committed = false;
  await locker.query('BEGIN');
  await locker.query('SELECT 1 FROM machine_refresh_credentials WHERE machine_id=$1 FOR UPDATE', [machine.machineId]);
  try {
    const pending = refresh(machine.refreshToken, {
      installation_id: machine.installationId, generation: 0, request_id: randomUUID(),
    });
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      waiting = (await db.query(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'
          AND query LIKE 'SELECT * FROM machine_refresh_credentials%') AS waiting`)).rows[0].waiting;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(waiting, true);
    const afterWait = new Date(originalNow.getTime() + 20_000);
    await setDatabaseNow(afterWait);
    await locker.query('COMMIT');
    committed = true;
    assert.equal((await pending).status, 200);
    const row = (await db.query(`SELECT consumed_at,retry_expires_at FROM machine_refresh_credentials
      WHERE machine_id=$1 AND generation=0`, [machine.machineId])).rows[0];
    assert.equal(row.consumed_at.getTime(), afterWait.getTime());
    assert.equal(row.retry_expires_at.getTime(), afterWait.getTime() + 30_000);
  } finally {
    if (!committed) await locker.query('ROLLBACK');
    locker.release();
  }
});

test('database-time cleanup preserves the inclusive boundary and late-reuse detection', async () => {
  const machine = await enrolledMachine();
  const request = { installation_id: machine.installationId, generation: 0, request_id: randomUUID() };
  const first = await refresh(machine.refreshToken, request);
  assert.equal(first.status, 200);
  await setDatabaseNow(new Date(now.getTime() + 30_000));
  await purgeExpiredMachineRefreshRetries(db);
  assert.equal((await db.query(`SELECT count(*)::integer AS n FROM machine_refresh_credentials
    WHERE machine_id=$1 AND generation=0`, [machine.machineId])).rows[0].n, 1);
  await setDatabaseNow(new Date(now.getTime() + 1));
  await purgeExpiredMachineRefreshRetries(db);
  assert.equal((await db.query(`SELECT count(*)::integer AS n FROM machine_refresh_credentials
    WHERE machine_id=$1 AND generation=0`, [machine.machineId])).rows[0].n, 0);
  assert.equal((await refresh(machine.refreshToken, request)).status, 401);
  await assertRefreshFamilyRevoked(machine.machineId);
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
  const rawBody = ` \n {"installation_id":"${request.installation_id}", "generation":0, "request_id":"${request.request_id}"} \t`;
  const response = await rawRefresh(machine.refreshToken, rawBody);
  const issued = await response.json() as { access_token: string; refresh_token: string };
  const rows = (await db.query('SELECT * FROM machine_refresh_credentials WHERE machine_id=$1 ORDER BY generation',
    [machine.machineId])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].digest, createHmac('sha256', hashKey).update(machine.refreshToken).digest('hex'));
  assert.equal(rows[1].digest, createHmac('sha256', hashKey).update(issued.refresh_token).digest('hex'));
  assert.equal(rows[0].retry_installation_id, machine.installationId);
  assert.equal(rows[0].retry_request_id, request.request_id);
  assert.equal(rows[0].retry_request_digest, createHash('sha256').update(Buffer.from(rawBody)).digest('hex'));
  const reuseMarkers = (await db.query('SELECT * FROM machine_refresh_reuse_markers')).rows;
  assert.equal(reuseMarkers.length, 1);
  assert.equal(reuseMarkers[0].marker, createHmac('sha256', hashKey)
    .update('abisso.machine-refresh.reuse-marker.v1\0').update(machine.refreshToken).digest('hex'));
  const duplicateBody = `{"installation_id":"${request.installation_id}","generation":9,"generation":0,"request_id":"${request.request_id}"}`;
  assert.equal((await rawRefresh(machine.refreshToken, duplicateBody)).status, 401);
  const persisted = JSON.stringify({ refresh: rows, reuseMarkers,
    audit: (await db.query('SELECT * FROM machine_credential_audit')).rows });
  const diagnostics = diagnosticLines.join('\n');
  for (const forbidden of [machine.refreshToken, issued.refresh_token, issued.access_token,
    `Bearer ${machine.refreshToken}`, rawBody, duplicateBody]) {
    assert(!persisted.includes(forbidden));
    assert(!diagnostics.includes(forbidden));
  }
});
