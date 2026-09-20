import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createDiagnosticLog, exportDiagnostics, pruneDiagnosticLogs, scanDiagnostics } from '../packages/collector/diagnostics.ts';
import { createApi } from '../apps/backend/api.ts';

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function directory() { const root = mkdtempSync(join(tmpdir(), 'abisso-diag-')); roots.push(root); return root; }

test('a substituted diagnostic FIFO cannot block startup or export', () => {
  for (const operation of ['startup', 'export']) {
    const root = directory();
    assert.equal(spawnSync('mkfifo', [join(root, 'diagnostics.0.log')]).status, 0);
    const script = `import { createDiagnosticLog, exportDiagnostics } from './packages/collector/diagnostics.ts';
      try {
        if (process.argv[2] === 'startup') createDiagnosticLog(process.argv[1]);
        else exportDiagnostics(process.argv[1], { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
        process.exit(2);
      } catch { process.exit(0); }`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, operation], { timeout: 1000 });
    assert.equal((result.error as NodeJS.ErrnoException | undefined)?.code, undefined, `${operation} blocked on a FIFO`);
    assert.equal(result.status, 0, `${operation} accepted a FIFO`);
  }
});

test('an oversized named diagnostic file is rejected before an unbounded read', () => {
  const root = directory();
  writeFileSync(join(root, 'diagnostics.0.log'), Buffer.alloc(1024 * 1024, 32), { mode: 0o600 });
  const script = `import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const originalFileRead = fs.readFileSync;
    const originalRead = fs.readSync;
    let loaded = 0;
    fs.readFileSync = (...args) => {
      const result = originalFileRead(...args);
      if (typeof args[0] === 'number' && fs.fstatSync(args[0]).ino === fs.statSync(process.argv[1]).ino)
        loaded += Buffer.byteLength(result);
      return result;
    };
    fs.readSync = (...args) => {
      const count = originalRead(...args);
      if (fs.fstatSync(args[0]).ino === fs.statSync(process.argv[1]).ino) loaded += count;
      return count;
    };
    syncBuiltinESMExports();
    const { exportDiagnostics } = await import('./packages/collector/diagnostics.ts?bounded-read-test');
    try { exportDiagnostics(process.argv[1], { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }); process.exit(2); }
    catch { process.stdout.write(String(loaded)); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: 1000 });
  assert.equal(result.status, 0);
  assert.ok(Number(result.stdout) <= 32 * 1024 + 1, `loaded ${result.stdout} bytes`);
});

test('non-private diagnostic files cannot be exported or pruned', () => {
  const root = directory();
  const path = join(root, 'diagnostics.0.log');
  const hour = Math.floor(Date.now() / 3_600_000);
  writeFileSync(path, `${JSON.stringify({ code: 'collector_ready', hour: hour - 1 })}\n${JSON.stringify({ code: 'ipc_rejected', hour })}\n`, { mode: 0o644 });
  assert.throws(() => exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }));
  assert.throws(() => pruneDiagnosticLogs(root, 1000));
  assert.equal(statSync(path).mode & 0o777, 0o644);
});

test('diagnostic read rejects a file owned by another uid', () => {
  const root = directory();
  writeFileSync(join(root, 'diagnostics.0.log'), `${JSON.stringify({ code: 'collector_ready', hour: Math.floor(Date.now() / 3_600_000) })}\n`, { mode: 0o600 });
  const script = `import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.fstatSync;
    fs.fstatSync = (...args) => {
      const info = original(...args);
      return Object.assign(Object.create(info), { uid: info.uid + 1 });
    };
    syncBuiltinESMExports();
    const { exportDiagnostics } = await import('./packages/collector/diagnostics.ts?foreign-owner-test');
    try { exportDiagnostics(process.argv[1], { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }); process.exit(2); }
    catch { process.exit(0); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { timeout: 1000 });
  assert.equal(result.status, 0);
});

test('prune does not truncate a file substituted after validation', () => {
  const root = directory();
  const path = join(root, 'diagnostics.0.log');
  const hour = Math.floor(Date.now() / 3_600_000);
  writeFileSync(path, `${JSON.stringify({ code: 'collector_ready', hour: hour - 2 })}\n${JSON.stringify({ code: 'ipc_rejected', hour })}\n`, { mode: 0o600 });
  const script = `import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.openSync;
    let substituted = false;
    fs.openSync = (...args) => {
      if (args[1] & fs.constants.O_TRUNC) {
        substituted = true;
        fs.chmodSync(process.argv[1], 0o644);
      }
      return original(...args);
    };
    syncBuiltinESMExports();
    const { pruneDiagnosticLogs } = await import('./packages/collector/diagnostics.ts?prune-race-test');
    try { pruneDiagnosticLogs(process.argv[2], 3_600_000); process.exit(substituted ? 2 : 0); }
    catch { process.exit(0); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, path, root], { timeout: 1000 });
  assert.equal(result.status, 0, 'prune truncated a changed file');
});

test('prune rechecks file mode immediately before truncation', () => {
  const root = directory();
  const path = join(root, 'diagnostics.0.log');
  const hour = Math.floor(Date.now() / 3_600_000);
  const original = `${JSON.stringify({ code: 'collector_ready', hour: hour - 2 })}\n${JSON.stringify({ code: 'ipc_rejected', hour })}\n`;
  writeFileSync(path, original, { mode: 0o600 });
  const script = `import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const originalRead = fs.readSync;
    fs.readSync = (...args) => {
      const count = originalRead(...args);
      if (count && fs.fstatSync(args[0]).ino === fs.statSync(process.argv[1]).ino) fs.chmodSync(process.argv[1], 0o644);
      return count;
    };
    syncBuiltinESMExports();
    const { pruneDiagnosticLogs } = await import('./packages/collector/diagnostics.ts?prune-mode-test');
    try { pruneDiagnosticLogs(process.argv[2], 3_600_000); process.exit(2); }
    catch (error) { process.stdout.write(error.message); process.exit(0); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, path, root], { encoding: 'utf8', timeout: 1000 });
  assert.equal(result.status, 0, 'prune accepted a mode change after reading');
  assert.equal(result.stdout, 'diagnostic_read_failed');
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('raw duplicate keys and noncanonical diagnostic lines are rejected', () => {
  const hour = Math.floor(Date.now() / 3_600_000);
  for (const raw of [
    `{"code":"sk-test-P0-secret","code":"collector_ready","hour":${hour}}\n`,
    ` {"code":"collector_ready","hour":${hour}}\n`,
    `{"code":"collector_ready","hour":${hour},"hidden":"payload"}\n`,
  ]) {
    const root = directory();
    writeFileSync(join(root, 'diagnostics.0.log'), raw, { mode: 0o600 });
    assert.throws(() => exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }));
  }
});

test('writer-produced compact records round-trip through export', () => {
  const root = directory();
  createDiagnosticLog(root).record('ipc_rejected', { count: 3, queue_bytes: 12 });
  const info = statSync(join(root, 'diagnostics.0.log'));
  assert.equal(info.mode & 0o777, 0o600);
  assert.equal(info.uid, process.getuid?.());
  const bundle = JSON.parse(exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }));
  assert.equal(bundle.logs.length, 1);
  assert.equal(bundle.logs[0].code, 'ipc_rejected');
  assert.equal(bundle.logs[0].count, 3);
  assert.equal(bundle.logs[0].queue_bytes, 12);
});

test('named diagnostic symlinks fail closed without reading their targets', () => {
  for (const name of ['diagnostics.0.log', 'diagnostics.1.log']) {
    const root = directory();
    const target = join(root, 'queue.sqlite');
    writeFileSync(target, 'sk-test-queue-secret', { mode: 0o600 });
    symlinkSync(target, join(root, name));
    assert.throws(() => exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }));
    assert.equal(readFileSync(target, 'utf8'), 'sk-test-queue-secret');
  }
});

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
    writeFileSync(join(root, name), `${JSON.stringify({ code: 'collector_ready', hour: expiredHour })}\n`, { mode: 0o600 });
  }
  const exported = exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
  assert.deepEqual(JSON.parse(exported).logs, []);
  assert.deepEqual(readdirSync(root), []);
});

test('seven-day pruning keeps the cutoff hour and removes older hours in both files', () => {
  const realNow = Date.now;
  const hourMs = 3_600_000;
  Date.now = () => 200 * hourMs + 30 * 60_000;
  try {
    const root = directory();
    for (const name of ['diagnostics.0.log', 'diagnostics.1.log']) {
      writeFileSync(join(root, name), `${JSON.stringify({ code: 'collector_ready', hour: 31 })}\n${JSON.stringify({ code: 'ipc_rejected', hour: 32 })}\n`, { mode: 0o600 });
    }
    const bundle = JSON.parse(exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' }));
    assert.deepEqual(bundle.logs.map((row: { code: string }) => row.code), ['ipc_rejected', 'ipc_rejected']);
  } finally { Date.now = realNow; }
});

test('near-capacity rotated logs remain exportable', () => {
  const root = directory();
  const log = createDiagnosticLog(root);
  for (let i = 0; i < 1200; i++) log.record('ipc_rejected', { count: i });
  const exported = exportDiagnostics(root, { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' });
  assert.equal(scanDiagnostics(exported), true);
  assert.ok(JSON.parse(exported).logs.length > 500);
});

test('a maximum-shaped diagnostic record never exceeds a smaller configured cap', () => {
  const root = directory();
  const log = createDiagnosticLog(root, { maxBytes: 128 });
  assert.throws(() => log.record('collector_cleanup_failed', {
    count: 1_000_000, queue_age_s: 2_592_000,
    queue_bytes: 1_000_000_000, duration_ms: 60_000,
  }));
  assert.ok(readdirSync(root).every(name => readFileSync(join(root, name)).byteLength <= 128));
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
