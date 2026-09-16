# Abisso Agent Instructions

Abisso is an Engineering Agent Control Plane.

## Product authority

The authoritative product and engineering documents live under:

- `docs/product/`
- `docs/architecture/`

Their authority order is:

1. Product Thesis and Founding Charter
2. V0 Product Requirements Document
3. System Design and Technical Architecture
4. Canonical Agent Event and Telemetry Specification
5. Live Engineering Work Graph Specification
6. Security, Privacy and Threat Model Specification

Lower-level documents and implementation MUST NOT silently contradict higher-level documents.

If implementation needs a decision not covered by the existing specifications, create or propose an ADR under `docs/adr/`.

## Core engineering rules

- Preserve the distinction between observed facts and inferred state.
- Privacy enforcement happens before data enters the outbound queue.
- Do not collect prohibited content by default.
- Do not introduce employee surveillance, developer ranking, idle-time metrics, keystroke tracking, mouse tracking, screenshots, clipboard capture, or similar behavior.
- Keep the V0 architecture PostgreSQL-first and modular-monolith-first.
- Do not introduce Kafka, Redis, graph databases, microservices, service meshes, Kubernetes, or other distributed infrastructure without measured evidence and an ADR.
- Keep provider-specific logic behind adapters.
- Preserve provenance, uncertainty, replayability, and deterministic behavior where specified.
- Treat workspace isolation and local privacy enforcement as release-blocking requirements.
- Prefer small vertical slices over broad scaffolding.
- Add tests at architectural seams before expanding behavior.
- Do not expand V0 scope without explicit evidence and a documented decision.

## Current implementation phase

The repository is in initial V0 implementation.

Do not build broad infrastructure or speculative abstractions.

The first implementation goal is a narrow end-to-end tracer:

synthetic canonical event
→ ingestion
→ durable event ledger
→ projection
→ realtime update
→ minimal Live view

## Working style

Before making a significant architectural change:

1. Read the relevant authoritative specification.
2. State the constraint being implemented.
3. Prefer the smallest design that satisfies it.
4. Add or update tests.
5. Record a new architectural decision only when the existing specifications do not already decide it.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `abissohq/abisso`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.
