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

## Implemented: Issue #3 ingestion foundation

This intermediate slice registers only `capabilities.declared` under
`m0-ingestion-foundation-v1`. It proves authenticated durable acceptance and
separate, versioned capability processing. M0 is not complete.

Prerequisites: Node 24, pnpm 12.4.2, and Docker with Compose and its daemon running.
Install dependencies with `pnpm install --frozen-lockfile`, then run:

```sh
pnpm dev
```

This starts PostgreSQL 17 on loopback port 55432, migrates it, explicitly seeds
synthetic authority, and launches the API (loopback port 3001) and a separate
worker from this application. No production or provider credentials are needed.
Ctrl-C stops the application processes; PostgreSQL retains its development data.
`docker compose down` stops PostgreSQL without deleting that data.

In another terminal:

```sh
pnpm demo:capability
pnpm typecheck
pnpm test:m0:ingestion-foundation
```

The demo issues a cryptographically random 15-minute ingestion credential,
keeps it in process memory, submits Batch A through `POST /v1/telemetry/batches`,
requires an accepted event disposition, verifies an exact request replay and the
durable ledger/job/active declaration, and prints only the safe response and
processing status. A pending job is expected when the worker has not yet processed it.
Every explicit bootstrap revokes earlier synthetic credentials. Entity IDs are
deterministic; bootstrap does not reactivate disabled authority.

To observe stopped-worker acceptance, start the parts separately:

```sh
pnpm db:up
export DATABASE_URL=postgres://abisso_dev:abisso_local_only@127.0.0.1:55432/abisso_dev
pnpm db:migrate
pnpm api
# Another terminal: pnpm demo:capability (acknowledges with a pending job)
# Another terminal, with DATABASE_URL set as above: pnpm worker
```

Inspect the durable processing result without exposing event bodies or credentials:

```sh
docker compose exec postgres psql -U abisso_dev -d abisso_dev -c \
  'SELECT ledger_id, status, completed_at FROM projection_jobs ORDER BY ledger_id'
```

`NODE_ENV=development pnpm dev:bootstrap` explicitly seeds authority using
`DATABASE_URL`; it never prints credentials. Synthetic issuance is absent from API
and worker entry points and rejects environments other than development/test.
For an existing disposable PostgreSQL instance, set `TEST_DATABASE_URL` before
running tests. Otherwise tests start the local Compose database. Each test uses
and removes its own isolated schema; development data is not reset.

See [the foundation profile](docs/engineering/ingestion-foundation.md) for the
implemented contract, test boundaries, and deferred work.
