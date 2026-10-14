# Single-provider feasibility — 2026-10-12

Decision: select **Codex CLI, one user-started foreground non-interactive execution interval**, conditionally feasible at $0 additional spend using existing ChatGPT access. This is interface/access evidence, not a completed integration or a successful inference smoke test. No inference request, purchase, installation, credential extraction, transcript inspection, or feature implementation was performed.

## Verified local evidence

- The original checkout is on `feat/m1-07-workspace-derivation-keys` with unrelated tracked and untracked changes. Leave it untouched.
- The separate portfolio worktree is on `portfolio-ready`, at `369fcd000f3bff368ce611fb8f0d27b0c5e064f8`, equal to local main. Its only pre-existing change is untracked `docs/portfolio/plan.md`. Remote freshness was not verified.
- `codex --version`: `codex-cli 0.155.0-alpha.2.6`.
- `codex login status`: `Logged in using ChatGPT`. No credential contents were read.
- `codex exec --help` confirms `--json`, `--ephemeral`, and read-only sandbox support. The CLI reported a nonfatal PATH-alias permission warning.
- `claude` is not available on PATH. This does not prove the absence of an account or another installation; it provides no verified zero-cost Claude Code execution path here.

## Evidence and limits

[Official non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) describes JSONL lifecycle events, alongside content-bearing items. [Official authentication documentation](https://learn.chatgpt.com/docs/auth) distinguishes ChatGPT subscription access from usage-billed API-key access. Local authentication matches the former. Remaining allowance and compatibility of an actual streamed execution are unverified. If included access is exhausted or unavailable, wait for existing access or report a blocker; never switch to billed API access, buy credits, or subscribe.

Document 4, section 21 already maps one Codex execution interval to one canonical session. Support only a fresh, single-turn execution for this milestone; persistent desktop threads, interactive sessions, resume/fork, historical imports and subagent discovery are unsupported. A completed execution interval is not completion of the persistent provider thread, accepted work, or a merged PR.

## Proposed allowlisted mapping and fixture contract

These are hand-authored fixture expectations derived from the documented interface, **not captured provider evidence and not executed tests**. Compatibility must be proved against the installed build before real observation is enabled.

1. A valid fresh `thread.started` followed by `turn.started` establishes the selected execution interval. Emit one `session.started` with non-interactive mode after capability acceptance. Keep provider identity local; create an opaque canonical session ID and persist only the protected mapping needed for continuity. Source time is not supplied by these markers: use collector observation time with honest clock quality.
2. Subsequent approved structured boundaries may yield rate-limited `session.activity` with the narrow existing heartbeat semantics. Never use a collector timer, process presence, or message count to manufacture provider activity. Do not require activity output if the supported fixture cannot prove the mapping.
3. `turn.completed` for that same single execution interval yields `session.completed`; discard usage in this milestone. No completion on EOF, exit code, timeout, missing events, or generic errors.
4. `turn.failed`, generic `error`, malformed input, unknown versions, interrupted streams, or impossible ordering never produce completion. Until safe canonical failure support is separately implemented, expose content-free degraded/unknown coverage and stale prior evidence, not a fabricated terminal result.
5. Drop item bodies, text, reasoning, commands, arguments, outputs, paths, URLs, raw error messages and unknown fields. No raw JSONL files, transcript readers, stderr dumps, diagnostic payloads or persisted raw fixture recordings.
6. Private/excluded/paused input must be suppressed before shared observation. Transient framing must be bounded and discard non-allowlisted values without building content-bearing draft objects. If the acquisition interface cannot satisfy the prohibited-input rules, real ingestion stays disabled; redacting a persisted transcript is not an acceptable fallback.

Fixture scenarios for implementation: normal start/completion; repeated marker; completion without start; interrupted stream; malformed/oversized/unknown record; content canaries in all prohibited fields; private-before-start and private-mid-run; pause/resume; exclusion; unsupported version. Verify canonical output, exact preview/queue/upload equivalence, absence from logs, and browser provenance through the approved seams.

## Baseline gaps and scope controls

The committed contracts only permit adapter `synthetic_m0`; real registration and an explicitly versioned Codex adapter profile are required. Existing enrollment is not proof of consent, source registration, privacy filtering or upload readiness. The collector currently has no complete privacy/encrypted queue/uploader path. Reuse the event ledger, per-event dispositions, jobs, projection and SSE synchronization; do not bypass them for a polished UI.

Omit repository/worktree/file/branch refs and token/cost collection from this narrow provider profile. Repository selection and local exclusions still gate observation. No sensitive path is sent, and no workspace derivation-key dependency is needed merely to display a session. If such refs become necessary, the authoritative HMAC/key-provisioning requirements apply; use reviewed commits or a separate approved slice, never copy the dirty M1 work.

The credential-free fixture demo uses explicit development/test composition. The real path requires valid enrolled machine authority, consent and safe transport; synthetic authority cannot upload real observations. Existing browser authentication access and local TLS setup must be checked before the real demonstration. If either cannot be supplied at zero additional cost, record a blocker rather than weaken the production boundary.

## Verdict

Codex is selected for the now-approved tickets. The observations in this assessment are dated 2026-10-12 and have not been refreshed through a live experiment. Real demonstration remains gated on a content-safe acquisition proof, versioned sanitized fixtures, existing included access, authenticated local setup, and the complete privacy/upload seam. Claude Code and all other providers remain outside this milestone. Attention detection and GitHub outcomes remain stretch scope, not core acceptance criteria.
