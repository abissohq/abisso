import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const suites = [
  'ingestion-foundation', 'session-start', 'mixed-batch-ingestion',
  'recovery', 'heartbeat', 'replay', 'm0-gate',
];
const privateOutput = /M0_PRIVATE_SENTINEL|PRIVATE_CONTENT_MUST_NOT_SURVIVE|private_marker/;
const directory = await mkdtemp(join(tmpdir(), 'abisso-m0-gate-'));
const composeFile = join(directory, 'compose.yaml');
const databasePort = 40000 + Math.floor(Math.random() * 10000);
const databaseUrl = `postgres://abisso_dev:abisso_local_only@127.0.0.1:${databasePort}/abisso_dev`;
const env = { ...process.env, COMPOSE_FILE: composeFile, COMPOSE_PROJECT_NAME: `abisso_m0_gate_${randomUUID().replaceAll('-', '')}`,
  TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl };
const runCompose = (...args: string[]) => spawnSync('docker', ['compose', ...args], { env, encoding: 'utf8' });
try {
  const compose = await readFile('compose.yaml', 'utf8');
  await writeFile(composeFile, compose.replace('127.0.0.1:55432:5432', `127.0.0.1:${databasePort}:5432`));
  const up = runCompose('up', '-d', '--wait', 'postgres');
  if (up.status !== 0) throw new Error(`clean_postgres_start_failed: ${up.stderr ?? up.error}`);
  console.log('M0 gate: fresh isolated PostgreSQL volume ready');
  for (const suite of suites) {
    console.log(`M0 gate: ${suite}`);
    const run = spawnSync(process.execPath, ['tooling/test.ts', `tests/${suite}.test.ts`], {
      env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    process.stdout.write(output);
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`m0_suite_failed:${suite}`);
    if (privateOutput.test(output)) throw new Error(`privacy_gate_output:${suite}`);
  }
  console.log('M0 gate: one-command local startup and full tracer');
  const port = String(39000 + Math.floor(Math.random() * 1000));
  const runtime = spawn(process.execPath, ['tooling/dev.ts'], {
    env: { ...env, PORT: port, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let runtimeOutput = '';
  const capture = (chunk: Buffer) => { runtimeOutput += chunk.toString(); };
  runtime.stdout.on('data', capture);
  runtime.stderr.on('data', capture);
  try {
    const deadline = Date.now() + 30_000;
    while (!runtimeOutput.includes('synthetic_development_runtime_started') || !runtimeOutput.includes('api_ready')) {
      if (runtime.exitCode !== null || Date.now() >= deadline) throw new Error(`runtime_start_failed: ${runtimeOutput}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const demo = spawnSync(process.execPath, ['tooling/demo-start.ts'], {
      env: { ...env, PORT: port, NODE_ENV: 'development' }, encoding: 'utf8', timeout: 120_000,
    });
    const output = `${demo.stdout ?? ''}${demo.stderr ?? ''}`;
    process.stdout.write(output);
    if (demo.error) throw demo.error;
    if (demo.status !== 0 || !output.includes('session_start_live_verified') ||
        !output.includes('session_heartbeat_live_verified') ||
        !output.includes('session_evidence_stale_lifecycle_running_verified')) throw new Error('full_browser_tracer_failed');
    if (privateOutput.test(`${output}${runtimeOutput}`)) throw new Error('privacy_gate_output:runtime');
  } finally {
    runtime.kill('SIGTERM');
    if (runtime.exitCode === null && runtime.signalCode === null) await once(runtime, 'exit');
  }
  console.log('M0 gate passed: synthetic canonical event → ledger → async projection → Workstream Live → realtime invalidation → authoritative reread proven.');
} finally {
  const down = runCompose('down', '-v');
  await rm(directory, { recursive: true, force: true });
  if (down.status !== 0) throw new Error(`m0_gate_cleanup_failed:${down.stderr ?? down.error}`);
}
