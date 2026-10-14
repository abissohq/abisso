# Portfolio milestone: safe local Codex evidence and a reviewer-ready Live experience

Status: portfolio scope, primary test seams and the ten-ticket breakdown are approved and published as #50–#59. Only #50 is authorized for a bounded feasibility experiment, with stop conditions for spend and privacy. Its preflight stopped with privacy-safe acquisition not established; see [the evidence](feasibility-50.md). #51–#59 remain on execution hold. No feature implementation is authorized. Parent #49 remains open with `ready-for-human`. Production specifications retain authority.

## Problem Statement

A hiring reviewer cannot yet reproduce an end-to-end Abisso demonstration that makes both backend correctness and frontend engineering visible. Existing durable ingestion and projection work is useful, but the collector does not deliver real provider evidence safely and the minimal Live view does not explain capabilities, uncertainty, recovery and privacy clearly enough.

## Solution

Deliver a local showcase with a credential-free, explicitly synthetic reviewer path and one separately demonstrated Codex execution interval using existing access at $0 additional spend. Both paths exercise the intended event pipeline. Show readable Workstream cards and details, provenance, evidence freshness and reproducible recovery. Keep this distinct from M1 completion, V0 Alpha Ready and production readiness.

## User Stories

1. As a reviewer, I want a clean-checkout local demo without provider credentials, so I can assess the project without buying access.
2. As a reviewer, I want synthetic evidence clearly labeled, so I do not mistake fixtures for real integrations.
3. As a developer, I want to observe one supported Codex execution using my existing access, so the demonstration incurs no new charge.
4. As a developer, I want compatibility limits disclosed, so unsupported provider versions cannot silently misreport my work.
5. As a developer, I want collection disabled until consent and eligibility checks pass, so installation alone does not share data.
6. As a developer, I want repository and path exclusions evaluated locally, so excluded identifiers never leave my device.
7. As a developer, I want private-before-start and private-mid-run controls, so hidden work never enters the shared queue.
8. As a developer, I want pause to stop observation and transmission, so previously approved records stay local until I choose otherwise.
9. As a developer, I want to preview and discard queued records locally, so I can verify exactly what could be uploaded.
10. As a developer, I want approved records encrypted at rest, so queue files do not expose metadata.
11. As a workspace member, I want browser and machine authority kept separate, so enrollment does not grant a collector read access.
12. As a reviewer, I want to trace one event through durable acknowledgement and projection into Live, so I can understand the system's boundaries.
13. As a reviewer, I want two sessions distinguishable in Live, so concurrency and identity are visible without inventing correlation.
14. As a reviewer, I want Workstream details to explain evidence and inferred membership separately, so I can judge the displayed state.
15. As a reviewer, I want start and terminal labels backed by explicit markers, so silence never looks like success.
16. As a reviewer, I want unavailable repository, attention and cost evidence clearly labeled, so missing data does not imply a healthy outcome or zero cost.
17. As a reviewer, I want empty, loading, error and reconnect states with useful actions, so the UI remains understandable during failure.
18. As a keyboard user, I want accessible controls, focus and status messages, so I can navigate the complete demonstration.
19. As a mobile-width reviewer, I want a responsive layout, so evidence and recovery controls remain readable.
20. As a developer, I want buffering and retries to preserve event identity, so reconnect does not duplicate a session or effective projection.
21. As a developer, I want machine revocation and policy changes to fail closed, so old records cannot escape under new authority.
22. As a reviewer, I want collection gaps explained without hidden-session details, so privacy and uncertainty remain visible together.
23. As a maintainer, I want isolated replay to preserve identity, so the demonstration remains auditable and deterministic.
24. As the author, I want an honest walkthrough and measured local results, so I can explain my engineering decisions and AI-assisted contributions.

## Implementation Decisions

- Preserve the six authoritative documents, domain glossary and existing ADRs. This is a narrower portfolio milestone, not a change to V0 release gates. Retain the PostgreSQL modular monolith, authenticated ingestion, durable ledger/jobs, projections and SSE snapshot reconciliation.
- Work only through slice branches based on `portfolio-ready`, with PRs explicitly targeting that branch. Leave main and unrelated uncommitted M1 work untouched. No feature implementation follows from this parent or its triage label until the ticket breakdown is approved and implementation is requested.
- Select a version-pinned Codex CLI adapter for one fresh, user-started foreground non-interactive execution interval. No agent launching, prompting, stopping or provider credential handling in the Abisso product. The user drives the provider independently and explicitly opts into the observer.
- Codex is locally installed and signed in with ChatGPT. This establishes a plausible existing-access route, not remaining quota or a successful smoke test. No API billing fallback, subscription, credit purchase, paid hosting, signing enrollment or public real-telemetry service is permitted.
- Use a content-minimizing structured stream intake. Only tested lifecycle discriminators and protected local continuity identity may become drafts. Never persist provider JSONL or read historical transcripts. Unknown or incompatible input fails closed with bounded content-free health diagnostics. If prohibited bodies cannot be avoided at the observation boundary, block the real path.
- Map start and structured completion to the canonical execution-interval lifecycle defined by the telemetry specification. Accept activity only when a tested structured boundary supports it. EOF, process disappearance, timers and silence never imply success, failure, waiting or meaningful progress. Execution completion does not prove task success, output correctness, test passage, review, acceptance or merge.
- Introduce only the narrow registered source/profile and canonical health/privacy support needed for this milestone. The baseline synthetic-only adapter contract must not be widened into arbitrary adapters. Real and fixture source authorities remain distinct, and fixture replay always keeps synthetic provenance even when it mimics Codex markers.
- Capability declarations are independently durably accepted before dependent events are produced for upload. Declare unsupported or uncollected evidence honestly. No attention detector, token pricing, GitHub outcome inference or repository correlation is required.
- Omit repository, worktree, file and branch references from shared records in this profile; eligibility/exclusion decisions remain local. Use opaque canonical session identity and protected local continuity mappings. Do not borrow unfinished derivation-key work. If sensitive derived references become necessary, apply the specified workspace-keyed derivation and resolve the dependency through reviewed work.
- Consent, repository eligibility, exclusions, pause and private controls precede transformation and enqueue. Private transitions atomically remove affected unsent shared records as required by the existing collector requirements, prevent further observation and preserve only content-free gaps. Never create a private session shell or link across a private gap.
- Use the specified bounded SQLite record queue, AES-256-GCM with unique nonces and machine/schema authenticated metadata, and a Keychain-held device buffer key. Preview reads the exact post-policy canonical bytes. Uploader sends those same event bytes without rewriting identity, policy or timestamps; fresh request wrappers may differ. Authentication failure never releases corrupt records.
- Retain exact identities and bytes until durable per-event acknowledgement. Apply existing event equivalence, capability, policy compatibility and local-loss ADRs. Handle revoked authority, private changes and policy narrowing before retry. A re-enrollment cannot inherit the old machine's queue. Missing acknowledgement means uncertain delivery, not rejection.
- Reuse browser enrollment, machine refresh and workspace-scoped repositories. Add the smallest consent/source registration/configuration contracts needed. Production authentication must never accept the development fixture issuer. Local privacy control and raw preview remain on the device through the existing CLI/IPC trust boundary; the web app gives setup guidance and permitted shared status, not remote access to local private details.
- Frontend work is part of every implementation slice; the approved early feasibility experiment (#50) is the bounded exception: onboarding and compatibility guidance, explicit fixture labels, source coverage, readable cards/detail, stale-versus-current styling, safe recovery actions and accessible states. Keep technical identifiers in evidence detail; the primary view answers what was observed and how recently. Use the existing authenticated read model and realtime flow rather than hardcoded UI data.
- Two fixture sessions suffice for the repeatable concurrency showcase. A separate live Codex execution must be demonstrated honestly before exit; recorded evidence is never described as currently live. Missing cost is Unknown/Not collected and attention is Not evaluated.
- Bind the local demonstration to trusted local interfaces. The credential-free synthetic path uses explicit development/test composition. Real observations require existing browser authentication, enrolled machine credentials and the specified TLS boundary; inability to meet this at zero additional cost is a blocker, not permission to bypass it.

## Testing Decisions

Scope and primary seams were approved on 2026-10-12; no further seam interview is required. Test public behavior and durable effects, not implementation structure.

- Main seam: fixture/provider input through policy, exact preview/encrypted queue, authenticated ingestion, ledger/job, projection and browser Live. Add behavioral coverage before expanding each slice.
- Recovery seam: interrupt after uncertain acknowledgement, restart/reconnect and retry the same event; prove durable acknowledgement and one effective projection. SSE reconnect rereads a coherent snapshot; it does not replay a durable notification log.
- Boundary negatives: prohibited canaries absent from queue, outbound bytes, logs and diagnostics; private/excluded records never queued; wrong-workspace reads/writes denied; synthetic input cannot masquerade as a real provider; revoked authority and unknown policy fail closed.
- Frontend: keyboard navigation, focus, non-color status labels, narrow/wide viewports, empty/loading/error/reconnect states, evidence freshness and visible provenance. Test with real API responses in the local integration harness rather than UI-only mocks for the main seam.
- Extend prior session-start, heartbeat, mixed-batch ingestion, recovery, replay, browser-workspace, enrollment, refresh, Keychain, collector IPC and diagnostics integration tests. Use their existing boundaries rather than create a generic adapter framework.
- Pin sanitized fixture expectations and concrete provider versions. Hand-authored documentation fixtures are not a compatibility test pass; a later safe live smoke test is required. Run relevant tests and typecheck per slice, full suite and dependency checks at completion. Disclose platform-dependent checks and skips.
- Measure local latency/recovery with workload, versions, hardware, sample count and timing boundaries disclosed. Do not claim production performance or the V0 95-of-100 start criterion from a single demonstration.

## Out of Scope

Multi-provider support; persistent desktop/interactive Codex sessions; resume/fork or historical transcript import; provider control; GitHub outcomes and attention detectors beyond optional separately approved stretch work; generated summaries; billing; paid/cloud deployment; signed distribution; broad scaffolding; workforce analytics; production readiness claims; changing production issues or specifications; feature implementation during this planning task.

## Further Notes

Feasibility evidence and the approved ten-ticket breakdown accompany this specification. Existing authority resolves the selected architecture; no new ADR is required merely to choose the already-specified Codex execution-interval mapping. Any implementation discovery requiring a new architectural decision must produce a proposed ADR before dependent work.

Exit requires a reproducible synthetic demo, a separately labeled real demonstration, usable frontend, repeatable recovery, privacy/isolation negatives, relevant checks, a short video and documentation, and an author walkthrough. Screenshots/video show only sanitized Abisso demo views; this does not introduce collector screenshot capture. Production hosting, signing, clean-machine and remaining V0 gates remain pending.

Sources: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Codex authentication](https://learn.chatgpt.com/docs/auth), and the repository's approved portfolio plan and six authoritative specifications. Provider access and interface checks are dated 2026-10-12; no new integration test run is claimed.

On 2026-10-14, the user authorized updating tracker parent #49 to the approved ten-ticket plan, dependencies and explicit frontend exception for #50. Those tracker discrepancies are resolved without changing substantive requirements. Only #50 has bounded experiment authorization; the other execution holds remain.
