# Abisso — Canonical Agent Event and Telemetry Specification

> **Source:** `Abisso_Canonical_Agent_Event_and_Telemetry_Specification_v0.2_FROZEN.docx`  
> **Version:** 0.2 — FROZEN  
> **Role:** Authoritative V0 canonical telemetry and adapter contract  
> **Repository note:** This is an agent-readable Markdown mirror of the authoritative DOCX. Provider-specific implementation must preserve this contract rather than redefine canonical semantics.

---

**Canonical Agent Event and Telemetry Specification v0.2**

Provider neutral implementation contract for V0 collectors adapters and ingestion

**Owner:** Founder

**Version: 0.2**

**Date:** 15 September 2026

**Status:** DECIDED FOR V0 unless marked DEFERRED

**Product category:** Engineering Agent Control Plane

## Normative language

The terms MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are normative. DECIDED FOR V0 defines an implementation and release constraint. DEFERRED identifies a deliberate non-decision and is not permission to add the behavior to V0.

# 1 Document purpose scope authority and relationships

This specification defines the provider-neutral telemetry contract between the Abisso macOS collector, the Claude Code and Codex adapters, canonical ingestion, the event ledger, and downstream projections and detectors. It is specific enough to implement collectors and backend validation and to build shared adapter contract tests.

The Product Thesis and Founding Charter v1.0 FROZEN remains authoritative for company and product strategy. The V0 Product Requirements Document v0.2 FROZEN remains authoritative for user-visible V0 scope, behavior, acceptance criteria, and detector release gates. The System Design and Technical Architecture v0.2 FROZEN remains authoritative for system boundaries, storage, processing, deployment, macOS-first alpha support, and privacy enforcement before buffering or transmission. This document refines those decisions without changing them.

This document owns the canonical event vocabulary, event envelope, time and identity semantics, provenance and confidence rules, privacy classifications, capability declarations, adapter mapping rules, acceptance behavior, replay behavior, and telemetry contract tests.

This document does not define the complete Work Graph schema, correlation storage model, detector algorithms, notification behavior, retention schedule, encryption design, access-control model, or incident response program. Document 5 owns the detailed Work Graph. Document 6 owns the complete security and privacy architecture. GitHub webhook contracts remain part of the GitHub integration boundary; this document defines only the local Git context observations needed for canonical correlation.

# 2 Canonical telemetry goals and explicit non goals

## 2.1 Goals

- Give Claude Code and Codex one stable event language without erasing provider provenance.

- Represent observed facts separately from collector- or server-derived facts. Browser corrections and user actions use a separate application and audit action contract.

- Preserve uncertainty and unavailable evidence so downstream logic does not treat missing data as false.

- Accept immutable events that can be replayed deterministically into new projections.

- Enforce privacy minimization locally before any record enters the shared outbound queue.

- Support the three alpha detector gates: Waiting for Human, Repeated Failure, and Overlapping or Conflicting Work.

- Carry only the metadata needed for V0 product behavior and quality operations.

- Remain small enough for a solo founder to implement, test, version, and support.

## 2.2 Non goals

- A universal coding-agent protocol or OpenTelemetry replacement.

- Full provider transcript fidelity or forensic session reconstruction.

- Raw prompts, responses, source code, diffs, terminal output, or command-output capture.

- The Work Graph node and edge schema.

- Cross-workspace identity matching or globally stable path fingerprints.

- Employee activity measurement, idle-time measurement, keystroke tracking, or productivity scoring.

- Automatic price inference when a provider has not supplied an authoritative cost.

- Provider-specific fields in canonical product logic.

- Support for providers other than Claude Code and Codex in V0.

# 3 Design principles

| **Principle** | **V0 rule** |
|----|----|
| Vendor-neutral semantics | Core event kinds describe engineering activity, never a provider UI concept. |
| Fact separation | Every local/provider telemetry fact is observed or derived. The class describes the semantic claim, not deterministic transport or privacy transformation. |
| Provenance | Each fact identifies its reporting source, adapter, acquisition method, and evidence references where applicable. |
| Honest uncertainty | Unknown and unavailable states remain explicit. False is emitted only when directly observed or validly asserted. |
| Immutable acceptance | An accepted ledger event is never mutated or deleted in place as a correction. |
| Replayability | A projector can rebuild state from accepted events, schema rules, and versioned derivations. |
| Conservative evolution | Minor versions add optional meaning. Breaking interpretation requires a new major version. |
| Privacy minimization | The collector allowlist admits only required metadata after exclusions, privacy checks, and redaction. |
| Local policy authority | Pause, private-session, and exclusion decisions are enforced before queue insertion. |
| Capability-aware logic | Core modules use canonical facts plus declared capabilities, not assumptions about providers. |

# 4 Terminology and entity references

| **Term** | **Meaning** |
|----|----|
| Event | Immutable accepted statement about an occurrence, state transition, observation, or correction. |
| Envelope | Common metadata shared by every event. |
| Payload | Event-kind-specific canonical fields. |
| Source | A concrete producer stream such as one provider session adapter or the collector itself. |
| Provider | Claude Code, Codex, local collector, or Abisso. Git is an observation domain, not an agent provider. |
| Session | One provider-defined or collector-inferred agent execution interval. |
| Workspace | The Abisso tenant and correlation boundary. |
| Machine | A registered collector installation; its identifier is workspace-scoped. |
| Entity reference | Typed opaque reference used to associate events without embedding a graph schema. |
| Capability | Declared evidence that an adapter can, cannot, or conditionally can produce. |
| Accepted | Validated, policy-compliant, durably appended event. |
| Quarantined | Stored outside canonical interpretation pending explicit support or inspection. |
| Rejected | Not accepted or interpreted; safe reason metadata may be retained. |
| Extension map | Namespaced provider-specific data isolated from canonical logic. |

Entity references use { "type": "session", "id": "ses\_..." }. V0 reference types are session, machine, repository, worktree, file, artifact, check, and collector. Workstream, task, pull request, review, deployment, and user-action relationships are owned by later documents or other ingestion contracts. Canonical events may carry correlation hints but MUST NOT assert undocumented Work Graph edges.

# 5 Canonical envelope specification

Every event MUST conform to this top-level shape. Additional top-level keys are rejected.

{\
"schema_version": "1.0",\
"event_id": "evt_01J...",\
"event_kind": "session.started",\
"workspace_id": "ws_01J...",\
"user_id": "usr_01J...",\
"machine_id": "mac_01J...",\
"source": {\
"source_id": "src_01J...",\
"provider": "codex",\
"provider_version": "1.2.3",\
"adapter_name": "codex_local",\
"adapter_version": "0.1.0",\
"stream_id": "str_01J...",\
"source_sequence": 18\
},\
"session_id": "ses_01J...",\
"occurred_at": "2026-09-15T08:11:42.318Z",\
"observed_at": "2026-09-15T08:11:42.701Z",\
"received_at": null,\
"clock": { "quality": "synchronized", "estimated_error_ms": 120 },\
"fact_class": "observed",\
"provenance": { "method": "provider_structured_event", "evidence_refs": \[\] },\
"confidence": null,\
"privacy": { "event_class": "operational_metadata", "policy_version": "pv_7" },\
"capability_snapshot_id": "cap_01J...",\
"payload": {},\
"extensions": {}\
}

received_at is null on the wire and MUST be assigned by the server before durable acceptance. session_id is required for session-bound events and omitted for collector or adapter health events. user_id is required when the collector can bind the event to an authenticated local user; otherwise the event is rejected in V0 rather than accepted as tenant-orphaned telemetry. capability_snapshot_id is required for capability-dependent provider and session events after a declaration exists. It MUST be omitted for capabilities.declared and MAY be omitted for collector bootstrap or health events before any capability snapshot exists. Subsequent adapter events MUST reference the active accepted capability declaration.

# 6 Identity and scope

| **Identity** | **Generation and scope** | **Rule** |
|----|----|----|
| event_id | Collector-generated UUIDv7 or ULID-like opaque ID | Globally unique enough for dedupe; stable across retries. |
| source_id | Server-issued or deterministically registered source ID | Identifies one adapter producer on one machine. |
| machine_id | Server-issued opaque ID | Unique only within the workspace; never hardware serial, MAC address, hostname, or OS account name. |
| workspace_id | Server-issued tenant ID | Mandatory acceptance and authorization boundary. |
| user_id | Server-issued Abisso user ID | Exactly one workspace per user in V0. |
| session_id | Canonical opaque ID | Stable for one logical provider session; derived mapping material remains local or protected. |
| provider_session_ref | Optional keyed opaque reference in extension quarantine | MUST NOT contain the raw provider session identifier if it can expose local data. |
| stream_id | Collector-generated boot or adapter-stream ID | Separates sequence domains after restart or adapter reset. |

Provider identity values allowed in core V0 are claude_code, codex, local_collector, and abisso. git appears as a provenance method or payload domain, not as an agent provider. A provider change during one canonical session is not supported; adapters create distinct sessions and later correlation may relate them.

Path-derived identifiers MUST use a workspace-scoped keyed derivation. The input is a normalized path relative to an approved repository root plus an identifier type and derivation version. The key is unique to the workspace. The result MUST be truncated only to a collision-resistant length approved in document 6. The raw absolute path, username, home directory, and unsalted hash MUST NOT leave the device.

# 7 Timestamp model

| **Field** | **Meaning** | **Authority** |
|----|----|----|
| occurred_at | Best source occurrence time | Provider when structured; otherwise collector derived. |
| observed_at | Time the collector observed or derived the event | Collector wall clock. |
| received_at | Time the server durably accepted the event | Server clock; assigned on acceptance. |
| source_sequence | Monotonic integer within source_id and stream_id | Source or adapter when available. |

Clock quality is synchronized, estimated, unsynchronized, or unknown. estimated_error_ms MAY be set only when the collector has a defensible bound. Events with invalid timestamps are rejected. A source time more than the configured future-skew bound is accepted only with clock.quality=unsynchronized and ordered primarily by observation and receipt time. No global total order is claimed.

Downstream ordering uses source sequence within a stream when available, then occurred time bounded by clock quality, then observed time, then received time and event ID as deterministic tie-breakers. Sequence gaps mean Unknown evidence, not proof that no event occurred.

# 8 Provenance model and fact classes

fact_class is one of observed or derived:

| **Class** | **Definition** | **Examples** |
|----|----|----|
| observed | Direct structured, collector, or operating-system observation with no semantic inference beyond lossless parsing or deterministic representation transformation. | Provider reports waiting; provider reports a file modification represented by a keyed file_ref; test result reports failed; Git reports current branch. |
| derived | Collector or server makes a bounded semantic inference from allowed observations. | Session continuity lost after heartbeat threshold; collector-derived waiting; failure classification or safe failure signature. |

provenance.method values in V0 are provider_structured_event, provider_status_api, provider_local_state, process_observation, filesystem_metadata, git_command_metadata, collector_timer, and server_derivation. The provenance object MAY include evidence_refs, which are accepted event IDs only. It MUST NOT contain excerpts or raw evidence bodies. Browser corrections, user assertions, and Work Graph relationship corrections are outside this local/provider telemetry contract and enter the application and audit action path owned by later documents.

A derived event MUST include derivation with name, version, and ordered input_event_ids. fact_class describes the semantic claim, not its transport or privacy representation. Deterministic normalization, redaction, keyed pseudonymization, unit normalization, and safe renaming MUST NOT by themselves change an observed semantic fact into derived. Observed events MUST NOT cite a confidence score merely because the adapter parser is imperfect; parser support belongs in adapter compatibility and health.

# 9 Confidence model

Confidence is allowed only for derived facts whose uncertainty is semantic rather than merely unavailable. It uses:

{ "band": "high", "score": 0.91, "basis": "waiting_signature_v2" }

band is low, medium, or high. score is optional and, when present, is in \[0,1\]. basis names a versioned rule or model. Thresholds belong to detector specifications, not this envelope.

Confidence MUST be null for directly observed facts, cost amounts reported by a provider, capability declarations, and collector health. Confidence MUST NOT be used to disguise missing evidence, an unsupported provider version, stale input, or a privacy exclusion. These conditions use explicit availability states.

# 10 Privacy classification model

Every payload field is assigned a schema-level privacy class; producers do not choose a weaker class at runtime.

| **Class** | **V0 treatment** | **Examples** |
|----|----|----|
| public_metadata | Allowed | Schema version, event kind, adapter semantic version. |
| operational_metadata | Allowed under workspace policy | Lifecycle state, counts, durations, exit category, token totals. |
| pseudonymous_identifier | Allowed when opaque and scoped | Session ID, keyed file ID, repository ID. |
| sensitive_metadata | Denied unless specifically allowlisted and transformed | Relative path display value, branch name, tool name. |
| content | Prohibited by default | Prompt, response, source code, diff, transcript, output body. |
| secret | Always prohibited | Tokens, credentials, environment values, private keys. |
| personal_data | Prohibited unless an explicit later specification permits it | OS username, hostname, email found in local content. |

The collector MUST evaluate repository selection, exclusions, private state, field allowlists, transformations, secret detection, and payload limits before serialization into the outbound queue. The outbound preview MUST render the exact post-policy record that may be transmitted.

Availability values used wherever evidence may be absent are available, unavailable, unknown, stale, excluded, private, and not_collected. false, zero, an empty list, and null MUST NOT substitute for these states.

# 11 Allowed payload categories for V0

- Session lifecycle state and bounded state reason codes.

- Provider and adapter version metadata.

- Capability declarations and freshness.

- Monotonic counters, durations, safe counts, and structured result categories.

- Tool category and invocation correlation ID where justified; no arguments or output.

- Repository-scoped opaque IDs, branch-ref opaque IDs, commit OIDs when policy allows, and clean or dirty state.

- Workspace-scoped keyed file or subsystem IDs and coarse change kind.

- Test or check name as a keyed or policy-approved label, status, counts, duration, and safe signature.

- Token and request usage reported by a provider, with unit and provenance.

- Provider-observed monetary cost when supplied with currency and basis.

- Collector and adapter health states and safe error codes.

- Privacy-control transitions needed to prevent downstream claims across an evidence gap.

# 12 Prohibited by default payload categories

Raw source code, diffs, patches, prompts, agent responses, chain-of-thought, terminal transcripts, command text, command arguments, command output bodies, test failure messages, stack traces, logs containing user content, secrets, environment-variable names or values, keystrokes, mouse activity, screenshots, clipboard data, browser history, personal messages, idle time, process-wide command lines, absolute paths, home-directory names, hostnames, device serials, MAC addresses, and globally stable hashes of local identifiers MUST NOT be emitted.

Repository names, branch names, relative paths, test names, tool names, and commit messages are denied unless a workspace policy explicitly permits the specific transformed field. Commit messages remain prohibited in V0. Policy approval cannot permit categories marked always prohibited.

# 13 Event lifecycle and acceptance rules

1.  The adapter observes provider or local evidence.

2.  The collector normalizes it into a canonical candidate.

3.  Local policy applies private state, pause state, repository selection, exclusions, field allowlists, transformations, redaction, size limits, and secret scanning.

4.  If private, the candidate is discarded before shared queue insertion. If paused, no new observation occurs and no candidate is produced.

5.  An approved candidate receives a stable event ID and enters the encrypted outbound queue.

6.  The server authenticates source and workspace, validates schema and semantics, enforces limits and privacy policy compatibility, deduplicates, stamps received_at, and appends accepted events atomically.

7.  The server acknowledges accepted, duplicate, rejected, and quarantined records independently within a batch.

Acceptance requires a known major and supported minor schema, known event kind, exact required fields, valid enum values, authorized workspace/source/machine, acceptable time bounds, payload limit compliance, and no prohibited fields. Unknown top-level or canonical payload fields are rejected. If the canonical portion is independently valid, it MAY be accepted while an unknown provider extension is quarantined or dropped separately according to policy. If canonical interpretation or validity depends on that extension, the entire event is quarantined and is not accepted. Invalid core canonical events are rejected.

# 14 Schema versioning and compatibility policy

schema_version uses MAJOR.MINOR. V0 emits 1.0.

- A minor version MAY add optional fields, enum values only where consumers are required to handle unknown values safely, or new event kinds that older servers explicitly reject or quarantine.

- A major version is required for removed or renamed fields, changed units, changed identity/time meaning, newly required fields, or reinterpretation of an existing event.

- Producers advertise supported schema versions in capability declarations.

- The server maintains an explicit acceptance window. It MUST NOT guess or partially interpret an unknown version.

- Down-conversion is permitted only through a tested explicit transformer that emits a new event and records the original event ID and transformer version.

- Golden fixtures are versioned and immutable after release.

# 15 Canonical event taxonomy for V0

| **Family** | **Event kinds** | **V0 decision and reason** |
|----|----|----|
| Session | session.started, session.activity, session.waiting_for_human, session.resumed, session.completed, session.failed, session.stopped, session.lost | Required for live state, Waiting for Human, continuity, and outcomes. |
| Tool | tool.started, tool.completed | Allowed only when the provider supplies structured tool boundaries and policy permits the safe category. Supports failure evidence without content. |
| File and artifact | file.touched, artifact.changed | Metadata only; required for overlap evidence. |
| Checks | check.completed | One terminal result event is sufficient in V0; starts and logs are not canonical. |
| Usage and cost | usage.observed, cost.observed | Separate physical usage from money and prohibit invented cost. |
| Git | git.context_observed | Local correlation snapshot, not a complete Git audit trail. |
| Health | collector.health, adapter.health, capabilities.declared | Required for truthful degraded and unavailable states. |
| Privacy state | collection.state_changed | Records shared-observation gaps without exposing private-session activity. |
| Correction | event.corrected | Provider, adapter, or system correction or retraction that references an accepted event and supplies a bounded replacement observation; original remains immutable. |

session.activity is a rate-limited liveness/progress signal, not a transcript surrogate. session.lost is a derived continuity state used when evidence ends without a terminal event. No generic custom event exists.

# 16 Canonical payload schemas

## 16.1 Session family

| **Kind** | **Required payload fields** | **Optional payload fields** |
|----|----|----|
| session.started | lifecycle_state="active", start_reason | provider_mode, worktree_ref, repo_ref |
| session.activity | activity_class, progress_counter, availability | tool_invocation_id, artifact_count_delta |
| session.waiting_for_human | dependency_category, signal, since_at | requested_action_class, deadline_at |
| session.resumed | resume_reason, previous_state | trigger_event_id |
| session.completed | result="completed" | duration_ms, output_artifact_count |
| session.failed | result="failed", failure | duration_ms, retryable |
| session.stopped | result="stopped", stop_actor | reason_code |
| session.lost | last_seen_at, loss_reason, evidence_availability | grace_period_ms |

activity_class is thinking, tool_execution, editing_metadata, checking, or heartbeat. It MUST be derived from structured state, not inferred from keystrokes, mouse activity, CPU use, or idle time. progress_counter is a session-local monotonically increasing count of locally approved material observations emitted by the adapter or collector; it is not a productivity score and does not imply server acceptance.

## 16.2 Tool family

| **Kind** | **Required** | **Optional** |
|----|----|----|
| tool.started | tool_invocation_id, tool_category | provider_tool_code in extension quarantine |
| tool.completed | tool_invocation_id, tool_category, result, duration_ms | safe_failure_signature, exit_category |

tool_category is shell, file_read, file_write, search, test, build, version_control, network, or other. Tool names, arguments, commands, paths, output, and URLs are not core fields. result is succeeded, failed, cancelled, or unknown.

## 16.3 File artifact and check families

| **Kind** | **Required** | **Optional** |
|----|----|----|
| file.touched | file_ref, change_kind, path_policy | subsystem_ref, language_family |
| artifact.changed | artifact_ref, artifact_type, change_kind | repo_ref |
| check.completed | check_ref, check_type, status, duration_ms | passed_count, failed_count, skipped_count, safe_failure_signature |

change_kind is read, created, modified, deleted, or renamed. Rename MUST use one opaque pre-change ref and one opaque post-change ref and MUST NOT expose raw paths. check_type is test, lint, typecheck, build, or other. status is passed, failed, cancelled, or unknown.

## 16.4 Usage cost and Git families

| **Kind** | **Required** | **Optional** |
|----|----|----|
| usage.observed | metric, quantity, unit, measurement_scope | model_class, provider_request_count |
| cost.observed | amount_minor, currency, cost_scope, price_basis | provider_invoice_ref as keyed opaque ref |
| git.context_observed | repo_ref, worktree_ref, head_state, dirty_state | commit_oid, branch_ref, base_commit_oid, changed_file_refs |

Usage metrics allowed in V0 are input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, requests, and provider_compute_units. Unknown metrics are quarantined until explicitly added. Quantities are non-negative integers. Currency uses ISO 4217. amount_minor is an integer in the currency minor unit. price_basis.kind must be provider_reported; estimates are not cost.observed.

## 16.5 Health capability privacy and correction families

| **Kind** | **Required** | **Optional** |
|----|----|----|
| collector.health | state, health_code, since_at | queue_depth_bucket, last_ack_at |
| adapter.health | state, health_code, provider, supported | detected_provider_version, last_success_at |
| capabilities.declared | declaration_id, provider, capabilities, valid_from | valid_until |
| collection.state_changed | previous_state, new_state, actor, queue_disposition | policy_version |
| event.corrected | target_event_id, correction_reason, replacement_observation, correction_source | supersedes_correction_id |

Health state is healthy, degraded, unavailable, or incompatible. Health codes come from a small versioned registry and contain no raw error text. Collection state is active, paused, or private_next_session_armed. No event is emitted from inside a private session. The shared stream may record the transition into private mode and the return to active, so the existence and elapsed duration of a collection gap may be visible or inferable from those transition timestamps. It MUST NOT record the private-session identity, provider, repository, activity, outcome, content, or a direct private-session duration field. event.corrected is limited to provider, adapter, or system correction and retraction; browser and user corrections use the separate application and audit action path.

# 17 Required and optional field rules

Required fields must be present and non-null. Optional fields are omitted when not known; producers MUST NOT emit placeholder values. A nullable field is allowed only where the schema explicitly says that the server assigns it, as with received_at. Empty strings are invalid. Empty arrays are allowed only when an observed empty set is meaningful and capability is available. Numbers include their unit in the field definition or adjacent unit field.

Conditional requirements are part of the schema. A derived event requires derivation. A confidence object requires fact_class=derived. A session event requires session_id. capability_snapshot_id MUST be omitted for capabilities.declared itself. It MAY be omitted for collector bootstrap or health events emitted before any capability snapshot exists. After a declaration exists, capability-dependent provider and session events MUST reference the active accepted declaration. A failure result requires a failure object or safe failure signature when the event kind requires it. A field marked sensitive metadata requires a matching policy transform declaration.

# 18 Capability declaration model

A capability declaration is a signed or authenticated snapshot from one adapter source. Each capability entry has:

{\
"name": "session.waiting_structured",\
"status": "available",\
"quality": "direct",\
"reason_code": null,\
"freshness_ms": 0\
}

status is available, unavailable, excluded, not_collected, or unknown. quality is direct, derived, or none. Capability names required for V0 are:

- session.lifecycle

- session.waiting_structured

- session.activity_structured

- tool.boundaries

- file.touch_metadata

- check.results

- usage.tokens

- cost.provider_reported

- git.local_context

- source.sequence

Declarations are replaced, not patched. capabilities.declared MUST omit capability_snapshot_id because the accepted declaration establishes that identifier. Collector bootstrap and health events MAY omit capability_snapshot_id before any declaration exists. Once a declaration is accepted, every subsequent capability-dependent provider or session event MUST reference the active accepted declaration through capability_snapshot_id. A missing or expired declaration makes dependent evidence Unknown or Stale. unavailable means the source cannot provide the evidence. available with no event may support absence only where the capability contract explicitly guarantees exhaustive emission.

# 19 Provider extension map and quarantine boundary

extensions is a map keyed by reverse-domain namespace and explicit version, for example com.anthropic.claude_code/1. Namespace owners define a JSON schema, privacy classification, size limit, and retention rule. Extension payloads are locally allowlisted and server validated.

Core projectors, detectors, user interfaces, alerts, and billing MUST NOT read provider extensions. An adapter transformer may read its own extension to produce a new canonical event under a versioned derivation. When the canonical portion is independently valid, the server MAY accept it and quarantine or drop an unknown namespace, version, or field separately according to policy. When canonical interpretation or validity depends on the extension, the entire event is quarantined and MUST NOT be accepted. Quarantine records are access-restricted, size-bounded, and excluded from replay until explicitly promoted by a software release. A provider extension cannot override envelope identity, time, privacy, fact class, or canonical payload.

# 20 Claude Code adapter mapping

| **Claude Code evidence** | **Canonical output** | **Capability and rule** |
|----|----|----|
| Structured session initialization | session.started | session.lifecycle=available; preserve Claude Code as provider. |
| Structured assistant or execution progress boundary | Rate-limited session.activity | Requires session.activity_structured; no text. |
| Structured permission or user-input request | session.waiting_for_human | Direct observation when category can be safely mapped. |
| First structured activity after waiting | session.resumed | Previous state must be waiting. |
| Structured successful termination | session.completed | Do not infer success from process disappearance. |
| Structured error termination | session.failed | Normalize safe category/signature; discard message body. |
| User/process cancellation signal | session.stopped | Preserve actor only as user, provider, collector, or unknown. |
| Structured tool use boundaries | Tool events | Only when IDs and status are reliable and arguments/output are removed. |
| Structured file metadata | file.touched | Only approved repo-relative keyed IDs. |
| Structured token usage | usage.observed | Preserve units and scope; no price inference. |
| Provider-reported money | cost.observed | Emit only if Claude Code supplies an authoritative amount. |
| Unsupported provider version | adapter.health incompatible | Stop unsafe parsing; lifecycle evidence becomes unavailable. |

The adapter MUST declare capabilities based on tested Claude Code versions, not brand-level assumptions. If evidence is available only through unsafe text parsing, the capability is unavailable in V0 unless a bounded, content-free structured marker exists and has golden fixtures.

# 21 Codex adapter mapping

| **Codex evidence** | **Canonical output** | **Capability and rule** |
|----|----|----|
| Structured task/session creation | session.started | Map one Codex execution interval to one canonical session. |
| Structured progress or tool boundary | Rate-limited session.activity | No message, reasoning, or tool payload bodies. |
| Approval or explicit user-input request | session.waiting_for_human | Map safe dependency category; omit request text. |
| Execution continues after request | session.resumed | Reference the waiting event when available. |
| Structured completion | session.completed | Completion is provider-observed, not outcome acceptance. |
| Structured failure | session.failed | Safe category and signature only. |
| User interruption or provider cancellation | session.stopped | Use bounded actor and reason codes. |
| Structured tool lifecycle | Tool events | Only safe category, correlation ID, status, and duration. |
| File-change metadata | file.touched or artifact.changed | Keyed path refs; no diff or patch. |
| Test result surfaced structurally | check.completed | Counts and safe signature only. |
| Token usage surfaced structurally | usage.observed | Separate token categories when available. |
| Provider-reported monetary amount | cost.observed | Never calculate from an unversioned price assumption. |
| Unsupported Codex build/schema | adapter.health incompatible | Disable unsafe parsing and surface degraded data. |

Codex task summaries, messages, reasoning traces, terminal output, screenshots, and tool arguments are prohibited inputs. Adapter compatibility is pinned to concrete fixture versions.

# 22 Git context mapping from local observations

The collector MAY run bounded read-only Git metadata commands inside a selected repository. It emits git.context_observed at session start, material context change, and a rate-limited checkpoint. It MUST NOT emit a command transcript.

repo_ref is server-issued or workspace-keyed from a selected repository identity. worktree_ref is workspace-keyed. branch_ref is a workspace-keyed derivation of the full ref unless policy explicitly permits display names. Commit OIDs MAY be emitted because they are repository identifiers, but only for selected repositories and under policy. Detached HEAD uses head_state=detached. Missing Git uses availability unavailable; excluded repositories use excluded; dirty status uses clean, dirty, or unknown.

Changed-file sets are bounded. If the set exceeds the limit, emit a count, a deterministic sampled or top-level subsystem set only if the policy specifies the method, and truncated=true. Never imply that a truncated set is complete.

# 23 Usage and cost normalization

Usage and money are separate ledgers. usage.observed records provider-measured physical or commercial units. cost.observed records money only when a provider supplies an authoritative amount for the stated scope.

Every usage event names metric, integer quantity, unit, measurement scope (request, session_delta, or session_cumulative), and provider. Cumulative readings require a monotonic counter ID. The server derives deltas and records resets without altering the source event. Token categories are never collapsed if doing so would double count cached or reasoning tokens.

Every cost event includes integer minor units, ISO currency, scope, provider-reported basis, and observation time. Exchange-rate conversion is DEFERRED. Price-catalog estimates are DEFERRED as canonical telemetry. Product projections may later show an explicitly labeled estimate under a separate derived model, but MUST preserve observed usage and MUST NOT emit that estimate as cost.observed. Missing cost is Unavailable or Unknown, never zero.

# 24 Human dependency category model

dependency_category is one of:

| **Category** | **Meaning** |
|----|----|
| approval | Provider is blocked on an explicit authorization or permission decision. |
| clarification | Provider requests information needed to continue. |
| choice | Provider presents alternatives and requires selection. |
| credential_or_access | Work cannot continue without access supplied or granted by a person. |
| external_action | A human must perform an action outside the provider session. |
| review_or_acceptance | Provider has produced a result and awaits explicit review or acceptance. |
| unknown_human_dependency | Direct waiting is known but the safe category cannot be determined. |

signal is provider_explicit or collector_derived. Provider-explicit waiting is observed and has no confidence. Derived waiting requires allowed structural evidence, a derivation version, confidence, and a grace period. Silence alone, lack of keystrokes, CPU inactivity, elapsed time, or an open terminal MUST NOT establish waiting for human.

# 25 Failure and signature normalization

A failure object contains:

{\
"category": "test_failure",\
"signature": "fsig_v1_7R4...",\
"signature_version": "failure_signature_v1",\
"occurrence_index": 3,\
"availability": "available"\
}

V0 categories are tool_failure, test_failure, build_failure, permission_denied, network_failure, provider_error, resource_limit, cancelled, and unknown_failure.

The signature is a workspace-scoped keyed derivation over a bounded structured tuple such as category, safe exit category, check reference, tool category, and normalized provider error code. It MUST NOT hash raw output, exception messages, command text, file paths, URLs, prompts, or stack traces. The same safe tuple may correlate within one workspace but not across workspaces. Repeated Failure detectors consume signatures plus sequence and progress evidence; the telemetry layer does not declare a detector finding.

# 26 File and subsystem overlap telemetry

Overlap detection uses file.touched and optional artifact.changed metadata. A file reference is deterministically transformed from normalized repository-relative path material using a workspace-specific key, repository scope, identifier-type tag, and derivation version. This privacy-safe representation does not change the semantic fact class: a provider-observed file modification remains fact_class=observed when represented by file_ref. Absolute paths never enter the derivation input sent to the server. Cross-workspace equality is intentionally impossible.

When policy permits displayable relative paths, the collector MAY emit a separately classified display path after exclusion and redaction. Detector logic MUST use opaque refs and MUST continue to work when display paths are absent. Subsystem refs MAY represent approved top-level directories or configured ownership units using the same keyed method. Language family may be emitted from file extension through an allowlisted mapping; filenames and extensions that may carry secrets are not emitted raw.

Each touch event includes change kind and session. A read touch does not imply modification. A modified touch does not prove a persisted Git diff. Overlap logic must distinguish concurrent time windows, shared repository identity, file/subsystem granularity, truncation, excluded data, and stale sessions. Private-session activity is absent by design and cannot be used to warn shared sessions; the product must not imply comprehensive overlap coverage during that evidence gap.

# 27 Pause private-session exclusions and outbound buffer

Pause is a collector-wide local control. The collector MUST commit the paused state before reporting success. While paused it stops new observation and all transmission. Already-approved buffered records remain encrypted and local. The user can preview and explicitly discard them. On resume, retained records may upload in original queue order with their original event IDs and timestamps.

Private next session is a pre-observation policy gate. Events from the private session MUST never enter the shared outbound queue, local shared ledger, crash report, diagnostic log, or server. The collector may maintain the minimum ephemeral local state needed to know when private mode ends, but it is not telemetry and must be destroyed promptly. Shared telemetry may record only the transition into private mode and the return-to-active transition afterward. Those timestamps can reveal or permit inference of the existence and elapsed duration of a collection gap, but telemetry MUST NOT record the private-session identity, provider, repository, activity, outcome, content, or a direct private-session duration field.

Repository and path exclusions run before transformation and queue insertion. Excluded evidence uses an availability state only when needed to explain a known capability gap; it never includes excluded identifiers or counts that could reveal activity. Pause, Private, Excluded, Not Collected, Unavailable, Stale, and Unknown are distinct product states.

# 28 Collector-generated and provider-observed metadata

Provider-observed metadata uses fact_class=observed and identifies the provider acquisition method. fact_class describes the semantic claim. The collector may deterministically normalize, redact, apply keyed pseudonymization, unit-normalize, safely rename, and privacy-filter fields without changing an observed fact to derived when the semantic mapping is lossless and fixture-tested.

Collector-generated metadata is observed when it directly records collector state, local filesystem metadata, or Git metadata. It is derived when it performs actual semantic inference, including collector-derived waiting, session continuity loss, failure classification or signature, and other inferred state. Computing a deterministic privacy-safe identifier alone is a representation transformation and does not make the underlying semantic claim derived. The collector MUST NOT relabel derived semantics as provider-observed. Server-generated detector findings are outside this event taxonomy and reference the accepted evidence events that support them.

# 29 Ordering duplication retries replay and corrections

Events are at-least-once in transport and exactly-once in logical acceptance by (workspace_id, source_id, event_id). A duplicate with byte-equivalent canonical content returns the original acceptance result. Reuse of an event ID with different content is rejected as an identity collision and raises a safe health signal.

No cross-source global order exists. Source sequence orders only one stream. Late events are accepted within retention and compatibility limits and trigger bounded recomputation. Terminal session events do not cause later valid evidence to be discarded; projections apply deterministic precedence and may mark contradictions.

Retries preserve event ID and payload. Batch acknowledgement provides per-event disposition and the highest durable source checkpoint when safe. Replay reads accepted immutable events in deterministic ledger order and applies a named projector/detector version to a shadow projection before swap.

Provider, adapter, and system corrections or retractions are new event.corrected records. Each references the target, reason code, replacement observation, correction source, and time; it never deletes or mutates the original accepted telemetry. Browser and user corrections, including Work Graph relationship corrections, enter the separate authenticated application and audit action path owned by later documents and do not use this telemetry envelope. Correction precedence belongs to projection policy and must be testable.

# 30 Rejected and quarantined event behavior

Rejection reasons are safe codes: unknown_schema, unknown_event_kind, invalid_field, missing_required, identity_mismatch, unauthorized_source, timestamp_invalid, payload_too_large, privacy_policy_violation, cardinality_limit, and event_id_collision. Responses MUST NOT echo prohibited payload material.

For a known envelope version with an unknown provider extension or explicitly experimental namespace, behavior is deterministic. If the canonical portion is independently valid, it MAY be accepted while the unknown extension is quarantined or dropped separately according to policy. If interpretation or validity of the canonical event depends on that extension, the entire event is quarantined and is not accepted. Quarantined records do not enter canonical projectors, detectors, metrics, billing, or user-visible state. Reprocessing requires a software release with a registered schema and explicit promotion job. Invalid core canonical events are rejected, not quarantined for later guesswork.

# 31 Cardinality payload size nesting and free text

| **Limit** | **V0 default** |
|----|----|
| Uncompressed event | 64 KiB maximum |
| Batch | 200 events or 512 KiB compressed, whichever comes first |
| Payload nesting | 4 object levels below payload |
| Arrays | 200 elements unless a narrower field limit applies |
| Extension map | 8 KiB total and 2 namespaces per event |
| Evidence refs | 32 event IDs |
| Changed file refs | 200 per Git snapshot; truncation required above limit |
| Free text | Prohibited in canonical telemetry except registered short codes and approved display labels |
| Code/string length | 128 UTF-8 bytes unless specifically narrower |

High-cardinality labels are opaque IDs with declared scope. Metrics MUST NOT label by file, session, user, branch, repository name, raw error, or extension value. Health codes and reason codes come from registries. Nested arbitrary JSON is prohibited.

# 32 Example canonical events

## 32.1 Claude Code waiting for approval

{\
"schema_version":"1.0","event_id":"evt_cc_wait_01","event_kind":"session.waiting_for_human",\
"workspace_id":"ws_a","user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cc_7",\
"source":{"source_id":"src_cc_a","provider":"claude_code","provider_version":"tested-2026-09",\
"adapter_name":"claude_code_local","adapter_version":"0.1.0","stream_id":"str_4","source_sequence":42},\
"occurred_at":"2026-09-15T08:00:01Z","observed_at":"2026-09-15T08:00:01.180Z","received_at":null,\
"clock":{"quality":"synchronized","estimated_error_ms":100},"fact_class":"observed",\
"provenance":{"method":"provider_structured_event","evidence_refs":\[\]},"confidence":null,\
"privacy":{"event_class":"operational_metadata","policy_version":"pv_7"},\
"capability_snapshot_id":"cap_cc_9",\
"payload":{"dependency_category":"approval","signal":"provider_explicit",\
"since_at":"2026-09-15T08:00:01Z","requested_action_class":"permission_decision"},"extensions":{}\
}

## 32.2 Codex completion

{\
"schema_version":"1.0","event_id":"evt_cx_done_01","event_kind":"session.completed",\
"workspace_id":"ws_a","user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cx_8",\
"source":{"source_id":"src_cx_a","provider":"codex","provider_version":"tested-2026-09",\
"adapter_name":"codex_local","adapter_version":"0.1.0","stream_id":"str_5","source_sequence":19},\
"occurred_at":"2026-09-15T08:12:00Z","observed_at":"2026-09-15T08:12:00.090Z","received_at":null,\
"clock":{"quality":"synchronized","estimated_error_ms":100},"fact_class":"observed",\
"provenance":{"method":"provider_structured_event","evidence_refs":\[\]},"confidence":null,\
"privacy":{"event_class":"operational_metadata","policy_version":"pv_7"},\
"capability_snapshot_id":"cap_cx_3",\
"payload":{"result":"completed","duration_ms":441000,"output_artifact_count":2},"extensions":{}\
}

## 32.3 Git context and overlap evidence

{"schema_version":"1.0","event_id":"evt_git_01","event_kind":"git.context_observed","workspace_id":"ws_a",\
"user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cx_8","source":{"source_id":"src_col_a",\
"provider":"local_collector","provider_version":"0.1.0","adapter_name":"git_metadata",\
"adapter_version":"0.1.0","stream_id":"str_6","source_sequence":8},"occurred_at":"2026-09-15T08:02:00Z",\
"observed_at":"2026-09-15T08:02:00Z","received_at":null,"clock":{"quality":"synchronized",\
"estimated_error_ms":100},"fact_class":"observed","provenance":{"method":"git_command_metadata",\
"evidence_refs":\[\]},"confidence":null,"privacy":{"event_class":"pseudonymous_identifier",\
"policy_version":"pv_7"},"capability_snapshot_id":"cap_git_1","payload":{"repo_ref":"repo_q1",\
"worktree_ref":"wt_k9","head_state":"branch","branch_ref":"br_4f","commit_oid":"8ac54f0",\
"dirty_state":"dirty","changed_file_refs":\["file_31","file_88"\],"truncated":false},"extensions":{}}

{"schema_version":"1.0","event_id":"evt_file_01","event_kind":"file.touched","workspace_id":"ws_a",\
"user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cc_7","source":{"source_id":"src_cc_a",\
"provider":"claude_code","provider_version":"tested-2026-09","adapter_name":"claude_code_local",\
"adapter_version":"0.1.0","stream_id":"str_4","source_sequence":45},"occurred_at":"2026-09-15T08:03:00Z",\
"observed_at":"2026-09-15T08:03:00.1Z","received_at":null,"clock":{"quality":"synchronized",\
"estimated_error_ms":100},"fact_class":"observed","provenance":{"method":"filesystem_metadata",\
"evidence_refs":\[\]},\
"confidence":null,"privacy":{"event_class":"pseudonymous_identifier","policy_version":"pv_7"},\
"capability_snapshot_id":"cap_cc_9","payload":{"file_ref":"file_31","subsystem_ref":"sub_5",\
"change_kind":"modified","path_policy":"keyed_only"},"extensions":{}}

## 32.4 Repeated failure evidence

{"schema_version":"1.0","event_id":"evt_fail_03","event_kind":"tool.completed","workspace_id":"ws_a",\
"user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cx_8","source":{"source_id":"src_cx_a",\
"provider":"codex","provider_version":"tested-2026-09","adapter_name":"codex_local",\
"adapter_version":"0.1.0","stream_id":"str_5","source_sequence":27},"occurred_at":"2026-09-15T08:09:00Z",\
"observed_at":"2026-09-15T08:09:00.1Z","received_at":null,"clock":{"quality":"synchronized",\
"estimated_error_ms":100},"fact_class":"derived","provenance":{"method":"provider_structured_event",\
"evidence_refs":\[\]},"derivation":{"name":"failure_signature","version":"1","input_event_ids":\[\]},\
"confidence":null,"privacy":{"event_class":"operational_metadata","policy_version":"pv_7"},\
"capability_snapshot_id":"cap_cx_3","payload":{"tool_invocation_id":"tin_27","tool_category":"test",\
"result":"failed","duration_ms":19000,"exit_category":"nonzero","safe_failure_signature":"fsig_v1_7R4",\
"failure_category":"test_failure","occurrence_index":3},"extensions":{}}

## 32.5 Usage cost capability declaration and adapter health

{"schema_version":"1.0","event_id":"evt_usage_01","event_kind":"usage.observed","workspace_id":"ws_a",\
"user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cc_7","source":{"source_id":"src_cc_a",\
"provider":"claude_code","provider_version":"tested-2026-09","adapter_name":"claude_code_local",\
"adapter_version":"0.1.0","stream_id":"str_4","source_sequence":48},"occurred_at":"2026-09-15T08:10:00Z",\
"observed_at":"2026-09-15T08:10:00Z","received_at":null,"clock":{"quality":"synchronized",\
"estimated_error_ms":100},"fact_class":"observed","provenance":{"method":"provider_structured_event",\
"evidence_refs":\[\]},"confidence":null,"privacy":{"event_class":"operational_metadata",\
"policy_version":"pv_7"},"capability_snapshot_id":"cap_cc_9","payload":{"metric":"input_tokens",\
"quantity":18420,"unit":"tokens","measurement_scope":"session_cumulative","counter_id":"ctr_in_1"},\
"extensions":{}}

{"schema_version":"1.0","event_id":"evt_cost_01","event_kind":"cost.observed","workspace_id":"ws_a",\
"user_id":"usr_a","machine_id":"mac_a","session_id":"ses_cc_7","source":{"source_id":"src_cc_a",\
"provider":"claude_code","provider_version":"tested-2026-09","adapter_name":"claude_code_local",\
"adapter_version":"0.1.0","stream_id":"str_4","source_sequence":49},"occurred_at":"2026-09-15T08:10:00Z",\
"observed_at":"2026-09-15T08:10:00Z","received_at":null,"clock":{"quality":"synchronized",\
"estimated_error_ms":100},"fact_class":"observed","provenance":{"method":"provider_structured_event",\
"evidence_refs":\[\]},"confidence":null,"privacy":{"event_class":"operational_metadata",\
"policy_version":"pv_7"},"capability_snapshot_id":"cap_cc_9","payload":{"amount_minor":37,\
"currency":"USD","cost_scope":"session_cumulative","price_basis":{"kind":"provider_reported",\
"basis_ref":"pb_2026_09"}},"extensions":{}}

{\
"schema_version":"1.0","event_id":"evt_cap_01","event_kind":"capabilities.declared",\
"workspace_id":"ws_a","user_id":"usr_a","machine_id":"mac_a","source":{"source_id":"src_cx_a",\
"provider":"local_collector","provider_version":"0.1.0","adapter_name":"codex_local",\
"adapter_version":"0.1.0","stream_id":"str_5","source_sequence":29},\
"occurred_at":"2026-09-15T08:14:59Z","observed_at":"2026-09-15T08:14:59Z","received_at":null,\
"clock":{"quality":"synchronized","estimated_error_ms":100},"fact_class":"observed",\
"provenance":{"method":"provider_local_state","evidence_refs":\[\]},"confidence":null,\
"privacy":{"event_class":"operational_metadata","policy_version":"pv_7"},\
"payload":{"declaration_id":"cap_cx_4","provider":"codex","valid_from":"2026-09-15T08:14:59Z",\
"capabilities":\[{"name":"session.lifecycle","status":"available","quality":"direct",\
"reason_code":null,"freshness_ms":0}\]},"extensions":{}\
}

{"schema_version":"1.0","event_id":"evt_ah_01","event_kind":"adapter.health","workspace_id":"ws_a",\
"user_id":"usr_a","machine_id":"mac_a","source":{"source_id":"src_cx_a","provider":"local_collector",\
"provider_version":"0.1.0","adapter_name":"codex_local","adapter_version":"0.1.0","stream_id":"str_5",\
"source_sequence":30},"occurred_at":"2026-09-15T08:15:00Z","observed_at":"2026-09-15T08:15:00Z",\
"received_at":null,"clock":{"quality":"synchronized","estimated_error_ms":100},"fact_class":"observed",\
"provenance":{"method":"provider_local_state","evidence_refs":\[\]},"confidence":null,\
"privacy":{"event_class":"operational_metadata","policy_version":"pv_7"},\
"capability_snapshot_id":"cap_cx_4","payload":{"state":"incompatible",\
"health_code":"PROVIDER_VERSION_UNTESTED","provider":"codex","supported":false,\
"detected_provider_version":"2026.09.x"},"extensions":{}}

# 33 Negative examples

The following records MUST fail local policy or server validation:

{"event_kind":"session.activity","payload":{"prompt":"Fix auth.ts","response":"I found the password..."}}

{"event_kind":"tool.completed","payload":{"command":"npm test","output":"AssertionError at\
/Users/alice/secret/client.ts"}}

{"event_kind":"file.touched","payload":{"path":"/Users/alice/acme-secret/payroll.csv",\
"path_hash":"sha256:globally-stable"}}

{"event_kind":"cost.observed","payload":{"amount_minor":42,"currency":"USD",\
"price_basis":{"kind":"guessed_from_public_price_page"}}}

Also prohibited are screenshots of agent UI, clipboard contents, keystroke or mouse counts, OS idle duration, terminal scrollback, environment-variable values, raw stack traces, Git commit messages, provider messages placed in extensions without an approved schema, and events created during a private session.

# 34 Contract test requirements

The collector and server MUST share the same normative fixture corpus. Tests cover:

- Valid and invalid envelope fields, enums, conditional requirements, and limits.

- Every event kind and required/optional field combination.

- Claude Code and Codex mappings for all supported provider versions.

- Capability available, unavailable, excluded, not collected, unknown, and expired cases, including declaration bootstrap omission and mandatory references after acceptance.

- Direct observation versus semantic derivation and confidence constraints, including proof that deterministic privacy-safe transformations preserve fact_class=observed.

- Local privacy allowlists, exclusion precedence, pause, private next session, preview equality, and a secret corpus.

- Stable event IDs across retries; duplicate equivalence and collision rejection.

- Sequence gaps, restarts, clock skew, late terminal events, contradictions, and corrections.

- Unknown schema, event kind, extension namespace, and provider version behavior, including separate extension quarantine or drop for independently valid canonical events and whole-event quarantine when canonical validity depends on the extension.

- Maximum payload, batch, nesting, array, and cardinality boundaries.

- No raw content in serialized events, logs, rejection responses, crash reports, or test snapshots.

Contract tests are release blockers for both adapters. Alpha release also requires positive and negative detector scenarios using these events for Waiting for Human, Repeated Failure, and Overlapping or Conflicting Work.

# 35 Golden fixtures and replay fixtures

Golden fixtures are sanitized, synthetic, human-reviewable, and immutable within a released fixture version. Each supported provider version has positive fixtures, malformed fixtures, privacy-adversarial fixtures, lifecycle edge cases, and capability snapshots. Raw customer telemetry MUST NOT become a fixture.

Replay fixtures contain ordered accepted canonical events plus expected session projections, availability states, attention evidence inputs, and quality metrics. Required replay cases include duplicate upload, event-ID collision, out-of-order completion, missing sequence, collector restart, lost then resumed continuity, provider or system correction, policy transition, pause with retained queue, pause with discarded queue, private-session gap whose existence and elapsed duration are inferable only from boundary transitions, excluded repository, unsupported provider version, usage counter reset, late cost, and overlapping keyed file refs across two sessions.

A fixture manifest records schema version, adapter version, provider fixture version, projector version, expected digest, and privacy review status. Any semantic fixture change creates a new fixture version.

# 36 Adapter compatibility matrix policy

The shipped collector includes a signed compatibility matrix listing provider, detected version range, adapter version, canonical schema range, supported capabilities, fixture-set version, and status. Status is supported, degraded, incompatible, or unknown.

Only supported versions may emit all declared events. degraded versions emit only capabilities proven safe by fixtures and publish an adapter health event. incompatible versions stop provider parsing. unknown defaults to incompatible unless a narrow handshake proves a safe subset. Compatibility changes require fixtures, privacy tests, and a signed collector release; server-side flags may disable a mapping but MUST NOT enable unshipped unsafe parsing.

# 37 Telemetry quality metrics

| **Metric** | **Meaning** | **Privacy constraint** |
|----|----|----|
| Acceptance rate by event kind and adapter version | Contract health | No workspace-identifying metric labels. |
| Rejection and quarantine rate by safe reason | Schema/privacy drift | Never include rejected field values. |
| Duplicate rate and event-ID collisions | Retry and identity quality | Collision details remain restricted. |
| Source sequence gap rate | Evidence continuity | Aggregated counts only. |
| Occurrence-to-observation and observation-to-receipt latency | Collector and ingestion freshness | Bucketed durations. |
| Clock quality distribution | Ordering reliability | No machine label in shared metrics. |
| Capability availability and staleness | Honest coverage | Provider and adapter version allowed. |
| Unknown and stale state duration | Product truthfulness | Aggregated by state and provider. |
| File-set truncation rate | Overlap evidence coverage | No file identifiers. |
| Usage counter reset and reconciliation rate | Usage correctness | No monetary/user labels. |
| Replay divergence count | Determinism | Version labels only. |
| Private/excluded leakage test failures | Privacy release gate | Must be zero; tests use synthetic data. |

Telemetry quality metrics are operational signals, not user productivity metrics. They MUST NOT rank people, teams, repositories, providers, or sessions by activity volume.

# 38 Open questions

The following questions remain open but do not block the v0.2 contract where a conservative default is stated:

8.  Which exact Claude Code and Codex structured interfaces and version ranges pass the first compatibility matrix? Default: incompatible until fixture-tested.

9.  Which repository-relative display path fields, if any, will an alpha workspace be allowed to enable? Default: keyed-only identifiers.

10. What bounded grace periods define session.lost for each provider? Default: provider-specific versioned derivation, never false completion.

11. Should policy-approved test display names be supported in alpha? Default: keyed check references only.

12. What collision-resistant output length and key rotation procedure will document 6 require for workspace-keyed identifiers? Default: implementation must wait for the security decision and expose a derivation version.

13. Which provider-reported cost surfaces are authoritative enough to emit cost.observed? Default: capability unavailable.

14. Should tool.started be emitted when only terminal completion is reliable? Default: no; emit tool.completed only.

# 39 Deferred event families

The following are DEFERRED: task and workstream events, pull-request/review/CI webhook duplication, deployment events, issue-tracker events, notifications, interventions, approvals and policies, budgets, agent-to-agent messages, prompt templates, model reasoning, code ownership, developer activity or productivity, resource utilization, browser activity, editor telemetry, remote-cloud agent control, orchestration commands, autonomous remediation, causal outcome attribution, pricing estimates as telemetry, currency conversion, and providers beyond Claude Code and Codex.

A deferred family requires a product requirement, privacy classification, canonical semantics, capability model, schema version decision, negative tests, replay fixtures, and explicit change record before implementation.

# 40 Change log

| **Version** | **Date** | **Status** | **Change** |
|----|----|----|----|
| 0.1 | 15 September 2026 | DECIDED FOR V0 | Initial provider-neutral telemetry contract for Claude Code, Codex, and local Git context. Defines canonical envelope and taxonomy, identity and time, provenance and confidence, privacy classifications, capabilities, adapter mappings, usage and cost separation, safe failure and overlap evidence, pause/private/exclusion behavior, immutable acceptance, replay, quarantine, limits, examples, and release-blocking contract fixtures. |
| 0.2 | 15 September 2026 | DECIDED FOR V0 FROZEN | Clarifies semantic fact classes versus deterministic privacy-safe transformations; limits this telemetry envelope to observed and derived local/provider facts; defines capability snapshot bootstrap and reference rules; corrects progress_counter to a local emitted-observation count; makes unknown-extension acceptance and quarantine deterministic; and states that private-mode boundary transitions may reveal the existence and elapsed duration of a collection gap without exposing private-session identity, provider, repository, activity, outcome, or content. |

## Decision summary

| **Decision** | **State** |
|----|----|
| Canonical schema version 1.0 with strict validation | DECIDED FOR V0 |
| Claude Code and Codex as supported agent providers | DECIDED FOR V0 |
| macOS-first collector implementation without OS-specific canonical meaning | DECIDED FOR V0 |
| Immutable accepted events and new-event corrections | DECIDED FOR V0 |
| Explicit observed and derived telemetry facts; user actions use a separate contract | DECIDED FOR V0 |
| Capability declarations and explicit unavailable states | DECIDED FOR V0 |
| Local privacy gate before outbound buffer and network | DECIDED FOR V0 |
| Workspace-scoped keyed path and failure identifiers | DECIDED FOR V0 |
| Pause retains approved queue locally until resume or discard | DECIDED FOR V0 |
| Private-session events never enter the shared queue | DECIDED FOR V0 |
| Provider extensions quarantined from core product logic | DECIDED FOR V0 |
| Waiting for Human Repeated Failure and Overlap evidence | DECIDED FOR V0 ALPHA GATE |
| Full Work Graph schema | DEFERRED TO DOCUMENT 5 |
| Complete security privacy architecture and retention | DEFERRED TO DOCUMENT 6 |
