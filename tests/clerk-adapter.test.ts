import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { clerkVerifier } from '../packages/browser/clerk.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const verifier = clerkVerifier(publicKey.export({ type: 'spki', format: 'pem' }).toString(), 'https://abisso.example', 'https://clerk.example');
function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user_verified', sid: 'sess_verified', iss: 'https://clerk.example',
    aud: 'https://abisso.example', azp: 'https://abisso.example', iat: now, nbf: now, exp: now + 60, ...overrides })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

test('Clerk adapter verifies signature, session and authorized party', async () => {
  assert.deepEqual(await verifier(token()), { subject: 'user_verified' });
  await assert.rejects(verifier(token({ azp: 'https://other.example' })), { code: 'invalid_identity' });
  await assert.rejects(verifier(token({ aud: 'https://other.example' })), { code: 'invalid_identity' });
  await assert.rejects(verifier(token({ iss: 'https://other.example' })), { code: 'invalid_identity' });
  await assert.rejects(verifier(token({ exp: 1 })), { code: 'invalid_identity' });
  await assert.rejects(verifier(token({ sid: null })), { code: 'invalid_identity' });
  await assert.rejects(verifier(`${token()}x`), { code: 'invalid_identity' });
});
