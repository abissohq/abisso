import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { INACTIVE_STATUS, IPC_VERSION, MAX_REQUEST_BYTES, parseRequest, SOCKET_NAME } from '../../packages/collector/ipc.ts';
import { acquireLock, createRuntime, selectedRuntimeDirectory } from '../../packages/collector/runtime.ts';
import { createDiagnosticLog, exportDiagnostics } from '../../packages/collector/diagnostics.ts';

let diagnostics: ReturnType<typeof createDiagnosticLog> | undefined;
let diagnosticsDirectory: string | undefined;
const crash = () => {
  try { diagnostics?.record('collector_crashed'); } catch { /* Never serialize an exception. */ }
  process.stderr.write('collector_crashed\n');
  process.exit(1);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

function serve(socket: Socket): void {
  let bytes = 0;
  let body = '';
  let answered = false;
  const reply = (value: object) => {
    if (answered) return;
    answered = true;
    clearTimeout(deadline);
    socket.end(`${JSON.stringify(value)}\n`);
  };
  const deadline = setTimeout(() => reply({ version: IPC_VERSION, error: 'invalid_request' }), 3000);
  socket.once('close', () => clearTimeout(deadline));
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    if (answered) return;
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_REQUEST_BYTES) return reply({ version: IPC_VERSION, error: 'invalid_request' });
    body += chunk;
  });
  socket.on('end', () => {
    if (answered) return;
    if (!body.endsWith('\n') || body.indexOf('\n') !== body.length - 1) {
      return reply({ version: IPC_VERSION, error: 'invalid_request' });
    }
    let request: unknown;
    try { request = JSON.parse(body.slice(0, -1)); } catch {
      return reply({ version: IPC_VERSION, error: 'invalid_request' });
    }
    const command = parseRequest(request);
    if (command === 'invalid_request' || command === 'unsupported_version') {
      try { diagnostics?.record('ipc_rejected'); } catch { /* Keep IPC errors content-free. */ }
    }
    if (command === 'diagnostics_export') {
      try { return reply({ version: IPC_VERSION, diagnostics: JSON.parse(exportDiagnostics(diagnosticsDirectory!, INACTIVE_STATUS)) }); }
      catch { return reply({ version: IPC_VERSION, error: 'diagnostics_unavailable' }); }
    }
    reply(command === 'status' ? INACTIVE_STATUS : { version: IPC_VERSION, error: command });
  });
  socket.on('error', () => {});
}

let unlock: (() => void) | undefined;
let socketPath: string | undefined;
const releaseLock = () => {
  try { unlock?.(); } catch {
    try { diagnostics?.record('collector_cleanup_failed'); } catch {}
    process.stderr.write('collector_cleanup_failed\n');
    process.exitCode = 1;
  }
};
try {
  const { directory, rest } = selectedRuntimeDirectory(process.argv.slice(2));
  if (rest.length) throw new Error('invalid_arguments');
  createRuntime(directory);
  unlock = acquireLock(directory);
  diagnostics = createDiagnosticLog(directory);
  diagnosticsDirectory = directory;
  const pruning = setInterval(() => { try { diagnostics?.prune(); } catch { /* Export will fail closed on invalid logs. */ } }, 3_600_000);
  pruning.unref();
  socketPath = join(directory, SOCKET_NAME);
  const server = createServer(serve);
  const cleanup = () => {
    try { if (socketPath && lstatSync(socketPath).isSocket()) unlinkSync(socketPath); } catch {}
    releaseLock();
  };
  server.on('error', () => {
    try { diagnostics?.record('collector_start_failed'); } catch {}
    process.stderr.write('collector_start_failed\n');
    process.exitCode = 1;
    releaseLock();
  });
  server.listen(socketPath, () => {
    try {
      chmodSync(socketPath!, 0o600);
      diagnostics?.record('collector_ready');
      process.stdout.write('collector_ready\n');
    } catch {
      try { diagnostics?.record('collector_start_failed'); } catch {}
      process.stderr.write('collector_start_failed\n');
      server.close(cleanup);
      process.exitCode = 1;
    }
  });
  const shutdown = () => { clearInterval(pruning); server.close(cleanup); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch {
  releaseLock();
  try { diagnostics?.record('collector_start_failed'); } catch {}
  process.stderr.write('collector_start_failed\n');
  process.exitCode = 1;
}
