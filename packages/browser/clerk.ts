import { verifyToken } from '@clerk/backend';
import { RequestFailure } from '../contracts/capability.ts';

export type BrowserIdentity = { subject: string };
export type BrowserIdentityVerifier = (token: string) => Promise<BrowserIdentity>;

export function clerkVerifier(jwtKey: string, origin: string, issuer: string): BrowserIdentityVerifier {
  return async token => {
    if (!token || token.length > 8192) throw new RequestFailure(401, 'invalid_identity');
    try {
      const claims = await verifyToken(token, { jwtKey, audience: origin, authorizedParties: [origin] });
      if (claims.iss !== issuer || typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw new Error('invalid_session');
      return { subject: claims.sub };
    } catch {
      throw new RequestFailure(401, 'invalid_identity');
    }
  };
}

export function clerkBrowserScripts(publishableKey: string | undefined) {
  if (!publishableKey) return { scripts: '', origin: '' };
  const encodedHost = /^pk_(?:test|live)_(.+)$/.exec(publishableKey)?.[1];
  const host = encodedHost ? Buffer.from(encodedHost, 'base64url').toString().replace(/\$$/, '') : '';
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..')) return { scripts: '', origin: '' };
  const key = publishableKey.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return { origin: `https://${host}`, scripts: `<script defer crossorigin="anonymous" src="https://${host}/npm/@clerk/ui@1/dist/ui.browser.js"></script><script defer crossorigin="anonymous" data-clerk-publishable-key="${key}" src="https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js"></script>` };
}
