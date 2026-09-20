import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export type EnrollmentSecret = { installation_id: string; machine_id: string; workspace_id: string; user_id: string; refresh_token: string; scope: string };
export type EnrollmentStore = { read(): EnrollmentSecret | null; write(value: EnrollmentSecret): void };
const helper = fileURLToPath(new URL('../../apps/collector/dist/keychain-helper', import.meta.url));

function execute(input: { operation: string; value?: string }) {
  const result = spawnSync(helper, [], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10_000,
    maxBuffer: 4096, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME ?? '' } });
  if (result.status !== 0 || result.error) throw new Error('keychain_unavailable');
  return result.stdout.trim();
}

export function createKeychainStore(run = execute): EnrollmentStore { return {
  read() {
    const value = run({ operation: 'read' });
    if (value === 'absent') return null;
    try {
      const parsed = JSON.parse(value) as EnrollmentSecret;
      if (typeof parsed.refresh_token !== 'string' || typeof parsed.machine_id !== 'string') throw new Error();
      return parsed;
    } catch { throw new Error('keychain_invalid'); }
  },
  write(value) {
    if (this.read()) throw new Error('already_enrolled');
    if (run({ operation: 'write', value: JSON.stringify(value) }) !== 'stored') throw new Error('keychain_unavailable');
  },
}; }
export const keychainStore = createKeychainStore();
