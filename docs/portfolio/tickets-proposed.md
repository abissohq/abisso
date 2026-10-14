# Approved portfolio tickets — revision 2

Status: **breakdown and publication approved; ten child tickets published; #50 alone has bounded experiment authorization; #51–#59 remain on hold**.

Prepared with `to-tickets` against the approved scope and primary test seams. Sequence numbers map to the published GitHub issues below. Approval of this breakdown alone does not authorize implementation. The later #50 preflight stopped before live input; see [evidence and outcome](feasibility-50.md).

## Breakdown assessment

Former ticket 2 combined consent, privacy policy, persistent encrypted storage and recovery. Split it into a non-persistent consent/preview journey and a durable queue/control journey. Former ticket 3 combined source authority, capability activation and event delivery. Split it into source readiness and session delivery. Each slice ends in observable user behavior and reuses existing schema/API layers where possible; none is a standalone database or API scaffolding ticket.

The early live Codex gate is deliberately a bounded feasibility experiment, not a feature slice. It precedes provider-specific implementation and may stop it. The fixture demonstration and accessible UI are independent of its outcome. Common collector work can proceed after future implementation authorization, but a failed gate blocks the real-provider claim and overall portfolio exit. Prioritize the gate first to expose that risk before substantial collector investment.

## 1. Prove a content-safe live Codex execution at zero additional spend

**Blocked by:** None. Schedule first; fixture work need not wait.

**What it delivers:** An explicit pass/block decision based on one actual user-started execution, rather than installation/authentication status alone.

- [ ] Recheck the concrete CLI build and existing ChatGPT authentication; establish that the selected execution uses included access. No billed API fallback, credits, subscription or paid infrastructure. Uncertain access or exhausted allowance yields Blocked.
- [ ] Before live input, demonstrate bounded allowlist extraction on hand-authored adversarial fixtures. Prohibited bodies must not become observation objects, persisted files, logs, diagnostics or test artifacts. If the stream interface cannot meet the prohibited-input rules, stop and report the constraint; do not weaken the specification.
- [ ] Use one fresh, user-started, non-interactive execution in a disposable, explicitly selected test workspace, with harmless test input. Abisso neither controls the agent nor reads historical transcripts. The probe has no shared queue or telemetry upload and does not exercise the unfinished collector pipeline.
- [ ] Observe valid start and completion markers for the same execution interval. Record only the version, supported safe marker shapes, mapping verdict and sanitized fixture expectations. No provider credential, raw identifier, message, tool body, stderr dump or raw JSONL recording is retained.
- [ ] Explicitly distinguish execution completion from task success or accepted work: a structured completion marker establishes only that the observed execution interval completed. It does not prove the requested task was solved, outputs are correct, tests passed, or work was reviewed, accepted or merged. A feasibility Pass proves acquisition and lifecycle mapping only.
- [ ] Demonstrate that interrupted/malformed/unknown-version fixtures cannot imply completion, failure or waiting. Activity remains optional until supported by tested evidence.
- [ ] Record Pass only when existing-access execution, content-safe acquisition and lifecycle semantics all succeed. Otherwise record the exact blocker and keep real-provider integration disabled. No Live integration, capacity or production-readiness claim follows from Pass.

**Demo/test:** Sanitized fixture safety checks followed by one bounded live marker observation. Report Pass/Blocked and limitations. This is the sole experiment ticket; frontend work is not artificially added to it.

## 2. Reproduce the fixture-to-Live baseline with explicit demo provenance

**Blocked by:** None.

**What it delivers:** A reviewer starts the local development composition and sees two synthetic sessions without provider credentials.

- [ ] Verify clean-checkout prerequisites, zero-cost local PostgreSQL setup and repeatable commands; record actual results and platform skips.
- [ ] Exercise existing canonical ingestion, durable ledger/jobs, projections and SSE. Do not seed rendered cards or claim the fixture used the unfinished collector.
- [ ] Frontend labels synthetic evidence prominently, exposes provenance, and handles loading, empty and setup-failure states.
- [ ] Repeat the scenario without duplicate effective sessions; retain cross-workspace read negatives and development-only fixture authority.

**Demo/test:** Fixture ingestion -> two authenticated browser-visible sessions, plus backend-unavailable setup feedback.

## 3. Make fixture Workstreams understandable, responsive and accessible

**Blocked by:** 2 only. Neither the live gate nor real integration blocks this ticket.

**What it delivers:** A reviewer navigates two fixture sessions in Workstream cards/detail and understands evidence, uncertainty and freshness.

- [ ] Use real authenticated read models and SSE snapshot reconciliation; preserve ledger-founded identity and workspace-scoped detail access. Add only necessary read fields.
- [ ] Show lifecycle, source, freshness and observed timestamps separately from inferred provisional membership. Repository/cost/attention remain Not collected/Unknown/Not evaluated when appropriate.
- [ ] Provide useful loading, empty, error and reconnect states, safe reread actions and visibly stale retained data.
- [ ] Verify semantic controls, keyboard navigation, detail focus/return, accessible status announcements and non-color labels at narrow and desktop widths.
- [ ] Test two distinct sessions through the fixture/API/browser seam, including stale evidence and cross-workspace denial. Real provider evidence is not an acceptance prerequisite; ticket 8 adds its presentation to these established semantics.

**Demo/test:** Complete the two-session fixture walkthrough with keyboard only at narrow and desktop widths.

## 4. Consent to eligible fixture collection and inspect a non-persistent preview

**Blocked by:** 2.

**What it delivers:** An enrolled user explicitly consents to a fixture policy and inspects an allowed candidate locally before storage or transmission exists.

- [ ] Reuse browser enrollment and machine authority; persist only necessary consent/configuration with the effective policy version. Collection is off until consent and local eligibility pass; workspace policy cannot broaden local consent.
- [ ] Evaluate repository selection, exclusions, pause and private state before creating a shared candidate. Unknown/prohibited fields fail closed according to the canonical policy. This slice uses synthetic input only.
- [ ] Present the post-policy canonical candidate through local CLI/IPC in memory, clearly labeled “not queued or sent.” No outbound queue, uploader, raw-input persistence or browser-to-local control bridge is enabled.
- [ ] Frontend setup explains categories, consent state, eligibility requirements and where to use local preview/privacy controls; private inputs and preview bodies are not sent to the browser backend.
- [ ] Test enrollment -> consent -> permitted preview, denied consent, wrong-workspace configuration, exclusion/private/pause suppression and prohibited canaries absent from logs/diagnostics. Existing credentials remain protected.

**Demo/test:** Browser setup and consent -> local allowed fixture preview; the same input under a private or excluded policy produces no shared candidate.

## 5. Retain approved fixtures in an encrypted queue with local controls

**Blocked by:** 4.

**What it delivers:** A user can retain approved fixture records across restart, preview the exact queued bytes, pause, make a session private or discard them without uploading.

- [ ] Store only post-policy canonical records in the specified bounded SQLite/AES-256-GCM queue, with unique nonces, machine/schema authenticated metadata and a Keychain-held device key. Limits apply to bytes and record count.
- [ ] Local preview reads the exact stored canonical representation. Restart preserves valid identities/bytes; missing keys and failed authentication release no records. No network uploader is enabled.
- [ ] Persist pause before acknowledging it; atomically prevent new observations and remove affected unsent records on private transition. Private-before-start, transition races and restart cannot create a shared shell. Discard removes preview material.
- [ ] Record only content-free local loss, seal affected streams and preserve survivor identities under the existing ADR. Do not fabricate server dispositions or renumber surviving records.
- [ ] Frontend setup distinguishes preview-only readiness from upload availability and explains local retention/control behavior. Sensitive previews and private activity remain local.
- [ ] Test encryption, restart, corruption, capacity loss, exclusion/private/pause transitions and discard through the existing policy/IPC/Keychain seams, including prohibited-content scans.

**Demo/test:** Enqueue an approved fixture -> restart -> identical local preview; private/discard removes affected records without any transmission.

## 6. Establish source readiness through an accepted capability declaration

**Blocked by:** 5.

**What it delivers:** An enrolled collector registers an explicitly synthetic source and receives durable acceptance of its capability declaration; the browser shows its actual readiness.

- [ ] Add minimal server-authorized source registration bound to the enrolled user, machine, workspace and consented policy. A provider string cannot grant real-source authority.
- [ ] Upload a queued capability declaration over the required authenticated transport, preserving its canonical bytes. This slice's sender is restricted to declarations; dependent session delivery remains disabled.
- [ ] Resolve lost acknowledgements by exact identity retry. Persist accepted capability state only after durable acceptance; unsupported/rejected declarations never mark a source ready. A declaration in the same batch cannot activate a sibling.
- [ ] Reuse refresh and authority validation. Pause/private controls gate sends; confirmed revocation and incompatible policy fail closed. Re-enrollment cannot inherit the old queue. Synthetic credentials remain restricted to development/test composition.
- [ ] Frontend distinguishes registration pending, declaration pending, accepted and incompatible/denied states using authenticated server evidence, with safe recovery guidance. No private local status leaks through readiness.
- [ ] Test registration authorization, declaration acceptance, duplicate retry, rejection, cross-workspace denial and revoked authority through queue -> ingestion -> durable status -> browser.

**Demo/test:** Consent/enrollment -> queued declaration -> durable acceptance -> browser source-ready state; a rejected declaration never appears ready.

## 7. Deliver queued fixture session evidence to Live

**Blocked by:** 6.

**What it delivers:** A user sees an approved queued fixture session reach Live under an independently accepted capability declaration.

- [ ] Extend the bounded sender to supported dependent session events, requiring the active accepted declaration. Preserve per-event identities, original timestamps/policy and exact canonical bytes; request-wrapper freshness is separate.
- [ ] Handle accepted, duplicate, rejected and quarantined dispositions independently. Retain uncertain delivery for exact retry; preserve stream/checkpoint semantics and one effective projection.
- [ ] Apply current pause/private/consent/policy and machine-authority checks before sending or retrying. No private record, unsupported policy or old-machine queue escapes through retry. Existing stream-loss and capability replacement rules remain mandatory.
- [ ] Frontend shows synthetic session provenance and evidence freshness after projection; queued, acknowledged and projected are distinct claims. Reuse the current UI without waiting for ticket 3.
- [ ] Test preview = queued = uploaded event bytes, capability ordering, mixed dispositions, lost acknowledgement, cross-workspace denial, synthetic-versus-real authority and no upload after confirmed revocation.

**Demo/test:** Local approved preview -> queue -> authenticated ledger/job -> projection -> Live, including uncertain delivery followed by a safe retry.

## 8. Integrate the proven Codex interval through the safe collector path

**Blocked by:** 1 (Pass required) and 7. Does not depend on 3.

**What it delivers:** The real provider markers proven by the gate reach Live through the same privacy, queue and authenticated upload path as fixtures.

- [ ] Revalidate gate evidence against the current CLI build. Add only the pinned adapter/profile and authorized real source; fixture replay retains synthetic provenance. No generic framework, transcript importer or provider control.
- [ ] Apply consent, eligibility, exclusions and local privacy before draft creation. Map only proven lifecycle markers; omit path/repository/file/branch refs, usage and money. Unsupported input degrades safely.
- [ ] Verify browser/machine authentication and safe local transport using existing access at zero additional spend. Missing allowance or prerequisites block the demonstration; no synthetic authority handles real observations.
- [ ] Frontend identifies real Codex provenance and supported execution-interval limits; completion does not mean accepted work. Use existing cards/read contracts and supply focused presentation tests regardless of whether ticket 3 has landed.
- [ ] Run the approved main seam with safe provider fixtures and negative cases, then record one separately labeled real end-to-end demonstration. EOF or invalid ordering never yields Completed.

**Demo/test:** User-started Codex -> approved metadata -> encrypted queue/upload -> Live with inspectable real provenance. The early gate alone is not this end-to-end proof.

## 9. Reproduce offline recovery and truthful collection gaps with fixtures

**Blocked by:** 7 only. Real provider access and UI polish are not prerequisites.

**What it delivers:** A reviewer interrupts delivery, restarts and reconnects without duplicate effective projections or invented outcomes.

- [ ] Exercise a documented workload representing at least 30 minutes of ordinary interruption; disclose event rate, byte volume, capacity and virtual-time use.
- [ ] Reproduce lost acknowledgement, mixed dispositions, restart, corruption/discard, stream sealing and capability re-declaration. Preserve survivor IDs/bytes, stable Workstream identity and one effective projection.
- [ ] Test pause/private/policy narrowing/revocation during the outage, including old-queue isolation after re-enrollment. Basic safety remains required in tickets 5–7; it is not deferred here.
- [ ] Add only necessary canonical health/privacy projection/read behavior for shared collection gaps. No private identity, provider, repository, activity count or direct private duration is revealed.
- [ ] Frontend preserves stale accepted evidence, explains disconnected/resynchronizing states and content-free gaps, and offers safe reread. Reconnect reconciles an authoritative snapshot rather than pretending SSE is a durable log.

**Demo/test:** Deterministic credential-free disconnect/restart/reconnect script with ledger/projection checks and browser assertions.

## 10. Integrate the frontend, real evidence and recovery walkthrough

**Blocked by:** 3, 8 and 9.

**What it delivers:** A clean-checkout hiring demonstration combines accessible UI, separately evidenced real integration and reproducible recovery.

- [ ] Reconcile UI/status additions from parallel slices; run the same keyboard/responsive/freshness/provenance checks against the final integrated fixture and real-source presentation.
- [ ] Verify credential-free setup from a clean portfolio checkout; provide the two-session fixture/recovery walkthrough and a separate sanitized real-integration recording. Do not call a recording currently live.
- [ ] Explain one event, transaction/idempotency boundaries, privacy/isolation, failure diagnosis, uncertainty and AI-assisted contributions. Document remaining M1/V0/production gates.
- [ ] Report measured local performance with workload, versions, hardware and sample count. Run full/relevant tests, typecheck, dependency and frontend checks; disclose failures and platform skips.
- [ ] Review against the portfolio spec and production invariants; verify PR bases target `portfolio-ready`, main is untouched and production specifications are unchanged.

**Demo/test:** A new reviewer follows the complete walkthrough without provider credentials and can find the separate real evidence and its limitations.

## Publication and execution status

The user approved these ten tickets and their dependencies for publication, with an explicit distinction between execution completion and task success/accepted work in ticket 1. All child issues are `ready-for-human` pending separate execution authorization. No live experiments or feature implementation are authorized or performed.

The parent specification remains [#49](https://github.com/abissohq/abisso/issues/49); its body and labels were not edited. Native child relationships were added as authorized. The approved ten-ticket breakdown supersedes its historical seven-ticket reference. Its label does not override the execution hold.

## Published issue mapping

- 1. [#50: Prove a content-safe live Codex execution at zero additional spend](https://github.com/abissohq/abisso/issues/50) — blocked by None (execution hold still applies).
- 2. [#51: Reproduce the fixture-to-Live baseline with explicit demo provenance](https://github.com/abissohq/abisso/issues/51) — blocked by None (execution hold still applies).
- 3. [#52: Make fixture Workstreams understandable, responsive and accessible](https://github.com/abissohq/abisso/issues/52) — blocked by #51.
- 4. [#53: Consent to eligible fixture collection and inspect a non-persistent preview](https://github.com/abissohq/abisso/issues/53) — blocked by #51.
- 5. [#54: Retain approved fixtures in an encrypted queue with local controls](https://github.com/abissohq/abisso/issues/54) — blocked by #53.
- 6. [#55: Establish source readiness through an accepted capability declaration](https://github.com/abissohq/abisso/issues/55) — blocked by #54.
- 7. [#56: Deliver queued fixture session evidence to Live](https://github.com/abissohq/abisso/issues/56) — blocked by #55.
- 8. [#57: Integrate the proven Codex interval through the safe collector path](https://github.com/abissohq/abisso/issues/57) — blocked by #50, #56; #50 must Pass.
- 9. [#58: Reproduce offline recovery and truthful collection gaps with fixtures](https://github.com/abissohq/abisso/issues/58) — blocked by #56.
- 10. [#59: Integrate the frontend, real evidence and recovery walkthrough](https://github.com/abissohq/abisso/issues/59) — blocked by #52, #57, #58.

## Authorization update — 2026-10-14

Only #50 is authorized for its bounded feasibility experiment. Its access precheck found available included usage, but privacy-safe acquisition was not established; it stopped before inference and remains open with `ready-for-human` for that blocker. See [the evidence](feasibility-50.md). This later authorization supersedes the historical blanket hold only for #50; #51–#59 and all feature implementation remain on hold. #57 requires #50 to Pass. The user-authorized parent update resolves the older seven-ticket/status/frontend wording and aligns #49 with `ready-for-human` while keeping it open.
