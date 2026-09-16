# Abisso — Security, Privacy and Threat Model Specification

> **Source:** `Abisso_Security_Privacy_and_Threat_Model_Specification_v0.1.docx`  
> **Version:** 0.1  
> **Role:** V0 security, privacy and first design-partner alpha release baseline  
> **Repository note:** This is an agent-readable Markdown mirror of the authoritative DOCX. Security and privacy release blockers must not be weakened by implementation shortcuts.

---

Implementation and release review baseline for the first design partner alpha

| **Field**  | **Value**                                                |
|------------|----------------------------------------------------------|
| Product    | Abisso                                                   |
| Category   | Engineering Agent Control Plane                          |
| Owner      | Founder                                                  |
| Version    | 0.1                                                      |
| Date       | 16 September 2026                                        |
| Status     | Proposed implementation specification                    |
| Audience   | Founder, implementers, design partner security reviewers |
| Applies to | V0 and first design partner alpha                        |

**Release decision**

Abisso may enter a design partner alpha only when the Security Alpha Ready and Privacy Alpha Ready criteria in this specification pass, all release blocking findings are closed, and the implemented system still conforms to documents 1 through 5.

**Authority note**

This document defines the V0 security and privacy implementation. It does not alter the product thesis, V0 behavior, architecture, telemetry contract, Work Graph, detector gates, or supported integrations.

# 1 Document purpose scope authority and relationships

This specification defines the controls, trust boundaries, threat model, tests, and operating procedures required to run Abisso with design partners. It covers the macOS collector, browser product, TypeScript modular monolith, managed PostgreSQL, background workers within the monolith, GitHub App, GitHub Actions data, external authentication and email providers, backups, release distribution, and founder operations.

The documents form a strict authority chain. A conflict is corrected in the lower document; it is not resolved by silently changing an upstream decision.

| **Document** | **Authority retained** | **Effect on this specification** |
|----|----|----|
| 1 Product Thesis and Founding Charter v1.0 FROZEN | Category, trust posture, strategic boundaries, no-surveillance commitment | Security controls must enable the thesis without turning Abisso into monitoring software. |
| 2 V0 PRD v0.2 FROZEN | V0 users, roles, workflows, integrations, alpha gates, privacy behavior | This document makes those requirements enforceable and testable. |
| 3 System Design and Technical Architecture v0.2 FROZEN | TypeScript modular monolith, managed PostgreSQL, TypeScript collector, SSE, GitHub App | No new distributed infrastructure is introduced. |
| 4 Canonical Agent Event and Telemetry Specification v0.2 FROZEN | Event envelope, privacy classes, availability states, local filtering, idempotency | Ingestion and redaction controls preserve this contract. |
| 5 Live Engineering Work Graph Specification v0.1 | Workspace scoped identities, temporal relationships, correction precedence, projections | Security controls preserve graph history while preventing cross tenant reads and joins. |

**Normative terms**

MUST and MUST NOT are release blocking requirements. SHOULD states the expected V0 implementation unless a dated decision record documents a safer equivalent. MAY identifies an allowed choice. DECIDED FOR V0 freezes an implementation choice in this document. DEFERRED excludes a control from V0 without weakening the stated invariants.

# 2 Security and privacy goals

- Prevent any user, machine, request, job, or operator action from reading or changing another workspace's data.

- Ensure prohibited local content never enters the shared outbound queue, backend, application logs, analytics, email, crash reports, exports, or backups.

- Make collection scope visible and controllable on the device before transmission.

- Keep collector and GitHub credentials narrowly scoped, short lived where practical, revocable, and unusable after removal.

- Preserve the integrity, provenance, idempotency, and replayability of accepted telemetry and graph facts.

- Degrade honestly when a collector, integration, or backend dependency is unavailable; missing evidence never becomes a negative conclusion.

- Recover from ordinary failures, restore data within stated limits, and respond to incidents with a process a solo founder can execute.

# 3 Explicit V0 non goals

- Formal SOC 2, ISO 27001, HIPAA, PCI DSS, FedRAMP, or similar certification.

- Enterprise SSO or SAML, SCIM, custom roles, per repository Abisso authorization, regional data residency, self hosting, or customer managed keys.

- Protection against a fully compromised local machine, malicious operating system administrator, or compromised user browser session after authentication.

- Inspection of source code or prompt content to provide security analysis.

- A security information and event management platform, employee monitoring product, or individual productivity score.

- A separate key service, event bus, service mesh, graph database, or microservice architecture.

# 4 Security principles

| **Principle** | **V0 meaning** |
|----|----|
| Local first minimization | Repository eligibility, exclusions, private mode, field selection, transformations, secret checks, and limits run before enqueue. |
| Fail closed | Unknown fields, invalid signatures, unresolved tenant scope, unsafe parser states, and over limit payloads are rejected or quarantined. |
| Least privilege | Every user role, token, GitHub permission, database account, and operator path receives only required authority. |
| Explicit trust boundaries | The device, public edge, application, database, external providers, and founder operations have documented crossings. |
| Tenant isolation | workspace_id is derived from the authenticated principal and enforced in services, queries, jobs, storage keys, exports, and logs. |
| Immutable auditability | Accepted source facts and privileged changes are append only or versioned; corrections supersede rather than erase history. |
| Transparent degradation | The product labels unavailable, stale, excluded, private, not collected, and unknown states distinctly. |
| No surveillance | No keystrokes, mouse activity, screenshots, idle time, private communications, or person ranking. |
| Progressive hardening | Use managed security controls and small auditable modules now; add enterprise controls only when risk or customer evidence requires them. |

# 5 Data classification model

The classification label travels with a field or record through collection, ingestion, storage, projection, export, and deletion. A transformation may lower exposure but does not change the semantic fact class defined in document 4.

| **Class** | **Definition** | **Examples** | **Allowed V0 handling** |
|----|----|----|----|
| P0 Prohibited | Content Abisso must not collect by default | Source, diffs, prompts, responses, transcripts, command output bodies, secrets, environment values, keystrokes, mouse activity, screenshots, clipboard, personal messages, idle time, absolute paths, hostnames, MAC addresses, serials | Drop locally before queue. Never log, store, email, export, or back up. |
| P1 Restricted credentials | Authentication or cryptographic material | Refresh credentials, machine tokens, GitHub tokens, session cookies, workspace keys, signing keys | Dedicated secret store; never application payload tables or logs; strict access and rotation. |
| P2 Sensitive metadata | Approved metadata that may reveal work patterns | Opaque path refs, provider session refs, repository and branch identity, failure refs, PR/review/CI metadata, timestamps, user attribution | Purpose limited; workspace scoped; encrypted; retained and exported under policy. |
| P3 Operational metadata | Low sensitivity service state | Schema version, collector version, delivery ID, health state, availability label, detector version | Workspace scoped where applicable; minimized logs and metrics. |
| P4 Public product data | Intentionally public or noncustomer material | Published documentation, public release version, security contact | Normal integrity controls. |

# 6 Asset inventory

| **Asset** | **Class** | **Location** | **Primary control** |
|----|----|----|----|
| User session and auth assertions | P1 | Browser and authentication provider | Secure cookie, short session lifetime, CSRF protection, MFA for operator |
| Collector refresh credential | P1 | macOS Keychain | Device bound storage, rotation and revocation |
| Short lived machine access token | P1 | Collector memory; never persistent logs | Short expiry, audience and machine binding |
| Workspace derivation key | P1 | Managed secret or key store; wrapped database reference | Per workspace versioned key; never sent to browser |
| Telemetry ledger | P2/P3 | Managed PostgreSQL | Tenant scoped writes, immutable accepted facts, encryption and retention |
| Graph and projections | P2/P3 | Managed PostgreSQL | Tenant scoped queries, rebuildable projections |
| GitHub installation tokens | P1 | Backend memory or encrypted short cache | On demand minting, expiry, repository checks |
| GitHub App private key and webhook secret | P1 | Managed secret store | Restricted runtime access and rotation |
| Audit logs | P2/P3 | Append only audit table and restricted log service | No payload bodies; retention and tamper evidence |
| Backups | P2/P3/P1 ciphertext | Managed database backup service | Provider encryption, restricted restore, expiry testing |
| Exports | P2/P3 | Ephemeral object or streamed response | Owner only, short expiry, audit and safe filename |
| Release signing material | P1 | Managed CI signing service or offline secure store | No developer laptop export; approval and revocation plan |

# 7 Actors and principals

| **Principal** | **Trust level** | **Authority** |
|----|----|----|
| User | Authenticated human | Own account and permitted workspace product actions |
| Owner | Authenticated workspace user | Member, GitHub, repository, retention, export, and deletion administration |
| Member | Authenticated workspace user | Workspace visibility, own machines, corrections, attention actions, leave |
| Collector machine | Registered device principal | Upload canonical events only to its workspace and manage its own registration |
| Backend service | Trusted application principal | Validate requests, authorize actions, persist and project scoped data |
| Worker | Internal scoped workload | Process named jobs with workspace context and bounded permissions |
| GitHub webhook | Untrusted network sender until verified | Submit signed deliveries for installed repositories |
| External auth provider | External identity dependency | Assert authenticated subject under configured client and redirect |
| Operator or founder | Privileged human | Time bounded production operations through audited paths |

# 8 Trust boundaries and trust zone diagram

ZONE A LOCAL MAC ZONE B PUBLIC EDGE\
User + Claude Code + Codex TLS termination and request limits\
\| \|\
v local allowlist and redaction v\
Collector -\> encrypted local queue --------TLS------\> Authenticated ingestion\
\| Keychain \|\
\| signed updater v\
+------------------------- release channel ZONE C APPLICATION\
TypeScript modular monolith\
Browser --------------------TLS-----------------------\> auth authz API SSE workers\
GitHub ----------------signed webhook----------------\> webhook verifier and reconciler\
Auth and email providers \<----------limited APIs------\> provider adapters\
\|\
v\
ZONE D DATA PLANE\
Managed PostgreSQL backups\
^\
\| audited break glass\
ZONE E FOUNDER OPERATIONS

Every boundary crossing authenticates its caller, applies an explicit schema and size limit, and binds the operation to a workspace before accessing customer data. Data from GitHub and local repositories remains hostile input after authentication.

# 9 Threat model methodology and scales

V0 uses asset and data flow review with STRIDE categories: spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege. Privacy misuse and surveillance are assessed separately because an authorized action can still violate Abisso policy.

| **Rating** | **Impact definition** | **Likelihood definition** |
|----|----|----|
| Critical | Cross tenant disclosure, credential or signing key compromise, prohibited content stored, or broad destructive loss | Expected or readily exploitable without unusual access |
| High | Material workspace data disclosure, persistent auth bypass, unbounded deletion failure, or alpha stopping outage | Plausible with common access or exposed attack surface |
| Medium | Limited record exposure, integrity loss with recovery, scoped outage, or misuse requiring privileged access | Possible but needs conditions or access |
| Low | Small operational effect with reliable recovery and no material data exposure | Unlikely or strongly constrained |

Priority is based on impact and likelihood, with release blockers declared explicitly. Residual Critical risk is never accepted for alpha. Residual High risk requires mitigation or a written stop decision; it is not accepted merely because the founder is the only operator.

# 10 Local collector threat model

The collector runs beside sensitive repositories and must be treated as a high trust component with a narrow mandate. Its safe failure mode is loss of visibility, not expanded collection. It runs as the signed in user without root, full disk access, or accessibility permissions. It reads only documented provider metadata and repository metadata required by document 4.

- Malicious repository content is data, never executable configuration.

- Provider files and hooks are parsed with bounded, non-evaluating parsers.

- The collector does not follow symlinks outside the resolved eligible repository root.

- All outbound records pass the same final policy function immediately before queue insertion.

- A compromised collector credential cannot query workspace data or administer the workspace.

# 11 Collector credential storage on macOS

DECIDED FOR V0. Apple Silicon macOS is required for the first alpha. The collector stores its refresh credential and local buffer key in macOS Keychain as non-synchronizing application secrets. The item is scoped to the current user and collector service identity and is not exported to iCloud Keychain. Intel support is optional only if packaging and signing add little cost.

The collector must never place credentials in configuration files, shell history, environment variables, launch agent property lists, diagnostic bundles, or crash reports. Keychain denial produces a visible Error state and disables transmission.

# 12 Collector authentication device registration and browser handoff

**1.** The local collector creates an ephemeral PKCE verifier, challenge, and 128-bit or stronger state value, then opens an HTTPS browser registration URL.

**2.** The signed in browser confirms the single workspace, displays the proposed machine name and requested collector scope, and issues a one-use authorization code bound to the PKCE challenge.

**3.** The collector redeems the code over TLS. The backend creates a server generated machine UUID and returns a rotating refresh credential plus a short lived access token.

**4.** The collector writes the refresh credential to Keychain, discards the authorization code and verifier, and requests a compatibility check.

**5.** The browser shows success without embedding the refresh credential in a URL, page, analytics event, or log.

The authorization code expires within five minutes, is single use, and is bound to the initiating user, workspace, redirect target, and PKCE challenge. Browser handoff cannot select a different workspace because one user belongs to exactly one workspace in V0.

# 13 Machine credential lifecycle

| **Event** | **Required behavior** |
|----|----|
| Issuance | Generate at least 256 bits of random refresh secret; store only a keyed hash server side; bind record to machine and workspace. |
| Access | Mint audience restricted access tokens for ingestion and machine self service; maximum lifetime 15 minutes. |
| Rotation | Rotate refresh credential on successful use with reuse detection; allow a short atomic grace window for network retry only. |
| Expiry | Expire unused refresh credentials after 90 days; active devices rotate continuously. DECIDED FOR V0. |
| Revocation | Owner, user, machine sign out, member removal, workspace deletion, or suspected compromise revokes immediately. |
| Loss | User removes machine in web product and re-enrolls; old credential remains revoked. |
| Reinstall | Creates a new machine unless a still valid Keychain item proves continuity and the user confirms reuse. |
| Duplicate collector | Server permits one active registration per installation ID; concurrent refresh reuse revokes the token family and requires re-authentication. |

# 14 Local privacy enforcement pipeline

Provider observation\
-\> supported provider and version check\
-\> repository allowlist lookup\
-\> repository and path exclusions\
-\> pause and private session gate\
-\> canonical field allowlist\
-\> normalization and workspace keyed derivation\
-\> secret and unsafe value detection\
-\> redaction or drop\
-\> per field and per payload size limits\
-\> final prohibited data assertion\
-\> encrypted shared outbound queue

Order is security relevant. No event from a private session reaches the shared queue. Pause stops new observation and transmission; already approved records remain encrypted locally until resume or explicit discard. An unknown field is dropped. If the remaining canonical event is independently valid it may continue; if the event depends on the unknown field, the whole event is quarantined locally without its unsafe value.

| **Gate** | **Fail behavior** |
|----|----|
| Repository not selected | Drop locally; optionally show Excluded locally without repository name leaving device. |
| Excluded path or repository | Drop before identifier derivation and queue insertion. |
| Private session | Do not create shared event, session shell, repository ref, usage record, or outcome record. |
| Paused | Do not observe or transmit new events; retain only prior approved queue records. |
| Field not in schema | Drop field; quarantine event if canonical meaning depends on it. |
| Secret detector match | Replace permitted value with typed redaction marker only when useful; otherwise drop field or event. |
| Over limit | Reject before queue; increment a content free local counter. |
| Parser uncertainty | Fail closed and surface provider compatibility degradation. |

# 15 Workspace scoped keyed derivation

DECIDED FOR V0. Sensitive local identifiers use HMAC SHA 256 with a random 256-bit workspace derivation key held by the backend and provisioned to an enrolled collector through the authenticated TLS channel. The collector stores the key in Keychain. Domain separated inputs prevent equality across identifier types.

ref = base64url(HMAC-SHA-256(K_workspace_vN,\
"abisso:v1:" \|\| ref_type \|\| ":" \|\| canonical_local_value))

- ref_type is one of path, file, worktree, local_repository, or failure and is included exactly.

- Canonicalization is type specific, versioned, deterministic, and occurs only after repository eligibility and exclusion checks.

- The record carries key_version and canonicalization_version, never the original value.

- Equal inputs in different workspaces produce unrelated refs. Globally stable unsalted hashes are forbidden.

- The backend cannot reverse an HMAC output without candidate inputs, so raw inputs still must not be transmitted or logged.

- Failure refs use the privacy safe structured tuple defined by document 4, not raw errors, URLs, paths, prompts, or stack traces.

Key rotation uses dual read and single write. A new key version becomes the only write key; collectors receive it on refresh. The backend may compare old and new refs only through an authorized, time bounded re-key mapping created from eligible local observations. No cross workspace mapping is permitted.

# 16 Local buffer security

DECIDED FOR V0. The collector stores a bounded SQLite queue encrypted with AES 256 GCM at the record layer using a random device buffer key held in Keychain. Each record uses a unique 96-bit nonce, authenticated metadata containing machine ID and schema version, and an authentication tag. The queue contains only records that already passed local privacy policy.

| **Property** | **V0 rule** |
|----|----|
| Capacity | At least 30 minutes of ordinary interruption, bounded by both record count and bytes; oldest approved records may be discarded only with a visible gap marker after resume. |
| Ordering | Per source sequence is preserved. Upload batches can retry; server event identity and idempotency prevent duplicates. |
| Pause | Freeze transmission and new observation. Retained records remain local and visible by count until resume or discard. |
| Private mode | Never enqueue private session records in the shared queue. |
| Discard | User action securely removes queue rows and local preview material; encrypted page reuse is mitigated through SQLite secure delete or database recreation. |
| Crash recovery | Authenticate each record before use; quarantine and report content free corruption count; never transmit partial data. |
| Sign out or uninstall | Delete refresh credential, workspace key, buffer key, queue, and local previews. Server machine credential is revoked when reachable. |

# 17 Collector logs crash reports and privacy

Collector logs are local by default, rotate by size and age, and use structured codes rather than payloads. They may include collector version, operating system major version, adapter name, state transition, error code, counts, and coarse timing. They never include repository names, branches, paths, derived refs, provider session IDs, event bodies, tokens, user email, hostname, or command output.

Automatic crash upload is DEFERRED. A user may explicitly export a diagnostic bundle after seeing its contents. The bundle runs the prohibited data scanner and contains no queue database or Keychain material.

# 18 Collector updates and supply chain

DECIDED FOR V0. macOS releases are notarized and signed with an Apple Developer ID. The updater accepts only a signed manifest over HTTPS and verifies both the manifest signature and artifact digest before installation. CI produces an immutable artifact and software bill of materials. Release signing material is held in a managed CI secret or signing service with MFA protected administrative access.

| **Scenario** | **Behavior** |
|----|----|
| Normal update | Verify signature, digest, version, architecture, and minimum supported version before atomic replacement. |
| Verification failure | Keep current binary, enter Update error, and do not execute the candidate. |
| Rollback | Allow only a signed emergency rollback manifest with an explicit rollback authorization; prevent ordinary downgrade. |
| Mandatory security update | Backend may reject obsolete collector versions with Update required; collector continues local privacy controls and does not upload. |
| Compromised channel | Revoke manifest key, stop publishing, reject affected versions server side, issue a newly signed installer through a separately verified channel, and notify affected users. |

# 19 Backend authentication and authorization

Human authentication is delegated to a managed external provider. The backend validates issuer, audience, signature, expiry, nonce where applicable, and exact redirect URI. It maps the provider subject to one internal user and one workspace membership. Authorization happens in the application service for every request; route presence or hidden UI never grants authority.

Machine authentication uses a separate issuer, audience, credential table, middleware, and scopes. Collector tokens cannot authenticate browser endpoints, read telemetry, access SSE, or administer integrations.

# 20 Workspace and tenant isolation

- The server derives workspace_id from the authenticated user membership or machine registration. A client supplied workspace_id is ignored for authorization and treated only as a consistency assertion when present.

- Every tenant owned table has a nonnull workspace_id or a foreign key path whose first hop is tenant scoped.

- Repository, PR, event, graph, attention, cost, audit, export, and job lookups use compound workspace scoped keys.

- All service methods require an authorization context containing principal type, principal ID, workspace ID, and action.

- Background jobs serialize a signed internal job type and workspace ID, then reauthorize the target records on execution.

- Database repositories require workspace scope in their interface; unscoped query methods are unavailable to request handlers.

- SSE subscriptions bind to the authenticated workspace and filter every event before publish.

- Object names, caches, idempotency keys, locks, metrics labels, and export prefixes include a workspace scope without exposing customer names.

Row level security is SHOULD for defense in depth if supported cleanly by the managed PostgreSQL setup. Application scoped queries and compound constraints remain mandatory even when row level security is enabled.

# 21 Owner and Member authorization matrix

| **Action** | **Owner** | **Member** |
|----|----|----|
| View shared selected workspace data | Allow | Allow |
| Connect or disconnect GitHub App | Allow | Deny |
| Select repositories | Allow | Deny |
| Invite or remove members | Allow | Deny |
| Change detector thresholds and workspace privacy settings | Allow | Deny |
| Set retention | Allow | Deny |
| Create workspace export | Allow | Deny |
| Delete workspace | Allow | Deny |
| Register or remove own machine | Allow | Allow |
| Remove another user's machine | Allow | Deny |
| Correct Work Graph relationships | Allow | Allow |
| Act on attention items | Allow | Allow |
| Leave workspace | Transfer or delete required if sole Owner | Allow |
| View private or excluded activity | Impossible because not transmitted | Impossible because not transmitted |

V0 has no per repository permissions inside a workspace. Invitation and repository selection screens must disclose that every Member can see all selected workspace repositories and associated shared work.

# 22 Browser session cookie and CSRF protection

- Use Secure, HttpOnly, SameSite=Lax cookies; do not store bearer tokens in localStorage.

- Rotate the application session on sign in, privilege change, password or provider recovery event, and ownership transfer.

- Use a short idle timeout and an absolute timeout appropriate to the authentication provider; require reauthentication for workspace deletion, export, ownership transfer, and operator elevation.

- Protect state changing requests with same site cookie policy plus an unpredictable CSRF token bound to the session; validate Origin or Referer as defense in depth.

- Use strict redirect allowlists, CSP, frame ancestors none, nosniff, referrer policy, and output encoding.

- SSE uses the same authenticated session, validates Origin, and never accepts state changing commands.

# 23 Machine token protections

- Separate signing key or issuer and explicit audience from human sessions.

- Scopes are limited to ingest, refresh, machine status, and machine self revocation as needed.

- Access token subject includes immutable machine ID; workspace comes only from registration.

- Refresh secrets are stored hashed server side and in Keychain client side.

- Rotate on use, detect reuse, revoke the family, and audit the reason.

- Never accept machine tokens in URL query parameters; redact Authorization headers at the edge.

- Rate limit by machine, workspace, IP risk signal, and endpoint without using IP as identity.

# 24 Ingestion endpoint security

| **Control** | **Rule** |
|----|----|
| Authentication | Require valid machine access token and active machine, user membership, and workspace. |
| Tenant derivation | Derive workspace and machine from token; reject record claims that disagree. |
| Schema | Validate exact supported envelope and event kind; reject unknown required fields and unsafe extension dependence per document 4. |
| Limits | Apply compressed and decompressed byte limits, batch count limit, field length limit, nesting limit, and request timeout. |
| Idempotency | Use workspace plus source event ID unique constraint. Same ID with identical digest returns prior result; different digest is a collision and security event. |
| Replay | Require issued_at within bounded clock window for request wrapper, nonce or request ID, and token validity; canonical late events remain governed by document 4 event time rules. |
| Rate | Return 429 with bounded retry advice; protect database with per machine and workspace admission limits. |
| Persistence | Commit accepted event and idempotency result atomically before acknowledgement. |
| Errors | Return stable codes without echoing payload or revealing whether another workspace owns an identifier. |

# 25 GitHub App security

The Owner installs a GitHub App and explicitly selects repositories. Zero repositories are selected by default. The backend treats the GitHub installation and current repository selection as authoritative, rechecks it during reconciliation, and never widens scope from webhook content alone.

| **Area** | **V0 control** |
|----|----|
| Permissions | Request only metadata, contents read as needed for commit/ref identity, pull requests read, checks read, actions read, and administration read only if required to enumerate selected repositories. No write permission. |
| Installation tokens | Mint on demand, use until near expiry, hold in memory or encrypted short cache, never persist plaintext. |
| Private key | Managed secret store, restricted application identity, rotated through documented overlap. |
| Webhook | Verify HMAC SHA 256 over exact raw body before JSON parsing; reject missing or invalid signature. |
| Dedupe | Unique installation plus X GitHub Delivery; repeated identical delivery is acknowledged without reprocessing. |
| Replay | Bound delivery age where headers permit, dedupe indefinitely within retention of webhook receipt keys, and reconcile authoritative state. |
| Scope | Resolve repository node ID against active selected installation repository before storing payload facts. |
| Revocation | Installation suspension, deletion, or permission loss stops collection, revokes cached tokens, marks data stale or unavailable, and retains history under policy. |
| Payload | Treat titles, branch names, actor names, annotations, and URLs as hostile strings; allowlist fields and escape on display. |

# 26 GitHub Actions data handling

GitHub Actions is part of the GitHub App integration, not a separate credential path. Abisso collects only workflow, run, check, conclusion, timing, attempt, actor identifier where permitted, and commit or PR linkage needed by the V0 graph and detectors. It does not fetch logs, artifacts, environment variables, secrets, job output, or workflow file bodies.

Names and annotations are untrusted metadata and pass length, control character, secret pattern, URL, and rendering checks. Exact commit SHA and GitHub node IDs provide linkage; name similarity alone never grants identity or authorization.

# 27 External authentication provider risks and controls

| **Risk** | **Control** |
|----|----|
| Account takeover | Use provider MFA capabilities, recovery notification, session rotation, and recent reauthentication for destructive actions. |
| Token substitution | Validate issuer, audience, nonce, signature, expiry, and authorized flow; use PKCE. |
| Email reassignment | Internal identity keys on immutable provider subject, not email alone. |
| Provider outage | Existing valid sessions may continue within normal lifetime; new login fails visibly; no bypass account is created. |
| Admin compromise | Restrict provider console to founder MFA, recovery codes offline, and audit notifications. |
| Redirect abuse | Exact allowlist; no user controlled post login external URL. |

# 28 Email provider and minimization

Email is opt in per user and is used only for allowed attention notices, invitations, account security, deletion/export status, and operational incident communication. A message contains safe labels, severity, coarse age, and a deep link. It never contains source, diffs, prompts, transcripts, command output, secrets, derived local path refs, or private gap detail.

The provider receives the minimum recipient and template fields. Delivery event retention is minimized. Open tracking is disabled for V0. Provider logs and support access are included in the subprocessor review package.

# 29 Database security

- Use managed PostgreSQL with private connectivity where the hosting platform supports it; otherwise restrict network access to application identities and TLS.

- Enable provider encryption at rest and automated backups with point in time recovery.

- Use separate application, migration, and read only support roles. The application role cannot create extensions, roles, or databases.

- Parameterize every query; never concatenate identifiers or ordering clauses from input.

- Compound foreign keys and unique constraints include workspace scope where practical.

- Migrations run from CI or a controlled founder path, are reviewed, reversible where feasible, and tested against a restored snapshot.

- Dangerous admin operations require an explicit target workspace, previewed row counts, transaction, recent reauthentication, and audit record.

- Production data is not copied to local development. Use synthetic fixtures.

# 30 Secret management and key management

All production application secrets live in the hosting platform or managed secret store and are injected only into the process that requires them. Secrets are never committed, placed in build arguments, printed by CI, included in telemetry, or shared through chat. Development uses separate credentials and separate data.

| **Secret** | **Custodian** | **Rotation trigger** |
|----|----|----|
| Auth provider client secret | Managed secret store | Provider incident, exposure, or scheduled annual rotation |
| Machine token signing key | Managed secret store | Exposure, algorithm deprecation, or annual rotation |
| GitHub App private key | Managed secret store | Exposure, GitHub rotation, or annual rotation |
| Webhook secret | Managed secret store | Exposure or annual rotation with overlap |
| Workspace derivation master wrapping key | Managed KMS or platform key store | Exposure or scheduled rotation |
| Database credential | Managed database or platform | Exposure and at least every 90 days if not automatically rotated |
| Release manifest signing key | Managed signing service or offline secure store | Exposure, role change, or cryptoperiod |

# 31 Key hierarchy and rotation

Managed root or platform wrapping key\
+-- application secret versions\
+-- wrapped workspace derivation key W1 v1 v2 ...\
+-- wrapped export encryption key when an asynchronous export requires storage\
\
Device Keychain\
+-- collector refresh credential\
+-- workspace derivation key current and transition version\
+-- local buffer key

Workspace derivation keys are random and independent; they are not deterministically derived from a global master. The database stores ciphertext, key version, and nonsecret metadata. Rotation creates a new random workspace key, updates the write version, distributes it only to active machines, and retires the old key after the re-key window and retention needs close. Workspace deletion destroys active key ciphertext and schedules remaining encrypted backups to expire.

# 32 Encryption in transit and at rest

All external traffic uses TLS 1.2 or newer with modern ciphers and certificate validation. The collector never offers an insecure endpoint or disables verification. Internal managed service connections use TLS when supported. HSTS is enabled for the web origin.

Managed PostgreSQL, backups, secret storage, and object storage use provider encryption at rest. P1 secrets receive application level wrapping or dedicated secret storage. The local queue uses authenticated encryption as defined in section 16. Encryption does not replace tenant authorization, minimization, or deletion.

# 33 Data retention defaults and Owner options

DECIDED FOR V0. The default cloud retention for telemetry ledger records, graph history, attention items, interventions, cost records, and GitHub facts is 90 days. Owners may choose 30 or 90 days. Longer retention is DEFERRED until validated need and privacy review. Audit events required to prove access, changes, and deletion are retained for 365 days, with customer payload fields excluded. Security logs are retained for 90 days. Local collector logs retain 7 days; the encrypted outbound queue is capacity bounded rather than history storage.

| **Data** | **Default** | **Owner option** | **Expiry action** |
|----|----|----|----|
| Customer telemetry and graph data | 90 days | 30 or 90 days | Delete source and projections; retain content free deletion receipt |
| GitHub and Actions facts | 90 days | 30 or 90 days | Delete stored facts and derived links subject to workspace history deletion |
| Audit events | 365 days | Fixed V0 | Delete after period unless a documented incident hold applies |
| Security and service logs | 90 days | Fixed V0 | Provider lifecycle deletion |
| Local collector logs | 7 days | Shorter local configuration allowed | Rotate and delete |
| Exports | 24 hours maximum if stored | No extension | Delete object and revoke link |
| Backups | Provider PITR window up to 35 days | Managed plan limit | Age out automatically; deletion queue prevents restored resurrection |

# 34 Deletion semantics

| **Action** | **Immediate effect** | **Completion semantics** |
|----|----|----|
| Remove machine | Revoke machine token family and stop accepted uploads | Historical shared records remain under workspace retention; local user deletes Keychain and buffer through collector or uninstall. |
| Remove user | Revoke sessions and all owned machine credentials; deny workspace access | Attributed history remains under policy; user can create or join one workspace afterward. |
| Repository disconnect | Stop new GitHub collection and collector eligibility for that repository | Historical data remains until retention unless Owner chooses repository data deletion. |
| Repository data deletion | Mark repository deletion job and stop projections | Delete repository scoped facts and derived data; content free receipt records counts and completion. |
| Workspace deletion | Reauthenticate Owner, revoke users, machines, GitHub tokens, sessions, and exports; make workspace inaccessible | Async purge completes within 7 days from primary systems. Backups expire within provider window, at most 35 additional days. |
| Export deletion | Revoke link immediately | Stored object deleted within 24 hours or earlier. |
| Local buffer discard | Stop use of queued records | Delete queue rows or recreate encrypted database; no server receipt unless requested from web. |
| Backup restore | Restore into isolated environment | Run deletion ledger before reopening service so previously deleted tenants do not reappear. |

Deletion receipt fields are request ID, workspace ID or one way tombstone, requester, scope, requested time, primary completion time, backup expiry deadline, status, and error code. Receipts contain no deleted payload and are visible to the Owner while the workspace exists; workspace deletion receipt is delivered through a verified account channel.

# 35 Audit logging model

| **Logged action** | **Required fields** |
|----|----|
| Authentication and session security events | actor, subject, time, outcome, reason code, coarse network risk; no tokens |
| Role membership and invitations | actor, target, prior and new role or state, time |
| Machine registration rotation revocation | actor or machine, machine ID, action, reason, time |
| GitHub installation repository scope changes | actor, installation ID, repository IDs or counts, before and after, time |
| Retention export deletion and restore | actor, workspace, request ID, scope, before and after, status, time |
| Operator access and dangerous admin action | operator, ticket or reason, approved scope, start, end, commands or action codes, result |
| Security configuration and key version changes | actor, secret type or key version, old and new state without secret values, time |

Audit records are append only through the application interface, ordered by server time, and include actor type, actor ID, workspace, action, target type and ID, result, request ID, and before or after summaries limited to safe metadata. The application role cannot update audit rows. Daily integrity digests or managed log immutability are SHOULD for alpha. Raw payloads, secrets, cookies, authorization headers, source content, prompts, transcripts, command output, and private details are never audited.

# 36 Founder and operator production access

- Require phishing resistant MFA where supported for hosting, database, source control, auth, email, GitHub App, and signing systems.

- No shared accounts. Separate daily development and production operator identities.

- No routine browsing of customer payloads. Support begins with workspace visible status, counts, versions, and content free error codes.

- Break glass access requires a reason, exact workspace and duration, recent MFA, and an audit record. Default maximum is 60 minutes.

- Prefer narrowly scoped read only queries or an administrative diagnostic endpoint over database consoles.

- Any export or record inspection for support requires explicit customer authorization unless necessary to contain a confirmed security incident.

- Credentials and access are reviewed monthly during alpha and immediately after any contractor or provider change.

# 37 Privacy transparency user experience

| **Surface** | **Required content** |
|----|----|
| Before install | What Abisso observes, prohibited data, what leaves the device, local controls, and uninstall effects. |
| What leaves this device | Every permitted category with purpose and example; current repository selections and exclusion state. |
| Outbound preview | Recent post redaction canonical records exactly as queued, with safe values and availability labels. |
| Exclusions | Repository and path pattern rules, validation, precedence, last applied time, and test result. |
| Private mode | Conspicuous local active state; next session or current session behavior; confirmation that nothing enters shared queue. |
| Pause | Active queue count, statement that new observation and transmission stop, Preview, Discard, and Resume actions. |
| Web collection gap | Existence and approximate duration of collection gap only; no private identity, provider, repository, activity, cost, or outcome. |
| Degradation | Distinct Excluded, Private, Not collected, Unavailable, Stale, and Unknown labels. |

# 38 Sensitive metadata and prohibited data

Permitted metadata is purpose limited to V0 behavior. Provider and session identity, lifecycle state, timestamps, selected repository identity, branch, commit, PR, review and CI identifiers, keyed file or subsystem refs, tool or command category, result status, safe test or check name, usage and cost metadata, and explicit dependency category may be collected only when document 4 permits them and local controls pass.

The following data is prohibited by default across the product: raw source code; diffs or patches; prompt, response, reasoning, or transcript content; command output bodies; secret values; environment variable names when sensitive and all values; keystrokes; mouse activity; screenshots; clipboard; personal messages; idle time; absolute local paths; hostnames; MAC addresses; device serial numbers; globally stable hashes of local identifiers; private session identity, provider, repository, activity, cost, or outcome; and data from unselected repositories.

# 39 Safety of Abisso observability telemetry

Application observability uses event names, route templates, status codes, duration buckets, counts, versions, queue depth, and opaque request IDs. It does not record request or response bodies, SQL parameters, authorization headers, cookies, webhook bodies, repository names, branch names, path refs, provider session refs, email addresses, or Work Graph labels.

Error reporting sanitizes exceptions before export, disables automatic local variable capture, and uses controlled tags. Cardinality is bounded. A scheduled scanner tests logs and error events against secret and prohibited data corpora. Access follows founder production controls and the 90 day log retention.

# 40 Abuse and misuse threats

| **Misuse** | **Product control** |
|----|----|
| Employee surveillance attempt | No keystrokes, idle time, screenshots, prompt bodies, or hidden collection; no individual productivity ranking. |
| Owner policy abuse | Workspace policy may reduce collection but cannot force private sessions to transmit or silently activate machines. |
| Overbroad repository selection | Zero selected by default, explicit repository list and count, member visibility disclosure, and scope change audit. |
| Performance scoring | Do not expose leaderboards or composite individual scores. Metrics describe workstreams, system conditions, and data quality. |
| Notification pressure | No celebratory or managerial resolution messages; dedupe and snooze; low confidence stays in app by default. |
| Inference presented as fact | Show provenance and confidence; preserve correction and negative relationship precedence from document 5. |

# 41 Application and web threats

| **Threat** | **Required control** |
|----|----|
| XSS | Contextual escaping, sanitized text rendering, CSP, no unsafe HTML from GitHub or providers. |
| CSRF | SameSite cookie, session bound token, Origin validation, no state changes over SSE or GET. |
| SSRF | No arbitrary URL fetch in V0; allowlist provider hosts and block redirects to private or link local ranges if a fetch is introduced. |
| Injection | Parameterized SQL, typed schemas, no shell evaluation, safe template rendering. |
| Open redirect | Exact internal path or host allowlist; discard protocol relative and encoded bypasses. |
| IDOR or BOLA | Resolve target with authenticated workspace in the same query; do not fetch then compare. |
| Mass assignment | Map explicit allowed fields; ignore or reject role, workspace, owner, and system fields. |
| Session fixation | Rotate session at authentication and privilege changes. |
| Auth bypass | Default deny middleware, route inventory tests, separate machine and user audiences. |

# 42 API threats

| **Threat** | **Control** |
|----|----|
| Replay | Short lived tokens, request wrapper freshness, request ID, event idempotency, webhook delivery dedupe. |
| Rate abuse | Per principal and workspace limits, global capacity ceiling, bounded retries, database admission control. |
| Enumeration | Uniform not found response for unauthorized resources, opaque IDs, rate limits. |
| Cross tenant access | Server derived workspace, scoped repository methods, compound constraints, negative tests. |
| Malformed payload | Strict JSON content type, schema, depth, string, array, numeric, and Unicode controls. |
| Oversized payload | Edge compressed and decompressed limits; reject before parsing or persistence. |
| Event ID collision | Unique workspace source ID plus canonical digest; differing digest creates conflict and alert, never overwrite. |

# 43 Collector threats

| **Threat** | **Control** |
|----|----|
| Malicious repository content | Treat names and files as data; no execution; bounded parsing; local policy before queue. |
| Symlink or path traversal | Resolve canonical path, verify it remains under eligible root, reject traversal and symlink escape. |
| Poisoned provider files | Allowlisted files and formats, size limit, non-evaluating parser, fixture tests. |
| Provider format change | Capability declaration, tested version ranges, quarantine unknown extension, visible degradation. |
| Unsafe parsing | Streaming or bounded parser, depth and allocation limits, fuzz tests, no dynamic code. |
| Privilege escalation | Run as user, no root daemon, no accessibility or full disk permission, minimal file access. |
| Local malware | Out of scope for full prevention; Keychain, short tokens, revocation, no broad backend read scope limit impact. |
| Tampered binary | Code signing, notarization, signed update manifest, server minimum version. |
| Credential copy | Keychain non synchronizing item, rotation and reuse detection, machine binding. |

# 44 GitHub threats

| **Threat** | **Control** |
|----|----|
| Webhook forgery | Verify signature over raw bytes before parse; reject absent or invalid signature. |
| Installation token theft | Short lived on demand token, no logs or persistent plaintext, minimum permissions. |
| Repository scope drift | Reconcile selected repository set and reject facts outside current active scope. |
| Malicious PR metadata | Length and character limits, secret scan, safe rendering, no HTML trust. |
| Missed webhook | Periodic bounded reconciliation using installation scope; mark freshness and do not infer negative state. |
| Revoked permission | Stop fetch, clear token cache, show Limited or Disconnected, retain history per policy. |
| Delivery replay | Installation plus delivery unique key and authoritative state reconciliation. |

# 45 Supply chain threats

| **Threat** | **Control** |
|----|----|
| Dependency compromise | Lockfiles, automated alerts, minimal dependencies, provenance review for new packages, SBOM. |
| CI compromise | Protected main branch, reviewed workflows, least privilege job tokens, isolated release job, no secrets on pull requests. |
| Signing key theft | Managed signing identity, MFA, limited release role, documented revocation and server version block. |
| Malicious package script | Disable unnecessary lifecycle scripts, pin versions, review package ownership and install behavior. |
| Artifact substitution | Build once, record digest and provenance, sign manifest and artifact, verify before install. |
| Developer account takeover | MFA, hardware backed credential where possible, branch protection, recovery review. |

# 46 Data threats

| **Threat** | **Control** |
|----|----|
| Secret leakage | Local scanning and drop, exact schemas, observability redaction, secret corpus tests. |
| Cross tenant join | Workspace scoped keys, query interface, compound constraints, tests and audit. |
| Backup exposure | Managed encryption, restricted restore roles, no local download, restore audit. |
| Stale deletion | Deletion queue, receipts, retry and alert, restore-time deletion ledger. |
| Export leakage | Owner and reauth, short expiry, random object key, no public bucket, audit and explicit warning. |
| Log leakage | No bodies or identifiers, structured codes, scanner, access and retention. |
| Graph inference from missing data | Availability states and invariant that excluded, private, or uncollected data never becomes negative evidence. |

# 47 Availability threats

| **Failure** | **Expected behavior** |
|----|----|
| Backend outage | Collector keeps approved records in bounded encrypted queue; browser reports unavailable; no policy expansion. |
| Database corruption | Stop writes, preserve safe evidence, restore PITR, run integrity and deletion ledger, rebuild projections. |
| Collector offline | Mark freshness and collection gap; do not invent terminal state; reconnect with idempotent upload. |
| GitHub outage or rate limit | Retain prior facts as stale, back off, reconcile later, suppress unsupported conclusions. |
| Email outage | In app product remains authoritative; queue allowed notifications with expiry; do not duplicate stale notices. |
| Auth provider outage | Existing sessions within lifetime continue; new authentication unavailable; no bypass. |
| Dependency failure | Isolate provider adapter or job, surface degradation, keep unrelated evidence available. |

# 48 Prioritized threat register

| **ID and threat** | **Attack path** | **Impact** | **I** | **L** | **Mitigation** | **Detection** | **Residual** | **Owner** |
|----|----|----|----|----|----|----|----|----|
| T01 Cross tenant API read | Alter object or workspace identifier | Customer metadata disclosure | Critical | Medium | Server derived workspace; scoped query; compound keys | Authz denial and cross tenant test alerts | Low | Founder |
| T02 Prohibited content leaves device | Provider field or parser change bypasses filter | Source prompt secret disclosure | Critical | Medium | Final allowlist and prohibited assertion before queue | Secret corpus and outbound scan failure | Low | Collector |
| T03 Machine token theft | Read Keychain or copy token | Forged telemetry into workspace | High | Low | Keychain, short access token, refresh rotation, ingest only scope | Refresh reuse and anomalous rate | Medium | Founder |
| T04 GitHub webhook forgery | Unsigned public request | False graph or attention facts | High | Medium | Raw body HMAC verification and dedupe | Invalid signature counter and alert | Low | Backend |
| T05 GitHub token theft | Log or memory exposure | Read selected repository metadata | High | Low | On demand short token, no logging, minimum permissions | Secret scanner and unusual API use | Medium | Founder |
| T06 Workspace ref correlation | Global unsalted hash | Cross customer local path matching | High | Medium | Per workspace HMAC key and domain separation | Isolation property test | Low | Collector |
| T07 Private event queued | Mode transition race | Hidden work exposed | Critical | Low | Private gate before observation and queue; atomic state | Private fixture and queue inspection | Low | Collector |
| T08 Pause uploads buffer | Transmission loop ignores pause | User expectation violated | High | Low | Atomic pause state gates uploader and observer | Pause integration test | Low | Collector |
| T09 Malicious repository parser | Oversized or crafted metadata | Crash or code execution | High | Medium | Bounded non evaluating parser, no root, fuzzing | Crash code and parser limit metric | Medium | Collector |
| T10 ID collision attack | Reuse event ID with altered body | Overwrite or corrupt ledger | High | Medium | Unique ID plus digest conflict; no overwrite | Collision security event | Low | Backend |
| T11 Owner surveillance misuse | Use activity as person score | Workplace harm and trust loss | High | Medium | No inputs or features for ranking; partner terms | Feature review and misuse reports | Medium | Product |
| T12 Signing key compromise | Compromise CI or secret | Malicious collector update | Critical | Low | Managed signing, release isolation, revocation plan | Artifact provenance and version telemetry | Medium | Founder |
| T13 Deletion resurrection | Restore old backup | Deleted customer data returns | High | Low | Deletion ledger reapplied before reopen | Restore test and deletion audit | Low | Backend |
| T14 Operator overreach | Routine raw production query | Unauthorized disclosure | High | Low | MFA, time bounded break glass, no routine browsing | Operator access audit | Medium | Founder |
| T15 Database loss | Corruption or operator mistake | Service and history loss | High | Low | PITR, backup, restore drills, projections rebuild | Backup age and restore test | Low | Founder |
| T16 XSS via GitHub metadata | Malicious title or branch | Session theft or action forgery | High | Medium | Escaping, CSP, no trusted HTML | CSP report and security test | Low | Backend |
| T17 Oversized ingestion | Compression bomb or huge batch | Outage or cost | Medium | High | Edge and decompressed limits, admission control | Rejected byte and 429 metrics | Low | Backend |
| T18 Auth provider compromise | Forged or stolen session | Workspace access | Critical | Low | Issuer validation, MFA, reauth, session revocation | Provider audit and login anomaly | Medium | Founder |
| T19 Export leakage | Shared temporary link | Bulk metadata disclosure | High | Low | Owner reauth, short expiry, random key, warning | Export download audit | Medium | Backend |
| T20 Missed GitHub events | Outage or webhook loss | Incorrect stale state | Medium | Medium | Reconciliation and availability labels | Webhook lag and freshness metrics | Low | Backend |

# 49 Security invariants

**1.** A request or job never reads, writes, joins, publishes, exports, or deletes customer data outside its authenticated workspace.

**2.** A collector credential grants ingestion and its own machine lifecycle only; it never grants workspace read or administration.

**3.** Private session facts never enter the shared outbound queue. The cloud can learn only that a collection gap existed and its duration.

**4.** Pause prevents new observation and all transmission; preapproved records stay local until resume or explicit discard.

**5.** Prohibited data never appears in outbound records, backend stores, logs, analytics, email, exports, or backups.

**6.** Sensitive local identifiers use workspace scoped keyed derivation and cannot correlate across workspaces.

**7.** Repository selection begins empty and never expands without an Owner action and audit record.

**8.** Webhook data is unauthenticated until its exact raw body signature passes verification.

**9.** The server derives workspace scope from the principal, never from an untrusted request field.

**10.** Accepted event identity is immutable. A same ID and different digest never overwrites the earlier record.

**11.** Inferences remain distinguishable from observed facts and user corrections retain document 5 precedence.

**12.** Missing, excluded, private, stale, unavailable, or uncollected evidence never becomes a negative fact.

**13.** Deletion remains effective after backup restore before the restored system accepts traffic.

**14.** No V0 feature ranks individual productivity or depends on surveillance inputs.

**15.** Every privileged founder action is attributable, scoped, time bounded, and auditable.

# 50 Security acceptance criteria for V0 Alpha Ready

| **ID** | **Pass condition** |
|----|----|
| S01 | All invariants have automated or manual evidence and no open blocker. |
| S02 | Cross tenant suite covers every customer object route, SSE subscription, export, job, and admin path with zero unauthorized reads or writes. |
| S03 | Collector enrollment, rotation, expiry, revocation, lost machine, reinstall, and duplicate refresh scenarios pass on a clean Apple Silicon Mac. |
| S04 | Machine token cannot access human, read, export, GitHub administration, or retention endpoints. |
| S05 | Ingestion rejects invalid schema, tenant mismatch, collision, replay wrapper, over limit, compressed bomb, and unsupported version safely. |
| S06 | GitHub webhook signature and replay tests pass; repository scope is rechecked before persistence. |
| S07 | The shipping collector and updater are signed and notarized; altered artifact and manifest tests fail closed. |
| S08 | No Critical or High unresolved security finding exists. Medium findings have owner, date, and alpha exposure decision. |
| S09 | Production founder accounts use MFA; break glass and access audit are exercised once. |
| S10 | Backup restore and point in time recovery complete successfully and deletion ledger is applied. |
| S11 | Dependency and secret scans pass for source, build logs, artifacts, container or package, and deployed configuration. |
| S12 | Incident contact, runbook, provider contacts, signing revocation steps, and customer notification path are usable. |

# 51 Privacy acceptance criteria for V0 Alpha Ready

| **ID** | **Pass condition** |
|----|----|
| P01 | Static and runtime outbound scans find zero prohibited content across Claude Code, Codex, Git, GitHub, Actions, logs, crash paths, email, analytics, exports, and backups. |
| P02 | Repository and path exclusions take effect before derivation and enqueue; excluded repositories emit no repository identity. |
| P03 | Private before start and private mid session tests produce no shared session, repository, file, usage, cost, or outcome record. |
| P04 | Pause stops observation and transmission; queued approved records remain local and can be previewed or discarded. |
| P05 | Equal canonical paths and failure tuples in separate workspaces produce unrelated refs; no global hash is present. |
| P06 | What leaves this device and outbound preview match the bytes queued after transformations. |
| P07 | Deletion workflows meet section 34 deadlines and provide content free receipts. |
| P08 | Terms and Privacy Notice name actual categories, purposes, controls, subprocessors, retention, deletion, private gaps, and V0 limitations. |
| P09 | No UI, API, export, metric, or email provides an individual productivity score or private or excluded activity. |
| P10 | Design partner agreement includes the no employment evaluation expectation and all members can see selected repository scope before joining. |

# 52 Required automated tests

| **Test suite** | **Minimum coverage** |
|----|----|
| Authorization matrix | Owner and Member allow and deny cases for every route; machine principal negative cases. |
| Cross tenant property tests | Two or more generated workspaces; mutate every ID and nested relationship; zero data difference or timing oracle beyond uniform response. |
| Secret corpus | API keys, tokens, PEM, cloud secrets, URLs with credentials, high entropy values, environment assignments, and encoded variants. |
| Redaction and allowlist | Unknown fields and prohibited bodies removed; independent canonical event behavior follows document 4. |
| Exclusions | Repository and path patterns, symlinks, case and Unicode normalization, nested repositories, traversal. |
| Private mode | Before start, mid session, crash, restart, provider continuation, queue inspection, and shared gap output. |
| Pause and buffer | Race uploader and observer with pause, restart paused, preview, discard, resume, corruption and capacity eviction. |
| Machine tokens | Issue, rotate, reuse, expire, revoke, remove user, remove machine, reinstall, duplicate process. |
| Webhook | Valid and invalid signature, raw body mutation, duplicate delivery, old delivery, wrong installation, unselected repository. |
| Path derivation | Determinism within workspace, inequality across workspaces and types, version rotation, canonicalization edge cases. |
| Deletion | Machine, user, repo, workspace, export, local buffer, retry, partial failure, backup restore resurrection. |
| Log scanning | Application, edge, collector, CI, error reporting, email metadata, audit output against prohibited and secret corpus. |
| API robustness | Fuzz JSON, nesting, Unicode, compression ratios, batch size, event ID collision and concurrency. |
| Supply chain | Lockfile integrity, known vulnerability scan, SBOM, signature, notarization, digest, downgrade and tamper rejection. |

# 53 Manual review checklist before design partner alpha

- Review the final data flow against a packet capture and outbound preview on a clean Apple Silicon Mac.

- Inspect Keychain items, launch agent configuration, local files, permissions, uninstall residue, and crash behavior.

- Verify GitHub App permissions and selected repository screens in a fresh GitHub organization.

- Attempt Owner and Member actions with two workspaces and direct API requests.

- Review production dashboards, logs, error reports, email templates, exports, and audit entries for prohibited data.

- Exercise private mode, mid session private transition, pause, offline queue, discard, sign out, uninstall, and revoked token.

- Restore a backup into isolation, apply deletion ledger, rebuild projections, and compare integrity counts.

- Verify signed and notarized installer, update, tampered update, old version block, and emergency rollback.

- Review provider consoles for MFA, minimum admins, audit notifications, and recovery methods.

- Complete incident tabletop for cross tenant disclosure and compromised collector signing key.

- Give the design partner the review package in section 62 and record unresolved questions.

- Founder signs and dates the Alpha Ready checklist; evidence links are stored outside customer payload systems.

# 54 Vulnerability and dependency management

The solo founder maintains one weekly security maintenance block during alpha. Automated dependency and code scanning runs on every change and daily or weekly against the default branch. Critical exploitable findings are triaged immediately; High findings within one business day; Medium within one week. Severity is adjusted only with documented reachability and compensating controls.

- Pin dependencies and commit lockfiles. Remove unused packages.

- Review new packages for maintainer history, install scripts, transitive size, license, and alternatives.

- Patch internet exposed Critical issues within 24 hours when a safe fix exists; High within 7 days. If not, disable or isolate the affected path.

- Publish collector security updates through the signed channel and enforce a minimum safe version where needed.

- Maintain an SBOM for backend and collector release artifacts.

- Do not open a public bug bounty in V0; provide a monitored security contact and safe harbor language appropriate to a small private alpha.

# 55 Backup restore and disaster recovery

DECIDED FOR V0. Use managed PostgreSQL automated backups and point in time recovery with a target recovery point of 24 hours or better and a target recovery time of one business day for design partner alpha. These are internal operating targets, not an uptime guarantee. Perform a restore test before alpha and monthly during alpha.

**1.** Declare incident and stop unsafe writes.

**2.** Choose a restore point and restore into an isolated environment.

**3.** Validate schema, tenant counts, event ledger integrity, audit continuity, and key availability.

**4.** Apply the deletion ledger and retention jobs before enabling access.

**5.** Rebuild projections from immutable accepted events and corrections where required.

**6.** Run cross tenant and smoke tests, then switch traffic through a documented reversible change.

**7.** Notify affected users if loss, delay, or integrity impact is material.

# 56 Incident response plan

| **Phase** | **Founder actions** |
|----|----|
| Detect | Validate signal, open incident record, assign severity, preserve content free timestamps and affected versions. |
| Contain | Revoke tokens or keys, disable endpoint, integration, release, or version, isolate database or host, and stop deletion only when evidence preservation legally and operationally requires it. |
| Preserve safe evidence | Copy minimum necessary logs and audit records to restricted incident storage; do not collect prohibited customer content for convenience. |
| Assess | Identify workspaces, records, time window, data classes, attacker capability, and continuing risk. |
| Notify | Use section 58 principles; contact providers and affected design partners through verified channels. |
| Recover | Patch, rotate, restore, reconcile deletions, validate invariants, and monitor before reopening. |
| Postmortem | Within five business days for S1 or S2, document cause, impact, detection gap, control change, owner, and due date without blame. |

# 57 Incident severity and response expectations

| **Level** | **Definition** | **Founder response** |
|----|----|----|
| S1 Critical | Confirmed cross tenant access, signing or root credential compromise, prohibited content exposure, or destructive broad loss | Immediate response; contain as first priority; notify affected users without undue delay after credible scope; continuous work until stable. |
| S2 High | Material single workspace exposure, auth bypass, export exposure, persistent compromise, or prolonged data integrity loss | Start within 2 hours during waking coverage; contain same day; direct affected partner contact. |
| S3 Medium | Limited exposure or integrity issue with constrained impact and no active attacker | Triage within one business day; remediate on an agreed short schedule. |
| S4 Low | No customer exposure; minor hardening or attempted attack blocked | Record and address in normal maintenance. |

Abisso does not promise a staffed 24 by 7 security operations center in V0. Design partners receive the actual support window and an emergency channel. Monitoring must still alert the founder promptly for S1 indicators.

# 58 Customer notification principles

- Notify confirmed affected users directly; do not wait for perfect certainty when delay would increase harm.

- State what happened, when, affected data classes and workspaces, what was not affected when known, containment, required user action, and next update time.

- Distinguish confirmed facts from investigation hypotheses.

- Do not expose another customer, attacker personal data, secret material, or details that enable continuing abuse.

- Coordinate legal requirements using competent counsel when an incident triggers them; do not make unsupported jurisdictional promises in advance.

- Provide a final summary and corrective actions after containment and reliable scope assessment.

# 59 External security reporting path

Before alpha, publish and monitor security@abisso.com or another company controlled security address, list it in the product and security page, and acknowledge reports within two business days. The page requests reproduction steps, affected URL or version, impact, and safe contact information. It forbids testing that accesses another customer, degrades service, uses social engineering, or exfiltrates data. Good faith researchers receive coordinated disclosure expectations and a clear statement that Abisso does not run a paid bounty in V0.

# 60 Privacy Notice and Terms implementation checklist

- Name Abisso as product and Engineering Agent Control Plane as category.

- List actual data categories and explicit prohibited default data.

- Explain local collector, allowlist, exclusions, private mode, pause, outbound preview, and collection gaps.

- Describe purposes: Live, Work Graph, Needs Attention, outcome, cost, security, support, and minimal product analytics.

- Name authentication, hosting, database, email, GitHub, and error monitoring subprocessors actually used before alpha.

- State 90 day default and 30 or 90 day Owner options, audit and backup periods, and export expiry.

- Explain machine, user, repository, export, and workspace deletion including backup expiry.

- Explain Owner and Member powers and that every Member can see all selected workspace repositories in V0.

- State no employee surveillance, private session transmission, or individual productivity ranking.

- Describe security contact, incident contact, international processing if applicable, and how to exercise privacy requests.

- Match deployed behavior and screenshots; remove claims for controls not implemented.

# 61 Compliance posture

DECIDED FOR V0. Abisso makes no claim of SOC 2 compliance or certification, ISO 27001 certification, GDPR compliance as a blanket status, HIPAA compliance, PCI compliance, FedRAMP authorization, or any other certification not actually completed. Encryption and security practices are described as implemented controls, not compliance badges.

Formal compliance work is triggered by a material enterprise procurement requirement, regulated customer data, expansion into jurisdictions that require additional operational processes, sustained revenue that justifies an audit, hiring that changes access complexity, or a risk review showing current controls are insufficient. Legal counsel should review the actual controller and processor roles, data processing terms, and jurisdictional obligations before broader launch.

# 62 Design partner security review package

| **Item** | **Minimum contents** |
|----|----|
| Architecture summary | TypeScript modular monolith, managed PostgreSQL, TypeScript macOS collector, SSE, GitHub App, provider list. |
| Data flow | Trust zone and local enforcement diagrams, authenticated crossings, storage locations. |
| Data inventory | P0 prohibited list, permitted metadata, credential assets, analytics and email fields. |
| Access model | Owner Member matrix, machine scope, founder break glass. |
| GitHub | Permissions, repository selection, tokens, webhook verification, revocation. |
| Retention and deletion | Defaults, Owner choices, action semantics, backup expiry, receipts. |
| Supply chain | Signing, notarization, update verification, dependency process, SBOM availability. |
| Subprocessors | Actual company, purpose, data class, region if known, and privacy link. |
| Assurance evidence | Alpha criteria status, test summary, backup restore date, known limitations. |
| Contact | Support, privacy, and security reporting routes plus incident escalation. |

# 63 Security metrics and operational indicators

| **Indicator** | **Alpha signal or review** |
|----|----|
| Cross tenant authorization failures | Count and investigate any internal test failure; production denied attempts monitored without customer identifiers. |
| Prohibited data scan findings | Zero in outbound, logs, errors, email, analytics, exports, and builds. |
| Invalid webhook signatures and duplicate deliveries | Trend by installation and endpoint; spikes trigger review. |
| Machine refresh reuse and revocations | Any reuse alert investigated promptly. |
| Collector versions | Percent on minimum safe version; obsolete versions blocked when required. |
| Queue age and drops | Detect outage and capacity gaps without storing event content in metrics. |
| GitHub freshness and reconciliation lag | Drive Stale or Unavailable states and operational alerts. |
| Deletion jobs | Oldest age, failures, primary completion, backup deadline breaches; target zero overdue. |
| Backup age and restore drills | Backup freshness continuously; successful restore before alpha and monthly. |
| Dependency exposure | Open Critical and High count and age; zero unaccepted alpha blockers. |
| Operator access | Break glass events, scope, duration, and overdue closure. |
| Privacy controls | Pause, private, exclusion, export, deletion, and privacy related uninstall rates at workspace aggregate, never productivity scoring. |

# 64 Deferred controls after V0

| **Control** | **Status and trigger** |
|----|----|
| SSO and SAML | DEFERRED until enterprise identity is a repeated sales requirement. |
| SCIM | DEFERRED until team lifecycle automation is required. |
| Custom roles and per repository permissions | DEFERRED; V0 Owner and Member with shared selected repository visibility is explicit. |
| Regional data residency | DEFERRED until contractual or jurisdictional demand. |
| Self hosting | DEFERRED; would multiply support and update risk. |
| Customer managed keys | DEFERRED until customer risk and revenue justify lifecycle complexity. |
| Formal certification | DEFERRED until procurement evidence and operating maturity justify audit. |
| Advanced DLP or content inspection | DEFERRED; V0 prevents prohibited content locally and does not inspect source. |
| 24 by 7 security operations | DEFERRED; document actual alpha support coverage. |
| Hardware attestation and MDM enforcement | DEFERRED until enterprise device policy need. |
| Multi workspace membership and federation | DEFERRED by PRD and not a security workaround. |

# 65 Open security and privacy questions

| **Question** | **Owner** | **Decision deadline** | **Safe V0 default** |
|----|----|----|----|
| Should permitted file path display be replaced entirely by opaque refs for alpha, or can a locally approved repository relative path leave the device? | Founder and design partner | Before collector schema freeze | Opaque workspace keyed refs only; do not send absolute paths. |
| Which managed auth, hosting, database, email, error monitoring, and signing providers will be used? | Founder | Before production environment creation | Select managed providers with MFA, audit, encryption, deletion, and data processing terms. |
| What exact batch byte, field length, nesting, and rate limits fit normal Claude Code and Codex fixtures? | Engineering | Before ingestion release gate | Benchmark fixtures, then set conservative versioned limits. |
| Can macOS Keychain item access be limited to the signed collector without harming update continuity? | Collector | Before installer freeze | Use the narrowest tested access group and non synchronizing items. |
| What safe repository relative file information is strictly required for the overlap UX? | Product and privacy | Before alpha UI freeze | Use opaque refs and subsystem labels unless design partner evidence requires display. |
| Which incident and support hours can the founder truthfully commit to? | Founder | Before partner agreement | State actual coverage and emergency route; do not claim 24 by 7. |
| Does the chosen backup provider support a 35 day or shorter PITR expiry and isolated restore? | Founder | Before database selection | Choose a plan that meets section 55 or revise the documented target before alpha. |
| What exact legal roles and cross border terms apply to initial partners? | Founder and counsel | Before first agreement | Use narrow private alpha terms and describe actual processing without blanket compliance claims. |

# 66 Change log

| **Version** | **Date** | **Status** | **Changes** |
|----|----|----|----|
| 0.1 | 16 September 2026 | Initial specification | Defines V0 security and privacy architecture, trust boundaries, controls, threat register, release invariants, Alpha Ready criteria, tests, operations, incident response, and deferred controls without changing documents 1 through 5. |
