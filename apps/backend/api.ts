import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { RequestFailure } from '../../packages/contracts/capability.ts';
import { ingest } from '../../packages/ingestion/ingest.ts';
import { limits, parseCanonicalJson } from '../../packages/contracts/json.ts';

export function createApi(db: pg.Pool) {
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    try {
      if (request.method !== 'POST' || request.url !== '/v1/telemetry/batches') throw new RequestFailure(404, 'not_found');
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
      const result = await ingest(db, request.headers.authorization, body);
      response.writeHead(result.status).end(result.body);
    } catch (error) {
      const failure = error instanceof RequestFailure ? error : new RequestFailure(500, 'internal_error');
      response.writeHead(failure.status).end(JSON.stringify({ error: failure.code }));
    }
  });
  server.requestTimeout = 10_000;
  return server;
}
