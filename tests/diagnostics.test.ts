import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createDiagnosticLog, exportDiagnostics, scanDiagnostics } from '../packages/collector/diagnostics.ts';
import { createApi } from '../apps/backend/api.ts';

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function directory() { const root = mkdtempSync(join(tmpdir(), 'abisso-diag-')); roots.push(root); return root; }

const adversarial = [
  'sk-test-P0-secret', 'Bearer attacker-token', 'user@example.com',
  '/Users/alice/private/repository', 'refs/heads/secret-branch',
  'session_very_private', 'prompt: customer code', 'AWS_SECRET_ACCESS_KEY=fixture',
];

test('local diagnostic records and export never serialize untrusted failure content', () => {
  const root = directory();
  const log = createDiagnosticLog(root, { maxBytes: 600, maxAgeMs: 86_400_000 });
  for (const value of adversarial) {
    log.record('ipc_rejected', { detail: value, count: 1_000_000_000 } as never);
  }
  const output = exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
  assert.equal(scanDiagnostics(output), true);
  assert.doesNotMatch(output + readdirSync(root).map(file => readFileSync(join(root, file), 'utf8')).join(''), new RegExp(adversarial.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')));
  assert.deepEqual(Object.keys(JSON.parse(output)), ['format_version', 'status', 'logs']);
});

test('rotation bounds log files and export ignores queue and Keychain material', () => {
  const root = directory();
  const log = createDiagnosticLog(root, { maxBytes: 220, maxAgeMs: 1000 });
  for (let i = 0; i < 30; i++) log.record('ipc_rejected');
  writeFileSync(join(root, 'queue.sqlite'), 'sk-test-queue-secret');
  writeFileSync(join(root, 'Keychain-copy'), 'sk-test-keychain-secret');
  const files = readdirSync(root).filter(name => name.startsWith('diagnostics.'));
  assert.ok(files.length <= 2);
  assert.ok(files.every(name => readFileSync(join(root, name)).byteLength <= 220));
  const exported = exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
  assert.doesNotMatch(exported, /queue-secret|keychain-secret|queue.sqlite|Keychain-copy/);
});

test('aged local log rotates before appending a fresh record', () => {
  const root = directory();
  const log = createDiagnosticLog(root, { maxAgeMs: 3_600_000 });
  log.record('collector_ready');
  const old = new Date(Date.now() - 2 * 3_600_000);
  utimesSync(join(root, 'diagnostics.0.log'), old, old);
  log.record('ipc_rejected');
  assert.match(readFileSync(join(root, 'diagnostics.1.log'), 'utf8'), /collector_ready/);
  assert.match(readFileSync(join(root, 'diagnostics.0.log'), 'utf8'), /ipc_rejected/);
});

test('export removes expired records from both local log files', () => {
  const root = directory();
  const expiredHour = Math.floor((Date.now() - 8 * 86_400_000) / 3_600_000);
  for (const name of ['diagnostics.0.log', 'diagnostics.1.log']) {
    writeFileSync(join(root, name), `${JSON.stringify({ code: 'collector_ready', hour: expiredHour })}\n`);
  }
  const exported = exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
  assert.deepEqual(JSON.parse(exported).logs, []);
  assert.deepEqual(readdirSync(root), []);
});

test('near-capacity rotated logs remain exportable', () => {
  const root = directory();
  const log = createDiagnosticLog(root);
  for (let i = 0; i < 1200; i++) log.record('ipc_rejected', { count: i });
  const exported = exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
  assert.equal(scanDiagnostics(exported), true);
  assert.ok(JSON.parse(exported).logs.length > 500);
});

test('scanner rejects forbidden strings in a diagnostic bundle', () => {
  for (const value of adversarial) assert.equal(scanDiagnostics(value), false);
});

test('server error logging uses generated correlation and safe codes', async () => {
  const records: string[] = [];
  const server = createApi({ options: {}, query: async () => { throw new Error('sk-test-P0-database-secret'); } } as never, { diagnosticLog: line => records.push(line) });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const value of adversarial) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/${encodeURIComponent(value)}`);
      assert.equal(response.status, 404);
      assert.match(response.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/);
      const record = JSON.parse(records.at(-1)!);
      assert.equal(record.code, 'not_found');
      assert.equal(record.correlation_id, response.headers.get('x-correlation-id'));
      assert.equal(record.status, 404);
      assert.equal(record.duration_ms % 100, 0);
      assert.doesNotMatch(records.join('') + await response.text(), /sk-test|user@example|private\/repository|secret-branch|session_very_private|customer code|AWS_SECRET/);
    }
    const failed: Response = await fetch(`http://127.0.0.1:${address.port}/v1/browser/session`);
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'internal_error' });
    assert.equal(JSON.parse(records.at(-1)!).code, 'internal_error');
    assert.doesNotMatch(records.join(''), /sk-test-P0-database-secret/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
