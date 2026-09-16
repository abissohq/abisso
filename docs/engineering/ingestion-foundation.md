# Issue #3: authenticated ingestion foundation

Implementation profile: `m0-ingestion-foundation-v1`. Authority remains the six
specifications, existing ADRs, then the M0 brief. This note records implementation
choices within that scope; it does not amend them.

Only `capabilities.declared` is registered. Its schema is strict at every object
boundary, with observed provenance, null confidence, null wire receipt time,
operational-metadata policy, and no capability snapshot reference. The synthetic
registered adapter is `synthetic_m0`, provider `abisso`. No real adapter is present.
Nonempty extensions are rejected in this profile; restricted extension quarantine
belongs to #5. Capability reason codes currently registered are `unsupported`,
`policy_excluded`, `not_collected`, and `unknown` (or null). Adapter/provider
versions use bounded semantic-version syntax. Opaque event IDs are UUIDv7 or
ULID-like identifiers. Source sequences start at 1.

The HTTP boundary accepts JSON or gzip JSON, at most 512 KiB on the wire and
1 MiB decompressed, 200 events, 64 KiB per raw event, 200 array elements,
64 object properties, 128 UTF-8 bytes per string/key, and four payload levels.
The parser rejects duplicate decoded property names, malformed UTF-8, lone
surrogates, NULs, non-finite numbers, and integers outside the cross-runtime safe
range before hashing. The application request timeout is 10 seconds. Request
issuance and source future-skew windows are five minutes; source future skew
requires `unsynchronized` clock quality. Original timestamp representations are
preserved in canonical JSON. No semantic normalization precedes RFC 8785/SHA-256.

Every interpreted request, including exact replays, checks the credential digest,
expiry, revocation and ingestion audience, current machine/user/membership/
workspace, policy, consent, configuration, and registered source authority.
Envelope identity never grants permission. Row locks hold authority through
acceptance and serialize batches for a machine. Unknown or mismatching sources
receive safe rejections without probing another tenant's records. Exact request
replays recheck every previously used source. No browser authentication or read
endpoint exists in this issue.

One transaction persists the exact safe response text, complete wrapper digest,
final event dispositions and client-event digests, immutable accepted ledger facts,
ledger-referencing jobs, active capability declaration, and contiguous checkpoints.
Rejected bodies are not retained. Event and request collisions create safe health
signals containing only the authenticated machine, fixed reason, and server time.
A retried accepted event creates no new job or ledger fact. Request replay returns
the original response bytes and checkpoints. Checkpoints never advance across a
gap. Ledger timestamps and routing columns come from the validated accepted object.

Durable acceptance activates the source declaration immediately. Asynchronous
`m0-capabilities-v1` processing records the accepted declaration, source, ledger
watermark, and projector version in a rebuildable capability projection. It does
not authorize acceptance, create sessions, or infer lifecycle/meaningful progress.
The foundation worker processes one job at a time, selecting the oldest pending
ledger ID with `FOR UPDATE SKIP LOCKED`, and commits projection plus completion in
one short transaction. A failed transaction rolls back and the process exits with
`worker_failed`. Restart retries the pending job. Committed leases, crash-counted
attempts, backoff and the five-attempt dead-letter lifecycle are explicitly #7,
not claimed as implemented by this foundation.

Acceptance tests exercise the issue's pre-agreed HTTP, durable PostgreSQL, and
separate-process worker seams. Direct database assertions here are intentional:
atomic durable records and absence of inline projection are the stated acceptance
criteria, not an alternate production read API. No mocked database is used.

Deferred: #4 browser login/session-start/Live; #5 comprehensive mixed outcomes,
restricted quarantine, admission limits and injected-failure/concurrency coverage;
#6 heartbeat/freshness/SSE; #7 leased recovery and completion; #8 isolated replay;
#9 the aggregate gate and latency report. This suite is not the full M0 gate.
