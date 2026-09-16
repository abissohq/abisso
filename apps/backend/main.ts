import { database } from '../../packages/database/database.ts';
import { createApi } from './api.ts';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_port');
const db = database();
const server = createApi(db);
server.on('error', async () => {
  console.error('api_failed');
  await db.end();
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => { console.log('api_ready'); });
function stop() {
  server.close(() => { void db.end(); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
