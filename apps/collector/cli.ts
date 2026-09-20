import { createConnection } from 'node:net';
import { INACTIVE_STATUS, IPC_VERSION, MAX_REQUEST_BYTES } from '../../packages/collector/ipc.ts';
import { selectedRuntimeDirectory, verifySocket } from '../../packages/collector/runtime.ts';

try {
  const selected = selectedRuntimeDirectory(process.argv.slice(2));
  const versionAt = selected.rest.indexOf('--ipc-version');
  const version = versionAt < 0 ? IPC_VERSION : Number(selected.rest[versionAt + 1]);
  const args = versionAt < 0 ? selected.rest : selected.rest.filter((_, i) => i !== versionAt && i !== versionAt + 1);
  if (args.length !== 1 || args[0] !== 'status' || !Number.isInteger(version)) throw new Error('invalid_arguments');
  const path = verifySocket(selected.directory);
  const socket = createConnection(path);
  let response = '';
  socket.setEncoding('utf8');
  socket.setTimeout(3000, () => socket.destroy(new Error('ipc_timeout')));
  socket.on('connect', () => socket.end(`${JSON.stringify({ version, command: 'status' })}\n`));
  socket.on('data', (chunk: string) => {
    response += chunk;
    if (Buffer.byteLength(response) > MAX_REQUEST_BYTES) socket.destroy(new Error('invalid_response'));
  });
  socket.on('end', () => {
    try {
      const value: unknown = JSON.parse(response);
      if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== IPC_VERSION) {
        throw new Error('invalid_response');
      }
      const fields = Object.keys(value);
      if (fields.length === 2 && fields.includes('error') && fields.includes('version')
        && ['unsupported_version', 'invalid_request'].includes((value as { error: string }).error)) {
        process.stderr.write(`${(value as { error: string }).error}\n`);
        process.exitCode = 1;
      } else if (fields.length === 4 && fields.every(field => Object.hasOwn(INACTIVE_STATUS, field))
        && (value as { state?: unknown }).state === INACTIVE_STATUS.state
        && (value as { enrollment?: unknown }).enrollment === INACTIVE_STATUS.enrollment
        && (value as { collection?: unknown }).collection === INACTIVE_STATUS.collection) {
        process.stdout.write(`${JSON.stringify(value)}\n`);
      } else {
        throw new Error('invalid_response');
      }
    } catch {
      process.stderr.write('invalid_response\n');
      process.exitCode = 1;
    }
  });
  socket.on('error', () => {
    process.stderr.write('ipc_unavailable\n');
    process.exitCode = 1;
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'cli_failed'}\n`);
  process.exitCode = 1;
}
