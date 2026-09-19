# Issue #6: heartbeat, evidence freshness, and Live invalidation

The deployed intermediate profile is `m0-session-heartbeat-v1`. It registers
`capabilities.declared`, `session.started`, and the strictly validated heartbeat
form of `session.activity`. Completion and the worker lease/retry/dead-letter
state machine remain in later tickets.

Submit A, B, and C as three separate authenticated one-event batches. B first
projects Starting/Active. C references the same accepted declaration and
canonical session, requires direct available `session.activity_structured`,
and changes the existing session to Running while retaining its Workstream ID
and inferred membership. The supplied `progress_counter` is copied exactly.
The projector adds no progress, productivity, attention, outcome, or meaningful
update inference. An unknown session or unavailable capability is rejected.
The counter is an observed producer value. The canonical producer contract makes
it monotonic within a session, but Abisso does not infer monotonic progress from
ledger acceptance order, which can differ from source order after offline upload.

The session and Workstream retain the latest qualifying server receipt as
`latest_source_contact_at`. `m0-session-freshness-v1` derives a deadline 60
seconds later. The read API returns `server_now`, source contact, deadline,
policy version, and Fresh/Stale for both rows. At the deadline evidence is
Fresh; one millisecond later it is Stale. Time passage changes presentation
only. Browser presentation uses the server timestamp and elapsed monotonic
time from the start of its read, so it cannot extend server freshness. Stale
evidence does not change Starting/Running, produce Lost, or create an Attention
Item.

Projection transactions allocate one workspace revision for an effective
mutation and call `pg_notify` before committing. PostgreSQL delivers only
committed references. A dedicated long-lived LISTEN client fans out safe
workstream ID/revision hints to authorized SSE streams. Listener loss closes
streams and reconnects LISTEN; projections and reads continue. Each SSE
invalidation rechecks browser authority and workspace membership. Machine
credentials cannot open streams. Notifications carry no canonical bodies or
content.

The browser waits for `stream.ready` before reading the coherent snapshot.
It buffers newer revisions, rereads until the snapshot fence catches up, and
repeats the protocol on every reconnect. Read responses from an older stream
generation cannot publish into a newer one. Displayed revision never moves
backward, including when overlapping HTTP reads return out of order.
Notifications are ephemeral hints, so `Last-Event-ID` is not a replay cursor.

Run `pnpm dev` to start PostgreSQL, API/SSE, worker, and web. After the local
synthetic sign-in, Live updates without manual refresh. `pnpm demo:heartbeat`
opens a browser-authenticated SSE connection, submits A/B/C through normal
ingestion, checks Starting then Running through authoritative rereads, and
waits for Stale evidence while the lifecycle remains Running. This takes
about one minute. `pnpm test:m0:heartbeat` runs the PostgreSQL-backed tracer,
freshness, rollback, listener recovery, security, and revision-fencing tests.
This suite does not claim the aggregate M0 completion gate.
