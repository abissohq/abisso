# M0 — Abisso Heartbeat implementation brief

Status: agreed implementation baseline, 16 September 2026. The 23-question design interview is complete; implementation has not started and the completion gate has not yet been exercised.

This brief records the smallest synthetic vertical slice through Abisso's runtime architecture. It supplements, does not amend, the six authoritative specifications. “M0 Heartbeat” is a delivery slice spanning foundations, ingestion/session projection, and minimal Live/realtime behavior; it does not renumber or silently replace the milestone sequence in the frozen system design.

## Authority and frozen constraints

Apply the specifications in this order:

1. [Product Thesis and Founding Charter](../product/01-product-thesis.md).
2. [V0 PRD](../product/02-v0-prd.md).
3. [System Design](03-system-design.md).
4. [Canonical Telemetry](04-canonical-telemetry.md).
5. [Work Graph](05-work-graph.md).
6. [Security and Privacy](06-security-privacy-threat-model.md).

The slice remains a TypeScript modular monolith, PostgreSQL-first, with immutable accepted facts, transactional PostgreSQL jobs, asynchronous versioned projectors, rebuildable projections, authenticated workspace isolation, React Live, and SSE invalidation. Live remains Workstream-centric. Observations, inference, evidence freshness, meaningful progress, and outcomes remain distinct. No prohibited content is required or permitted in the implemented canonical profile.

Use document 4's exact canonical registry names and canonical `session_id`. Document 5's illustrative mapping mentions `session.paused` and `session.ended`, which are not document 4 event kinds; its protected provider-session-reference identity wording must not cause core modules to read quarantined provider extensions or replace the higher-authority canonical session identity.

## Defining tracer

Synthetic canonical evidence → normal authenticated ingestion → durable PostgreSQL ledger → asynchronous session/provisional Workstream projection → SSE invalidation → coherent authoritative Live reread.

Use three sequential authenticated requests with one event per batch:

1. **Batch A:** `capabilities.declared`; wait for durable acceptance. Declare the relevant lifecycle/activity capabilities before dependent evidence.
2. **Batch B:** `session.started`; wait for durable acceptance, asynchronous processing, and authoritative Live showing the session as Starting and its provisional Workstream as Active.
3. **Batch C:** `session.activity(activity_class="heartbeat")`; submit only after Batch B's state is visible. Wait for acceptance, existing-state mutation, SSE invalidation, authoritative reread, and the same session becoming Running while the same Workstream remains Active.

Acknowledgement proves acceptance, projection observation proves asynchronous processing, and Live observation proves the user-facing read path. They are not interchangeable. `session.completed` belongs to a separate lifecycle fixture, not the defining tracer.

## Accepted implementation decisions

### Synthetic identity and authentication

The explicit dev/test bootstrap seeds one deterministic synthetic workspace, user/active member, active machine registration, registered source, and minimum consent/policy/configuration records needed by normal ingestion. Entity IDs may be deterministic; credentials must be cryptographically random and short-lived.

Machine access tokens use the normal machine authentication/authorization boundary. Every HTTP attempt, including request replay, verifies token validity and current active machine, membership, and workspace authorization. Workspace/user/machine/source authority comes from authenticated registration relationships; envelope claims are consistency assertions only.

The dev/test human-auth adapter issues random, short-lived, purpose-bound, single-use browser-login codes, stores only their digests and user/purpose/expiry/consumption bindings, and atomically exchanges them through an explicit POST/form for normal random server-side browser sessions. Rotate/create session identity at authentication. Use HttpOnly, SameSite=Lax cookies and Secure as required by the configured environment. Never put login codes in query strings, ambient cookies, localStorage, or trusted identity headers.

The synthetic issuer/exchange route exists only in dev/test composition and is not registered in production. It establishes a human identity, not workspace permissions. Normal membership authorization scopes Live and SSE. Machine tokens cannot read Live/open SSE; browser sessions cannot authenticate telemetry ingestion. No trusted-fixture handler, inline authorization bypass, fixed trusted user, client-selected tenant, or machine-to-browser conversion exists.

### Batch HTTP contract

`POST /v1/telemetry/batches`

Request: `{ request_id, issued_at, events }`. The random UUIDv7 request ID and `issued_at` remain unchanged for retries of the same request.

Response: `{ request_id, results, checkpoints }`.

- Each result contains `event_id`, `disposition` (`accepted | duplicate | rejected | quarantined`), and an optional safe `reason_code`.
- Each checkpoint contains `source_id`, `stream_id`, and `highest_durable_sequence`.
- Return 200 for an authenticated, interpretable wrapper even with mixed event outcomes.
- Request failures: 400 malformed wrapper; 401 missing/invalid/expired credentials; 403 inactive/unauthorized principal; 413 hard limits; 429 admission limits; 409 `request_id_collision`; 5xx unexpected infrastructure failure.
- Never echo prohibited material or reveal ownership of another workspace's identifiers.

After duplicate-key-safe parsing and hard limits, structurally inspect the entire array before event processing. Any non-object item or unusable `event_id` makes the whole request 400 with no event processing. Once `event_id` is usable, missing workspace fields, malformed source fields, and conflicting claims receive independent safe event-level rejections. Server-authoritative scope, not malformed payload claims, establishes any safely resolvable disposition key.

Events are evaluated against authoritative durable state that existed before the batch transaction, not provisional sibling effects. A declaration earlier in `events[]` cannot activate a dependent sibling. Reordering siblings cannot create dependency eligibility.

### Event and request equivalence

[ADR 0001](../adr/0001-canonical-event-equivalence.md) defines event equivalence: enforce limits, reject duplicate JSON keys, establish safe identity, enforce deterministic JSON/numeric ranges, then RFC 8785 JCS + SHA-256 over the complete client event before mutation, including `received_at: null`. Integers stay within cross-runtime safe ranges unless deliberately string-encoded. No semantic normalization of strings, Unicode, IDs, or timestamps occurs.

Event identity is `(workspace_id, source_id, event_id)`. Stored final dispositions are only accepted, rejected, or quarantined. Same digest after acceptance responds duplicate; same digest after rejection/quarantine returns the prior deterministic disposition; changed digest returns `event_id_collision` and the specified safe security signal. Modified/corrected bodies use new event IDs.

Request replay identity is `(machine_id, request_id)`. JCS + SHA-256 covers the complete request wrapper. Persist its digest and exact safe response, not the request body. Matching replay returns the original response, including original checkpoints, without processing—even after `issued_at` ages out—but only after current authentication/authorization succeeds. Conflicting reuse returns 409. An unseen ID must pass the request replay window. A new request may preserve old event IDs for legitimate offline delivery; canonical event time rules are separate from request issuance time.

### PostgreSQL persistence and transaction boundaries

- `telemetry_batch_requests`: machine/request identity, request digest, exact safe response, finalization time.
- `telemetry_event_dispositions`: workspace/source/event identity, equivalence digest, accepted/rejected/quarantined final disposition, safe reason, accepted ledger or quarantine reference as applicable, finalization time. Unique compound identity; no duplicate body copy.
- `canonical_event_ledger`: accepted facts only; immutable internal `ledger_id`; small typed routing columns for workspace/user/machine/source/stream/sequence/event/schema/kind/session and occurrence/observation/receipt times; complete accepted event JSONB after server `received_at` assignment. Typed columns and JSONB come from the same validated object. Reinforce compound event uniqueness. No raw transport copy for whitespace/key order.
- `projection_jobs`: idempotent job referencing `ledger_id`, not a copied event body; lease, attempt, retry/backoff, completion, and dead-letter state.
- Restricted quarantine storage: outside ledger/projectors/Live/detectors, referenced from disposition records when required. Only specifically permitted extension/experimental boundaries qualify; prohibited/invalid core input is rejected. Promotion is not normal retry and is unavailable in M0.

One transaction finalizes the complete interpreted bounded batch: lock/establish request identity; resolve and persist event dispositions; insert accepted ledger rows and jobs; persist required quarantine records; compute safe checkpoints; persist the exact response; commit. Only then acknowledge. Validation rejections are outcomes, not transaction failures. Unexpected failure rolls back every effect and returns 5xx, leaving the request safe to execute again.

Checkpoint scope is `(source_id, stream_id)`. Advance only through contiguous sequences with durable final dispositions. Accepted, duplicate responses backed by acceptance, rejected, and quarantined dispositions may account for a sequence when retries deterministically return the safe outcome. Never advance over missing sequences, unresolved events, or uncommitted work.

### Projection semantics and identity

Use a versioned M0 projector and golden expectations. After start, session state is Starting; preserve `started_at = occurred_at`, latest evidence event ID, latest observed/received timestamps, and ledger watermark. Create its provisional Workstream as Active. After heartbeat, the same session is Running and the same Workstream remains Active with unchanged membership; eligible evidence/contact timestamps and watermarks advance.

The heartbeat never automatically advances `last_meaningful_update_at`, semantic progress, productivity, outcome, or a server-created counter. Preserve an accepted canonical `progress_counter` exactly when supplied. Duplicate events create no ledger row, job, projection mutation, revision, or invalidation.

[ADR 0003](../adr/0003-provisional-workstream-identity.md) defines the provisional ID as UUIDv5 of the immutable workspace namespace and `"provisional-workstream:v1:" + creating_source_id + ":" + creating_event_id`. Persist `identity_scheme_version`, `created_from_source_id`, and `created_from_event_id`. The same workspace, founding source, founding accepted event, and scheme version reproduce the same Workstream UUID. Select the first eligible accepted creation event in deterministic ledger-acceptance processing order, never earliest source time. Late evidence does not refound or rename an existing Workstream. Replay independently derives identity without copying live mappings.

Allocate `workspace_projection_revision` once inside a projection transaction only when effective state changes. Every row changed by that transaction receives it; rollback and idempotent recovery allocate nothing. It is a workspace-local read/coherency fence, not event chronology or a replacement for ledger IDs. Snapshot rows and returned revision must represent one coherent PostgreSQL view.

### Evidence freshness

`m0-session-freshness-v1` means recency of qualifying evidence durably received by Abisso, not proof of current execution or meaningful progress.

- Eligible accepted `session.started` and session-bound heartbeat refresh that session.
- Duplicates, rejected/quarantined records, and unrelated source events do not.
- `latest_source_contact_at` is the latest qualifying effective event's server `received_at`.
- `fresh_through_at = latest_source_contact_at + 60 seconds`.
- Fresh when authoritative `server_now <= fresh_through_at`; Stale only when greater.
- Persist source timestamps and optionally deadline/policy version in rebuildable state, not immutable Fresh/Stale facts.
- Return deadline, status, policy version, source contact, and server time in snapshots. Browser deadline crossing is presentation only; it cannot extend freshness and the next server reread must agree.
- Time passing creates no canonical event/job/revision/Attention Item and does not turn Starting/Running into Lost, failure, waiting, inactivity, or no progress.

### Runtime and worker recovery

API/SSE and worker are two entry points/process types of the same application, built/versioned/released together. They share contracts, modules, repositories, schema, projector, and configuration. No HTTP/RPC connects them. API never projects inline in any environment. One documented command starts PostgreSQL, API/SSE, worker, and web.

M0 has one worker with concurrency 1. Claim the oldest currently eligible job by `ledger_id` with PostgreSQL locks/`SKIP LOCKED`; this is not semantic source-time ordering or permanent global head-of-line blocking. Later partitioning/recomputation is additive.

On claim, commit running status, owner/expiry lease, and increment `attempt_count`. Maximum attempts is 5. Success verifies lease ownership, applies the idempotent projector, conditionally updates revision/rows/NOTIFY, completes the job, and clears lease in one transaction. Failure rolls back projection effects; recovery schedules configurable exponential backoff or dead-letters at the limit with safe error codes. Crashes already count as attempts; expired leases are recovered, with no sixth execution after the limit. Dead-lettering does not change facts, fabricate state, allocate revisions, or invalidate SSE.

Worker stoppage does not invalidate accepted ingestion: ledger and jobs continue accumulating. Restart drains backlog idempotently. Deterministic tests invoke the same worker/projector implementation, never a dev-only inline path.

### Realtime and coherent reads

[ADR 0002](../adr/0002-race-free-ephemeral-realtime-invalidation.md) defines subscribe-before-snapshot synchronization. Client opens authenticated SSE; server registers subscriber and emits `stream.ready`; client buffers invalidations, reads a coherent snapshot, discards buffered revisions at/below its fence, and coalesces/rereads for newer ones before marking synchronized. Every reconnect repeats it. No Last-Event-ID recovery guarantee exists.

Worker `pg_notify` runs inside the projection transaction and delivers only after commit. Internal payload: workspace ID, projection type, entity ID, revision. Browser payload omits workspace because subscription is already scoped. No event bodies, labels, paths, content, or credentials enter notification payloads.

Use a dedicated long-lived LISTEN connection, separate from the query pool. Missing/disconnected listener does not affect a correct projection commit. SQL `pg_notify` failure before commit fails/retries the projection transaction. Listener loss marks realtime degraded, reconnects/reissues LISTEN, and closes affected SSE streams to force snapshot resynchronization. Notifications are ephemeral hints, never state or a second durable queue.

### Minimal Live and support profile

Snapshot: `workspace_projection_revision`, `server_now`, `workstreams[]`. Each row includes ID, `"Untitled workstream"` system-fallback label, Active state, row revision, freshness fields, null `last_meaningful_update_at`, and nested sessions with ID/provider/Starting-or-Running state, revision, latest evidence timestamps/ID, and observed counter only when supplied. Repository, branch, and cost say `not_collected`; attention says `not_evaluated`. UI says “Needs Attention not evaluated in M0,” never healthy/no issues/nothing needs attention.

The explicit versioned M0 acceptance profile supports exactly `capabilities.declared`, `session.started`, `session.activity`, and `session.completed`, each with strict envelope/payload/capability validation and required projection behavior. Other frozen-V0 kinds are rejected `unknown_event_kind`, operationally meaning not registered in the deployed profile. Do not partially parse, accept, silently ignore, queue, or quarantine unfinished core kinds. This profile is incomplete V0, not a changed canonical schema.

### Isolated replay

The replay verifier reads accepted M0 ledger facts deterministically and runs the same versioned reducer/projector through an isolated repository/schema. It independently reproduces identity and semantic state; it never copies live identity mappings or changes live tables. Compare normalized identity/state/membership/evidence/source timestamps/observed counters. Exclude leases, attempts, notification delivery, and wall-clock processing metadata from semantic digests; verify revisions/watermarks separately. No promotion/shadow swap is implemented.

## Executable M0 completion gate

M0 is complete only after these correctness seams pass:

1. Three-batch tracer with observable initial Starting/Active state before heartbeat, stable IDs, Running/Active mutation, SSE, and coherent reread.
2. Whole-batch atomicity across request response, dispositions, ledger, jobs, quarantine references, and checkpoints; injected precommit failure leaves nothing partial.
3. Event equivalence/collision, request exact replay/collision, duplicate no-op, and independent deterministic Workstream identity. Two eligible founding events with the same `event_id` from different registered sources, for distinct sessions with no existing membership, must create different provisional Workstream UUIDs; replay must reproduce each independently.
4. Machine credential success and missing/invalid/expired/inactive/revoked cases; source/machine mismatch; tenant-claim attacks; browser Live/SSE success; hard browser/machine principal separation; inactive membership rejection.
5. Mixed outcomes; unusable event ID means whole-request 400; usable IDs allow independent canonical rejection; no sibling capability activation, including reordering.
6. Stopped-worker ingestion/backlog; restart drain; lease reclaim; crash-counted attempts; idempotent recovery; five-attempt dead-letter boundary.
7. Commit notification versus rollback silence; readable projections without listener; reconnect race-free resynchronization; harmless repeated invalidation.
8. Deterministic freshness at +59.999s Fresh, +60.000s Fresh, +60.001s Stale; duplicate does not extend it; heartbeat does not advance meaningful progress; stale creates no event and does not mean Lost.
9. Isolated replay semantic equivalence using the same projector and independent identity derivation.
10. Separate `session.completed` acceptance/projection fixture: existing session becomes Completed, preserving session and Workstream IDs; Workstream completion/outcome reconciliation and full terminal precedence remain deferred.
11. One documented local command and bootstrap with no production auth/GitHub/Claude/Codex credentials or undocumented external dependencies.
12. Privacy regression: no prohibited content in accepted records, responses, logs, worker errors, SSE, replay records, or canonical fixtures; run relevant profile privacy/contract assertions.
13. Report exercised frozen latency paths—durable acknowledgement, projection, realtime, Live reads—with environment/dataset/batch size/results. Investigate misses; local timing noise does not replace correctness gates or establish external V0 performance.

A passing gate means only: **M0 Heartbeat is complete; Abisso's synthetic canonical evidence → durable ledger → asynchronous projection → Workstream-centric Live → realtime invalidation → authoritative reread loop and its critical failure seams are proven.** It does not mean V0 complete, Alpha Ready, Security/Privacy Alpha Ready, real-provider validation, or external performance validation.

## Deferred and implementation discretion

Deferred: Claude Code/Codex adapters, local collector and privacy/outbound pipeline, GitHub/Actions, general Work Graph correlation and corrections, cost attribution, outcome reconciliation, production detectors, provider-specific Lost rules, production managed authentication/enrollment/refresh/Keychain/revocation UX, replay promotion, production retention/rate-limit tuning, and alpha operational hardening. Do not add distributed infrastructure or expand V0 scope.

Framework/library selection, final SQL types/indexes/migrations, exact configured retry delays, styling, and similar choices are implementation discretion unless they violate a frozen spec or ADR. Existing repository tooling is pnpm 12.4.2, Node 24 range, and `apps/*`/`packages/*` workspaces. Remaining blockers discovered during implementation must be surfaced, not silently turned into new architecture or product scope.
