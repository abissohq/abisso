import { setTimeout } from 'node:timers/promises';
import { database, localDatabaseUrl } from '../packages/database/database.ts';
import { bootstrapSynthetic } from '../packages/database/bootstrap.ts';
import { capabilityBatch } from '../packages/test-fixtures/capability.ts';
import { heartbeatBatch, sessionStartBatch } from '../packages/test-fixtures/session.ts';

if (process.env.NODE_ENV && !['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('synthetic_demo_forbidden');
process.env.DATABASE_URL ??= localDatabaseUrl;
const db = database();
const url = `http://127.0.0.1:${process.env.PORT ?? 3001}`;
const streamAbort = new AbortController();
type DemoSession = { id: string; state: string; latest_evidence_event_id: string; fresh_through_at: string; freshness_status: string };
type DemoWorkstream = { id: string; state: string; sessions: DemoSession[] };
type DemoSnapshot = { workstreams: DemoWorkstream[] };
let phase = 'login';
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
  const stream = await fetch(`${url}/v1/live/events`, { headers: { cookie: browserCookie }, signal: streamAbort.signal });
  if (!stream.ok || !stream.body) throw new Error('stream_failed');
  const reader = stream.body.getReader();
  let buffered = '';
  async function event() {
    for (;;) {
      const boundary = buffered.indexOf('\n\n');
      if (boundary >= 0) {
        const frame = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        const name = /^event: (.+)$/m.exec(frame)?.[1];
        if (name) return name;
      }
      const next = await reader.read();
      if (next.done) throw new Error('stream_closed');
      buffered += new TextDecoder().decode(next.value);
    }
  }
  if (await event() !== 'stream.ready') throw new Error('stream_not_ready');
  phase = 'capability';
  const sequence = Number((await db.query('SELECT COALESCE(MAX(source_sequence),0) AS sequence FROM telemetry_event_dispositions')).rows[0].sequence) + 1;
  async function submit(batch: unknown) {
    const response = await fetch(`${url}/v1/telemetry/batches`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
    if (!response.ok || (await response.json()).results[0]?.disposition !== 'accepted') throw new Error('acceptance_failed');
  }
  const a = capabilityBatch(sequence);
  await submit(a);
  const b = sessionStartBatch(a.events[0].payload.declaration_id, sequence + 1);
  phase = 'start_acceptance';
  await submit(b);
  phase = 'start_notification';
  async function live() {
    const response = await fetch(`${url}/v1/live`, { headers: { cookie: browserCookie } });
    if (!response.ok) { phase = `live_http_${response.status}`; throw new Error('live_failed'); }
    return response.json() as Promise<DemoSnapshot>;
  }
  const projectionTimeout = globalThis.setTimeout(() => streamAbort.abort(), 15_000);
  let workstream: DemoWorkstream | undefined;
  for (;;) {
    if (await event() !== 'projection.invalidated') throw new Error('start_invalidation_missing');
    phase = 'start_snapshot';
    const starting = await live();
    workstream = starting.workstreams.find(row => row.sessions.some(session => session.id === b.events[0].session_id));
    if (workstream?.state === 'Active' && workstream.sessions[0]?.state === 'Starting') break;
    phase = 'start_notification';
  }
  console.log('session_start_live_verified');
  phase = 'heartbeat';
  const c = heartbeatBatch(b.events[0], sequence + 2);
  await submit(c);
  let running: DemoSnapshot;
  for (;;) {
    if (await event() !== 'projection.invalidated') throw new Error('heartbeat_invalidation_missing');
    running = await live();
    const row = running.workstreams.find(value => value.id === workstream.id);
    if (row?.sessions[0]?.id === b.events[0].session_id && row.sessions[0].state === 'Running' &&
        row.sessions[0].latest_evidence_event_id === c.events[0].event_id) break;
  }
  clearTimeout(projectionTimeout);
  console.log('session_heartbeat_live_verified');
  phase = 'freshness';
  const staleAt = Date.parse(running.workstreams.find(row => row.id === workstream.id)!.sessions[0].fresh_through_at) + 1;
  await setTimeout(Math.max(0, staleAt - Date.now()));
  if ((await live()).workstreams.find(row => row.id === workstream.id)?.sessions[0].freshness_status !== 'Stale') throw new Error('stale_presentation_missing');
  console.log('session_evidence_stale_lifecycle_running_verified');
} catch {
  console.error(`session_heartbeat_demo_failed:${phase}`);
  process.exitCode = 1;
} finally { streamAbort.abort(); await db.end(); }
