import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const localDatabaseUrl = 'postgres://abisso_dev:abisso_local_only@127.0.0.1:55432/abisso_dev';

export function database() {
  if (!process.env.DATABASE_URL) throw new Error('database_url_required');
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
}

export async function transaction<T>(db: pg.Pool, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(db: pg.Pool) {
  const migrations = ['001-ingestion.sql', '002-session-start.sql', '003-mixed-batch.sql', '004-worker-recovery.sql', '005-browser-identity.sql', '006-machine-enrollment.sql', '007-machine-refresh.sql'];
  await transaction(db, async client => {
    await client.query("SELECT pg_advisory_xact_lock(182305, 1)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY)');
    for (const [index, path] of migrations.entries()) {
      const version = index + 1;
      if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])).rowCount) {
        await client.query(await readFile(new URL(path, import.meta.url), 'utf8'));
        await client.query('INSERT INTO schema_migrations VALUES ($1)', [version]);
      }
    }
  });
}
