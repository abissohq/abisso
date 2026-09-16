# Canonical event equivalence uses JCS and SHA-256

Abisso M0 determines whether two uses of the same canonical event identity carry equivalent content by hashing the complete client-supplied event, before any server mutation and including `received_at: null`. The server serializes that event with RFC 8785 JSON Canonicalization Scheme (JCS), hashes the canonical UTF-8 bytes with SHA-256, and persists the digest with the event identity and durable disposition. This makes retries independent of JSON property order and insignificant whitespace while preserving strict representational—not semantic—equality.

## Processing order

1. Enforce request and event byte, depth, collection-size, and object limits before expensive processing.
2. Parse JSON while rejecting duplicate object property names.
3. Require an object and enough syntactically valid identity fields to establish the event identity safely.
4. Enforce the JSON and numeric constraints required for deterministic JCS handling. V0 integer fields remain within the cross-runtime safe-integer range unless a schema deliberately represents them as strings.
5. Serialize the complete client-supplied event with RFC 8785 JCS.
6. Hash the canonical UTF-8 bytes with SHA-256.
7. Use the resulting digest for event-identity equivalence.
8. Only after deduplication and equivalence handling may the server assign `received_at` and persist an accepted canonical event.

JCS does not normalize strings, timestamps, identifiers, or Unicode semantically. Two inputs are equivalent only when their canonical client-event representations are equal; apparent semantic similarity is insufficient.

## Identity behavior

Event identity is `(workspace_id, source_id, event_id)`. Workspace and source authority come from the authenticated machine principal and registered source; payload identity fields are consistency assertions, not authorization.

For an existing identity:

- the same digest after a prior acceptance returns `duplicate`;
- the same digest after a durable rejection or quarantine returns the prior deterministic disposition; and
- a different digest returns `event_id_collision` and raises the specified safe security signal.

A corrected body must use a new event ID. Reusing an existing ID with modified content is never a correction mechanism.

## Storage and consequences

The durable idempotency record contains the event identity, SHA-256 equivalence digest, disposition, and safe reason code when applicable. Abisso does not retain a second event copy solely for deduplication.

Changing the canonicalization or digest algorithm after identities exist requires an explicit migration and versioning strategy. Cryptographic agility and alternate canonicalization or digest algorithms are deferred beyond M0.
