import { setTimeout } from 'node:timers/promises';
import { database, localDatabaseUrl } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { sessionStartBatch } from '../packages/test-fixtures/session.ts';

if (process.env.NODE_ENV && !['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('synthetic_demo_forbidden');
process.env.DATABASE_URL ??= localDatabaseUrl;
const db = database();
const url = `http://127.0.0.1:${process.env.PORT ?? 3001}`;
try {
  const { token } = await bootstrapSynthetic(db, process.env.NODE_ENV ?? 'development');
  const page = await fetch(`${url}/dev/login`);
  if (!page.ok) throw new Error('login_failed');
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
  const cookie = page.headers.get('set-cookie')!.split(';')[0];
  async function form(path: string, values: Record<string, string>) {
    const response = await fetch(`${url}${path}`, { method: 'POST', headers: { cookie, origin: url, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });
    if (!response.ok) throw new Error('login_failed');
    return response;
  }
  const code = (await (await form('/dev/login/code', { csrf })).json()).code;
  const authenticated = await form('/dev/login/exchange', { csrf, code });
  const browserCookie = authenticated.headers.get('set-cookie')!.split(';')[0];
  const sequence = Number((await db.query('SELECT COALESCE(MAX(source_sequence),0) AS sequence FROM telemetry_event_dispositions')).rows[0].sequence) + 1;
  async function submit(batch: unknown) {
    const response = await fetch(`${url}/v1/telemetry/batches`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
    if (!response.ok || (await response.json()).results[0]?.disposition !== 'accepted') throw new Error('acceptance_failed');
  }
  const a = capabilityBatch(sequence);
  await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id, sequence + 1);
  await submit(b);
  const deadline = Date.now() + 10_000;
  let visible = false;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/v1/live`, { headers: { cookie: browserCookie } });
    if (!response.ok) throw new Error('live_failed');
    const snapshot = await response.json();
    visible = snapshot.workstreams.some((w: { state: string; sessions: { id: string; state: string }[] }) => w.state === 'Active' && w.sessions.some(s => s.id === b.events[0].session_id && s.state === 'Starting'));
    if (visible) break;
    await setTimeout(50);
  }
  if (!visible) throw new Error('projection_timeout');
  console.log('session_start_live_verified');
} catch {
  console.error('session_start_demo_failed');
  process.exitCode = 1;
} finally { await db.end(); }
