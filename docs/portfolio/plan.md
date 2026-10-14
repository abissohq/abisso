# Portfolio readiness plan

Status: scope and primary test seams approved by the user, 2026-10-12. Specification prepared; ten-ticket breakdown approved and published; #50 alone is authorized for a bounded feasibility experiment; #51–#59 remain on hold. The #50 preflight stopped with privacy-safe acquisition unestablished. No features implemented.

## Purpose and authority

Build a demonstrable local Abisso showcase for junior full-stack/backend roles, with strong frontend evidence and a real AI-agent integration. This is a separate milestone, not M1 completion, V0 Alpha Ready, or production readiness. Existing product, telemetry, privacy, security, and isolation requirements retain authority. Production distribution/hosting gates remain pending; they are not waived. No new architectural decision is made by this planning document.

Budget: $0 additional spend, assuming existing computer, internet, and provider access. No paid subscriptions, usage purchases, cloud deployments, or signing enrollment. Reviewer demo requires no provider credentials. Real provider demonstrations use only already available access. No public service exposing real telemetry.

## Branch strategy

Integration branch: `portfolio-ready`, created from local main at `369fcd000f3bff368ce611fb8f0d27b0c5e064f8`.
Worktree: `/Users/jatinawankar/Startup/abisso-portfolio`.
The original checkout and its uncommitted M1 derivation-key work remain untouched. Do not copy that unfinished work. Reuse it later only from reviewed commits if needed. At planning time this baseline matched local main; remote freshness was not verified then. On 2026-10-14, remote main was verified at the same baseline before publication.

Use short-lived slice branches from the portfolio branch, with PRs targeting the portfolio branch rather than main. Explicitly verify the PR base. No automatic back-merges into main. Main preserves production intent, not a claim of release readiness.

## Initial implementation inventory

Source inspection shows:

- Durable canonical event ingestion, transactional jobs, deduplication, partial batch dispositions, asynchronous projections, worker recovery, isolated replay, authenticated Live reads, and SSE invalidation.
- A minimal React Live view with provenance and evidence freshness, rather than a polished portfolio interface.
- Browser identity/workspace creation, machine enrollment and refresh, Keychain helper, local collector IPC and bounded diagnostics.
- Collector daemon currently exposes inactive status/diagnostics. It is not a complete provider-to-Live pipeline.
- No complete real provider adapter, local privacy/encrypted queue/uploader pipeline, attention detector, or GitHub outcome integration was found in the baseline inventory.

This is a capability inventory, not a complete security or line-by-line code review. M1 clean-machine and signing acceptance have not been established. Historical M0 evidence is documented separately; fresh verification is reported in the task.

## Approved delivery sequence

These are approved, published tickets. Only #50 has bounded experiment authorization; #51–#59 remain on hold. Full acceptance criteria are in [the revised breakdown](tickets-proposed.md). Scope and primary test seams are unchanged.

1. **Early live Codex feasibility gate.** No blockers; prioritize first. Prove existing-access execution, content-safe acquisition and lifecycle markers without shared telemetry upload. Pass is required for ticket 8. A blocked gate does not block fixture/UI work, but blocks the real-provider claim and portfolio exit.
2. **Reproducible fixture-to-Live demo.** No blockers. Show two clearly labeled synthetic sessions through the existing backend and authenticated UI.
3. **Accessible Workstream UI.** Blocked only by 2. Responsive cards/detail, keyboard operation, provenance, freshness and useful failure states use fixtures and real API responses.
4. **Consent and non-persistent preview.** Blocked by 2. Complete the enrollment/consent/eligibility journey and local policy preview with no queue or upload.
5. **Encrypted queue and local controls.** Blocked by 4. Persist approved fixture bytes safely, preview across restart and enforce pause/private/discard without upload.
6. **Source registration and accepted capabilities.** Blocked by 5. Use authenticated declaration delivery and show durable source readiness; session delivery remains disabled.
7. **Queued fixture session delivery.** Blocked by 6. Carry accepted-capability-dependent evidence through durable ingestion/projection to Live, with privacy and retry negatives.
8. **Real Codex-to-Live integration.** Blocked by 1 (Pass) and 7. Connect the proven metadata interface to the safe pipeline and demonstrate real provenance.
9. **Fixture recovery and collection gaps.** Blocked only by 7. Demonstrate sustained offline buffering/restart/reconnect, truthful gaps and one effective projection.
10. **Integrated hiring walkthrough and verification.** Blocked by 3, 8 and 9. Reconcile frontend work from independent slices and verify the final demo, real evidence, recovery and remaining limitations.

GitHub outcome reconciliation is stretch scope after the core showcase passes. Session completion must never be described as merged or accepted work. Multi-provider support, billing, hosted team operations, signed distribution, broad detector coverage and LLM-generated summaries are outside this milestone.

## Approved test seams

- Main seam: collector fixture/provider input -> privacy policy -> preview/encrypted queue -> authenticated ingestion -> ledger/job -> projection -> browser Live.
- Recovery seam: interruption/restart and exact retry -> durable acknowledgement and one effective projection.
- Boundary negatives: prohibited payload markers never appear in queue/outbound/logs; private/excluded inputs never enter shared queue; cross-workspace access fails; synthetic sources never masquerade as real providers.
- Frontend behavior: keyboard operation, useful empty/error/reconnect states, narrow/wide viewports and preserved freshness/provenance.

Prefer existing integration seams and externally visible behavior. Add meaningful tests before expanding behavior; do not duplicate implementation details in tests.

## Skill workflow

Use the installed repository skills in this order:

1. `to-spec`: synthesize the agreed portfolio scope and check the test seams with the user before publishing the parent specification.
2. `to-tickets`: propose small vertical tickets and dependencies; obtain the skill-required breakdown approval, then publish portfolio-scoped GitHub issues. Do not change or close production issues.
3. `implement` with `tdd`: one approved ticket per slice branch, tests at agreed seams, typecheck and relevant tests, then full suite at completion.
4. `code-review`: standards and spec review against the slice's portfolio base; satisfy findings before integration.

The numbered slices above map to approved GitHub tickets #50–#59. Scope and primary test seams are approved. Next: resolve #50’s recorded privacy acquisition blocker before any live input; #51–#59 require separate execution authorization. The ten approved child tickets are published with native dependencies; publication does not permit execution.

## Portfolio-ready exit criteria

- A reviewer can run the synthetic demonstration locally without paid credentials.
- A real provider session has been demonstrated separately and is labeled honestly.
- The UI is usable by keyboard and on narrow and desktop layouts.
- One recovery story is demonstrable, with no fabricated state or duplicate effective projection.
- Privacy and tenant boundaries have meaningful negative tests.
- Relevant checks pass on the portfolio branch; platform checks/skips are disclosed.
- A short video and README explain the user problem, working behavior, architecture, tradeoffs and remaining production gates.
- The author can trace one event, explain transaction/idempotency boundaries, debug a failed update and describe AI-assisted contributions honestly.

## Planning continuation — 2026-10-12

Verified the separate `portfolio-ready` worktree at the recorded baseline; its only prior change was this untracked plan. The original checkout remains on its feature branch with unrelated uncommitted M1 work. Local main is unchanged; remote freshness was not verified during that initial planning step.

See [provider feasibility](provider-feasibility.md), [portfolio specification](spec.md), and [approved vertical tickets](tickets-proposed.md). Codex CLI is the selected, conditionally feasible provider using existing ChatGPT authentication; remaining allowance and an actual safe live execution are not verified. Claude Code is not on PATH. No inference request or purchase was made.

The narrow provider profile omits path-derived references and does not borrow the dirty derivation-key work. Real observation depends on the complete privacy, queue and authenticated upload seam. Ticket-breakdown approval was pending at this initial step and was subsequently granted, as recorded below; feature implementation has not been authorized.

Parent specification published through `to-spec`: [GitHub issue #49](https://github.com/abissohq/abisso/issues/49), labeled `ready-for-agent` as the skill requires. Its explicit implementation hold remains in effect. No child tickets had been published at that initial step; the later approved publication is recorded below.

## Breakdown revision 2

The user requested an early live feasibility gate and fixture-dependent accessible UI. Former tickets 2 and 3 are now four independently verifiable journeys: consent/preview, encrypted local queue, source capability readiness, and session delivery. Recovery also depends on fixtures rather than provider access. No live experiment or feature work was performed during this revision. No child tickets or parent issue edits were published.

## Approved publication

The user approved the ten-ticket breakdown and publication. Child issues #50–#59 are published under #49 with the approved native blocking dependencies and acceptance criteria; see [the issue mapping](tickets-proposed.md#published-issue-mapping). Ticket 1 explicitly distinguishes execution completion from task success, correctness, test passage and accepted/merged work. All children use `ready-for-human` while separate execution authorization is pending. No live experiment or feature implementation was performed. Main and production specifications remain untouched.

## Planning baseline review — 2026-10-14

Verified this worktree is on `portfolio-ready`, with only the four portfolio planning documents untracked and no unrelated changes here. The original checkout's unrelated M1 work is preserved. Before publication, local and remote main both point to `369fcd000f3bff368ce611fb8f0d27b0c5e064f8`; no remote `portfolio-ready` branch exists yet.

Compared the ten local acceptance-criteria lists with GitHub #50–#59: they match, allowing only explicit “proposal ticket” wording in cross-references. Native parent links, blocking dependencies, execution holds and `ready-for-human` labels match the approved breakdown. #50 explicitly separates execution completion from task success or accepted work. No live provider access or feature behavior was tested.

No associated PR was found through the #49 cross-reference timeline, the `portfolio-ready` head-branch lookup, or the repository PR title/body review. A broad search for “49” also matched historical PR #13 because its body reports 49 passing tests; it concerns #6, not #49. No PR was created, merged, retargeted or closed.

Remaining tracker wording discrepancies: #49 still describes a proposed seven-ticket breakdown awaiting approval and says frontend work belongs in every slice. The later approved ten-ticket breakdown supersedes that sequencing/status text, and explicitly exempts the bounded feasibility experiment from frontend work. #49 also retains `ready-for-agent`; its explicit execution hold and the children's `ready-for-human` state remain authoritative for scheduling. The parent body, label and open status are left unchanged. These are documentation/status discrepancies, not authorization to start work.

This publication includes only the four documents in this directory. It authorizes neither #50's live experiment nor any feature implementation. Future implementation PRs must target `portfolio-ready`.

## #50 authorization and outcome — 2026-10-14

The user authorized correction of #49 and the bounded #50 experiment only. #49 now states the approved ten-ticket breakdown/dependencies, the #50 frontend exception and the continuing holds for #51–#59. It remains open with `ready-for-human`; the tracker discrepancies recorded in the baseline review above are resolved.

See [#50 evidence and Blocked outcome](feasibility-50.md). Installed CLI/authentication and available included access were checked without inference. Privacy-safe acquisition of the mixed JSONL stream was not established, so the live step was not started. #50 remains open for this blocker; #57 still requires an actual Pass. No feature implementation, new purchase, API-key fallback or production specification change was performed.
