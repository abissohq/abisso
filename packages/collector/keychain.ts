import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enrollmentScope } from '../contracts/enrollment.ts';

export type EnrollmentSecret = { installation_id: string; machine_id: string; workspace_id: string; user_id: string; refresh_token: string; scope: string };
export type EnrollmentStore = { read(): EnrollmentSecret | null; installationId(): string; write(value: EnrollmentSecret): void };
const helper = fileURLToPath(new URL('../../apps/collector/dist/keychain-helper', import.meta.url));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const fields = ['installation_id', 'machine_id', 'workspace_id', 'user_id', 'refresh_token', 'scope'];
function validRefreshToken(value: unknown): value is string {
  if (typeof value !== 'string' || !tokenPattern.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}
function validSecret(value: unknown): value is EnrollmentSecret {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === fields.length && fields.every(field => Object.hasOwn(record, field))
    && ['installation_id', 'machine_id', 'workspace_id', 'user_id'].every(field =>
      typeof record[field] === 'string' && uuidPattern.test(record[field]))
    && validRefreshToken(record.refresh_token)
    && record.scope === enrollmentScope;
}
function canonicalSecret(value: EnrollmentSecret): EnrollmentSecret {
  return { installation_id: value.installation_id, machine_id: value.machine_id, workspace_id: value.workspace_id,
    user_id: value.user_id, refresh_token: value.refresh_token, scope: value.scope };
}

function execute(input: { operation: string; value?: string }) {
  const result = spawnSync(helper, [], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10_000,
    maxBuffer: 4096, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME ?? '' } });
  if (result.status !== 0 || result.error) throw new Error('keychain_unavailable');
  // The helper adds one line terminator; preserve whitespace in the stored item for validation.
  return result.stdout.replace(/\n$/, '');
}

export function createKeychainStore(run = execute): EnrollmentStore { return {
  read() {
    const value = run({ operation: 'read' });
    if (value === 'absent') return null;
    const installationId = run({ operation: 'read_installation' });
    try {
      const parsed: unknown = JSON.parse(value);
      if (!validSecret(parsed) || value !== JSON.stringify(canonicalSecret(parsed))
        || parsed.installation_id !== installationId) throw new Error();
      return parsed;
    } catch { throw new Error('keychain_invalid'); }
  },
  installationId() {
    const value = run({ operation: 'installation' });
    if (!uuidPattern.test(value)) throw new Error('keychain_invalid');
    return value;
  },
  write(value) {
    if (!validSecret(value) || value.installation_id !== this.installationId()) throw new Error('keychain_invalid');
    if (this.read()) throw new Error('already_enrolled');
    if (run({ operation: 'write', value: JSON.stringify(canonicalSecret(value)) }) !== 'stored') throw new Error('keychain_unavailable');
  },
}; }
export const keychainStore = createKeychainStore();
