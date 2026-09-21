import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import type pg from 'pg';
import { RequestFailure } from '../contracts/capability.ts';
import { transaction } from '../database/database.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const retryWindowMs = 30_000;
const accessLifetimeMs = 15 * 60_000;
const refreshLifetimeMs = 90 * 24 * 60 * 60_000;

type RefreshRequest = { installation_id: string; generation: number; request_id: string };

function keyedDigest(refreshHashKey: string, value: string) {
  return createHmac('sha256', refreshHashKey).update(value).digest('hex');
}

function keyedReuseMarker(refreshHashKey: string, value: string) {
  return createHmac('sha256', refreshHashKey)
    .update('abisso.machine-refresh.reuse-marker.v1\0').update(value).digest('hex');
}

function requestDigest(input: Record<string, unknown>) {
  return createHash('sha256').update(canonicalize(input)!).digest('hex');
}

function successor(refreshHashKey: string, predecessor: string, input: RefreshRequest, canonicalRequestDigest: string) {
  const fields = [predecessor, input.installation_id, String(input.generation), input.request_id, canonicalRequestDigest];
  const hmac = createHmac('sha256', refreshHashKey).update('abisso.machine-refresh.successor.v1\0');
  for (const field of fields) hmac.update(String(Buffer.byteLength(field))).update(':').update(field).update('\0');
  return hmac.digest('base64url');
}

function parseRequest(input: Record<string, unknown>): RefreshRequest {
  if (Object.keys(input).some(key => !['installation_id', 'generation', 'request_id'].includes(key))
    || typeof input.installation_id !== 'string' || !uuidPattern.test(input.installation_id)
    || typeof input.request_id !== 'string' || !uuidPattern.test(input.request_id)
    || typeof input.generation !== 'number' || !Number.isSafeInteger(input.generation) || input.generation < 0) {
    throw new RequestFailure(400, 'invalid_refresh');
  }
  return input as RefreshRequest;
}

export async function rotateMachineCredential(db: pg.Pool, authorization: string | undefined,
  rawInput: Record<string, unknown>, refreshHashKey: string, now = new Date()) {
  const predecessor = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
  if (refreshHashKey.length < 32) throw new RequestFailure(503, 'internal_error');
  if (!predecessor) throw new RequestFailure(401, 'invalid_credentials');
  const canonicalRequestDigest = requestDigest(rawInput);
  const result = await transaction(db, async client => {
    await client.query(`DELETE FROM machine_refresh_credentials
      WHERE consumed_at IS NOT NULL AND retry_expires_at < $1`, [now]);
    let refreshCredential = (await client.query(`SELECT * FROM machine_refresh_credentials
      WHERE digest=$1 FOR UPDATE`,
    [keyedDigest(refreshHashKey, predecessor)])).rows[0];
    let lateReuse = false;
    if (!refreshCredential) {
      refreshCredential = (await client.query(`SELECT * FROM machine_refresh_reuse_markers WHERE marker=$1`,
      [keyedReuseMarker(refreshHashKey, predecessor)])).rows[0];
      if (!refreshCredential) throw new RequestFailure(401, 'invalid_credentials');
      lateReuse = true;
    }
    const authority = (await client.query(`SELECT m.installation_id, m.workspace_id, m.active AS machine_active,
        u.active AS user_active, b.active AS membership_active, w.active AS workspace_active
      FROM machines m JOIN users u ON u.id=m.user_id
      JOIN memberships b ON b.user_id=m.user_id AND b.workspace_id=m.workspace_id
      JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=$1 FOR UPDATE OF m`,
    [refreshCredential.machine_id])).rows[0];
    if (!authority) throw new RequestFailure(401, 'invalid_credentials');
    refreshCredential = { ...refreshCredential, ...authority };

    const enforceRevocation = async () => {
      await client.query('UPDATE machine_refresh_credentials SET revoked=true WHERE family_id=$1', [refreshCredential.family_id]);
      await client.query('UPDATE machine_credentials SET revoked=true WHERE machine_id=$1', [refreshCredential.machine_id]);
      return { failure: true as const };
    };
    const revoke = async (reason: 'credential_expired' | 'credential_reuse' | 'inactive_authority', presentedRequestId: string | null) => {
      await enforceRevocation();
      await client.query(`INSERT INTO machine_credential_audit
        (workspace_id,machine_id,action,reason,audit_id,presented_request_id,generation,recorded_at)
        VALUES ($1,$2,'machine.refresh_family_revoked',$3,$4,$5,$6,$7)`,
      [refreshCredential.workspace_id, refreshCredential.machine_id, reason, randomUUID(),
        presentedRequestId, refreshCredential.generation, now]);
      await client.query(`DELETE FROM machine_refresh_credentials WHERE family_id=$1 AND consumed_at IS NOT NULL
        AND retry_expires_at < $2`, [refreshCredential.family_id, now]);
      return { failure: true as const };
    };

    if (lateReuse) {
      const presentedRequestId = typeof rawInput.request_id === 'string' && uuidPattern.test(rawInput.request_id)
        ? rawInput.request_id : null;
      return revoke('credential_reuse', presentedRequestId);
    }
    if (refreshCredential.revoked) return enforceRevocation();
    let input: RefreshRequest;
    try { input = parseRequest(rawInput); }
    catch (error) {
      if (refreshCredential.consumed_at !== null) {
        const presentedRequestId = typeof rawInput.request_id === 'string' && uuidPattern.test(rawInput.request_id)
          ? rawInput.request_id : null;
        return revoke('credential_reuse', presentedRequestId);
      }
      throw error;
    }
    if (!refreshCredential.machine_active || !refreshCredential.user_active
      || !refreshCredential.membership_active || !refreshCredential.workspace_active) {
      return revoke('inactive_authority', input.request_id);
    }

    const exactRetry = refreshCredential.consumed_at !== null
      && refreshCredential.retry_installation_id === input.installation_id
      && Number(refreshCredential.generation) === input.generation
      && refreshCredential.retry_request_id === input.request_id
      && refreshCredential.retry_request_digest === canonicalRequestDigest
      && now.getTime() <= new Date(refreshCredential.retry_expires_at).getTime();
    if (refreshCredential.consumed_at !== null) {
      if (!exactRetry) return revoke('credential_reuse', input.request_id);
    } else {
      if (new Date(refreshCredential.expires_at).getTime() <= now.getTime()) {
        return revoke('credential_expired', input.request_id);
      }
      if (refreshCredential.installation_id !== input.installation_id
        || Number(refreshCredential.generation) !== input.generation) {
        return revoke('credential_reuse', input.request_id);
      }
    }

    const refreshToken = successor(refreshHashKey, predecessor, input, canonicalRequestDigest);
    const refreshDigest = keyedDigest(refreshHashKey, refreshToken);
    if (!exactRetry) {
      const retryExpiresAt = new Date(now.getTime() + retryWindowMs);
      await client.query(`UPDATE machine_refresh_credentials SET consumed_at=$2,retry_expires_at=$3,
        retry_installation_id=$4,retry_request_id=$5,retry_request_digest=$6 WHERE digest=$1`,
      [refreshCredential.digest, now, retryExpiresAt, input.installation_id, input.request_id, canonicalRequestDigest]);
      await client.query(`INSERT INTO machine_refresh_reuse_markers (marker,family_id,machine_id,generation)
        VALUES ($1,$2,$3,$4)`,
      [keyedReuseMarker(refreshHashKey, predecessor), refreshCredential.family_id,
        refreshCredential.machine_id, input.generation]);
      await client.query(`INSERT INTO machine_refresh_credentials
        (digest,machine_id,expires_at,family_id,generation) VALUES ($1,$2,$3,$4,$5)`,
      [refreshDigest, refreshCredential.machine_id, new Date(now.getTime() + refreshLifetimeMs), refreshCredential.family_id, input.generation + 1]);
      await client.query(`INSERT INTO machine_credential_audit
        (workspace_id,machine_id,action,reason,audit_id,presented_request_id,generation,recorded_at)
        VALUES ($1,$2,'machine.refresh_rotated','authorized_refresh',$3,$4,$5,$6)`,
      [refreshCredential.workspace_id, refreshCredential.machine_id, randomUUID(),
        input.request_id, input.generation + 1, now]);
    }

    await client.query(`DELETE FROM machine_refresh_credentials WHERE family_id=$1 AND consumed_at IS NOT NULL
      AND retry_expires_at < $2 AND digest<>$3`, [refreshCredential.family_id, now, refreshCredential.digest]);

    const accessToken = randomBytes(32).toString('base64url');
    await client.query(`INSERT INTO machine_credentials (digest,machine_id,audience,expires_at)
      VALUES ($1,$2,'machine:access',$3)`,
    [createHash('sha256').update(accessToken).digest('hex'), refreshCredential.machine_id, new Date(now.getTime() + accessLifetimeMs)]);
    return { access_token: accessToken, expires_in: 900, refresh_token: refreshToken,
      generation: input.generation + 1, scope: 'telemetry:write machine:self' };
  });
  if ('failure' in result) throw new RequestFailure(401, 'invalid_credentials');
  return result;
}

export async function purgeExpiredMachineRefreshRetries(db: pg.Pool, now = new Date()) {
  await db.query(`DELETE FROM machine_refresh_credentials
    WHERE consumed_at IS NOT NULL AND retry_expires_at < $1`, [now]);
}
