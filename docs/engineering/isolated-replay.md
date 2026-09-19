# Issue #8: isolated M0 replay verification

`verifyReplay(db, workspaceId)` reads accepted canonical ledger rows and a coherent
live projection snapshot in one repeatable-read transaction. It creates temporary
projection tables on that connection, runs the same versioned projection dispatch
used by the worker in ledger order, and rolls back the transaction. Temporary
tables shadow live projections; replay never copies live Workstream identities or
membership. The session projector derives each founding UUID from the accepted
workspace, source, and event identity as specified by ADR 0003. Replay suppresses
the worker's ephemeral invalidation notification.

The verifier returns SHA-256 digests of normalized capability, session, and
Workstream semantic state. Identity, membership, lifecycle, provenance, evidence
and source timestamps, observed counters, and projector versions participate.
Revisions and ledger watermarks are compared separately. Job leases, attempts,
backoff, delivery state, and wall-clock processing times are excluded. Only
accepted ledger facts are read; rejected and quarantined records have no replay
input path. The API exposes verification only to application code, not HTTP, and
there is no promotion or shadow swap operation.

Run `pnpm test:m0:replay` for PostgreSQL-backed identity, late-event, isolation,
divergence, and privacy fixtures. The existing `m0-session-recovery-v1` session
semantics remain unchanged.
