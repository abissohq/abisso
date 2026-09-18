import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { credentialDigest, synthetic } from '../database/bootstrap.ts';
import { transaction } from '../database/database.ts';
import { RequestFailure } from '../contracts/capability.ts';

const random = () => randomBytes(32).toString('base64url');
export function sessionDigest(cookie: string | undefined) {
  const token = cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('abisso_session='))?.slice('abisso_session='.length);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RequestFailure(401, 'unauthenticated');
  return credentialDigest(token);
}
export function sessionCookie(token: string, secure: boolean, maxAge = 3600) {
  return `abisso_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
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
