import { buildWeb } from './build-web.ts';
import { fork, spawnSync } from 'node:child_process';
import { database, localDatabaseUrl, migrate } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';

if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') throw new Error('development_composition_only');
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL ??= localDatabaseUrl;
const docker = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { stdio: 'inherit' });
if (docker.status !== 0) process.exit(docker.status ?? 1);
const db = database();
try {
  await migrate(db);
  await bootstrapSynthetic(db, 'development');
} catch {
  console.error('development_setup_failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
if (process.exitCode) process.exit(process.exitCode);
await buildWeb();
const children = ['apps/backend/main.ts', 'apps/worker/main.ts'].map(path => fork(path, [], { stdio: 'inherit' }));
let stopping = false;
function stop() {
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', code => {
    if (!stopping) { process.exitCode = code || 1; stop(); }
  });
}
console.log('synthetic_development_runtime_started');
