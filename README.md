# Abisso

**Engineering Agent Control Plane**

Abisso helps engineering teams see, understand, and control work across humans and AI coding agents.

The product builds a privacy-first, vendor-neutral operational layer over coding agents and engineering delivery systems. Its core internal model is the **Live Engineering Work Graph**, and its initial product wedge is **Needs Attention**.

> This repository is private and contains internal Abisso product and implementation work.

## V0

The initial V0 supports:

- Claude Code
- Codex
- GitHub
- GitHub Actions

The first implementation target is intentionally narrow: 

```text
synthetic canonical event
        ↓
ingestion
        ↓
durable event ledger
        ↓
projection
        ↓
realtime update
        ↓
minimal Live view
```
