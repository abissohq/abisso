import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { v7 } from 'uuid';
import { RequestFailure } from '../contracts/capability.ts';
import { transaction } from '../database/database.ts';
import { authenticatedSession } from './authentication.ts';
import { enrollmentScope } from '../contracts/enrollment.ts';

const token = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const challengePattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validRedirect(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 128) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && /^\d+$/.test(url.port)
      && Number(url.port) > 0 && url.pathname === '/callback' && !url.search && !url.hash
      && url.username === '' && url.password === '';
  } catch { return false; }
}

export async function issueEnrollmentCode(db: pg.Pool, cookie: string | undefined, csrf: string, input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !['csrf', 'workspace_id', 'redirect_uri', 'challenge', 'display_name', 'scope'].includes(key))
    || !validRedirect(input.redirect_uri) || typeof input.challenge !== 'string' || !challengePattern.test(input.challenge)
    || typeof input.display_name !== 'string' || input.display_name.trim() !== input.display_name
    || input.display_name.length < 1 || input.display_name.length > 80 || /[\x00-\x1f\x7f]/.test(input.display_name)
    || input.scope !== enrollmentScope || typeof input.workspace_id !== 'string' || !uuidPattern.test(input.workspace_id)) {
    throw new RequestFailure(400, 'invalid_enrollment');
  }
  return transaction(db, async client => {
    const userId = await authenticatedSession(client, cookie, csrf);
    const membership = await client.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
      JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.workspace_id=$2
      AND m.active AND u.active AND w.active`, [userId, input.workspace_id]);
    const count = await client.query(`SELECT count(*)::integer AS n FROM memberships m JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.user_id=$1 AND m.active AND w.active`, [userId]);
    if (!membership.rowCount || count.rows[0].n !== 1) throw new RequestFailure(403, 'inactive_authority');
    const code = token();
    await client.query(`INSERT INTO machine_enrollment_codes
      (digest,user_id,workspace_id,purpose,redirect_uri,challenge,display_name,scope,expires_at)
      VALUES ($1,$2,$3,'machine-enrollment',$4,$5,$6,$7,clock_timestamp() + interval '5 minutes')`,
      [digest(code), userId, input.workspace_id, input.redirect_uri, input.challenge, input.display_name, enrollmentScope]);
    return { code, redirect_uri: input.redirect_uri as string };
  });
}

export async function redeemEnrollmentCode(db: pg.Pool, input: Record<string, unknown>, refreshHashKey: string) {
  if (Object.keys(input).some(key => !['code', 'verifier', 'redirect_uri', 'installation_id'].includes(key))
    || typeof input.code !== 'string' || !challengePattern.test(input.code)
    || typeof input.verifier !== 'string' || !challengePattern.test(input.verifier)
    || !validRedirect(input.redirect_uri) || typeof input.installation_id !== 'string'
    || !uuidPattern.test(input.installation_id) || !refreshHashKey || refreshHashKey.length < 32) {
    throw new RequestFailure(400, 'invalid_enrollment');
  }
  const actualChallenge = createHash('sha256').update(input.verifier).digest('base64url');
  const code = input.code;
  return transaction(db, async client => {
    const row = (await client.query(`SELECT user_id, workspace_id, redirect_uri, challenge, display_name, scope
      FROM machine_enrollment_codes WHERE digest=$1 AND purpose='machine-enrollment'
      AND consumed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE`, [digest(code)])).rows[0];
    if (!row || row.redirect_uri !== input.redirect_uri || row.scope !== enrollmentScope
      || !timingSafeEqual(Buffer.from(actualChallenge), Buffer.from(row.challenge))) {
      throw new RequestFailure(403, 'enrollment_invalid');
    }
    const membership = await client.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
      JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.workspace_id=$2
      AND m.active AND u.active AND w.active FOR SHARE OF m,u,w`, [row.user_id, row.workspace_id]);
    if (!membership.rowCount) throw new RequestFailure(403, 'inactive_authority');
    const machineId = v7();
    const accessToken = token();
    const refreshToken = token();
    const refreshDigest = createHmac('sha256', refreshHashKey).update(refreshToken).digest('hex');
    await client.query(`UPDATE machine_enrollment_codes SET consumed_at=clock_timestamp() WHERE digest=$1`, [digest(code)]);
    try {
      await client.query(`INSERT INTO machines (id,workspace_id,user_id,active,installation_id,display_name)
        VALUES ($1,$2,$3,true,$4,$5)`, [machineId, row.workspace_id, row.user_id, input.installation_id, row.display_name]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new RequestFailure(409, 'installation_conflict');
      throw error;
    }
    await client.query(`INSERT INTO machine_credentials (digest,machine_id,audience,expires_at)
      VALUES ($1,$2,'machine:access',clock_timestamp() + interval '15 minutes')`, [digest(accessToken), machineId]);
    await client.query(`INSERT INTO machine_refresh_credentials (digest,machine_id,expires_at)
      VALUES ($1,$2,clock_timestamp() + interval '90 days')`, [refreshDigest, machineId]);
    await client.query(`INSERT INTO machine_audit
      (workspace_id,actor_type,actor_id,action,target_machine_id,result,request_id)
      VALUES ($1,'user',$2,'machine.registered',$3,'success',$4)`, [row.workspace_id, row.user_id, machineId, v7()]);
    return { machine_id: machineId, workspace_id: row.workspace_id as string, user_id: row.user_id as string,
      scope: enrollmentScope, access_token: accessToken, expires_in: 900, refresh_token: refreshToken };
  });
}
