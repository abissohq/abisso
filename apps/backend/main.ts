import { database } from '../../packages/database/database.ts';
import { createApi } from './api.ts';
import { clerkVerifier } from '../../packages/browser/clerk.ts';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_port');
const db = database();
const origin = process.env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
const server = createApi(db, { environment: process.env.NODE_ENV, origin,
  secureCookies: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  browserIdentity: process.env.CLERK_JWT_KEY && process.env.CLERK_ISSUER ? clerkVerifier(process.env.CLERK_JWT_KEY, origin, process.env.CLERK_ISSUER) : undefined });
server.on('error', async () => {
  console.error('api_failed');
  await db.end();
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => { console.log('api_ready'); });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { void db.end(); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
