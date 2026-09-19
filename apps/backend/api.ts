import { readFile } from 'node:fs/promises';
import { beginLogin, syntheticLogin, sessionCookie } from '../../packages/browser/authentication.ts';
import { authorizedWorkspace, readLive } from '../../packages/live/read.ts';
import { Realtime } from '../../packages/live/realtime.ts';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { RequestFailure } from '../../packages/contracts/capability.ts';
import { ingest } from '../../packages/ingestion/ingest.ts';
import { limits, parseCanonicalJson } from '../../packages/contracts/json.ts';
import { purgeExpiredQuarantine } from '../../packages/ingestion/quarantine-repository.ts';

export function createApi(db: pg.Pool, options: { environment?: string; origin?: string; secureCookies?: boolean } = {}) {
  let ingesting = 0;
  const realtime = new Realtime(db);
  const server = createServer(async (request, response) => {
    let admitted = false;
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      const path = new URL(request.url!, 'http://localhost');
      if (request.method === 'GET' && request.url === '/') {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abisso Live</title></head><body><div id="root"></div><script src="/assets/live.js" defer></script></body></html>');
        return;
      }
      if (request.method === 'GET' && request.url === '/assets/live.js') {
        response.setHeader('content-type', 'text/javascript; charset=utf-8');
        response.end(await readFile(new URL('../web/dist/live.js', import.meta.url)));
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
      response.writeHead(failure.status).end(JSON.stringify({ error: failure.code }));
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
  if (['development', 'test'].includes(options.environment ?? '')) {
    const purge = () => { void purgeExpiredQuarantine(db).catch(() => { console.error('quarantine_cleanup_failed'); }); };
    const cleanup = setInterval(purge, 60_000);
    cleanup.unref();
    server.on('listening', purge);
    server.on('close', () => clearInterval(cleanup));
  }
  return server;
}
