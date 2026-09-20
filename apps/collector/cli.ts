import { createConnection } from 'node:net';
import { INACTIVE_STATUS, IPC_VERSION, MAX_REQUEST_BYTES } from '../../packages/collector/ipc.ts';
import { selectedRuntimeDirectory, verifySocket } from '../../packages/collector/runtime.ts';
import { MAX_DIAGNOSTIC_EXPORT_BYTES, scanDiagnostics } from '../../packages/collector/diagnostics.ts';
import { spawnSync } from 'node:child_process';
import { enrollMachine } from '../../packages/collector/enrollment.ts';
import { keychainStore } from '../../packages/collector/keychain.ts';

if (process.argv[2] === 'enroll') {
  try {
    if (process.argv.length !== 4) throw new Error('invalid_arguments');
    await enrollMachine(process.argv[3], keychainStore, url => {
      const opened = spawnSync('/usr/bin/open', [url], { stdio: 'ignore' });
      if (opened.status !== 0) throw new Error('browser_unavailable');
    });
    process.stdout.write('enrolled\n');
  } catch {
    process.stderr.write('enrollment_failed\n');
    process.exitCode = 1;
  }
} else {
try {
  const selected = selectedRuntimeDirectory(process.argv.slice(2));
  const versionAt = selected.rest.indexOf('--ipc-version');
  const version = versionAt < 0 ? IPC_VERSION : Number(selected.rest[versionAt + 1]);
  const args = versionAt < 0 ? selected.rest : selected.rest.filter((_, i) => i !== versionAt && i !== versionAt + 1);
  const command = args.length === 1 && args[0] === 'status' ? 'status'
    : args.length === 2 && args[0] === 'diagnostics' && args[1] === 'export' ? 'diagnostics_export' : undefined;
  if (!command || !Number.isInteger(version)) throw new Error('invalid_arguments');
  const path = verifySocket(selected.directory);
  const socket = createConnection(path);
  let response = '';
  socket.setEncoding('utf8');
  socket.setTimeout(3000, () => socket.destroy(new Error('ipc_timeout')));
  socket.on('connect', () => socket.end(`${JSON.stringify({ version, command })}\n`));
  socket.on('data', (chunk: string) => {
    response += chunk;
    if (Buffer.byteLength(response) > (command === 'diagnostics_export' ? MAX_DIAGNOSTIC_EXPORT_BYTES + 1024 : MAX_REQUEST_BYTES)) socket.destroy(new Error('invalid_response'));
  });
  socket.on('end', () => {
    try {
      const value: unknown = JSON.parse(response);
      if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== IPC_VERSION) {
        throw new Error('invalid_response');
      }
      const fields = Object.keys(value);
      if (fields.length === 2 && fields.includes('error') && fields.includes('version')
        && ['unsupported_version', 'invalid_request', 'diagnostics_unavailable'].includes((value as { error: string }).error)) {
        process.stderr.write(`${(value as { error: string }).error}\n`);
        process.exitCode = 1;
      } else if (command === 'diagnostics_export' && fields.length === 2 && fields.includes('diagnostics')
        && fields.includes('version') && (value as { diagnostics?: unknown }).diagnostics
        && typeof (value as { diagnostics?: unknown }).diagnostics === 'object') {
        const content = JSON.stringify((value as { diagnostics: unknown }).diagnostics);
        if (!scanDiagnostics(content)) throw new Error('invalid_response');
        process.stdout.write(`${content}\n`);
      } else if (command === 'status' && fields.length === 4 && fields.every(field => Object.hasOwn(INACTIVE_STATUS, field))
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
} catch {
  process.stderr.write('cli_failed\n');
  process.exitCode = 1;
}
}
