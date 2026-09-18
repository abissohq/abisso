# Issue #4: session start and browser Live

The deployed intermediate profile is `m0-session-start-v1`, registering exactly
`capabilities.declared` and `session.started`. The Issue #3 acceptance boundary
and PostgreSQL transaction remain intact. No heartbeat, freshness computation,
SSE, completion, leased worker recovery, replay verifier, or aggregate gate is
implemented in this slice.

`session.started` uses the strict canonical observed envelope, opaque canonical
session ID, `capability_snapshot_id`, and `lifecycle_state="active"`. This synthetic
profile bounds start reasons to `new_session`, `resumed_session`, `unknown`, and
optional provider mode to `interactive`, `non_interactive`, `unknown`; optional
repository/worktree references are opaque IDs. No content or arbitrary labels
are accepted. Lifecycle evidence must reference the active, unexpired, previously
accepted declaration with direct available `session.lifecycle`. Declarations are
captured before batch processing, so siblings cannot establish authority.

Development/test composition alone exposes `/dev/login`, POST `/dev/login/code`,
and POST `/dev/login/exchange`. Login begins with a random anonymous server-side
session and CSRF token; the issuer and exchange require the bound token and same
Origin. A code expires in two minutes, is purpose/session/user bound, stored only
as SHA-256 digest, and is atomically consumed in the session-rotation transaction.
Login codes travel in explicit form fields or JSON responses, never URLs, cookies,
identity headers, or localStorage. Authenticated sessions have a one-hour absolute
lifetime and fifteen-minute idle timeout; cookies use HttpOnly, SameSite=Lax and
Secure when configured. Local HTTP development omits Secure. Login establishes
identity only. `GET /v1/live` separately checks active user, workspace and normal
membership every time. Optional workspace claims must match that membership.
Machine bearer credentials do not read Live; browser cookies do not ingest.

The existing concurrency-one worker handles the oldest pending ledger job in a
short transaction. Session creation uses ADR 0003's deterministic UUIDv5 identity,
retains founding source/event provenance, and records observed session identity
separately from inferred provisional membership. Membership uses versioned
`provisional_session_origin`, Medium confidence 50, with session-origin evidence
and explicit repository availability. This is no general correlation resolver.
Already-founded sessions are not recreated by another start. Session start creates
Starting/Active rows, shared revision, evidence timestamps and ledger watermark;
meaningful-update time remains null. One workspace revision is allocated only for
effective projection creation, in the same transaction as both rows and job
completion. Live holds session and membership authority through the read transaction; one
SQL statement returns revision, nested rows and server time from a coherent
PostgreSQL view. There is no notification allocation in this slice.

`pnpm dev` builds and serves the minimal React view with API and worker at
http://127.0.0.1:3001. Use the local synthetic sign-in link and the two explicit
POST forms. `pnpm demo:start` logs in via that same browser boundary, submits A,
waits for durable acceptance, submits B, and waits for an authorized Live reread
showing Starting/Active. Then use **Reread Live** in the browser. The demo generates
its own browser session; it never emits authentication secrets. Credentials may
be renewed by running the demo again. `pnpm web:build` builds web assets for manual
composition. Set `APP_ORIGIN` to the exact browser origin for nondefault setups;
`COOKIE_SECURE=true` requires HTTPS. Production has no synthetic auth adapter.

`pnpm test:m0:start` exercises real HTTP, PostgreSQL durability, a separate worker
process, golden projections, auth failure cases, capability dependencies,
source-distinct founding identity, duplicate no-op and React field rendering.
Digest storage and durability assertions intentionally inspect PostgreSQL at the
acceptance seams. This suite is not the full M0 completion gate.
