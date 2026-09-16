import type pg from 'pg';

export type Authority = { machine_id: string; workspace_id: string; user_id: string; policy_version: string };
export type Source = { id: string; provider: string; adapter_name: string; active: boolean };

export async function currentCredential(client: pg.PoolClient, digest: string) {
  return (await client.query<{ machine_id: string }>(
    `SELECT machine_id FROM machine_credentials WHERE digest = $1 AND NOT revoked
     AND audience = 'telemetry:ingest' AND expires_at > clock_timestamp() FOR SHARE`, [digest],
  )).rows[0];
}

export async function currentAuthority(client: pg.PoolClient, machineId: string): Promise<Authority | undefined> {
  // Serialize a machine's batches and hold current authority against revocation.
  await client.query('SELECT id FROM machines WHERE id = $1 FOR UPDATE', [machineId]);
  return (await client.query<Authority>(
    `SELECT m.id AS machine_id, m.workspace_id, m.user_id, p.version AS policy_version
     FROM machines m JOIN users u ON u.id = m.user_id
     JOIN memberships b ON b.user_id = m.user_id AND b.workspace_id = m.workspace_id
     JOIN workspaces w ON w.id = m.workspace_id JOIN workspace_policies p ON p.workspace_id = w.id
     JOIN collection_consents c ON c.machine_id = m.id JOIN machine_configuration f ON f.machine_id = m.id
     WHERE m.id = $1 AND m.active AND u.active AND b.active AND w.active AND c.active
     AND p.operational_metadata_allowed AND c.policy_version = p.version
     AND f.policy_version = p.version AND f.collection_state = 'active'
     FOR SHARE OF u, b, w, p, c, f`, [machineId],
  )).rows[0];
}

export async function registeredSources(client: pg.PoolClient, authority: Authority): Promise<Source[]> {
  return (await client.query<Source>(
    'SELECT id, provider, adapter_name, active FROM sources WHERE machine_id = $1 AND workspace_id = $2 AND user_id = $3 ORDER BY id FOR SHARE',
    [authority.machine_id, authority.workspace_id, authority.user_id],
  )).rows;
}
