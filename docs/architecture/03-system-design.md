# Abisso — System Design and Technical Architecture

> **Source:** `Abisso_System_Design_and_Technical_Architecture_v0.2_FROZEN.docx`  
> **Version:** 0.2 — FROZEN  
> **Role:** Authoritative V0 system architecture and technical boundaries  
> **Repository note:** This is an agent-readable Markdown mirror of the authoritative DOCX. Architectural changes that contradict this specification require explicit evidence and an ADR or specification revision.

---

Version 0.2

Technical source of truth for V0

Owner Founder

Status FROZEN

Date 15 September 2026

**Authoritative inputs\**
Abisso Product Thesis and Founding Charter v1.0 FROZEN\
Abisso V0 Product Requirements Document v0.2 FROZEN

# Executive architecture decision

Abisso V0 will be built as a TypeScript modular monolith backed by PostgreSQL. A local TypeScript collector observes only consented metadata, applies exclusions and redaction before transmission, and emits versioned canonical envelopes through replaceable Claude Code and Codex adapters. The hosted backend stores an immutable event ledger, processes events through transactional jobs, maintains current-state projections, resolves workstreams, evaluates Needs Attention detectors, reconciles GitHub outcomes and cost, and streams projection changes to the web application using Server Sent Events.

This design deliberately optimizes for one founder operating a real global product: one deployable backend, one database, one web application, one collector package, and clear module boundaries that can be extracted only when evidence requires it. It does not require Kafka, a graph database, Kubernetes, a service mesh, or a fleet of microservices.

| **Area** | **V0 decision** | **Reason** |
|----|----|----|
| Application | TypeScript modular monolith | One codebase and deployable unit with enforceable internal boundaries. |
| Persistence | Managed PostgreSQL | Transactions, JSONB, indexing, queues, audit, and projections in one operational system. |
| Collector | TypeScript daemon plus CLI/status surface | Shared types and lower maintenance cost; native helpers remain possible later. |
| Async work | PostgreSQL transactional job queue | Atomic event acceptance and job scheduling without a separate broker. |
| Realtime | SSE | Server-to-browser updates fit the product; simpler reconnect and infrastructure than WebSockets. |
| Graph | Relational nodes and edges plus projections | V0 traversals are bounded and explainable; no graph database required. |
| Deployment | Managed platform in one primary region | Small operational surface with backups, TLS, logs, and safe deploys. |

# 1 Document purpose scope and authority

This document converts the frozen Charter and revised V0 PRD into an implementation-ready architecture. It is the technical source of truth for how V0 is built. The Charter remains authoritative for strategy, category, core model, trust posture, and autonomy. The PRD remains authoritative for V0 behavior, supported products, user-visible states, and acceptance criteria. A technical choice that conflicts with either input must be changed or escalated through their change process.

This document owns component boundaries, data flow, trust zones, failure behavior, deployment, implementation sequence, and system-level storage choices. It intentionally references, but does not replace, the future Agent Event Specification in document 4, detailed Work Graph schema in document 5, and security and privacy specification in document 6.

**DECIDED FOR V0:** The architecture may evolve through ADRs, but it may not expand V0 product scope or weaken privacy requirements.

# 2 Architectural goals and non goals

| **Goal** | **Implication** |
|----|----|
| Privacy before transport | Classification, exclusions, secret detection, and redaction run on the device. |
| Truthful state | Observed facts never become inferred facts; provenance and confidence travel through every projection. |
| Replayable intelligence | Append-only accepted events are the input to recomputable projections and detectors. |
| Adapter isolation | Provider-specific parsing ends at the adapter boundary. |
| Solo-founder operability | Minimize moving parts, on-call surface, bespoke infrastructure, and synchronized releases. |
| Graceful degradation | Partial evidence produces labeled stale, unavailable, excluded, private, or unknown states. |
| Global-ready foundation | UTC timestamps, opaque identifiers, regional latency awareness, tenant scoping, and deletion controls. |

Non goals include orchestration or termination of agents, raw-log observability, employee monitoring, exact causal productivity measurement, multi-region active-active service, self-hosting, enterprise identity, arbitrary connectors, a public plugin marketplace, and hard real-time guarantees.

# 3 V0 system context and high level architecture

DEVELOPER MACHINE\
Claude Code and Codex\
→ provider adapters\
→ local privacy policy and redaction\
→ encrypted buffer and uploader\
→ HTTPS batches\
\
ABISSO HOSTED BOUNDARY\
Ingestion API → event ledger → transactional jobs\
→ processing and correlation → Work Graph projections\
→ attention outcome and cost modules → web API and SSE\
\
EXTERNAL AND USER INPUTS\
GitHub API webhooks and Actions → GitHub module → event ledger\
Browser → authenticated commands and reads; SSE receives live invalidations

The collector and browser are separate clients. The collector writes telemetry; the browser reads workspace state and records user actions. GitHub contributes delivery facts through webhooks plus bounded reconciliation polling. PostgreSQL is the consistency boundary for accepted events, jobs, graph relationships, projections, audits, and tenant-scoped configuration.

# 4 Major components and responsibilities

| **Component** | **Responsibilities** | **Must not do** |
|----|----|----|
| Collector core | Consent, configuration, lifecycle, policy enforcement, buffering, upload, health. | Interpret product-level workstream state. |
| Provider adapters | Discover supported sessions and map provider observations to canonical drafts. | Call hosted product modules or emit unfiltered payloads. |
| Ingestion API | Authenticate machine, validate envelope, enforce limits, deduplicate, persist, enqueue. | Run expensive inference inline. |
| Event processor | Order per source, enrich safe metadata, update source checkpoints, invoke projectors. | Mutate accepted event facts. |
| Correlation engine | Propose and maintain entity links with evidence, confidence, and corrections. | Hide uncertainty or override user-confirmed links. |
| Work Graph module | Own graph nodes, edges, temporal validity, and graph read models. | Become a generic graph platform. |
| Attention engine | Evaluate detector rules, lifecycle incidents, suppress notifications, record explanations. | Take action in Claude Code, Codex, GitHub, or CI. |
| GitHub module | OAuth/App installation, webhooks, sync, PR/review/check facts, reconciliation. | Collect unselected repositories. |
| Cost module | Normalize values and provenance, maintain price basis, aggregate honestly. | Turn unknown into zero. |
| Web application | Onboarding, Live, workstream detail, corrections, privacy controls, audit. | Expose raw sensitive event bodies. |
| Realtime gateway | Authorize subscriptions and deliver changed projection references. | Serve as durable state. |

# 5 Local collector architecture

The collector is a per-user, per-machine background process with a small command-line and optional lightweight status surface. For the first design-partner alpha, macOS is the only required collector platform: Apple Silicon is required, while Intel support is optional if low-cost to maintain. Linux is follow-on based on design-partner demand, and Windows is deferred until evidence requires it; the long-term collector direction remains multi-platform. The collector runs without elevated privileges after installation where provider access permits. Configuration and credentials are stored using the operating-system credential store; non-secret settings are stored in a user-scoped configuration file.

Adapter observations\
│\
▼\
Canonical draft → allowlist → repository and path exclusions → private-session gate\
→ secret and unsafe-value redaction → outbound preview record → encrypted local buffer\
→ batched uploader → acknowledgement checkpoint

| **Subsystem** | **V0 behavior** |
|----|----|
| Supervisor | Starts adapters, reports health, applies configuration atomically, restarts failed adapters with backoff. |
| Consent registry | Records user, machine, policy version, approved categories, and consent time. |
| Policy engine | Deny by default for unknown fields; evaluates global pause, private session, repo/path exclusions, and field allowlist. |
| Redactor | Removes secret-like values and unsafe free text before data reaches disk or network. |
| Preview | Shows the exact post-policy outbound representation and rejection/redaction reasons. |
| Buffer | Bounded encrypted queue; persists offline; oldest low-priority records are compacted only under an explicit policy. |
| Uploader | Batches by count/size/time, uses idempotency keys, retries with jitter, and advances only on server acknowledgement. |
| Updater | Checks signed release metadata; V0 may require manual confirmation before applying updates. |

DECIDED FOR V0: Pause stops new observation and transmission immediately. Already-approved buffered records remain locally queued and are not transmitted while paused. The user can inspect and discard the local queue; on resume, retained approved records may upload unless discarded. Private mode prevents private-session events from entering the shared outbound queue at all and prevents a shared session shell from being created. Previously accepted cloud events are governed by cloud retention and deletion, not silently erased by pausing.

# 6 Agent adapter architecture for Claude Code and Codex

Each provider adapter implements the same narrow interface: probe capabilities, discover active sessions, observe incremental metadata, normalize provider state into canonical drafts, return a stable provider-local cursor, and expose health. Adapters run out of process only if provider stability or security evidence requires isolation; V0 may run them as supervised modules within the collector process.

| **Concern** | **Adapter contract** |
|----|----|
| Identity | Return provider, provider session ID when safely available, machine-local continuity key, and adapter version. |
| Lifecycle | Emit explicit start, running evidence, human-dependency category, terminal state, and heartbeat/continuity observations. |
| Activity | Emit only allowed categories such as tool category, result status, file paths touched, repository/branch/commit identifiers, and usage metadata. |
| Cursoring | Persist provider-specific cursors locally; resume without rereading unbounded history. |
| Capability | Declare which evidence families are available so missing data becomes Unavailable rather than false absence. |
| Versioning | Report provider version and adapter parser version; unsupported changes place the adapter in Degraded state. |
| Testing | Use sanitized recorded fixtures, synthetic sessions, mutation fixtures, and contract tests for every supported provider version. |

**DECIDED FOR V0:** Provider-specific fields cannot enter core modules except inside a quarantined extension map governed by document 4. Core logic consumes canonical semantics and explicit capabilities.

# 7 Canonical telemetry ingestion boundary

Document 4, the Agent Event Specification, will define the detailed vocabulary. This architecture freezes only the envelope and invariants required to build safely. Every upload contains an envelope version, event ID, source ID, machine ID, workspace ID, provider, source occurrence time, collector observation time, monotonic source sequence when available, event kind, privacy-policy version, adapter version, payload, and payload classification result.

- Events are immutable after acceptance; corrections arrive as new events or user actions.

- Every field is classified as observed, derived-locally, or asserted-by-user. Hosted inferences are never written back as observed telemetry.

- Unknown event kinds or schema versions are rejected or quarantined, never partially interpreted.

- The server records receipt time independently and preserves source clock-quality metadata.

- Payloads have strict size, depth, key, and cardinality limits.

# 8 Backend ingestion path

HTTPS batch → machine authentication → request limits → envelope validation\
→ workspace and consent checks → event-id deduplication → append accepted rows\
→ enqueue process jobs in same transaction → acknowledge accepted and rejected IDs

The endpoint accepts bounded batches and returns per-event outcomes so the collector can advance safely. Machine credentials are short-lived access tokens backed by a revocable device registration. The service derives workspace and user scope from the authenticated machine and refuses conflicting client-supplied scope.

**DECIDED FOR V0:** Target a fast durable acknowledgement after the database transaction. Projection work is asynchronous and never blocks collector retry safety.

# 9 Event processing and current state projection

Workers claim jobs using PostgreSQL row locking with skip-locked semantics. Processing is partitioned logically by workspace and source to reduce reordering. Each projector records its code version, input watermark, and last successful event. Projection updates and emitted downstream jobs commit atomically.

| **Projection** | **Purpose** |
|----|----|
| Session current state | Latest truthful lifecycle, freshness, capability, provider, machine, and terminal evidence. |
| Workstream summary | Task label, owners, active sessions, repository/branch/PR, attention state, cost, outcome, freshness. |
| Live list | Precomputed rows and sort keys for Mine and Team views. |
| Attention current state | Open/acknowledged/snoozed/resolved/dismissed/expired items and latest evidence. |
| GitHub artifact state | Repository, branch, commit, PR, review, check, workflow-run, merge and reversion facts. |
| Cost rollup | Session/workstream totals with provenance composition and price-basis versions. |

A replay command rebuilds projections into shadow tables from a selected event boundary, compares invariants, and swaps only after validation. It supports one workspace first; fleet-wide replay is deferred until operationally necessary.

# 10 Workstream correlation and entity resolution

Correlation is an evidence-ranking pipeline, not one opaque model. Candidate generation uses bounded keys: authenticated user and machine, selected repository, provider session continuity, a workspace-scoped keyed identifier derived from the working directory or repository identity, branch, commit ancestry, PR head, GitHub issue/PR references, permitted file-path overlap, and time windows. Any identifier derived from a sensitive local filesystem path or working directory uses a workspace-scoped keyed derivation, not a globally stable unsalted hash: the same local path may correlate within one workspace, while the same path in different workspaces produces unrelated identifiers. Detailed cryptographic choices are deferred to document 6. Scoring combines independent evidence and penalties. A policy maps the score to High, Medium, Low, or no proposed relationship.

Observed entities → candidate generation → feature evidence → deterministic score\
→ proposed temporal edge → projection → user confirm correct merge split or unrelated\
│\
└─ correction becomes durable precedence and audit input

| **Rule** | **Behavior** |
|----|----|
| Observed beats inferred | Direct provider or GitHub identity evidence outranks similarity and timing. |
| User confirmation is sticky | New inference cannot replace a confirmed link without explicit user action. |
| Negative links persist | Unrelated and split corrections prevent immediate re-merging from the same evidence. |
| Many-to-many is valid | Multiple sessions and PRs may belong to one workstream; one session may be split only by user action in V0. |
| Private evidence stays local | Cloud correlation cannot infer a private session or use its metadata. |
| Explain every link | Store feature contributions, source event IDs, resolver version, confidence, and temporal validity. |

# 11 Live Engineering Work Graph implementation

The V0 Work Graph is a domain model implemented in PostgreSQL, not a separate graph database. Stable entity tables represent users, machines, sessions, workstreams, repositories, branches, commits, pull requests, CI runs, attention items, interventions, costs, and outcomes. A temporal relationship table stores typed directed edges with source, provenance class, confidence, evidence references, valid-from, valid-to, resolver version, and confirmation status.

Common user queries are served from denormalized projections, not arbitrary traversals. Bounded recursive SQL is reserved for explanation, reconciliation, and diagnostics. Document 5 will define node/edge types, invariants, and detailed schema.

**DECIDED FOR V0:** Introduce a graph database only after measured query or modeling limits remain unsolved by relational indexes, projections, and bounded recursion.

# 12 Needs Attention and incident engine

A detector is a versioned pure evaluator over a bounded workstream snapshot plus recent ordered facts. It returns no finding or a finding containing detector version, evidence references, inference statement, confidence and reason, severity, fingerprint, first/latest occurrence, suggested action, freshness requirements, and expiry behavior.

| **Detector** | **Release gate** | **Primary inputs** |
|----|----|----|
| Waiting for Human | Alpha required | Explicit provider human-dependency category, unresolved response evidence, grace period, freshness. |
| Repeated Failure | Alpha required | Normalized failure category/signature, occurrence window, recovery/change-of-approach evidence. |
| Overlapping or Conflicting Work | Alpha required | Concurrent workstreams, repository/branch/task links, permitted file paths, temporal overlap. |
| No Progress or Cost Escalation | Follow-on V0 | Usage/cost deltas, permitted progress signals, budgets, confidence in missing signals. |
| Repeated CI Failure | Follow-on V0 | Consecutive GitHub Actions results, workflow/check identity, intervening success. |
| Review Congestion | Follow-on V0 | PR readiness, age, requested review, queue threshold, CI state. |

The fingerprint deduplicates a continuing condition. New evidence updates the existing incident; materially different evidence creates a new occurrence. User acknowledgement, snooze, dismissal, and resolution are append-only actions. Reopening requires new evidence and records the reason. Notification selection is a separate policy so detector correctness is testable without delivery side effects.

# 13 GitHub and GitHub Actions integration

Use a GitHub App for V0 because repository selection, revocation, webhook delivery, and scoped installation tokens match the V0 model. Store installation and selected-repository identifiers; encrypt refreshable credentials. Verify webhook signatures against the raw request body, persist a receipt before processing, and deduplicate by delivery identifier.

| **Path** | **Behavior** |
|----|----|
| Initial sync | Fetch selected repository metadata and a bounded window of open/recent PRs, reviews, checks, and workflow runs. |
| Webhooks | Ingest repository, push, pull request, review, check suite/run, workflow run, and installation changes needed by V0. |
| Reconciliation poll | Periodically refresh open or recently changed artifacts to recover missed/out-of-order webhooks. |
| Rate limits | Track remaining quota, use conditional requests where useful, prioritize active workstreams, and show degraded freshness. |
| Revocation | Stop API use immediately, mark integration disconnected, retain or delete history according to policy. |
| Repository selection | Server enforces an allowlist; unselected repositories are neither synced nor correlated. |

# 14 Outcome reconciliation architecture

Outcome reconciliation is a versioned projection over GitHub facts plus user actions. Merge into the selected default branch yields observed Accepted. A later detected revert yields Reverted with evidence. Closed unmerged yields Rejected unless a user confirms Abandoned. Absence of a PR does not produce failure; the workstream remains Open or Unknown until a policy threshold and user action support Abandoned.

Multiple PRs produce one primary workstream outcome plus related partial outcomes. The projection retains all transitions and source references. Manual correction supersedes the displayed state but never erases observed GitHub history.

# 15 Cost normalization and provenance

The cost module stores atomic usage facts separately from monetary calculations. A provider observation can be an observed currency amount, observed usage quantity, or insufficient data. Estimation applies a versioned price basis with effective dates and explicit missing components. Allocation applies a versioned user-visible rule to a broader known charge.

| **Label** | **System rule** |
|----|----|
| Observed | Provider supplied the amount for the identified unit; retain provider field and occurrence time. |
| Estimated | Derived from observed usage and a versioned price basis; retain quantities, rates, currency, and omissions. |
| Allocated | Derived from a known broader charge; retain source charge and allocation formula. |
| Unknown | Insufficient evidence; never coerce to zero or omit silently. |
| Includes estimates | Required for an aggregate containing any estimated component; mixed composition remains inspectable. |

**DECIDED FOR V0:** Store original currency and normalized display currency separately. Foreign-exchange normalization is deferred unless design partners require it; V0 must not imply precision it cannot support.

# 16 Realtime delivery to the web application

Use Server Sent Events because V0 updates flow primarily from server to browser, browser support includes automatic reconnect semantics, events pass through ordinary HTTPS infrastructure, and the implementation is simpler than bidirectional WebSockets. Browser commands continue through authenticated HTTP endpoints.

The stream sends small invalidation messages containing workspace-scoped projection type, entity ID, version, and safe summary fields. It is not a durable event log. On connect or reconnect, the client fetches a snapshot, presents stale status until synchronized, and uses the last event identifier when available. Periodic heartbeats detect dead connections. Horizontal fanout may initially use PostgreSQL LISTEN/NOTIFY as a wake-up hint; clients always re-read authoritative projections.

**DECIDED FOR V0:** Adopt WebSockets only if later control or collaboration features require sustained bidirectional messaging.

# 17 Web application architecture

Use a TypeScript React application with server-rendered authentication and onboarding surfaces where useful, and client-side state for Live and workstream detail. The web app consumes a versioned internal API generated from shared contracts. Query caching keys include workspace and projection version; realtime messages invalidate or patch cached projections.

| **Area** | **Approach** |
|----|----|
| Routes | Authentication, onboarding, Live, workstream detail, Recent, settings, privacy/data, integrations, audit. |
| State | Server is authoritative; optimistic updates only for reversible user actions with idempotency keys. |
| Freshness | Global stream state plus per-entity observed-at, processed-at, and source freshness. |
| Evidence UI | Render observed evidence separately from inference, confidence reason, and user-confirmed state. |
| Error handling | Stable error codes, retry affordances, partial panels, and no blank-screen dependency on realtime. |
| Accessibility | Semantic structure, keyboard operation, focus management, non-color confidence/status labels. |

# 18 Account workspace member and machine model

A user account belongs to exactly one workspace in V0. A new user either creates a workspace or accepts an invitation into one. A user who already belongs to a workspace cannot accept another invitation until the existing membership is removed through the supported flow. Workspace ownership transfer and last-owner deletion require guarded workflows.

| **Entity** | **V0 rule** |
|----|----|
| Account | One person identity; one active workspace membership. |
| Workspace | Tenant boundary for repositories, workstreams, policies, retention, and audit. |
| Membership | Exactly one per user; role is Owner or Member; status supports invited, active, removed. |
| Machine | Belongs to one member and workspace; has revocable credentials, display name, platform, collector version, last seen, health. |
| Collector consent | Per user and machine; references policy version and allowed categories. |
| Duplicate collector | Server detects competing source identities and warns; event IDs still provide safety. |

# 19 Authentication and authorization boundaries

Use a managed authentication provider for passwordless or standards-based user login, verified email, session management, and recovery. The backend maps the external subject to an internal user. Every query and command is authorized server-side against workspace membership and role. Database access is private to the backend; the browser never receives database credentials.

| **Principal** | **Authentication** | **Authorization** |
|----|----|----|
| Browser user | Secure HTTP-only session with CSRF protection. | Workspace membership plus Owner/Member permission check for every operation. |
| Collector machine | Short-lived access token obtained through browser device handoff; refresh credential stored in OS keychain. | Write-only telemetry scope for its user, workspace, machine, consent and selected repositories. |
| GitHub webhook | HMAC signature over raw body and expected installation. | Mapped only to the registered installation and selected repositories. |
| Background worker | Service identity or same-process module boundary. | Least-privilege database role when separately deployed. |
| Operator | Separate production access with MFA and auditable break-glass procedure. | No routine access to customer event payloads; narrowly scoped support tooling. |

# 20 Privacy and local redaction architecture

Privacy is enforced as a pipeline with fail-closed defaults, not only a policy document. Adapters produce typed drafts; the local policy layer applies the allowed-field schema, repository and path exclusions, private-session state, free-text prohibition, secret-pattern detection, length and entropy checks, deterministic redaction, and workspace-scoped keyed derivation for identifiers based on sensitive local paths. Only the resulting outbound object can enter the shared buffer, and private-session events never enter that queue.

| **State** | **Meaning in product and data flow** |
|----|----|
| Not collected | The adapter or policy never reads or creates the field. |
| Excluded | A configured repository, path, category, or policy prevents transmission. |
| Private | The user activates local privacy; no shared session entity or metadata is sent. |
| Unavailable | The provider or permission cannot supply the evidence. |
| Stale | Previously known state exists but freshness requirements are not met. |
| Unknown | Evidence is insufficient or contradictory; the system cannot determine truthfully. |

Prohibited by default: raw source and diffs, prompt or response bodies, terminal transcript and command-output bodies, secrets and environment values, keystrokes, mouse activity, screenshots, clipboard, personal messages, and idle time. File paths are permitted metadata but still pass exclusion and secret-like segment checks. Identifiers derived from sensitive local paths must not be globally stable: workspace-scoped keyed derivation permits within-workspace correlation while preventing cross-workspace correlation. Document 6 will specify the detailed cryptographic choices, threat models, access operations, incident response, and verification in depth.

# 21 System level data storage model

| **Store family** | **Contents** | **Properties** |
|----|----|----|
| Identity and tenancy | Users, workspaces, memberships, invitations, machines, roles. | Strong constraints; tenant scope on every owned row. |
| Configuration | Selected repositories, consent, collection policies, detector thresholds, notification and retention settings. | Versioned changes with audit history. |
| Event ledger | Accepted collector and GitHub facts plus user action events. | Append-only logical model, unique event/source identifiers, partition-ready. |
| Graph entities and relationships | Domain nodes and temporal, evidenced edges. | Observed/inferred/user-confirmed provenance and resolver version. |
| Current projections | Sessions, workstreams, Live rows, attention, outcomes, costs, GitHub state. | Rebuildable, indexed for product reads. |
| Jobs and checkpoints | Queued work, attempts, leases, watermarks, dead letters. | Transactional with ledger writes and idempotent handlers. |
| Audit | Security-sensitive and user-visible changes. | Append-only, actor, reason, before/after references. |
| Object storage | Only exports, backups managed by provider, and large non-sensitive artifacts if later required. | No raw telemetry dump by default; lifecycle policy and encryption. |

All timestamps are stored in UTC with source time, receipt time, and clock-quality metadata where relevant. IDs are opaque and globally unique. Tenant scope is required in primary and unique keys where practical to prevent accidental cross-workspace joins.

# 22 Event retention audit and deletion flow

Retention is policy-driven by category: raw accepted events, derived projections, audit records, exports, and local buffer. V0 should ship a conservative default and a limited set of Owner-selectable periods defined in document 6. Retention jobs mark eligible records, delete in bounded batches, rebuild or remove affected projections, and produce a deletion audit record without retaining deleted content.

Owner requests deletion → step-up confirmation → scope frozen and job created\
→ new ingestion blocked when workspace deletion applies → projections removed\
→ events and credentials removed → exports removed → provider backups expire by documented schedule\
→ completion receipt records scope dates and irreversible completion without deleted payloads

Machine removal revokes credentials and stops new uploads. User removal preserves shared workspace facts only where policy and ownership permit. While paused, already-approved buffered records remain locally queued without transmission and are available for inspection or immediate discard from the collector interface; retained records may upload on resume. Private-session events never enter the shared outbound queue. Backup deletion follows the managed provider retention window and must be disclosed rather than claimed as instantaneous.

# 23 Reliability model

| **Mechanism** | **V0 behavior** |
|----|----|
| Offline collector | Encrypted bounded buffer; visible Offline state; reconnect with exponential backoff and jitter. Pause keeps approved records queued locally without transmission until resume or discard; private-session events are never queued. |
| Retries | Retry transport and transient server failures; do not retry validation/privacy rejection without a software or policy change. |
| Deduplication | Client event ID plus source identity; GitHub delivery ID; detector fingerprint; command idempotency key. |
| Idempotency | Every job handler and user command can run more than once without duplicating state or notifications. |
| Ordering | Use source sequence when available; accept late events; recompute bounded windows; never assume global order. |
| Replay | Projectors and detectors are versioned; rebuild from ledger into shadow projections. |
| Dead letters | After bounded attempts, record safe error context, surface operator alert, and permit controlled replay. |
| Graceful degradation | Show source capability, freshness, and specific states instead of synthesizing certainty. |
| Deploy rollback | Backward-compatible database expansion first; old code remains operable during rollback window. |

# 24 Security boundaries and trust zones

Zone 1 Developer device\
Provider data → adapter → local privacy boundary → encrypted buffer\
│ only approved metadata\
▼\
Zone 2 Public edge\
TLS termination → rate limit → authenticated ingestion and web APIs\
│ validated tenant-scoped requests\
▼\
Zone 3 Application and data\
backend/worker → private PostgreSQL → encrypted backups\
│ scoped outbound calls\
▼\
Zone 4 Third parties\
authentication provider, email provider, GitHub APIs

- The most important trust boundary is before data leaves the developer device.

- The public edge treats collector, browser, and webhook input as untrusted.

- Workspace tenant isolation is enforced in application authorization and tested at the persistence boundary.

- Secrets are stored in managed secret storage; sensitive tokens are encrypted at rest and never logged.

- Administrative production access uses MFA, least privilege, audit, and time-bounded break glass.

- Dependency, build, release-signing, update-channel, and collector supply-chain controls are specified further in document 6.

# 25 Observability of Abisso itself

Abisso operational telemetry must not recreate the customer surveillance or content risks the product rejects. Structured logs use request, workspace-pseudonymous, machine-pseudonymous, event, and job correlation identifiers; they exclude event payload values, file paths, emails, tokens, and provider content. Metrics focus on service health and pipeline quality.

| **Signal** | **Examples** |
|----|----|
| Ingestion | Request rate, accepted/rejected counts by safe reason, p50/p95 acknowledgement latency, payload size, auth failure. |
| Processing | Queue age, jobs processed, retries, dead letters, projector lag, replay divergence. |
| Collector fleet | Version distribution, heartbeat freshness, adapter compatibility state, upload failure class. |
| GitHub | Webhook verification failures, delivery lag, API error/rate-limit status, reconciliation backlog. |
| Product runtime | SSE connections/reconnects, API latency/error rate, stale projection count. |
| Detectors | Evaluation latency, created/updated/reopened counts, user dismissal/resolution feedback by detector version. |
| Security and privacy | Policy rejections, redactions by category, suspicious auth patterns, access audit anomalies without payloads. |

Define service-level objectives and alerts around user harm: missing live updates, ingestion loss risk, excessive lag, tenant authorization failure, backup failure, and GitHub drift. Use an error-tracking and metrics service rather than building an internal observability stack.

# 26 Deployment topology for V0

Deploy the web app/API and background worker from the same monorepo. They may run as two process types for independent concurrency while remaining one modular application. Use one managed PostgreSQL instance with private networking, point-in-time recovery, automated backups, connection pooling, and tested restore. Use managed object storage only for exports and release artifacts. Terminate TLS at the managed edge and use a transactional email provider.

Managed edge and TLS\
├─ Web and API process ─┐\
└─ SSE connections ├── Managed PostgreSQL with PITR\
Background worker ─────────┘\
├─ GitHub API\
├─ Authentication provider\
└─ Email provider\
\
Signed macOS collector releases for first alpha → managed object storage or release distribution\
Linux follows design-partner demand; Windows remains deferred until evidence requires it

**DECIDED FOR V0:** One primary deployment region for V0, with global CDN/edge delivery for static assets. Publish the data region and measure design-partner latency. Multi-region data residency and active-active service are deferred.

# 27 Build versus buy decisions

| **Capability** | **Decision** | **Boundary** |
|----|----|----|
| Authentication | Buy | Managed user login and recovery; Abisso owns membership and authorization. |
| PostgreSQL | Buy managed | Abisso owns schemas, migrations, backup verification, and data lifecycle. |
| Application hosting | Buy managed | Abisso owns deploy safety, configuration, health checks, and rollback. |
| Email | Buy | Provider transports messages; Abisso owns safe templates, preferences, and dedupe. |
| Error tracking and metrics | Buy | Sanitize context; no customer payloads or prohibited identifiers. |
| Collector and adapters | Build | Core differentiation and local trust boundary. |
| Correlation Work Graph detectors | Build | Core product model and accumulated operational learning. |
| Job queue | Build on PostgreSQL library | Avoid broker operations; preserve transactional enqueue. |
| Realtime | Build thin SSE layer | Use platform HTTP support; no managed realtime dependency initially. |
| Feature flags | Start simple | Database/config flags with audit; buy only when experimentation complexity appears. |

# 28 Scalability assumptions and explicit V0 limits

Limits are product controls and capacity hypotheses, not promises. Choose conservative defaults, expose clear errors, measure real usage, and revise by ADR.

| **Dimension** | **Initial engineering assumption or limit** |
|----|----|
| Workspace | 3 to 20 engineers; hard safety cap configurable for alpha. |
| User membership | Exactly one workspace per user. |
| Machines | Up to 5 active machines per user. |
| Selected repositories | Up to 50 per workspace; initial sync bounded by recent activity. |
| Concurrent sessions | Up to 10 per user and 100 per workspace. |
| Collector batch | At most 200 events or 512 KiB compressed, whichever comes first. |
| Event size | 64 KiB uncompressed maximum after local policy. |
| Event volume | Design for 1 million accepted events per workspace per month before partition tuning. |
| Retention | Policy options capped at the supported V0 maximum; exact periods belong to document 6. |
| SSE | A few thousand concurrent connections for alpha; one active stream per browser tab is discouraged. |
| Replay | One workspace or bounded time range at a time. |
| Availability | No contractual SLA in alpha; target reliable daily use with documented incidents. |

# 29 Failure modes and recovery behavior

| **Failure** | **User-visible behavior** | **Recovery** |
|----|----|----|
| Collector offline | Machine and affected sessions become Stale or Lost after thresholds; no false completion. | Buffer approved records locally and resume from the acknowledged cursor when online and not paused; permit inspection and discard while paused. |
| Adapter incompatible | Provider shown Degraded or Unavailable with version reason. | Disable unsafe parsing; ship tested adapter update. |
| Clock skew | Use receipt time for ordering bounds; mark source time quality. | Compatibility check guidance; retain both times. |
| Backend unavailable | Collector remains buffering; web shows service error and last freshness. | Retry with backoff; restore service; drain the approved queue gradually only when transmission is enabled and the collector is not paused. |
| Duplicate collectors | Potential duplicate-source warning; no duplicated sessions where identity holds. | Revoke obsolete machine/source and replay affected window. |
| Out-of-order events | Temporary uncertainty or previous state retained with stale marker. | Late-event reconciliation recomputes bounded projection. |
| Projection bug | Reads may be disabled or marked degraded for affected module. | Fix projector; shadow replay; validate and swap. |
| GitHub webhook loss | GitHub state becomes stale, not absent. | Bounded reconciliation polling and delivery-id audit. |
| GitHub auth revoked | Integration Disconnected; collector does not compensate by collecting unselected data. | Owner reconnects and resyncs selected repositories. |
| Rate limit | Lower-priority sync delayed; active workstreams prioritized. | Wait for reset; conditional/batched requests. |
| Detector input disappears | Expire or downgrade finding and explain missing/stale source. | Re-evaluate when fresh evidence returns. |
| Notification failure | Attention item remains available in app. | Retry with dedupe; show preference/provider health where relevant. |
| Partial deletion failure | Workspace enters deletion-in-progress with access constrained. | Idempotent deletion resumes until verified completion. |
| Database loss/corruption | Service enters incident mode; collection buffers locally if edge cannot accept safely. | Restore tested PITR backup, verify invariants, replay jobs. |

# 30 Performance targets derived from the PRD

| **User outcome** | **V0 target under normal connectivity** | **Measurement point** |
|----|----|----|
| Session appears in Live | Within 10 seconds p95 from collector observation. | Source observed-at to projection readable-at. |
| Lifecycle state update | Within 15 seconds p95 for active sessions. | Collector observation to updated Live projection. |
| Waiting for Human signal | Within detector grace period plus 15 seconds p95. | Eligible evidence time to attention readable-at. |
| Other alpha detector update | Within 30 seconds p95 after required evidence is accepted. | Last required accepted event to finding readable-at. |
| GitHub webhook reflected | Within 60 seconds p95 after valid webhook receipt. | Webhook received-at to projection readable-at. |
| Live API read | Under 500 ms p95 server latency for supported workspace limits. | Application request timing excluding user network. |
| Workstream detail read | Under 800 ms p95 server latency. | Application request timing excluding user network. |
| Realtime propagation | Under 3 seconds p95 after projection commit. | Projection commit to connected browser invalidation. |
| Collector durable acknowledgement | Under 2 seconds p95 for accepted normal batch. | Request received to committed response. |
| Outbound preview | Under 1 second for recent bounded records. | Local user command timing. |
| Pause and private mode | Pause stops observation and transmission before command success is shown; queued approved records remain local until resume or discard, and private-session events never enter the shared queue. | Policy state commit before acknowledgement. |
| Manual correction | Visible within 3 seconds p95. | Command commit to browser projection update. |

The session-appearance, lifecycle-state, and GitHub-webhook rows are authoritative V0 PRD product acceptance targets, not external SLAs. The remaining rows are engineering targets; any stricter internal goals for the three PRD criteria must be labeled engineering stretch targets and do not replace product acceptance. Load and latency fixtures must declare batch size, workspace scale, geography, and degraded dependencies. Product screens always show freshness so a missed target cannot masquerade as current truth.

# 31 Testing strategy

| **Layer** | **Required coverage** |
|----|----|
| Adapter tests | Sanitized Claude Code and Codex fixtures, capability probing, lifecycle transitions, cursor resume, malformed/provider-version changes, prohibited-field absence. |
| Canonical contract | Schema compatibility, required provenance, limits, unknown versions, privacy classifications, golden encode/decode fixtures shared by collector and server. |
| Policy and privacy | Deny-by-default field tests, repository/path exclusions, private sessions, pause, secret corpus, outbound preview equality, logs and crash reports. |
| Ingestion | Authentication, tenant mismatch, dedupe, partial batch outcomes, size/rate limits, atomic append/enqueue, retry safety. |
| Projection and replay | Golden event streams, late/duplicate events, version migrations, shadow replay equivalence, invariants and checkpoints. |
| Correlation | Positive/negative evidence matrices, ambiguity, many-to-many cases, merge/split/unrelated, sticky confirmations, private-data non-use. |
| Detector scenarios | Scripted positive and negative cases for all six; alpha release gate only for the three required detectors; explanations and reopen/snooze behavior. |
| GitHub contracts | Webhook signatures, payload fixture versions, installation/repository changes, API pagination/rate limits, missed-webhook reconciliation. |
| End to end | Clean machine onboarding through agent session, Live, attention, user intervention, GitHub outcome, cost provenance, deletion. |
| Security | Cross-tenant authorization matrix, token revocation, CSRF/session protection, webhook replay, dependency and secret scanning. |
| Performance and resilience | Offline soak, reconnect burst, queue backlog, database failover simulation, large workspace reads, SSE reconnect, replay load. |

Maintain a synthetic demo workspace and deterministic time control for detector tests. Real provider fixtures must be scrubbed and reviewed before entering the repository. Production data is never copied into local development by default.

# 32 Local development environment

A new contributor should run the product with one documented command after installing the supported runtime and container engine. Local dependencies are PostgreSQL and an email capture service. GitHub and provider behavior use emulators and fixtures by default; an explicitly configured sandbox integration supports manual testing.

- Pin Node.js and package-manager versions and verify them in CI.

- Use environment-specific configuration validated at startup; commit a safe example file with no secrets.

- Provide database create, migrate, seed, reset-development-only, and replay commands.

- Seed one synthetic workspace containing Claude Code, Codex, GitHub, attention, cost, and outcome scenarios.

- Run collector in fixture, simulation, or live-adapter mode with a conspicuous indicator.

- Use a webhook tunnel only for opt-in sandbox testing; never require production credentials.

- Make privacy policy tests and contract tests part of the default test command.

# 33 Suggested repository structure

abisso/\
├── apps/\
│ ├── web/ React web application and route handlers\
│ ├── backend/ modular monolith API and SSE entry point\
│ ├── worker/ background-job process entry point\
│ └── collector/ local daemon CLI status and packaging\
├── packages/\
│ ├── contracts/ versioned API and canonical envelope contracts\
│ ├── domain/ value objects state machines provenance confidence\
│ ├── collector-core/ policy buffer uploader consent health\
│ ├── adapter-claude-code/ provider-specific observation and fixtures\
│ ├── adapter-codex/ provider-specific observation and fixtures\
│ ├── ingestion/ acceptance validation and dedupe\
│ ├── processing/ projectors replay and checkpoints\
│ ├── correlation/ candidate scoring corrections and evidence\
│ ├── work-graph/ entities temporal relationships and reads\
│ ├── attention/ detector framework and detector implementations\
│ ├── github/ app webhooks sync and reconciliation\
│ ├── cost/ usage price basis allocation and rollups\
│ ├── authz/ roles policies and tenant guards\
│ ├── observability/ safe logging metrics tracing and redaction\
│ ├── database/ migrations queries repositories and seeds\
│ └── test-fixtures/ synthetic and sanitized replay scenarios\
├── docs/ ADRs operating guides and generated references\
├── tooling/ build release migration and fixture tools\
└── infrastructure/ minimal deploy configuration and environment definitions

Enforce dependency direction: provider adapters depend on collector contracts; product modules depend on canonical domain contracts; the web layer depends on application APIs; database implementations sit behind module repositories. Avoid a generic shared package that becomes an uncontrolled dependency sink.

# 34 Technical milestones and implementation sequence

| **Milestone** | **Exit evidence** |
|----|----|
| M0 Foundations and contracts | Monorepo, CI, environments, authentication spike, PostgreSQL migrations, architectural boundary tests, initial ADRs. |
| M1 Collector trust shell | Apple Silicon macOS install/authenticate, consent, pause with queue inspect/discard, private-next-session excluded before the shared queue, exclusions, preview, redaction, encrypted offline buffer, signed development update path; Intel support only if low-cost to maintain. |
| M2 Canonical ingestion and session projection | Versioned envelope, batch endpoint, dedupe, jobs, session current state, replay fixtures, freshness. |
| M3 Claude Code and Codex adapters | Both adapters pass contract/privacy fixtures and show reliable session lifecycle on clean Apple Silicon macOS machines; Intel is optional, Linux follows demand, and Windows remains deferred. |
| M4 GitHub foundation | GitHub App, repository selection, verified webhooks, initial sync, PR/review/Actions projections, reconciliation polling. |
| M5 Correlation and Work Graph | Workstreams before PR, evidence-backed links, confidence/provenance, correction, merge/split/unrelated, replay. |
| M6 Live and detail experience | Live, Recent, workstream detail, SSE, stale/degraded states, audit history, user actions. |
| M7 Alpha detectors | Waiting for Human, Repeated Failure, and Overlapping/Conflicting Work pass positive and negative scenario gates. |
| M8 Outcome cost and notifications | Outcome reconciliation, cost labels/rollups, in-app/email delivery with dedupe and snooze. |
| M9 Alpha hardening | Clean Apple Silicon macOS machine onboarding, privacy/security blockers zero, backup restore, deletion, load/resilience, operating guides; Linux and Windows are not first-alpha exit requirements. |
| M10 Follow-on V0 detectors | No Progress/Cost Escalation, Repeated CI Failure, and Review Congestion enabled only after scenario quality and alpha priorities allow. |

V0 Alpha Ready occurs after M9 and the PRD alpha gate, with both provider adapters meaningfully exercised. V0 Validated is a later product-learning gate based on external use; it is not an engineering milestone. Follow-on detectors may be delivered during the V0 validation period and are not blockers for first design-partner alpha.

# 35 Deferred architecture decisions

| **Deferred choice** | **Trigger to decide** |
|----|----|
| Native collector language or privileged helper | TypeScript cannot meet measured resource, packaging, OS integration, or security needs. |
| Message broker such as Kafka or Redpanda | PostgreSQL job throughput, retention, or fanout is a demonstrated bottleneck after tuning. |
| Graph database | Required graph queries remain slow or unmaintainable after relational modeling and projections. |
| Microservice extraction | A module needs independent scaling, isolation, ownership, or release cadence that outweighs operational cost. |
| WebSockets | Bidirectional real-time control or collaboration becomes a product requirement. |
| Multi-region active-active and residency | Paid customers require residency or measured latency/availability cannot be met. |
| Kubernetes and service mesh | Workload count and operational control requirements exceed managed-process hosting. |
| Enterprise identity and authorization | SSO, SCIM, custom roles, audit export, or multi-workspace requirements enter a later PRD. |
| Self-hosted deployment | Strong paid demand and support economics justify a separate operational product. |
| Machine learning correlation/detection | Labeled correction volume and rule limits justify a model with an explainability and privacy case. |
| Full event archival/object lake | PostgreSQL cost or analytical workload demonstrates the need, with deletion guarantees preserved. |

# 36 Architecture Decision Records to create

| **ADR** | **Decision record** |
|----|----|
| ADR 001 | TypeScript monorepo and modular monolith boundaries |
| ADR 002 | PostgreSQL event ledger projections and transactional job queue |
| ADR 003 | Canonical event envelope ownership and compatibility policy |
| ADR 004 | Collector credential storage encrypted buffering and update signing |
| ADR 005 | Claude Code adapter observation strategy and supported versions |
| ADR 006 | Codex adapter observation strategy and supported versions |
| ADR 007 | Local privacy allowlist redaction exclusions and preview equivalence |
| ADR 008 | GitHub App permissions repository selection webhook and reconciliation design |
| ADR 009 | Relational Work Graph temporal edge model |
| ADR 010 | Workstream correlation scoring confidence and correction precedence |
| ADR 011 | Detector framework fingerprinting lifecycle and versioning |
| ADR 012 | SSE realtime delivery and invalidation protocol |
| ADR 013 | Authentication provider machine handoff and authorization model |
| ADR 014 | Retention deletion backup expiry and audit boundaries |
| ADR 015 | Deployment platform primary region backup and restore targets |
| ADR 016 | Safe observability and prohibited diagnostic data |
| ADR 017 | Cost price-basis versioning and mixed-provenance aggregation |
| ADR 018 | Database migration replay and rollback strategy |
| ADR 019 | Collector packaging code signing and release channels |
| ADR 020 | Supported V0 limits and load-test baseline |

# 37 Risks and mitigations

| **Risk** | **Mitigation** | **Leading evidence** |
|----|----|----|
| Provider changes break adapters | Capability probes, version gates, fixtures, narrow adapters, visible degradation. | Compatibility failure and Unknown rates by adapter version. |
| Sensitive data escapes device | Deny-by-default schema, local redaction, secret corpus, preview equality, prohibited logging. | Policy rejects/redactions and privacy test failures. |
| Correlation errors destroy trust | Evidence scoring, confidence, correction precedence, negative links, audit, replay. | Correction, split, unrelated, and low-confidence rates. |
| False attention overwhelms users | Conservative thresholds, negative scenarios, dedupe, snooze, dismissal feedback, staged detector rollout. | Dismissal, mute, repeat-notification, and action rates. |
| PostgreSQL becomes overloaded | Bounded events, indexes, projections, retention, connection pooling, queue-age alerts, partition readiness. | Query latency, queue age, table/index growth, vacuum health. |
| Solo-founder operational burden | Managed services, modular monolith, few integrations, automation, runbooks, reversible deploys. | Support and incident hours per workspace per week. |
| GitHub drift or rate limits | Webhooks plus reconciliation, selected-repo scope, quota-aware priority, stale states. | Reconciliation differences, webhook lag, remaining quota. |
| Cost data appears falsely precise | Provenance labels, basis versions, omissions, Unknown, no zero coercion. | Share of totals by provenance and user corrections. |
| Deletion is incomplete | Category inventory, idempotent workflow, backup schedule disclosure, verification receipt. | Deletion job age, failed steps, restore/deletion drills. |
| Supply-chain compromise of collector | Signed builds/updates, pinned dependencies, reproducible CI direction, least privilege. | Signature verification, dependency alerts, release provenance. |

# 38 Open technical questions

These questions do not change the product thesis or V0 scope. Each should be answered through an ADR, prototype, or design-partner evidence before the affected milestone exits.

1.  Which exact documented local signals and stable identifiers are available for supported Claude Code versions without reading prohibited content?

2.  Which exact documented local signals and stable identifiers are available for supported Codex versions without reading prohibited content?

3.  What macOS installer, background-service, Keychain, code-signing, notarization, and update path is required for the Apple Silicon first design-partner alpha, with Intel support only if low-cost to maintain?

4.  What is the smallest safe file-path representation that supports overlap detection while honoring exclusions, secret-like segments, and the required workspace-scoped keyed derivation boundary defined here and specified cryptographically in document 6?

5.  Which authentication provider best supports browser login plus secure machine device handoff without custom identity infrastructure?

6.  Which managed PostgreSQL and application platform meet backup, private networking, SSE, region, and cost needs with the least operational burden?

7.  What raw-event retention default and Owner-selectable periods satisfy design-partner trust and replay needs?

8.  What deterministic thresholds and equivalence signatures pass positive and negative scenarios for the three alpha detectors?

9.  How should clock quality be measured and communicated across machines and GitHub events?

10. Which cost and usage facts are actually available from Claude Code and Codex, and what must remain Unknown?

11. What GitHub App permission set is the minimum for selected repositories, PR/review facts, Actions, merge and revert reconciliation?

12. How should duplicate machine registrations and reinstallation continuity be resolved without weak identity heuristics?

13. What workload and geography define the normal-connectivity performance test environment?

14. Which operating data may be sent to third-party error and metric services after diagnostic redaction?

# 39 Change log

| **Version** | **Date** | **Status** | **Change** |
|----|----|----|----|
| 0.1 | 15 September 2026 | Build baseline | Initial V0 system design translating the frozen Charter and revised PRD. Establishes TypeScript modular monolith, PostgreSQL event ledger and projections, local privacy boundary, adapter isolation, relational Work Graph, alpha detector sequence, SSE realtime, deployment, reliability, testing, milestones, deferred choices, and ADR backlog. |
| 0.2 | 15 September 2026 | FROZEN | Reconciles PRD performance acceptance targets; freezes macOS-first collector support for first design-partner alpha; requires workspace-scoped keyed derivation for sensitive path-derived identifiers; defines pause, buffered-queue, resume, discard, and private-mode semantics; and makes the GitHub App definitive for V0. |

# Appendix A V0 decision register

| **Decision** | **State** |
|----|----|
| TypeScript end to end where practical | DECIDED FOR V0 |
| Modular monolith with web/API and worker process types | DECIDED FOR V0 |
| Managed PostgreSQL as primary durable store and job queue | DECIDED FOR V0 |
| Append-only accepted facts and rebuildable projections | DECIDED FOR V0 |
| TypeScript collector with replaceable Claude Code and Codex adapters; macOS-only required for first alpha, with Apple Silicon required and Intel optional | DECIDED FOR V0 |
| Privacy allowlist redaction exclusions and private gate before buffer and network | DECIDED FOR V0 |
| Relational Work Graph and temporal evidenced edges | DECIDED FOR V0 |
| SSE for server-to-browser realtime | DECIDED FOR V0 |
| GitHub App webhooks plus reconciliation polling | DECIDED FOR V0 |
| Waiting for Human Repeated Failure and Overlapping Work as alpha gates | DECIDED FOR V0 |
| No Progress Cost Escalation Repeated CI Failure and Review Congestion as follow-on V0 | DECIDED FOR V0 |
| One user belongs to exactly one workspace | DECIDED FOR V0 |
| One primary hosted region and managed services | DECIDED FOR V0 |
| Kafka graph database Kubernetes service mesh microservice fleet | DEFERRED |
| Detailed event vocabulary | DOCUMENT 4 |
| Detailed Work Graph schema | DOCUMENT 5 |
| Detailed security privacy specification | DOCUMENT 6 |

# Appendix B Processing invariants

- No accepted observed event is mutated to reflect a later inference.

- No projection claims fresher state than its newest valid evidence and source capability allow.

- No user-confirmed relationship is displaced by inference alone.

- No private-session event enters the shared outbound queue or creates a cloud-visible session shell.

- No unselected repository is synchronized or correlated.

- No monetary unknown is rendered or aggregated as zero.

- No notification is emitted without a durable attention item and deduplication fingerprint.

- No deletion reports completion until every tracked category is completed or explicitly subject to a disclosed backup-expiry window.

- No replay replaces live projections until invariants and comparison checks pass.

- No browser or collector request authorizes itself through client-supplied workspace identity.
