import { spawnSync } from 'node:child_process';
import { localDatabaseUrl } from '../packages/database/database.ts';

if (!process.env.TEST_DATABASE_URL) {
  const docker = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { stdio: 'inherit' });
  if (docker.status !== 0) process.exit(docker.status ?? 1);
}
const files = process.argv.slice(2);
const run = spawnSync(process.execPath, ['--test', ...(files.length ? files : ['tests/*.test.ts'])], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? localDatabaseUrl },
});
process.exitCode = run.status ?? 1;
