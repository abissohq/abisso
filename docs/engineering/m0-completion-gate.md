# Issue #9: M0 completion gate evidence

Run `pnpm test:m0:gate` from the repository root. It runs every existing M0
acceptance suite, the focused profile/privacy/latency test, then `pnpm dev` and
the full browser-authenticated `demo:start` tracer. Node 24, pnpm 12.4.2, and
Docker with Compose are the only prerequisites. From a checkout with dependencies
installed (`pnpm install --frozen-lockfile`), the one application command is
`pnpm dev`: it starts PostgreSQL, migrates, explicitly bootstraps synthetic
authority, builds and serves the web view, and launches API/SSE plus the separate
worker. No production, GitHub, Claude, or Codex credentials are needed.

## Correctness evidence

The 19 September 2026 run created a separate Compose project with a fresh
PostgreSQL volume, then removed that volume after the gate. Existing local
development data was untouched. All eight gate suites (70 tests) passed. The startup tracer reported
`session_start_live_verified`, `session_heartbeat_live_verified`, and
`session_evidence_stale_lifecycle_running_verified`.

| Requirement | Executable evidence |
| --- | --- |
| 1. Defining tracer | `heartbeat.test.ts` and `m0-gate.test.ts`: accepted A/B/C, Starting/Active before heartbeat, stable IDs, Running/Active afterward, SSE invalidation, authoritative Live reread. The `demo:start` run exercises the composed API, separate worker, browser login/SSE, and web-serving startup. |
| 2. Atomicity | `mixed-batch-ingestion.test.ts`: injected precommit failure leaves no partial response, disposition, ledger, job, quarantine, or checkpoint effects. |
| 3. Idempotency and collisions | Ingestion foundation, mixed-batch, and session-start suites cover exact replay, request/event collisions, duplicate no-op, and independent source-scoped provisional identity. |
| 4. Auth and isolation | Ingestion foundation, session-start, mixed-batch, and heartbeat suites cover machine credential failures, source/tenant attacks, browser principal separation, membership, and SSE scope. |
| 5. Batch semantics | Mixed-batch suite covers independent outcomes, unusable ID whole-request failure, and sibling capability nonactivation in either order. |
| 6. Worker recovery | Recovery suite covers stopped-worker backlog, restart, lease reclaim, counted crashes, idempotent processing, and the five-attempt dead-letter boundary. |
| 7. Realtime loss/reconnect | Heartbeat suite covers commit notification, rollback silence, readable projection during listener loss, reconnect reconciliation, and stale/repeated hints. |
| 8. Freshness/no inference | Heartbeat suite checks +59.999/+60.000/+60.001-second boundaries, duplicate no-op, no meaningful-progress inference, and Stale without Lost. |
| 9. Isolated replay | Replay suite and gate test compare independently rebuilt semantic state, identity, revisions, and watermarks without mutating live projections. |
| 10. Completion fixture | Recovery suite verifies separate `session.completed` acceptance and Completed projection with stable session/Workstream IDs and no inferred outcome. |
| 11. Local startup | Gate launches `pnpm dev` composition and runs `demo:start`; the command above documents clean-checkout prerequisites and explicit synthetic bootstrap. |
| 12. Privacy | Profile/contract suites reject prohibited fields. The gate submits four prohibited-field variants and checks that their sentinel is absent from captured responses, ledger, dispositions, projections, jobs, quarantine, SSE frames, replay result, Live snapshots, and captured process output. It recursively checks the four accepted M0 fixture objects for forbidden field names and privacy classes. A recovery test injects private worker-failure text and checks that persisted job state contains only the safe `projection_failed` code; the gate also scans captured test output for that marker. These checks cover the exercised fixtures and injected markers only. |
| 13. Latency | Focused gate test prints `M0_GATE_METRICS` for each exercised path and context; measurements below. |

The final deployed M0 acceptance profile supports exactly
`capabilities.declared`, `session.started`, `session.activity`, and
`session.completed`. The gate checks the discriminated union directly;
the gate submits every unfinished frozen-core kind and verifies
`unknown_event_kind` rather than acceptance or quarantine.

## Local latency evidence

Environment: macOS Darwin 27.0.0 arm64, Node 24.20.0, pnpm 12.4.2,
PostgreSQL 17.6 via local Compose, one host and loopback HTTP/SSE. The measured
test uses one isolated schema, one workspace, one machine/source, one session,
one Workstream, three accepted canonical events, and one event per batch.
Worker processing is invoked serially in the measured test. No geographic
network path or degraded dependency was exercised.

| Path and measured boundary | Samples (ms) |
| --- | --- |
| Durable acknowledgement: client POST start through full committed response body for batches A/B/C | 11.07, 8.23, 10.49 |
| Session appearance/lifecycle projection: worker drain start through completed drain for start and heartbeat | 11.00, 6.40 |
| Realtime: drain end through receipt of SSE invalidation for start and heartbeat | 3.86, 1.32 |
| Worker start through SSE invalidation, including processing and delivery | 14.85, 7.72 |
| Live reads: client GET through parsed JSON body for empty, Starting, unchanged pre-heartbeat, and Running snapshots | 4.70, 4.36, 4.29, 4.12 |

These are small local samples, not p95 estimates. The measured projection path
begins when the worker is invoked, not at collector observation; the realtime
sample begins after the drain returns, so it does not isolate exact commit time.
No local misses or correctness failures occurred in this run. Local performance evidence does
not establish external V0 performance or the frozen V0 latency targets.

M0-specific completion: **synthetic canonical event → ledger → async projection
→ Workstream Live → realtime invalidation → authoritative reread proven.**
