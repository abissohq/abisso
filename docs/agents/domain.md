# Domain Docs

How the engineering skills should consume this repository's product and domain documentation.

## Authority order

Before proposing product, architectural, telemetry, graph, security, privacy, or implementation decisions, read the relevant authoritative specifications.

The authority order is:

1. `docs/product/01-product-thesis.md`
2. `docs/product/02-v0-prd.md`
3. `docs/architecture/03-system-design.md`
4. `docs/architecture/04-canonical-telemetry.md`
5. `docs/architecture/05-work-graph.md`
6. `docs/architecture/06-security-privacy-threat-model.md`

Lower-level documents and implementation must not silently contradict higher-level documents.

## Before exploring, also read these when relevant

- `CONTEXT.md` at the repository root, when present.
- Relevant decisions under `docs/adr/`.

`CONTEXT.md` and ADRs supplement the six authoritative specifications. They do not override them unless an explicit, approved specification change says so.

If `CONTEXT.md` or ADRs do not yet exist, proceed silently.

## File structure

This repository uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── adr/
│   └── agents/
├── apps/
└── packages/
```
Use the glossary's vocabulary
When output names a domain concept—in an issue title, proposal, hypothesis, specification, or test—use the term defined in CONTEXT.md when present and stay consistent with the authoritative specifications.
Do not drift to synonyms that change product meaning.
If a needed concept is missing, note the gap for domain modeling rather than inventing a competing term.
Flag conflicts
If proposed work contradicts:
- an authoritative specification, or
- an existing ADR,
surface the conflict explicitly rather than silently overriding the decision.
If a new implementation decision is not already resolved by the specifications, document it through the ADR process when appropriate.
