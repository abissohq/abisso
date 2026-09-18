# Issue #5: deterministic mixed-batch ingestion

## Approved M0 synthetic quarantine boundary

This is an M0 synthetic dev/test policy, not a production integration. It does
not change the canonical registry or any authoritative specification.

The only permitted extension is `abisso.synthetic.m0/1`, with exactly this value:

```json
{"fixture":"quarantine","requires_interpretation":true}
```

Both fields are required literals; additional fields, namespaces, versions, and
arbitrary strings are forbidden. The entire serialized extension map is limited
to 256 UTF-8 bytes (including transport whitespace). The marker explicitly makes
synthetic interpretation dependent on the extension. After the same strict core,
privacy-policy, authority, time, and pre-batch capability checks as ordinary
telemetry, the whole event is quarantined, never accepted. Invalid/prohibited
core input and unregistered core kinds still reject. Only development/test
composition enables this boundary; production and unspecified environments
reject nonempty extensions.

Restricted storage retains only the allowlisted extension, authoritative scope,
opaque reference, and creation/expiry timestamps, not a copy of the event. Public
database access is revoked; there is no application read/export/promotion route.
Only ingestion and synthetic retention maintenance use the quarantine repository.
Projectors, Work Graph, Live and detectors never read it. No ledger row, job,
capability activation, projection, revision or invalidation is created for it.

Extension payloads expire one hour after insertion, are scrubbed by dev/test API
maintenance every minute and on authenticated ingestion, and can be scrubbed
explicitly with `NODE_ENV=development pnpm quarantine:purge`. Maintenance failure
uses only a fixed safe error code. A content-free reference tombstone and durable
disposition remain for deterministic retries/checkpoint accounting; retries never
restore expired payloads or promote events. Synthetic test schemas are removed
after each test. This policy does not promise deletion from database backups.

HTTP, durable PostgreSQL and separate-worker boundaries are the pre-agreed
acceptance seams from Issues #3–#4. Direct storage assertions intentionally prove
atomic durability, restricted references, and exclusion from canonical evidence.

## Batch failure and retry verification

`pnpm test:m0:ingestion` is the Issue #5 acceptance suite and executable
demonstration. It submits accepted/duplicate/rejected/quarantined outcomes,
reorders keys/whitespace, repeats request and event identities, advances mocked
wall-clock time past issuance, and injects a deferred PostgreSQL commit failure.
The latter uses a test-schema-only constraint trigger, not an API bypass or
production fault-injection hook. It verifies all effects roll back, then submits
concurrent retries through ordinary HTTP and observes exactly one finalization.

The existing authenticated machine-row lock serializes concurrent batches for
that machine. Source ownership makes this sufficient for event-identity reuse
and stream checkpoint updates without adding new locks or distributed systems.
Capability declarations/evidence eligibility are captured before sibling writes.
Unresolvable source claims receive safe independent rejections without recording
foreign/unusable identity keys or exposing ownership; exact request response
storage still makes those request retries deterministic. Usable registered-source
IDs retain durable rejection dispositions even if other source fields are invalid.

HTTP admission is a fixed maximum of eight in-flight ingestion requests per API
instance, counting body reads and database processing, with slot release on every
success/failure/abort. There is no unbounded IP/token-keyed cache. The ninth
request gets `429 admission_limit`. Other request boundaries and previously
documented parser/transport limits remain unchanged. Production rate tuning and
broader edge hardening are not claimed by this synthetic slice.

Duplicate acceptance inserts no ledger row or job, and a separate worker drain
does not change projections or revisions. This slice has no SSE/NOTIFY producer;
realtime delivery remains Issue #6. The suite proves the absence of new work
that could generate an invalidation, without implementing later realtime behavior.

Run `pnpm typecheck`, `pnpm test:m0:ingestion`, and `pnpm test` for verification.
Normal local startup remains `pnpm dev`, followed by `pnpm demo:start`. No
heartbeat, freshness calculation, SSE, completion, leased recovery, isolated
replay, aggregate gate, provider integration, or production extension is added.
