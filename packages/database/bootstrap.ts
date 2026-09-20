import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { transaction } from './database.ts';

export const synthetic = {
  workspace: '00000000-0000-4000-8000-000000000001',
  user: '00000000-0000-4000-8000-000000000002',
  machine: '00000000-0000-4000-8000-000000000003',
  source: '00000000-0000-4000-8000-000000000004',
  stream: '00000000-0000-4000-8000-000000000005',
  policy: 'm0-operational-v1',
};

export function credentialDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Explicit local composition only. Neither API nor worker imports this issuer.
export async function bootstrapSynthetic(db: pg.Pool, environment: string) {
  if (!['development', 'test'].includes(environment)) throw new Error('synthetic_bootstrap_forbidden');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await transaction(db, async client => {
    await client.query('INSERT INTO workspaces VALUES ($1, true) ON CONFLICT DO NOTHING', [synthetic.workspace]);
    await client.query('INSERT INTO users VALUES ($1, true) ON CONFLICT DO NOTHING', [synthetic.user]);
    await client.query('INSERT INTO memberships (user_id, workspace_id, active) VALUES ($1, $2, true) ON CONFLICT DO NOTHING', [synthetic.user, synthetic.workspace]);
    await client.query('INSERT INTO machines VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING', [synthetic.machine, synthetic.workspace, synthetic.user]);
    await client.query("INSERT INTO sources VALUES ($1, $2, $3, $4, 'abisso', 'synthetic_m0', true) ON CONFLICT DO NOTHING", [synthetic.source, synthetic.machine, synthetic.workspace, synthetic.user]);
    await client.query('INSERT INTO workspace_policies VALUES ($1, $2, true) ON CONFLICT DO NOTHING', [synthetic.workspace, synthetic.policy]);
    await client.query('INSERT INTO collection_consents VALUES ($1, $2, true) ON CONFLICT DO NOTHING', [synthetic.machine, synthetic.policy]);
    await client.query("INSERT INTO machine_configuration VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING", [synthetic.machine, synthetic.policy]);
    await client.query('UPDATE machine_credentials SET revoked = true WHERE machine_id = $1', [synthetic.machine]);
    await client.query("INSERT INTO machine_credentials (digest, machine_id, audience, expires_at) VALUES ($1, $2, 'telemetry:ingest', $3)", [credentialDigest(token), synthetic.machine, expiresAt]);
  });
  return { token, expiresAt };
}
