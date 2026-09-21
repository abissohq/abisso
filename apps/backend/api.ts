import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { beginLogin, browserSession, clerkLogin, createWorkspace, currentWorkspace, csrfCookie, logoutBrowser, sessionCookie, syntheticLogin } from '../../packages/browser/authentication.ts';
import type { BrowserIdentityVerifier } from '../../packages/browser/clerk.ts';
import { clerkBrowserScripts } from '../../packages/browser/clerk.ts';
import { authorizedWorkspace, readLive } from '../../packages/live/read.ts';
import { Realtime } from '../../packages/live/realtime.ts';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { RequestFailure } from '../../packages/contracts/capability.ts';
import { ingest } from '../../packages/ingestion/ingest.ts';
import { limits, parseCanonicalJson } from '../../packages/contracts/json.ts';
import { purgeExpiredQuarantine } from '../../packages/ingestion/quarantine-repository.ts';
import { issueEnrollmentCode, redeemEnrollmentCode } from '../../packages/browser/enrollment.ts';
import { machineSelf } from '../../packages/ingestion/machine-self.ts';
import { purgeExpiredMachineRefreshRetries, rotateMachineCredential } from '../../packages/ingestion/machine-refresh.ts';

const safeErrorCodes = new Set(['admission_limit', 'csrf_invalid', 'enrollment_invalid', 'hard_limit', 'inactive_authority', 'installation_conflict', 'internal_error', 'invalid_compressed_body', 'invalid_credentials', 'invalid_enrollment', 'invalid_form', 'invalid_identity', 'invalid_json', 'invalid_refresh', 'login_invalid', 'login_unavailable', 'malformed_wrapper', 'membership_conflict', 'not_found', 'origin_invalid', 'realtime_degraded', 'request_expired', 'unauthenticated', 'unsupported_encoding']);

async function boundedJsonObject(request: IncomingMessage, errorCode: string): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new RequestFailure(400, errorCode);
  let body = '';
  for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 2048) throw new RequestFailure(413, 'hard_limit'); }
  let input: unknown;
  try { input = JSON.parse(body); } catch { throw new RequestFailure(400, errorCode); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestFailure(400, errorCode);
  return input as Record<string, unknown>;
}

async function boundedRefreshBody(request: IncomingMessage) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new RequestFailure(400, 'invalid_refresh');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 2048) throw new RequestFailure(413, 'hard_limit');
    chunks.push(buffer);
  }
  const rawBody = Buffer.concat(chunks);
  let bodyText: string | null = null;
  try { bodyText = new TextDecoder('utf-8', { fatal: true }).decode(rawBody); }
  catch { /* Rotation decides whether malformed reuse revokes authority. */ }
  return { rawBody, bodyText };
}

function scheduleCleanup(server: Server, intervalMs: number, task: () => Promise<void>, failureCode: string) {
  const run = () => { void task().catch(() => { console.error(failureCode); }); };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  server.on('listening', run);
  server.on('close', () => clearInterval(timer));
}

export function createApi(db: pg.Pool, options: { environment?: string; origin?: string; secureCookies?: boolean; browserIdentity?: BrowserIdentityVerifier; clerkPublishableKey?: string; diagnosticLog?: (line: string) => void; refreshHashKey?: string } = {}) {
  let ingesting = 0;
  const realtime = new Realtime(db);
  const server = createServer(async (request, response) => {
    const correlationId = randomUUID();
    const started = performance.now();
    response.setHeader('x-correlation-id', correlationId);
    let admitted = false;
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      const path = new URL(request.url!, 'http://localhost');
      if (request.method === 'GET' && (request.url === '/' || request.url === '/sign-in' || path.pathname === '/enroll')) {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        const key = options.clerkPublishableKey?.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;') ?? '';
        const clerk = request.url === '/sign-in' || path.pathname === '/enroll' ? clerkBrowserScripts(options.clerkPublishableKey) : { scripts: '', origin: '' };
        const clerkOrigin = clerk.origin ? ` ${clerk.origin}` : '';
        response.setHeader('content-security-policy', `default-src 'self'; script-src 'self'${clerkOrigin}; connect-src 'self'${clerkOrigin}; frame-src${clerkOrigin || " 'none'"}; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'`);
        response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abisso Live</title></head><body data-clerk-key="${key}" data-local-login="${['development', 'test'].includes(options.environment ?? '')}"><div id="root"></div>${clerk.scripts}<script src="/assets/live.js" defer></script></body></html>`);
        return;
      }
      if (request.method === 'GET' && request.url === '/assets/live.js') {
        response.setHeader('content-type', 'text/javascript; charset=utf-8');
        response.end(await readFile(new URL('../web/dist/live.js', import.meta.url)));
        return;
      }
      if (request.method === 'GET' && path.pathname === '/v1/browser/session' && !path.search) {
        const csrfValue = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('abisso_csrf='));
        const existing = await browserSession(db, request.headers.cookie, csrfValue);
        const issued = existing ? null : await beginLogin(db);
        if (issued) response.setHeader('set-cookie', [sessionCookie(issued.token, options.secureCookies ?? false, 900), csrfCookie(issued.csrf, options.secureCookies ?? false)]);
        const workspace = existing?.user_id ? await currentWorkspace(db, existing.user_id) : undefined;
        response.end(JSON.stringify({ authenticated: Boolean(existing?.user_id), workspace_id: workspace?.workspace_id ?? null, role: workspace?.role ?? null, csrf: (existing ?? issued)!.csrf }));
        return;
      }
      if (request.method === 'POST' && path.pathname === '/v1/machines/enrollment-codes' && !path.search) {
        const origin = options.origin ?? `http://${request.headers.host}`;
        if (request.headers.origin !== origin || request.headers.host !== new URL(origin).host) throw new RequestFailure(403, 'origin_invalid');
        const fields = await boundedJsonObject(request, 'invalid_form');
        if (typeof fields.csrf !== 'string') throw new RequestFailure(403, 'csrf_invalid');
        const issued = await issueEnrollmentCode(db, request.headers.cookie, fields.csrf, fields);
        response.writeHead(201).end(JSON.stringify(issued));
        return;
      }
      if (request.method === 'POST' && path.pathname === '/v1/machines/enrollment-exchanges' && !path.search) {
        // The collector exchanges directly with the HTTPS API. Browser cookies and origins are not authority here.
        if (request.headers.cookie || request.headers.origin) throw new RequestFailure(403, 'enrollment_invalid');
        const input = await boundedJsonObject(request, 'invalid_enrollment');
        if (!options.refreshHashKey) throw new RequestFailure(503, 'internal_error');
        const result = await redeemEnrollmentCode(db, input, options.refreshHashKey);
        response.end(JSON.stringify(result));
        return;
      }
      if (request.method === 'POST' && path.pathname === '/v1/machines/refresh' && !path.search) {
        if (request.headers.cookie || request.headers.origin) throw new RequestFailure(403, 'invalid_refresh');
        const body = await boundedRefreshBody(request);
        if (!options.refreshHashKey) throw new RequestFailure(503, 'internal_error');
        response.end(JSON.stringify(await rotateMachineCredential(db, request.headers.authorization,
          body.rawBody, body.bodyText, options.refreshHashKey, correlationId)));
        return;
      }
      if (request.method === 'GET' && path.pathname === '/v1/machines/self' && !path.search) {
        response.end(JSON.stringify(await machineSelf(db, request.headers.authorization)));
        return;
      }
      if (request.method === 'POST' && ['/v1/browser/login', '/v1/browser/logout', '/v1/workspaces'].includes(path.pathname) && !path.search) {
        const origin = options.origin ?? `http://${request.headers.host}`;
        if (request.headers.origin !== origin || request.headers.host !== new URL(origin).host) throw new RequestFailure(403, 'origin_invalid');
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new RequestFailure(400, 'invalid_form');
        let body = '';
        for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 10_240) throw new RequestFailure(413, 'hard_limit'); }
        let input: unknown;
        try { input = JSON.parse(body); } catch { throw new RequestFailure(400, 'invalid_form'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestFailure(400, 'invalid_form');
        const fields = input as Record<string, unknown>;
        if (typeof fields.csrf !== 'string') throw new RequestFailure(403, 'csrf_invalid');
        if (path.pathname === '/v1/browser/login') {
          if (!options.browserIdentity) throw new RequestFailure(503, 'login_unavailable');
          if (typeof fields.token !== 'string' || fields.token.length > 8192) throw new RequestFailure(401, 'invalid_identity');
          // Validate the Abisso session and CSRF before asking the identity provider to verify a token.
          const preSession = await browserSession(db, request.headers.cookie, request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('abisso_csrf=')));
          if (!preSession || preSession.csrf !== fields.csrf) throw new RequestFailure(403, 'csrf_invalid');
          const identity = await options.browserIdentity(fields.token);
          const login = await clerkLogin(db, request.headers.cookie, fields.csrf, identity.subject);
          response.setHeader('set-cookie', [sessionCookie(login.token, options.secureCookies ?? false), csrfCookie(login.csrf, options.secureCookies ?? false)]);
          response.end(JSON.stringify({ authenticated: true, workspace_id: (await currentWorkspace(db, login.user_id))?.workspace_id ?? null, csrf: login.csrf }));
        } else if (path.pathname === '/v1/browser/logout') {
          const anonymous = await logoutBrowser(db, request.headers.cookie, fields.csrf);
          response.setHeader('set-cookie', [sessionCookie(anonymous.token, options.secureCookies ?? false, 900), csrfCookie(anonymous.csrf, options.secureCookies ?? false)]);
          response.end(JSON.stringify({ authenticated: false, workspace_id: null, csrf: anonymous.csrf }));
        } else {
          const workspace = await createWorkspace(db, request.headers.cookie, fields.csrf);
          response.writeHead(201).end(JSON.stringify({ workspace_id: workspace }));
        }
        return;
      }
      if (request.method === 'GET' && path.pathname === '/v1/live') {
        response.end(JSON.stringify(await readLive(db, request.headers.cookie, path.searchParams.get('workspace_id'))));
        return;
      }
      if (request.method === 'GET' && path.pathname === '/v1/live/events') {
        const origin = options.origin ?? `http://${request.headers.host}`;
        if (request.headers.host !== new URL(origin).host ||
          (request.headers.origin === undefined
            ? request.headers['sec-fetch-site'] !== 'same-origin'
            : request.headers.origin !== origin)) throw new RequestFailure(403, 'origin_invalid');
        const workspace = await authorizedWorkspace(db, request.headers.cookie, path.searchParams.get('workspace_id'));
        if (!realtime.ready) throw new RequestFailure(503, 'realtime_degraded');
        response.setHeader('content-type', 'text/event-stream; charset=utf-8');
        response.setHeader('connection', 'keep-alive');
        response.flushHeaders();
        if (!realtime.subscribe(response, workspace, () => authorizedWorkspace(db, request.headers.cookie, workspace))) response.end();
        const check = setInterval(() => {
          void authorizedWorkspace(db, request.headers.cookie, workspace).then(() => {
            if (!response.destroyed) response.write(': keepalive\n\n');
          }).catch(() => response.end());
        }, 15_000);
        check.unref();
        response.on('close', () => clearInterval(check));
        return;
      }
      if (['development', 'test'].includes(options.environment ?? '') && path.pathname.startsWith('/dev/login') && !path.search) {
        if (request.method === 'GET' && path.pathname === '/dev/login') {
          const login = await beginLogin(db);
          response.setHeader('set-cookie', sessionCookie(login.token, options.secureCookies ?? false, 900));
          response.setHeader('content-type', 'text/html; charset=utf-8');
          response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Abisso local sign in</title></head><body><form id="login" method="post" action="/dev/login/code"><input type="hidden" name="csrf" value="${login.csrf}"><button>Issue local login code</button></form><p id="login-error" role="alert"></p><script src="/assets/live.js" defer></script></body></html>`);
          return;
        }
        if (request.method === 'POST' && ['/dev/login/code', '/dev/login/exchange'].includes(path.pathname)) {
          const origin = options.origin ?? `http://${request.headers.host}`;
          if (request.headers.origin !== origin) throw new RequestFailure(403, 'origin_invalid');
          if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') throw new RequestFailure(400, 'invalid_form');
          let body = '';
          for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 1024) throw new RequestFailure(413, 'hard_limit'); }
          const form = new URLSearchParams(body);
          const result = await syntheticLogin(db, request.headers.cookie, form.get('csrf') ?? '', path.pathname.endsWith('/exchange') ? form.get('code') ?? '' : undefined);
          if ('token' in result && result.token) response.setHeader('set-cookie', sessionCookie(result.token, options.secureCookies ?? false));
          if (request.headers.accept?.includes('text/html')) {
            if ('code' in result) {
              response.setHeader('content-type', 'text/html; charset=utf-8');
              response.end(`<form method="post" action="/dev/login/exchange"><input type="hidden" name="csrf" value="${(form.get('csrf') ?? '').replaceAll('&', '&amp;').replaceAll('\"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}"><input type="hidden" name="code" value="${result.code}"><button>Sign in to synthetic workspace</button></form>`);
            } else response.writeHead(303, { location: '/' }).end();
            return;
          }
          response.end(JSON.stringify('code' in result ? { code: result.code } : { csrf: result.csrf }));
          return;
        }
      }

      if (request.method !== 'POST' || request.url !== '/v1/telemetry/batches') throw new RequestFailure(404, 'not_found');
      // Bound work before buffering input; no unbounded per-IP identity map.
      if (ingesting >= 8) {
        request.resume();
        throw new RequestFailure(429, 'admission_limit');
      }
      ingesting++;
      admitted = true;
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new RequestFailure(400, 'malformed_wrapper');
      const encoding = request.headers['content-encoding'];
      if (encoding && encoding !== 'identity' && encoding !== 'gzip') throw new RequestFailure(400, 'unsupported_encoding');
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > limits.wireBytes) throw new RequestFailure(413, 'hard_limit');
        chunks.push(chunk);
      }
      let buffer = Buffer.concat(chunks);
      if (encoding === 'gzip') {
        try { buffer = gunzipSync(buffer, { maxOutputLength: limits.decodedBytes }); }
        catch { throw new RequestFailure(413, 'invalid_compressed_body'); }
      }
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { throw new RequestFailure(400, 'invalid_json'); }
      const body = parseCanonicalJson(text);
      const result = await ingest(db, request.headers.authorization, body, { environment: options.environment });
      response.writeHead(result.status).end(result.body);
    } catch (error) {
      const failure = error instanceof RequestFailure ? error : new RequestFailure(500, 'internal_error');
      const code = safeErrorCodes.has(failure.code) ? failure.code : 'internal_error';
      const line = JSON.stringify({ code, correlation_id: correlationId, status: failure.status, duration_ms: Math.min(60_000, Math.floor((performance.now() - started) / 100) * 100) });
      try { (options.diagnosticLog ?? console.error)(line); } catch { /* Logging must not change the response. */ }
      response.writeHead(failure.status).end(JSON.stringify({ error: code }));
    } finally {
      if (admitted) ingesting--;
    }
  });
  server.requestTimeout = 10_000;
  const close = server.close.bind(server);
  server.close = callback => {
    // SSE responses are long-lived; end them before waiting for HTTP close.
    void realtime.stop();
    return close(callback);
  };
  server.on('listening', () => realtime.start());
  server.on('close', () => { void realtime.stop(); });
  scheduleCleanup(server, 30_000,
    () => purgeExpiredMachineRefreshRetries(db), 'machine_refresh_cleanup_failed');
  if (['development', 'test'].includes(options.environment ?? '')) {
    scheduleCleanup(server, 60_000, () => purgeExpiredQuarantine(db), 'quarantine_cleanup_failed');
  }
  return server;
}
