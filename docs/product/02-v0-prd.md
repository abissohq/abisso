# Abisso — V0 Product Requirements Document

> **Source:** `Abisso_V0_Product_Requirements_Document_v0.2_FROZEN.docx`  
> **Version:** 0.2 — FROZEN  
> **Role:** Authoritative V0 product scope, behavior and release requirements  
> **Repository note:** This is an agent-readable Markdown mirror of the authoritative DOCX. Do not silently expand V0 scope or alter acceptance behavior.

---

Owner: Founder

Status: Frozen build baseline

Date: 15 September 2026

Strategic authority: Abisso Product Thesis and Founding Charter v1.0 FROZEN

# Product decision

V0 will prove one narrow loop: a developer connects GitHub, installs a transparent local collector, sees Claude Code and Codex work as live workstreams, receives a small number of explainable Needs Attention signals, intervenes, and later sees the work reconciled to a GitHub outcome and honestly labeled cost.

V0 Alpha Ready means this loop works end to end in controlled testing and is safe and supportable for external design partners without founder access to their source code, prompts, or terminal transcripts. V0 Validated means external design-partner evidence demonstrates that the loop is repeatedly useful and commercially credible.

# 1 Document purpose and relationship to the founding charter

This PRD translates the frozen founding charter into exact V0 product behavior. The charter remains the strategic source of truth and is not amended by this document. If a requirement conflicts with the charter, the charter wins and the requirement must be corrected. Changes to providers, screens, thresholds, or interaction details may be made through this PRD; changes to the category, core model, initial wedge, privacy posture, or company thesis require the charter's change process.

This document defines what users experience, what makes V0 Alpha Ready, and what external evidence makes V0 Validated. It does not choose a database, language, message bus, detailed event schema, graph schema, collection internals, or security architecture. Those decisions belong in later specifications.

Inherited decisions:

- Product and company: Abisso.

- Category: Engineering Agent Control Plane.

- Core model: Live Engineering Work Graph.

- Initial wedge: Needs Attention.

- Product loop: Observe, Relate, Detect, Intervene, Reconcile, Learn.

- Trust rule: observe engineering work and agents, not employee behavior.

- Autonomy rule: V0 recommends and records; it does not control or terminate agents.

# 2 V0 objective and readiness and validation gates

The objective is to prove that privacy-acceptable metadata from two local coding agents plus GitHub can create a trustworthy, useful operational view before and through pull-request completion.

V0 Alpha Ready is the engineering-readiness gate. It is reached when the alpha-gated product acceptance criteria pass, privacy and security release blockers are zero, clean-machine onboarding works, and the threat model, recovery, support, incident-response, Terms, and Privacy Notice basics are ready. At that gate, a developer can understand active work in under one minute, correctly identify what needs attention, act from the evidence shown, and later understand the outcome and cost without reconstructing the story across tools.

V0 Validated is the external evidence gate. It is reached when at least three external design-partner teams use the product for four consecutive weeks, generate the required real workstream and attention volume, produce repeated useful interventions, demonstrate acceptable privacy trust, and at least two partners agree to pay or sign a paid-pilot commitment. The cohort must include meaningful activity from both Claude Code and Codex, including at least one partner that actively uses both during the evaluation period.

# 3 Target user and design partner profile

The primary user is a hands-on developer or technical lead who runs at least two concurrent Claude Code or Codex sessions in one or more GitHub repositories. This user personally experiences the cost of reopening terminals, checking progress, resolving blocked prompts, monitoring CI, and finding overlapping work.

The secondary user is an engineering manager or platform lead on the same small team. This user needs team-level coordination and outcome evidence, not individual productivity scoring.

The best V0 design partner has 3 to 20 engineers, uses GitHub Cloud, uses Claude Code and/or Codex weekly, permits a local collector after inspection, and has recurring pre-PR coordination pain. An individual partner may use only one supported agent, subject to the cohort requirements in section 29. A partner with only occasional single-agent use, mandatory self-hosting, GitLab-only workflows, or employee-monitoring goals is not a V0 fit.

# 4 Primary user journey

1\. A new user creates an Abisso account, then either creates one workspace or joins one through an invitation.

2\. The workspace owner connects a GitHub organization or personal account and selects repositories explicitly.

3\. The user downloads the local collector, reads what it observes and excludes, signs in, and confirms the account's single workspace and machine name.

4\. The collector validates Claude Code and Codex visibility without reading raw prompts, source, or terminal transcripts.

5\. A supported agent session appears in Live and is attached to a best-known workstream.

6\. The user confirms or corrects the proposed task, repository, and branch relationship when necessary.

7\. Needs Attention surfaces an explainable condition. The user opens the evidence, acknowledges it, takes an external action, snoozes it, dismisses it, or marks it resolved.

8\. GitHub branch, pull request, review, merge, and GitHub Actions state update the same workstream.

9\. Abisso reconciles the workstream to an accepted, rejected, reverted, abandoned, open, or unknown outcome and labels cost provenance.

10\. The user can inspect or delete collected data and can make any future session private locally.

# 5 V0 scope and product boundaries

V0 includes one hosted Abisso web product, one local collector experience, membership in exactly one workspace per user account, Claude Code and Codex session visibility, selected GitHub repositories, GitHub pull requests and reviews, GitHub Actions, a Live view, Needs Attention, workstream detail, basic notifications, privacy controls, and basic outcome and cost reconciliation.

V0 is not an exhaustive telemetry product. It may show Unknown whenever evidence is insufficient. It will prioritize correct provenance and useful intervention over apparent completeness. Manual user correction is a product feature, not a failure, provided the correction is fast and the inference is never misrepresented as fact.

# 6 Supported integrations for V0

| **Integration** | **V0 role** | **Required behavior** | **Boundary** |
|----|----|----|----|
| Claude Code | Local agent source | Detect supported sessions, lifecycle, best-known state, usage and cost when available, tool/result metadata needed for detectors | No raw prompt, response, transcript, or source capture by default |
| Codex | Local agent source | Same product-level behavior as Claude Code, while preserving provider provenance and missing fields | Feature parity is semantic, not identical telemetry |
| GitHub Cloud | Repository and outcome source | Selected repositories, branches, commits, pull requests, reviews, merge/close state, repository identity | No GitLab, Bitbucket, or broad organization-wide access |
| GitHub Actions | Single CI path | Workflow/run/check state for selected repositories and PRs; repeated failure detector | Other CI providers are out of scope |

GitHub Actions is justified because repeated CI failure and outcome reconciliation cannot be credible without one verification path. It is treated as part of the GitHub connection, not a separate integration catalog.

# 7 Account workspace and team model

V0 uses one Abisso account per person. Each user account may belong to exactly one workspace in V0. A new user either creates a workspace or joins one through an invitation. A user who already belongs to a workspace cannot join another until they leave the current workspace or, if authorized, delete it. A workspace contains members, selected GitHub repositories, registered machines, workstreams, attention items, policies, and retention settings.

A user who creates a workspace becomes its Owner. A user who accepts an invitation joins as a Member unless ownership is transferred through a supported administrative action. The Owner may invite members by email, but an invitee who already belongs to a workspace must leave or delete that membership or workspace before accepting. V0 has two roles: Owner and Member. Owners manage GitHub, repositories, members, workspace privacy settings, retention, and deletion. Members connect their own machines, see the workspace's selected workstreams, correct relationships, act on attention items, and may leave the workspace. There is no billing role, guest role, custom role, group, SSO, SCIM, multiple-workspace membership, or multiple-workspace switcher.

A person controls whether a local session is private. Workspace policy may reduce collection but cannot force a private local session to transmit.

# 8 GitHub connection flow

The Owner selects Connect GitHub, is shown the permissions requested and why, completes GitHub authorization, then selects specific organizations and repositories. Abisso defaults to no repositories selected. Before confirmation, it summarizes repository count, data categories, webhook or polling status in product language, and the effects of disconnecting.

After connection, each repository shows Connected, Limited, Syncing, Degraded, or Disconnected. Limited means authorization exists but required repository or Actions data is unavailable. The user can retry, change repository selection, or disconnect. Disconnect stops new GitHub collection immediately and clearly states whether retained historical data remains under the workspace retention policy.

No collector session is associated with an unselected private repository. Its presence may be shown locally as Excluded, but no repository name or session metadata leaves the device.

# 9 Local collector onboarding and trust experience

Onboarding must answer four questions before installation: what Abisso observes, what it does not collect by default, what leaves the device, and how to pause or remove it.

The flow is Download, inspect trust summary, install, authenticate by a short-lived browser handoff, confirm the account's single workspace, name machine, run compatibility check, preview a sample outbound record, and start collection. The compatibility check reports Claude Code visibility, Codex visibility, Git identity availability, GitHub repository eligibility, clock health, and connectivity separately.

The collector has visible states: Active, Paused, Offline, Update required, and Error. A local command or small status surface must let the user pause all transmission, start the next session privately, preview recent outbound metadata, view exclusions, sign out, and uninstall. Pausing does not end agent sessions; it only stops Abisso observation and clearly creates a gap in the web product.

Consent is specific to the signed-in person and machine. The web workspace cannot silently activate a collector or broaden local collection.

# 10 Agent session detection and lifecycle

A session is one continuous provider-defined or Abisso-detectable agent run on one machine. V0 states are Starting, Running, Waiting for human, Completed, Failed, Stopped, Lost, Private, and Unknown.

Starting begins when reliable session evidence appears. Running means recent evidence indicates active work. Waiting for human requires explicit evidence of an input, approval, permission, or decision dependency; silence alone cannot produce this label. Completed and Failed follow explicit terminal evidence when available. Stopped records a user or provider stop. Lost means updates ceased without a terminal event and the collector or source cannot confirm state. Unknown is used when contradictory or insufficient evidence exists.

Normal duplicate or replayed observations must not create duplicate sessions. A collector restart should reconnect to the same live session when identity evidence permits. When it cannot, Abisso may create a continuation and show the uncertainty. A private session never appears in the shared web workspace; the local status may show only that privacy is active.

# 11 Workstream model

A workstream is the user-facing unit of intended engineering work. It connects one or more agent sessions with a task label, person, repository, branch, commits, pull request, reviews, CI, interventions, cost, and outcome. A workstream can exist before a branch or pull request.

The best-known relationship may be Observed, User confirmed, or Inferred with confidence. Users can correct the task label, merge two workstreams, split an incorrectly combined workstream, move a session, or mark a relationship unrelated. Corrections are audited.

V0 task identity is intentionally light: a user-entered label, an inferred label safe to display, or a GitHub issue/PR reference when available. No Jira or Linear integration is required. Branch and PR relationships are many-to-one or one-to-many when evidence demands it; the UI must not force a false one-session-one-PR model.

Workstream state is Active, Needs attention, Waiting, In review, CI failing, Completed, Abandoned, or Unknown. The state shown must include its source or inference basis.

# 12 Live view requirements

Live is the default screen after onboarding. It answers: What is active, what needs me, what changed, and how fresh is this view?

The view shows Needs Attention first, followed by active workstreams. Each row shows task label, agent/provider, owner, repository, branch or PR when known, current state, duration, last meaningful update, cost with provenance label, and data freshness. Users can filter by Mine or Team, repository, provider, state, and attention status. Default is Mine for Members and Team for Owner only after the Owner has at least two members.

Ordering is unresolved attention severity, then attention age, then recency. Completed work leaves the default live list after 24 hours but remains searchable in Recent. The page updates without manual refresh under normal conditions. A global freshness indicator and per-item stale marker prevent old data from looking live.

Live must not show token or activity leaderboards, developer rankings, idle time, keystrokes, or volume-based performance judgments.

# 13 Needs Attention requirements

Every attention item shows: detector name, affected workstream, observed evidence, Abisso's inference, confidence as High/Medium/Low with a plain-language reason, first and latest occurrence, potential consequence, recommended next action, freshness, and provenance. It supports Acknowledge, Snooze, Dismiss as not useful, Mark resolved, and Open workstream. Dismissal requires an optional reason and never rewrites historical evidence. The first design-partner alpha requires three detector families: Waiting for human, Repeated failure, and Overlapping or conflicting work. The remaining detector families are V0 follow-on requirements and do not block V0 Alpha Ready.

Attention states are Open, Acknowledged, Snoozed, Resolved, Dismissed, and Expired. Only Open and Acknowledged count as active. A resolved condition may reopen only with new evidence and must say why.

## 13.1 Waiting for human

Trigger only when provider or tool evidence explicitly indicates a requested answer, approval, permission, authentication, or decision and no response has arrived for a configurable grace period. Show the request category, time waiting, provider, session, and last safe-to-display action. Do not display raw prompt text. Recommended action is Open the source session.

## 13.2 Repeated failure

Trigger when materially equivalent failure evidence recurs within one workstream without evidence of recovery or a changed approach. Show failure category, affected command/test/tool when safe, occurrence count, first/latest time, and intervening progress evidence. Do not claim a loop when only repeated generic error status is available; label uncertainty.

## 13.3 No progress or cost escalation V0 follow-on

Trigger when cost or usage continues to increase over a meaningful interval while permitted progress signals remain absent or unchanged. Show observed/estimated cost, time window, missing progress signals, latest meaningful change, and comparison to a user-set workstream budget if present. The product says Possible no-progress spend, never Waste, unless the user confirms it.

## 13.4 Overlapping or conflicting work

Trigger when two active workstreams in the same selected repository have evidence of touching the same file or high-risk area, or target the same branch/task, and coordination may be useful. Show both workstreams, owners, agents, branches, overlap evidence, and confidence. File paths may be shown because they are metadata; file contents are never required. Similar task wording alone may produce Low confidence only.

## 13.5 Repeated CI failure V0 follow-on

Trigger when the same workstream or pull request has consecutive failing GitHub Actions runs without an intervening success. Show workflow/check name, run links, failure count, first/latest failure, commit range, and whether the failure signature is known, changed, or unavailable. Recommended action opens the latest GitHub run.

## 13.6 Review congestion V0 follow-on

Trigger when agent-produced work is ready for review but remains unreviewed beyond a workspace threshold, or when a reviewer has more pending Abisso-linked PRs than the configured limit. Show PRs, age, requested reviewers when available, CI readiness, and queue count. It describes queue conditions, never reviewer performance.

Detector thresholds ship with conservative defaults and can be changed at workspace level. The exact algorithms belong in the later intelligence specification. V0 acceptance uses controlled scenarios and evidence requirements, not claims of universal detection accuracy. No progress or cost escalation, Repeated CI failure, and Review congestion remain part of the full V0 intent, but are follow-on detectors not required for the first design-partner alpha.

# 14 Workstream detail view

The detail view is the canonical explanation of one unit of work. It contains a summary, current state and provenance, Needs Attention items, relationship strip, chronological timeline, sessions, GitHub artifacts, CI and review, cost, outcome, and audit history.

The relationship strip shows Person to Session to Task to Repository to Branch to Pull request to CI to Outcome, omitting unknown nodes without implying absence. Each inferred link exposes confidence and a Correct action. The timeline interleaves only decision-relevant events and can expand provider or GitHub detail; it is not a raw log viewer.

Users can rename, confirm/correct links, move a session, merge/split workstreams, mark abandoned, set a budget, and resolve attention items. V0 does not edit code, answer an agent prompt, rerun CI, merge a PR, or stop an agent from this screen.

# 15 Outcome reconciliation

Outcome states are Accepted, Rejected, Reverted, Abandoned, Open, and Unknown. Merged into the selected default branch produces an observed Accepted outcome unless later reversion evidence changes it to Reverted. Closed-unmerged PR produces Rejected unless the user marks Abandoned. No PR after a user-defined inactivity period remains Open until the user marks Abandoned; Abisso does not silently declare failure.

Each outcome displays source, time, confidence, and whether it was observed or user confirmed. A workstream with multiple PRs may show a primary outcome plus related partial outcomes. Users can correct the state with a reason. Reconciliation must preserve prior states in the audit history.

# 16 Cost visibility

Every cost value has exactly one label: Observed, Estimated, Allocated, or Unknown.

- Observed: supplied directly by a supported provider for the identified session.

- Estimated: calculated from observed usage and a stated price basis; show basis date and missing components.

- Allocated: a known broader charge distributed to a workstream; show allocation rule.

- Unknown: insufficient reliable information; display Unknown, never zero.

Totals retain mixed provenance. A total that includes estimates is labeled Includes estimates. Currency and time range are always visible. V0 shows session and workstream cost, not developer ROI scores. User-entered budgets are optional and do not stop work.

# 17 Privacy controls private sessions and transparency

Default collection excludes raw source code, diffs, prompt/response bodies, terminal transcripts, command output bodies, secrets, environment-variable values, keystrokes, mouse activity, screenshots, clipboard, personal messages, and idle time.

Permitted categories include provider and session identity, lifecycle state, timestamps, repository identity for selected repositories, branch/commit/PR identifiers, file paths touched, tool or command category, exit/result status, test/check names and status, usage/cost metadata, and explicit human-dependency categories. Each category appears in What leaves this device with a purpose and example.

Users can preview recent outbound records, exclude repositories and path patterns, pause transmission, mark the next session private, and delete local credentials. Owners set retention and may delete workspace cloud data. Private mode is local, conspicuous while active, and leaves no shared session shell. If private mode starts mid-session, transmission stops immediately and the web timeline shows Collection paused by user without further local detail.

Sensitive values detected in permitted metadata are redacted locally. When Abisso cannot safely classify a field, V0 drops it rather than sending it. Product screens distinguish Not collected, Excluded, Private, Unavailable, Stale, and Unknown.

# 18 Notifications behavior

V0 supports in-app notifications and email. Email is opt-in per user; in-app is on for assigned or owned workstreams. Notifications are sent only for new High/Medium attention items, reopened items with new evidence, and optionally a daily unresolved digest. Low-confidence items remain in-app by default.

Deduplication prevents repeated notices for the same continuing condition. Snooze suppresses notices until expiry unless severity materially increases. Resolution sends no celebratory or managerial message. Email contains safe metadata and a deep link, not prompt text, source, output, or secret-like values.

No Slack, Teams, SMS, push, escalation schedules, or on-call routing are required.

# 19 Minimal team behavior and permissions

Owners can connect/disconnect GitHub, select repositories, invite/remove members, change detector thresholds, set retention, export, and delete the workspace. Members can connect/remove their own machines, view selected workspace workstreams, correct work relationships, act on attention items, and leave the workspace. Neither role can add a second workspace membership or switch workspaces in V0.

Members cannot inspect another member's private or excluded local activity because it is never transmitted. V0 does not provide per-repository permissions inside an Abisso workspace; design partners must create a workspace whose selected repositories may be seen by every member. This limitation is disclosed before inviting members.

All administrative changes, relationship corrections, outcome changes, detector actions, and deletions create a user-visible audit record.

# 20 Functional requirements

| **ID** | **Requirement** |
|----|----|
| FR-01 | Users can create an account and either create or join exactly one workspace; Owners can invite members, and existing members cannot join another workspace until they leave or delete the current membership or workspace. |
| FR-02 | Owners can connect GitHub Cloud and select repositories with least practical scope. |
| FR-03 | Users can install, authenticate, inspect, pause, privatize, sign out, and uninstall the collector. |
| FR-04 | Claude Code and Codex sessions are detected and represented with provenance-aware lifecycle states. |
| FR-05 | Sessions are related to correctable workstreams before a PR exists. |
| FR-06 | Live shows current work, freshness, filters, and prioritized attention. |
| FR-07 | The three first-alpha detector families create explainable, actionable attention items; all six detector families remain in V0 scope, with three explicitly delivered as follow-on detectors. |
| FR-08 | Workstream detail explains relationships, timeline, GitHub/CI, interventions, cost, and outcome. |
| FR-09 | GitHub PR, review, merge/close, and GitHub Actions state reconcile into workstreams. |
| FR-10 | Costs are shown only with Observed, Estimated, Allocated, or Unknown provenance. |
| FR-11 | Users can correct relationships/outcomes and preserve an audit trail. |
| FR-12 | Privacy controls and What leaves this device are usable before and after onboarding. |
| FR-13 | In-app and opt-in email notifications deduplicate, snooze, and deep-link correctly. |
| FR-14 | Owners can export or delete workspace data; users can disconnect their machines. |

# 21 Non functional product requirements

Freshness: under normal connectivity, a new supported session appears within 10 seconds at p95; lifecycle changes within 15 seconds at p95; GitHub webhook-backed changes within 60 seconds at p95; fallback synchronization within 10 minutes. The UI shows stale after 60 seconds without expected collector contact and never implies freshness it cannot prove.

Reliability: the hosted product target is 99.5 percent monthly availability during the design-partner period, excluding announced maintenance. Collector buffering tolerates a 30-minute network interruption without duplicate user-visible events, subject to local limits.

Graceful degradation: failure of one provider, GitHub, Actions, or cost source does not erase other evidence. Affected fields and detectors say unavailable, stale, or reduced confidence. The user can still view prior work and privacy settings.

Privacy: prohibited content is not required for any V0 acceptance path. Collection is repository allowlisted, minimized, filtered locally, encrypted in transit and at rest, and deletable. Exact controls and threats are specified later.

Auditability: every inference exposes evidence and provenance; consequential user/admin actions are timestamped with actor and before/after state. Audit history is readable and exportable.

Onboarding simplicity: a technically competent developer can reach the first live session in 10 minutes median and 20 minutes at p90, excluding GitHub administrative approval. No founder terminal access is required.

Accessibility and global use: core flows work by keyboard, do not rely on color alone, use readable timestamps with timezone, and support Unicode names. English-only UI and USD-only normalized cost are acceptable for V0 if original currency remains visible when known.

# 22 Empty failure degraded states and edge cases

- No GitHub connection: explain value, permissions, and Connect GitHub; do not show a broken Live view.

- GitHub connected but no repositories: require explicit selection and offer Manage repositories.

- No collector: show installation steps and a privacy summary.

- Collector active but no supported agents: show compatibility status and how to start a test session.

- No live work: show recently completed work and Start a supported session.

- No attention items: say No current items based on available data, not Everything is healthy.

- Offline collector: preserve last known state, mark it stale, and avoid new inferred incidents based solely on silence.

- GitHub authorization revoked: mark integration degraded and provide reconnect; retain prior evidence per policy.

- Missing cost: display Unknown and explain the unavailable source.

- Clock skew: warn locally and reduce timeline confidence; do not silently reorder contradictory events.

- Session changes repository or branch: update or split the workstream with visible reasoning; ask for confirmation when ambiguous.

- Same session produces multiple PRs: keep one workstream with related PRs unless user splits it.

- Two collectors observe one session: deduplicate when identity evidence is strong; otherwise show possible duplicate and allow merge.

- Force push or rebased commits: preserve historical relationships and update current branch state.

- PR reopened or reverted: reopen outcome reconciliation and retain prior outcome history.

- Member leaves or is removed: revoke workspace access and machine credentials; retain attributed historical records according to policy. The account may then create or join one workspace.

- Private/excluded session overlaps shared work: do not infer or expose its existence from local-only data.

- Detector loses an input: mark existing item Evidence degraded; do not auto-resolve without a reason.

# 23 Exact V0 screens

| **Screen** | **Primary decision supported** | **Required contents** |
|----|----|----|
| Sign in and workspace entry | Will I create a workspace or join my single workspace by invitation? | Authentication, create-or-join choice, invitation handling, single-workspace rule, workspace name, terms/privacy links |
| Connect GitHub | Do I trust and authorize this connection? | Requested access, repository selection, data categories, status |
| Install collector | Do I trust local observation and is it working? | Exclusions, what leaves device, install/auth steps, checks, preview |
| Live | What needs attention and what is active now? | Attention queue, active workstreams, freshness, filters, recent work |
| Workstream detail | What happened, why is this state shown, and what should I do? | Evidence, relationships, timeline, sessions, GitHub/CI, cost, outcome, audit |
| Needs Attention | Which unresolved conditions deserve action? | Filtered queue, severity/confidence, owner, evidence preview, actions |
| Recent work | What completed or went quiet recently? | Search/filter, outcome, final cost, last state |
| Integrations and repositories | Is source coverage healthy and correctly scoped? | GitHub status, repositories, Actions coverage, reconnect/disconnect |
| Machines and collector | Which machines transmit and are they healthy? | Machine, user, version, last seen, state, revoke |
| Privacy and data | What is collected and how do I control it? | Data categories, exclusions, retention, export, delete, audit link |
| Members and workspace | Who can see and administer this workspace? | Owner/member list, invites, disclosed permission model |
| Notification preferences | When and how will Abisso notify me? | In-app/email choices, digest, quiet behavior |

There is no separate analytics dashboard, graph visualization, administration console, billing screen, mobile screen, or virtual office in V0.

# 24 User stories

- As a developer, I want a supported session to appear automatically so I do not maintain a second status system.

- As a developer, I want explicit waiting distinguished from uncertain silence so I know when to intervene.

- As a developer, I want to make a session private before it starts so sensitive work never enters the workspace.

- As a developer, I want to see what leaves my device so I can trust the collector.

- As a developer, I want to correct a mistaken task or PR link so future decisions use the right context.

- As a technical lead, I want conflicting active work surfaced before merge conflict or duplicated effort grows.

- As a technical lead, I want a small prioritized queue so I am not monitoring every session.

- As a reviewer, I want review congestion described as a queue condition, not a personal score.

- As an owner, I want explicit repository selection so Abisso never expands scope silently.

- As an owner, I want costs labeled by provenance so unknown does not look like zero.

- As an owner, I want outcome history tied to workstreams so I can learn which workflows reach accepted results.

- As an owner, I want export and deletion controls so adoption does not create hidden lock-in.

# 25 Acceptance criteria by major capability

## AC A Account and onboarding

- AC-A1: A new user creates an account and either creates one workspace or joins one through an invitation without founder assistance; an account already in a workspace cannot accept another workspace invitation until it leaves or deletes the current membership or workspace.

- AC-A2: GitHub authorization selects zero repositories by default and collection begins only after explicit selection.

- AC-A3: A supported machine completes collector authentication, compatibility checks, outbound preview, and first-session detection within the onboarding targets.

- AC-A4: Removing a machine credential prevents new ingestion from that machine within five minutes and displays the revocation.

## AC B Session lifecycle

- AC-B1: In controlled normal-connectivity tests, 95 of 100 supported session starts appear in Live within 10 seconds and no duplicate user-visible session is created.

- AC-B2: Explicit input/approval requests become Waiting for human; inactivity without such evidence becomes stale, lost, or unknown, never explicit waiting.

- AC-B3: Completion, failure, stop, collector restart, 30-minute offline/reconnect, and source loss produce the defined states without silently fabricating terminal outcomes.

- AC-B4: A private session transmits no session, repository, task, file-path, usage, or cost record to the workspace.

## AC C Workstreams and Live

- AC-C1: A session can appear before branch or PR creation and later reconcile to both without becoming a duplicate workstream.

- AC-C2: Every inferred relationship exposes provenance/confidence and can be corrected, moved, merged, or split with an audit record.

- AC-C3: Live shows required fields, filters, ordering, global/per-item freshness, and updates without manual refresh.

- AC-C4: Stale/offline data cannot appear visually equivalent to current data.

## AC D Needs Attention

- AC-D1: Each of the three first-alpha detector families - Waiting for human, Repeated failure, and Overlapping or conflicting work - passes at least five scripted positive scenarios and five close negative scenarios agreed before implementation. This criterion is required for V0 Alpha Ready.

- AC-D2: Every created item contains evidence, inference, confidence reason, consequence, recommendation, timestamps, provenance, freshness, and lifecycle actions.

- AC-D3: Waiting for human never triggers in negative scenarios based only on inactivity.

- AC-D4: Repeated failure groups continuing evidence into one item rather than notification spam. Repeated CI failure must meet the same behavior when delivered as a V0 follow-on detector.

- AC-D5: Follow-on criterion, not required for first design-partner alpha: No-progress/cost items label all cost provenance and use possible language until user confirmation.

- AC-D6: Overlap items identify both workstreams and exact safe overlap evidence; task-text similarity alone cannot exceed Low confidence.

- AC-D7: Follow-on criterion, not required for first design-partner alpha: Review congestion never produces individual rankings or labels a person slow.

- AC-D8: Acknowledge, snooze, dismiss, resolve, expire, and reopen-with-new-evidence behave as specified and remain audited.

## AC E GitHub outcomes and cost

- AC-E1: Branch, PR, review, GitHub Actions, merge, close, reopen, and revert scenarios update the correct workstream with source links.

- AC-E2: Accepted, Rejected, Reverted, Abandoned, Open, and Unknown follow the defined rules and accept user correction without erasing history.

- AC-E3: Every cost field and aggregate is Observed, Estimated, Allocated, Unknown, or Includes estimates; missing cost never renders as zero.

- AC-E4: Disconnecting GitHub stops new synchronization and explains retained history.

## AC F Privacy permissions and audit

- AC-F1: Static and runtime tests confirm prohibited default content is unnecessary and absent from outbound V0 records, including prompt/response bodies, source/diffs, transcripts/output bodies, secrets, environment values, keystrokes, screenshots, clipboard, messages, and idle time.

- AC-F2: What leaves this device matches the actual outbound categories in release tests and provides a recent-record preview.

- AC-F3: Repository and path exclusions take effect before transmission and can be verified locally.

- AC-F4: Role and membership tests prove only Owners can administer integrations, repositories, members, retention, export, and workspace deletion; Members may leave; and no account can belong to or switch between multiple workspaces in V0.

- AC-F5: All listed administrative, correction, attention, and deletion actions appear in a readable audit history with actor, time, and change.

## AC G Notifications and degradation

- AC-G1: In-app and opt-in email notifications deep-link to the correct item, contain only safe metadata, and deduplicate continuing conditions.

- AC-G2: Snooze suppresses notification until expiry unless new evidence materially raises severity.

- AC-G3: Loss of one integration preserves other available evidence and visibly reduces freshness/confidence rather than blanking or misrepresenting the workstream.

- AC-G4: All empty, failure, degraded, and edge states in section 22 have reviewed product copy and a recovery action where recovery is possible.

V0 Alpha Ready means every alpha-gated acceptance criterion above passes, the engineering-readiness criteria in section 28 are met, and no unresolved release-blocking privacy, security, or data-isolation issue exists. Acceptance criteria explicitly labeled follow-on do not block the first design-partner alpha. V0 Validated is assessed separately through external evidence under sections 28 through 30.

# 26 Explicitly out of scope

- Cursor, Copilot, OpenCode, GitLab, Bitbucket, Jira, Linear, Slack, Teams, and non-GitHub CI.

- Raw source, diff, prompt, response, transcript, or command-output collection by default.

- IDE plugin, menu-bar application, mobile application, and desktop dashboard.

- Multiple workspaces per account, enterprise organizations, guests, custom roles, SSO, SCIM, and per-repository Abisso permissions.

- Remote/cloud agent control, answering prompts, stopping sessions, rerunning CI, merging PRs, or changing code.

- Automatic task routing, model selection, workflow optimization, budgets that enforce termination, or policy orchestration.

- Individual productivity scoring, rankings, attendance/presence, time tracking, or performance management.

- Causal ROI claims, generated-lines metrics, comprehensive engineering analytics, or cross-company benchmarks.

- Visual graph explorer, virtual office, avatars, plugin marketplace, public API, or customer-written adapters.

- On-premises deployment, regional hosting selection, formal compliance certification, and procurement-heavy enterprise controls.

- Database, service, queue, language, detailed telemetry schema, graph schema, or security architecture decisions.

# 27 Product analytics required to learn

Abisso collects product analytics under the same minimization rules and excludes prohibited content. Required measures are onboarding step completion and time; time to first session; weekly active workspace and user; live-view return frequency; workstreams observed; attention items by detector/confidence; open-to-acknowledge and open-to-resolve time; snooze/dismiss rate and reason; user-confirmed useful/not-useful feedback; relationship correction rate; outcome-known rate; cost-known rate; collector pause/private/exclusion use; integration degradation; notification opt-in and click-through; export/deletion requests; and retention by design partner.

The core learning metric is Useful interventions per active workspace per week, defined as an attention item the user marks useful or resolves after taking an action, excluding automatic expiry. Supporting guardrails are attention dismissal rate, alerts per active workstream, privacy-related uninstall rate, and inferred-link correction rate.

Analytics must be viewable by workspace for support but not used to rank individual developers. No analytics event may include raw repository content, prompt text, transcript text, or secret-like values.

# 28 V0 Alpha Ready and V0 Validated gates

V0 Alpha Ready is reached when all alpha-gated acceptance criteria pass in controlled testing; privacy and security release blockers are zero; privacy review finds no prohibited default content; a threat model covers collector, authentication, tenant isolation, GitHub, webhook, and deletion paths; backups and recovery are tested; support and incident-response contacts exist; Terms and Privacy Notice describe actual behavior; and a clean machine can onboard without founder machine access. At this gate, V0 may enter design-partner alpha.

V0 Validated is reached after at least three external design-partner teams have operated for four consecutive weeks; at least 100 real workstreams and 50 attention items have been observed; at least two detector families create repeated user-confirmed useful interventions; the cohort demonstrates acceptable privacy trust; meaningful activity is observed from both Claude Code and Codex, with at least one partner actively using both during the evaluation period; at least two partners pay or sign a time-bound paid-pilot commitment; severe tenant-isolation or secret-exposure incidents remain zero; launch-blocking defects are zero; and all validation thresholds below are assessed.

# 29 Design partner criteria

A design partner must use GitHub Cloud and at least one supported agent weekly; expect multiple concurrent workstreams; name one hands-on champion; include at least three consenting users where team behavior is tested; allow product analytics and structured weekly feedback; agree not to use Abisso for employment evaluation; accept V0 limitations and rapid changes; provide real incident and outcome examples; and complete a privacy/security review appropriate to its risk. An individual partner may use only Claude Code or only Codex.

Select 3 to 5 partners with variation in repository size and workflow but similar coordination pain. Across the overall cohort, require meaningful evaluation-period activity from both Claude Code and Codex, and require at least one design partner to actively use both. Prefer teams able to make a paid-pilot decision. Avoid adding a partner whose required integration or deployment model would expand V0 scope.

# 30 V0 validation success and failure thresholds

| **Dimension** | **V0 validation success threshold by end of design-partner cycle** | **Failure or rethink threshold** |
|----|----|----|
| Activation | 70 percent of invited technical users reach first live session; median under 10 minutes | Under 40 percent activate or repeated founder access is required |
| Repeat use | 60 percent of activated users use Live or Attention in 3 of 4 weeks | Under 25 percent return in week 3 |
| Intervention value | At least 30 percent of surfaced items are marked useful or resolved after action; at least 2 useful interventions/workspace/week for 2 partners | Under 10 percent useful after threshold tuning, or users prefer checking agents directly |
| Alert burden | Under 1 dismissed-as-noise item per 5 active workstreams and under 30 percent dismissal overall | Over 60 percent dismissal for two consecutive weeks |
| Relationship quality | At least 80 percent of high-confidence session-to-repo/branch/PR links remain uncorrected | More than 30 percent of high-confidence links are corrected |
| Outcome coverage | At least 70 percent of PR-linked workstreams reach a known outcome | Under 40 percent despite normal GitHub coverage |
| Privacy trust | At least 70 percent of eligible users install; no severe leak; under 15 percent uninstall primarily for privacy | A severe prohibited-content leak or majority refusal despite transparency |
| Willingness to pay | 2 partners pay or sign a time-bound paid-pilot commitment | No partner will pay after demonstrating repeated useful interventions |
| Solo-founder operability | Under 2 hours of manual support per workspace per week after week 2 | More than 5 hours per workspace per week is structurally required |

These thresholds assess V0 Validated after V0 Alpha Ready; they are validation criteria, not build-completion criteria. They are decision aids, not permission to manipulate cohorts. Missing the same failure threshold for two consecutive measurement periods triggers a written narrow, pivot, or stop decision.

# 31 Open product questions

1\. Which local product surface best balances visibility and founder effort: command-line status only or a minimal tray/menu status?

2\. What safe metadata can both Claude Code and Codex expose consistently enough for semantic parity?

3\. Should file-path collection default on for selected repositories, or require an additional consent step?

4\. What conservative default grace periods best separate brief pauses from actionable waiting or no-progress spend?

5\. Should Members see all selected-repository workstreams by default, or should Mine be the only V0 team-safe mode?

6\. What user correction UX makes merge/split/move understandable without exposing graph terminology?

7\. How should Abisso represent cost when provider pricing includes subscriptions, credits, cache effects, or unavailable components?

8\. What evidence is reliable enough to identify a revert across squash merges and follow-up pull requests?

9\. Is email necessary during alpha, or does in-app plus a daily digest create sufficient intervention behavior?

10\. Which V0 follow-on detector should be prioritized after the three first-alpha detectors demonstrate reliable value?

11\. What retention default earns trust while preserving enough history to learn: 30, 60, or 90 days?

12\. What minimum outcome and intervention data may be retained after a source integration is disconnected?

Open questions do not relax alpha-gated acceptance criteria. Each must be resolved by a dated PRD change, experiment, or explicitly deferred decision before it blocks V0 Alpha Ready or the relevant V0 follow-on release.

# 32 Change log

| **Version** | **Date** | **Change** | **Authority** |
|----|----|----|----|
| 0.2 | 15 September 2026 | Clarified single-workspace membership; phased alpha detectors; separated Alpha Ready from Validated; strengthened dual-agent cohort coverage | Founder |

Future entries must state which requirements and acceptance criteria changed, why the evidence justified the change, and whether the charter was affected. The charter is unaffected by v0.2.
