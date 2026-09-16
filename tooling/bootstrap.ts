import { database } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';

const db = database();
try {
  await bootstrapSynthetic(db, process.env.NODE_ENV ?? '');
  console.log('synthetic_bootstrap_ready');
} catch {
  console.error('synthetic_bootstrap_failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
