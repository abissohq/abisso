# Issue #7: worker recovery and session completion

The worker commits each claim before projection. The claim records a random owner,
lease expiry, and one attempt. `WORKER_LEASE_MS` defaults to 30000 and
`WORKER_BACKOFF_BASE_MS` defaults to 1000; both must be positive integer
milliseconds. A failed projection rolls back its rows, revision, and PostgreSQL
notification, then schedules exponential backoff. Error storage is restricted to
`projection_failed` and `lease_expired`. The fifth failed or expired claim is
dead-lettered; no sixth claim executes. An expired owner cannot complete a job.

One worker loop runs one job at a time. It selects the lowest ledger ID among
currently eligible jobs, skipping delayed jobs and locks held elsewhere. Session
jobs wait for earlier unfinished jobs for the same session so a delayed start
cannot cause a later completion or heartbeat to be silently consumed. Other
sessions and declarations can continue. Projection and job completion share one
transaction, so reclaim after a crash cannot allocate another effective revision
or notification for already applied state.

The separate `session.completed` fixture is accepted with a direct lifecycle
capability. Projection preserves session and provisional Workstream IDs, changes
the session to Completed, and leaves Workstream Active with no inferred outcome.
A late heartbeat cannot reopen the session. Run `pnpm test:m0:recovery` for the
PostgreSQL-backed recovery and completion scenarios.
