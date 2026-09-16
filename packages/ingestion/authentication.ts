import { createHash } from 'node:crypto';
import type pg from 'pg';
import { RequestFailure } from '../contracts/capability.ts';
import { currentAuthority, currentCredential } from './authority-repository.ts';

export async function authenticate(client: pg.PoolClient, authorization: string | undefined) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
  if (!token) throw new RequestFailure(401, 'invalid_credentials');
  const digest = createHash('sha256').update(token).digest('hex');
  const credential = await currentCredential(client, digest);
  if (!credential) throw new RequestFailure(401, 'invalid_credentials');
  const authority = await currentAuthority(client, credential.machine_id);
  if (!authority) throw new RequestFailure(403, 'inactive_authority');
  return authority;
}
