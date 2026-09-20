import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { credentialDigest, synthetic } from '../database/bootstrap.ts';
import { transaction } from '../database/database.ts';
import { RequestFailure } from '../contracts/capability.ts';
import { v7 } from 'uuid';

const random = () => randomBytes(32).toString('base64url');
export type BrowserSession = { user_id: string | null; csrf: string };
export function sessionDigest(cookie: string | undefined) {
  const token = cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('abisso_session='))?.slice('abisso_session='.length);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RequestFailure(401, 'unauthenticated');
  return credentialDigest(token);
}
export function sessionCookie(token: string, secure: boolean, maxAge = 3600) {
  return `abisso_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export async function browserSession(db: pg.Pool, cookie: string | undefined, csrfCookie: string | undefined) {
  let digest: string;
  try { digest = sessionDigest(cookie); } catch { digest = ''; }
  const csrf = /^abisso_csrf=([A-Za-z0-9_-]{43})$/.exec(csrfCookie ?? '')?.[1];
  if (digest) {
    const row = (await db.query(`SELECT user_id, csrf_digest FROM browser_sessions WHERE digest=$1
      AND expires_at > clock_timestamp() AND last_seen_at > clock_timestamp() - interval '15 minutes'
      AND (user_id IS NULL OR EXISTS (SELECT 1 FROM users WHERE id=browser_sessions.user_id AND active))`, [digest])).rows[0];
    if (row && csrf && row.csrf_digest === credentialDigest(csrf)) return { user_id: row.user_id as string | null, csrf };
  }
  return null;
}
export function csrfCookie(token: string, secure: boolean) {
  return `abisso_csrf=${token}; Path=/; SameSite=Lax; Max-Age=3600${secure ? '; Secure' : ''}`;
}
export async function authenticatedSession(client: pg.PoolClient, cookie: string | undefined, csrf: string) {
  const digest = sessionDigest(cookie);
  const row = (await client.query(`SELECT user_id FROM browser_sessions WHERE digest=$1 AND csrf_digest=$2
    AND user_id IS NOT NULL AND expires_at > clock_timestamp() AND last_seen_at > clock_timestamp() - interval '15 minutes' FOR UPDATE`,
    [digest, credentialDigest(csrf)])).rows[0];
  if (!row) throw new RequestFailure(403, 'csrf_invalid');
  return row.user_id as string;
}
export async function clerkLogin(db: pg.Pool, cookie: string | undefined, csrf: string, subject: string) {
  if (!/^user_[A-Za-z0-9]+$/.test(subject) || subject.length > 255) throw new RequestFailure(401, 'invalid_identity');
  return transaction(db, async client => {
    const digest = sessionDigest(cookie);
    const session = (await client.query(`SELECT 1 FROM browser_sessions WHERE digest=$1 AND csrf_digest=$2
      AND expires_at > clock_timestamp() AND last_seen_at > clock_timestamp() - interval '15 minutes' FOR UPDATE`,
      [digest, credentialDigest(csrf)])).rows[0];
    if (!session) throw new RequestFailure(403, 'csrf_invalid');
    let identity = (await client.query("SELECT u.id FROM browser_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='clerk' AND i.subject=$1 AND u.active", [subject])).rows[0];
    if (!identity) {
      const candidate = v7();
      await client.query('INSERT INTO users (id,active) VALUES ($1,true)', [candidate]);
      const inserted = await client.query("INSERT INTO browser_identities (user_id,provider,subject) VALUES ($1,'clerk',$2) ON CONFLICT (provider,subject) DO NOTHING RETURNING user_id", [candidate, subject]);
      if (!inserted.rowCount) {
        await client.query('DELETE FROM users WHERE id=$1', [candidate]);
        identity = (await client.query("SELECT u.id FROM browser_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='clerk' AND i.subject=$1 AND u.active", [subject])).rows[0];
      } else identity = { id: candidate };
    }
    if (!identity) throw new RequestFailure(403, 'inactive_authority');
    const token = random();
    const nextCsrf = random();
    await client.query("INSERT INTO browser_sessions (digest,user_id,csrf_digest,expires_at) VALUES ($1,$2,$3,clock_timestamp() + interval '1 hour')", [credentialDigest(token), identity.id, credentialDigest(nextCsrf)]);
    await client.query('UPDATE browser_sessions SET expires_at=clock_timestamp() WHERE digest=$1', [digest]);
    return { token, csrf: nextCsrf, user_id: identity.id as string };
  });
}
export async function createWorkspace(db: pg.Pool, cookie: string | undefined, csrf: string) {
  return transaction(db, async client => {
    const userId = await authenticatedSession(client, cookie, csrf);
    const user = (await client.query('SELECT id FROM users WHERE id=$1 AND active FOR UPDATE', [userId])).rows[0];
    if (!user) throw new RequestFailure(403, 'inactive_authority');
    const existing = (await client.query('SELECT workspace_id FROM memberships WHERE user_id=$1 AND active', [userId])).rows[0];
    if (existing) throw new RequestFailure(409, 'membership_conflict');
    const workspace = v7();
    await client.query('INSERT INTO workspaces (id,active) VALUES ($1,true)', [workspace]);
    await client.query("INSERT INTO memberships (user_id,workspace_id,active,role) VALUES ($1,$2,true,'owner')", [userId, workspace]);
    return workspace;
  });
}
export async function logoutBrowser(db: pg.Pool, cookie: string | undefined, csrf: string) {
  await transaction(db, async client => {
    await authenticatedSession(client, cookie, csrf);
    await client.query('UPDATE browser_sessions SET expires_at=clock_timestamp() WHERE digest=$1', [sessionDigest(cookie)]);
  });
  return beginLogin(db);
}
export async function currentWorkspace(db: pg.Pool, userId: string) {
  const result = await db.query(`SELECT m.workspace_id, m.role FROM memberships m JOIN users u ON u.id=m.user_id
    JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.active AND u.active AND w.active`, [userId]);
  return result.rows[0] as { workspace_id: string; role: string } | undefined;
}
export async function beginLogin(db: pg.Pool) {
  const token = random();
  const csrf = random();
  await db.query("INSERT INTO browser_sessions (digest, csrf_digest, expires_at) VALUES ($1,$2,clock_timestamp() + interval '15 minutes')", [credentialDigest(token), credentialDigest(csrf)]);
  return { token, csrf };
}
export async function syntheticLogin(db: pg.Pool, cookie: string | undefined, csrf: string, code?: string) {
  return transaction(db, async client => {
    const digest = sessionDigest(cookie);
    const session = (await client.query(`SELECT * FROM browser_sessions WHERE digest=$1 AND csrf_digest=$2
      AND expires_at > clock_timestamp() AND last_seen_at > clock_timestamp() - interval '15 minutes' FOR UPDATE`, [digest, credentialDigest(csrf)])).rows[0];
    if (!session) throw new RequestFailure(403, 'csrf_invalid');
    if (code === undefined) {
      const issued = random();
      await client.query("INSERT INTO browser_login_codes (digest,user_id,purpose,session_digest,expires_at) VALUES ($1,$2,'browser-login',$3,clock_timestamp() + interval '2 minutes')", [credentialDigest(issued), synthetic.user, digest]);
      return { code: issued };
    }
    const binding = (await client.query(`UPDATE browser_login_codes SET consumed_at=clock_timestamp()
      WHERE digest=$1 AND session_digest=$2 AND purpose='browser-login' AND consumed_at IS NULL AND expires_at > clock_timestamp()
      RETURNING user_id`, [credentialDigest(code), digest])).rows[0];
    if (!binding) throw new RequestFailure(403, 'login_invalid');
    const user = (await client.query('SELECT id FROM users WHERE id=$1 AND active=true FOR SHARE', [binding.user_id])).rows[0];
    if (!user) throw new RequestFailure(403, 'login_invalid');
    const token = random();
    const nextCsrf = random();
    await client.query("INSERT INTO browser_sessions (digest,user_id,csrf_digest,expires_at) VALUES ($1,$2,$3,clock_timestamp() + interval '1 hour')", [credentialDigest(token), user.id, credentialDigest(nextCsrf)]);
    // Invalidate the old identity while retaining digest-only consumed-code bindings.
    await client.query("UPDATE browser_sessions SET expires_at=clock_timestamp() WHERE digest=$1", [digest]);
    return { token, csrf: nextCsrf };
  });
}
