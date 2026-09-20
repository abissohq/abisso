import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { INACTIVE_STATUS, IPC_VERSION, MAX_REQUEST_BYTES, parseRequest, SOCKET_NAME } from '../../packages/collector/ipc.ts';
import { acquireLock, createRuntime, selectedRuntimeDirectory } from '../../packages/collector/runtime.ts';

function serve(socket: Socket): void {
  let bytes = 0;
  let body = '';
  let answered = false;
  const reply = (value: object) => {
    if (answered) return;
    answered = true;
    socket.end(`${JSON.stringify(value)}\n`);
  };
  socket.setEncoding('utf8');
  socket.setTimeout(3000, () => reply({ version: IPC_VERSION, error: 'invalid_request' }));
  socket.on('data', (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_REQUEST_BYTES) return reply({ version: IPC_VERSION, error: 'invalid_request' });
    body += chunk;
    const newline = body.indexOf('\n');
    if (newline < 0) return;
    if (newline !== body.length - 1) return reply({ version: IPC_VERSION, error: 'invalid_request' });
    let request: unknown;
    try { request = JSON.parse(body.slice(0, -1)); } catch {
      return reply({ version: IPC_VERSION, error: 'invalid_request' });
    }
    const command = parseRequest(request);
    reply(command === 'status' ? INACTIVE_STATUS : { version: IPC_VERSION, error: command });
  });
  socket.on('end', () => {
    if (!answered) reply({ version: IPC_VERSION, error: 'invalid_request' });
  });
  socket.on('error', () => {});
}

let unlock: (() => void) | undefined;
let socketPath: string | undefined;
try {
  const { directory, rest } = selectedRuntimeDirectory(process.argv.slice(2));
  if (rest.length) throw new Error('invalid_arguments');
  createRuntime(directory);
  unlock = acquireLock(directory);
  socketPath = join(directory, SOCKET_NAME);
  const server = createServer(serve);
  server.on('error', () => {
    process.stderr.write('collector_start_failed\n');
    process.exitCode = 1;
    unlock?.();
  });
  server.listen(socketPath, () => {
    chmodSync(socketPath!, 0o600);
    process.stdout.write('collector_ready\n');
  });
  const shutdown = () => server.close(() => {
    try { if (socketPath && lstatSync(socketPath).isSocket()) unlinkSync(socketPath); } catch {}
    unlock?.();
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  unlock?.();
  process.stderr.write(`${error instanceof Error ? error.message : 'collector_start_failed'}\n`);
  process.exitCode = 1;
}
