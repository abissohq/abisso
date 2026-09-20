export const IPC_VERSION = 1;
export const SOCKET_NAME = 'collector.sock';
export const LOCK_NAME = 'daemon.lock';
export const MAX_REQUEST_BYTES = 1024;

export type Status = {
  version: 1;
  state: 'inactive';
  enrollment: 'unenrolled';
  collection: 'stopped';
};

export function parseRequest(value: unknown): 'status' | 'unsupported_version' | 'invalid_request' {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid_request';
  const request = value as Record<string, unknown>;
  if (Object.keys(request).length !== 2 || !Object.hasOwn(request, 'version')
    || !Object.hasOwn(request, 'command')) return 'invalid_request';
  if (!Number.isInteger(request.version)) return 'invalid_request';
  if (request.version !== IPC_VERSION) return 'unsupported_version';
  return request.command === 'status' ? 'status' : 'invalid_request';
}

export const INACTIVE_STATUS: Status = {
  version: IPC_VERSION,
  state: 'inactive',
  enrollment: 'unenrolled',
  collection: 'stopped',
};
