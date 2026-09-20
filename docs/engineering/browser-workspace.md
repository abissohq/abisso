# Browser identity and workspace creation (Issue #19)

This slice connects a Clerk browser session to an Abisso user. Clerk supplies identity only; Abisso owns user IDs, workspace IDs, roles, membership, browser sessions, and machine authority.

## Configuration

Set `APP_ORIGIN` to the browser's exact origin, `CLERK_PUBLISHABLE_KEY` to the frontend key, `CLERK_JWT_KEY` to the PEM public key, and `CLERK_ISSUER` to the exact issuer URL for the same Clerk application. Register the origin with Clerk and add an `aud` claim equal to `APP_ORIGIN` in Clerk's session token customization. Production uses HTTPS and secure Abisso cookies. The browser loads Clerk's versioned JavaScript and UI bundles from the frontend domain encoded in the publishable key. The backend verifies each Clerk session JWT signature, expiry, issuer, audience, session ID, and authorized party before mapping the subject. No Clerk secret key is required for this path.

Open `/sign-in`. A Clerk sign-in or sign-up returns to that page. An authenticated user with no Abisso workspace sees **Create workspace**; this explicit action creates the workspace and an owner membership. The user can then open Live. A second active membership is rejected. The local synthetic login remains at `/dev/login` only when `NODE_ENV` is `development` or `test`.

## HTTP and storage boundary

- `GET /v1/browser/session` issues or reads an Abisso HTTP-only session cookie and a separate same-site CSRF cookie. It returns the CSRF value and current active workspace state to same-origin JavaScript.
- `POST /v1/browser/login` requires the Abisso cookie, matching CSRF value, exact origin, and a valid Clerk session token. It creates or finds the unique `(provider, subject)` mapping, then rotates the Abisso session and CSRF tokens. Login itself creates no workspace.
- `POST /v1/browser/logout` requires the authenticated Abisso cookie, matching CSRF value, and exact origin. It expires the old session and issues a new anonymous one. `/sign-in` reconciles the current Clerk account with the Abisso cookie; a different Clerk account rotates identity, and a signed-out Clerk session clears Abisso identity.
- `POST /v1/workspaces` requires an authenticated Abisso browser session, matching CSRF value, exact origin, and an active internal user. A user lock and database partial unique index enforce one active membership, including concurrent attempts. The new role is `owner`.
- Browser cookies and Clerk tokens have no `telemetry:ingest` credential entry. The ingestion route continues to authenticate only machine bearer credentials.

The provider subject mapping is unique in PostgreSQL, including concurrent first logins. Browser sessions store token and CSRF digests. Clerk session tokens are verified in memory and are not stored in Abisso tables. Existing M0 synthetic users and memberships remain valid after the additive migration.

## Verification

`tests/browser-workspace.test.ts` exercises first and repeat login, subject uniqueness and concurrency, explicit creation, active membership and cross-workspace denial, CSRF and origin rejection, synthetic login isolation, and browser/machine authority separation. `tests/clerk-adapter.test.ts` exercises JWT signature, expiry, session claim, and authorized-party checks with a local test key. A live Clerk tenant and deployed HTTPS origin are still needed for an external sign-in smoke test.
