import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, statSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const roots: string[] = [];
const children: ChildProcess[] = [];
after(() => {
  for (const child of children) child.kill('SIGTERM');
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function runtime() {
  const root = mkdtempSync(join(tmpdir(), 'abisso-collector-test-'));
  chmodSync(root, 0o700);
  roots.push(root);
  return join(root, 'runtime');
}

function cli(directory: string, ...args: string[]) {
  return spawnSync(process.execPath, ['apps/collector/cli.ts', '--runtime-dir', directory, ...args], {
    encoding: 'utf8', timeout: 3000,
  });
}

async function daemon(directory: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['apps/collector/main.ts', '--runtime-dir', directory], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`daemon exited: ${child.exitCode}`);
    if (cli(directory, 'status').status === 0) return child;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('daemon did not become ready');
}

async function stop(child: ChildProcess) {
  child.kill('SIGTERM');
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
}

async function request(directory: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(directory, 'collector.sock'));
    let response = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.end(body));
    socket.on('data', chunk => { response += chunk; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

test('status is inactive and IPC filesystem is private', async () => {
  const directory = runtime();
  const child = await daemon(directory);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(directory, 'collector.sock')).mode & 0o777, 0o600);
  assert.equal(statSync(join(directory, 'daemon.lock')).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(cli(directory, 'status').stdout), {
    version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped',
  });
  await stop(child);
});

test('duplicate daemon fails and restart retains a working socket', async () => {
  const directory = runtime();
  const first = await daemon(directory);
  const second = spawnSync(process.execPath, ['apps/collector/main.ts', '--runtime-dir', directory], {
    encoding: 'utf8', timeout: 3000,
  });
  assert.notEqual(second.status, 0);
  assert.equal(cli(directory, 'status').status, 0);
  await stop(first);
  const restarted = await daemon(directory);
  assert.equal(cli(directory, 'status').status, 0);
  await stop(restarted);
});

test('restart recovers a daemon killed without socket cleanup', async () => {
  const directory = runtime();
  const first = await daemon(directory);
  first.kill('SIGKILL');
  if (first.exitCode === null) await new Promise(resolve => first.once('exit', resolve));
  const restarted = await daemon(directory);
  assert.equal(cli(directory, 'status').status, 0);
  await stop(restarted);
});

test('unsupported versions and additional fields fail without reflecting secrets', async () => {
  const directory = runtime();
  const child = await daemon(directory);
  const badVersion = JSON.parse(await request(directory, '{"version":2,"command":"status"}\n'));
  assert.deepEqual(badVersion, { version: 1, error: 'unsupported_version' });
  const secret = 'synthetic-secret-marker';
  const badFields = await request(directory, JSON.stringify({ version: 1, command: 'status', token: secret }) + '\n');
  assert.deepEqual(JSON.parse(badFields), { version: 1, error: 'invalid_request' });
  assert.doesNotMatch(badFields, /synthetic-secret-marker|token/);
  assert.notEqual(cli(directory, '--ipc-version', '2', 'status').status, 0);
  const invalid = await request(directory, '{"version":1,"command":"status","credential":"synthetic-secret-marker"}\n');
  assert.doesNotMatch(invalid, /synthetic-secret-marker|credential/);
  await stop(child);
});

test('CLI refuses a socket whose mode is no longer private', async () => {
  const directory = runtime();
  const child = await daemon(directory);
  chmodSync(join(directory, 'collector.sock'), 0o666);
  assert.notEqual(cli(directory, 'status').status, 0);
  await stop(child);
});

test('normal IPC request and response contain no credential or key fields', async () => {
  const directory = runtime();
  mkdirSync(directory, { mode: 0o700 });
  const socketPath = join(directory, 'collector.sock');
  let received = '';
  const server = createServer(socket => {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => { received += chunk; });
    socket.on('end', () => socket.end('{"version":1,"state":"inactive","enrollment":"unenrolled","collection":"stopped"}\n'));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  chmodSync(socketPath, 0o600);
  try {
    const child = spawn(process.execPath, ['apps/collector/cli.ts', '--runtime-dir', directory, 'status'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout!.on('data', chunk => { output += chunk; });
    const exitCode = await new Promise<number | null>(resolve => child.once('exit', resolve));
    assert.equal(exitCode, 0);
    assert.equal(received, '{"version":1,"command":"status"}\n');
    assert.deepEqual(JSON.parse(output), {
      version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped',
    });
    assert.doesNotMatch(received + output, /credential|secret|token|key/i);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('a second UID cannot connect when a passwordless UID switch is available', async t => {
  const probe = spawnSync('sudo', ['-n', '-u', 'nobody', process.execPath, '-e', 'process.exit(0)'], { stdio: 'ignore' });
  if (probe.status !== 0) {
    t.skip('a second UID is unavailable without an interactive privilege change');
    return;
  }
  const directory = runtime();
  const child = await daemon(directory);
  const script = 'const s=require("node:net").createConnection(process.argv[1]);s.on("connect",()=>process.exit(0));s.on("error",()=>process.exit(1));';
  const result = spawnSync('sudo', ['-n', '-u', 'nobody', process.execPath, '-e', script,
    join(directory, 'collector.sock')], { encoding: 'utf8', timeout: 3000 });
  assert.notEqual(result.status, 0);
  await stop(child);
});

test('insecure runtime permissions fail closed', () => {
  const directory = runtime();
  mkdirSync(directory, { mode: 0o755 });
  chmodSync(directory, 0o755);
  const result = spawnSync(process.execPath, ['apps/collector/main.ts', '--runtime-dir', directory], {
    encoding: 'utf8', timeout: 3000,
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /abisso-collector-test-/);
});

test('CLI diagnostics do not print runtime paths', () => {
  const directory = runtime();
  const result = cli(directory, 'status');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /abisso-collector-test-/);
});
