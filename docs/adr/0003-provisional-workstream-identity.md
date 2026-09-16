# Provisional Workstream identity is deterministic and ledger-founded

M0 creates a provisional Workstream UUID with `UUIDv5(workspace_namespace, "provisional-workstream:v1:" + creating_source_id + ":" + creating_event_id)`. The namespace is the immutable internal workspace UUID, or a stable deterministic UUID derived from it; it is identity scope, not a security secret. The Workstream persists `identity_scheme_version = "provisional-workstream:v1"`, `created_from_source_id`, and `created_from_event_id` so isolated replay independently reproduces its identity from accepted facts.

The founding event is the first eligible accepted event that causes provisional creation in deterministic ledger-acceptance processing order. It is not the event with the earliest source occurrence or observation timestamp. Once founded, later evidence—including evidence with an earlier source timestamp—never renames or recreates the Workstream. Semantic lifecycle ordering may be reconsidered independently of stable entity identity. Later sessions may attach without changing the founding identity.

Replay identity invariant: the same workspace, founding source, founding accepted event, and identity scheme version produce the same Workstream UUID. The founding source ID comes from the accepted canonical ledger, not an untrusted payload claim. Including the source aligns the derivation with canonical event identity `(workspace_id, source_id, event_id)` and prevents source-distinct reuse of an event ID from merging provisional Workstreams.

Required identity contract fixture: two eligible founding events with the same `event_id` from two different registered sources, for distinct sessions with no existing membership, produce two different provisional Workstream UUIDs. Replaying each founding event independently reproduces its original UUID.

Workspace names, repository identity, path-derived identifiers, and secret workspace derivation keys are not namespace inputs. Labels, paths, branches, and PR numbers do not determine Workstream identity.

Random UUIDs plus a copied live mapping were rejected because they would not independently reproduce identity from the ledger. Synthetic `workstream.created` facts were rejected because they would introduce another durable fact family solely for M0 identity allocation. Changing this scheme after identities exist requires explicit versioning and migration; correlation and merge/split lineage remain deferred beyond M0.
