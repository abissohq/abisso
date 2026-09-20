import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { EnrollmentStore } from './keychain.ts';
import { enrollmentScope } from '../contracts/enrollment.ts';

const random = () => randomBytes(32).toString('base64url');
export type EnrollmentResult = { machine_id: string; workspace_id: string; user_id: string; scope: string; access_token: string; refresh_token: string };

export async function enrollMachine(serverOrigin: string, store: EnrollmentStore, openBrowser: (url: string) => void,
  transport: typeof fetch = fetch, allowHttpForTest = false, callbackPort = 0): Promise<{ machine_id: string; workspace_id: string }> {
  const base = new URL(serverOrigin);
  if ((base.protocol !== 'https:' && !(allowHttpForTest && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('invalid_server_origin');
  }
  if (store.read()) throw new Error('already_enrolled');
  const verifier = random();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = random();
  // Reserve a stable device-only identity before the server can register a machine.
  // A failed credential write must not make a retry look like a new installation.
  const installationId = store.installationId();
  let finished = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // A listener bind failure rejects before the callback promise is awaited.
  void codePromise.catch(() => {});
  const listener = createServer((request, response) => {
    if (finished) { response.writeHead(410).end(); return; }
    finished = true;
    const path = new URL(request.url ?? '/', 'http://127.0.0.1');
    const presented = path.searchParams.get('state') ?? '';
    const expected = Buffer.from(state);
    const actual = Buffer.from(presented);
    const valid = request.method === 'GET' && path.pathname === '/callback' && path.searchParams.size === 2
      && path.searchParams.has('code') && path.searchParams.has('state') && actual.length === expected.length
      && timingSafeEqual(actual, expected) && /^[A-Za-z0-9_-]{43}$/.test(path.searchParams.get('code') ?? '');
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    if (!valid) { response.writeHead(400).end('Enrollment failed.'); rejectCode(new Error('invalid_callback')); return; }
    response.end('Enrollment confirmation received. Return to the collector.');
    resolveCode(path.searchParams.get('code')!);
  });
  listener.on('error', rejectCode);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let bound = false;
  try {
    listener.listen(callbackPort, '127.0.0.1');
    await once(listener, 'listening');
    bound = true;
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('callback_unavailable');
    const redirect = `http://127.0.0.1:${address.port}/callback`;
    const page = new URL('/enroll', base);
    page.searchParams.set('redirect_uri', redirect);
    page.searchParams.set('challenge', challenge);
    page.searchParams.set('state', state);
    page.searchParams.set('scope', enrollmentScope);
    openBrowser(page.toString());
    const code = await Promise.race([codePromise, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('callback_timeout')), 300_000);
    })]);
    const response = await transport(new URL('/v1/machines/enrollment-exchanges', base), {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, verifier, redirect_uri: redirect, installation_id: installationId }),
    });
    if (!response.ok) throw new Error('enrollment_exchange_failed');
    const result = await response.json() as EnrollmentResult;
    if (result.scope !== enrollmentScope || !/^[A-Za-z0-9_-]{43}$/.test(result.refresh_token)
      || !/^[A-Za-z0-9_-]{43}$/.test(result.access_token)) throw new Error('invalid_exchange_response');
    const self = await transport(new URL('/v1/machines/self', base), {
      method: 'GET', redirect: 'error', headers: { authorization: `Bearer ${result.access_token}` },
    });
    if (!self.ok) throw new Error('machine_authority_unavailable');
    const identity = await self.json() as { machine_id: string; workspace_id: string; user_id: string; scope: string };
    if (identity.machine_id !== result.machine_id || identity.workspace_id !== result.workspace_id
      || identity.user_id !== result.user_id || identity.scope !== enrollmentScope) throw new Error('machine_authority_mismatch');
    store.write({ installation_id: installationId, machine_id: result.machine_id, workspace_id: result.workspace_id,
      user_id: result.user_id, refresh_token: result.refresh_token, scope: result.scope });
    return { machine_id: result.machine_id, workspace_id: result.workspace_id };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (bound) listener.close();
  }
}
