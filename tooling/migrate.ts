import { database, migrate } from '../packages/database/database.ts';
const db = database();
try { await migrate(db); }
catch { console.error('migration_failed'); process.exitCode = 1; }
finally { await db.end(); }
