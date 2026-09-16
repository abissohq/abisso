# Realtime uses subscribe-before-snapshot synchronization

Abisso M0 uses authenticated Server-Sent Events as an ephemeral invalidation channel and PostgreSQL projections as authoritative state. To avoid missing a projection commit between snapshot retrieval and stream establishment, the browser subscribes before it reads the Live snapshot, buffers invalidations until reconciliation finishes, and uses a workspace-scoped projection revision as a coherent snapshot fence. Realtime notifications are not a durable event log and have no replay guarantee.

## Synchronization protocol

1. The client opens an authenticated, workspace-authorized SSE connection.
2. The server registers the subscriber and sends `stream.ready`.
3. `stream.ready` means only that new invalidations can reach the connection; it does not mean Live is synchronized.
4. The client buffers subsequent invalidations and fetches the authoritative Live snapshot.
5. The snapshot returns its `workspace_projection_revision` together with the Workstream and session projection rows from one coherent PostgreSQL view.
6. The client discards buffered invalidations whose revision is less than or equal to the snapshot revision.
7. If any buffered invalidation has a newer revision, the client coalesces them and rereads the authoritative snapshot.
8. The client marks Live synchronized only after this reconciliation completes.

The server obtains the workspace revision and projection rows through one SQL statement or one short read-only transaction whose isolation guarantees a stable snapshot. It must not read the revision and rows independently under semantics that could combine different database states.

## Invalidation and reconnect behavior

Projection transactions allocate a workspace-scoped revision only when they produce an effective projection mutation. Every row changed by one transaction receives that revision. The worker calls `pg_notify` inside the same transaction; PostgreSQL delivers the safe invalidation reference only after commit. The API sends browser-facing invalidations containing projection type, entity ID, and projection revision, without repeating the already-authorized workspace ID.

Every initial connection and reconnect repeats the subscribe-before-snapshot protocol. M0 does not reconstruct notifications missed while a listener or client was disconnected. If the API loses its dedicated PostgreSQL listener connection, it marks realtime degraded and closes affected SSE streams so clients reconnect and resynchronize from a snapshot. `Last-Event-ID` is omitted or treated only as transport metadata and never implies durable replay.

Repeated or stale invalidations are harmless: clients may ignore a revision they already hold, and the read API remains authoritative. Durable realtime history, replay cursors, brokers, and multi-region fanout are deferred beyond M0.
