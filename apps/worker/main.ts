import { setTimeout } from 'node:timers/promises';
import { database } from '../../packages/database/database.ts';
import { processNext } from '../../packages/processing/worker.ts';

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
const db = database();
try {
  do {
    const processed = await processNext(db);
    if (process.argv.includes('--once') || (process.argv.includes('--drain') && !processed)) break;
    if (!processed) await setTimeout(250);
  } while (!stopping);
} catch {
  // Do not serialize driver errors, SQL parameters, or event bodies.
  console.error('worker_failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
